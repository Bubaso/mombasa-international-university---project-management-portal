/**
 * Ekranda görünen metni kaynaktan çıkarır ve rolüne göre sınıflandırır.
 *
 * Neden var olduğu bir ölçümdür, 5 Ekim 2026: uygulamanın "yapım aşamasında"
 * göründüğü söylendi ve sebebini aradım. Elle bakarak üç kez yanlış cevap
 * verdim — önce açıklamaların başlıkların *içinde* olduğunu sandım (değildi,
 * altındaydı), sonra 414 satırlık bir ekran için "0 metin" dedim (deseni
 * eksikti), sonra bir `<Explain>` gövdesini başlık saydım. Ekran metni gözle
 * sayılamıyor; sayılabilir hâle getiren şey bu dosya.
 *
 * Ayrıştırıcının iki yanlış yapma yolu var ve ikisi eşit değil:
 *
 *   **Eksik tarama.** Bir metni görmemek. Toplam küçük çıkar, tavan gevşek
 *   olur, ama kimseyi yanlış yere göndermez. Yine de zararsız değildi: ilk
 *   sürüm `language === 'tr'` kalıbını tanımıyordu ve 10.613 karakteri
 *   kaçırdı — yani %16'sını. Bu yüzden iki kalıp da burada, ve yeni bir kalıp
 *   çıkarsa testin tavanı düşer, sessizce geçmez.
 *
 *   **Uydurma tarama.** Kod yorumunu ya da sınıf adını ekran metni saymak.
 *   Olmayan bir sorunu kovalatır. Bu yüzden `strip()` yorumları metinden önce
 *   siliyor ve sayılan şey yalnızca iki dilli bir ifadenin iki yanı.
 *
 * Rol sınıflandırması da aynı ihtiyatla kurulu: metni saran en yakın AÇIK
 * etiket ne ise o. Etiketlerin beyaz listesi YOK — ilk sürümde vardı ve
 * `<p className=…>` listede olmadığı için 48 paragrafı bir üstteki `<h2>`'ye
 * yazdı. Aradığını bulamayan bir ölçüm susmak yerine yanlış cevap verdi.
 */

/** Kod yorumlarını boşlukla değiştirir; satır numaraları korunur. */
export function strip(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i + 2);
      const end = j === -1 ? src.length : j + 2;
      out.push(src.slice(i, end).replace(/[^\n]/g, ' '));
      i = end;
    } else if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i);
      const end = j === -1 ? src.length : j;
      out.push(' '.repeat(end - i));
      i = end;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      // Dizgiler olduğu gibi kalır: aradığımız şey onların içinde.
      const q = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === q) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(src.slice(i, j));
      i = j;
    } else {
      out.push(src[i]);
      i += 1;
    }
  }
  return out.join('');
}

/**
 * İki dilli bir ifadenin iki yanı: `tr ? 'TR' : 'EN'`.
 *
 * İkinci kalıp (`language === 'tr' ? …`) en eski iki ekranda yaşıyor ve
 * T13-06 onu tekilleştirecek. O gün gelene kadar ikisi de sayılıyor; yoksa
 * ölçüm, düzeltilmesi gereken yerde kör kalır.
 */
const PAIR = new RegExp(
  String.raw`(?:\btr|language\s*===\s*'tr')\s*\?\s*` +
    String.raw`(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3`,
  'gs',
);

/** Tek satıra indir: ölçtüğümüz şey uzunluk, girinti değil. */
const flat = (s) => s.replace(/\\n/g, ' ').replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Veri dizisi içindeki iki dilli alan: `titleEn: '...'`, `detailTr: '...'`.
 *
 * Bu desen 5 Ekim 2026'da eklendi ve sebebi bir kaçırma: `LegalAffairsView`
 * 30 yıllık kronolojiyi JSX içinde bir dizi olarak tutuyordu ve ölçüm onun
 * **hiçbirini** görmüyordu — 54 metin, 3.273 karakter, yani o ekranın
 * gerçek metninin üçte biri. `/legal` için "6.288 karakter" dedim, doğrusu
 * 9.561'di. Koşullu ifade arayan bir desen, veri olarak duran metni
 * göremiyor; ikisi ayrı yazım biçimi, aynı ekran metni.
 */
