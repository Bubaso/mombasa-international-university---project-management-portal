/**
 * Belge alımı: bir belgeyi oku, ne olduğunu söyle (M13-13).
 *
 * Bu fonksiyon hiçbir kütüğe yazmaz. Yazdığı tek satır kendi alım kaydıdır —
 * `ai-assistant`'ın kendi kullanım kaydını yazması gibi. Tekliflerin kayda
 * dönüşmesi, onaylayan kullanıcının normal yazma yolundan geçer (M13-14).
 *
 * Üç şey `verify-document`'ten devralındı, çünkü aynı soruları cevaplıyorlar:
 *
 *   1. **Kim soruyor, çağıranın kendi token'ıyla.** Sürümü göremeyen kişi
 *      onun okunmasını isteyemez; yoksa bu fonksiyon herkese "şöyle bir
 *      belge var" cevabını verirdi.
 *   2. **Alım satırı da çağıranın token'ıyla eklenir.** Böylece 0047'nin
 *      insert politikası geçerli olur: yazma yetkisi, `requested_by`'nin
 *      çağıranın kendisi olması, ve satırın `analysing` doğması.
 *   3. **Baytlar servis anahtarıyla okunur.** Kovanın select politikası
 *      yoktur; baytlara tek yol budur.
 *
 * Sınıflandırma modelin cevabı olduğu gibi saklanmaz: `readClassification`
 * kabul edilebilir mi diye bakar ve kabul etmezse alım `failed` olur,
 * sebebiyle. Şeklen doğru görünen uydurma bir cevap, hiç cevap olmamasından
 * kötüdür.
 *
 * Yapılandırma:
 *   supabase secrets set GEMINI_API_KEY=...
 *   supabase functions deploy document-intake
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CLASSIFY_INSTRUCTION, REGISTERS, readClassification } from '../ai-assistant/rules.js';
import { extract } from './extract.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Sınıflandırma kolay bir iştir; ucuz model yeter. */
const MODEL = Deno.env.get('INTAKE_MODEL') ?? 'gemini-2.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Bu fonksiyonun okuduğu azami dosya boyu. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Modele gönderilen azami metin.
 *
 * Sınıflandırma için belgenin tamamı gerekmez — ne olduğu ilk sayfalarda
 * bellidir. Kesme noktası maliyeti sınırlıyor ve kesildiği alım kaydında
 * görünüyor, çünkü "belgenin tamamı okundu" demek, okunmadığında yanlış
 * olur.
 */
const CLASSIFY_CHARS = 12_000;

/**
 * Modele giden istek, tek yerde.
 *
 * Kendini sınama da bunu çağırıyor. Ayrı bir istek kursa, sınadığı şey
 * gerçekten gönderilen istek olmazdı — ve sınanmak istenen tam olarak o.
 *
 * Anahtar başlıkta gider, sorgu dizesinde değil: URL'ler log'a düşer ve
 * `ai-assistant` da bu yüzden başlığı kullanıyor. Yukarı akışın gövdesi
 * asla çağırana ya da veritabanına geçmez, çünkü kota ve anahtar ayrıntısı
 * yankılayabilir; sunucu kütüğüne yazılır, ki 400'ün sebebi sorulabilsin.
 */
async function askTheModel(
  apiKey: string,
  prompt: string,
): Promise<
  | { ok: true; parsed: unknown; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; why: string; status: number }
