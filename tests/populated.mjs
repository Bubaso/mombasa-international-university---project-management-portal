/**
 * Her ekran, **dolu** veriyle açılıyor mu?
 *
 * `tests/smoke.mjs` her rotayı geziyor ama backend'i boş cevaplıyor, ve bunu
 * kasten yapıyor: boş veri bir zamanlar iki hukuk sekmesini çökertmişti.
 * Ama boş cevap hiçbir satır render etmiyor, yani satır başına çalışan kodun
 * tamamı o testin kapsamı dışında. 3 Ekim'de kullanıcı takvim ekranında
 * `undefined is not an object (evaluating 'L[t.kind].icon')` gördü: sebep
 * `kind = 'milestone'` olan bir satırdı. Boş cevapla o hata görünmezdi.
 *
 * Bu test o boşluğu kapatıyor. Veriyi uydurmuyor, **şemadan türetiyor**:
 * `tests/db/run.sh` göçleri tek kullanımlık bir Postgres'e uyguluyor ve
 * kolon dökümünü bırakıyor; buradaki her cevap o dökümden üretiliyor. Yani
 * bir göç yeni bir enum değeri eklediğinde, bu test o değeri ertesi koşuda
 * kendiliğinden ekrana sokuyor — kimsenin fixture güncellemesi gerekmiyor.
 *
 * Ölçülen tek şey: ekranda hata sınırı (`ErrorBoundary`) göründü mü, ve
 * sayfada yakalanmamış bir hata oluştu mu. Görünenin doğruluğu burada
 * sınanmıyor; o, veriyi bilen testlerin işi.
 *
 * Usage: npm run test:populated  (önce npm run test:policies, şemayı o yazıyor)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { relationsIn, rowsFor } from './schema-rows.mjs';
import { vocabulariesAcross } from './case-vocabularies.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.POPULATED_PORT ?? 4174);
const BASE = `http://127.0.0.1:${PORT}`;
const SCHEMA = process.argv[2] ?? join(root, 'tests', 'db', 'schema.json');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

if (!existsSync(SCHEMA)) {
  console.error(
    `No schema dump at ${SCHEMA}. It is written by tests/db/run.sh, so run ` +
      '`npm run test:policies` first (npm run verify does that for you).',
  );
  process.exit(1);
}
/**
 * Hangi derleme geziliyor.
 *
 * Varsayılan `dist-smoke`, yani gönderilen paketle aynı ayarlar. Bir hata
 * çıktığında bileşenin adı küçültülmüş olduğu için okunmuyor; o zaman
 * `POPULATED_DIST=dist-unminified` ile küçültmesiz bir derlemeye
 * yönlendiriliyor ve yığın bileşenin gerçek adını veriyor. Çökme davranışı
 * küçültmeye bağlı değil, yalnız adlar.
 */
const DIST = process.env.POPULATED_DIST ?? 'dist-smoke';
if (!existsSync(join(root, DIST, 'index.html'))) {
  console.error(`No ${DIST} build. Run \`npm run build:smoke\` first.`);
  process.exit(1);
}

const dump = JSON.parse(readFileSync(SCHEMA, 'utf8'));
const relations = relationsIn(dump);

// Hesaplanmış kolonların dağarcığı göç metninden geliyor: şema onların düz
// `text` olduğunu söylüyor, hangi değerleri alabileceğini söylemiyor.
const migrations = join(root, 'supabase', 'migrations');
const vocabularies = vocabulariesAcross(
  readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(migrations, f), 'utf8')),
);

/** @type {Map<string, Record<string, unknown>[]>} */
const canned = new Map();
for (const [name, columns] of relations) canned.set(name, rowsFor(columns, vocabularies));

check(relations.size > 100, 'the schema dump arrived', `${relations.size} relations`);
const withEnum = [...relations.values()].filter((cs) =>
  cs.some((c) => c.enum_values && c.enum_values.length > 1),
).length;
check(withEnum > 50, 'and enough of them carry an enum to be worth cycling', `${withEnum}`);
check(
  (canned.get('project_calendar') ?? []).some((r) => r.kind === 'milestone'),
  'the calendar rows include the kind that took the screen down',
);

/** Giriş yapmış sayılan kişi. Yetkisi her şeyi görecek kadar geniş. */
const PROFILE = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Populated Test',
  email: 'populated@test.invalid',
  role: 'admin',
  organization: 'AUTK',
  clearance: 'restricted',
  is_active: true,
  expires_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const AUTHORITY = {
  profile_id: PROFILE.id,
  role: 'admin',
  clearance: 'restricted',
  is_internal: true,
  can_write: true,
  delegated_from: null,
};

const ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/readiness',
  '/stakeholders',
  '/meetings',
  '/obligations',
  '/risks',
  '/calendar',
  '/plan',
  '/reports',
  '/procurement',
  '/finance',
  '/documents',
  '/communication',
  '/assistant',
  '/admin',
];

// ---------------------------------------------------------------- the server

const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--outDir', DIST],
  { cwd: root, stdio: 'ignore', detached: true },
);
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
};
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(1));

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await sleep(250);
  try {
    up = (await fetch(BASE + '/')).ok;
  } catch {
    /* not yet */
  }
}
if (!up) {
  console.error(`The preview server never came up on ${BASE}.`);
  process.exit(1);
}

// --------------------------------------------------------------- the browser

function resolveChromium() {
  return [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find(
    (p) => p && existsSync(p),
  );
}

const executablePath = resolveChromium();
const browser = await (executablePath
  ? chromium.launch({ executablePath })
  : chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch()));

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

/** @type {string[]} */
let pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error.message)));

/**
 * Hangi bileşende olduğu.
 *
 * `ErrorBoundary.componentDidCatch` hatayı ve React'in bileşen yığınını
 * konsola yazıyor (N-33'e kadar oranın tek kaydı o). Yığının ilk satırı
 * çöken bileşenin adı; mesajın kendisi hangi dosyaya bakılacağını
 * söylemiyor, o satır söylüyor.
 */
let culprits = [];
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (!text.includes('Unhandled render error')) return;
  const frame = /\n\s*at (\w+)|\n\s*in (\w+)/.exec(text);
  culprits.push(frame ? (frame[1] ?? frame[2]) : text.slice(0, 120));
});

/**
 * Hangi ilişkinin sorulduğu: `/rest/v1/<ad>?select=…`.
 *
 * `rpc/` ayrı: bir fonksiyonun döndürdüğü şeyi şema kolon olarak bilmiyor.
 */
const relationOf = (url) => {
  const path = new URL(url).pathname;
  const m = /\/rest\/v1\/([a-z0-9_]+)$/.exec(path);
  return m && m[1] !== 'rpc' ? m[1] : null;
};

