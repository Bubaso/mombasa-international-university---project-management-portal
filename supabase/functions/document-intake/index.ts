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
import {
  answerSchema,
  columnOf,
  modelFields,
  scopeGap,
  targetFor,
  targetsBriefing,
} from '../ai-assistant/targets.js';
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
/**
 * Alımın kapsamı: `intake_targets`'tan okunur (M13-17).
 *
 * TALİMAT ARTIK MODÜL SEVİYESİNDE BİR SABİT DEĞİL, ve olmaması gereken şey
 * tam olarak oydu: `proposeInstruction(targetsBriefing())` bir kez,
 * fonksiyon yüklenirken, koddaki tam listeden kuruluyordu. Kapsam bir
 * kayıttan geliyorsa talimat da istek başına kurulmak zorunda.
 *
 * OKUNAMAZSA KODA DÜŞMEZ. "Tablo okunamadı, ben de listeyi koddan aldım"
 * cümlesi, kapsamın koddan gelmesinin kendisidir. Okuma başarısızsa alım
 * `failed` olur ve sebebi yazılır.
 *
 * Servis anahtarıyla okunuyor: kapsam çağıranın yetkisine bağlı değil, ve
 * `intake_targets_read` politikası zaten giriş yapmış herkese açık —
 * servis anahtarı burada bir genişletme değil, çağıranın oturumundan
 * bağımsız olma.
 */
