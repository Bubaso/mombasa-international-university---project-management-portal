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
import { raiseChecks } from './raised.mjs';

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

// ---------------------------------------------------------------------------
// Paydaş ağını DİKMEK: üretilen yabancı anahtarlar hiçbir şeye işaret etmiyor
// ---------------------------------------------------------------------------
//
// `schema-rows.mjs` her uuid'i `tablo.kolon.satır`dan türetiyor, yani
// `stakeholder_relationships.from_stakeholder_id.0` ile `stakeholders.id.0`
// farklı iki değer. Bu, üreticinin işi için DOĞRU: amacı her enum değerinin
// ve her null'ın ekranda render edilmesini sağlamak, ve bunun için referans
// gerekmiyor.
//
// Ama referans TAKİP EDEN bir ekran bu kurguyla ölçülemez. M4-10'un yol
// paneli tam olarak referans takip ediyor, ve ölçüm şunu gösterdi: altı
// hedefin altısı da "sıfır halka" döndü — çünkü her paydaşın ilişki
// sorumlusu atanmış (hepsi başlangıç noktası) ve hiçbir bağ tanınan bir
// paydaşa işaret etmiyor (hiç geçilebilir kenar yok). Yani panelin kabuğu
// çiziliyordu, ZİNCİRİN KENDİSİ hiç çizilmiyordu: oklar, bağ sözcükleri,
// ters yön işareti, aradaki düğümler — hiçbiri.
//
// Tavan tam bir düğme arttı ve ben M4-10'u bitmiş sayacaktım. Bir bölüm
// eklenip hiçbir sayı değişmiyorsa, değişmeyen şey ekran değil ölçüdür.
//
// Dikiş DAR tutuldu — üç ilişki — çünkü bütün yabancı anahtarları
// yeniden bağlamak her ekranın verisini değiştirir ve bugünkü ölçümlerin
// hepsini yeniden kalibre etmeyi gerektirir. Buraya eklenen her ilişki
// kendi gerekçesini yazsın.
//
// Bağ TÜRLERİ dikilmiyor, yalnızca uçları: türler şemadan geldiği gibi
// kalıyor (altı enum değeri + bir sonraki göçün ekleyeceği değer + null
// satırı), yani kurgu hasım bağını ve tanınmayan türü de taşımaya devam
// ediyor — ikisi de yol olmamalı ve ekran bunu söylemek zorunda.
{
  const people = canned.get('stakeholders') ?? [];
  const ties = canned.get('stakeholder_relationships') ?? [];
  const logs = canned.get('stakeholder_interactions') ?? [];
  const id = (i) => people[i]?.id;

  // Tek bir kişiyle görüşülmüş olsun: başlangıç bir tane olsun ki zincirin
  // uzunluğu ölçülebilsin. Herkes başlangıçsa her yol sıfır halkadır.
  for (const row of logs) row.stakeholder_id = id(0);

  // Sorumlu yalnızca zincirin DIŞINDAKİ birine atanmış kalıyor: hem
  // "görüşme yok ama sorumlu var" hâli ekranda duruyor, hem zincirdeki
  // kimse kendi başlangıcı olmuyor.
  // 8. satır: zincirde kullanılmayan ve sorumlusu DOLU olan tek satır. İlk
  // yazışımda 9'u seçmiştim ve kapı düştü — 9, null satırı, yani sorumlusu
  // zaten boş. Kapı "bir tane olsun" diyordu ve sıfır ölçtü.
  people.forEach((row, i) => {
    row.relationship_owner = i === 8 ? row.relationship_owner : null;
  });

  // s0 → s1 → s2 → s3 zinciri, s3'ten s6'ya bir dal, s4'e TERS yönde
  // kayıtlı bir hiyerarşi bağı, ve yol olmaması gereken iki bağ.
  const wiring = [
    [0, 1], // influences
    [1, 2], // works_with
    [2, 3], // related_to
    [4, 3], // reports_to — s4'e ancak ters yönde geçilerek varılır
    [0, 5], // opposes — s5'e giden tek bağ, ve yol değil
    [3, 6], // advises
    [0, 7], // bir sonraki göçün ekleyeceği tür — yol değil
  ];
  wiring.forEach(([from, to], i) => {
    const row = ties[i];
    if (!row) return;
    row.from_stakeholder_id = id(from);
    row.to_stakeholder_id = id(to);
  });
  // Son satır (null satırı) dikilmiyor: uçları tanınmayan bir kenar, yani
  // "göremediğin birine giden bağ" hâli de kurguda duruyor.

  check(
    people.length === 10 && ties.length === 8 && logs.length === 8,
    'paydaş ağı kurgusu beklenen satır sayısında (dikiş buna bağlı)',
    `${people.length} kişi · ${ties.length} bağ · ${logs.length} görüşme`,
  );
  check(
    people.filter((r) => r.relationship_owner != null).length === 1,
    've tek bir kişiye sorumlu atanmış',
    `${people.filter((r) => r.relationship_owner != null).length}`,
  );
  check(
    ties.filter((r) => r.kind === 'opposes').length === 1 &&
      ties.some((r) => r.kind === 'a_value_a_later_migration_adds'),
    've kurgu hem hasım bağını hem tanınmayan türü taşıyor',
    ties.map((r) => r.kind).join(', '),
  );
}

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