const FIELD = /\b(\w+?)(En|Tr):\s*\n?\s*(['"])((?:\\.|(?!\3).)*)\3/gs;

/** @returns {{line: number, tr: string, en: string, len: number}[]} */
export function stringsIn(source) {
  const src = strip(source);
  const found = [];
  for (const m of src.matchAll(PAIR)) {
    const tr = flat(m[2]);
    const en = flat(m[4]);
    if (!tr && !en) continue;
    const line = src.slice(0, m.index).split('\n').length;
    found.push({ line, tr, en, len: tr.length });
  }

  // Veri dizisi alanları: `titleEn`/`titleTr` gibi çiftler tek metin sayılır,
  // koşullu ifadedeki iki yan nasıl tek sayılıyorsa. Eşi olmayan bir alan da
  // sayılır — tek dilli bir metin de ekranda duruyor.
  const fields = new Map();
  for (const m of src.matchAll(FIELD)) {
    const [, base, side, , value] = m;
    const line = src.slice(0, m.index).split('\n').length;
    const key = `${base}:${Math.floor(line / 8)}`;
    const entry = fields.get(key) ?? { line, tr: '', en: '' };
    entry[side === 'Tr' ? 'tr' : 'en'] = flat(value);
    entry.line = Math.min(entry.line, line);
    fields.set(key, entry);
  }
  for (const e of fields.values()) {
    if (!e.tr && !e.en) continue;
    // Türkçesi yoksa ekranda İngilizcesi duruyor, ve ölçülen şey ekrandaki.
    found.push({ line: e.line, tr: e.tr || e.en, en: e.en || e.tr, len: (e.tr || e.en).length });
  }

  return found.sort((a, b) => a.line - b.line);
}

// Bir prop değerinin içindeki metin, o prop'un adını taşır. Etiketten önce
// bakılıyor: `description={tr ? … }` içindeki metnin rolü `<EmptyState>`
// değil, `description`.
const PROP = /\b(description|title|label|placeholder|aria-label|summary|hint)=\s*\{?$/;
const OPEN = /<([A-Za-z][A-Za-z0-9]*)\b(?![^>]*\/>)/g;

/** Metni saran en yakın prop ya da açık etiket. */
export function roleOf(lines, line) {
  const i = line - 1;
  for (const j of [i, i - 1]) {
    if (j < 0) continue;
    const m = PROP.exec(lines[j].trimEnd());
    if (m) return `prop:${m[1]}`;
  }
  for (let j = i; j > Math.max(-1, i - 14); j -= 1) {
    const tags = [...lines[j].matchAll(OPEN)];
    if (tags.length) return `<${tags[tags.length - 1][1]}>`;
  }
  return 'bilinmiyor';
}

/**
 * Başlık + hemen altındaki tanıtım paragrafı (T13-01'in hedefi).
 *
 * Yapıya bakıyor, sınıf adına değil: `text-xs text-slate-500` yarın
 * değişebilir ve ölçüm onunla körleşmemeli.
 */
export function introsIn(source, strings) {
  const lines = strip(source).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const close = /<\/h([123])>/.exec(lines[i]);
    if (!close) continue;
    let heading = '';
    for (let j = i; j > Math.max(-1, i - 4) && !heading; j -= 1) {
      heading = strings.find((s) => s.line === j + 1)?.tr ?? '';
    }
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      if (!/<p[\s>]/.test(lines[j])) continue;
      const body = strings.find((s) => s.line > j && s.line <= j + 5 && s.len >= 60);
      if (body) {
        out.push({
          line: body.line,
          level: Number(close[1]),
          heading,
          body: body.tr,
          len: body.len,
        });
      }
      break;
    }
  }
  return out;
}

/**
 * `<EmptyState>`'in `description`'ları (T13-08).
 *
 * Ayrı ölçülüyorlar çünkü ayrı bir kusurdu: bir kaydın olmaması bir hata
 * değil, ve ekran bunu bir paragrafla açıklamaya kalkınca uygulama "henüz
 * bitmemiş" gibi okunuyor. Doğru boş durum ne girileceğini söyleyen tek bir
 * cümledir.
 *
 * Prop'un kendisinden gidiyor, `stringsIn`'in genel havuzundan değil: aynı
 * dosyadaki bir başlık ya da yardım metni de 60+ karakter olabilir ve
 * karışırsa ölçüm boş durumun gerilediğini göremez.
 */
export function emptyStatesIn(source) {
  // `[\s>]` değil `(?![A-Za-z])`: prettier çok prop'lu elemanı sarıyor ve
  // `<EmptyState` satırın SONUNDA kalıyor, yani ardından eşleşecek bir karakter
  // yok. İlk yazımda `[\s>]` vardı ve ölçüm 34 kullanımın hepsini kaçırıp "0
  // açıklama" dedi — tavanı kendiliğinden geçirecekti. Fixture yakaladı.
  const OPEN = /<EmptyState(?![A-Za-z])/;
  const lines = strip(source).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!OPEN.test(lines[i])) continue;
    // `description` prop'una kadar oku; sonraki `<EmptyState`'te dur, yoksa
    // bir sonrakinin açıklaması bu kullanımınmış gibi sayılır.
    const block = [];
    for (let j = i; j < Math.min(lines.length, i + 24); j += 1) {
      if (j > i && OPEN.test(lines[j])) break;
      block.push(lines[j]);
    }
    const body = block.join('\n');
    const at = body.indexOf('description=');
    if (at === -1) continue;
    const first = stringsIn(body.slice(at))[0];
    // Uzunluk İKİ dilin uzun olanı. Tek dili ölçmek T13-07'de sızıntıyı
    // gizledi: Türkçe düzeltildi, İngilizce kolon adı taşımaya devam etti.
    if (first)
      out.push({
        line: i + 1,
        tr: first.tr,
        en: first.en,
        len: Math.max(first.tr.length, first.en.length),
      });
  }
  return out;
}

