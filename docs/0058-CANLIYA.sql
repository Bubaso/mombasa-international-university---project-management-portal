-- Doğrulama: bu betiğin isimlendirdiği 24 nesne, ve veritabanında
-- olup olmadıkları. Her zaman satır döndürür; "Success" ama okunacak bir şey
-- yok hâli, yapıştırmanın yarıda kesildiği anlamına gelir.
--
-- `missing` sütunu sıfırdan büyükse `examples` hangilerinin eksik olduğunu
-- söyler. Her şey yerindeyse tek bakılacak satır sondaki toplamdır.
with expected (kind, key) as (values
  ('function', 'app.can_plan_engagement'),
  ('function', 'app.freeze_stakeholder_map'),
  ('function', 'app.stakeholder_map_payload'),
  ('index', 'engagement_plans_one_active_per_stakeholder'),
  ('index', 'engagement_plans_step_owner_idx'),
  ('index', 'stakeholder_map_snapshots_taken_idx'),
  ('policy', 'stakeholder_engagement_plans.stakeholder_engagement_plans_delete'),
  ('policy', 'stakeholder_engagement_plans.stakeholder_engagement_plans_insert'),
  ('policy', 'stakeholder_engagement_plans.stakeholder_engagement_plans_read'),
  ('policy', 'stakeholder_engagement_plans.stakeholder_engagement_plans_update'),
  ('policy', 'stakeholder_map_snapshots.stakeholder_map_snapshots_delete'),
  ('policy', 'stakeholder_map_snapshots.stakeholder_map_snapshots_insert'),
  ('policy', 'stakeholder_map_snapshots.stakeholder_map_snapshots_read'),
  ('policy', 'stakeholder_map_snapshots.stakeholder_map_snapshots_update'),
  ('table', 'stakeholder_engagement_plans'),
  ('table', 'stakeholder_map_snapshots'),
  ('trigger', 'stakeholder_engagement_plans.audit_stakeholder_engagement_plans'),
  ('trigger', 'stakeholder_engagement_plans.touch_stakeholder_engagement_plans'),
  ('trigger', 'stakeholder_map_snapshots.audit_stakeholder_map_snapshots'),
  ('trigger', 'stakeholder_map_snapshots.stakeholder_map_snapshots_frozen'),
  ('trigger', 'stakeholder_map_snapshots.touch_stakeholder_map_snapshots'),
  ('type', 'public.engagement_plan_status'),
  ('view', 'engagement_plan_board'),
  ('view', 'stakeholder_map_snapshot_index')
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


-- TOHUM SATIRI YOK, ve bu da kasıtlı: ne bir plan ne bir anlık görüntü
-- tohumlanıyor. İkisi de birinin KARARINI taşıyor — "bu paydaştan şunu
-- istiyoruz" ve "o gün harita böyleydi" — ve kimsenin vermediği bir kararı
-- kayıt gibi göstermek bu portalın kaldırdığı şeyin kendisi (CLAUDE.md §2).
--
-- Aşağıdaki iki sayı sıfır dönerse doğru: pano görebildiğiniz her paydaşı
-- "plan yok" diye gösterecek, kütük ise boş olacak. İkisi de ekranda bir
-- kusur olarak duruyor.
select
  (select count(*) from stakeholder_engagement_plans) as yazilmis_plan,
  (select count(*) from stakeholder_map_snapshots) as alinmis_anlik_goruntu;

-- VE ASIL KURALIN YERİNDE OLDUĞU: dondurulmuş bir harita kımıldamaz.
--
-- Bu sorgu hiçbir şey değiştirmiyor; tetikleyicinin gövdesinde üç damganın
-- da durduğunu gösteriyor. Üçü aynı anda olmak zorunda: tarih sunucudan
-- gelmezse geriye tarih atılabilir, rol damgalanmazsa haritanın hangi
-- yetkiyle alındığı kaybolur, harita sunucuda kopyalanmazsa istemci
-- uydurulmuş bir harita yazabilir — ve üçünün üstünde gerçek bir tarih
-- durur.
select
  position('new.created_at := now()' in pg_get_functiondef(p.oid)) > 0 as tarih_sunucudan,
  position('new.taken_as_role := app.current_role_name()' in pg_get_functiondef(p.oid)) > 0
    as rol_damgalanmis,
  position('new.payload := app.stakeholder_map_payload()' in pg_get_functiondef(p.oid)) > 0
    as harita_sunucudan,
  position('not deletable' in pg_get_functiondef(p.oid)) > 0 as silme_reddediliyor
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app' and p.proname = 'freeze_stakeholder_map';

-- Ve harita fonksiyonunun TANIMLAYICI YETKİSİYLE çalışmadığı: çalışsaydı
-- RLS'i atlar ve çağıranın göremediği paydaşları da kopyalardı, yani anlık
-- görüntü bir sızıntı aracı olurdu. `false` beklenen cevap.
select p.prosecdef as harita_tanimlayici_yetkisiyle_cal_isiyor
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app' and p.proname = 'stakeholder_map_payload';
