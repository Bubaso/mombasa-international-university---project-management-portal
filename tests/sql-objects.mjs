/**
 * Yapıştırılan SQL'in doğrulamasını sınar (CLAUDE.md §3).
 *
 * Bu dosya bir ürün kuralını değil, bir **ölçüm aracını** sınıyor — ve tam
 * bunu yaptığı için burada. 2 Ekim 2026'da 0047 canlı projeye yapıştırıldı,
 * doğrulama sorgum iki sıfır döndürdü, ve o iki sıfır iki ayrı duruma
 * uyuyordu: tablo hiç oluşmamış olabilirdi, ya da oluşup politikalarını
 * almamış. Ayırt edici olmayan bir ölçüm, cevap verdiğini sanırken soruyu
 * açık bırakıyor.
 *
 * Ayrıştırıcının iki yanlış yapma yolu var ve ikisi eşit değil:
 *
 *   **Eksik beklenti.** Betiğin kurduğu bir nesneyi listeye almamak.
 *   Doğrulama o nesneyi hiç sormaz; sessiz, ama kimseyi yanlış yere
 *   göndermez.
 *
 *   **Uydurma beklenti.** Betiğin kurmadığı bir nesneyi istemek. Doğrulama
 *   "MISSING" der, insan olmayan bir sorunu kovalar. Bu ikincisi daha
 *   kötüdür ve testlerin çoğu onu kovalıyor: yorumdaki, fonksiyon
 *   gövdesindeki, düşürülmüş nesnelerin isimleri listeye girmemeli.
 *
 * Usage: npm run test:sql-objects
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { objectsIn, censusSql, stripNoise } from '../scripts/sql-objects.mjs';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

/** @param {{kind: string, key: string}[]} objects */
const keys = (objects) => objects.map((o) => `${o.kind}:${o.key}`);

// ---------------------------------------------------------------------------
// Gerçek bir migration, nesne nesne
// ---------------------------------------------------------------------------
//
// 0047 seçildi çünkü bir migration'ın kurabileceği her türden birer tane
// içeriyor: tablo, enum, iki indeks, bir fonksiyon, iki trigger, iki politika.

{
  const sql = readFileSync(join(migrationsDir, '0047_a_document_read_is_not_a_record.sql'), 'utf8');
  const found = keys(objectsIn(sql)).sort();
  const want = [
    'function:app.intake_version_belongs_to_its_document',
    'index:document_intake_by_document',
    'index:document_intake_by_version',
    'policy:document_intake.document_intake_insert',
    'policy:document_intake.document_intake_read',
    'table:document_intake',
    'trigger:document_intake.document_intake_audit',
    'trigger:document_intake.document_intake_version_matches',
    'type:public.intake_state',
  ];
  check(
    JSON.stringify(found) === JSON.stringify(want),
    '0047 is read as exactly the nine objects it creates',
    found.length === want.length ? '' : `${found.length} vs ${want.length}: ${found.join(' ')}`,
  );
}

// ---------------------------------------------------------------------------
// Uydurma beklenti üretecek her yol
// ---------------------------------------------------------------------------

// Yorumdaki bir isim, bir nesne değil. Bu depoda her migration kendi
// gerekçesini yorumda anlatıyor ve o yorumlar tablo adlarıyla dolu.
check(
  objectsIn(`-- create table the_table_we_decided_against (id uuid);\nselect 1;`).length === 0,
  'a table named only in a comment is not expected to exist',
);
check(
  objectsIn(`/* create policy p on t using (true); */\nselect 1;`).length === 0,
  'nor one inside a block comment',
);

// Fonksiyon gövdesinde `execute` ile kurulan nesne, gövdenin çalışmasına
// bağlıdır; betiğin kendisi onu isimlendirmiyor.
{
  const sql = `create or replace function app.helper(t regclass)
returns void language plpgsql as $$
begin
  execute format('create policy %s_read on %s for select using (true)', t, t);
  execute 'create index helper_idx on whatever (id)';
end;
$$;`;
  const found = keys(objectsIn(sql));
  check(
    JSON.stringify(found) === JSON.stringify(['function:app.helper']),
    'a function body names nothing but the function',
    found.join(' '),
  );
}

