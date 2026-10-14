/**
 * Bir satırın ✅ olması, bir şeyin ölçüldüğü anlamına gelmiyordu.
 *
 * Bu dosya bu oturumda beş kez tekrar eden bir hatanın üzerine yazıldı:
 * **bir gereksinim satırı kısmi ölçümle, ya da hiç ölçüm olmadan kapanmış.**
 * Beşi de tesadüfen bulundu, ve her biri farklı bir yoldan:
 *
 *   T13-08 — rakamları elle `grep`'le saymıştım, dört kalemi birden yanlıştı.
 *   T14-06 — satırı \"bekliyor\" yazdım, oysa yarısı zaten yapılmıştı.
 *   T3-01  — \"12px ALTI metin 0\" ölçüldü, satır \"14px altı\" istiyordu.
 *   T4-01  — araç `r.height < 44` ölçtü, satır \"44×44\" diyordu.
 *   T15-07 — telefonu ölçtüğünü sandığım kontrol masaüstünü ölçüyordu.
 *
 * Ortak nokta: hepsinde bir ✅ vardı ve hiçbirinin arkasında onu tutan bir
 * assertion yoktu — ya da tutan şey satırın istediğinden azını ölçüyordu.
 *
 * Buradaki kontrol şudur: **`docs/TASARIM-GEREKSINIMLERI.md`'de ✅ işaretli
 * her satırın kimliği, `npm run verify`'ın koştuğu bir test dosyasında
 * geçmek zorunda.**
 *
 * NE KANITLADIĞINI AÇIKÇA YAZIYORUM, çünkü bu dosyanın kendisi de aynı
 * hataya düşebilir: bu kontrol satırın ADININ geçtiğini kanıtlar, assertion'ın
 * YETERLİ olduğunu kanıtlamaz. Bir yorumda satır kimliğini anmak da sayılır.
 * Yani bu bir üst sınır değil bir alt sınır: \"hiçbir şey\" ile \"bir şey\"
 * arasını ayırıyor, \"yeterli\" ile \"yetersiz\" arasını ayırmıyor.
 *
 * Yine de bugün beş satırı yakalardı, ve beşinin dördü gerçek boşluktu.
 *
 * `tests/design.mjs` KASITLI olarak sayılmıyor: o dosya canlı projeye giriş
 * istiyor ve `verify` içinde değil. Elle koşulan bir ölçüm, koşulmadığı
 * sürece ölçüm değil — ve bu turda tam o dosyanın yarım ölçtüğü bir satır
 * (T4-01) çıktı.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// 1. verify'ın koştuğu test dosyalarını package.json'dan ÇIKAR
// ---------------------------------------------------------------------------
//
// Listeyi elle yazmak, listenin eskimesi demekti: yeni bir test eklenip
// buraya yazılmazsa onun koruduğu satır \"korumasız\" görünürdü. Kaynak
// `verify`'ın kendisi.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const steps = pkg.scripts.verify.split('&&').map((s) => s.trim().replace(/^npm run /, ''));
const files = new Set();
for (const step of steps) {
  for (const m of (pkg.scripts[step] ?? '').matchAll(/tests\/[A-Za-z0-9._/-]+/g)) files.add(m[0]);
}
// `tests/db/run.sh` politika SQL'ini koşuyor; onun içeriği de sayılır.
if (files.has('tests/db/run.sh')) files.add('tests/db/policies.test.sql');

check(steps.length >= 20, 'verify adımları okundu', `${steps.length} adım`);
check(files.size >= 15, 'verify test dosyaları çıkarıldı', `${files.size} dosya`);

let corpus = '';
for (const file of files) {
  if (existsSync(file)) corpus += readFileSync(file, 'utf8');
}
check(corpus.length > 100_000, 'test gövdesi okundu', `${Math.round(corpus.length / 1024)} KiB`);

// ---------------------------------------------------------------------------
// 2. ✅ her satır bir verify testinde anılıyor
// ---------------------------------------------------------------------------
const doc = readFileSync(join('docs', 'TASARIM-GEREKSINIMLERI.md'), 'utf8').split('\n');
const rows = [];
for (const line of doc) {
  const id = /^\| (T[0-9]+-[0-9]+) \|/.exec(line)?.[1];
  if (!id) continue;
  const cells = line.split('|');
  rows.push({ id, done: (cells[cells.length - 2] ?? '').includes('✅') });
}
const named = new Set([...corpus.matchAll(/T[0-9]+-[0-9]+/g)].map((m) => m[0]));
const done = rows.filter((r) => r.done);
const orphan = done.filter((r) => !named.has(r.id)).map((r) => r.id);

check(rows.length >= 85, 'tasarım satırları okundu', `${rows.length} satır`);
check(done.length >= 25, '✅ işaretli satırlar bulundu', `${done.length} satır`);
check(
  orphan.length === 0,
  '✅ her satır bir verify testinde anılıyor',
  orphan.length ? `anılmayan: ${orphan.join(', ')}` : `${done.length}/${done.length}`,
);

// ---------------------------------------------------------------------------
// 3. T13-02 — kullanıcının çarpacağı on bir kısıt ekranda
// ---------------------------------------------------------------------------
//
// Satır \"on bir kısıt tek tek arandı, hepsi ekranda\" diye kapanmıştı ve o
// arama ELLEydi. Elle yapılan bir arama bir kez doğrudur; bir sonraki kesim
// onu tekrar etmez. Liste buraya geçti.
//
// Bir kısıt bir gerekçe değil: gerekçe \"neden böyle kurduk\"u anlatır ve
// `docs/` içinde durabilir, kısıt ise kullanıcının çarpacağı duvardır ve
// ekranda durmak zorunda.
//
// Parçalar KAYNAKTAN alındı, dokümandan değil — ve bu ayrım bir bulgu.
//
// İlk yazımda listeyi `docs/TASARIM-GEREKSINIMLERI.md`'nin "on bir kısıt
// ekranda duruyor" paragrafındaki alıntılardan kopyaladım ve beşi eşleşmedi.
// Bir an bir kesimin kısıtı götürdüğünü sandım; değildi. Alıntılarım
// PARAFRAZDI:
//
//   doküman: "kasada belgesi olmadan 'karşılandı' olamıyor"
//   ekran:   kasada belgesi olmadan “karşılandı” olamıyor   (tipografik tırnak)
//
//   doküman: "duruşma bildirimi portal içinde kapatılamaz"
//   ekran:   Duruşma ve son tarih bildirimi portal içinde kapatılamaz.
//
//   doküman: "yalnızca denetçi koyabilir"
//   ekran:   ...yalnızca denetim komitesi ya da dış denetçi koyabilir...
//
//   doküman: "Kütüğü olmayan şerit çizilmiyor"
//   ekran:   Tanıtım şeridi yok: onu tutan bir kütük yok.
//
// Yani "on bir kısıt tek tek arandı" dediğim şey, dizgeleri değil FİKİRLERİ
// aramaktı — ve fikir aramak tekrar edilemez. Ekran metnini yaklaşık
// alıntılayan bir doküman, ekran metnini doğrulamak için kullanılamaz.
const CONSTRAINTS = [
  'Beyanlar varsayılan olarak gizli',
  'kasada belgesi olmadan “karşılandı” olamıyor',
  'bildirimi portal içinde kapatılamaz',
  'Kısıtlı kayıtlar hiçbir koşulda modele gitmez',
  'Belgesiz kayıt kabul edilmiyor',
  'kendi talebini onaylayamaz',
  'İmzadan sonra metin değiştirilemez',
  'Taslak olmayanın belgesi kasada olmak zorunda',
  'bir öneridir, kayıt değil',
  'Sorumlusu ve tarihi yazılmadan aksiyon sayılmıyor',
  'dış denetçi koyabilir',
];
// Dürüstlük cümleleri: bir bilinmeyeni ekranda tutuyorlar, yani gerekçe değil.
const HONESTY = [
  'kontrol edilebilir bir bağ bulunamadı',
  // Bu bir cümle değil bir DEĞER: `site.ts` yüzde null olduğunda bunu
  // döndürüyor, yani "sıfır" demeyip "bakılmadı" diyen şey bu dizge.
  'raporlanmadı',
  'Defter kişinin sahada olup olmadığını',
  'onu tutan bir kütük yok',
];

let src = '';
for (const file of globSync('src/**/*.{tsx,ts}')) src += readFileSync(file, 'utf8');
check(src.length > 500_000, 'kaynak gövdesi okundu', `${Math.round(src.length / 1024)} KiB`);

