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
  /^ {2}(\w+): \{\s*\n\s*open: \[([^\]]*)\],\s*\n\s*settled: \[([^\]]*)\],\s*\n\s*why:/gm,
)) {
  const values = (text) => [...text.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  rules.set(entry[1], { open: values(entry[2]), settled: values(entry[3]) });
}

check(rules.size > 25, 'the judgment file parses into the rules it states', `${rules.size} enums`);

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

console.log('');
if (failures > 0) {
  console.error(`${failures} register-state check(s) failed.`);
  process.exit(1);
}
console.log('All register-state checks passed.');