// Dolar-alıntı etiketli de olabilir ve içindeki `--` yorum sayılmaz.
check(
  stripNoise(`create function f() as $body$ -- create table x (id int);\n$body$;`).includes(
    'create table',
  ) === false,
  'a $tag$-quoted body is stripped like an unnamed one',
);

// Düşürülen bir nesne beklenmez. Bu depoda 0003'ün yardımcıları işleri
// bitince düşüyor; onları istemek, olmayan bir sorunu göstermek olurdu.
check(
  objectsIn(`create or replace function app.add_columns(t regclass) returns void as $$ begin end $$ language plpgsql;
drop function app.add_columns(regclass);`).length === 0,
  'a function created and then dropped is not expected',
);

// Sıra kararı verir, ve bu depoda olağan sıra budur: eskiyi düşür, yenisini
// kur. Ters çevrilirse 417 politikanın çoğu yanlış biçimde eksik görünürdü.
{
  const found = keys(
    objectsIn(`drop policy if exists t_read on t;
create policy t_read on t for select using (true);`),
  );
  check(
    JSON.stringify(found) === JSON.stringify(['policy:t.t_read']),
    'dropped and then recreated, a policy is expected again',
    found.join(' '),
  );
}
check(
  objectsIn(`create policy t_read on t for select using (true);
drop policy t_read on t;`).length === 0,
  'and created and then dropped, it is not',
);

// Bir tabloyu düşürmek üzerindeki her şeyi düşürür. Bu kuralı kaçıran ilk
// sürüm, uygulanmış ve hatasız bir veritabanında 9 politikayı "MISSING" diye
// bildirdi: 0021 `trustee_members`'ı, 0024 `deadline_notifications` ile
// `deadline_acknowledgements`'ı düşürüyor ve hiçbiri geri kurulmuyor.
// Buradaki birim testleri o hatayı bulmamıştı — tek kullanımlık Postgres
// buldu, ve assertion ondan sonra yazıldı.
{
  const found = keys(
    objectsIn(`create table gone (id int);
create policy gone_read on gone for select using (true);
create trigger gone_stamp before insert on gone for each row execute function app.stamp();
create index gone_idx on gone (id);
create table stays (id int);
create policy stays_read on stays for select using (true);
drop table if exists gone;`),
  ).sort();
  check(
    JSON.stringify(found) === JSON.stringify(['policy:stays.stays_read', 'table:stays']),
    'a dropped table takes its policies, triggers and indexes with it',
    found.join(' '),
  );
}

// Ama yalnız kendi tablosunun. Aynı adı taşıyan başka bir tablonun
// politikası etkilenmemeli.
{
  const found = keys(
    objectsIn(`create policy row_read on alpha for select using (true);
create policy row_read on beta for select using (true);
drop table alpha;`),
  );
  check(
    JSON.stringify(found) === JSON.stringify(['policy:beta.row_read']),
    'and only its own — a same-named policy on another table survives',
    found.join(' '),
  );
}

// ---------------------------------------------------------------------------
// Eksik beklenti üretecek her yol
// ---------------------------------------------------------------------------

// Politika ve trigger tabloya aittir. İki tabloda aynı isim bu depoda
// kuraldır (`*_read`), ve tablosuz bir anahtar onları tek nesneye katlardı.
{
  const found = keys(
    objectsIn(`create policy row_read on alpha for select using (true);
create policy row_read on beta for select using (true);`),
  ).sort();
  check(
    JSON.stringify(found) === JSON.stringify(['policy:alpha.row_read', 'policy:beta.row_read']),
    'the same policy name on two tables is two objects',
    found.join(' '),
  );
}

// `update of a, b on t` — olay yan tümcesindeki ilk ` on ` doğru olandır.
// Bunu kaçıran bir desen tabloyu `document_version_id` sanırdı.
{
  const found = keys(
    objectsIn(`create trigger t_guard before insert or update of a, b on the_table
  for each row execute function app.guard();`),
  );
  check(
    JSON.stringify(found) === JSON.stringify(['trigger:the_table.t_guard']),
    'a trigger on an `update of` clause still finds its table',
    found.join(' '),
  );
}

