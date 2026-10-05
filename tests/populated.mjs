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
 * Tavanlar ÖLÇÜLEN değerler (5 Ekim 2026, T14 Faz 1 sonrası) ve yalnızca
 * aşağı iner. Faz 2 bunları düşürmek için var: her ekran özetle açılacak,
 * detay istenince gelecek. Rakam düşmezse faz işe yaramamıştır ve bunu
 * burada göreceğiz — geçen sefer göremedik.
 */
const DENSITY = {
  '/assistant': { buttons: 55, headings: 3, height: 2351 },
  '/meetings': { buttons: 57, headings: 9, height: 1709 },
  '/obligations': { buttons: 52, headings: 10, height: 1556 },
  '/risks': { buttons: 57, headings: 4, height: 1474 },
  '/project_info': { buttons: 43, headings: 6, height: 1419 },
  '/stakeholders': { buttons: 50, headings: 5, height: 1352 },
  '/plan': { buttons: 51, headings: 4, height: 1340 },
  '/legal': { buttons: 58, headings: 4, height: 1277 },
  '/reports': { buttons: 54, headings: 7, height: 1242 },
  '/governance': { buttons: 59, headings: 3, height: 1132 },
  '/calendar': { buttons: 61, headings: 4, height: 1132 },
  '/': { buttons: 52, headings: 4, height: 1105 },
  '/readiness': { buttons: 50, headings: 4, height: 1090 },
  '/documents': { buttons: 52, headings: 2, height: 1061 },
  '/construction': { buttons: 50, headings: 2, height: 1044 },
  '/procurement': { buttons: 57, headings: 3, height: 1044 },
  '/finance': { buttons: 47, headings: 4, height: 1044 },
  '/communication': { buttons: 83, headings: 4, height: 1044 },
  '/admin': { buttons: 42, headings: 6, height: 1044 },
};
const density = {};
const tabsFound = {};
const tabsOpened = {};

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