/**
 * Ekranda işi olmayan geliştirici dili (T13-07).
 *
 * Sınır `\b` ile yazılamıyor ve bunu ölçerken öğrendim: JavaScript'in `\b`'si
 * ASCII kelime karakterine dayanır, `ö` ASCII değildir, yani `/\bözet/`
 * `'özet'` dizgisinde bile eşleşmiyor. Türkçe harfle BAŞLAYAN her desen
 * (`özet`, `şema`, `önbellek`) sessizce ölüydü ve ölçüm "jargon yok" diyordu;
 * `sütun` çalışıyordu, çünkü `s` ASCII. Yarısı ölü bir desen listesi, liste
 * olmamasından kötüdür: cevap verdiğini sanırsın.
 *
 * `özet` ve `hash` listeden çıktı, çünkü yanlış işaretler. `özet` Türkçede
 * "summary" demek ve uygulamada 14 yerde o anlamda geçiyor — "Haftalık özet",
 * "Dava Özeti", "Okuma (özet)". Jargon olan şey `SHA-256`; kelimenin kendisi
 * doğru Türkçe. `sorgu` da çıktı: "üç ayrı sorgu" cümlesi kullanıcıya bir şey
 * anlatıyor, kolon adı gibi sızmış bir terim değil.
 *
 * Liste üç kez kırpıldı ve kalıp artık belli: **alan kelimesini jargon sayan
 * bir desen, yakaladığından fazlasına mal oluyor.** Çıkanlar ve sebepleri —
 *
 *   `özet` Türkçede "summary"; uygulamada 14 yerde o anlamda.
 *   `sorgu` kullanıcıya bir şey anlatıyor ("üç ayrı sorgu").
 *   `sütun` savunmanın dayanağı ("savunma sütunları"); 3 isabet, 3 yanlış.
 *   `trigger` **risk tetikleyicisi** — M6-03'ün kendi kelimesi.
 *   `migration` **Notion göçü** — projenin gerçek bir olayı, dosya değil.
 *   `tablosu` **hesap tablosu** — spreadsheet.
 *   `politika`, `şema` Türkçede gündelik anlamları var.
 *   `önbellek` kullanıcının gördüğü bir durum, geliştirici terimi değil.
 *
 * Kalanlar başka anlamı olmayan biçimler: gereksinim kimliği, snake_case ve
 * ENV_VAR adları, `RLS`/`jsonb`/`PostgREST`, kriptografi adları, ve mimari
 * terimleri. İkisinin meşru kullanımı `JARGON_ALLOWED`'da gerekçesiyle.
 *
 * `sütun` da aynı sebeple çıktı ve ölçüldü: üç isabet verdi, üçü de "savunma
 * sütunları" — savunmanın dayanakları, veritabanı kolonu değil. Sıfır gerçek
 * isabet, üç yanlış. Yerine `tablosu`/`tablosunda` girdi, çünkü ekrana sızan
 * şey terimin kendisi değil cümlesiydi: "profiles **tablosunda** bu id ile bir
 * satır yok" diyen bir hata mesajı, kilitlenen kullanıcıya tablo kontrol
 * ettiriyor.
 */
