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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

  // -------------------------------------------------------------------------
  // Yapılmamış satır sayısı ÜÇ yerde yazılı — ve altı commit boyunca biri bir
  // eksikti
  // -------------------------------------------------------------------------
  //
  // Ölçüm, 8 Ekim 2026: "Yapılmamış satırlar" başlığının altındaki "N satır"
  // cümlesi, o başlığın altında gerçekten listelenen satır sayısından BİR
  // EKSİKTİ. Özet tablosu 22 diyordu, liste 22 satır taşıyordu, cümle 21.
  //
  // Sapma `283a662`'de başladı — yani bu dosyanın toplamını kapıya bağlayan
  // commit'te. O commit tabloyu 26'dan 27'ye çıkardı, cümleyi 26'da bıraktı,
  // ve kapı yalnızca tabloyu ölçüyordu. Sonraki altı commit ikisini birlikte
  // bir azalttı: 27/26, 26/25, 25/24, 24/23, 23/22, 22/21 — yani yanlışı
  // düzeltmeden taşıdı.
  //
  // Ve asıl sebep bu: M8-13 kapanınca liste 21'e düşüyor ve cümle
  // KENDİLİĞİNDEN doğru oluyordu. Kendi kendine kapanan bir hata, bulunmamış
  // bir hatadır — bir sonraki sapmada aynı yerden yine açılır.
  //
  // Bu yüzden sayının her kopyası listelenen satırlara karşı ölçülüyor, ve
  // bant başlıkları ayrıca GEREKSİNİM DOKÜMANININ öncelik sütununa karşı:
  // böylece bir satırı yanlış bandın altına koymak da düşer, sayılar
  // tutuyor olsa bile.
  {
    const notDone = /## Yapılmamış satırlar\n([\s\S]*?)\n## /.exec(audit);
    check(notDone !== null, `${auditPath} yapılmamış satırlar bölümü bulundu`);
    if (notDone) {
      const section = notDone[1];

      // Gereksinim dokümanının kendi öncelik sütunu: tek kaynak.
      const prioOf = new Map();
      for (const line of lines) {
        const m = /^\| *(M[0-9]+-[0-9]+) *\| *(P[0-3]) *\|/.exec(line);
        if (m) prioOf.set(m[1], m[2]);
      }

      // Bantlara böl: `### P2 — 19 satır`, ve altındaki kimlik satırları.
      // Bir bandın altında birden çok tablo olabiliyor ("portal içinde
      // yapılabilenler" ile "dışarıdan bir şeye bağlı olanlar"), o yüzden
      // tabloya değil başlığa göre bölünüyor.
      const bands = [];
      for (const chunk of section.split(/\n(?=### )/)) {
        const head = /^### (P[0-3]) — ([0-9]+) satır/.exec(chunk);
        if (!head) continue;
        const ids = [...chunk.matchAll(/^\| *(M[0-9]+-[0-9]+) *\|/gm)].map((m) => m[1]);
        bands.push({ p: head[1], written: Number(head[2]), ids });
      }
      check(bands.length > 0, `${auditPath} öncelik bantları okunabildi`, `${bands.length} bant`);

      const listed = bands.reduce((a, b) => a + b.ids.length, 0);
      check(
        listed === notRows,
        `${auditPath} listelenen yapılmamış satırlar özet tablosunu veriyor`,
        listed === notRows ? `${listed}` : `listelenen ${listed}, tabloda ${notRows}`,
      );

      // Aynı sayının ikinci kopyası: bölümün ilk cümlesi. Düşen kapı buydu.
      const prose = /^([0-9]+) satır\./m.exec(section);
      check(prose !== null, `${auditPath} bölüm başında kendi sayısını söylüyor`);
      if (prose) {
        const n = Number(prose[1]);
        check(
          n === listed,
          `${auditPath} bölüm başındaki sayı listelenen satırlara eşit`,
          n === listed ? `${n}` : `cümle ${n}, listelenen ${listed}`,
        );
      }

      // Üçüncü ve dördüncü kopya: "Bu denetimin kendi sınırı" bölümü iki
      // sayıyı birden tekrar ediyor.
      const closing = /Yukarıdaki ([0-9]+) satırın[\s\S]{0,80}?sayılan ([0-9]+) satırın/.exec(
        audit,
      );
      check(closing !== null, `${auditPath} kapanış bölümü iki sayıyı tekrar ediyor`);
      if (closing) {
        check(
          Number(closing[1]) === notRows && Number(closing[2]) === doneRows,
          `${auditPath} kapanış bölümündeki iki sayı özet tablosuna eşit`,
          `kapanış ${closing[1]}/${closing[2]}, tablo ${notRows}/${doneRows}`,
        );
      }

      // Her bant: başlıktaki sayı, altındaki satır sayısı, ve dağılım
      // cümlesinin parantezi — üçü de aynı şeyi söylüyor olmalı.
      const parenthetical = new Map();
      for (const m of flowedAudit.matchAll(/P([0-3]) [0-9]+ satır \(([^)]*)\)/g)) {
        const inside = m[2];
        parenthetical.set(
          `P${m[1]}`,
          /hepsi yapıldı/.test(inside) ? 0 : Number(/^([0-9]+)/.exec(inside)?.[1] ?? NaN),
        );
      }

      const bandProblems = [];
      for (const band of bands) {
        if (band.written !== band.ids.length) {
          bandProblems.push(`${band.p} başlığı ${band.written}, altında ${band.ids.length} satır`);
        }
        const inParen = parenthetical.get(band.p);
        if (inParen !== band.ids.length) {
          bandProblems.push(`${band.p} parantezi ${inParen}, altında ${band.ids.length} satır`);
        }
        // Ve satırın kendisi gerçekten o bantta mı? Sayılar tutup satır
        // yanlış bandın altında durabilir.
        for (const id of band.ids) {
          const real = prioOf.get(id);
          if (real === undefined) bandProblems.push(`${id} gereksinim dokümanında yok`);
          else if (real !== band.p) bandProblems.push(`${id} ${band.p} altında ama ${real}`);
        }
      }
      check(
        bandProblems.length === 0,
        `${auditPath} her bant başlığı, parantezi ve satırları birbirini tutuyor`,
        bandProblems.length
          ? bandProblems.join(' · ')
          : bands.map((b) => `${b.p}:${b.ids.length}`).join(' '),
      );

      // Dağılımın "yok" parantezleri toplamı da aynı sayıyı vermeli: bir
      // bandı listeden hiç yazmamak yukarıdaki bant döngüsüne görünmez.
      const parenTotal = [...parenthetical.values()].reduce((a, b) => a + b, 0);
      check(
        parenTotal === notRows,
        `${auditPath} dağılım parantezleri özet tablosunu veriyor`,
        parenTotal === notRows ? `${parenTotal}` : `parantezler ${parenTotal}, tabloda ${notRows}`,
      );
    }
  }

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
  // ---------------------------------------------------------------------------
  // README'nin kendi sayıları (README.md)
  // ---------------------------------------------------------------------------
  //
  // Ölçüm, 14 Ekim 2026: README sıfırdan yazılırken eski hâli okundu ve iki
  // cümlesi YANLIŞTI — "henüz kimlik doğrulama yok, satır seviyesi güvenlik
  // yok" ve "15 modülde 240 numaralı gereksinim". İkisi de yazıldığı gün
  // doğruydu. Birincisi 0001–0005 göçleriyle, ikincisi dokümanın büyümesiyle
  // eskidi, ve aradaki aylarda depoyu GitHub'da açan herkes o iki cümleyi
  // okudu.
  //
  // Sebep teknik ve tek: hiçbir kapı README'yi okumuyordu. `test:doc-counts`
  // gereksinim dokümanını ve kapsam denetimini depoya bağlıyordu, README'yi
  // değil — yani portalın ekranlarından kaldırılan şey (kimsenin denetlemediği
  // bir rakamın kesin görünmesi) deponun vitrininde duruyordu.
  //
  // Buradaki sayıların hepsi ÖLÇÜLÜYOR, README'den okunan rakamla
  // karşılaştırılıyor. Yön önemli: ölçüm doğru kabul edilir, README'deki
  // rakam yanlış kabul edilir, ve düşen test de onu söyler.
  {
    const readmePath = 'README.md';
    const readme = readFileSync(join(root, readmePath), 'utf8');
    const flowedReadme = readme.replace(/\s+/g, ' ');

    // Durum tablosundaki bir hücreyi oku: `| Ölçü | **253** (…) |`
    const cell = (label) =>
      new RegExp(`\\|\\s*${label}[^|]*\\|([^|]*)\\|`).exec(readme)?.[1]?.trim() ?? null;
    const num = (label) => {
      const c = cell(label);
      if (c === null) return NaN;
      return Number(/\*?\*?([0-9]+)/.exec(c)?.[1] ?? NaN);
    };

    // --- gereksinim toplamı ve dağılımı ------------------------------------
    check(
      num('Numaralı gereksinim') === measured,
      `${readmePath} durum tablosu ölçülen gereksinim toplamını söylüyor`,
      `README ${num('Numaralı gereksinim')}, ölçülen ${measured}`,
    );
    const breakdownWrong = KINDS.filter(
      (k) => !new RegExp(`${k.expect} \`${k.prefix}\\*\``).test(flowedReadme),
    ).map((k) => `${k.prefix}*: ${k.expect} yazılmamış`);
    check(
      breakdownWrong.length === 0,
      `${readmePath} dağılımı her prefiks için ölçülen sayıyı söylüyor`,
      breakdownWrong.length ? breakdownWrong.join(' · ') : KINDS.map((k) => k.expect).join(' + '),
    );

    // --- yapıldı / yapılmadı: kapsam denetiminin özet tablosuyla aynı ------
    const doneNot = /Modül gereksinimi[^|]*\|\s*\*\*([0-9]+) \/ ([0-9]+)\*\*/.exec(readme);
    check(doneNot !== null, `${readmePath} yapıldı/yapılmadı hücresi okunabildi`);
    if (doneNot) {
      check(
        Number(doneNot[1]) === doneRows && Number(doneNot[2]) === notRows,
        `${readmePath} yapıldı/yapılmadı kapsam denetimine eşit`,
        `README ${doneNot[1]}/${doneNot[2]}, denetim ${doneRows}/${notRows}`,
      );
    }

    // --- tasarım gereksinimleri: ölçülen T* satırı ve ✅ sayısı ------------
    const design = readFileSync(join(root, 'docs', 'TASARIM-GEREKSINIMLERI.md'), 'utf8').split(
      '\n',
    );
    const designRows = design.filter((l) => /^\| *T[0-9]+-[0-9]+/.test(l));
    const designDone = designRows.filter((l) => l.includes('✅')).length;
    const designCell = /Tasarım gereksinimi[^|]*\|\s*([0-9]+) \/ ([0-9]+)/.exec(readme);
    check(designCell !== null, `${readmePath} tasarım gereksinimi hücresi okunabildi`);
    if (designCell) {
      check(
        Number(designCell[1]) === designDone && Number(designCell[2]) === designRows.length,
        `${readmePath} tasarım gereksinimi sayıları ölçülene eşit`,
        `README ${designCell[1]}/${designCell[2]}, ölçülen ${designDone}/${designRows.length}`,
      );
    }

    // --- göç dosyası sayısı ve son göçün numarası -------------------------
    //
    // İkisi birden, çünkü 58 dosya varken sonuncusunun `0058` olduğu ayrı bir
    // iddia: bir numara atlanmış olabilir ve sayı yine tutar.
    const migrations = readdirSync(join(root, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const lastMigration = /^([0-9]{4})/.exec(migrations.at(-1) ?? '')?.[1] ?? '';
    check(
      num('Göç dosyası') === migrations.length,
      `${readmePath} göç dosyası sayısı ölçülene eşit`,
      `README ${num('Göç dosyası')}, ölçülen ${migrations.length}`,
    );
    const migrationCell = cell('Göç dosyası') ?? '';
    check(
      migrationCell.includes(`\`${lastMigration}\``),
      `${readmePath} son göçün numarasını doğru söylüyor`,
      `son göç ${lastMigration}, hücre: ${migrationCell}`,
    );

    // --- verify adımı: zincirin uzunluğu ----------------------------------
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const steps = pkg.scripts.verify
      .split('&&')
      .map((s) => s.trim().replace(/^npm run /, ''))
      .filter(Boolean);
    check(
      num('`npm run verify` adımı') === steps.length,
      `${readmePath} verify adım sayısı zincirin uzunluğuna eşit`,
      `README ${num('`npm run verify` adımı')}, zincir ${steps.length}`,
    );
    // Ve cümlenin içinde yazıyla geçen hâli de aynı sayıyı söylüyor.
    check(
      new RegExp(`Yirmi sekiz adım`).test(flowedReadme) === (steps.length === 28),
      `${readmePath} "Yirmi sekiz adım" cümlesi zincirle tutuyor`,
      `zincir ${steps.length}`,
    );

    // --- README'nin saydığı her verify adımı gerçekten zincirde mi, ve
    //     zincirin her adımı README'de yazılı mı? --------------------------
    //
    // İki yön ayrı: olmayan bir adımı saymak uydurmak, olan bir adımı
    // saymamak ise "28 adım" cümlesini içi boş bırakmak.
    // Desende RAKAM da var, ve sebebi bir düşüş: ilk hâli `[a-z:-]*` idi ve
    // `test:a11y` adımını tanımadı — kapı "README bu adımı saymıyor" dedi,
    // README ise onu sayıyordu. Ölçünün yanlış olduğu, ölçülenin değil: aynı
    // hatayı bu işi doğrulamak için yazdığım tek kullanımlık betik de yapmıştı,
    // yani iki ayrı yerde aynı desen aynı adımı kaybetti.
    const verifySection = /## Doğrulama: `npm run verify`\n([\s\S]*?)\n## /.exec(readme)?.[1] ?? '';
    const namedSteps = new Set(
      [
        ...verifySection.matchAll(/`((?:test:|build|lint|typecheck|format:check)[a-z0-9:-]*)`/g),
      ].map((m) => m[1]),
    );
    const phantom = [...namedSteps].filter((s) => !steps.includes(s));
    check(
      phantom.length === 0,
      `${readmePath} var olmayan bir verify adımı saymıyor`,
      phantom.length ? `zincirde yok: ${phantom.join(', ')}` : `${namedSteps.size} adım`,
    );
    const unnamed = steps.filter((s) => !namedSteps.has(s));
    check(
      unnamed.length === 0,
      `${readmePath} zincirin her adımını sayıyor`,
      unnamed.length ? `yazılmamış: ${unnamed.join(', ')}` : `${steps.length} adım`,
    );

    // --- politika testi: "11 bin satır" ------------------------------------
    const policyLines = readFileSync(join(root, 'tests', 'db', 'policies.test.sql'), 'utf8').split(
      '\n',
    ).length;
    const thousands = Math.floor(policyLines / 1000);
    check(
      num('Politika testi') === thousands,
      `${readmePath} politika testinin bin satırını doğru söylüyor`,
      `README ${num('Politika testi')} bin, ölçülen ${policyLines} satır`,
    );
    // Aynı sayı verify tablosunda ikinci kez yazılı.
    check(
      new RegExp(`${thousands} bin satırlık politika testini`).test(flowedReadme),
      `${readmePath} verify tablosunda da aynı bin satırı söylüyor`,
      `${thousands} bin`,
    );
    // Ve o satırdaki göç sayısı da ölçülene eşit.
    const appliedInGate = /atılabilir bir PostgreSQL kurar, ([0-9]+) göçü uygular/.exec(
      flowedReadme,
    );
    check(
      appliedInGate !== null && Number(appliedInGate[1]) === migrations.length,
      `${readmePath} politika testinin uyguladığı göç sayısı ölçülene eşit`,
      `README ${appliedInGate?.[1] ?? '—'}, ölçülen ${migrations.length}`,
    );

    // --- gezinme rotası: nav.mjs'in saydığı kümenin aynısı ----------------
    const tabsUnion = (() => {
      const types = readFileSync(join(root, 'src', 'types', 'index.ts'), 'utf8');
      const at = types.indexOf('export type ActiveTab');
      return types.slice(at, types.indexOf(';', at));
    })();
    const tabCount = [...tabsUnion.matchAll(/'([a-z_]+)'/g)].length;
    check(
      num('Gezinme rotası') === tabCount,
      `${readmePath} gezinme rotası sayısı ölçülene eşit`,
      `README ${num('Gezinme rotası')}, ölçülen ${tabCount}`,
    );

    // --- edge fonksiyonu: hem sayı hem isimler ----------------------------
    const fnDir = join(root, 'supabase', 'functions');
    const fns = readdirSync(fnDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort();
    check(
      num('Edge fonksiyonu') === fns.length,
      `${readmePath} edge fonksiyonu sayısı ölçülene eşit`,
      `README ${num('Edge fonksiyonu')}, ölçülen ${fns.length}`,
    );
    const missingFns = fns.filter((f) => !readme.includes(f));
    check(
      missingFns.length === 0,
      `${readmePath} mimari şeması her edge fonksiyonunu adıyla sayıyor`,
      missingFns.length ? `yazılmamış: ${missingFns.join(', ')}` : fns.join(' · '),
    );

    // --- rol ve gizlilik: enum'ların kendisi ------------------------------
    const identity = readFileSync(
      join(root, 'supabase', 'migrations', '0001_identity_and_classification.sql'),
      'utf8',
    );
    const enumValues = (name) => {
      const at = identity.indexOf(`create type ${name} as enum (`);
      if (at < 0) return [];
      return [...identity.slice(at, identity.indexOf(');', at)).matchAll(/'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
    };
    const roles = enumValues('app_role');
    const levels = enumValues('confidentiality');
    check(
      /\*\*On üç rol\*\*/.test(readme) === (roles.length === 13),
      `${readmePath} "On üç rol" cümlesi enum ile tutuyor`,
      `ölçülen ${roles.length}`,
    );
    const unnamedRoles = roles.filter((r) => !readme.includes(`\`${r}\``));
    check(
      unnamedRoles.length === 0,
      `${readmePath} her rolü adıyla sayıyor`,
      unnamedRoles.length ? `yazılmamış: ${unnamedRoles.join(', ')}` : `${roles.length} rol`,
    );
    const internalRoles = (() => {
      const at = identity.indexOf('app.is_internal_role');
      return [...identity.slice(at, identity.indexOf('$$;', at)).matchAll(/'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
    })();
    check(
      /altısı iç çekirdek/.test(readme) === (internalRoles.length === 6),
      `${readmePath} iç çekirdek rol sayısı app.is_internal_role ile tutuyor`,
      `ölçülen ${internalRoles.length}`,
    );
    check(
      /yedisi dış paydaş/.test(readme) === (roles.length - internalRoles.length === 7),
      `${readmePath} dış paydaş rol sayısı ölçülene eşit`,
      `ölçülen ${roles.length - internalRoles.length}`,
    );
    check(
      /\*\*Dört gizlilik seviyesi\*\*/.test(readme) === (levels.length === 4),
      `${readmePath} "Dört gizlilik seviyesi" cümlesi enum ile tutuyor`,
      `ölçülen ${levels.length}`,
    );
    const unnamedLevels = levels.filter((l) => !readme.includes(`\`${l}\``));
    check(
      unnamedLevels.length === 0,
      `${readmePath} her gizlilik seviyesini adıyla sayıyor`,
      unnamedLevels.length ? `yazılmamış: ${unnamedLevels.join(', ')}` : levels.join(' · '),
    );

    // --- sınıflandırma varsayılanı ----------------------------------------
    //
    // Bu bölüm bir uyuşmazlığı yazıyor: `CLAUDE.md` §4 yeni kayıt için
    // `confidential` diyor, şema tabandan `internal` verip hassas kütükleri
    // ismen yükseltiyor. Uyuşmazlığın kendisi ölçülemez ama iki yarısı
    // ölçülebilir: ortak kolonun varsayılanı, ve yükseltilmiş kütüklerin tam
    // listesi. Biri değişirse README'nin cümlesi sessizce yanlış olur.
    const allMigrations = migrations
      .map((f) => readFileSync(join(root, 'supabase', 'migrations', f), 'utf8'))
      .join('\n');
    const commonDefault =
      /add column if not exists confidentiality confidentiality not null default '([a-z]+)'/.exec(
        allMigrations,
      )?.[1];
    check(
      commonDefault === 'internal' &&
        /`app\.add_common_columns\(\)`[\s\S]{0,120}`internal` varsayılanıyla/.test(readme),
      `${readmePath} ortak kolonun varsayılanını doğru söylüyor`,
      `ölçülen ${commonDefault}`,
    );
    const tablesWithCommon = new Set(
      [...allMigrations.matchAll(/add_common_columns\('([a-z_.]+)'\)/g)].map((m) => m[1]),
    );
    check(
      /Kütük tablolarının ([0-9]+)'si/.exec(readme)?.[1] === String(tablesWithCommon.size),
      `${readmePath} ortak kolonu alan kütük sayısı ölçülene eşit`,
      `README ${/Kütük tablolarının ([0-9]+)'si/.exec(readme)?.[1] ?? '—'}, ölçülen ${tablesWithCommon.size}`,
    );

    // Varsayılanı `internal`'ın üstüne çıkmış her kütük: iki yazım biçimi var
    // (sonradan `alter column`, ya da tablo kurulurken doğrudan).
    const raised = new Map();
    for (const file of migrations) {
      const sql = readFileSync(join(root, 'supabase', 'migrations', file), 'utf8');
      const nnnn = /^([0-9]{4})/.exec(file)?.[1] ?? '';
      for (const m of sql.matchAll(
        /alter table ([a-z_]+)\s+alter column confidentiality set default '([a-z]+)'/g,
      )) {
        if (m[2] !== 'internal') raised.set(m[1], { level: m[2], migration: nnnn });
      }
      // Tablo kurulurken doğrudan yazılmış hâli: `create table X (… confidentiality … default 'Y' …)`
      for (const m of sql.matchAll(/create table ([a-z_]+) \(([\s\S]*?)\n\);/g)) {
        const d = /confidentiality confidentiality not null default '([a-z]+)'/.exec(m[2]);
        if (d && d[1] !== 'internal') raised.set(m[1], { level: d[1], migration: nnnn });
      }
    }
    const raisedProblems = [];
    for (const [table, { level, migration }] of raised) {
      const row = new RegExp(
        `\\|\\s*\`${table}\`\\s*\\|\\s*\`${level}\`\\s*\\|\\s*\`${migration}\`\\s*\\|`,
      );
      if (!row.test(readme)) raisedProblems.push(`${table} (${level}, ${migration})`);
    }
    check(
      raisedProblems.length === 0,
      `${readmePath} yükseltilmiş her kütüğü seviyesi ve göçüyle sayıyor`,
      raisedProblems.length
        ? `satırı yok ya da yanlış: ${raisedProblems.join(' · ')}`
        : `${raised.size} kütük`,
    );
    // Ve ters yön: README fazladan kütük saymıyor.
    const raisedTableRows = [
      ...(/^\| Kütük +\| Varsayılan +\| Göç +\|$([\s\S]*?)\n\n/m.exec(readme)?.[1] ?? '').matchAll(
        /^\| `([a-z_]+)`/gm,
      ),
    ].map((m) => m[1]);
    const invented = raisedTableRows.filter((t) => !raised.has(t));
    check(
      invented.length === 0 && raisedTableRows.length === raised.size,
      `${readmePath} yükseltilmiş kütük tablosu fazladan satır taşımıyor`,
      invented.length
        ? `şemada yok: ${invented.join(', ')}`
        : `README ${raisedTableRows.length}, ölçülen ${raised.size}`,
    );

    // --- uygulanmamış göçler ve doğrulama betikleri ------------------------
    //
    // README beş göçün "henüz uygulanmadı" olduğunu söylüyor ve her biri için
    // bir CANLIYA betiği adlandırıyor. Betiğin var olduğu ölçülebilir; canlıda
    // uygulanıp uygulanmadığı bu depodan ölçülemez, o yüzden tarih değil
    // DOSYA sınanıyor.
    const pendingRows = [...readme.matchAll(/^\| `(00[0-9]{2})` \| [^|]+\| `(docs\/[^`]+)` \|$/gm)];
    check(
      pendingRows.length > 0,
      `${readmePath} uygulanmamış göç tablosu okunabildi`,
      `${pendingRows.length} satır`,
    );
    const pendingProblems = [];
    for (const [, nnnn, script] of pendingRows) {
      if (!migrations.some((f) => f.startsWith(nnnn))) pendingProblems.push(`${nnnn} göçü yok`);
      if (!existsSync(join(root, script))) pendingProblems.push(`${script} yok`);
    }
    check(
      pendingProblems.length === 0,
      `${readmePath} uygulanmamış göç tablosundaki her göç ve betik var`,
      pendingProblems.length ? pendingProblems.join(' · ') : `${pendingRows.length} göç`,
    );

    // --- bilinen sınırlar: 16 satırın dağılımı ----------------------------
    //
    // README bu bölümün toplamını açıkça yazıyor ("1 karar, 7 dış bağımlılık,
    // 7 yazılmamış, 1 sunucu tarafı fonksiyon"). Eski README'nin düştüğü yer
    // tam buydu: bir sayı, onu üretmiş listeden koptu.
    const tally =
      /Bu bölümdeki satırların toplamı[\s\S]{0,120}?\*\*([0-9]+)\*\*['\u2019][a-zıi]+ veriyor: ([0-9]+) karar, ([0-9]+) dış bağımlılık, ([0-9]+) yazılmamış, ([0-9]+) sunucu/.exec(
        flowedReadme,
      );
    check(tally !== null, `${readmePath} bilinen sınırlar toplamı okunabildi`);
    if (tally) {
      const [, total, decision, external, unwritten, serverSide] = tally.map(Number);
      check(
        total === notRows,
        `${readmePath} bilinen sınırlar toplamı kapsam denetimine eşit`,
        `README ${total}, denetim ${notRows}`,
      );
      check(
        decision + external + unwritten + serverSide === total,
        `${readmePath} bilinen sınırlar dağılımı kendi toplamını veriyor`,
        `${decision} + ${external} + ${unwritten} + ${serverSide} = ${decision + external + unwritten + serverSide}, yazılan ${total}`,
      );
    }

    // Ve yapılmamış her `M*` satırı README'de adıyla geçiyor mu? Kapsam
    // denetimi 16 satırı listeliyor; README'nin 9'unu sayıp 7'sini atlaması
    // tam olarak "yazılmamış bir eksiklik yapılmış sanılır" hâli.
    const notDoneIds = [
      ...(/## Yapılmamış satırlar\n([\s\S]*?)\n## /.exec(audit)?.[1] ?? '').matchAll(
        /^\| *(M[0-9]+-[0-9]+) *\|/gm,
      ),
    ].map((m) => m[1]);
    const unmentioned = notDoneIds.filter((id) => !readme.includes(id));
    check(
      notDoneIds.length === notRows && unmentioned.length === 0,
      `${readmePath} yapılmamış her satırı adıyla sayıyor`,
      unmentioned.length ? `yazılmamış: ${unmentioned.join(', ')}` : `${notDoneIds.length} satır`,
    );

    // --- bağlantılar: README'nin işaret ettiği her dosya var mı? -----------
    const links = [
      ...readme.matchAll(/\]\((docs\/[A-Za-z0-9._-]+|CLAUDE\.md|[A-Za-z0-9._-]+\.md)\)/g),
    ].map((m) => m[1]);
    const brokenLinks = [...new Set(links)].filter((l) => !existsSync(join(root, l)));
    check(
      brokenLinks.length === 0,
      `${readmePath} içindeki her depo bağlantısı bir dosyaya çıkıyor`,
      brokenLinks.length ? `kırık: ${brokenLinks.join(', ')}` : `${new Set(links).size} bağlantı`,
    );
  }
}

console.log('');
if (failures > 0) {
  console.error(`${failures} document-count check(s) failed.`);
  process.exit(1);
}
console.log('All document-count checks passed.');