/**
 * `current_authority()`'nin döndürdüğü şekil — ve bu uyuşmazlık 8 Ekim
 * 2026'da ölçüldü.
 *
 * Önceki hâli snake_case idi ve `roles` dizisi hiç yoktu:
 *
 *   { profile_id, role, clearance, is_internal, can_write, delegated_from }
 *
 * `fetchAuthority` ise `Array.isArray(value.roles)` sınıyor ve sağlamayan
 * cevabı **yetkisizlik** sayıyor (kasıtlı: tanınmayan bir yetki, yetki
 * değildir). Yani bu kapı boyunca `authority` null kaldı ve `/admin`'in
 * yetkiye bağlı her bölümü — denetim kaydı, kapsam, paylaşım, devir —
 * hiç render edilmedi. Ekranın yarısı "geçti" diye sayılıyordu.
 *
 * Nasıl ortaya çıktı: M1-11'in paneli eklendikten sonra `/admin`'in düğme
 * sayısı 42'den 42'ye gitti. Bir bölüm eklenip hiçbir sayı değişmiyorsa,
 * değişmeyen şey ekran değil ölçüdür.
 *
 * Alanlar artık 0005'teki `jsonb_build_object` ile birebir. Aşağıdaki
 * assertion ikisinin ayrı düşmesini yakalıyor.
 */
const AUTHORITY = {
  role: 'admin',
  roles: ['admin'],
  clearance: 'restricted',
  isInternal: true,
  isAdmin: true,
  delegations: [],
};

{
  // Mock'un alan adları göçten okunuyor, elle yazılan bir listeden değil.
  const source = readFileSync(
    join(root, 'supabase', 'migrations', '0005_effective_authority.sql'),
    'utf8',
  );
  const body = source.slice(
    source.indexOf('create or replace function public.current_authority()'),
  );
  const keys = [...body.slice(0, body.indexOf('$$;')).matchAll(/'([a-zA-Z]+)',/g)].map((m) => m[1]);
  const named = [...new Set(keys)].filter((k) =>
    ['role', 'roles', 'clearance', 'isInternal', 'isAdmin', 'delegations'].includes(k),
  );
  check(named.length === 6, 'current_authority alanları göçten okundu', named.join(', '));
  const missing = named.filter((k) => !(k in AUTHORITY));
  check(
    missing.length === 0,
    'sahte yetki, veritabanının döndürdüğü her alanı taşıyor',
    missing.length ? `eksik: ${missing.join(', ')}` : `${named.length} alan`,
  );
}

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

  // YETKİ, YAZMA MUHAFIZINDAN ÖNCE. Bu sıra 8 Ekim 2026'da düzeltildi.
  //
  // `supabase.rpc()` bir **POST** atıyor. Muhafız önce gelince aşağıdaki
  // `current_authority` satırı ölü koddu: her çağrı `[]` alıyor,
  // `fetchAuthority` onu tanımayıp `null` döndürüyor, ve `/admin`'in yetkiye
  // bağlı her bölümü — denetim kaydı, kapsam, paylaşım, devir — hiç render
  // edilmiyordu. Ekranın yarısı "geçti" sayılıyordu.
  //
  // Nasıl ortaya çıktı: M1-11'in bölümü eklendi ve `/admin`'in düğme sayısı
  // 42'den 42'ye gitti. Bir bölüm eklenip hiçbir sayı değişmiyorsa,
  // değişmeyen şey ekran değil ölçüdür.
  if (/\/rest\/v1\/rpc\/current_authority/.test(url)) return json(AUTHORITY);

  // Yazmalar bir şey döndürmek zorunda değil; bu test okumayı ölçüyor.
  //
  // Diğer RPC okumaları (`search_records`, `translation_review`,
  // `audit_file_backlog` …) hâlâ `[]` alıyor ve bu bilinçli: onlar liste
  // döndürüyor, ve boş liste bu testin zaten sınadığı hâl. `current_authority`
  // liste değil — bir nesne — ve boş hâli "yetkisiz" demek, o yüzden ayrı.
  if (request.method() !== 'GET' && request.method() !== 'HEAD') return json([]);

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
 *
 * `/legal` 8 Ekim 2026'da 58 → **59** düğme oldu: M5-09 "Hukuk harcaması"
 * sekmesi. Bir sekme bir düğme, ve panelin kendisinde düğme yok.
 *
 * YUKARIDAKİ ÜÇ YÜKSELTME PROZA OLARAK YAZILIYDI, ŞİMDİ ÖLÇÜLÜYOR. Yazılı bir
 * gelenek ile bir kapı arasındaki fark, dördüncü yükseltmeyi kimin fark
 * edeceğidir: geleneği okumayan biri rakamı değiştirip geçer. `RAISED`
 * aşağıda her yükseltmeyi hangi gereksinim satırının kazandığıyla birlikte
 * tutuyor, ve o satırın ürün dokümanında gerçekten var olduğu sınanıyor —
 * yani "bir gereksinim gerektirdi" demek için bir gereksinim göstermek
 * gerekiyor.
 */