/**
 * Sıkı sınır: iki yanı da kelime dışı. Kimlik ve kolon adı için — `M13-09`
 * ve `is_active` ek almaz.
 */
const B = (body) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'u');

/**
 * Gövde sınırı: başı sıkı, sonu serbest. Türkçe eklemeli bir dil ve ekran
 * metni çekimli hâli kullanıyor — "veritabanı **şeması**", "**sütunu**",
 * "**politikaları**". Sonda sıkı sınırla yazılmış `şema` deseni, gerçek
 * metnin hiçbirini yakalamıyordu; ölçüm yine "jargon yok" diyordu.
 *
 * Başın sıkı kalması gerekiyor: serbest olsa `şema` bir başka kelimenin
 * ortasında da eşleşir ve desen var olmayan bir sorun üretir.
 *
 * Gövdenin kendisi de değişebiliyor: `önbellek` → `önbelleğe`, yani ünsüz
 * yumuşaması son harfi değiştiriyor. Bu yüzden gövde `önbelle` — kelimenin
 * çekilmeyen kısmı. Türkçe bir deseni sözlük biçiminde yazmak, onu çalışmaz
 * hâlde yazmaktır.
 */
const STEM = (body) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})`, 'u');

export const JARGON = {
  'gereksinim kimliği': B(String.raw`[MTNG]\d{0,2}-\d{2}`),
  'kolon/ortam adı': B(String.raw`[a-z]+_[a-z]+(?:_[a-z]+)*|[A-Z][A-Z0-9]*_[A-Z0-9_]+`),
  'veritabanı terimi': STEM('RLS|jsonb|PostgREST|PostgreSQL'),
  kriptografi: STEM('SHA-256|VAPID|JWT|CORS|Content-Range'),
  'mimari terimi': STEM('edge fonksiyon|service worker|localStorage|idempotent'),
};

/**
 * Deseni tetikleyen ama jargon OLMAYAN yerler, gerekçesiyle.
 *
 * Liste olmadan bu kararlar her turda yeniden verilir ve bir seferinde yanlış
 * verilir. İkisi de ölçülerek buraya geldi.
 */
export const JARGON_ALLOWED = [
  {
    where: 'src/components/stakeholders/ContactsExchange.tsx',
    what: 'full_name, preferred_language, interest_topic …',
    why:
      'CSV başlıklarının kendisi. Kullanıcı dosyasına bunları **birebir** ' +
      'yazmak zorunda, yani ekranda görünmesi dosya biçiminin sözleşmesi — ' +
      'sızmış bir kolon adı değil. Gizlemek, içe aktarmayı çalışmaz kılar.',
  },
  {
    where: 'src/components/SignInPage.tsx',
    what: 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, .env.local',
    why:
      'Arka ucu yapılandırılmamış bir derlemenin giriş ekranı. Bu metni ' +
      'YALNIZCA o derlemeyi çalıştıran kişi görüyor — yani değişkenleri ' +
      'ayarlayabilecek olan kişi. Canlıda hiç görünmüyor. Adları ' +
      'gizlemek, cevabı bilen tek okuyucudan cevabı almak olurdu.',
  },
  {
    where: 'src/views/DocumentVaultView.tsx',
    what: 'SHA-256',
    why:
      '"Doğrulandı" iddiasının ne demek olduğu. Faz 0 bu ekrandan YANLIŞ bir ' +
      '"SHA-256 doğrulandı" rozetini kaldırmıştı; bu cümle doğru olanı ve ' +
      'algoritmayı adıyla söylemek denetçi için iddiayı denetlenebilir yapıyor.',
  },
];

/** Kullanıcıya değil yazara hitap eden cümle (T13-03). */
export const CHATTY = /(konuşalım|isterseniz|bence|sizin kararınız|ayrıca konuş)/i;