const missing = CONSTRAINTS.filter((c) => !src.includes(c));
check(
  missing.length === 0,
  `kullanıcının çarpacağı ${CONSTRAINTS.length} kısıt ekranda (T13-02)`,
  missing.length ? `eksik: ${missing.join(' · ')}` : `${CONSTRAINTS.length}/${CONSTRAINTS.length}`,
);
const lostHonesty = HONESTY.filter((c) => !src.includes(c));
check(
  lostHonesty.length === 0,
  `bilinmeyeni ekranda tutan ${HONESTY.length} cümle duruyor (T13-02)`,
  lostHonesty.length ? `eksik: ${lostHonesty.join(' · ')}` : `${HONESTY.length}/${HONESTY.length}`,
);

// ---------------------------------------------------------------------------
// 4. T14-06 — giriş girenin rolüne göre açılıyor
// ---------------------------------------------------------------------------
//
// Bu satır ✅ işaretliydi ve HİÇBİR test `BY_ROLE`'den haberdar değildi.
// Satırın dayanağı gösterge panelindeki rol→panel eşlemesi (M12-01); kenar
// çubuğunun filtrelenmemesi ise kullanıcının 6 Ekim 2026 kararı.
{
  const view = readFileSync(join('src', 'views', 'DashboardView.tsx'), 'utf8');
  const block = /const BY_ROLE: Record<string, PanelName\[\]> = \{([\s\S]*?)\n\};/.exec(view)?.[1];
  check(block != null, 'BY_ROLE eşlemesi kaynakta bulundu');
  const roles = block ? [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]) : [];
  check(
    roles.length >= 13,
    'giriş en az 13 rol için tanımlı (T14-06)',
    `${roles.length} rol${roles.length ? `: ${roles.slice(0, 4).join(', ')}…` : ''}`,
  );
}

