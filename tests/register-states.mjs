/**
 * "Bitmiş hâl" hükmü, enum'un gerçek değerlerini tam olarak bölüyor mu?
 *
 * `src/lib/registerStates.ts` her kütük durumunu ikiye ayırıyor: hâlâ ilgi
 * isteyen değerler ve işi bitmiş olanlar. O liste veritabanı hakkında bir
 * iddia ve iddiayı sınayan tek şey bu dosya.
 *
 * Neden gerekli: enum büyüdüğünde yeni değer sessizce "bekleyen" tarafa
 * düşerdi. Bir ekran o değeri geri çekmez, yani görünür kalır — zararsız gibi
 * duruyor ama hükmü kimse vermemiş olur, ve verilmemiş bir hüküm sonradan
 * verilmiş sayılır. Burada tam bölme isteniyor: `open` ve `settled` birleşimi
 * enum'un kendisi olmak zorunda, ne eksik ne fazla.
 *
 * İkinci şey: ekranların okuduğu her durum sütununun enum'u ya burada
 * hükmünü almış olmalı, ya gerekçesiyle listede durmalı. "Kimse bakmamış" ile
 * "bakıldı, gerek yok" aynı şey değil (0047'nin dersi).
 *
 * Usage: npm run test:register-states  (önce npm run test:policies)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = process.argv[2] ?? join(root, 'tests', 'db', 'schema.json');
if (!existsSync(SCHEMA)) {
  console.error(
    `No schema dump at ${SCHEMA}. It is written by tests/db/run.sh, so run ` +
      '`npm run test:policies` first (npm run verify does that for you).',
  );
  process.exit(1);
}

const dump = JSON.parse(readFileSync(SCHEMA, 'utf8'));

// --------------------------------------------------------------- the judgment
//
// Kaynak TypeScript; test düz JS. Tanım tek yerde kalsın diye dosya
// ayrıştırılıyor, ikinci bir kopyası tutulmuyor.

const source = readFileSync(join(root, 'src', 'lib', 'registerStates.ts'), 'utf8');
const body = source.slice(source.indexOf('export const REGISTER_STATES'));

/** @type {Map<string, {open: string[], settled: string[], why: string}>} */
const rules = new Map();
for (const entry of body.matchAll(
  /^ {2}(\w+): \{\s*\n\s*open: \[([^\]]*)\],\s*\n\s*settled: \[([^\]]*)\],\s*\n\s*why:([\s\S]*?)\n {2}\},/gm,
)) {
  const values = (text) => [...text.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  rules.set(entry[1], { open: values(entry[2]), settled: values(entry[3]) });
}

check(rules.size > 25, 'the judgment file parses into the rules it states', `${rules.size} enums`);

/**
 * Ekranın geri çekmeme kararı, ekran **ve** enum ile anahtarlanmış.
 *
 * Karar enum'un değil ekranın: `work_state` iki ekranda iki ayrı şey (saha
 * işleri bir kuyruk, inşaat blokları bir katalog), ve enum başına tek bir
 * hüküm ikisinden birini zorunlu olarak yanlış yapardı. Gerekçenin ne dediğine
 * bir test karar veremez; **var olduğuna** karar verebilir.
 */
const kept = new Set([...source.matchAll(/^ {2}'([^']+:[a-z_]+)':/gm)].map((m) => m[1]));
check(
  kept.size >= 5,
  'the screens that keep what is finished are listed with their reasons',
  `${kept.size}`,
);

/** İki küme aynı mı? Sıra önemsiz, eleman sayısı önemli. */
const same = (values, list) => values.size === list.length && list.every((v) => values.has(v));

// ------------------------------------------------------------------ the schema

/** @type {Map<string, string[]>} enum adı → değerleri */
const enums = new Map();
/** @type {Map<string, Set<string>>} enum adı → onu taşıyan ilişki.sütun */
const carriedBy = new Map();
for (const column of dump) {
  if (!column.enum_values) continue;
  enums.set(column.udt_name, column.enum_values);
  if (!carriedBy.has(column.udt_name)) carriedBy.set(column.udt_name, new Set());
  carriedBy.get(column.udt_name).add(`${column.table_name}.${column.column_name}`);
}

check(enums.size > 50, 'and the dump carries the enums to compare against', `${enums.size}`);

// ---------------------------------------------- her hüküm enum'u tam bölüyor

for (const [name, rule] of [...rules].sort()) {
  const values = enums.get(name);
  check(Boolean(values), `${name} is an enum the database actually has`);
  if (!values) continue;

  const classified = [...rule.open, ...rule.settled];
  const missing = values.filter((v) => !classified.includes(v));
  const invented = classified.filter((v) => !values.includes(v));
  const twice = classified.filter((v, i) => classified.indexOf(v) !== i);

  check(
    missing.length === 0,
    `${name} has a judgment for every value it can hold`,
    missing.length ? `nobody decided about ${missing.join(', ')}` : '',
  );
  check(
    invented.length === 0,
    `and judges none it cannot`,
    invented.length ? `${invented.join(', ')} is not in the enum` : '',
  );
  check(
    twice.length === 0,
    `and no value is both waiting and finished`,
    twice.length ? twice.join(', ') : '',
  );
}

// --------------------------------- ekranların okuduğu her durum enum'u hükümlü
//
// Hangi ilişkileri okuduğumuz `src/api`'den geliyor: bir ekranın hiç okumadığı
// tablonun durumu hakkında hüküm vermek, sorulmamış soruya cevap yazmaktır.

const apiDir = join(root, 'src', 'api');
const read = new Set();
for (const file of readdirSync(apiDir).filter((f) => f.endsWith('.ts'))) {
  const text = readFileSync(join(apiDir, file), 'utf8');
  for (const m of text.matchAll(/\.from\('([a-z0-9_]+)'\)/g)) read.add(m[1]);
}
check(read.size > 50, 'the api layer names the relations the screens read', `${read.size}`);

/** Durum taşıyan sütun adları. Bir kütüğün "nerede durduğu" bu adlarla yazılı. */
const STATEY = /^(state|status|outcome|disposition|stance|verdict|implementation|preparation)$/;

/**
 * Hükmü olmayanlar, gerekçesiyle.
 *
 * Bunlar ekranların okuduğu ama bölünecek bir şeyi olmayan durumlar.
 */
const NO_JUDGMENT_NEEDED = {
  confidentiality: 'Gizlilik bir iş durumu değil, bir erişim seviyesi.',
  app_role: 'Rol bir iş durumu değil.',
  delivery_state: 'Bildirim teslimi kütük değil, bir kuyruk; kendi ekranı var.',
  grant_permission: 'İzin bir iş durumu değil.',
  // M9-13. Bir saklama kararı bir iş değil, bir KURAL: bir kategoriye bir kez
  // yazılır ve orada durur. "Süresiz sakla" bitmiş bir iş değil, her belgeye
  // uygulanan bir hüküm. Bitişi olan şey politikanın bir BELGEYE uygulanmış
  // hâli, ve onun durumu `retention_due.state` — o da `tests/enum-drift.mjs`
  // içinde adlandırılmış bir birliğe bağlı (`RetentionState`), yani
  // denetimsiz kalmıyor.
  //
  // İlk hâlinde `registerStates.ts`'e boş bir hüküm yazmıştım ve kapı
  // düştü: "her değer için bir hüküm" diyordu, haklıydı. Boş bir bölme
  // hüküm değil, hükümden kaçmaktır — ve asıl cevap o enum'un bir kütük
  // durumu olmadığıydı.
  retention_disposition:
    'Bir saklama kararı bir iş değil, bir kural; bitişi olan şey onun bir belgeye uygulanmış hâli (retention_due.state).',
};

for (const [name, values] of [...enums].sort()) {
  const columns = [...(carriedBy.get(name) ?? [])];
  const onARead = columns.filter((c) => read.has(c.split('.')[0]));
  const statey = onARead.filter((c) => STATEY.test(c.split('.')[1]));
  if (statey.length === 0) continue;
  if (rules.has(name)) continue;

  const excuse = NO_JUDGMENT_NEEDED[name];
  check(
    Boolean(excuse),
    `${name}, read as a state by the screens, is either judged or listed as not needing it`,
    excuse ? `(${excuse})` : `${statey.join(', ')} → ${values.join('|')}`,
  );
}

for (const name of Object.keys(NO_JUDGMENT_NEEDED)) {
  check(enums.has(name), `${name}, which the list excuses, still exists in the database`);
}

// ------------------------------------------ hüküm kullanılıyor, tekrarlanmıyor
//
// Bir ekranın "tam olarak bu durumda mı" diye sorması meşru: ödenmeye hazır
// fişin düğmesi `approved` durumuna bakar ve bu bir hüküm tekrarı değil.
// Kusur olan, **açık/kapalı hükmünün ikinci kez yazılması** — bir dosya bir
// enum'un bütün son değerlerini satır içinde karşılaştırıyorsa o hükmü
// kendisi vermiş olur, ve iki hüküm bir gün ayrı düşer (CLAUDE.md §4).
//
// Ölçüm, 3 Ekim 2026: bu kural yazıldığında üç dosya yakalandı —
// `ActionList` (done + cancelled), `AccreditationPanel` (met +
// not_applicable), `MilestonePanel` (achieved + abandoned). Üçü de
// `isSettled`'a çevrildi.

const clientFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name) && entry.name !== 'registerStates.ts')
      clientFiles.push(path);
  }
};
walk(join(root, 'src'));
check(clientFiles.length > 100, 'the client files are there to read', `${clientFiles.length}`);

