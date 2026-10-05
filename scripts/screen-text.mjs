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
  return found;
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

/** Ekranda işi olmayan geliştirici dili (T13-07). */
export const JARGON = {
  'gereksinim kimliği': /\b[MTNG]\d{0,2}-\d{2}\b/,
  'kolon/tablo adı': /\b[a-z]+_[a-z]+(?:_[a-z]+)*\b/,
  'veritabanı terimi':
    /\b(?:trigger|RLS|enum|jsonb|migration|PostgREST|politikalar?|şema|sütun|sorgu)\b/,
  kriptografi: /\b(?:SHA-256|VAPID|hash|özet|JWT|CORS|Content-Range)\b/,
  'mimari terimi': /\b(?:edge fonksiyon|service worker|localStorage|idempotent|önbellek)\b/,
};

/** Kullanıcıya değil yazara hitap eden cümle (T13-03). */
export const CHATTY = /(konuşalım|isterseniz|bence|sizin kararınız|ayrıca konuş)/i;