await page.route('**/auth/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);

await page.route('**/rest/v1/**', (route) => {
  const request = route.request();
  const url = request.url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Yazmalar bir şey döndürmek zorunda değil; bu test okumayı ölçüyor.
  if (request.method() !== 'GET' && request.method() !== 'HEAD') return json([]);

  if (/\/rest\/v1\/rpc\/current_authority/.test(url)) return json(AUTHORITY);
  if (/\/rest\/v1\/rpc\//.test(url)) return json([]);

  const relation = relationOf(url);
  if (relation === 'profiles') {
    // PostgREST `.single()` çağrısını Accept başlığından ayırt ediyor; aynı
    // ayrımı burada da yapmak gerekiyor, yoksa liste okuyan ekranlar
    // kalıcı olarak boş kalır ve test boş bir ekranı geçmiş sanır.
    const single = (request.headers()['accept'] ?? '').includes('pgrst.object');
    return json(single ? PROFILE : [PROFILE]);
  }

  const all = relation ? canned.get(relation) : null;
  if (!all) return json([]);
  const single = (request.headers()['accept'] ?? '').includes('pgrst.object');
  if (single) return json(all[0]);

  // Uygulamanın İSTEDİĞİ kadarını ver. Önceki hâli `limit`'i yok sayıyordu ve
  // ekranı olduğundan kalabalık geziyordu: üç tarih isteyen şerit dokuz çiple
  // çıkıyordu. Çökme avında fark etmez (satır sayısı zaten dağarcık kadar),
  // ama yoğunluk ölçümünde ederdi — ölçtüğün şey ürün değil vekil olurdu.
  const range = request.headers()['range'];
  const limit = Number(new URL(url).searchParams.get('limit'));
  if (Number.isFinite(limit) && limit > 0) return json(all.slice(0, limit));
  if (range) {
    const [from, to] = range.split('-').map(Number);
    if (Number.isFinite(from) && Number.isFinite(to)) return json(all.slice(from, to + 1));
  }
  return json(all);
});

await page.addInitScript((profile) => {
  const oneHour = Math.floor(Date.now() / 1000) + 3600;
  window.localStorage.setItem(
    'sb-smoke-auth-token',
    JSON.stringify({
      access_token: 'populated-access-token',
      refresh_token: 'populated-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: oneHour,
      user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
    }),
  );
}, PROFILE);

/** Ekrandaki her hata sınırının gösterdiği mesaj. */
const boundaries = () =>
  page.$$eval('[role="alert"]', (nodes) =>
    nodes
      .filter((n) => (n.querySelector('h2')?.textContent ?? '').includes('failed to load'))
      .map((n) => (n.querySelector('pre')?.textContent ?? '(no message)').trim()),
  );

const settle = async () => {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    /* a long poll or a retry can keep it busy; the wait below is the floor */
  }
  await page.waitForTimeout(600);
};

/**
 * Geçişte beyaz ekran yok (T12-02) — ve bu ölçüm GEZİNTİDEN ÖNCE.
 *
 * Sıra kasıtlı ve bir hatayla öğrenildi. İlk yazımda bu blok 19 rotalık
 * gezintiden SONRAYDI ve "geçişte ekran boşalmıyor" diye geçti. Ama o noktada
 * her görünümün `lazy()` parçası çoktan inmişti: ölçtüğüm şey ısınmış bir
 * oturumdu, yani sorunun olmadığı hâl. Kullanıcının gördüğü hâl ise ilk
 * ziyaret — parça henüz inmemişken.
 *
 * Burada ölçülürse `/legal` ve `/finance` parçaları henüz inmemiş olur ve
 * ölçüm gerçekten soğuk olur.
 */

// T12-02: geçişte beyaz ekran yok.
//
// Grubu KİMLİĞE göre açıyorum. İlk yazımda `$$('aside [data-group]')`
// sonucunu konuma göre dolaşıyordum; ilk tık DOM'u yeniden çizince kalan
// tutamaçlar görünmez oldu ve koşucu TimeoutError ile çöktü — sekme
// gezgininde düzelttiğim hatanın aynısı, ikinci kez.
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await settle();

const visibleLink = async (target) => {
  const el = await page.$(`aside [data-path="${target}"]`);
  if (!el) return null;
  return (await el.evaluate((node) => node.getClientRects().length > 0)) ? el : null;
};
const reveal = async (target) => {
  let link = await visibleLink(target);
  if (link) return link;
  const ids = await page.$$eval('aside [data-group]', (els) =>
    els.map((e) => e.getAttribute('data-group')),
  );
  for (const id of ids) {
    const toggle = await page.$(`aside [data-group="${id}"]`);
    if (!toggle) continue;
    try {
      await toggle.click({ timeout: 2000 });
    } catch {
      continue;
    }
    link = await visibleLink(target);
    if (link) return link;
  }
  return null;
};

// Eşik 200 karakter: "boş" demek sıfır değil, ekranda okunacak bir şey
// kalmaması. Kabuk (kenar çubuğu, başlık) `main`'in dışında, yani bu sayı
// yalnızca ekranın kendi içeriği.
const BLANK = 200;
const blanked = [];
let transitions = 0;
for (const target of ['/legal', '/finance', '/meetings']) {
  const link = await reveal(target);
  if (!link) {
    blanked.push(`${target}: bağlantı açılamadı`);
    continue;
  }
  const before = ((await page.textContent('main')) ?? '').trim().length;
  await link.click({ timeout: 4000 });
  let low = before;
  for (let i = 0; i < 60; i += 1) {
    const n = ((await page.textContent('main')) ?? '').trim().length;
    if (n < low) low = n;
  }
  await settle();
  const after = ((await page.textContent('main')) ?? '').trim().length;
  if (after !== before) transitions += 1;
  if (low < BLANK) blanked.push(`${target}: ${low} karakter`);
}
check(
  blanked.length === 0,
  'rota geçişinde ekran boşalmıyor (T12-02)',
  blanked.length ? blanked.join(', ') : `3 geçiş, en az ${BLANK} karakter korundu`,
);
check(transitions >= 2, 'geçişler gerçekten oldu', `${transitions} / en az 2`);

// ----------------------------------------------------------------- the walk

/** @type {string[]} */
const found = [];
let tabsClicked = 0;

/**
 * İşaretli bir sayı, zaman varmış gibi okunur.
 *
 * Mütevelli kütüğünde düzeltilen kusur (süresi dolmuş üye için "−1700 gün
 * kaldı") 5 Ekim 2026'da gündem panelinde aynen duruyordu: "−236 gün kaldı".
 * Sebebi iki kaynağın ayrışması — `overdue` sunucudan, gün sayısı istemcide
 * `daysUntil`'den — ve kelimenin sayıya değil **bayrağa** bağlanmış olması.
 *
 * Bu yüzden kontrol tek bir bileşende değil, gezilen her ekranın metninde.
 * Bir paneli düzeltmek kuralı kurmaz; kural, hiçbir ekranda negatif bir
 * sayının ardından "kaldı" yazmamasıdır.
 */
const SIGNED_FUTURE = /[-−]\s?\d+\s*(?:gün kaldı|days left|gün var)/i;
const signedCounts = [];

/**
 * Ekranın YOĞUNLUĞU (T14-03).
 *
 * T13 turu metin karakteri saydı ve 66.523'ten 57.640'a indirdi; kullanıcı
 * yine "pek bir sadeleşme göremedim, hâlâ çok ağır" dedi ve haklıydı.
 * Ölçülen şey şikâyetin konusu değildi: dert cümlelerin uzunluğu değil,
 * **bir ekranda aynı anda kaç şeyin durduğu**.
 *
 * Bu yüzden ölçü artık üç sayı: ekrandaki düğme, başlık ve sayfanın boyu.
 * Hiçbiri tek başına "sadelik" demek değil, ama üçü birden geri büyürse
 * ekran ağırlaşmış demektir — ve karakter sayısı bunu göremiyordu.
 *
 * Tavanlar ÖLÇÜLEN değerler (5 Ekim 2026, T14 Faz 1 sonrası) ve kural olarak
 * yalnızca aşağı iner. Faz 2 bunları düşürmek için vardı: her ekran özetle
 * açılacak, detay istenince gelecek. Rakam düşmezse faz işe yaramamıştır ve
 * bunu burada göreceğiz — geçen sefer göremedik.
 *
 * ON DÖRT TAVANIN BOYU 7 Ekim 2026'da YÜKSELDİ, ve yalnızca boyu.
 *
 * Tipografi fazı 443 çağrı yerini 12px'ten 14px'e çıkardı (T3-01: "hiçbir
 * veri metni 14px'in altında değil"). Sonuç ölçüldü: on dokuz rotanın
 * **hiçbirinde** düğme ya da başlık sayısı değişmedi, on dördünde boy arttı —
 * en çok `/reports` (+128px, %10), en az `/stakeholders` (+4px, %0,3).
 *
 * Ayrım bu yüzden önemli: ekrana bir şey EKLENMEDİ, duran şey okunur oldu.
 * Yoğunluğun asıl ölçüsü düğme ve başlık sayısı — "aynı anda kaç şey duruyor"
 * sorusunun cevabı o — ve o iki sayı KİLİTLİ kaldı. Boy, yazı büyüyünce
 * büyümek zorunda; onu da sabit tutmak, kullanıcının şikâyet ettiği küçük
 * sıkışık metni koruyan bir kural yazmak olurdu.
 *
 * İKİ TAVAN 6 Ekim 2026'da YÜKSELDİ ve bu gizlenmiyor. T10-06 her grafiğin
 * yanında bir veri tablosu istiyor; katlanmış hâlde bile her tablo bir düğme
 * ve bir satır boy demek. Ölçülen bedel: `/plan` 51 → **53** düğme ve 1340 →
 * **1388px**, `/reports` 54 → **57** düğme ve 1242 → **1266px**.
 *
 * Bu bir ölçüm değişikliği DEĞİL — Faz 3'te tavanlar ölçünün değişmesiyle
 * yükselmişti, burada ekran gerçekten büyüdü. Bir gereksinim satırı bir
 * ratchet'i yendi, ve kazanan taraf yazılı duruyor: grafiğe bakıp rakamı
 * tahmin etmek zorunda kalmak, üç düğmeden pahalı.
 *
 * Aynı şey `/construction`'da da olmuştu (44 → 45 düğme, iki sekme iki düğme
 * ekliyor). Tavanın yükselmesi her zaman bir bedel, ve bedeli yazmadan
 * yükseltmek ratchet'i anlamsız kılar.
 *
 * `/project_info` 7 Ekim 2026'da sekmeye geçti (T15-04) ve üç sayısının ikisi
 * DÜŞTÜ: boy 1.487 → **1.044px**, başlık 6 → **3**. Yalnızca düğme 43 → **47**
 * çıktı, dört sekme dört düğme. Yani bu bir bedel değil bir takas: masaüstü de
 * kazandı, telefon ise 3.152 → 1.0xx piksele indi.
 *
 * Ekran masaüstünde 1.487px'ti, yani T14 turunun "ağır ekran" listesine hiç
 * girmedi — ve telefonda 3,7 ekrandı. Ölçüyü tek genişlikte almak, iki
 * genişlikten birini hiç görmemek demekti.
 */
const DENSITY = {
  '/assistant': { buttons: 55, headings: 3, height: 2392 },
  '/meetings': { buttons: 57, headings: 9, height: 1767 },
  '/obligations': { buttons: 52, headings: 10, height: 1567 },
  '/risks': { buttons: 57, headings: 4, height: 1481 },
  '/project_info': { buttons: 47, headings: 3, height: 1044 },
  '/stakeholders': { buttons: 50, headings: 5, height: 1356 },
  '/plan': { buttons: 53, headings: 4, height: 1412 },
  '/legal': { buttons: 58, headings: 4, height: 1316 },
  '/reports': { buttons: 57, headings: 7, height: 1394 },
  '/governance': { buttons: 59, headings: 3, height: 1196 },
  '/calendar': { buttons: 61, headings: 4, height: 1198 },
  '/': { buttons: 52, headings: 4, height: 1141 },
  '/readiness': { buttons: 50, headings: 4, height: 1110 },
  '/documents': { buttons: 52, headings: 2, height: 1072 },
  '/construction': { buttons: 50, headings: 2, height: 1044 },
  '/procurement': { buttons: 57, headings: 3, height: 1044 },
  '/finance': { buttons: 47, headings: 4, height: 1044 },
  '/communication': { buttons: 83, headings: 4, height: 1044 },
  '/admin': { buttons: 42, headings: 6, height: 1044 },
};
const density = {};
const tabsFound = {};
const tabsOpened = {};
const a11y = {};

for (const route of ROUTES) {
  pageErrors = [];
  culprits = [];
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await settle();

  const seen = new Set(await boundaries());

  // Yoğunluk, SEKMELERE DOKUNMADAN ölçülüyor: ölçülmesi gereken şey ekranı
  // açan kişinin gördüğü hâl. İlk yazımda ölçüm sekme döngüsünden SONRAYDI,
  // yani son sekmenin hâlini alıyordu — ve sekmesiz bir ekranla sekmeli bir
  // ekranı karşılaştırmak elma-armut oluyordu. Tam da ölçmeye çalıştığım
  // kazancı göremeyecek bir ölçümdü.
  density[route] = await page.evaluate(() => ({
    buttons: document.querySelectorAll('button').length,
    headings: document.querySelectorAll('h1,h2,h3,h4').length,
    height: document.body.scrollHeight,
  }));

  // Sekmeler: ilk ekranda görünmeyen bir panel, tıklanmadan sınanmaz.
  //
  // Gezinme İKİ SEVİYELİ ve bu ölçülerek öğrenildi. Önceki hâli tek bir
  // listeyi KONUMA göre dolaşıyordu; bir dış sekmeye tıklamak iç sekmeleri
  // DOM'dan kaldırınca liste kısalıyor ve döngü `if (!tab) break` ile
  // SESSİZCE çıkıyordu. Ölçüm: `/legal`'da on yedi sekmenin yedisi,
  // `/assistant`'ta dokuzun dördü açılıyordu — ve toplam eşik bunu
  // geçiriyordu, çünkü eşik hangi ekranın neyi kaçırdığını bilmiyor.
  //
  // Doğrusu: dış sekmeyi aç, O SEKMENİN iç sekmelerini aç, dışa dön. İç
  // sekmelere ancak ebeveyni açıkken ulaşılır.
  const labelsOf = async (list) =>
    Promise.all(
      (await list.$$('[role="tab"]')).map(
        async (t) => (await t.textContent())?.trim().slice(0, 40) ?? '',
      ),
    );
  const clickIn = async (list, label) => {
    const tabs = await list.$$('[role="tab"]');
    for (const t of tabs) {
      if (((await t.textContent())?.trim().slice(0, 40) ?? '') !== label) continue;
      try {
        await t.click({ timeout: 4000 });
      } catch {
        return false;
      }
      tabsClicked++;
      await settle();
      for (const message of await boundaries()) seen.add(`[${label}] ${message}`);
      return true;
    }
    return false;
  };

  const everSeen = new Set();
  const opened = new Set();
  const lists = await page.$$('[role="tablist"]');
  const outer = lists[0] ?? null;
  const outerLabels = outer ? await labelsOf(outer) : [];
  outerLabels.forEach((l) => everSeen.add(l));

  for (const label of outerLabels) {
    if (await clickIn(outer, label)) opened.add(label);
    // İç listeler: dış sekme açıkken ne varsa.
    const nested = (await page.$$('[role="tablist"]')).slice(1);
    for (const list of nested) {
      for (const inner of await labelsOf(list)) {
        everSeen.add(inner);
        if (opened.has(inner)) continue;
        if (await clickIn(list, inner)) opened.add(inner);
      }
    }
  }

  tabsFound[route] = everSeen.size;
  tabsOpened[route] = opened.size;

  // Erişilebilirlik: ADSIZ bir denetim, görmeyen biri için olmayan bir
  // denetimdir (T9-06).
  //
  // Satır numarası T9-06 ve YENİ: ilk yazımda buraya "T9-01..T9-03" yazdım,
  // ama o üç satır kontrast, renkle anlam ve klavye diyor — erişilebilir AD
  // demiyor. Ölçtüğüm şeyi istemeyen bir satırı kapatmak, T13 turunda yapılan
  // hatanın aynısı olurdu: karakter sayıp yoğunluk kapandı sanmak.
  //
  // Yoğunluk ölçümü sekmelere DOKUNMADAN alınıyor, bu ölçüm sekmeler
  // açıldıktan SONRA — çünkü ikisi farklı şeyi soruyor. Yoğunluk "ekranı
  // açan kişi ne görüyor" diye sorar; erişilebilirlik "bu ekranda adsız bir
  // şey var mı" diye sorar ve kapalı bir sekmedeki adsız düğme de kusurdur.
  //
  // Dördü de SIFIR iddiası, tavan değil. Bir ad eklemek bir satır; eklenmemiş
  // olmasının sebebi hep aynı: ikonun kendisi yazarın gözünde ad yerine
  // geçiyor.
  a11y[route] = await page.evaluate(() => {
    const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const named = (el) => {
      if ((el.getAttribute('aria-label') ?? '').trim()) return true;
      if ((el.getAttribute('title') ?? '').trim()) return true;
      const ref = el.getAttribute('aria-labelledby');
      if (ref && ref.split(/\s+/).some((id) => text(document.getElementById(id)))) return true;
      return false;
    };
    const fors = [...document.querySelectorAll('label[for]')];
    const controls = [...document.querySelectorAll('button,[role="tab"],a[href]')];
    const fields = [...document.querySelectorAll('input,select,textarea')].filter(
      (el) => el.type !== 'hidden',
    );
    const images = [...document.querySelectorAll('img')];
    const charts = [...document.querySelectorAll('svg[role="img"]')];
    const name = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '');
    return {
      controls: controls.length,
      namelessControls: controls.filter((el) => !text(el) && !named(el)).map(name),
      fields: fields.length,
      namelessFields: fields
        .filter(
          (el) =>
            !named(el) &&
            !fors.some((l) => l.getAttribute('for') === el.id && text(l)) &&
            !text(el.closest('label')),
        )
        .map(name),
      images: images.length,
      namelessImages: images.filter((el) => el.getAttribute('alt') === null).map(name),
      charts: charts.length,
      // `querySelector('title')` DEĞİL, doğrudan çocuk.
      //
      // İlk yazımda herhangi bir alt `<title>`'ı ad sayıyordum ve ölçüm
      // yanlış çıktı: `StepChart`'ın her `<circle>`'ı kendi `<title>`'ını
      // taşıyor (nokta ipucu), ve o çemberi adlandırıyor — grafiği değil.
      // Üç grafik adsızdı, kontrol 0 diyordu. SVG'nin erişilebilir adı
      // yalnızca İLK doğrudan çocuk `<title>`'dan gelir.
      namelessCharts: charts
        .filter((el) => !named(el) && !text([...el.children].find((c) => c.tagName === 'title')))
        .map(name),
    };
  });

  const body = (await page.textContent('body')) ?? '';
  const signed = body.match(new RegExp(SIGNED_FUTURE.source, 'gi')) ?? [];
  if (signed.length) signedCounts.push(`${route}: ${[...new Set(signed)].join(', ')}`);

  const uncaught = [...new Set(pageErrors)];
  check(
    seen.size === 0 && uncaught.length === 0,
    route.padEnd(16),
    [...seen, ...uncaught.map((e) => `uncaught: ${e}`)].join(' | ').slice(0, 400),
  );
  for (const message of seen) found.push(`${route} ${message}`);
  for (const name of [...new Set(culprits)]) found.push(`${route} ← ${name}`);
}