const STATE_FIELD = /\b(?:state|status|outcome)\s*(?:===|!==|==|!=)\s*'([a-z_]+)'/g;

/**
 * Aynı ifadede bütün son değerler.
 *
 * İlk hâli dosyanın herhangi bir yerinde değerleri arıyordu ve yanlış alarm
 * verdi: `AccreditationPanel` bir yerde kaçının `met` olduğunu sayıyor, başka
 * bir yerde `not_applicable` olanları kapsam dışı bırakıyor — ikisi ayrı ve
 * meşru soru, hükmün tekrarı değil. Aranan şey ikisinin **bir ifadede**
 * birleşmesi, yani `&&` ya da `||` ile bağlanmış olması. İki satıra sarılmış
 * olabileceği için pencere iki satır.
 */
const restatesIn = (text, settled) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(i, i + 2).join(' ');
    if (!/&&|\|\|/.test(window)) continue;
    const compared = new Set([...window.matchAll(STATE_FIELD)].map((m) => m[1]));
    if (settled.every((v) => compared.has(v))) return i + 1;
  }
  return null;
};

let restated = 0;
for (const [name, rule] of [...rules].sort()) {
  if (rule.settled.length < 2) continue; // tek değerli hüküm tekrarlanamaz
  for (const file of clientFiles) {
    const line = restatesIn(readFileSync(file, 'utf8'), rule.settled);
    if (line === null) continue;
    restated++;
    check(
      false,
      `${file.slice(file.indexOf('src/'))}:${line} does not restate the ${name} judgment`,
      `one expression compares against every settled value (${rule.settled.join(', ')}) — ask isSettled instead`,
    );
  }
}
check(restated === 0, 'no file decides open-or-finished for itself', `${restated} did`);

