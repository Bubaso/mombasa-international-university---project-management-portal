/**
 * İstemcinin yazdığı her sütun, tabloda gerçekten var mı?
 *
 * Bu sorunun cevabı bugüne kadar yalnız çalışma zamanında alınıyordu. Bir
 * yazma fonksiyonu olmayan bir sütuna değer gönderirse PostgREST onu
 * reddeder — ama bunu kullanıcı, kaydetmeye bastığında öğrenir. Migration
 * bir sütunu yeniden adlandırdığında ya da kaldırdığında hiçbir test
 * düşmüyordu; `tsc` de düşmez, çünkü nesne anahtarları serbest metindir.
 *
 * 16 teklif hedefi bunu acil hâle getirdi: onay, kütüğün kendi yazma
 * fonksiyonunu çağırıyor, ve o fonksiyonların çoğu teklif yolu açılana
 * kadar ekranda hiç kullanılmamıştı.
 *
 * Sütun listesi veritabanından geliyor, migration metninden değil. Sebebi
 * ölçüm değil okuma: 0003'ün yardımcıları sütunları `execute` ile ekliyor,
 * yani metni ayrıştıran bir araç onları göremez ve var olan sütunlara "yok"
 * der. Yanlış alarm, bu testi kapattırır.
 *
 * Usage: tests/db/run.sh içinden, tabloların JSON dökümüyle.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Give the path of the information_schema.columns dump.');
  process.exit(1);
}

/** @type {{table_name: string, column_name: string}[]} */
const rows = JSON.parse(readFileSync(dumpPath, 'utf8'));
const columns = new Map();
for (const row of rows) {
  if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
  columns.get(row.table_name).add(row.column_name);
}

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

check(columns.size > 100, 'the column dump arrived', `${columns.size} tables`);

// ---------------------------------------------------------------------------
// Her `.from('x').insert({ ... })` bloğunun anahtarları
// ---------------------------------------------------------------------------
//
// Çözülemeyen blok atlanıyor, sayılıyor ve raporlanıyor: sessizce atlanan
// bir blok, sınanmış gibi görünür. Atlananın sayısı artıyorsa test
// kapsamını kaybediyor demektir ve bu görünmeli.

const skipped = [];
const checkedBlocks = [];

/**
 * `toRow(input)` gibi bir yardımcının kurduğu sütun adları.
 *
 * Desen bu depoda iki yerde: gövde `row.<sütun> = ...` atamalarından oluşuyor
 * ve kısmi güncellemeler için alanları koşullu ekliyor. Atamaların adları
 * aranıyor, çünkü tabloya giden şey onlar.
 */
function rowBuilderKeys(source, fnName) {
  const start = source.search(new RegExp(`function\\s+${fnName}\\s*\\(`));
  if (start < 0) return [];
  const open = source.indexOf('{', start);
  const body = braced(source, open);
  if (body === null) return [];
  return [...new Set([...body.matchAll(/\browf?\.([a-z_][a-z0-9_]*)\s*=/g)].map((m) => m[1]))];
}

/** Bir `{` ile başlayan metinde eşleşen `}`'a kadar oku. */
function braced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

const files = readdirSync(join(root, 'src', 'api')).filter((n) => n.endsWith('.ts'));

for (const name of files) {
  const source = readFileSync(join(root, 'src', 'api', name), 'utf8');
  const pattern = /\.from\('([a-z0-9_]+)'\)\s*\n?\s*\.(insert|upsert)\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const table = match[1];
    const after = source.slice(match.index + match[0].length);
    const brace = after.search(/[^\s([]/);
    if (after[brace] !== '{') {
      // Nesne yerine bir yardımcı çağrılıyor olabilir: `insert(toRow(input))`.
      // İki hedef (stakeholders, meetings) tam bu yoldan yazıyor, yani onları
      // atlamak testin kapsamını tam ihtiyaç duyulan yerde daraltırdı.
      const helper = /^\s*\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(after);
      const built = helper ? rowBuilderKeys(source, helper[1]) : [];
      if (built.length > 0) {
        checkedBlocks.push({ file: name, table, keys: built, via: helper[1] });
      } else {
        skipped.push(`${name}: ${table} (${match[2]} of something that is not a literal)`);
      }
      continue;
    }
    const body = braced(after, brace);
    if (body === null) {
      skipped.push(`${name}: ${table} (unbalanced braces)`);
      continue;
    }
    if (body.includes('...')) {
      skipped.push(`${name}: ${table} (spreads another object)`);
      continue;
    }
    const keys = [...body.matchAll(/(?:^|[{,])\s*([a-z_][a-z0-9_]*)\s*:/gi)].map((m) => m[1]);
    if (keys.length === 0) {
      skipped.push(`${name}: ${table} (no keys read)`);
      continue;
    }
    checkedBlocks.push({ file: name, table, keys });
  }
}

check(checkedBlocks.length > 40, 'the writers were found', `${checkedBlocks.length} insert blocks`);

for (const block of checkedBlocks) {
  const known = columns.get(block.table);
  if (!known) {
    check(false, `${block.file} writes to ${block.table}`, 'no such table');
    continue;
  }
  const missing = block.keys.filter((key) => !known.has(key));
  check(
    missing.length === 0,
    `${block.file} → ${block.table}${block.via ? ` (via ${block.via})` : ''}: every column it writes exists`,
    missing.join(', '),
  );
}

// ---------------------------------------------------------------------------
// Teklif hedeflerinin tabloları
// ---------------------------------------------------------------------------

const { PROPOSAL_TARGETS } = await import('../supabase/functions/ai-assistant/targets.js');
for (const target of PROPOSAL_TARGETS) {
  check(
    columns.has(target.table),
    `the ${target.key} target names a table that exists`,
    target.table,
  );
}

console.log('');
if (skipped.length > 0) {
  // Bir cevap değil, kapsamın sınırı. Sayı büyürse test sessizce
  // küçülüyor demektir.
  console.log(`${skipped.length} insert block(s) could not be read:`);
  for (const line of skipped) console.log(`     ${line}`);
  console.log('');
}

if (failures > 0) {
  console.error(`${failures} column check(s) failed.`);
  process.exit(1);
}
console.log('All API column checks passed.');
