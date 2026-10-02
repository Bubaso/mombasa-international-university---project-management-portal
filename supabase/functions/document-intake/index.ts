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
import { proposeInstruction, readProposals } from '../ai-assistant/rules.js';
import { answerSchema, modelFields, targetFor, targetsBriefing } from '../ai-assistant/targets.js';
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
 * 12.000 idi, sınıflandırma için. Teklif için az: bir mahkeme kararının
 * hükmü sonda durur ve 12.000 karakter onu kesiyordu — yani belgenin
 * yükümlülük üreten kısmı hiç okunmadan "bu bir karardır" deniyordu.
 * 30.000 karakter yaklaşık 7.500 belirteç, belge başına ~$0,0025: kesmenin
 * tasarrufu, kesilen hükmün bedelini karşılamıyor.
 *
 * Kesildiğinde bu görünür kalıyor — `extracted_chars` metnin tamamını
 * sayıyor ve ekran ne kadarının okunduğunu yazıyor. "Belgenin tamamı
 * okundu" demek, okunmadığında yanlış olur.
 */
const READ_CHARS = 30_000;

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
  instruction: string,
  schema: unknown,
  prompt: string,
): Promise<
  | { ok: true; parsed: unknown; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; why: string; status: number; upstreamMessage?: string }
> {
  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
          // Üst sınır, kaçak bir cevabı ucuz kesmek için. Ölçüldü: şema
          // kötüyken model 295.442 karakter üretip durdu, ve o da ödenir.
          maxOutputTokens: 8192,
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
    const body = await upstream.text();
    console.error('Model refused', upstream.status, body.slice(0, 900));
    // Sağlayıcının kendi cümlesi ayrı tutuluyor. Gerçek yolda kullanılmıyor
    // — ne çağırana gider ne kayda yazılır, çünkü kota ve anahtar ayrıntısı
    // yankılayabilir. Yalnızca kendini sınama onu döndürüyor: o uç noktanın
    // tek işi teşhis ve çağıranı zaten kasaya yazabilen, oturum açmış biri.
    let upstreamMessage: string | undefined;
    try {
      upstreamMessage = (JSON.parse(body) as { error?: { message?: string } })?.error?.message;
    } catch {
      upstreamMessage = undefined;
    }
    return {
      ok: false,
      status: 502,
      why: `The model refused the request (${upstream.status}).`,
      upstreamMessage,
    };
  }

  const payload = (await upstream.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  } | null;

  const answerText = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(answerText);
  } catch {
    // Neden ayrıştırılamadığı, ayrıştırılamadığından daha çok şey söyler:
    // kesilmiş bir cevapla hiç gelmemiş bir cevap aynı değildir.
    const finish = payload?.candidates?.[0]?.finishReason ?? 'none';
    const thoughts = payload?.usageMetadata?.thoughtsTokenCount ?? 0;
    console.error('Unparseable answer', finish, answerText.slice(0, 400));
    return {
      ok: false,
      status: 422,
      why: 'The model did not answer in the shape this asked for.',
      upstreamMessage: `finishReason=${finish} answerChars=${answerText.length} thoughtTokens=${thoughts}`,
    };
  }

  return {
    ok: true,
    parsed,
    inputTokens: payload?.usageMetadata?.promptTokenCount ?? null,
    outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
  };
}

/** Modele gönderilen metin: hangi dosya, ve belgenin kendisi. */
const buildPrompt = (fileName: string, excerpt: string, truncated: boolean): string =>
  `Document file name: ${fileName || 'unknown'}\n` +
  (truncated
    ? `The first ${READ_CHARS} characters of the text follow; the document is longer.\n\n`
    : 'The text follows in full.\n\n') +
  excerpt;

