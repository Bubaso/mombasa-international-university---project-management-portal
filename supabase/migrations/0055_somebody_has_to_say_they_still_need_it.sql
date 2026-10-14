-- ---------------------------------------------------------------------------
-- Erişim gözden geçirme (M1-11)
-- ---------------------------------------------------------------------------
--
-- M1-11: "6 ayda bir yöneticiye 'bu kişiler hâlâ erişmeli mi?' listesi".
--
-- Bugün portalda erişim **verilmesi** kayıtlı (0001 davet, 0005 devir) ve
-- erişimin **süresi** kayıtlı (M1-09, `profiles.expires_at`). Kayıtlı olmayan
-- tek şey birinin dönüp bakmış olması. Süresiz bir danışman hesabı, kapanana
-- kadar açık kalır ve kimse onu kapatmaya memur değildir — çünkü bakması
-- gereken bir liste yok.
--
-- SON GİRİŞ ZAMANI BU KUYRUKTA YOK, VE SEBEBİNİ YAZIYORUM.
--
-- Bu satırı denetim dosyasına "`profiles.expires_at` ve son giriş zamanından
-- türetilen bir kuyruk" diye ben yazmıştım ve son girişin elimde olduğunu
-- varsaymıştım. Bakınca iki sebep çıktı:
--
--   `auth.users` istemcinin okuyabileceği bir tablo değil (0006 bunu zaten
--   söylüyor: atıf `profiles`'a bakar). Okumak `security definer` bir
--   fonksiyon ister ve o fonksiyonun canlıdaki davranışı buradan
--   sınanamıyor — yerel shim'de `last_sign_in_at` kolonu bile yok.
--
--   Supabase'in `last_sign_in_at`'i **token yenilemede güncellenmiyor**,
--   yalnızca yeni bir girişte. Yani portalı her gün kullanan ama oturumu
--   yenilenen biri "aylardır girmemiş" görünür. Bu sayıdan kurulan bir
--   uykuda-hesap listesi, en aktif kullanıcıları işaretler.
--
-- Onun yerine portalın **kendi** kaydı kullanılıyor: `audit_log.actor_id`.
-- Ve ne olduğu adıyla söyleniyor — `last_action_at`, "son giriş" değil
-- "portalda son kayıtlı işlem". Yalnız okuyan biri satır bırakmaz, yani
-- `null` "hiç gelmedi" demek değil "kayıtlı yazma işlemi yok" demek. Ekran
-- da bu kelimeleri kullanıyor. Ölçemediğim şeyi ölçtüğümü söylemektense,
-- ölçtüğüm şeyin adını doğru koyuyorum (CLAUDE.md §2).

-- ---------------------------------------------------------------------------
-- Kimin ne yaptığını görebilen — tek yerde
-- ---------------------------------------------------------------------------
--
-- Bu yardımcı bir rahatlık değil, kuyruğun dürüstlüğünün taşıyıcısı.
--
-- `profiles_read` politikası **giriş yapmış herkese** açık; portalın dizini o
-- ve saklanması kimseye bir şey kazandırmaz. `audit_log_read` ise dört role
-- sınırlı. Kuyruk ikisini birleştirdiği için, iki kümenin ayrı düşmesi şu
-- hatayı doğurur: satırı gören ama denetim kaydını göremeyen biri
-- `last_action_at` sütununda `null` görür ve onu "bu kişi hiçbir şey
-- yapmamış" diye okur — oysa doğru cevap "bunu göremezsin". M5-09'da aynı
-- tuzağa `money_visible` sütunuyla karşı çıkıldı; burada daha iyisi var,
-- çünkü iki kümeyi **eşitleyebiliyorum**.
--
-- Yani kuyruğu görebilen tam olarak denetim kaydını görebilendir, ve bu bir
-- tesadüf olmasın diye ikisi aynı fonksiyonu çağırıyor (CLAUDE.md §4).

create or replace function app.can_audit_people()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'audit_committee');
$$;

comment on function app.can_audit_people() is
  'Kimin ne yaptığını görebilenler: denetim kaydının ve erişim gözden geçirme '
  'kuyruğunun aynı kümesi. İkisi aynı fonksiyonu çağırıyor, çünkü ayrı '
  'düşerlerse kuyruk görünür ama denetim kaydı görünmez olur ve o zaman '
  'kuyruktaki her null "kayıt yok" ile "göremezsin" arasında belirsiz kalır.';

