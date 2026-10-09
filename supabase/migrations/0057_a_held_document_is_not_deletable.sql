-- ---------------------------------------------------------------------------
-- Hukukî muhafaza ve saklama politikası (M9-11, M9-13)
-- ---------------------------------------------------------------------------
--
-- İKİSİ BİR GÖÇTE, VE SIRASI KASITLI
--
-- M9-13 bir saklama politikası istiyor: belgeler bir süre sonra arşivlenir.
-- M9-11 bir muhafaza istiyor: davaya konu belge silinemez, arşivlenemez.
-- İkincisi birincisinin istisnası, ve istisnayı kuraldan sonra yazmak
-- aradaki sürede belge kaybetmek demek. O yüzden muhafaza önce geliyor:
-- `retention_due` görünümü, muhafaza kontrolünü hesaplanırken yapıyor; yani
-- "arşivlenmeye hazır" listesi muhafazalı bir belgeyi hiç göstermiyor.
--
-- Yıkıcıyı koruyucudan önce yazmamak bir tercih değil, bir sıra.

-- ---------------------------------------------------------------------------
-- Muhafaza, kaldırılmaz — kaldırıldığı kaydedilir (M9-11)
-- ---------------------------------------------------------------------------
--
-- Bir muhafaza kaydı silinebilirse, muhafaza bir kapı değil bir öneridir:
-- silmek isteyen önce muhafazayı siler. O yüzden tablo eklemeli: bir
-- muhafaza `released_at` yazılarak kalkar, ve kalkmış bir muhafaza kaydı
-- durmaya devam eder.
--
-- Bu, kimin ne zaman neyi serbest bıraktığını da okunur kılıyor; denetim
-- kütüğü zaten yazıyor ama bir denetim kütüğünü okumak için onu okumayı
-- bilmek gerekir, oysa bu satır belgenin kendi ekranında duruyor.

