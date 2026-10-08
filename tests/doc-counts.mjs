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

// ---------------------------------------------------------------------------
// Kapsam denetiminin kendi toplamı (docs/KAPSAM-DENETIMI.md)
// ---------------------------------------------------------------------------
//
// Aynı çürüme, ikinci bir dosyada. Denetim 2026-10-01'de yazıldı, o günün
// `M*` sayısı 197'ydi, ve başlığı "197 gereksinim satırı" diyordu. Bugün 210.
//
// Başlıktaki sayı YANLIŞ değildi, EKSİKTİ: hangi kümeyi saydığını
// söylemiyordu. Dokümanın o günkü toplamı 240'tı (197 `M*` + 37 `N*` + 6
// `G*`), ve dosyayı sonradan okuyan biri — ben — 197'yi toplam sanıp
// "denetim 56 satır eskimiş" diye ölçtüm. Eskimişliği 13 satırdı.
//
// Hangi kümeyi saydığını söylemeyen bir sayı, yanlış bir sayıdan daha
// kötüdür: ikincisi düzeltilir, birincisi her okunduğunda yeniden yanlış
// anlaşılır.
//
// Bu yüzden üç şey birden sınanıyor: başlıktaki sayı ölçülen `M*` sayısına
// eşit mi, özet tablosu kendi içinde toplanıyor mu, ve öncelik dağılımı aynı
// toplamı veriyor mu. Üçü ayrı yerde yazılı ve üçü ayrışabilir.
{
  const auditPath = join('docs', 'KAPSAM-DENETIMI.md');
  const audit = readFileSync(join(root, auditPath), 'utf8');
  const measuredModules = rowsMatching(/^\| *M[0-9]+-[0-9]+/);

  const titled = /^# Kapsam denetimi — ([0-9]+) modül gereksinimi/m.exec(audit);
  check(titled !== null, `${auditPath} başlığında kendi toplamını söylüyor`);
  if (titled) {
    const n = Number(titled[1]);
    check(
      n === measuredModules,
      `${auditPath} başlığı ölçülen M* sayısına eşit`,
      n === measuredModules ? `${n}` : `başlık ${n}, ölçülen ${measuredModules}`,
    );
  }

  const row = (label) =>
    Number(new RegExp(`\\| ${label}\\s*\\|\\s*([0-9]+)\\s*\\|`).exec(audit)?.[1] ?? NaN);
  const doneRows = row('Yapıldı');
  const notRows = row('Yok');
  // Desen boşluğa TOLERANSLI, ve sebebi bir düşüş: prettier tablo hücrelerini
  // hizalıyor, yani `| **Toplam** | 210   |` içindeki boşluk sayısı dosyanın
  // başka bir yerindeki en uzun hücreye bağlı. Sabit boşluk sayan bir desen,
  // ilgisiz bir satır uzadığında kırılır.
  const totalRows = Number(/\|\s*\*\*Toplam\*\*\s*\|\s*([0-9]+)\s*\|/.exec(audit)?.[1] ?? NaN);
  check(
    Number.isFinite(doneRows) && Number.isFinite(notRows) && Number.isFinite(totalRows),
    `${auditPath} özet tablosu okunabildi`,
    `${doneRows} + ${notRows} = ${totalRows}`,
  );
  check(
    doneRows + notRows === totalRows,
    `${auditPath} özeti kendi içinde toplanıyor`,
    `${doneRows} + ${notRows} = ${doneRows + notRows}, yazılan ${totalRows}`,
  );
  check(
    totalRows === measuredModules,
    `${auditPath} toplamı ölçülen M* sayısına eşit`,
    totalRows === measuredModules
      ? `${totalRows}`
      : `yazılan ${totalRows}, ölçülen ${measuredModules}`,
  );

  // Öncelik dağılımı cümlesi: "P0 22 satır (1'i yok), P1 115 satır (4'ü yok)…"
  const flowedAudit = audit.replace(/\s+/g, ' ');
  const prios = [...flowedAudit.matchAll(/P([0-3]) ([0-9]+) satır/g)].map((m) => ({
    p: m[1],
    n: Number(m[2]),
  }));
  check(prios.length >= 4, `${auditPath} öncelik dağılımı okunabildi`, `${prios.length} band`);
  const prioTotal = prios.slice(0, 4).reduce((a, b) => a + b.n, 0);
  check(
    prioTotal === measuredModules,
    `${auditPath} öncelik dağılımı aynı toplamı veriyor`,
    prioTotal === measuredModules
      ? `${prioTotal}`
      : `dağılım ${prioTotal}, ölçülen ${measuredModules}`,
  );

  // Ve dağılımın her bandı dokümanda gerçekten o kadar satır mı?
  const byPrio = {};
  for (const line of lines) {
    const m = /^\| *M[0-9]+-[0-9]+ *\| *(P[0-3]) *\|/.exec(line);
    if (m) byPrio[m[1]] = (byPrio[m[1]] ?? 0) + 1;
  }
  const wrongBands = prios
    .slice(0, 4)
    .filter((x) => (byPrio[`P${x.p}`] ?? 0) !== x.n)
    .map((x) => `P${x.p}: yazılan ${x.n}, ölçülen ${byPrio[`P${x.p}`] ?? 0}`);
  check(
    wrongBands.length === 0,
    `${auditPath} her öncelik bandı dokümandaki satır sayısına eşit`,
    wrongBands.length
      ? wrongBands.join(' · ')
      : Object.entries(byPrio)
          .map(([k, v]) => `${k}:${v}`)
          .join(' '),
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} document-count check(s) failed.`);
  process.exit(1);
}
console.log('All document-count checks passed.');