> {
  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CLASSIFY_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              classifiedAs: { type: 'string' },
              why: { type: 'string' },
              touches: { type: 'array', items: { type: 'string', enum: REGISTERS } },
            },
            required: ['classifiedAs', 'why', 'touches'],
          },
        },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      why: `The model could not be reached: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }

  if (!upstream.ok) {
    console.error('Model refused', upstream.status, (await upstream.text()).slice(0, 600));
    return { ok: false, status: 502, why: `The model refused the request (${upstream.status}).` };
  }

  const payload = (await upstream.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  } | null;

  const answerText = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(answerText);
  } catch {
    return { ok: false, status: 422, why: 'The model did not answer in the shape this asked for.' };
  }

  return {
    ok: true,
    parsed,
    inputTokens: payload?.usageMetadata?.promptTokenCount ?? null,
    outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
  };
}

/** Modele gönderilen metin: hangi kütükler var, hangi dosya, ve belgenin kendisi. */
const buildPrompt = (fileName: string, excerpt: string, truncated: boolean): string =>
  `Register keys you may use: ${REGISTERS.join(', ')}\n\n` +
  `Document file name: ${fileName || 'unknown'}\n` +
  (truncated
    ? `First ${CLASSIFY_CHARS} characters of the text follow.\n\n`
    : 'The text follows.\n\n') +
  excerpt;

/**
 * Kendini sınama metni.
 *
 * Uydurma ve kısa, ve kasıtlı olarak istekten gelmiyor: istekten gelse bu
 * uç nokta bedava bir model vekili olurdu.
 */
const SELF_TEST_TEXT =
  'IN THE ENVIRONMENT AND LAND COURT AT MOMBASA. Case No. ELC 1/2020. ' +
  'The court orders that the respondent shall file a response within 30 days.';

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'The intake function is not configured on the server.' }, 503);
  }
  if (!apiKey) {
    // Söylenecek doğru şey bu: anahtar yok, yani okuma yapılamaz. Boş bir
    // sınıflandırma kaydetmek, okunmuş gibi göstermek olurdu.
    return json({ error: 'No model key is configured, so nothing can be read.' }, 503);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  let body: { versionId?: string; selfTest?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: user } = await asCaller.auth.getUser();
  const requestedBy = user?.user?.id;
  if (!requestedBy) return json({ error: 'Not signed in.' }, 401);

  // Kendini sınama: modele ulaşılıyor mu ve cevabı istenen biçimde mi.
  //
  // Hiçbir şey yazmaz, hiçbir belgeye dokunmaz, ve metni istekten almaz.
  // Var olma sebebi ölçüm: bu fonksiyonun model çağrısı yerelde
  // çalıştırılamıyor (anahtar sunucuda) ve dokümanda şemanın dizi
  // elemanındaki `enum`'u desteklediği açıkça yazmıyor. Onsuz, ilk gerçek
  // yükleme aynı zamanda ilk deneme olurdu — ve başarısızlığı kullanıcı
  // keşfederdi.
  if (body.selfTest) {
    const answer = await askTheModel(apiKey, buildPrompt('self-test.txt', SELF_TEST_TEXT, false));
    if (!answer.ok) return json({ selfTest: true, ok: false, error: answer.why }, answer.status);
    const read = readClassification(answer.parsed);
    return json({
      selfTest: true,
      ok: read.ok,
      model: MODEL,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      ...(read.ok
        ? {
            classifiedAs: read.value.classifiedAs,
            why: read.value.why,
            touches: read.value.touches,
          }
        : { refusedBecause: read.why }),
    });
  }

  const versionId = body.versionId;
  if (!versionId) return json({ error: 'A version id is required.' }, 400);

  // Görebiliyor mu. Göremiyorsa cevabı "yok", çünkü "var ama senin değil"
  // de bir bilgidir.
  const { data: version } = await asCaller
    .from('document_versions')
    .select('id, document_id, storage_path, file_name, content_type, byte_size')
    .eq('id', versionId)
    .maybeSingle();

  if (!version) return json({ error: 'No such version, or it is not yours to see.' }, 404);

  if (version.byte_size && version.byte_size > MAX_BYTES) {
    return json(
      { error: `This file is larger than the ${MAX_BYTES / 1024 / 1024} MB this function reads.` },
      413,
    );
  }

  // Alım satırı çağıranın token'ıyla açılır, ki 0047'nin insert politikası
  // uygulansın: yazma yetkisi yoksa burada reddedilir, ve satır `analysing`
  // doğar — bitmiş bir alımı istemci iddia edemez.
  const { data: intake, error: intakeError } = await asCaller
    .from('document_intake')
    .insert({
      document_version_id: version.id,
      document_id: version.document_id,
      requested_by: requestedBy,
    })
    .select('id')
    .single();

  if (intakeError || !intake) {
    return json(
      { error: intakeError?.message ?? 'The intake could not be started.' },
      intakeError?.code === '42501' ? 403 : 400,
    );
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  /** Alımı bitir: ya bir kanaatle ya bir sebeple. İkisi de bir cevaptır. */
  const settle = async (patch: Record<string, unknown>) => {
    await admin
      .from('document_intake')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', intake.id);
  };
  const givingUp = async (why: string, status = 422) => {
    await settle({ state: 'failed', failure_reason: why });
    return json({ intakeId: intake.id, error: why }, status);
  };

  const { data: file, error: downloadError } = await admin.storage
    .from('documents')
    .download(version.storage_path);

  if (downloadError || !file) {
    return await givingUp('The file for this version is not in storage. Upload it again.', 409);
  }

  let extracted: { text: string; pages: number | null };
  try {
    extracted = await extract(
      new Uint8Array(await file.arrayBuffer()),
      version.file_name ?? '',
      version.content_type ?? '',
    );
  } catch (error) {
    return await givingUp(error instanceof Error ? error.message : 'The file could not be read.');
  }

  if (extracted.text.length < 40) {
    // Taranmış bir PDF buraya düşer. "Boş belge" demek yanlış olurdu —
    // belgede metin var, bu fonksiyon onu çıkaramıyor, ve ikisi farklı.
    return await givingUp(
      'No text could be extracted. If this is a scanned document, it needs reading as images, ' +
        'which this function does not yet do.',
    );
  }

  const excerpt = extracted.text.slice(0, CLASSIFY_CHARS);
  const truncated = excerpt.length < extracted.text.length;

  const answer = await askTheModel(
    apiKey,
    buildPrompt(version.file_name ?? '', excerpt, truncated),
  );
  if (!answer.ok) return await givingUp(answer.why, answer.status);

  const read = readClassification(answer.parsed);
  if (!read.ok) {
    // Reddedilen bir cevap saklanmaz. Sebebi saklanır: "model şunu dedi ama
    // kabul edilmedi" altı ay sonra sorulacak sorunun cevabıdır.
    return await givingUp(`The model's answer was not usable: ${read.why}`);
  }

  await settle({
    state: 'ready',
    classified_as: read.value.classifiedAs,
    classification_why: read.value.why,
    touches: read.value.touches,
    extracted_chars: extracted.text.length,
    page_count: extracted.pages,
    model: MODEL,
    input_tokens: answer.inputTokens,
    output_tokens: answer.outputTokens,
  });

  return json({
    intakeId: intake.id,
    classifiedAs: read.value.classifiedAs,
    why: read.value.why,
    touches: read.value.touches,
    extractedChars: extracted.text.length,
    pageCount: extracted.pages,
    truncated,
  });
});
