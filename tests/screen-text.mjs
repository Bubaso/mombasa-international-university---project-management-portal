/**
 * Ekran metninin hacmi ölçülü kalsın (T13-09).
 *
 * Ölçüm, 5 Ekim 2026: uygulama "yapım aşamasında gibi" göründü ve sebep
 * metnin hacmiydi — 2097 iki dilli metin, 66.523 TR karakteri, ve bunun
 * 37.034'ü yalnızca 262 uzun metinde. Asıl yük başlık altındaki tanıtım
 * paragrafları: 54 tanesi, 8.489 karakter.
 *
 * Bu dosya kesmiyor; kesilmiş olanın geri büyümemesini sağlıyor. Tavanlar
 * ÖLÇÜLEN değerler ve yalnızca aşağı iner: her dalga kendi kazancını buraya
 * yazar. Tavanı kesimden sonra yazmak, kendi sonucuna bakıp hedefi ona
 * uydurmak olurdu — bu yüzden ilk tavan kesimden önce yazıldı (T13-09, Faz 1)
 * ve T13-01'in her dalgası onu düşürüyor.
 *
 * Neden karakter sayıyor da satır ya da kelime değil: satır sayısı sarmaya
 * bağlı, kelime sayısı Türkçede eklerle oynuyor. Karakter, prettier'ın
 * paragrafı nasıl sardığından bağımsız tek ölçü.
 *
 * İki sıfır iddiası var ve ikisi tavan değil, kural:
 *
 *   **Sohbet cümlesi.** `IcsExport` paneli "İsterseniz onu ayrıca konuşalım"
 *   diye bitiyordu — kullanıcıya değil, yazara hitap eden bir cümle. Bir
 *   tane vardı ve bir daha olmamalı; tavan değil sıfır.
 *
 *   **Kurumun adı.** Dört yerde yazılıydı, üç biçimde, biri hiç iki dilli
 *   değildi. Artık `src/lib/org.ts`'te tek yerde; başka hiçbir dosyada
 *   geçmiyor. "Mombasa" kelimesinin kendisi serbest — şehir ve mahkeme adı
 *   olarak meşru geçiyor ("ELC Mombasa", "Mombasa merkezli"); yasak olan
 *   üniversitenin ADININ ikinci bir kopyası.
 */
import { readFileSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringsIn, introsIn, JARGON, CHATTY } from '../scripts/screen-text.mjs';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// ---------------------------------------------------------------------------
// Ölçülen tavanlar — 5 Ekim 2026, Faz 1 sonrası
// ---------------------------------------------------------------------------
//
// Bir dalga bunları düşürdüğünde burayı da düşürür. Düşmesi iş, artması
// geri alma; ikisi de görünür olsun diye sayı burada duruyor.
const CEILING = {
  textChars: 62328,
  longChars: 31390,
  // Panel gerekçesi: T13-01'in kestiği şey. 8489 → 2753 (Faz 2).
  introChars: 2753,
  longestIntro: 98,
  // T13-01'in kriteri bir tavan değil kural: hiçbir panel gerekçesi 100
  // karakteri aşmasın. Ölçülen en uzun 98 ve tavan ayrıca 98 — ikisi bir
  // arada, çünkü biri geri büyümeyi, öteki kuralın kendisini tutuyor.
  introRule: 100,

  // LegalAffairsView ayrı sayılıyor ve sebebi ölçüm değil, türü: bu
  // paragraflar panel gerekçesi DEĞİL, davanın kendi içeriği — pozisyon
  // metinleri, Yargıtay içtihat başlıkları, mahkeme kayıt notu. Dedektör
  // onları başlık altında oldukları için yakalıyor; kesilecek şey değiller.
  //
  // Tek sayıda toplanırsa iki şey birden bozulur: T13-01'in kazancı
  // davanın içeriğiyle seyrelir, ve "en uzun gerekçe" tavanı bir gerekçe
  // değil bir dava pozisyonu tarafından belirlenir. T13-04 o ekranın kendi
  // turu ve oradaki soru farklı: içerik koda gömülü, kısaltılacak değil
  // veritabanına taşınacak.
  legalIntroChars: 856,
  longestLegalIntro: 263,
};

/** Davanın içeriği, panel gerekçesi değil (T13-04). */
const LEGAL_CONTENT = 'src/views/LegalAffairsView.tsx';

/** Kurumun adının ikinci kopyası (T13-05). `org.ts` tek kaynak. */
const UNIVERSITY_NAME =
  /Mombasa\s+(?:Uluslararası|International|Int\.)\s*(?:Üniv|University|Universit)/i;