// --------------------------------------------- geri çekilmiş olan geri çekildi
//
// Hükmün var olması yetmiyor; ekranın onu kullanması gerekiyor. Her çevrilmiş
// kütük için üç şey sınanıyor: bölme doğru enum'la yapılıyor, bitmiş olanlar
// `SettledSection` içinde (yani kapalı ve sayılı), ve başlıktaki sayı bekleyeni
// sayıyor — toplamı değil.

const CONVERTED = [
  { file: 'src/components/meetings/ActionList.tsx', enumName: 'action_status' },
  { file: 'src/components/meetings/QuestionList.tsx', enumName: 'question_status' },
  { file: 'src/views/ObligationsView.tsx', enumName: 'obligation_state' },
  { file: 'src/components/money/VoucherPanel.tsx', enumName: 'voucher_state' },
  { file: 'src/components/raid/RiskList.tsx', enumName: 'risk_state' },
  { file: 'src/components/raid/IssueList.tsx', enumName: 'issue_state' },
  { file: 'src/components/legal/FilingList.tsx', enumName: 'filing_state' },
  { file: 'src/components/legal/OrderList.tsx', enumName: 'order_state' },
  { file: 'src/components/plan/MilestonePanel.tsx', enumName: 'milestone_progress' },
  { file: 'src/components/procurement/RequestPanel.tsx', enumName: 'procurement_state' },
  { file: 'src/components/site/CommercialPanel.tsx', enumName: 'valuation_state' },
  { file: 'src/components/site/CommercialPanel.tsx', enumName: 'boq_state' },
  { file: 'src/components/governance/AccreditationPanel.tsx', enumName: 'accreditation_state' },
  { file: 'src/views/MeetingsView.tsx', enumName: 'meeting_status' },
  { file: 'src/components/procurement/ContractPanel.tsx', enumName: 'contract_state' },
  { file: 'src/components/site/ProgressPanel.tsx', enumName: 'work_state' },
];

