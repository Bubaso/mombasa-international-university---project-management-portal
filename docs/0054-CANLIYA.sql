-- Doğrulama: bu betiğin isimlendirdiği 5 nesne, ve veritabanında
-- olup olmadıkları. Her zaman satır döndürür; "Success" ama okunacak bir şey
-- yok hâli, yapıştırmanın yarıda kesildiği anlamına gelir.
--
-- `missing` sütunu sıfırdan büyükse `examples` hangilerinin eksik olduğunu
-- söyler. Her şey yerindeyse tek bakılacak satır sondaki toplamdır.
with expected (kind, key) as (values
  ('index', 'payment_vouchers_case_idx'),
  ('policy', 'payment_vouchers.payment_vouchers_insert'),
  ('policy', 'payment_vouchers.payment_vouchers_read'),
  ('policy', 'payment_vouchers.payment_vouchers_update'),
  ('view', 'legal_case_spend')
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
  coalesce(e.kind, 'undefined — total') as kind,
  count(*) as expected,
  count(f.key) as present,
  count(*) - count(f.key) as missing,
  (array_agg(e.key order by e.key) filter (where f.key is null))[1:3] as examples
from expected e
left join (select distinct kind, key from found) f
  on f.kind = e.kind and f.key = e.key
group by rollup (e.kind)
order by grouping(e.kind), e.kind;


-- Sütunun kendisi: ayrıştırıcı 'alter table ... add column' saymıyor, bu
-- yüzden ayrı soruluyor. 1 dönmesi gerekiyor.
select count(*) as legal_case_id_var
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'payment_vouchers'
   and column_name = 'legal_case_id';