const DENSITY = {
  '/assistant': { buttons: 56, headings: 3, height: 2526 },
  '/': { buttons: 60, headings: 8, height: 2023 },
  '/meetings': { buttons: 58, headings: 9, height: 1767 },
  '/obligations': { buttons: 53, headings: 10, height: 1567 },
  '/risks': { buttons: 58, headings: 4, height: 1527 },
  '/plan': { buttons: 63, headings: 4, height: 1424 },
  '/reports': { buttons: 58, headings: 7, height: 1394 },
  '/legal': { buttons: 60, headings: 4, height: 1390 },
  '/stakeholders': { buttons: 52, headings: 5, height: 1356 },
  '/calendar': { buttons: 61, headings: 4, height: 1198 },
  '/governance': { buttons: 59, headings: 3, height: 1196 },
  '/readiness': { buttons: 54, headings: 4, height: 1110 },
  '/documents': { buttons: 55, headings: 2, height: 1072 },
  '/construction': { buttons: 53, headings: 2, height: 1066 },
  '/admin': { buttons: 51, headings: 6, height: 1044 },
  '/project_info': { buttons: 47, headings: 3, height: 1044 },
  '/procurement': { buttons: 57, headings: 3, height: 1044 },
  '/finance': { buttons: 49, headings: 4, height: 1044 },
  '/communication': { buttons: 83, headings: 4, height: 1044 },
};

/**
 * Yükselmiş her tavan, hangi gereksinim satırı yüzünden.
 *
 * Bu liste tavanları gevşetmiyor: `DENSITY` hâlâ tek kapı. Bu liste
 * yükseltmenin **gerekçesini** kayda bağlıyor, çünkü yazılı bir gelenek ile
 * bir kapı arasındaki fark, dördüncü yükseltmeyi kimin fark edeceğidir.
 *
 * İLK HÂLİNDE ÜÇÜNCÜ BİR KONTROL VARDI VE SAĞLAM DEĞİLDİ. "Kaydedilen değer
 * bugünkü tavanın kendisi olmalı" diye yazdım; ilk koşuda `/construction`
 * üzerinde düştü (50 ≠ 45) ve düşmesi doğruydu — ama kusur kayıtta değil
 * kontrolün varsayımındaydı. Bir rotanın tavanı yalnızca o rotanın kendi
 * yükseltmelerinin toplamı değil: `a9fa04c` (T14 Faz 3) kenar çubuğu
 * gruplarını katlayınca **on dokuz tavanın on dokuzu birden** yeniden
 * ölçüldü, ve grup açma düğmeleri her rotaya aynı anda bindi.
 * `/construction` 45 → 50 işte o toptan yeniden ölçüm; ekran ağırlaşmadığı
 * için bu listede yok, çünkü liste ekran başına bedelleri taşıyor.
 *
 * Kalan iki kontrolün sınırı da yazılı olsun: satırın **var olduğunu** sınar,
 * **doğru satır olduğunu** sınamaz. `/construction` satırını ilk yazışımda
 * T1-07 koymuştum — T1-07 var olduğu için kapı geçti, oysa o satır hukuk
 * ekranının sekmeleriyle ilgili; doğru satır T14-04. Dokümana bakıp
 * düzelttim. Bir kapı atfı doğrulayamaz, yalnızca uydurmayı yakalar.
 */
const RAISED = [
  { what: '/plan.buttons', from: 51, to: 53, row: 'T10-06' },
  { what: '/reports.buttons', from: 54, to: 57, row: 'T10-06' },
  { what: '/construction.buttons', from: 44, to: 45, row: 'T14-04' },
  { what: '/project_info.buttons', from: 43, to: 47, row: 'T15-04' },
  { what: '/legal.buttons', from: 58, to: 59, row: 'M5-09' },
  { what: '/finance.buttons', from: 48, to: 49, row: 'M8-13' },
  { what: '/stakeholders.buttons', from: 51, to: 52, row: 'M4-10' },
  { what: '/documents.buttons', from: 53, to: 55, row: 'M9-13' },
];

raiseChecks({
  raises: RAISED,
  corpus:
    readFileSync(join(root, 'docs', 'URUN-GEREKSINIMLERI.md'), 'utf8') +
    readFileSync(join(root, 'docs', 'TASARIM-GEREKSINIMLERI.md'), 'utf8'),
  knownKeys: Object.entries(DENSITY).flatMap(([route, c]) =>
    Object.keys(c).map((field) => `${route}.${field}`),
  ),
  check,
});

const density = {};
const tabsFound = {};
const tabsOpened = {};
/** Sekme turu sırasında görülen panel tutamakları, rota başına. */
const handles = {};

/**
 * Sekme olmayan görünüm anahtarları: adıyla aranıp basılacak düğmeler.
 *
 * `/stakeholders` kütüğü üç görünümde gösteriyor (liste, matris, yol) ve
 * bunlar `role="tab"` değil düğme — yani sekme turu onlara hiç uğramıyor.
 * Buraya yazılmayan bir görünümün arkasındaki panel, ÖLÇÜLMEMİŞ paneldir.
 */