// ---------------------------------------------------------------------------
// 5. T10-03 — iki serili her grafikte lejant
// ---------------------------------------------------------------------------
//
// Bu satır \"bakıldı, ölçülmedi\" diye kapanmıştı ve dokümanda öyle yazılıydı.
// Ölçülebilir hâli: `CurvePanel` çizdiği her grafik için bir lejant çağırıyor
// mu, ve Gantt kimliği taşıyan iki şekli adlandırıyor mu.
{
  const curve = readFileSync(join('src', 'components', 'reports', 'CurvePanel.tsx'), 'utf8');
  const charts = (curve.match(/<StepChart/g) ?? []).length;
  const legends = (curve.match(/\{legend\(/g) ?? []).length;
  check(charts >= 3, 'CurvePanel grafikleri bulundu', `${charts} grafik`);
  check(
    legends >= charts,
    'her grafik için bir lejant çağrılıyor (T10-03)',
    `${legends} lejant / ${charts} grafik`,
  );

  const gantt = readFileSync(join('src', 'components', 'plan', 'GanttPanel.tsx'), 'utf8');
  const shapes = ['daire: oldu', 'baklava: hâlâ borçlu'];
  const lost = shapes.filter((sh) => !gantt.includes(sh));
  check(
    lost.length === 0,
    'Gantt kimliği taşıyan iki şekli de adlandırıyor (T10-03)',
    lost.length ? `eksik: ${lost.join(', ')}` : shapes.join(' · '),
  );
}

// ---------------------------------------------------------------------------
// 6. T14-02 — ham teknik metin ve her ekranda tekrarlanan künye mobilyadan çıktı
// ---------------------------------------------------------------------------
//
// Satır iki şey iddia ediyor ve ikisi de ölçülebilir. Silinmeden, yeri
// değişerek: PostgREST'in ham hata metni bir açılır başlığın arkasına
// alındı (hatayı arayanın tek ipucu o, yani silinemez), ve parsel numarası
// ile kanun faslı her ekranın kenarından çıkıp künyeye taşındı.
{
  const status = readFileSync(join('src', 'components', 'QueryStatus.tsx'), 'utf8');
  check(
    /Teknik ayrıntı/.test(status) && /<details/.test(status),
    'ham hata metni açılır başlığın arkasında (T14-02)',
    'QueryStatus.tsx',
  );

  // Künye yalnızca kendi ekranında. Yorumlar hariç tutuluyor: `Sidebar.tsx`
  // kaldırıldığını ANLATAN bir yorum taşıyor ve onu içerik saymak, açıklamayı
  // kusur saymak olurdu.
  const withoutComments = (body) =>
    body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const CHROME = [
    join('src', 'components', 'Sidebar.tsx'),
    join('src', 'components', 'MobileMoreSheet.tsx'),
    join('src', 'components', 'Navbar.tsx'),
  ];
  const MARKS = ['Parsel Numarası', 'Cadastral Plot'];
  const leaked = [];
  for (const file of CHROME) {
    const body = withoutComments(readFileSync(file, 'utf8'));
    for (const mark of MARKS) if (body.includes(mark)) leaked.push(`${file}: ${mark}`);
  }
  check(
    leaked.length === 0,
    'künye bilgisi gezinme kabuğunda değil (T14-02)',
    leaked.length ? leaked.join(', ') : `${CHROME.length} dosya tarandı`,
  );
  const info = readFileSync(join('src', 'views', 'ProjectInfoView.tsx'), 'utf8');
  check(
    MARKS.some((m) => info.includes(m)),
    'künye bilgisi kendi ekranında duruyor — silinmedi, taşındı (T14-02)',
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} design-row check(s) failed.`);
  process.exit(1);
}
console.log('All design-row checks passed.');
