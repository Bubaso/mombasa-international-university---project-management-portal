/**
 * İstemcinin tür listeleri, veritabanı enum'ları hakkında birer **iddiadır**.
 * Bu test o iddiayı sınar (CLAUDE.md §3, §4).
 *
 * Neden var: 3 Ekim 2026'da takvim ekranı açılmıyordu. Sebep tek bir satırdı.
 * `calendar_kind` enum'ı 0011'de altı değerle doğdu; 0022 `contract`, 0024
 * `milestone` ekledi. İstemcideki `CalendarKind` altı değerde kaldı. Gevşek
 * tipli sözlükler bunu dert etmedi — ham değeri gösterdiler, çirkin ama
 * dürüst. Ama `KINDS` tipi `Record<CalendarKind, …>` olduğu için TypeScript
 * erişimin kesin bir şey döndüğüne inandı; `KINDS['milestone']` `undefined`
 * döndü ve `.icon` okunurken bütün bölüm hata sınırına düştü.
 *
 * Buradaki asıl ders tipin eksikliği değil, **ne zaman eksildiği**: göç
 * canlıya uygulandığı an veritabanı yeni değeri üretmeye başlıyor, istemci
 * ise bir sonraki deploy'da öğreniyor. Yani sapma normal çalışmanın bir
 * aşaması; ölçülmezse ekranda patlıyor.
 *
 * Bu yüzden iki şey sınanıyor:
 *
 *   1. **Eşleşen her enum tam eşleşir.** Veritabanında olup istemcide
 *      olmayan değer de, istemcide olup veritabanında olmayan değer de
 *      kusurdur. İkincisi kullanıcıya hiç gelmeyecek bir seçenek gösterir.
 *
 *   2. **Hiçbir enum sessizce denetimsiz kalmaz.** Bir enum ya bir istemci
 *      birliğine eşlenir, ya da `ISTEMCIDE_YOK` listesinde gerekçesiyle
 *      durur. Yeni bir enum ikisinde de yoksa test düşer — çünkü "kimse
 *      bakmamış" ile "bakıldı, gerek yok" aynı şey değil.
 *
 * Usage: npm run test:enum-drift
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * İsmi farklı olan eşleşmeler: veritabanı enum'ı → istemci tipi.
 *
 * İsim benzerliğine güvenmek yetmez; `app_role` ile `UserRole` aynı şeydir
 * ama hiçbir dönüştürme kuralı birini diğerine çevirmez.
 */
const ALIAS = {
  app_role: 'UserRole',
  document_action: 'DocumentActionKind',
};

/**
 * İstemcinin hiç yazmadığı enum'lar, her biri gerekçesiyle.
 *
 * Bunlar denetimsiz değil: istemci bu değerleri `Record<string, …>` tipli
 * sözlüklerden okuyor ve `noUncheckedIndexedAccess` açık olduğu için
 * derleyici her erişimde bir koruma istiyor. Yani eksik anahtar ekranı
 * düşürmez. Listeye girmeleri, "unutuldu" ile "bakıldı" arasındaki farkı
 * kayda geçirmek için.
 */
const ISTEMCIDE_YOK = {
  case_relation: 'Dava ilişkileri gevşek tipli RELATION_WORDS üzerinden okunuyor.',
  delivery_state: 'Teslimat durumu ekranda bir birlik olarak yazılmıyor.',
  suggestion_kind: 'Öneri türleri gevşek tipli KIND_WORDS üzerinden okunuyor.',
  suggestion_status: 'Öneri durumları gevşek tipli sözlükten okunuyor.',
};

// ---------------------------------------------------------------- veritabanı

/** `$$…$$` gövdeleri ve yorumlar: içlerindeki isimler tanım değil. */
const stripNoise = (sql) =>
  sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** @returns {Map<string, Set<string>>} enum adı → değerleri */