/** Jargon, kategorisi başına ölçülen tavan (T13-07). */
const JARGON_CEILING = {
  'gereksinim kimliği': 3,
  'kolon/tablo adı': 2,
  'veritabanı terimi': 2,
  kriptografi: 1,
  'mimari terimi': 2,
};

const files = globSync('src/**/*.{ts,tsx}').sort();
check(files.length > 100, 'ekran kaynakları bulundu', `${files.length} dosya`);

let textChars = 0;
let longChars = 0;
let introChars = 0;
let longestIntro = 0;
let longestIntroAt = '';
let legalIntroChars = 0;
let longestLegalIntro = 0;
const overRule = [];
const chatty = [];
const nameCopies = [];
const jargon = {};

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const strings = stringsIn(source);
  textChars += strings.reduce((a, r) => a + r.len, 0);
  longChars += strings.filter((r) => r.len >= 80).reduce((a, r) => a + r.len, 0);

  for (const intro of introsIn(source, strings)) {
    if (file === LEGAL_CONTENT) {
      legalIntroChars += intro.len;
      longestLegalIntro = Math.max(longestLegalIntro, intro.len);
      continue;
    }
    introChars += intro.len;
    if (intro.len > CEILING.introRule) overRule.push(`${file}:${intro.line} (${intro.len})`);
    if (intro.len > longestIntro) {
      longestIntro = intro.len;
      longestIntroAt = `${file}:${intro.line}`;
    }
  }

  for (const row of strings) {
    if (CHATTY.test(row.tr)) chatty.push(`${file}:${row.line}`);
    if (file !== 'src/lib/org.ts' && UNIVERSITY_NAME.test(row.tr)) {
      nameCopies.push(`${file}:${row.line}`);
    }
    for (const [kind, pattern] of Object.entries(JARGON)) {
      if (pattern.test(row.tr)) jargon[kind] = (jargon[kind] ?? 0) + 1;
    }
  }
}

// Ölçüm aletinin kendisi: sıfır dönerse testin tamamı sessizce geçer.
check(textChars > 10000, 'ölçüm metin görüyor', `${textChars} karakter`);

check(
  textChars <= CEILING.textChars,
  'ekran metni kayıtlı tavanın altında',
  `${textChars} / ${CEILING.textChars}`,
);
check(
  longChars <= CEILING.longChars,
  '80+ karakterlik metnin hacmi kayıtlı tavanın altında',
  `${longChars} / ${CEILING.longChars}`,
);
check(
  introChars <= CEILING.introChars,
  'başlık altı tanıtım paragraflarının hacmi kayıtlı tavanın altında',
  `${introChars} / ${CEILING.introChars}`,
);
check(
  longestIntro <= CEILING.longestIntro,
  'en uzun tanıtım paragrafı kayıtlı tavanın altında',
  `${longestIntro} / ${CEILING.longestIntro}${longestIntro > CEILING.longestIntro ? `  ${longestIntroAt}` : ''}`,
);

check(
  overRule.length === 0,
  `hiçbir panel gerekçesi ${CEILING.introRule} karakteri aşmıyor`,
  overRule.join(', '),
);
check(
  legalIntroChars <= CEILING.legalIntroChars,
  'LegalAffairsView içeriğinin hacmi kayıtlı tavanın altında',
  `${legalIntroChars} / ${CEILING.legalIntroChars}`,
);
check(
  longestLegalIntro <= CEILING.longestLegalIntro,
  "LegalAffairsView'ın en uzun paragrafı kayıtlı tavanın altında",
  `${longestLegalIntro} / ${CEILING.longestLegalIntro}`,
);

check(
  chatty.length === 0,
  'hiçbir ekran metni kullanıcıya değil yazara hitap etmiyor',
  chatty.length ? chatty.join(', ') : '',
);

check(
  nameCopies.length === 0,
  'kurumun adı yalnızca src/lib/org.ts içinde',
  nameCopies.length ? nameCopies.join(', ') : '',
);

for (const [kind, ceiling] of Object.entries(JARGON_CEILING)) {
  const n = jargon[kind] ?? 0;
  check(n <= ceiling, `ekranda "${kind}" kayıtlı tavanın altında`, `${n} / ${ceiling}`);
}

// Tavanda olmayan bir jargon kategorisi eklenirse sessizce geçmesin.
const unlisted = Object.keys(jargon).filter((k) => !(k in JARGON_CEILING));
check(
  unlisted.length === 0,
  'her jargon kategorisinin kayıtlı bir tavanı var',
  unlisted.join(', '),
);

console.log('');
if (failures > 0) {
  console.error(`${failures} screen-text check(s) failed.`);
  process.exit(1);
}
console.log('All screen-text checks passed.');