/** Listede yazılı yol gerçekten var mı? Yazım hatası testi çökertmemeli. */
const sourceOf = (file) => {
  const path = join(root, file);
  if (!existsSync(path)) {
    check(false, `${file} is a file this repository actually has`);
    return null;
  }
  return readFileSync(path, 'utf8');
};

for (const { file, enumName } of CONVERTED) {
  const text = sourceOf(file);
  if (text === null) continue;
  check(
    text.includes(`splitBySettled(`) && text.includes(`'${enumName}'`),
    `${file.slice(file.indexOf('src/'))} splits on the ${enumName} judgment`,
  );
  check(
    /<SettledSection[\s>]/.test(text),
    `and withdraws what is finished rather than listing it alongside`,
  );
  check(
    /\{waiting\.length\}|waitingOf\(items\)\.length/.test(text),
    `and counts what is waiting rather than everything`,
  );
  // Bölmenin yapılması yetmiyor; **bekleyen listesinin çizilmesi** gerekiyor.
  // Mutasyon testinde `waiting.map(row)` → `rows.map(row)` yakalanmadı:
  // bölme, SettledSection ve başlıktaki sayı yerinde kalıyor ve ekran yine
  // her şeyi bir arada gösteriyordu (CLAUDE.md §3).
  check(
    /waiting\.map\(|waitingOf\(/.test(text),
    `and draws the waiting rows, not the whole register`,
  );
}

// ------------------------------------- bölünmeyenler: gerekçe de sınanıyor
//
// Bir ekranın bölünmemesi iki şey olabilir: kimse bakmamış, ya da bakılmış ve
// bölmenin kendisi yanlış olurdu. İkisi aynı şey değil (0047). Aşağıdaki
// listedeki her ekran ikinci gruptan, ve gerekçesi hükmün kendisinde durmak
// zorunda: o enum'un `settled`'ı boş olmalı. Enum bir gün son bir değer
// kazanırsa bu test ekranı geri çağırır.

const NO_SPLIT_BY_ENUM = [
  {
    file: 'src/components/raid/AssumptionList.tsx',
    enumName: 'assumption_state',
    because: 'nothing-is-final',
  },
  {
    file: 'src/components/legal/HearingList.tsx',
    enumName: 'preparation_state',
    because: 'nothing-is-final',
  },
  // Bunlar bir kuyruk değil: biri bir karşılaştırma, biri bir aritmetik.
  // Gerekçe `KEPT_ON_SCREEN`'de, ekran **ve** enum ile anahtarlanmış — çünkü
  // karar ekranın kararı, enum'un değil.
  {
    file: 'src/components/procurement/RequestPanel.tsx',
    enumName: 'candidate_outcome',
    because: 'kept-on-purpose',
  },
  {
    file: 'src/components/procurement/ContractPanel.tsx',
    enumName: 'milestone_state',
    because: 'kept-on-purpose',
  },
  // Bir güzergâh, bir katalog ve bir arşiv seçicisi. Üçü de liste, hiçbiri
  // kuyruk değil.
  {
    file: 'src/components/governance/RoadmapPanel.tsx',
    enumName: 'stage_state',
    because: 'kept-on-purpose',
  },
  {
    file: 'src/components/governance/ProgrammePanel.tsx',
    enumName: 'programme_state',
    because: 'kept-on-purpose',
  },
  {
    file: 'src/views/ReportsView.tsx',
    enumName: 'report_state',
    because: 'kept-on-purpose',
  },
  // Aynı enum'un iki yüzü: saha görevleri kuyruk (bölündü), inşaat blokları
  // katalog. Bu çift, gerekçenin neden enum'da değil ekranda durduğunu
  // gösteren örnek.
  {
    file: 'src/views/ConstructionView.tsx',
    enumName: 'work_state',
    because: 'kept-on-purpose',
  },
];

for (const { file, enumName, because } of NO_SPLIT_BY_ENUM) {
  const rule = rules.get(enumName);
  check(Boolean(rule), `${enumName} has a judgment at all`);
  if (because === 'nothing-is-final') {
    check(
      rule?.settled.length === 0,
      `${enumName} has no finished value, which is why ${file.slice(file.indexOf('src/'))} does not split on it`,
      rule && rule.settled.length > 0
        ? `it now has ${rule.settled.join(', ')} — the screen has to be revisited`
        : '',
    );
  } else {
    // Anahtar ekranın yolundan: `src/components/a/B.tsx` → `a/B`,
    // `src/views/C.tsx` → `views/C`.
    const screen = file
      .replace(/^src\/components\//, '')
      .replace(/^src\//, '')
      .replace(/\.tsx$/, '');
    const listed = kept.has(`${screen}:${enumName}`);
    check(
      listed,
      `${screen} says why it keeps the finished ${enumName} rows on screen`,
      listed ? '' : 'KEPT_ON_SCREEN has no entry — an unexplained omission, not a decision',
    );
  }
  const text = sourceOf(file);
  if (text === null) continue;
  check(
    !text.includes(`splitBySettled(rows, '${enumName}'`),
    `and ${file.slice(file.indexOf('src/'))} does not pretend otherwise`,
  );
}

// Duruşma bitmişliğini enum söylemiyor, tarih ve kaydedilmiş sonuç söylüyor.
// Geçmiş ama sonucu yazılmamış duruşmanın "bitmiş"e düşmemesi bu turun
// dürüstlük kuralı (CLAUDE.md §2) ve ekranda bir satırla söyleniyor.
{
  const text = readFileSync(join(root, 'src/components/legal/HearingList.tsx'), 'utf8');
  check(
    /const isOver = \(h: Hearing\) => hasHappened\(h\) && hasOutcome\(h\)/.test(text),
    'a hearing counts as finished only once it has happened AND its outcome is written',
  );
  check(
    /<SettledSection[\s>]/.test(text),
    'and HearingList withdraws the finished ones all the same',
  );
  check(
    text.includes('sonucu kayıtlı değil'),
    'and says on screen that a past hearing has no outcome recorded',
  );
}

// Süresi geçmiş layiha: `late` durumu kaydedilmiş olanı da sayıyor. İlk hâli
// saymıyordu ve başlıktaki rozet, süresinin geçtiği açıkça yazılmış layihayı
// atlıyordu (ölçüm, 3 Ekim 2026).
{
  const text = readFileSync(join(root, 'src/components/legal/FilingList.tsx'), 'utf8');
  check(
    /const isLate = \(f: Filing\) =>\s*\n?\s*f\.state === 'late' \|\|/.test(text),
    'a filing whose state records that it missed its date counts as late',
  );
  check(
    // Yalnız kod: ölçümü anlatan yorum eski ifadeyi **yazıyor** ve onu kusur
    // saymak, neyi düzelttiğini yazmayı cezalandırmak olurdu.
    !/\.includes\(f\.state\)/.test(text),
    'and that question is not asked with a hand-written list of states',
  );
}

// ------------------------------------------- hükmün SQL'deki kopyaları bağlı
//
// Hüküm istemcide bir kez duruyor, ama veritabanı da aynı soruyu soruyor:
// takvim görünümü bitmiş aksiyonu listelemiyor, bildirim bitmiş işi
// kovalamıyor. O filtreler meşru — ve ikisi de **hükmün ikinci kopyası.**
//
// Ölçüm, 3 Ekim 2026: migration'larda 22 yerde, bir durum sütunu bir enum'un
// `open` ya da `settled` kümesinin tamamıyla karşılaştırılıyor. Hepsi elle
// yazılı ve hiçbiri hükmü bilmiyor; `action_status` bir değer kazansa yedi
// takvim görünümü sessizce yeni değeri dışarıda bırakırdı. Bunu yasaklamak
// yanlış olurdu (SQL'de TypeScript sabitini okuyamıyor) — yapılacak şey
// kopyayı **bağlamak**: aşağıdaki liste her birini adıyla tutuyor ve hüküm
// değiştiğinde test hangi satırların artık uyuşmadığını söylüyor. Enum
// sapmasında işe yarayan desenin aynısı.
//
// Not: 50 başka SQL listesi enum değerlerinin bir **alt kümesini** sayıyor ve
// onlar hükmün kopyası değil, kendi soruları: "henüz sunulmamış layiha",
// "bağlanmış para", "kimse hazırlanmamış". Ölçüldüler ve bırakıldılar.

const BOUND_IN_SQL = [
  {
    file: '0007_meetings_decisions_actions.sql',
    line: 779,
    enumName: 'action_status',
    side: 'open',
  },
  {
    file: '0007_meetings_decisions_actions.sql',
    line: 797,
    enumName: 'question_status',
    side: 'open',
  },
  { file: '0011_project_calendar.sql', line: 104, enumName: 'action_status', side: 'open' },
  { file: '0011_project_calendar.sql', line: 123, enumName: 'question_status', side: 'open' },
  { file: '0011_project_calendar.sql', line: 143, enumName: 'meeting_status', side: 'open' },
  { file: '0021_governance.sql', line: 483, enumName: 'action_status', side: 'settled' },
  { file: '0021_governance.sql', line: 487, enumName: 'action_status', side: 'settled' },
  { file: '0021_governance.sql', line: 923, enumName: 'stage_state', side: 'settled' },
  { file: '0022_procurement.sql', line: 352, enumName: 'procurement_state', side: 'settled' },
  { file: '0022_procurement.sql', line: 627, enumName: 'contract_state', side: 'open' },
  { file: '0023_contract_calendar.sql', line: 93, enumName: 'action_status', side: 'open' },
  { file: '0023_contract_calendar.sql', line: 112, enumName: 'question_status', side: 'open' },
  { file: '0023_contract_calendar.sql', line: 132, enumName: 'meeting_status', side: 'open' },
  { file: '0023_contract_calendar.sql', line: 174, enumName: 'contract_state', side: 'open' },
  { file: '0024_project_backbone.sql', line: 518, enumName: 'meeting_status', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 92, enumName: 'action_status', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 111, enumName: 'question_status', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 131, enumName: 'meeting_status', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 173, enumName: 'contract_state', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 203, enumName: 'meeting_status', side: 'open' },
  { file: '0025_backbone_calendar.sql', line: 207, enumName: 'milestone_progress', side: 'open' },
  {
    file: '0033_notifications_that_arrive.sql',
    line: 462,
    enumName: 'action_status',
    side: 'open',
  },
  // 0052: artık sözleşme kümesinin SQL'deki **tek** kopyası. 0022'de iki yerde
  // (görünümün WHERE'i ve bandın CASE'i) yazılacaktı; bir fonksiyona alındı.
  {
    file: '0052_a_contract_that_ended_is_still_a_contract.sql',
    line: 49,
    enumName: 'contract_state',
    side: 'open',
  },
];

/** Bir SQL satırındaki `... in ('a', 'b')` değerleri. */
const LIST = /(\w+)\s+(?:not\s+)?in\s*\(((?:\s*'[a-z_]+'\s*,?)+)\)/gi;

/**
 * Yorumu kes.
 *
 * Ölçüm: 0052 bu kuralı iki kez tetikledi — biri fonksiyonun gövdesi (gerçek
 * kopya), biri 0022'nin eski WHERE'ini **anlatan** yorum. Bir yorum hiçbir
 * satırı süzmüyor, ve neyi düzelttiğini yazmayı kusur saymak yanlış olurdu;
 * aynı hata `FilingList`'te de olmuştu. Dize içindeki `--` kesilmiyor, çünkü
 * orada yorum başlamıyor.
 */
const withoutComment = (line) => {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") inString = !inString;
    else if (!inString && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
};

const migrations = join(root, 'supabase', 'migrations');
/** @type {Map<string, {enumName: string, side: string, values: Set<string>}>} */
const foundInSql = new Map();
for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql'))) {
  const text = readFileSync(join(migrations, file), 'utf8');
  let offset = 0;
  for (const line of text.split('\n')) {
    offset++;
    for (const m of withoutComment(line).matchAll(LIST)) {
      const values = new Set([...m[2].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]));
      if (values.size < 2) continue;
      for (const [name, rule] of rules) {
        const side = same(values, rule.open)
          ? 'open'
          : same(values, rule.settled)
            ? 'settled'
            : null;
        if (!side) continue;
        foundInSql.set(`${file}:${offset}`, { enumName: name, side, values });
        break;
      }
    }
  }
}

for (const entry of BOUND_IN_SQL) {
  const key = `${entry.file}:${entry.line}`;
  const found = foundInSql.get(key);
  const ok = found != null && found.enumName === entry.enumName && found.side === entry.side;
  check(
    ok,
    `${key} still asks for exactly ${entry.enumName}.${entry.side}`,
    ok
      ? ''
      : found
        ? `it now matches ${found.enumName}.${found.side} instead`
        : 'that line no longer equals either side of the judgment — decide where the new value belongs',
  );
}

// Ve listelenmemiş bir kopya kalmasın: yeni bir migration hükmü üçüncü kez
// yazarsa bağlanmamış olur.
const unlisted = [...foundInSql.keys()].filter(
  (key) => !BOUND_IN_SQL.some((e) => `${e.file}:${e.line}` === key),
);
check(
  unlisted.length === 0,
  'every SQL copy of the judgment is bound by the list above',
  unlisted.length ? `unlisted: ${unlisted.join(', ')}` : `${BOUND_IN_SQL.length} bound`,
);

// ------------------------------------------- her kütük kaydının kökeni var mı
//
// M13-21: asistan bir belgeyi okuyup bir kütüğe kayıt açtığında, o kaydın
// dayanağı belgedeki bir cümledir. Teklif kuyruğu artık **boşalmak için**
// kurulu, yani o cümle kuyrukla birlikte gidiyor — ve gittiğinde kaydın neden
// var olduğunu söyleyen tek şey gitmiş olur. Satır kaydın yanında duruyor
// (`src/components/ui/RecordOrigin.tsx`), ve ekranın tek okumasından besleniyor
// (`useRecordOrigins`), çünkü satır başına sorgu yirmi üç ekranda yirmi üç kez
// ödenirdi.
//
// Aşağıdaki liste asistanın yazabildiği yirmi üç kütüğün her birini ekranına
// bağlıyor. `pending` olanlar henüz bağlanmadı ve sayısı kayıtlı: iş bitince
// sayı düşer, ve bağlanmış bir ekran sessizce geri alınamaz.

const ORIGIN_SCREENS = [
  { table: 'obligations', file: 'src/views/ObligationsView.tsx' },
  { table: 'chronology_entries', file: 'src/components/plan/ChronologyPanel.tsx' },
  { table: 'correspondence', file: 'src/components/comms/CorrespondencePanel.tsx' },
  { table: 'action_items', file: 'src/components/meetings/ActionList.tsx' },
  { table: 'risks', file: 'src/components/raid/RiskList.tsx' },
  { table: 'filings', file: 'src/components/legal/FilingList.tsx' },
  { table: 'legal_orders', file: 'src/components/legal/OrderList.tsx' },
  { table: 'open_questions', file: 'src/components/meetings/QuestionList.tsx' },
  { table: 'milestones', file: 'src/components/plan/MilestonePanel.tsx' },
  { table: 'issues', file: 'src/components/raid/IssueList.tsx' },
  { table: 'assumptions', file: 'src/components/raid/AssumptionList.tsx' },
  // Henüz bağlanmadı. Her biri bir ekran ve sıraya göre gidiyor.
  { table: 'hearings', file: 'src/components/legal/HearingList.tsx' },
  { table: 'meetings', file: 'src/views/MeetingsView.tsx' },
  { table: 'decisions', file: 'src/components/meetings/DecisionList.tsx' },
  { table: 'stakeholders', file: 'src/views/StakeholdersView.tsx' },
  {
    table: 'stakeholder_interactions',
    file: 'src/components/stakeholders/StakeholderDetail.tsx',
  },
  { table: 'legal_opinions', file: 'src/components/legal/CounselPanel.tsx' },
  { table: 'exhibits', file: 'src/components/legal/EvidenceList.tsx' },
  { table: 'financial_transactions', file: 'src/components/money/LedgerPanel.tsx' },
  { table: 'site_inspections', file: 'src/components/site/InspectionList.tsx' },
  {
    table: 'procurement_requests',
    file: 'src/components/procurement/RequestPanel.tsx',
  },
  { table: 'budget_lines', file: 'src/components/money/BudgetPanel.tsx' },
  { table: 'valuations', file: 'src/components/site/CommercialPanel.tsx' },
];

// Liste asistanın hedeflerinin tamamını kapsıyor mu? Hedefler
// `supabase/functions/ai-assistant/targets.js`'te ve oraya bir hedef
// eklendiğinde buraya da bir satır gerekiyor — yoksa yeni kütük köken
// satırı olmadan doğar.
const targetsSource = readFileSync(
  join(root, 'supabase', 'functions', 'ai-assistant', 'targets.js'),
  'utf8',
);
const targetTables = [...targetsSource.matchAll(/^ {4}table: '(\w+)',$/gm)].map((m) => m[1]);
check(
  targetTables.length > 20,
  'the assistant names the registers it can write to',
  `${targetTables.length}`,
);

const listed = new Set(ORIGIN_SCREENS.map((e) => e.table));
const withoutAScreen = targetTables.filter((t) => !listed.has(t));
check(
  withoutAScreen.length === 0,
  'every register the assistant can write to has a screen named for its origin line',
  withoutAScreen.length ? `missing: ${withoutAScreen.join(', ')}` : `${listed.size} listed`,
);

// Bekleyen satırların yolu da sınanıyor. İlk hâlinde altısı uydurmaydı ve
// liste bir sonraki partiyi var olmayan dosyalara yönlendirecekti: yanlış yol
// taşıyan bir liste, listesiz olmaktan kötü.
for (const entry of ORIGIN_SCREENS) {
  check(
    existsSync(join(root, entry.file)),
    `${entry.file.slice(entry.file.indexOf('src/'))} is a file this repository has`,
  );
}

for (const entry of ORIGIN_SCREENS) {
  if (entry.pending) continue;
  const text = sourceOf(entry.file);
  if (text === null) continue;
  const wired = /<RecordOrigin\s/.test(text) && text.includes('useRecordOrigins(');
  check(
    wired,
    `${entry.file.slice(entry.file.indexOf('src/'))} says where a ${entry.table} record came from`,
    wired
      ? ''
      : 'the line and the screenful read go together — one without the other is N+1 or nothing',
  );
}

// Kalanların sayısı kayıtlı: düşmesi iş, artması geri alma.
// Yirmi üçün yirmi üçü bağlandı. Sayı sıfır ve öyle kalmalı: bir hedef
// eklenip ekranı söylenmezse yukarıdaki kapsama kontrolü, bağlı bir ekran geri
// alınırsa satır kontrolü düşer.
const PENDING_TODAY = 0;
const stillPending = ORIGIN_SCREENS.filter((e) => e.pending).length;
check(
  stillPending === PENDING_TODAY,
  'the number of registers still waiting for their origin line is the number recorded',
  stillPending === PENDING_TODAY
    ? `${stillPending} of ${ORIGIN_SCREENS.length}`
    : `${stillPending} now, ${PENDING_TODAY} recorded`,
);

console.log('');
if (failures > 0) {
  console.error(`${failures} register-state check(s) failed.`);
  process.exit(1);
}
console.log('All register-state checks passed.');
