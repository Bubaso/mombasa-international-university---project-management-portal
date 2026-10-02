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

  let body: { versionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const versionId = body.versionId;
  if (!versionId) return json({ error: 'A version id is required.' }, 400);

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

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
  const { data: user } = await asCaller.auth.getUser();
  const requestedBy = user?.user?.id;
  if (!requestedBy) return json({ error: 'Not signed in.' }, 401);

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

  let upstream: Response;
  try {
    upstream = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CLASSIFY_INSTRUCTION }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  `Register keys you may use: ${REGISTERS.join(', ')}\n\n` +
                  `Document file name: ${version.file_name ?? 'unknown'}\n` +
                  (excerpt.length < extracted.text.length
                    ? `First ${CLASSIFY_CHARS} characters of the text follow.\n\n`
                    : 'The text follows.\n\n') +
                  excerpt,
              },
            ],
          },
        ],
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
    return await givingUp(
      `The model could not be reached: ${error instanceof Error ? error.message : 'unknown'}`,
      502,
    );
  }

  if (!upstream.ok) {
    return await givingUp(`The model refused the request (${upstream.status}).`, 502);
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
    return await givingUp('The model did not answer in the shape this asked for.');
  }

  const read = readClassification(parsed);
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
    input_tokens: payload?.usageMetadata?.promptTokenCount ?? null,
    output_tokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
  });

  return json({
    intakeId: intake.id,
    classifiedAs: read.value.classifiedAs,
    why: read.value.why,
    touches: read.value.touches,
    extractedChars: extracted.text.length,
    pageCount: extracted.pages,
    truncated: excerpt.length < extracted.text.length,
  });
});