create table legal_holds (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document_vault (id) on delete restrict,

  -- Muhafazanın sebebi bir dava olabilir, ama olmak zorunda değil: bir
  -- denetim ya da bir soruşturma da belgeyi dondurur. Dava bağı varsa
  -- gösteriliyor, yoksa `reason` tek başına taşıyor — ve `reason` zorunlu,
  -- çünkü sebebi yazılmamış bir muhafaza sonradan kimsenin kaldırmaya
  -- cesaret edemediği bir muhafazadır.
  legal_case_id uuid references legal_cases (id) on delete set null,
  reason text not null,

  -- `placed_at` / `placed_by` KOLONU YOK: `created_at` / `created_by` zaten
  -- aynı şeyi söylüyordu ve aynı olguyu iki kolonda tutmak, ikisinin
  -- ayrışmasını beklemek demek (CLAUDE.md §4).
  --
  -- Ve bir asimetri var, kasıtlı: KALDIRMA sunucuda damgalanıyor, KOYMA
  -- damgalanmıyor. `touch_row` şema genelinde `coalesce(new.created_by,
  -- auth.uid())` yazıyor, yani istemci `created_by` gönderebilir — bu
  -- konvansiyonu burada bozmak kuralı yine iki yere yazmak olurdu. Koymak
  -- tehlikesiz: fazladan konmuş bir muhafaza belge kaybettirmez.
  -- Kaldırmak tehlikeli, ve onun kaydı `app.stamp_hold_release()` ile
  -- sunucudan geliyor. İkisinin de gerçek kaydı `audit_log`'da, ve o
  -- istemciden yazılamıyor.
  released_at timestamptz,
  released_by uuid references profiles (id),
  released_reason text,

  constraint legal_holds_reason_not_blank check (btrim(reason) <> ''),
  -- Serbest bırakma üç şeyi birlikte ister: tarih, kim ve neden. İkisi olup
  -- biri olmayan bir kayıt, kaldırmanın gerekçesini kaybeder.
  constraint legal_holds_release_is_whole check (
    (released_at is null and released_by is null and released_reason is null)
    or (released_at is not null and btrim(coalesce(released_reason, '')) <> '')
  ),
  constraint legal_holds_release_not_before_placement check (
    released_at is null or released_at >= created_at
  ),

  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

-- `confidentiality` KOLONU YOK, ve bu bir eksiklik değil: muhafazanın
-- görünürlüğü belgenin görünürlüğü. Buraya ikinci bir gizlilik seviyesi
-- koymak, aynı kuralı iki yere yazmak olurdu ve sapan kopya her zaman
-- ikincisidir (CLAUDE.md §4). Okuma politikası `can_see_document`'e soruyor.

create trigger touch_legal_holds before insert or update on legal_holds
  for each row execute function app.touch_row();
create trigger audit_legal_holds after insert or update or delete on legal_holds
  for each row execute function app.record_audit();

-- Aynı belgeye aynı anda iki AKTİF muhafaza konmasın: ikisi de aynı şeyi
-- söyler ve biri kalkınca öbürü sessizce durmaya devam eder, yani "muhafaza
-- kaldırıldı" diyen biri yanılır. Kalkmış muhafazalar sınırsız.
create unique index legal_holds_one_active_per_document
  on legal_holds (document_id)
  where released_at is null;

create index legal_holds_case_idx on legal_holds (legal_case_id)
  where legal_case_id is not null;

-- ---------------------------------------------------------------------------
-- Muhafazayı kim koyar
-- ---------------------------------------------------------------------------
--
-- Hukukî bir fiil, yani hukuk tarafı ve yönetim. Atanmış vekil kendi
-- dosyasına muhafaza koyabiliyor (`can_keep_legal_record` o kontrolü zaten
-- yapıyor), dosyasız bir muhafaza için yönetim gerekiyor — dosyası olmayan
-- bir muhafazayı hangi dosyaya göre sınayacağımız yok.

create or replace function app.can_hold_documents(p_case uuid)
returns boolean
language sql
stable
as $$
  select case
    when p_case is null then app.acts_as('admin', 'project_director', 'trustee')
    else app.can_keep_legal_record(p_case)
  end;
$$;

alter table legal_holds enable row level security;
alter table legal_holds force row level security;

-- Okuma: muhafazayı görmek belgeyi görmekle aynı kapıdan geçiyor. Bir kurala
-- iki kopya yazmamak için `can_see_document` yeniden kullanılıyor — belgeyi
-- göremeyen biri için o belgenin muhafazalı olduğu da bir bilgi değil.
create policy legal_holds_read on legal_holds
  for select using (app.can_see_document(document_id));

create policy legal_holds_insert on legal_holds
  for insert with check (app.can_hold_documents(legal_case_id));

-- Güncelleme AÇIK ama trigger onu tek bir şeye indiriyor: serbest bırakma.
-- Politika "kim", trigger "ne" diyor, ve ikisi ayrı katman — bir politika
-- testi ikisini ayrı ayrı sınamak zorunda, çünkü RLS yetkisiz bir
-- güncellemeyi sessizce SIFIR SATIR olarak döndürüyor, hata vermiyor.
create policy legal_holds_update on legal_holds
  for update
  using (app.can_see_document(document_id) and app.can_hold_documents(legal_case_id))
  with check (app.can_hold_documents(legal_case_id));

-- Silme politikası YOK, yani kimse silemez. RLS'te politikası olmayan fiil
-- reddedilir, ve bu reddi bir trigger'la tekrar yazmak kuralı iki yere
-- yazmak olurdu.

-- ---------------------------------------------------------------------------
-- Muhafaza kaydı geriye doğru yazılamaz
-- ---------------------------------------------------------------------------

create or replace function app.refuse_hold_rewrite()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.document_id is distinct from old.document_id
    or new.legal_case_id is distinct from old.legal_case_id
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception
      'a hold records what was frozen and why; only its release may be written (M9-11)';
  end if;

  -- Kalkmış bir muhafaza yeniden kurulamaz: belge yeniden donduruluyorsa bu
  -- YENİ bir karardır ve kendi sebebini, kendi tarihini ister. Eski kaydı
  -- yeniden açmak, iki ayrı kararı tek satırda birleştirip ikisinin de
  -- tarihini kaybetmek olur.
  if old.released_at is not null and new.released_at is null then
    raise exception 'a released hold is not reopened; place a new hold instead (M9-11)';
  end if;

  return new;
end;
$$;

create trigger legal_holds_append_only
  before update on legal_holds
  for each row execute function app.refuse_hold_rewrite();

-- Serbest bırakanı istemci söylemiyor, sunucu yazıyor.
create or replace function app.stamp_hold_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.released_at is not null and old.released_at is null then
    new.released_by := auth.uid();
    new.released_at := now();
  end if;
  return new;
end;
$$;

create trigger legal_holds_stamp_release
  before update on legal_holds
  for each row execute function app.stamp_hold_release();

-- ---------------------------------------------------------------------------
-- VE ASIL KURAL: muhafazalı belge silinemez, arşivlenemez (M9-11)
-- ---------------------------------------------------------------------------
--
-- SİLME İLE ARŞİVLEME AYNI ŞEY DEĞİL, ve kural ikisine farklı davranıyor.
--
-- Arşivleme geri alınabilir: durum geri çevrilir, belge yerinde durur. O
-- yüzden arşivlemeyi yalnızca AKTİF bir muhafaza engelliyor.
--
-- Silme geri alınamaz. Bir kez muhafaza konmuş belge, mahkemenin ya da bir
-- denetçinin ilgilendiği belgedir, ve muhafaza kalktıktan sonra bile onu
-- silmek bu portalın yapmaması gereken türden bir şey. O yüzden silmeyi
-- muhafazanın VARLIĞI engelliyor, aktifliği değil.
--
-- Bunun bedeli var ve yazıyorum: bir kez dondurulmuş belge saklama
-- politikasıyla hiç temizlenemez. Bugün birkaç bin belgelik bir kütük için
-- bu bedel ucuz; ters yönde yanılmanın bedeli ise geri alınamaz.
--
-- Yabancı anahtar da `on delete restrict`, yani trigger düşse bile silme
-- reddedilir. İkisi aynı kuralı söylüyor, iki ayrı kural değil: trigger
-- okunur sebebi veriyor, kısıt zemini tutuyor.

create or replace function app.refuse_to_lose_a_held_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active int;
  v_ever int;
begin
  if tg_op = 'DELETE' then
    select count(*) into v_ever from legal_holds where document_id = old.id;
    if v_ever > 0 then
      raise exception
        'this document has been under legal hold; deletion is refused even after release (M9-11)';
    end if;
    return old;
  end if;

  -- UPDATE: yalnızca arşive GEÇİŞ engelleniyor. Arşivde duran bir belgenin
  -- başka alanlarını düzenlemek yasak değil, ve arşivden ÇIKARMAK da değil —
  -- muhafaza belgeyi dondurur, düzeltmeyi değil.
  if new.status = 'archived' and coalesce(old.status, '') <> 'archived' then
    select count(*) into v_active
      from legal_holds where document_id = new.id and released_at is null;
    if v_active > 0 then
      raise exception 'an active legal hold bars archiving this document (M9-11)';
    end if;
  end if;
  return new;
end;
$$;

create trigger document_vault_respects_holds
  before delete or update on document_vault
  for each row execute function app.refuse_to_lose_a_held_document();

-- ---------------------------------------------------------------------------
-- Saklama politikası (M9-13)
-- ---------------------------------------------------------------------------
--
-- POLİTİKASI OLMAYAN KATEGORİ, SIFIR YILLIK POLİTİKA DEĞİL.
--
-- Her kategoriye bir varsayılan vermek kolaydı ve yanlış olurdu: kimsenin
-- karar vermediği bir saklama süresi, karar verilmiş gibi görünür ve o
-- süre dolduğunda belge arşive gider. Politikası olmayan kategori
-- `retention_due` görünümünde `no_policy` diye duruyor — bir kusur olarak,
-- yani birinin önüne konmuş bir soru olarak (CLAUDE.md §2).

create type retention_disposition as enum (
  -- Süresiz saklanır. Vakıf senedi, mahkeme kararı.
  'keep_forever',
  -- Süre sonunda arşivlenir. Arşiv silme değil: belge durur, listeden çıkar.
  'archive_after',
  -- Süre sonunda bir insan bakar. Ne saklanacağı ne atılacağı belli değilse
  -- doğru cevap budur, ve "karar verilmedi"den farkı var: bu, kararın
  -- zamanını kaydeden bir karardır.
  'review_after'
);

create table retention_policies (
  id uuid primary key default gen_random_uuid(),
  category document_category not null unique,
  disposition retention_disposition not null,

  -- `keep_forever` için null, diğerleri için zorunlu. Sıfır yıl kabul
  -- edilmiyor: "yüklendiği an arşivle" bir saklama politikası değil, bir
  -- hata.
  after_years int,

  note text,

  constraint retention_policies_years_match_disposition check (
    (disposition = 'keep_forever' and after_years is null)
    or (disposition <> 'keep_forever' and after_years is not null and after_years between 1 and 100)
  ),

  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create trigger touch_retention_policies before insert or update on retention_policies
  for each row execute function app.touch_row();
create trigger audit_retention_policies after insert or update or delete on retention_policies
  for each row execute function app.record_audit();

-- SEED SATIRI YOK, ve bu kasıtlı. Saklama süresi bir yönetişim kararı;
-- benim verdiğim bir varsayılan, kimsenin vermediği bir kararı verilmiş
-- gibi gösterir ve o süre dolduğunda belgeyi arşive yollar. Dokuz
-- kategorinin dokuzu `no_policy` olarak başlıyor — ekranda bir kusur
-- olarak, yani birinin önüne konmuş bir soru olarak.

alter table retention_policies enable row level security;
alter table retention_policies force row level security;

-- Okuma: içeriden herkes. Bir belgenin ne kadar saklandığı, o belgeyi
-- görebilen herkesin bilmesi gereken bir şey, ve kategori adından başka
-- bir şey sızdırmıyor.
create policy retention_policies_read on retention_policies
  for select using (app.is_internal());

-- Yazma: yönetim ve denetim komitesi. Saklama süresi bir yönetişim kararı,
-- bir operasyon ayarı değil.
create policy retention_policies_write on retention_policies
  for all using (app.acts_as('admin', 'project_director', 'audit_committee'))
  with check (app.acts_as('admin', 'project_director', 'audit_committee'));

-- ---------------------------------------------------------------------------
-- Ne arşivlenmeye hazır, ne engelli, ne de kararı verilmemiş
-- ---------------------------------------------------------------------------
--
-- YAŞ, BELGENİN TARİHİ DEĞİL YÜKLENDİĞİ TARİHTİR, ve bunu söylemek zorunda
-- olmamızın sebebi `document_vault`'un belgenin kendi tarihini hiç
-- taşımaması. 1998'de imzalanmış bir senet 2026'da yüklendiyse bu görünüm
-- onu 2026'dan sayar. Bunu düzeltmek bir kolon ister; bugün yapılan şey
-- yanlış sayıyı doğru gibi göstermemek: görünümün kolonu `uploaded_on`
-- adını taşıyor, `dated_on` değil.
--
-- `retention_state` sıralaması kasıtlı ve en kısıtlayıcı önce: muhafaza her
-- şeyi yener, çünkü muhafazalı bir belgeyi "arşivlenmeye hazır" diye
-- göstermek tam olarak kaybetmeye giden yoldur.
--
-- VE KOLONUN ADI `state` DEĞİL, ölçülmüş bir sebeple. İlk hâlinde `state`
-- yazmıştım ve dört ekranın yoğunluk tavanı düştü — `/meetings`, `/plan`,
-- `/construction`, `/documents`. Sebebi benim ekranım değil: kurgu üretici
-- (`tests/schema-rows.mjs`) görünümlerde hesaplanan dağarcıkları KOLON
-- ADIYLA anahtarlıyor, yani `state` adlı bir kolona yazdığım altı değer
-- `state` kolonu olan HER tabloya satır ürettirmeye başladı.
--
-- Hesaplanmış bir kolonun adı bu depoda yereldeğil, GENEL. `enum-drift`'in
-- eşleştirme listesi de aynı şekilde anahtarlı: `state: 'RetentionState'`
-- yazmak, başka bir görünümün `state` kolonunu da benim birliğime bağlamış
-- olurdu.

create view retention_due with (security_invoker = true) as
select
  d.id as document_id,
  d.title,
  d.category,
  d.status,
  d.confidentiality,
  d.created_at as uploaded_on,
  p.disposition,
  p.after_years,
  h.active_holds,
  h.ever_held,
  case
    when h.active_holds > 0 then 'held'
    when d.status = 'archived' then 'already_archived'
    when p.id is null then 'no_policy'
    when p.disposition = 'keep_forever' then 'keep_forever'
    when d.created_at + make_interval(years => p.after_years) <= now() then 'due'
    else 'not_due'
  end as retention_state,
  case
    when p.after_years is null then null
    else (d.created_at + make_interval(years => p.after_years))::date
  end as due_on,
  -- Bir kez dondurulmuş belge, muhafaza kalkmış olsa da silinemez. Ekran
  -- bunu söylemek zorunda, yoksa "neden temizlenmiyor" sorusunun cevabı
  -- hiçbir yerde durmaz.
  (h.ever_held > 0) as deletion_barred
from document_vault d
left join retention_policies p on p.category = d.category
left join lateral (
  select
    count(*) filter (where lh.released_at is null) as active_holds,
    count(*) as ever_held
  from legal_holds lh
  where lh.document_id = d.id
) h on true;

comment on view retention_due is
  'M9-13 ile M9-11 bir arada: saklama süresi dolmuş belgeler, ve muhafaza '
  'yüzünden dolmamış sayılanlar. Yaş yüklenme tarihinden sayılır, belgenin '
  'kendi tarihinden değil — kütük o tarihi taşımıyor.';

select app.reset_function_grants();
