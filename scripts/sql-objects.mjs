/**
 * Bir migration yığınının isimlendirdiği veritabanı nesnelerini çıkarır ve
 * "bunlar orada mı" diye soran bir sorgu üretir.
 *
 * Neden var olduğu bir ölçümdür, 2 Ekim 2026: 0047 panodan yapıştırılıp
 * çalıştırıldı ve doğrulama sorgum iki sıfır döndürdü. O iki sıfır iki ayrı
 * şeye uyuyordu — tablo hiç oluşmamıştı, ya da oluşup politikalarını
 * almamıştı — ve sorgu ikisini ayırt edemiyordu. Yarım saat, hangi sorunun
 * cevaplandığını bilmeden geçti.
 *
 * Bir DDL betiği çıktı üretmez. Editör "Success" der; bu, işin bittiğini
 * değil, hata gelmediğini söyler. `count(*)` döndüren bir kuyruk sorgusu da
 * yetmiyor: sıfır, "olmadı" ile "oldu ama saydığım şey bu değildi"nin ikisine
 * de uyar. Tek ayırt edici cevap, betiğin isimlendirdiği her nesneyi tek tek
 * sormaktır — ve cevap her zaman satır döndürür, çünkü beklenen listesi
 * betiğin kendisinden geliyor ve boş olamaz.
 *
 * Ayrıştırıcı kasıtlı olarak ihtiyatlıdır: `$$ ... $$` gövdeleri atılır, yani
 * bir fonksiyonun içinde `execute` ile kurulan nesneler beklenenler arasına
 * girmez. Bu, eksik beklenti üretir — yanlış "MISSING" üretmez. İki hatanın
 * yanlış olanı ikincisidir: var olan bir şeye yok demek, insanı olmayan bir
 * sorunu kovalamaya gönderir.
 */

/** Yorumlar ve dolar-alıntılı gövdeler, ayrıştırmadan önce atılır. */
export function stripNoise(sql) {
  return (
    sql
      // $$ ... $$ ve $tag$ ... $tag$. Eşleşmeyen gruba yapılan geri başvuru
      // JS'te boş dizeyle eşleşir, yani iki biçim tek desenle kapsanıyor.
      .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)?\$[\s\S]*?\$\1\$/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
  );
}

const qualify = (schema, name) =>
  `${schema ? schema.toLowerCase() : 'public'}.${name.toLowerCase()}`;

/**
 * Tabloya ait bir nesne: anahtarı tablosunu taşır, ve tablo düşerse o da
 * düşer. İsim tek başına anahtar değil, çünkü bu depoda iki tabloda aynı
 * politika adı kuraldır (`*_read`).
 */
const owned = (table, name) => ({
  key: `${table.toLowerCase()}.${name.toLowerCase()}`,
  table: table.toLowerCase(),
});

/**
 * Her desen bir olay üretir: nesnenin türü, anahtarı, ve metindeki yeri.
 * Yer önemli: `drop policy x on t;` ile `create policy x on t;` aynı dosyada
 * yan yana durur ve hangisinin kazandığına sıra karar verir.
 */