async function readScope(
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: true; keys: string[] } | { ok: false; why: string }> {
  const { data, error } = await admin
    .from('intake_targets')
    .select('key, enabled, sequence')
    .eq('enabled', true)
    .order('sequence');
  if (error) {
    return { ok: false, why: `the intake scope could not be read: ${error.message}` };
  }
  const keys = (data ?? []).map((row) => String((row as { key: unknown }).key));
  if (keys.length === 0) {
    // Boş kapsam bir hata değil bir karar olabilir — ama o karar "hiçbir şey
    // teklif etme" demek, ve onu sessizce koddaki listeye çevirmek kararı
    // yok saymak olurdu.
    return { ok: false, why: 'the intake scope is empty, so there is nothing to propose' };
  }
  return { ok: true, keys };
}

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
    // Kendini sınama da kapsamı GERÇEKTEN okur. Koddaki tam listeyle sınamak,
    // üretimin yapmadığı bir şeyi sınamak olurdu — ve ölçümün işi üretimin
    // yaptığını yapmak.
    const selfScope = await readScope(
      createClient(url, serviceKey, {
        auth: { persistSession: false },
      }),
    );
    if (!selfScope.ok) {
      return json({ selfTest: true, ok: false, error: selfScope.why }, 503);
    }
    const selfGap = scopeGap(selfScope.keys);
    const answer = await askTheModel(
      apiKey,
      proposeInstruction(targetsBriefing(selfScope.keys)),
      answerSchema(selfScope.keys),
      buildPrompt('self-test.txt', SELF_TEST_TEXT, false),
    );
    if (!answer.ok) {
      return json(
        { selfTest: true, ok: false, error: answer.why, provider: answer.upstreamMessage ?? null },
        answer.status,
      );
    }
    const read = readProposals(answer.parsed, SELF_TEST_TEXT, {
      targetFor,
      modelFields,
      inScope: (key: string) => selfScope.keys.includes(key),
    });
    return json({
      selfTest: true,
      ok: read.ok,
      model: MODEL,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      scope: selfScope.keys.length,
      // Veritabanı yazamayacağı bir hedefi kapsama almışsa bu görülmesi
      // gereken bir uyuşmazlık, sessizce atlanacak bir şey değil.
      scopeWithoutASchema: selfGap,
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

  // Kapsam, model çağrısından ÖNCE okunuyor. Okunamazsa model hiç
  // çağrılmıyor: kapsamı bilmeden sorulan bir soru, cevabı kapsam dışı
  // olabilecek bir soru, ve o cevabı sonradan atmak hem para hem zaman.
  const scope = await readScope(admin);
  if (!scope.ok) return await givingUp(scope.why);

  const answer = await askTheModel(
    apiKey,
    proposeInstruction(targetsBriefing(scope.keys)),
    answerSchema(scope.keys),
    buildPrompt(version.file_name ?? '', excerpt, truncated),
  );
  if (!answer.ok) return await givingUp(answer.why, answer.status);

  // Alıntılar okunan kesite karşı doğrulanıyor, metnin tamamına karşı değil:
  // modele gönderilmeyen bir yerden alıntı yapmış olamaz, ve kesitin dışında
  // bulunan bir alıntı doğrulanmış sayılmaz.
  const read = readProposals(answer.parsed, excerpt, {
    targetFor,
    modelFields,
    inScope: (key: string) => scope.keys.includes(key),
  });
  if (!read.ok) {
    // Reddedilen bir cevap saklanmaz. Sebebi saklanır: "model şunu dedi ama
    // kabul edilmedi" altı ay sonra sorulacak sorunun cevabıdır.
    return await givingUp(`The model's answer was not usable: ${read.why}`);
  }

  // ---------------------------------------------------------------------
  // Zaten olan bir şey yeniden teklif edilmez
  // ---------------------------------------------------------------------
  //
  // İki yerde olabilir ve ikisi de bastırılıyor:
  //
  //   **Aynı belgenin önceki okumalarında.** Bir belge yeniden okutulduğunda
  //   aynı teklifler yeniden çıkar ve liste ikiye katlanır. Ölçüldü: aynı
  //   mektup üç kez okundu, her seferinde on beş teklif.
  //
  //   **Kütüğün kendisinde.** Kayıt zaten açılmışsa — bu belgeden onaylanmış
  //   ya da başka bir yoldan girilmiş — teklif etmek, kullanıcıya yapılmış
  //   bir işi yeniden yaptırmaya çalışmaktır.
  //
  // Kütük sorgusu **çağıranın token'ıyla** yapılıyor, servis anahtarıyla
  // değil. Göremediği bir kaydı "zaten var" diye bastırmak hem o kaydın
  // varlığını ima eder hem kullanıcıyı göremediği bir şeye karşı çaresiz
  // bırakır. Göremiyorsa, onun için yoktur.
  //
  // Eşleştirme birebir: benzerlik eşiği gerçekten yeni bir kaydı sessizce
  // düşürür ve kimse öğrenmez.

  const { data: earlier } = await asCaller
    .from('intake_proposals')
    .select('register, quote, proposed_values')
    .eq('document_id', version.document_id);

  const identityOf = (register: string, values: Record<string, unknown>): string | null => {
    const target = targetFor(register);
    if (!target || target.identity.length === 0) return null;
    const parts: string[] = [];
    for (const field of target.identity) {
      const value = values[field];
      // Kimliğin bir parçası boşsa "aynı kayıt" denemez.
      if (value === undefined || value === null || String(value).trim() === '') return null;
      parts.push(String(value).trim().toLowerCase());
    }
    return [register, ...parts].join('\u0000');
  };

  /**
   * Aynı belgede aynı cümleden aynı kütüğe ikinci bir kayıt.
   *
   * Ölçüm, 3 Ekim 2026: aynı mektup yeniden okutulduğunda on sekiz teklifin
   * dokuzu alan kimliğiyle yakalandı, dokuzu geçti — model her okumada
   * başlığı biraz farklı yazıyor ve birebir eşleşme tutmuyor. Alıntı
   * değişmiyor: belgenin kendi cümlesi. Kütük artı alıntı, aynı belge için
   * alan kimliğinden sağlam bir anahtar.
   *
   * Hâlâ birebir, hâlâ açıklanabilir: benzerlik eşiği değil.
   */
  const quoteKey = (register: string, quote: string): string =>
    [register, quote.replace(/\s+/g, ' ').trim().toLowerCase()].join('\u0000');

  const seen = new Set<string>();
  const seenQuotes = new Set<string>();
  for (const row of (earlier ?? []) as {
    register: string;
    quote: string;
    proposed_values: Record<string, unknown>;
  }[]) {
    const key = identityOf(row.register, row.proposed_values ?? {});
    if (key) seen.add(key);
    if (row.quote) seenQuotes.add(quoteKey(row.register, row.quote));
  }

  /**
   * Daha önce reddedilmiş olanlar (M13-19).
   *
   * Karşılaştırmayı veritabanı yapıyor, bu fonksiyon değil: normalleştirmenin
   * tanımı `app.quote_key`'de ve ikinci bir kopyası olsaydı iki taraf aynı
   * cümleyi farklı sayabilirdi (CLAUDE.md §4). Çağrı çağıranın token'ıyla
   * gidiyor, yani göremediği bir reddi onun için red saymıyoruz — kütük
   * sorgusundaki gerekçenin aynısı.
   *
   * Bir hata hâlinde bastırma yapılmıyor ve bu kasıtlı: reddi okuyamadığımız
   * için teklifi gizlemek, kullanıcıya göremediği bir sebeple eksik bir liste
   * göstermek olurdu. Fazladan teklif görünür ve reddedilebilir; eksik teklif
   * görünmez.
   */
  const { data: rejectedIndexes, error: rejectionError } = await asCaller.rpc(
    'candidates_already_rejected',
    {
      p_document: version.document_id,
      p_candidates: read.value.proposals.map((proposal) => ({
        register: proposal.register,
        quote: proposal.quote,
      })),
    },
  );
  if (rejectionError) {
    console.error('Earlier rejections could not be read', rejectionError.message);
  }
  const previouslyRejected = new Set<number>((rejectedIndexes ?? []) as number[]);

  const keep: typeof read.value.proposals = [];
  const suppressed: { register: string; why: string }[] = [];

  for (const [index, proposal] of read.value.proposals.entries()) {
    const key = identityOf(proposal.register, proposal.values);

    if (previouslyRejected.has(index)) {
      suppressed.push({ register: proposal.register, why: 'rejected on an earlier reading' });
      continue;
    }

    if ((key && seen.has(key)) || seenQuotes.has(quoteKey(proposal.register, proposal.quote))) {
      suppressed.push({ register: proposal.register, why: 'already proposed for this document' });
      continue;
    }

    const target = targetFor(proposal.register);
    if (key && target) {
      let query = asCaller.from(target.table).select('id').limit(1);
      for (const field of target.identity) {
        const column = columnOf(field);
        const value = proposal.values[field];
        query =
          typeof value === 'string' ? query.ilike(column, value) : query.eq(column, value as never);
      }
      const { data: found } = await query;
      if (found && found.length > 0) {
        suppressed.push({ register: proposal.register, why: 'already in the register' });
        continue;
      }
    }

    if (key) seen.add(key);
    seenQuotes.add(quoteKey(proposal.register, proposal.quote));
    keep.push(proposal);
  }

  // Hangi kütükleri ilgilendirdiği artık sorulmuyor, teklif edilenlerden
  // türetiliyor. Sorulduğunda model dokuz kütük sayıyordu (ölçüm, 2 Ekim
  // 2026); somut bir teklif üretmeden bir kütüğü işaret etmenin yolu kalmadı.
  const touches = [...new Set(keep.map((proposal) => proposal.register))];

  await settle({
    state: 'ready',
    classified_as: read.value.classifiedAs,
    classification_why: read.value.why,
    about_en: read.value.aboutEn,
    touches,
    // Teklif aşamasının çalıştığı an (0050). Sıfır teklifle "bu sürüm teklif
    // üretemiyordu" ekranda ayrı iki cevap; ayrımı bir sütunun boşluğundan
    // çıkarmak tahmindi.
    proposals_at: new Date().toISOString(),
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
  if (keep.length > 0) {
    const { error: proposalError } = await admin.from('intake_proposals').insert(
      keep.map((proposal) => ({
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
        `${keep.length} record proposal(s) were found but could not be stored: ` +
        proposalError.message;
    }
  }

  return json({
    intakeId: intake.id,
    classifiedAs: read.value.classifiedAs,
    why: read.value.why,
    aboutEn: read.value.aboutEn,
    touches,
    proposals: keep.length,
    rejected: read.value.rejected,
    suppressed,
    // Bastırılanlar sessiz kalmıyor: kaçının neden üretilmediği söyleniyor,
    // yoksa "bir şey bulamadı" ile "buldu ama zaten vardı" aynı görünür.
    // Bastırılanlar sayılırken sebepleri ayrı duruyor: "zaten kayıtlı" ile
    // "sen reddetmiştin" kullanıcı için aynı cümle değil. İkincisi onun
    // kendi kararının çalıştığının kanıtı.
    note: (() => {
      const count = (why: string) => suppressed.filter((x) => x.why === why).length;
      const parts: string[] = [];
      if (count('already in the register') > 0)
        parts.push(`${count('already in the register')} already in the register`);
      if (count('already proposed for this document') > 0)
        parts.push(
          `${count('already proposed for this document')} proposed by an earlier reading of this document`,
        );
      if (count('rejected on an earlier reading') > 0)
        parts.push(`${count('rejected on an earlier reading')} rejected by you earlier`);
      return parts.length > 0
        ? `${suppressed.length} proposal(s) were not made: ${parts.join(', ')}.`
        : null;
    })(),
    error: storageFailure,
    extractedChars: extracted.text.length,
    pageCount: extracted.pages,
    truncated,
  });
});
