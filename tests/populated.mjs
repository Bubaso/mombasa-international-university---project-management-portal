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

  const rows = relation ? canned.get(relation) : null;
  if (!rows) return json([]);
  const single = (request.headers()['accept'] ?? '').includes('pgrst.object');
  return json(single ? rows[0] : rows);
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

for (const route of ROUTES) {
  pageErrors = [];
  culprits = [];
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await settle();

  const seen = new Set(await boundaries());

  // Sekmeler: ilk ekranda görünmeyen bir panel, tıklanmadan sınanmaz.
  const tabs = await page.$$('[role="tab"]');
  for (let i = 0; i < tabs.length; i++) {
    const all = await page.$$('[role="tab"]');
    const tab = all[i];
    if (!tab) break;
    const name = (await tab.textContent())?.trim().slice(0, 32) ?? `tab ${i}`;
    try {
      await tab.click({ timeout: 4000 });
    } catch {
      continue;
    }
    tabsClicked++;
    await settle();
    for (const message of await boundaries()) seen.add(`[${name}] ${message}`);
  }

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