function enumsInMigrations() {
  const dir = join(root, 'supabase', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  /** @type {Map<string, Set<string>>} */
  const enums = new Map();
  for (const file of files) {
    const sql = stripNoise(readFileSync(join(dir, file), 'utf8'));
    for (const m of sql.matchAll(/create\s+type\s+(?:\w+\.)?(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi)) {
      enums.set(m[1].toLowerCase(), new Set([...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1])));
    }
    // Postgres yeni bir değeri kendi işleminde kullanmaya izin vermiyor, bu
    // yüzden bu satırlar genelde eklendiği göçten ayrı durur (0022/0023,
    // 0024/0025). Ayrı durduğu için de gözden kaçıyor.
    for (const m of sql.matchAll(
      /alter\s+type\s+(?:\w+\.)?(\w+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']*)'/gi,
    )) {
      const name = m[1].toLowerCase();
      if (!enums.has(name)) enums.set(name, new Set());
      enums.get(name).add(m[2]);
    }
    for (const m of sql.matchAll(/drop\s+type\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)/gi)) {
      enums.delete(m[1].toLowerCase());
    }
  }
  return enums;
}

// -------------------------------------------------------------------- istemci

/** Birlikleri aranacak dosyalar. Tipler bir yerde değil, kütüğünün yanında. */
const CLIENT_FILES = ['src/types/index.ts', 'src/api/intake.ts', 'src/api/proposals.ts'];

/** @returns {Map<string, {values: Set<string>, file: string}>} */
function literalUnionsInClient() {
  /** @type {Map<string, {values: Set<string>, file: string}>} */
  const unions = new Map();
  for (const file of CLIENT_FILES) {
    const ts = readFileSync(join(root, file), 'utf8');
    // Tek satırda ya da `|` ile alt alta yazılmış, yalnız dizgi değişmezleri
    // içeren birlikler. Yorumlar araya girebiliyor, çünkü bu depoda bir
    // değerin neden var olduğu değerin yanında yazıyor.
    for (const m of ts.matchAll(
      /export\s+type\s+(\w+)\s*=\s*((?:[\s|]*(?:'[^']*'|\/\*\*[\s\S]*?\*\/|\/\/[^\n]*))+)\s*;/g,
    )) {
      const body = m[2].replace(/\/\*\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
      const values = [...body.matchAll(/'([^']*)'/g)].map((x) => x[1]);
      if (values.length > 1) unions.set(m[1], { values: new Set(values), file });
    }
  }
  return unions;
}

const pascal = (snake) =>
  snake
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

// ------------------------------------------------------------------- ölçümler

const dbEnums = enumsInMigrations();
const clientUnions = literalUnionsInClient();

check(dbEnums.size > 50, 'the migrations parse into the enums they define', `${dbEnums.size}`);
check(
  clientUnions.size > 50,
  'and the client parses into the unions it declares',
  `${clientUnions.size}`,
);
check(
  dbEnums.get('calendar_kind')?.size === 8,
  'calendar_kind is read as all eight values, including the two added later',
  [...(dbEnums.get('calendar_kind') ?? [])].join('|'),
);

let paired = 0;
for (const [name, dbValues] of [...dbEnums].sort()) {
  const typeName = ALIAS[name] ?? pascal(name);
  const union = clientUnions.get(typeName);

  if (!union) {
    const reason = ISTEMCIDE_YOK[name];
    check(
      Boolean(reason),
      `${name} is either declared in the client or listed as not being there`,
      reason ? `(${reason})` : `no ${typeName} anywhere in ${CLIENT_FILES.join(', ')}`,
    );
    continue;
  }

  paired++;
  const missing = [...dbValues].filter((v) => !union.values.has(v));
  const invented = [...union.values].filter((v) => !dbValues.has(v));
  check(
    missing.length === 0,
    `${typeName} knows every value ${name} can hold`,
    missing.length ? `the database has ${missing.join(', ')} and the client does not` : '',
  );
  check(
    invented.length === 0,
    `and claims none ${name} cannot`,
    invented.length ? `the client has ${invented.join(', ')} and the database does not` : '',
  );
}

check(paired > 70, 'most enums are paired by name rather than excused', `${paired} paired`);

// Listedeki bir gerekçe, artık var olmayan bir enum'u anlatıyorsa yanıltıcıdır.
for (const name of Object.keys(ISTEMCIDE_YOK)) {
  check(dbEnums.has(name), `${name}, which the list excuses, still exists in the database`);
}
for (const [name, typeName] of Object.entries(ALIAS)) {
  check(
    dbEnums.has(name) && clientUnions.has(typeName),
    `the ${name} → ${typeName} pairing names two things that exist`,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} enum-drift check(s) failed.`);
  process.exit(1);
}
console.log('All enum-drift checks passed.');