const EXTRA_VIEWS = {
  '/stakeholders': ['Yol', 'Matris'],
  '/documents': ['Saklama'],
};

/**
 * DÖRDÜNCÜ YER: bir kaydın detay panelinin arkası.
 *
 * Üçüncüsü bir görünüm düğmesiydi (M4-10). M9-11'in muhafaza paneli ise bir
 * SATIRA tıklanınca açılıyor — ne ilk ekranda, ne sekmede, ne görünüm
 * düğmesinde. Satır bir düğme değil, bir `<tr onClick>`, yani ad arayan
 * mekanizma da onu bulamıyor.
 *
 * Buraya yazılmayan bir ekranın detay paneli ÖLÇÜLMEMİŞ paneldir. Liste dar
 * tutuldu: her ekranda ilk satıra tıklamak ölçülmemiş yan etkiler açar
 * (ekran uzar, istek sayısı artar) ve bu kapı on dokuz rotayı geziyor.
 */
const OPEN_FIRST_ROW = new Set(['/documents']);
/** Hangi rotada kaç düğme gerçekten basıldı: adı değişirse sayı düşer. */
const extraViews = {};
/** Yol panelinde denenen her hedef için ekranın verdiği cevap. */
const reachSaid = {};
/** Detay paneli gerçekten açıldı mı: satır bir düğme değil, bulunamayabilir. */
const detailOpened = {};
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
  const handlesSeen = handles[route] ?? (handles[route] = new Set());

  /**
   * Ekranda duran panel tutamakları.
   *
   * İLK YAZIŞIMDA YALNIZ SEKME TURUNUN İÇİNDE ÇAĞRILIYORDU ve `/obligations`
   * için sıfır döndü — o ekranda `role="tablist"` yok, yani tur gövdesi hiç
   * çalışmıyor. Açılışta bir kez, sonra her sekmede: bir panel ya ilk
   * ekranda ya bir sekmenin arkasında durur, ve ölçü ikisini de görmek
   * zorunda.
   */
  const collectHandles = async () => {
    for (const h of await page.evaluate(() => [
      ...[...document.querySelectorAll('[data-access-review]')].map(() => 'access-review'),
      ...[...document.querySelectorAll('[data-heat-bands]')].map(
        (el) => `heat:${el.getAttribute('data-heat-bands')}`,
      ),
      ...[...document.querySelectorAll('[data-reach-panel]')].map(() => 'reach-panel'),
      ...[...document.querySelectorAll('[data-reach-network]')].map(() => 'reach-network'),
      ...[...document.querySelectorAll('[data-reach-routes]')].map(
        (el) => `reach-routes:${el.getAttribute('data-reach-routes')}`,
      ),
      ...[...document.querySelectorAll('[data-reach-why]')].map(
        (el) => `reach-why:${el.getAttribute('data-reach-why')}`,
      ),
      ...[...document.querySelectorAll('[data-retention-panel]')].map(() => 'retention-panel'),
      ...[...document.querySelectorAll('[data-retention-undecided]')].map(
        (el) => `retention-undecided:${el.getAttribute('data-retention-undecided')}`,
      ),
      ...[...document.querySelectorAll('[data-retention-state]')].map(
        (el) => `retention-state:${el.getAttribute('data-retention-state')}`,
      ),
      ...[...document.querySelectorAll('[data-hold-panel]')].map(
        (el) => `hold-panel:${el.getAttribute('data-hold-panel')}`,
      ),
    ]))
      handlesSeen.add(h);
  };
  await collectHandles();

  /**
   * Yol panelinde hedef seçip zinciri ölçer (M4-10).
   *
   * Panelin KABUĞUNU görmek yeterli değil: zincir ancak bir hedef
   * seçildiğinde çiziliyor, ve asıl hata oradadır — adı null olan bir düğüm,
   * tanınmayan bir bağ türü, boş bir halka listesi. Seçim yapılmadan ölçülen
   * panel, kapağı ölçülmüş bir kutudur.
   *
   * Her hedef için İKİ CEVAPTAN BİRİ zorunlu: ya bir yol ya bir sebep. Bu,
   * CLAUDE.md §2'nin kapı hâli — "bilinmeyeni ekrana çıkar". Hiçbiri
   * çizilmiyorsa ekran sessiz kalmış demektir, ve sessizlik en kötü cevap.
   */
  const reachOutcomes = [];
  const pickReachTargets = async () => {
    const select = await page.$('[data-reach-panel] select');
    if (!select) return;
    const count = await page.evaluate(
      () => document.querySelector('[data-reach-panel] select')?.options.length ?? 0,
    );
    // İlki yer tutucu ("Seçin…"), o yüzden 1'den başlıyor. Altı hedef:
    // kurgunun her enum satırına değmeye yeter, tur da uzamaz.
    for (let i = 1; i < Math.min(count, 7); i++) {
      await select.selectOption({ index: i });
      await settle();
      for (const message of await boundaries()) seen.add(`[yol:${i}] ${message}`);
      await collectHandles();
      reachOutcomes.push(
        await page.evaluate(() => {
          const routes = document.querySelector('[data-reach-routes]');
          if (routes) {
            const lengths = [...document.querySelectorAll('[data-reach-length]')].map((el) =>
              Number(el.getAttribute('data-reach-length')),
            );
            return `yol:${routes.getAttribute('data-reach-routes')}/halka:${Math.max(0, ...lengths)}`;
          }
          const why = document.querySelector('[data-reach-why]');
          return why ? `sebep:${why.getAttribute('data-reach-why')}` : 'SESSİZ';
        }),
      );
    }
  };

  /**
   * ÜÇÜNCÜ YER: bir görünüm düğmesinin arkası.
   *
   * Tutamak toplama iki yerde çalışıyordu — açılışta ve her sekmede — ve
   * M4-10 panelini İKİSİ DE görmedi: `/stakeholders`'ta `role="tablist"` yok,
   * panel "Yol" düğmesinin arkasında. Yani "bir panel ya ilk ekranda ya bir
   * sekmenin arkasında durur" dediğim cümle eksikti; bir üçüncü yer var ve
   * ölçü onu da bilmek zorunda.
   *
   * Düğme ADIYLA aranıyor, konumla değil: `/legal` sekme turunda tam bu
   * yüzden yedi sekme sessizce atlanmıştı.
   */
  for (const label of EXTRA_VIEWS[route] ?? []) {
    const pressed = await page.evaluate((want) => {
      for (const b of document.querySelectorAll('button')) {
        if ((b.textContent ?? '').trim() === want) {
          b.click();
          return true;
        }
      }
      return false;
    }, label);
    extraViews[route] = (extraViews[route] ?? 0) + (pressed ? 1 : 0);
    if (pressed) {
      await settle();
      for (const message of await boundaries()) seen.add(`[${label}] ${message}`);
      await collectHandles();
      await pickReachTargets();
    }
  }

  if (OPEN_FIRST_ROW.has(route)) {
    // `data-record-list` İÇİNDEKİ ilk tıklanabilir öğe.
    //
    // İlk hâlinde `tbody tr` arıyordum ve hiçbir şey bulamadı: `/documents`
    // kütüğü bir TABLO DEĞİL, düğme listesi. Markup'a göre arayan bir ölçü,
    // markup değiştiğinde sessizce sıfır bulur — o yüzden kaynak hangi
    // listenin kayıt taşıdığını kendisi söylüyor.
    //
    // Önce "Kütük" görünümüne dönülüyor: yukarıdaki döngü son olarak
    // "Saklama"ya bastı, ve gizli bir öğeye programla tıklamak çalışsa da
    // kullanıcının yapabileceği bir şey olmazdı.
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if ((b.textContent ?? '').trim() === 'Kütük') {
          b.click();
          return;
        }
      }
    });
    await settle();
    const opened = await page.evaluate(() => {
      const row = document.querySelector('[data-record-list] button');
      if (!row) return false;
      row.click();
      return true;
    });
    detailOpened[route] = opened;
    if (opened) {
      await settle();
      for (const message of await boundaries()) seen.add(`[detay] ${message}`);
      await collectHandles();
    }
  }
  const lists = await page.$$('[role="tablist"]');
  const outer = lists[0] ?? null;
  const outerLabels = outer ? await labelsOf(outer) : [];
  outerLabels.forEach((l) => everSeen.add(l));

  for (const label of outerLabels) {
    if (await clickIn(outer, label)) opened.add(label);
    await collectHandles();
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
  if (reachOutcomes.length > 0) reachSaid[route] = reachOutcomes;

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
  '/legal': 18,
  '/communication': 5,
  '/procurement': 4,
  '/construction': 2,
  '/assistant': 9,
  '/readiness': 5,
  '/risks': 5,
  '/plan': 5,
  '/finance': 6,
  '/governance': 4,
  '/project_info': 4,
  '/admin': 7,
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

  // M2-11'in bantları gerçekten çiziliyor mu.
  //
  // `/obligations`'ın yoğunluk tavanı bantlar eklendikten sonra DEĞİŞMEDİ:
  // şerit `Pill` kullanıyor, yani ne düğme ne başlık. Tavanın değişmemesi
  // "render edildi" demek değil — `/admin`'de tam bu yüzden bir bölüm hiç
  // çizilmediği hâlde sayı 42'de kalmıştı. O yüzden ayrı bir tutamak.
  check(
    (handles['/obligations'] ?? new Set()).size >= 3,
    'yükümlülük bantları kaynak başına çiziliyor (M2-11)',
    `${(handles['/obligations'] ?? new Set()).size} kaynak`,
  );

  // M1-11'in paneli gerçekten çiziliyor mu.
  //
  // Yoğunluk ölçüsü yalnızca ilk ekranı sayıyor ve panel artık "Gözden
  // geçirme" sekmesinin arkasında, yani orada görünmez. 8 Ekim'de bu kontrol
  // `/admin` açılış ekranında yazılmıştı ve sekmelere geçince düştü —
  // düşmesi doğruydu: ölçünün yeri değişen panelle birlikte değişmesi
  // gerekiyordu.
  check(
    (handles['/admin'] ?? new Set()).has('access-review'),
    'erişim gözden geçirme bölümü sekmesinde çiziliyor (M1-11)',
    [...(handles['/admin'] ?? [])].join(', ') || '(görülmedi)',
  );

  // M4-10'un yol paneli gerçekten çiziliyor mu.
  //
  // Panel ne ilk ekranda ne bir sekmede: bir görünüm düğmesinin arkasında. İki
  // ayrı iddia, çünkü ikisi ayrı şekilde bozulur — düğmenin adı değişirse
  // basılan sayı düşer, panel çizilmezse tutamak gelmez. Birincisi olmadan
  // ikincisi "düğmeye hiç basmadık" diye de geçebilirdi.
  check(
    (extraViews['/stakeholders'] ?? 0) === (EXTRA_VIEWS['/stakeholders'] ?? []).length,
    'sekme olmayan görünüm düğmelerinin hepsi adıyla bulunup basıldı',
    `${extraViews['/stakeholders'] ?? 0}/${(EXTRA_VIEWS['/stakeholders'] ?? []).length}`,
  );
  check(
    (handles['/stakeholders'] ?? new Set()).has('reach-panel') &&
      (handles['/stakeholders'] ?? new Set()).has('reach-network'),
    'yol paneli ve ağ ölçüsü çiziliyor (M4-10)',
    [...(handles['/stakeholders'] ?? [])].join(', ') || '(görülmedi)',
  );

  // Ve seçilen her hedef için ekran BİR ŞEY söylüyor mu.
  //
  // İki cevaptan biri zorunlu: ya bir yol ya bir sebep. Bu, "bilinmeyeni
  // ekrana çıkar" kuralının kapı hâli — sessiz kalan bir panel, yolun
  // olmadığını değil, hesabın çalışmadığını gizler, ve ikisi ekranda aynı
  // görünür.
  // M9-11 ve M9-13'ün panelleri.
  //
  // Saklama paneli bir görünüm düğmesinin, muhafaza paneli bir SATIRIN
  // arkasında. Dört ayrı iddia, çünkü dördü ayrı şekilde bozulur: düğme
  // bulunmazsa sayı düşer, satır tıklanmazsa `detailOpened` false olur,
  // panel çizilmezse tutamak gelmez, ve kararı verilmemiş kategori sayısı
  // gelmezse ekranın en önemli satırı çizilmemiş demektir.
  const docHandles = handles['/documents'] ?? new Set();
  check(
    (extraViews['/documents'] ?? 0) === (EXTRA_VIEWS['/documents'] ?? []).length,
    'saklama görünümü düğmesi adıyla bulunup basıldı (M9-13)',
    `${extraViews['/documents'] ?? 0}/${(EXTRA_VIEWS['/documents'] ?? []).length}`,
  );
  check(
    docHandles.has('retention-panel'),
    'saklama paneli çiziliyor (M9-13)',
    [...docHandles].join(', ') || '(görülmedi)',
  );
  check(
    [...docHandles].some((h) => h.startsWith('retention-undecided:')),
    've kararı verilmemiş kategori sayısı ekranda — panelin en önemli satırı',
    [...docHandles].filter((h) => h.startsWith('retention-undecided:')).join(', ') || '(yok)',
  );
  check(
    [...docHandles].some((h) => h.startsWith('retention-state:')),
    've belgeler saklama durumuna göre bölünmüş',
    [...docHandles].filter((h) => h.startsWith('retention-state:')).join(', ') || '(yok)',
  );
  check(
    detailOpened['/documents'] === true,
    'bir belgenin detay paneli açıldı (satır bir düğme değil)',
    String(detailOpened['/documents']),
  );
  check(
    [...docHandles].some((h) => h.startsWith('hold-panel:')),
    've muhafaza paneli detayda çiziliyor (M9-11)',
    [...docHandles].filter((h) => h.startsWith('hold-panel:')).join(', ') || '(görülmedi)',
  );

  const said = reachSaid['/stakeholders'] ?? [];
  check(said.length > 0, 'yol panelinde hedef seçilebildi (M4-10)', `${said.length} hedef`);
  check(
    said.length > 0 && said.every((x) => x !== 'SESSİZ'),
    'seçilen her hedef için ya bir yol ya bir sebep yazıldı, sessizlik yok',
    said.join(' · ') || '(hiç seçilmedi)',
  );

  // VE ZİNCİRİN DERİNLİĞİ. Yukarıdaki kontrol "ekran bir şey söylüyor" diyor
  // ve bu, "zincir çiziliyor"dan zayıf: dikişin zincirini kopardım, her hedef
  // yine ya bir yol ya bir sebep aldı, ve kapı sustu. Sıfır halkalı bir yol
  // yalnızca başlangıç düğümünü çizer — oklar, bağ sözcükleri, ters yön
  // işareti ve aradaki düğümler hiç render edilmez.
  //
  // İki uçlu bir iddia, çünkü ekranın iki ayrı hâli var ve ikisi ayrı kodla
  // çiziliyor: en az bir hedefte iki halkalı bir zincir (aradaki düğüm
  // render edilmiş), ve en az bir hedefte yol yerine sebep.
  //
  // Kesin diziyi (0·1·2·3·4·sebep) yazmıyorum: kurgunun satır sayısı şemadaki
  // enum'lara bağlı ve bir göç yeni bir kategori eklediğinde dizi kayar. Bir
  // göçle kırılan kapı, ölçtüğü şeyi değil biçimini sınıyor olur.
  const depths = said
    .filter((x) => x.startsWith('yol:'))
    .map((x) => Number(x.split('halka:')[1] ?? 0));
  check(
    Math.max(0, ...depths) >= 2,
    'zincir en az iki halkayla çiziliyor (aradaki düğümler render ediliyor)',
    `en derin zincir: ${Math.max(0, ...depths)} halka`,
  );
  check(
    said.some((x) => x.startsWith('sebep:')),
    've en az bir hedef için yol yerine sebep yazılıyor',
    said.filter((x) => x.startsWith('sebep:')).join(' · ') || '(hiç sebep yazılmadı)',
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
    // 8 EKİM 2026: İKİSİ DE ÖLÇÜM DÜZELTİLDİĞİ İÇİN YÜKSELDİ, VE T15-04 ARTIK
    // KARŞILANMIYOR. Sahte yetki düzeltilince yönetim konsolunun yetkiye bağlı
    // dört bölümü ve gösterge panelinin karar kuyruğu ilk kez render edildi:
    //
    //   /admin  toplam 1.044 → 10.743px, kurgu → 8.931px
    //   /       kurgu → 2.552px
    //   /legal  kurgu → 2.421px (kriterin altında, eski ratchet'in üstünde)
    //
    // Kriter hâlâ 2.532px ve `/admin` ile `/` onu aşıyor. Rakamları buraya
    // ölçülen hâlleriyle yazıyorum çünkü alternatif körlüğü tavan olarak
    // yazmak olurdu; `docs/TASARIM-GEREKSINIMLERI.md` T15-04'ü artık
    // karşılanmış saymıyor ve sebebini rakamla söylüyor.
    //
    // Bu bir gerileme değil bir ifşa: ekranlar dünden beri bu boydaydı,
    // ölçü onları görmüyordu.
    // T15-04 FAZ 4, 8 Ekim 2026: KRİTER KARŞILANDI VE RAKAM BURADA.
    //
    // Önceki hâli 10.743 / 8.931'di ve o rakamlar ölçünün körlüğü
    // düzeltilince ortaya çıkmıştı — ekranlar büyümedi, görünmeyen görünür
    // oldu. Bu turda `/admin` yedi sekmeye bölündü (T14-04'ün kalıbı) ve
    // kurgu 8.931 → 2.512'ye indi; kriter 2.532.
    //
    // En kötü ekran artık `/admin` değil `/`: 2.512px, kriterin 20px altında.
    // O son 20px gösterge panelinden geldi ve kesilen şey bir tekrar —
    // "Projenin nabzı" panelinin alt başlığı, hücredeki `raporlanmadı`
    // değerinin söylediğini prozada söylüyordu (T6-01 ve T13-02'nin 54
    // paragrafta kaldırdığı tür, bu panelde gözden kaçmış).
    //
    // Ölçüt rakamı kurtarmak için değiştirilmedi ve hiçbir kayıt
    // saklanmadı: sekme her bölümü koruyor, yeri değişiyor.
    height: 3273, // T15-04 toplam boy, ratchet. Ölçülen, hedef değil.
    chrome: 2512, // T15-04'ün KRİTERİ 2532 — altında (yukarıdaki not) // T15-04'ün KRİTERİ 2532 — AŞILIYOR, bkz. yukarıdaki not
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

      // Ekranın boyu, BİRİNCİL KAYIT LİSTESİ çıkarılmış hâliyle.
      //
      // Bir iş kuyruğunda kaydırmak işin kendisi: kütük turunun dersi "her
      // liste kuyruk değil" idi, ve bunun tersi de doğru — kuyruğun uzunluğu
      // kayıt sayısıdır, ekranın kurgusu değil. Bir ekranı üç telefon
      // ekranıyla sınırlamak, onuncu kaydı saklamayı gerektiriyorsa ölçü
      // yanlış ölçüdür.
      //
      // Bu yüzden iki sayı: sayfanın tamamı, ve sayfa EKSİ en uzun kayıt
      // listesi. İkincisi ekranın kendi kurgusunu ölçüyor.
      const longestList = Math.max(
        0,
        ...[...document.querySelectorAll('main ul, main ol, main tbody')]
          .filter((el) => el.getClientRects().length > 0 && el.children.length >= 3)
          .map((el) => el.getBoundingClientRect().height),
      );

      return {
        height: document.documentElement.scrollHeight,
        chrome: Math.round(document.documentElement.scrollHeight - longestList),
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

  // Belge oku panelinin içi
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/assistant', { waitUntil: 'domcontentloaded' });
  await settle();
  const inside = await page.evaluate(() => {
    const head = [...document.querySelectorAll('h2, h3')].find((h) =>
      /Belge oku|Read a document/.test(h.textContent ?? ''),
    );
    const panel = head?.closest('section') ?? head?.parentElement?.parentElement ?? null;
    if (!panel) return ['panel bulunamadı'];
    return [...panel.children]
      .flatMap((c) => [c, ...c.children])
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const t = (el.querySelector('h2,h3,h4')?.textContent ?? el.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
        return { h: Math.round(r.height), tag: el.tagName.toLowerCase(), t };
      })
      .filter((x) => x.h > 100)
      .sort((a, b) => b.h - a.h)
      .slice(0, 8)
      .map((x) => `${String(x.h).padStart(5)}px ${x.tag.padEnd(8)} ${x.t}`);
  });
  console.log('     [Belge oku içi]');
  for (const l of inside) console.log(`       ${l}`);
  const rowsInfo = await page.evaluate(() => {
    const lists = [...document.querySelectorAll('main ul, main ol')].filter(
      (el) => el.getClientRects().length > 0 && el.children.length > 0,
    );
    return lists
      .map((ul) => {
        const kids = [...ul.children].filter((c) => c.getClientRects().length > 0);
        const hs = kids.map((c) => Math.round(c.getBoundingClientRect().height));
        const chars = kids.reduce((n, c) => n + (c.textContent ?? '').trim().length, 0);
        return {
          n: kids.length,
          hs: hs.slice(0, 4),
          total: Math.round(ul.getBoundingClientRect().height),
          chars,
        };
      })
      .filter((x) => x.total > 300)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  });
  console.log('     [satırlar] (fixture verisiyle)');
  for (const r of rowsInfo)
    console.log(
      `       liste ${String(r.total).padStart(5)}px · ${r.n} satır · yükseklikler ${r.hs.join(',')} · ${r.chars} karakter`,
    );

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
    '     [kurgu boyu = sayfa - en uzun liste] ' +
      Object.entries(mobile)
        .sort((a, b) => b[1].chrome - a[1].chrome)
        .slice(0, 6)
        .map(([r, m]) => `${r}:${m.chrome}`)
        .join(' '),
  );
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

  /**
   * Telefonda 19 rotanın hepsi erişilebilir (T15-07).
   *
   * Bu kontrol 7 Ekim 2026'da eklendi ve sebebi bir boşluktu: T14-05'in
   * kontrolü `aside [data-path]` ölçüyor, yani MASAÜSTÜ kenar çubuğunu.
   * Telefonda kenar çubuğu hiç yok — gezinme alt çubuk (4 rota) artı
   * "daha fazla" sayfası. Yani T15-07'nin iddiası kapıda değildi ve bir
   * kesim bir rotayı telefondan düşürse kimse görmezdi.
   *
   * T1-05 bunu 4. dalgada ölçmüştü, ama `tests/design.mjs` içinde — o dosya
   * canlı giriş istiyor ve `verify` içinde değil. Elle koşulan bir ölçüm,
   * koşulmadığı sürece ölçüm değil.
   */
  {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await settle();
    const direct = await page.$$eval('[data-path]', (els) =>
      els.filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-path')),
    );
    // "Daha fazla" sayfasını aç: telefonda görünen menü düğmesi.
    for (const sel of ['button[aria-label*="enü"]', 'button[aria-label*="enu"]', 'header button']) {
      const btn = await page.$(sel);
      if (!btn) continue;
      const shown = await btn.evaluate((n) => n.getClientRects().length > 0);
      if (!shown) continue;
      try {
        await btn.click({ timeout: 2000 });
      } catch {
        continue;
      }
      await settle();
      if ((await page.$$('[data-path]')).length > direct.length) break;
    }
    const all = await page.$$eval('[data-path]', (els) =>
      els.filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-path')),
    );
    const reach = new Set([...direct, ...all]);
    check(
      reach.size === ROUTES.length,
      `telefonda ${ROUTES.length} rotanın hepsi erişilebilir (T15-07)`,
      `${reach.size}/${ROUTES.length}${reach.size < ROUTES.length ? ` · eksik: ${ROUTES.filter((r) => !reach.has(r)).join(', ')}` : ''}`,
    );
    check(direct.length >= 3, 'alt çubuk doğrudan rota taşıyor', `${direct.length} rota`);
  }

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
    `hiçbir ekranın toplam boyu telefonda ${MOBILE.height}px'i aşmıyor (T15-04 ratchet)`,
    over('height', MOBILE.height).join(', ') || `en uzun ${worst('height')}px`,
  );
  // T15-04'ün asıl kriteri bu: ekranın KURGUSU üç telefon ekranını aşmasın.
  // Kayıt listesinin uzunluğu kayıt sayısıdır, ekranın kurgusu değil.
  check(
    over('chrome', MOBILE.chrome).length === 0,
    `hiçbir ekranın kurgusu ${MOBILE.chrome}px'i aşmıyor (T15-04)`,
    over('chrome', MOBILE.chrome).join(', ') || `en kalabalık kurgu ${worst('chrome')}px`,
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