drop policy audit_log_read on audit_log;
create policy audit_log_read on audit_log
  for select using (app.can_audit_people());

-- ---------------------------------------------------------------------------
-- Kararın kaydı
-- ---------------------------------------------------------------------------

create type access_decision as enum (
  'kept',      -- erişim olduğu gibi kalsın
  'narrowed',  -- rol, gizlilik tavanı veya kapsam daraltıldı
  'revoked',   -- erişim kaldırıldı
  'extended'   -- bitiş tarihi ileri alındı
);

create table access_reviews (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references profiles (id) on delete cascade,
  decision access_decision not null,
  reviewed_by uuid not null references profiles (id) default auth.uid(),
  reviewed_at timestamptz not null default now(),

  -- Kararın verildiği andaki yetki. Trigger yazıyor, istemci değil — aşağıda.
  role_at_review app_role,
  clearance_at_review confidentiality,
  expiry_at_review timestamptz,

  note text,

  -- Kimse kendi erişimini onaylamaz. Güven meselesi değil: bir kişinin iki
  -- ucu olduğu bir gözden geçirme hiçbir şeye kanıt değildir (M8-05'in
  -- fiş onayında aynı gerekçe).
  constraint access_reviews_not_self check (subject_id <> reviewed_by),

  -- Bir şeyi değiştiren karar niçin değiştirdiğini söylemek zorunda.
  -- "Kalsın" gerekçe istemez; "kaldırıldı" ister.
  constraint access_reviews_change_needs_note check (
    decision = 'kept' or (note is not null and length(btrim(note)) > 0)
  ),

  -- Gelecekte bakılmış olamaz.
  --
  -- Geçmişe tarih atmak ise MÜMKÜN ve bunu kapatmıyorum, çünkü kapatmanın
  -- bedeli alanı hiç yazılamaz yapmak olurdu (geçmiş bir turu kayda geçirmek
  -- dahil). Bunun yerine `reviewed_at` bir **iddia**, `audit_log.at` ise
  -- olgu: satır eklendiğinde denetim kaydı gerçek zamanı yazıyor ve o kayıt
  -- değiştirilemez (0001). Yani geçmişe atılmış bir tarih saklanamıyor,
  -- yalnızca iki kaydı yan yana koymak gerekiyor.
  constraint access_reviews_not_in_the_future check (reviewed_at <= now())
);

create index access_reviews_subject_idx on access_reviews (subject_id, reviewed_at desc);

comment on table access_reviews is
  'M1-11. Bir erişimin hâlâ gerekli olduğuna (ya da gerekmediğine) birinin '
  'bakıp karar verdiğinin kaydı. Yalnızca eklenir: bir kararı sonradan '
  'değiştirmek, bakılmış olmanın tarihini değiştirmek olurdu.';

-- Anlık görüntü trigger'dan geliyor, istemciden değil.
--
-- `budget_remaining_at_decision` ile aynı gerekçe (0015): istemci gönderirse
-- hiç var olmamış bir yetkiyi "onaylandığı andaki hâli" diye kaydedebilir.
-- Gönderilen değer yok sayılıyor, üzerine yazılıyor.
create or replace function app.stamp_reviewed_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p profiles;
begin
  select * into p from profiles where id = new.subject_id;
  if not found then
    raise exception 'no profile to review (%)', new.subject_id
      using errcode = 'foreign_key_violation';
  end if;
  new.role_at_review := p.role;
  new.clearance_at_review := p.clearance;
  new.expiry_at_review := p.expires_at;
  return new;
end;
$$;

create trigger access_reviews_stamped before insert on access_reviews
  for each row execute function app.stamp_reviewed_authority();

create or replace function app.refuse_review_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a recorded access review is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger access_reviews_append_only before update or delete on access_reviews
  for each row execute function app.refuse_review_mutation();

create trigger access_reviews_audit after insert on access_reviews
  for each row execute function app.record_audit();

alter table access_reviews enable row level security;
alter table access_reviews force row level security;

create policy access_reviews_read on access_reviews
  for select using (app.can_audit_people());