const PATTERNS = [
  // kind, action, regex, and a builder returning the catalog key plus — for
  // the objects a table owns — the table it hangs off.
  [
    'table',
    'create',
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    (m) => m[1].toLowerCase(),
  ],
  [
    'table',
    'drop',
    /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    (m) => m[1].toLowerCase(),
  ],

  [
    'view',
    'create',
    /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    (m) => m[1].toLowerCase(),
  ],
  [
    'view',
    'drop',
    /\bdrop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    (m) => m[1].toLowerCase(),
  ],

  [
    'type',
    'create',
    /\bcreate\s+type\s+(?:([a-z0-9_]+)\.)?([a-z0-9_]+)\s+as\b/gi,
    (m) => qualify(m[1], m[2]),
  ],
  [
    'type',
    'drop',
    /\bdrop\s+type\s+(?:if\s+exists\s+)?(?:([a-z0-9_]+)\.)?([a-z0-9_]+)/gi,
    (m) => qualify(m[1], m[2]),
  ],

  [
    'function',
    'create',
    /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:([a-z0-9_]+)\.)?([a-z0-9_]+)\s*\(/gi,
    (m) => qualify(m[1], m[2]),
  ],
  [
    'function',
    'drop',
    /\bdrop\s+function\s+(?:if\s+exists\s+)?(?:([a-z0-9_]+)\.)?([a-z0-9_]+)/gi,
    (m) => qualify(m[1], m[2]),
  ],

  [
    'index',
    'create',
    /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
    (m) => ({ key: m[1].toLowerCase(), table: m[2].toLowerCase() }),
  ],
  [
    'index',
    'drop',
    /\bdrop\s+index\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    (m) => m[1].toLowerCase(),
  ],

  // Politika ve trigger tabloya aittir; ismi tek başına anahtar değil.
  [
    'policy',
    'create',
    /\bcreate\s+policy\s+([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
    (m) => owned(m[2], m[1]),
  ],
  [
    'policy',
    'drop',
    /\bdrop\s+policy\s+(?:if\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
    (m) => owned(m[2], m[1]),
  ],

  // Olay yan tümcesi ile tablo arasındaki ilk ` on ` doğru olandır:
  // `after insert or update of x, y on t` — `update of` kendi `on`'unu
  // taşımıyor.
  [
    'trigger',
    'create',
    /\bcreate\s+(?:or\s+replace\s+)?trigger\s+([a-z0-9_]+)\s+(?:before|after|instead\s+of)\b[\s\S]*?\bon\s+(?:public\.)?([a-z0-9_]+)/gi,
    (m) => owned(m[2], m[1]),
  ],
  [
    'trigger',
    'drop',
    /\bdrop\s+trigger\s+(?:if\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
    (m) => owned(m[2], m[1]),
  ],
];

/**
 * Bir SQL metninin sonunda hangi nesnelerin var olmasını beklediğini söyler.
 *
 * @param {string} sql
 * @returns {{kind: string, key: string}[]} türe ve ada göre sıralı
 */
export function objectsIn(sql) {
  const clean = stripNoise(sql);
  const events = [];
  for (const [kind, action, pattern, key] of PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      const built = key(match);
      const parts = typeof built === 'string' ? { key: built } : built;
      events.push({ at: match.index, kind, action, ...parts });
    }
  }
  events.sort((a, b) => a.at - b.at);

  const expected = new Map();
  for (const event of events) {
    const id = `${event.kind}:${event.key}`;
    if (event.action === 'create') {
      expected.set(id, { kind: event.kind, key: event.key, table: event.table });
    } else {
      expected.delete(id);
      // Bir tabloyu düşürmek üzerindeki her şeyi düşürür. Ölçüm 2 Ekim 2026:
      // 0021 `trustee_members`'ı, 0024 `deadline_notifications` ile
      // `deadline_acknowledgements`'ı düşürüyor ve hiçbiri geri kurulmuyor.
      // Bunu kaçıran ilk sürüm 9 politikayı "MISSING" diye bildirdi —
      // uygulanmış, hatasız bir veritabanında. Birim testleri bunu bulmadı;
      // tek kullanımlık Postgres buldu.
      if (event.kind === 'table') {
        for (const [otherId, other] of expected) {
          if (other.table === event.key) expected.delete(otherId);
        }
      }
    }
  }

  return [...expected.values()]
    .map(({ kind, key }) => ({ kind, key }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

/** SQL tek alıntı içinde: tek yol, iki katı. */
const literal = (value) => `'${value.replace(/'/g, "''")}'`;

/**
 * Beklenenleri katalogla karşılaştıran tek bir sorgu.
 *
 * Türe göre özet döndürür, nesne başına satır değil: tam bundle 900'den fazla
 * nesne isimlendiriyor ve tarayıcı editöründe 900 satır okunmaz. Eksik olanın
 * adı yine görünür — `examples` sütunu her tür için ilk üçünü veriyor, ki
 * "3 politika eksik" cevabı "hangileri" sorusunu açık bırakmasın.
 *
 * `rollup` toplam satırını üretiyor ve o satır yığının adını taşıyor: betiğin
 * sonuna kadar gelindiğinin kanıtı, çünkü yapıştırma yarıda kesilmişse bu
 * sorgu hiç çalışmaz ve hiç satır görünmez.
 */
export function censusSql(objects, label) {
  if (objects.length === 0)
    throw new Error('No objects to verify; refusing to write a check that cannot fail.');

  const values = objects.map((o) => `  (${literal(o.kind)}, ${literal(o.key)})`).join(',\n');

  return `-- Doğrulama: bu betiğin isimlendirdiği ${objects.length} nesne, ve veritabanında
-- olup olmadıkları. Her zaman satır döndürür; "Success" ama okunacak bir şey
-- yok hâli, yapıştırmanın yarıda kesildiği anlamına gelir.
--
-- \`missing\` sütunu sıfırdan büyükse \`examples\` hangilerinin eksik olduğunu
-- söyler. Her şey yerindeyse tek bakılacak satır sondaki toplamdır.
with expected (kind, key) as (values
${values}
),
found (kind, key) as (
  select 'table', c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  select 'view', c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  union all
  select 'index', c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('i', 'I')
  union all
  select 'type', n.nspname || '.' || t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typtype in ('e', 'c', 'd')
  union all
  select 'function', n.nspname || '.' || p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  union all
  select 'policy', c.relname || '.' || pol.polname
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
  union all
  select 'trigger', c.relname || '.' || t.tgname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
)
select
  coalesce(e.kind, ${literal(`${label} — total`)}) as kind,
  count(*) as expected,
  count(f.key) as present,
  count(*) - count(f.key) as missing,
  (array_agg(e.key order by e.key) filter (where f.key is null))[1:3] as examples
from expected e
left join (select distinct kind, key from found) f
  on f.kind = e.kind and f.key = e.key
group by rollup (e.kind)
order by grouping(e.kind), e.kind;
`;
}
