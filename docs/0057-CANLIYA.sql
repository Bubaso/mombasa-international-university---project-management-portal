-- Doğrulama: bu betiğin isimlendirdiği 22 nesne, ve veritabanında
-- olup olmadıkları. Her zaman satır döndürür; "Success" ama okunacak bir şey
-- yok hâli, yapıştırmanın yarıda kesildiği anlamına gelir.
--
-- `missing` sütunu sıfırdan büyükse `examples` hangilerinin eksik olduğunu
-- söyler. Her şey yerindeyse tek bakılacak satır sondaki toplamdır.
with expected (kind, key) as (values
  ('function', 'app.can_hold_documents'),
  ('function', 'app.refuse_hold_rewrite'),
  ('function', 'app.refuse_to_lose_a_held_document'),
  ('function', 'app.stamp_hold_release'),
  ('index', 'legal_holds_case_idx'),
  ('index', 'legal_holds_one_active_per_document'),
  ('policy', 'legal_holds.legal_holds_insert'),
  ('policy', 'legal_holds.legal_holds_read'),
  ('policy', 'legal_holds.legal_holds_update'),
  ('policy', 'retention_policies.retention_policies_read'),
  ('policy', 'retention_policies.retention_policies_write'),
  ('table', 'legal_holds'),
  ('table', 'retention_policies'),
  ('trigger', 'document_vault.document_vault_respects_holds'),
  ('trigger', 'legal_holds.audit_legal_holds'),
  ('trigger', 'legal_holds.legal_holds_append_only'),
  ('trigger', 'legal_holds.legal_holds_stamp_release'),
  ('trigger', 'legal_holds.touch_legal_holds'),
  ('trigger', 'retention_policies.audit_retention_policies'),
  ('trigger', 'retention_policies.touch_retention_policies'),
  ('type', 'public.retention_disposition'),
  ('view', 'retention_due')
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




-- TOHUM SATIRI BEKLENMİYOR, ve bu kasıtlı: saklama süresi bir yönetişim
-- kararı. Aşağıdaki sorgu sıfır dönerse doğru çalışıyor demektir — dokuz
-- kategorinin dokuzu "kararı verilmedi" olarak başlıyor, ve portal bunu
-- ekranda bir kusur olarak gösteriyor (M9-13).
select count(*) as yazilmis_saklama_karari from retention_policies;

-- Ve asıl kuralın yerinde olduğu: muhafazalı bir belge silinemez. Bu sorgu
-- hiçbir şey değiştirmiyor, yalnızca kuralı kimin uyguladığını gösteriyor —
-- bir trigger VE bir yabancı anahtar kısıtı, ikisi aynı şeyi söylüyor.
select
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'document_vault' and t.tgname = 'document_vault_respects_holds') as trigger_var,
  (select confdeltype from pg_constraint
    where conrelid = 'legal_holds'::regclass and confrelid = 'document_vault'::regclass
    limit 1) as fk_silme_davranisi;