-- Yazan küme okuyandan dar: mütevelli ve yönetici. Proje direktörü kendi
-- ekibinin erişimini onaylamanın tarafı, ve mütevelli listede olmak zorunda
-- çünkü `access_reviews_not_self` yöneticinin kendisini onaylamasını
-- engelliyor — yöneticiye kimse bakamazsa kural bir boşluk üretir.
create policy access_reviews_insert on access_reviews
  for insert with check (app.acts_as('admin', 'trustee') and reviewed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Kuyruğun kendisi
-- ---------------------------------------------------------------------------
--
-- `due_reason` tek bir sebep veriyor — ekranda okunan cümle o — ama ham
-- olgular da sütun olarak duruyor, çünkü tek sebep bir özet ve özetin
-- arkasına bakmak gerekebilir.
--
-- Sıra kasıtlı ve en güçlü ifade önce geliyor:
--
--   `never_reviewed`: kimse bu kişinin burada olması gerektiğini hiç teyit
--   etmemiş. "Altı aydan eski" demekten farklı bir cümle, ve `null` bir
--   tarihi "çok eski" saymak tam olarak bilinmeyeni bilinmiş göstermek olur.
--
--   `review_overdue`: son bakış altı aydan eski. M1-11'in kendi cadansı.
--
--   `expiring_soon`: otuz gün içinde sona eriyor, yani lapse etmeden önce bir
--   karar gerekiyor.
--
--   `expired_record_open`: süresi geçmiş. Bu bir **açık kapı değil** —
--   `app.authority()` süresi geçmiş profili zaten reddediyor (0005) — kaydın
--   derlenmesi gereken hâli. Alarm diye yazılmıyor, iş diye yazılıyor.
--
-- `revoked_but_active` ayrı duruyor ve `due_reason`'a karışmıyor: biri
-- "kaldırıldı" kaydı girmiş ama hesap hâlâ açık. Gözden geçirme kararı
-- uygulamıyor — uygulayan ekranlar zaten var (yönetim konsolu) — ve kararla
-- durumun ayrı düşmesi görülmesi gereken bir yönetişim kusuru. Karar
-- yoksa sütun `null`: soru sorulmamış, cevabı da yok.
create view access_review_queue with (security_invoker = true) as
select
  p.id as profile_id,
  p.full_name,
  p.email,
  p.role,
  p.clearance,
  p.organization,
  p.is_active,
  p.expires_at,
  p.created_at,
  (select max(a.at) from audit_log a where a.actor_id = p.id) as last_action_at,
  r.reviewed_at as last_reviewed_at,
  r.decision as last_decision,
  r.reviewed_by as last_reviewed_by,
  case
    when r.reviewed_at is null then 'never_reviewed'
    when r.reviewed_at < now() - interval '6 months' then 'review_overdue'
    when p.expires_at is not null and p.expires_at <= now() then 'expired_record_open'
    when p.expires_at is not null and p.expires_at <= now() + interval '30 days'
      then 'expiring_soon'
  end as due_reason,
  (r.decision = 'revoked' and p.is_active) as revoked_but_active
from profiles p
left join lateral (
  select ar.reviewed_at, ar.decision, ar.reviewed_by
  from access_reviews ar
  where ar.subject_id = p.id
  order by ar.reviewed_at desc
  limit 1
) r on true
-- Kuyruk dizin değil. `profiles_read` herkese açık olduğu için kısıt burada
-- duruyor: kimin gözden geçirilmesi gerektiği, kimin erişiminin kaldırıldığı
-- yönetişim malzemesi, ve bir yüklenicinin okuyacağı şey değil.
where app.can_audit_people();

comment on view access_review_queue is
  'M1-11. Altı ayda bir bakılması gereken erişimler, sebebiyle. last_action_at '
  '"son giriş" DEĞİL: portalda son kayıtlı işlem (audit_log). Yalnız okuyan '
  'biri satır bırakmaz, yani null "hiç gelmedi" değil "kayıtlı yazma işlemi '
  'yok" demektir. Kuyruğu görebilen küme audit_log''u görebilenle aynı, bu '
  'yüzden görünen bir satırdaki null hiçbir zaman "göremezsin" anlamına '
  'gelmez.';

grant select on access_review_queue to authenticated;

-- Postgres yeni fonksiyonun EXECUTE'unu PUBLIC'e veriyor ve bunu varsayılan
-- ACL ile geri alamıyorsun (ölçüm 0026). İstisnalar fonksiyonun içinde durur.
select app.reset_function_grants();
