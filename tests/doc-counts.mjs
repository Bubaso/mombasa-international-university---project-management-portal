/**
 * Gereksinim dokümanının kendisi hakkındaki sayısı doğru mu? (CLAUDE.md §3)
 *
 * Ölçüm, 4 Ekim 2026: `docs/URUN-GEREKSINIMLERI.md` bölüm 5'in ilk satırı
 * **240 numaralandırılmış gereksinim** diyordu. O sayı yazıldığı gün doğruydu
 * (197 + 37 + 6, commit 748efe4) ve doküman sonradan büyüdü — en çok M13,
 * belge asistanının satırlarıyla. Gerçek sayı 252'ydi; aradaki 12 satır,
 * dokümanı okuyan birinin kapsamı eksik sanmasına yetiyordu.
 *
 * Sayıyı düzeltmek bu dosyayı gerekli kılan şeyin kendisi değil: düzeltilen
 * sayı da aynı yoldan eskir. Portalın ekranlarından kaldırılan şey buydu —
 * kimsenin denetlemediği bir rakamın kesin görünmesi. Dokümanın kendisi aynı
 * kurala tâbi.
 *
 * Neden dokümandaki sayıyı kaynak alıp satırları sayıyoruz da tersini
 * yapmıyoruz: doküman insan tarafından yazılıyor, satır sayısı ölçülüyor.
 * Ölçümün yazılana uymadığı yerde yanlış olan yazılandır, ve düşen test de
 * onu söylüyor.
 *
 * Ayrıştırıcının iki yanlış yapma yolu var ve ikisi eşit değil:
 *
 *   **Eksik sayım.** Bir gereksinim satırını tanımamak. Sayı düşük çıkar,
 *   test düşer, insan bakar. Gürültülü ama yanlış yöne göndermiyor.
 *
 *   **Fazla sayım.** Gereksinim olmayan numaralı satırı saymak. Bölüm 2'de
 *   `S-1`…`S-10` (yapısal sorunlar) ve `H-1`…`H-8` (doğrulanmış hatalar) var:
 *   bunlar **teşhis**, istenen iş değil. Onları sayan bir araç dokümanın
 *   kapsamını 270 gösterir ve kimse farkı aramaz. Bu yüzden desenler
 *   prefikse göre ve satır başına bağlı.
 *
 * 5 Ekim 2026: M5-17 eklendi (temyiz itirazları kütüğü) ve sayı 209 → 210,
 * toplam 252 → 253. Satır, tablo açılmadan ÖNCE yazıldı: dokuz itiraz koda
 * gömülüydü ve hiçbir gereksinim onları istemiyordu, yani tabloyu gereksinim
 * satırı olmadan açmak gereksinimi koddan uydurmak olurdu.
 *
 * Usage: npm run test:doc-counts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docPath = join('docs', 'URUN-GEREKSINIMLERI.md');
const doc = readFileSync(join(root, docPath), 'utf8');
const lines = doc.split('\n');

/**
 * Bir gereksinim satırı: tablo satırının **ilk** hücresinde bir kimlik.
 *
 * `^\|` şart, çünkü aynı kimlikler doküman boyunca düz metin içinde de
 * geçiyor ("M5-04 ile birlikte" gibi) ve onları saymak tanımı bozar: bir
 * gereksinim bir kez tanımlanır, kaç kez anıldığı başka bir şey.
 */
const rowsMatching = (pattern) => lines.filter((l) => pattern.test(l)).length;

const KINDS = [
  { what: 'module requirement', prefix: 'M', pattern: /^\| *M[0-9]+-[0-9]+/, expect: 210 },
  { what: 'non-functional requirement', prefix: 'N', pattern: /^\| *N-[0-9]+/, expect: 37 },
  { what: 'migration requirement', prefix: 'G', pattern: /^\| *G-[0-9]+/, expect: 6 },
];

// Teşhis satırları: sayılmayacaklar, ama sayılmadıkları **kayıtlı** olsun.
// Listede olmayan bir şeyi unutmak kolaydır; burada duran bir şeyi unutmak
// için testi silmek gerekir.
const DIAGNOSIS = [
  { what: 'structural problem', pattern: /^\| *S-[0-9]+/, expect: 10 },
  { what: 'verified error', pattern: /^\| *H-[0-9]+/, expect: 8 },
];

let measured = 0;
for (const kind of KINDS) {
  const n = rowsMatching(kind.pattern);
  measured += n;
  check(
    n === kind.expect,
    `${docPath} carries ${kind.expect} ${kind.what} rows`,
    n === kind.expect ? `${n}` : `measured ${n}, recorded ${kind.expect}`,
  );
}

for (const kind of DIAGNOSIS) {
  const n = rowsMatching(kind.pattern);
  check(
    n === kind.expect,
    `${docPath} carries ${kind.expect} ${kind.what} rows, which are not requirements`,
    n === kind.expect ? `${n}` : `measured ${n}, recorded ${kind.expect}`,
  );
}

// ---------------------------------------------------------------------------
// Dokümanın kendi cümlesi
// ---------------------------------------------------------------------------
//
// Asıl kural bu: bölüm 5'in ilk cümlesindeki rakam, ölçülen toplamla aynı
// olmalı. Rakamı cümleden okuyoruz, çünkü eskiyen şey cümleydi.

const stated = doc.match(/Toplam \*\*([0-9]+) numaralandırılmış gereksinim\*\*/);
check(stated !== null, `${docPath} states its own requirement total in section 5`);

if (stated) {
  const n = Number(stated[1]);
  check(
    n === measured,
    `${docPath} states the total it actually contains`,
    n === measured ? `${n}` : `the document says ${n}, its rows add up to ${measured}`,
  );
}

// Cümlenin içindeki dağılım da aynı rakamları taşıyor; biri güncellenip öbürü
// kalırsa doküman kendisiyle çelişir ve okuyan hangisine inanacağını bilemez.
//
// Boşluk önce tekilleştiriliyor. İlk hâlinde desen satır sonunu dışlıyordu ve
// `37` ile `fonksiyonel` arasına düşen satır kaymasında FAIL verdi — prettier
// paragrafı sardığı için. Dokümanın biçimine bağlı bir denetim, dokümanın
// içeriğini denetlemiyor.
const flowed = doc.replace(/\s+/g, ' ');

for (const kind of KINDS) {
  const written = new RegExp(`${kind.expect} [^|]*?\\(\`${kind.prefix}`).test(flowed);
  check(
    written,
    `section 5 names ${kind.expect} for the ${kind.prefix}* rows`,
    written ? '' : `the breakdown no longer says ${kind.expect}`,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} document-count check(s) failed.`);
  process.exit(1);
}
console.log('All document-count checks passed.');