// Ölçülen yoğunluk, en ağırdan hafife. Tavan yazılmamış bir ekran da
// raporlanıyor: sessizce ölçülmeyen bir ekran, geçmiş gibi görünür.
{
  const rows = Object.entries(density).sort((a, b) => b[1].height - a[1].height);
  for (const [route, m] of rows) {
    const cap = DENSITY[route];
    if (!cap) {
      check(false, `${route} için yazılı bir yoğunluk tavanı yok`, JSON.stringify(m));
      continue;
    }
    const over = [];
    if (m.buttons > cap.buttons) over.push(`düğme ${m.buttons}>${cap.buttons}`);
    if (m.headings > cap.headings) over.push(`başlık ${m.headings}>${cap.headings}`);
    if (m.height > cap.height) over.push(`boy ${m.height}>${cap.height}px`);
    check(
      over.length === 0,
      `${route.padEnd(15)} yoğunluğu tavanın altında (T14-03)`,
      over.length ? over.join(', ') : `${m.buttons} düğme · ${m.headings} başlık · ${m.height}px`,
    );
  }
}

/**
 * Adsız denetim, adsız alan, adsız resim, adsız grafik — dördü de sıfır
 * (T9-01, T9-02, T9-03).
 *
 * Ölçüm, 6 Ekim 2026: on dokuz rotada bu dört sayı zaten sıfırdı. Yani bu
 * blok bir kusuru düzeltmiyor; **düzgün olanın bozulmamasını** sağlıyor.
 * Sıfırı ölçmeden yazmak, kuralı kendi iddiasına yaslamak olurdu — bu yüzden
 * önce ölçüldü, sonra kurala çevrildi.
 *
 * TABAN sayıları (`FLOOR`) kuralın kendisi kadar önemli: seçici bir gün
 * eşleşmez olursa dört sıfır da kendiliğinden geçer ve kapı körleşir. Bu
 * depoda tam bu oldu — sekme gezgini on yedi sekmenin yedisini açıyordu ve
 * "bulunanların hepsi açıldı" kontrolü geçiyordu. Bu yüzden kaç şeye
 * BAKILDIĞI da sınanıyor.
 */
{
  // Ölçülen, 6 Ekim 2026: on dokuz rotada toplam 972 denetim, 18 form alanı,
  // 0 resim (`<img>` yok, ikonlar inline SVG), ve en kalabalık rotada 3
  // grafik. Taban ölçülenin biraz altında: amaç körlüğü yakalamak, rakamı
  // dondurmak değil.
  //
  // İlk yazımda taban 30 alan ve 4 grafikti ve İKİSİ DE düştü — çünkü
  // sayıları bu kapıdan değil, ayrı bir ölçüm betiğinden hatırlayarak
  // yazmıştım. Ölçmediğim bir sayıyı yazmanın bedeli buydu; kapı yakaladı.
  const FLOOR = { controls: 900, fields: 15, charts: 3 };
  const total = (key) => Object.values(a11y).reduce((n, m) => n + m[key], 0);
  const worst = (key) => Math.max(...Object.values(a11y).map((m) => m[key]));

  for (const [key, label] of [
    ['namelessControls', 'adsız düğme/sekme/bağlantı'],
    ['namelessFields', 'etiketsiz form alanı'],
    ['namelessImages', 'alt metni olmayan resim'],
    ['namelessCharts', 'adsız grafik'],
  ]) {
    const bad = Object.entries(a11y)
      .filter(([, m]) => m[key].length > 0)
      .map(([route, m]) => `${route}: ${m[key].slice(0, 6).join(',')}`);
    check(bad.length === 0, `hiçbir ekranda ${label} yok`, bad.join(' | ').slice(0, 300));
  }

  check(
    total('controls') >= FLOOR.controls,
    'erişilebilirlik taraması denetimleri gördü',
    `${total('controls')} / en az ${FLOOR.controls}`,
  );
  check(
    total('fields') >= FLOOR.fields,
    'erişilebilirlik taraması form alanlarını gördü',
    `${total('fields')} / en az ${FLOOR.fields}`,
  );
  check(
    worst('charts') >= FLOOR.charts,
    'erişilebilirlik taraması grafikleri gördü',
    `en kalabalık rotada ${worst('charts')} / en az ${FLOOR.charts}`,
  );
}