/** Talimat her çağrıda aynı; hedef tanımlarından üretiliyor. */
const INSTRUCTION = proposeInstruction(targetsBriefing());

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
    const answer = await askTheModel(
      apiKey,
      INSTRUCTION,
      answerSchema(),
      buildPrompt('self-test.txt', SELF_TEST_TEXT, false),
    );
    if (!answer.ok) {
      return json(
        { selfTest: true, ok: false, error: answer.why, provider: answer.upstreamMessage ?? null },
        answer.status,
      );
    }
    const read = readProposals(answer.parsed, SELF_TEST_TEXT, { targetFor, modelFields });
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
            aboutEn: read.value.aboutEn,
            proposals: read.value.proposals,
            rejected: read.value.rejected,
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

  const excerpt = extracted.text.slice(0, READ_CHARS);
  const truncated = excerpt.length < extracted.text.length;

  const answer = await askTheModel(
    apiKey,
    INSTRUCTION,
    answerSchema(),
    buildPrompt(version.file_name ?? '', excerpt, truncated),
  );
  if (!answer.ok) return await givingUp(answer.why, answer.status);

  // Alıntılar okunan kesite karşı doğrulanıyor, metnin tamamına karşı değil:
  // modele gönderilmeyen bir yerden alıntı yapmış olamaz, ve kesitin dışında
  // bulunan bir alıntı doğrulanmış sayılmaz.
  const read = readProposals(answer.parsed, excerpt, { targetFor, modelFields });
  if (!read.ok) {
    // Reddedilen bir cevap saklanmaz. Sebebi saklanır: "model şunu dedi ama
    // kabul edilmedi" altı ay sonra sorulacak sorunun cevabıdır.
    return await givingUp(`The model's answer was not usable: ${read.why}`);
  }

  // Hangi kütükleri ilgilendirdiği artık sorulmuyor, teklif edilenlerden
  // türetiliyor. Sorulduğunda model dokuz kütük sayıyordu (ölçüm, 2 Ekim
  // 2026); somut bir teklif üretmeden bir kütüğü işaret etmenin yolu kalmadı.
  const touches = [...new Set(read.value.proposals.map((proposal) => proposal.register))];

  await settle({
    state: 'ready',
    classified_as: read.value.classifiedAs,
    classification_why: read.value.why,
    about_en: read.value.aboutEn,
    touches,
    extracted_chars: extracted.text.length,
    page_count: extracted.pages,
    model: MODEL,
    input_tokens: answer.inputTokens,
    output_tokens: answer.outputTokens,
  });

  // Teklifleri servis anahtarı yazıyor: 0048'de `authenticated`'ın insert
  // yetkisi yok, çünkü teklifin modelden geldiği satırın nasıl oluştuğuyla
  // belli olmalı. Onayı veren ve kaydı açan taraf kullanıcıdır.
  let storageFailure: string | null = null;
  if (read.value.proposals.length > 0) {
    const { error: proposalError } = await admin.from('intake_proposals').insert(
      read.value.proposals.map((proposal) => ({
        intake_id: intake.id,
        document_id: version.document_id,
        register: proposal.register,
        why: proposal.why,
        quote: proposal.quote,
        // Buraya gelen her teklifin alıntısı zaten metinde bulundu —
        // bulunmayanı `readProposals` düşürdü. Sütun, sonradan gevşetilmesi
        // hâlinde denetlenebilsin diye açıkça yazılıyor.
        quote_found: true,
        proposed_values: proposal.values,
      })),
    );
    if (proposalError) {
      console.error('Proposals could not be stored', proposalError.message);
      // Sessiz kalmak, teklif çıkmamış gibi görünmek demek — ve "baktım, bir
      // şey yok" ile "buldum, saklayamadım" farklı şeyler. Alım `ready`
      // kaldığı için satıra sebep yazılamıyor (kısıt gereği), o yüzden
      // cevapta söyleniyor ve ekran onu olduğu gibi gösteriyor.
      storageFailure =
        `${read.value.proposals.length} record proposal(s) were found but could not be stored: ` +
        proposalError.message;
    }
  }

  return json({
    intakeId: intake.id,
    classifiedAs: read.value.classifiedAs,
    why: read.value.why,
    aboutEn: read.value.aboutEn,
    touches,
    proposals: read.value.proposals.length,
    rejected: read.value.rejected,
    error: storageFailure,
    extractedChars: extracted.text.length,
    pageCount: extracted.pages,
    truncated,
  });
});