// Bu depoda kullanılan bütün yazım biçimleri.
const SHAPES = [
  ['create table if not exists t (id int);', 'table:t'],
  ['create or replace view v as select 1;', 'view:v'],
  ['create materialized view mv as select 1;', 'view:mv'],
  ["create type grant_permission as enum ('read', 'write');", 'type:public.grant_permission'],
  ['create type app.authority_t as (id uuid);', 'type:app.authority_t'],
  ['create unique index u_idx on t (a);', 'index:u_idx'],
  ['create index if not exists i_idx on t (a);', 'index:i_idx'],
];
for (const [sql, want] of SHAPES) {
  const found = keys(objectsIn(sql));
  check(found.includes(want), `recognised: ${sql.slice(0, 44)}`, found.join(' ') || 'nothing');
}

// ---------------------------------------------------------------------------
// Doğrulama sorgusunun kendisi
// ---------------------------------------------------------------------------

check(
  (() => {
    try {
      censusSql([], 'empty');
      return false;
    } catch {
      return true;
    }
  })(),
  'a census over no objects is refused — a check that cannot fail is not a check',
);

{
  const sql = censusSql([{ kind: 'table', key: "o'brien" }], 'label');
  check(
    sql.includes("'o''brien'"),
    'a quote in an object name is doubled, not left to break the SQL',
  );
  check(sql.includes('group by rollup'), 'and the query carries its total row');
}

// Sorgu her zaman satır döndürmeli: satır yokluğu artık yalnız "yapıştırma
// kesildi" demeli, "sorgu bir şey bulamadı" dememeli. `expected` bir VALUES
// listesi olduğu için satır sayısı veritabanından bağımsızdır.
{
  const sql = censusSql(
    [
      { kind: 'table', key: 'a' },
      { kind: 'policy', key: 'a.b' },
    ],
    'x',
  );
  check(
    sql.includes("('table', 'a')") && sql.includes("('policy', 'a.b')"),
    'every expected object is a literal row, so the answer cannot be empty',
  );
  check(
    !/\bfrom\s+(?!pg_|expected|found|\()/i.test(sql.replace(/--[^\n]*/g, '')),
    'and the query reads only the catalog, so it runs on a database with nothing in it',
  );
}

// ---------------------------------------------------------------------------
// Bütün yığın
// ---------------------------------------------------------------------------
//
// Sayı tutmak ayırt edici değil, ama büyüklük sırası bir şey söylüyor: 47
// migration 417 politika ve 125 tablo içeriyor. Birkaç yüz değil de birkaç
// tane bulunuyorsa ayrıştırıcı sessizce çökmüş demektir.

{
  const names = readdirSync(migrationsDir)
    .filter((n) => /^\d{4}_.*\.sql$/.test(n))
    .sort();
  const all = names.map((n) => readFileSync(join(migrationsDir, n), 'utf8')).join('\n');
  const objects = objectsIn(all);
  const byKind = {};
  for (const o of objects) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;

  check(
    objects.length > 700,
    'the whole stack parses to the right order of magnitude',
    `${objects.length} objects: ${JSON.stringify(byKind)}`,
  );

  // Düşürülmüş üç tablodan hiçbiri, ne kendisi ne de üzerindeki bir şey,
  // beklenenler arasında olmamalı. Bu üç isim ölçümden geliyor.
  for (const gone of ['trustee_members', 'deadline_notifications', 'deadline_acknowledgements']) {
    check(
      !objects.some((o) => o.key === gone || o.key.startsWith(`${gone}.`)),
      `nothing is expected of ${gone}, which the stack drops`,
      objects
        .filter((o) => o.key.startsWith(gone))
        .map((o) => `${o.kind}:${o.key}`)
        .join(' '),
    );
  }
  check((byKind.table ?? 0) > 100, 'with the tables', `${byKind.table}`);
  check((byKind.policy ?? 0) > 300, 'and the policies', `${byKind.policy}`);
  check(new Set(keys(objects)).size === objects.length, 'and nothing listed twice');

  // Bir nesne adı SQL alıntısı içinde kaçırılmamış olmalı; kaçmışsa sorgu
  // çalışmaz ve doğrulama hiç cevap vermez.
  check(
    objects.every((o) => /^[a-z0-9_.]+$/.test(o.key)),
    'and every key is a plain identifier',
    objects
      .filter((o) => !/^[a-z0-9_.]+$/.test(o.key))
      .map((o) => o.key)
      .join(' '),
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} sql-object check(s) failed.`);
  process.exit(1);
}
console.log('All sql-object checks passed.');