/**
 * Kenar çubuğunun grupları katlandı (T14-05) — ve hiçbir rota kaybolmadı.
 *
 * Bugüne kadar kapıda kenar çubuğunun DOM'unu sınayan hiçbir şey yoktu:
 * `nav.mjs` kaynağı okuyor, `design.mjs` tarayıcıda ölçüyor ama `verify`
 * içinde değil (canlı giriş istiyor). Yani katlamanın bir rotayı erişilemez
 * bırakması sessizce geçebilirdi.
 *
 * Kontrol: her grubu aç, çıkan `data-path`'leri topla, rota sayısına eşit
 * olsun. Katlamak gizlemek değil bir tık arkaya almaktır, ve aradaki farkı
 * ölçen tek şey bu.
 */
{
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await settle();
  // GÖRÜNÜR olanlar, her grup açıldıktan sonra, birleşim olarak. İlk yazımda
  // yalnızca `data-path`'lerin VARLIĞINA bakıyordum ve mutasyon geçti:
  // aç/kapa düğmesini ölü hâle getirdim, rotalar `hidden` bir listede DOM'da
  // durmaya devam etti, kontrol memnun kaldı. Varlık erişilebilirlik değil.
  const visiblePaths = () =>
    page.$$eval('aside [data-path]', (els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-path') ?? '')
        .filter(Boolean),
    );
  const reachableSet = new Set(await visiblePaths());
  for (const header of await page.$$('aside [data-group]')) {
    await header.click().catch(() => {});
    await page.waitForTimeout(150);
    for (const path of await visiblePaths()) reachableSet.add(path);
  }
  const reachable = [...reachableSet];
  check(
    reachable.length === ROUTES.length,
    'kenar çubuğunda her rota bir grup açılınca erişilebilir (T14-05)',
    `${reachable.length}/${ROUTES.length}`,
  );
}

/**
 * Sekmeli her ekranda KAÇ sekme olduğu, ölçülmüş ve yazılmış.
 *
 * "Bulunanın hepsi açıldı" tek başına yetmiyor ve bu mutasyonla ölçüldü:
 * gezgini tek seviyeye düşürdüm, iç sekmeleri HİÇ görmedi, ve kontrol
 * memnun geçti — çünkü görmediğini arayamaz. Daha dar bir ölçüm kendi
 * üst sınırını her zaman tutturur; aynı ders, bu depoda üçüncü kez.
 *
 * Bu yüzden sayı burada, gezginden bağımsız. Bir ekranın sekmesi artarsa
 * (yeni panel) ya da gezgin körleşirse, ikisi de düşürür.
 */
const TABS_EXPECTED = {
  '/legal': 17,
  '/communication': 5,
  '/procurement': 4,
  '/construction': 2,
  '/assistant': 9,
  '/readiness': 5,
  '/risks': 5,
  '/plan': 5,
  '/finance': 5,
  '/governance': 4,
  '/project_info': 4,
};

{
  const missed = Object.keys(tabsFound)
    .filter((route) => tabsOpened[route] !== tabsFound[route])
    .map((route) => `${route}: ${tabsOpened[route]}/${tabsFound[route]}`);
  check(
    missed.length === 0,
    'her ekranda bulunan her sekme açıldı',
    missed.length ? missed.join(', ') : `${Object.keys(tabsFound).length} ekran tarandı`,
  );

  const wrong = Object.entries(TABS_EXPECTED)
    .filter(([route, n]) => (tabsFound[route] ?? 0) !== n)
    .map(([route, n]) => `${route}: ${tabsFound[route] ?? 0} ≠ ${n}`);
  check(
    wrong.length === 0,
    'sekmeli ekranların sekme sayısı kayıtlı sayıya eşit',
    wrong.length ? wrong.join(', ') : `${Object.keys(TABS_EXPECTED).length} ekran`,
  );

  // Sekmesi olup da kayıtlı sayısı olmayan ekran: sessizce sayımın dışında
  // kalır, ve T14-04 her turda yeni bir sekmeli ekran üretiyor. Kaydı
  // olmayan bir ekranı "ölçüldü" saymak, ölçmemekle aynı şey.
  const uncounted = Object.keys(tabsFound).filter(
    (route) => tabsFound[route] > 0 && !(route in TABS_EXPECTED),
  );
  check(
    uncounted.length === 0,
    'sekmesi olan her ekranın kayıtlı bir sekme sayısı var',
    uncounted.join(', '),
  );
}

check(
  signedCounts.length === 0,
  'hiçbir ekran negatif bir sayıyı "kaldı" diye yazmıyor',
  signedCounts.join(' | ').slice(0, 300),
);

// Kaç sekmenin tıklandığı raporlanıyor: tıklanmayan bir panel sınanmamıştır,
// ve sessizce sınanmayan bir panel geçmiş gibi görünür. Ölçülen sayı 17 (üç
// ekranın kendi sekmeleri ve hukuk ekranının iki seviyesi); eşik bunun biraz
// altında, çünkü sekmeler keşfedilemez hâle gelirse bu düşmeli.
check(
  tabsClicked >= 15,
  'enough in-screen tabs were opened to have seen their panels',
  `${tabsClicked} clicked`,
);

/**
 * Telefon genişliğinde yatay kaydırma (T10-07, T2-01).
 *
 * Grafikler bu kontrolün sebebi: `GanttPanel`'in SVG'si `minWidth: 560`
 * taşıyor, yani 390px'lik bir ekranda kendi kutusundan geniş. Doğrusu da bu —
 * bir zaman çizgisini 390 piksele sıkıştırmak okunmaz yapar — ama o genişlik
 * KENDİ `overflow-x-auto` kutusunda kalmak zorunda. Sayfanın gövdesine
 * taşarsa bütün ekran yana kayar.
 *
 * ÜÇ kontrol var ve ikincisi ölçülerek eklendi. İlk yazımda yalnızca
 * sayfanın taşmasını sınıyordum; Gantt'ın `overflow-x-auto` kutusunu
 * kaldırdım ve kontrol GEÇTİ. Sebebi öğretici: `App.tsx`'teki `<main>`
 * `overflow-y-auto` taşıyor, ve CSS'te bir eksen `visible` değilse öbürü
 * `auto`'ya düşer — yani yatay kaymayı `<main>` emiyor ve sayfa hiç
 * taşmıyor. Grafik kırpılmıyor, erişilebilir kalıyor, ama yana kaydırmak
 * BÜTÜN ekranı kaydırıyor: diğer paneller de gidiyor. Tam da "her yerden
 * bir şey çıkıyor" şikâyetinin kendisi.
 *
 * Asıl kural bu yüzden şu: telefonda kutusundan geniş kalan bir grafik
 * KENDİ `overflow-x` kutusunda kaymak zorunda. Genişlik kusur değil — bir
 * zaman çizgisini 390 piksele sıkıştırmak okunmaz yapar — genişliğin
 * NEREYE taştığı kusur.
 *
 * Üçüncüsü körlük için: grafik hiç çizilmezse ilk ikisi de kendiliğinden
 * geçer.
 */
{
  await page.setViewportSize({ width: 390, height: 844 });
  const overflows = [];
  const escapees = [];
  let narrowCharts = 0;

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await settle();
    const m = await page.evaluate(() => {
      const root = document.documentElement;
      const over = root.scrollWidth - root.clientWidth;

      // Kutusundan geniş olup o kutusu kaydırmayan grafik. Ölçünün kendisi
      // bu: genişlik kusur değil, genişliğin NEREYE taştığı kusur.
      const escaped = [];
      let drawn = 0;
      for (const svg of document.querySelectorAll('svg[role="img"]')) {
        if (svg.getClientRects().length === 0) continue;
        drawn += 1;
        const box = svg.parentElement;
        if (!box) continue;
        const w = svg.getBoundingClientRect().width;
        if (w <= box.clientWidth + 1) continue; // kutusuna sığıyor
        const ox = getComputedStyle(box).overflowX;
        if (ox === 'auto' || ox === 'scroll') continue; // kendi kutusunda kayıyor
        const name = svg.getAttribute('aria-label') ?? 'grafik';
        escaped.push(`${name} ${Math.round(w)}px > ${box.clientWidth}px`);
      }

      // Sayfanın kendisi taşıyorsa taşıranı da yaz: "bir yerde taşma var"
      // diyen bir kontrol, neyi düzelteceğini söylemeyen bir kontroldür.
      let widest = '';
      if (over > 0) {
        let worst = 0;
        for (const el of document.querySelectorAll('body *')) {
          if (el.getClientRects().length === 0) continue;
          const right = el.getBoundingClientRect().right - root.clientWidth;
          if (right > worst) {
            worst = right;
            const cls = (el.className || '').toString().split(/\s+/).slice(0, 3).join('.');
            widest = `${el.tagName.toLowerCase()}.${cls}`;
          }
        }
      }

      return { over, widest, escaped, drawn };
    });
    narrowCharts += m.drawn;
    if (m.over > 0) overflows.push(`${route}: +${m.over}px (${m.widest})`);
    for (const e of m.escaped) escapees.push(`${route}: ${e}`);
  }

  check(
    overflows.length === 0,
    "hiçbir ekran 390px'te yatay kaymıyor (T10-07)",
    overflows.length ? overflows.slice(0, 6).join(' | ') : `${ROUTES.length} rota`,
  );
  check(
    escapees.length === 0,
    'telefonda geniş kalan her grafik KENDİ kutusunda kayıyor (T10-07)',
    escapees.length ? escapees.slice(0, 6).join(' | ') : 'kaçan yok',
  );
  check(
    narrowCharts >= 4,
    'telefon turu grafikleri gerçekten çizili gördü',
    `${narrowCharts} grafik`,
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
}

/**
 * Algılanan hız: soğuk yükleme bütçesi ve geçişte beyaz ekran (T12-01, T12-02).
 *
 * Kapıya ZAMAN değil BAYT giriyor, ve sebebi kasıtlı. Kısıtlı ağ ölçümü
 * makineye bağlı: aynı derleme bu konteynerde 2.256ms, başka bir runner'da
 * başka bir şey verir, ve kaypak bir kontrol er geç kapatılır. Baytlar ise
 * derlemenin kendisinin bir özelliği — ve 3G'deki süreyi belirleyen şey o.
 * Biri 500 KB'lık bir bağımlılık eklediğinde FCP 3 saniyeyi aşar; yakalayan
 * şey burada duran tavan olur.
 *
 * Ölçülen (6 Ekim 2026, temiz bağlam, kısıtsız, `load` olayında): 7 istek,
 * 191 KB, en büyüğü 104 KB'lık ana paket. İlk ölçümümde 8 istek / 192 KB
 * görünmüştü ve fark bekleme süresindeydi — 8 saniye bekleyince service
 * worker'ın kendisi de sayıma giriyor. Aynı derlemenin kısıtlı ağdaki FCP'si
 * kapıda DEĞİL, `docs/TASARIM-GEREKSINIMLERI.md`'de kayıtlı: Hızlı 3G
 * 2.256ms (kriterin altında), Yavaş 3G 8.140ms.
 *
 * TEMİZ BAĞLAM şart ve bu da ölçülerek öğrenildi: aynı sayfada ölçmeye
 * çalıştığımda `transferSize` her istekte 0 çıktı, çünkü her şey service
 * worker'ın Cache Storage'ından geliyordu. `Network.clearBrowserCache` onu
 * temizlemiyor. Kısıtlama uygulanmıyor değildi — KISITLANACAK TRAFİK yoktu,
 * ve üç imkânsız rakam (Yavaş 3G'nin Hızlı 3G'den hızlı çıkması) bunu
 * söylüyordu.
 */
{
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await fresh.newPage();
  await tab.goto(BASE + '/', { waitUntil: 'load' });
  const cold = await tab.evaluate(() => {
    const rows = performance.getEntriesByType('resource');
    return {
      count: rows.length,
      kb: Math.round(rows.reduce((n, r) => n + (r.transferSize || 0), 0) / 1024),
      biggestKb: Math.round(Math.max(0, ...rows.map((r) => r.transferSize || 0)) / 1024),
    };
  });
  await fresh.close();

  const BUDGET = { count: 10, kb: 210, biggestKb: 115 };
  check(
    cold.count <= BUDGET.count,
    'soğuk yükleme istek sayısı bütçenin altında (T12-01)',
    `${cold.count} / ${BUDGET.count}`,
  );
  check(
    cold.kb <= BUDGET.kb,
    'soğuk yükleme bayt bütçesinin altında (T12-01)',
    `${cold.kb}kb / ${BUDGET.kb}kb`,
  );
  check(
    cold.biggestKb <= BUDGET.biggestKb,
    'en büyük tek varlık bütçenin altında (T12-01)',
    `${cold.biggestKb}kb / ${BUDGET.biggestKb}kb`,
  );
  // Körlük: `transferSize` 0 gelirse üç bütçe de kendiliğinden geçer — yukarıda
  // yazılı sebeple, ve bir kez gerçekten oldu.
  check(cold.kb > 50, 'soğuk yükleme ölçümü gerçekten ağ trafiği gördü', `${cold.kb}kb`);
}

/**
 * Telefon ölçümü (T15) — ve tavanlar KESİMDEN ÖNCE yazıldı.
 *
 * Masaüstü T13/T14 ile rahatladı; bu blok aynı soruyu 390×844'te soruyor.
 * Ölçüm, 7 Ekim 2026, 19 rota:
 *
 *   `main` 232px'te başlıyor — görüntü alanının %27,5'i. Sticky başlık 57px,
 *   kritik tarih şeridi 175px, sabit alt çubuk 65px: toplam mobilya %35.
 *
 *   Kaydırma 1,5 – 3,9 ekran. 44px altı dokunma hedefi rota başına 3–5, en
 *   küçüğü 18×44. Form alanlarının 6/6'sı 16px altında. `user-scalable=no`
 *   var.
 *
 * Tavanlar bu ölçülen değerler ve yalnızca AŞAĞI iner. T13-09'un dersi:
 * tavanı kesimden sonra yazmak, kendi sonucuna bakıp hedefi ona uydurmak
 * olurdu — bu yüzden ilk tavan kesimden önce buraya yazıldı ve her faz onu
 * düşürecek. Rakam düşmezse faz işe yaramamıştır.
 */
{
  // Faz 1 sonrası ölçülen değerler. Kapıya giren ilk tavanlar kesimden ÖNCE
  // yazılmıştı (232 · 175 · 9 · 3270 · 6); bunlar onların düştüğü yer.
  const MOBILE = {
    mainTop: 114, // T15-01: 232 → 114 (kriter ≤130, altında)
    bannerH: 57, // T15-02: 175 → 57 (kriter ≤60, altında)
    smallTargets: 0, // T4-01: 9 → 0, artık bir tavan değil bir KURAL
    height: 2967, // T15-04: 3270 → 3152 (Faz 1) → 2967 (Faz 2); kriter ≤2532, hâlâ üstünde
    smallFields: 0, // T15-05: 6 → 0, kural
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = {};
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await settle();
    mobile[route] = await page.evaluate(() => {
      const vis = (el) => el.getClientRects().length > 0;
      const all = [...document.querySelectorAll('body *')].filter(vis);

      // Dokunma hedefi: 44px'den kısa YA DA dar olan tıklanabilir öge.
      // Genişlik de sayılıyor ve sebebi ölçülmüş: en küçük hedef 18×44, yani
      // yüksekliği doğru genişliği yanlış. Yalnızca yüksekliğe bakan bir
      // kontrol onu geçirirdi.
      const tappable = all.filter(
        (el) =>
          /^(button|a|input|select|textarea|summary)$/i.test(el.tagName) ||
          el.getAttribute('role') === 'tab',
      );

      // İki muafiyet, ikisi de uydurma değil.
      //
      // Onay kutusu ve radyo: denetim 16px, hedef yanındaki ETİKET. Bunu
      // `tests/design.mjs` 4. dalgada böyle kaydetmişti ve gerekçesi aynen
      // geçerli — kutuyu ölçmek olmayan bir kusuru bildirmek olur. Yeni bir
      // tanım uydurmak yerine o kararı taşıyorum.
      //
      // Paragrafın içindeki bağlantı: WCAG 2.5.5 satır içi hedefleri açıkça
      // muaf tutuyor, çünkü bir cümlenin ortasındaki kelimeyi 44px yapmak
      // cümleyi bozar.
      const exempt = (el) => {
        if (el.tagName === 'INPUT' && /^(checkbox|radio|hidden)$/.test(el.type)) return true;
        if (el.tagName === 'A') {
          const parent = el.parentElement;
          // Satır içi: ebeveyninde bu bağlantının dışında da metin var.
          const own = (el.textContent ?? '').trim();
          const around = (parent?.textContent ?? '').trim();
          if (parent && around.length > own.length + 2) return true;
        }
        return false;
      };
      const small = tappable.filter((el) => {
        if (exempt(el)) return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && (r.height < 44 || r.width < 44);
      });

      const fields = [...document.querySelectorAll('input, select, textarea')].filter(vis);

      const main = document.querySelector('main');
      return {
        height: document.documentElement.scrollHeight,
        mainTop: main ? Math.round(main.getBoundingClientRect().top) : 0,
        tappable: tappable.length,
        small: small.length,
        smallWorst: small
          .map((el) => {
            const r = el.getBoundingClientRect();
            const name = (el.getAttribute('aria-label') ?? el.textContent ?? '')
              .trim()
              .slice(0, 30);
            return `${el.tagName.toLowerCase()}[${el.className?.toString().split(/\s+/)[0] ?? ''}] ${Math.round(r.width)}x${Math.round(r.height)} "${name}"`;
          })
          .slice(0, 3),
        smallFieldList: fields
          .filter(
            (el) =>
              !/^(checkbox|radio|hidden)$/.test(el.type ?? '') &&
              parseFloat(getComputedStyle(el).fontSize) < 16,
          )
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}[${el.type ?? ''}] ${getComputedStyle(el).fontSize} .${el.className?.toString().split(/\s+/).slice(0, 2).join('.')}`,
          )
          .slice(0, 3),
        fields: fields.length,
        // Onay kutusu ve radyo muaf, ve sebebi CSS kuralının kendisiyle aynı:
        // iOS yalnızca METİN girilen bir alana odaklanınca yakınlaştırır. Bir
        // onay kutusunun font boyutu o davranışı tetiklemiyor, ve kural da
        // (`index.css`) onları açıkça dışarıda bırakıyor. Ölçümün kuraldan
        // farklı bir şey sayması, ikisini ayrıştırmak olurdu.
        smallFields: fields.filter(
          (el) =>
            !/^(checkbox|radio|hidden)$/.test(el.type ?? '') &&
            parseFloat(getComputedStyle(el).fontSize) < 16,
        ).length,
      };
    });
  }

  // Şeridin kendisi: her rotada duruyor, bir kez ölçmek yeter.
  await page.goto(BASE + '/meetings', { waitUntil: 'domcontentloaded' });
  await settle();
  const bannerH = await page.evaluate(() => {
    const strip = [...document.querySelectorAll('div')].find(
      (el) => el.className?.toString().includes('bg-amber-50/90') && el.getClientRects().length > 0,
    );
    return strip ? Math.round(strip.getBoundingClientRect().height) : 0;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ['/project_info', '/stakeholders', '/assistant']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await settle();
    const blocks = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return [];
      return [...main.querySelectorAll('section, [class*="rounded-xl"], [class*="grid"]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const head = el.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 28) ?? '';
          return {
            h: Math.round(r.height),
            head,
            cls:
              (el.className || '')
                .toString()
                .split(/\s+/)
                .find((c) => c.startsWith('grid')) ?? '',
          };
        })
        .filter((x) => x.h > 150)
        .sort((a, b) => b.h - a.h)
        .slice(0, 6);
    });
    console.log(`     [blok] ${route}`);
    for (const b of blocks)
      console.log(`       ${String(b.h).padStart(5)}px  ${b.cls.padEnd(10)} ${b.head}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  console.log(
    '     [telefon boy] ' +
      Object.entries(mobile)
        .sort((a, b) => b[1].height - a[1].height)
        .slice(0, 8)
        .map(([r, m]) => `${r}:${m.height}(${(m.height / 844).toFixed(1)}e)`)
        .join(' '),
  );
  const worst = (key) => Math.max(...Object.values(mobile).map((m) => m[key]));
  const over = (key, cap) =>
    Object.entries(mobile)
      .filter(([, m]) => m[key] > cap)
      .map(([route, m]) => `${route}: ${m[key]}`);

  // Körlük: tarama hiçbir şey görmezse bütün tavanlar kendiliğinden geçer.
  check(
    worst('tappable') > 10,
    'telefon taraması dokunma hedeflerini gördü',
    `en kalabalık rotada ${worst('tappable')}`,
  );
  check(bannerH > 20, 'kritik tarih şeridi telefonda bulundu', `${bannerH}px`);

  check(
    over('mainTop', MOBILE.mainTop).length === 0,
    `telefonda içerik ${MOBILE.mainTop}px'ten önce başlıyor (T15-01)`,
    over('mainTop', MOBILE.mainTop).join(', ') || `${worst('mainTop')}px`,
  );
  check(
    bannerH <= MOBILE.bannerH,
    `kritik tarih şeridi telefonda ${MOBILE.bannerH}px'i aşmıyor (T15-02)`,
    `${bannerH} / ${MOBILE.bannerH}`,
  );
  console.log(
    `     [T4-01 taban] ` +
      Object.entries(mobile)
        .filter(([, m]) => m.small > 0)
        .sort((a, b) => b[1].small - a[1].small)
        .map(([r, m]) => `${r}:${m.small}`)
        .join(' '),
  );
  for (const x of [...new Set(Object.values(mobile).flatMap((m) => m.smallWorst))])
    console.log(`     [T4-01] ${x}`);
  for (const x of [...new Set(Object.values(mobile).flatMap((m) => m.smallFieldList))])
    console.log(`     [T15-05] ${x}`);
  check(
    over('small', MOBILE.smallTargets).length === 0,
    `hiçbir rotada ${MOBILE.smallTargets}'ten fazla küçük dokunma hedefi yok (T4-01)`,
    over('small', MOBILE.smallTargets).join(', ') ||
      `en kötü ${worst('small')} · ${Object.values(mobile).flatMap((m) => m.smallWorst)[0] ?? '-'}`,
  );
  check(
    over('height', MOBILE.height).length === 0,
    `hiçbir ekran telefonda ${MOBILE.height}px'i aşmıyor (T15-04)`,
    over('height', MOBILE.height).join(', ') || `en uzun ${worst('height')}px`,
  );
  check(
    over('smallFields', MOBILE.smallFields).length === 0,
    `hiçbir rotada ${MOBILE.smallFields}'dan fazla 16px altı form alanı yok (T15-05)`,
    over('smallFields', MOBILE.smallFields).join(', ') || `en kötü ${worst('smallFields')}`,
  );
}

await browser.close();
stop();

console.log('');
if (failures > 0) {
  console.error(`${failures} populated-render check(s) failed.`);
  if (found.length > 0) {
    console.error('');
    console.error('Each line is a section that failed to render with data in it:');
    for (const line of found) console.error(`  ${line}`);
  }
  process.exit(1);
}
console.log('All populated-render checks passed.');
