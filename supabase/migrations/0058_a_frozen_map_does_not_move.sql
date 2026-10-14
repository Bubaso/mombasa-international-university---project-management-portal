-- ---------------------------------------------------------------------------
-- Etkileşim planı ve dondurulmuş paydaş haritası (M4-12, M4-14)
-- ---------------------------------------------------------------------------
--
-- İKİSİ BİR GÖÇTE, VE SEBEBİ AYNI KOLON
--
-- M4-12 bir plan istiyor: bu paydaştan ne istiyoruz, hangi mesajı veriyoruz,
-- sıradaki adım kimde ve ne zaman. M4-14 mütevelli sunumları için tarihli,
-- dondurulmuş bir paydaş haritası istiyor.
--
-- İkisi aynı göçte, çünkü ikincisi birincisini de dondurmak zorunda: bir
-- mütevelli sunumunda "şu kişiden şunu istiyoruz" cümlesi haritanın bir
-- parçası, ve plan tablosu haritadan sonra eklenirse o tarihe kadar alınmış
-- her anlık görüntü planları içermeyen bir harita olur — eksikliği de hiçbir
-- yerde yazmaz. Planı önce yazmak, dondurulmuş haritanın ilk gününden
-- itibaren tam olması demek.
--
-- Göçün adı bu dosyanın tek kuralından geliyor: dondurulmuş bir harita
-- kımıldamaz. Aşağıdaki her kısıt o cümlenin bir parçası.

-- ---------------------------------------------------------------------------
-- Planın durumu (M4-12)
-- ---------------------------------------------------------------------------
--
-- `outcome_unknown` kasıtlı ve kolay atılabilecek bir değer değil: bir plan
-- çoğu zaman bir kararla değil ilgisizlikle kapanır, ve kapanırken sonucunun
-- ne olduğu kimsede yazılı olmaz. Beş değerden birini seçmeye zorlamak,
-- olmayan bir cevabı icat etmek olurdu (CLAUDE.md §2); o yüzden "bilmiyoruz"
-- bir seçenek — ama yazılmış bir seçenek, yani ekranda görünen bir boşluk.
create type engagement_plan_status as enum (
  'active',
  'achieved',
  'partly_achieved',
  'not_achieved',
  'abandoned',
  'outcome_unknown'
);

create table stakeholder_engagement_plans (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references stakeholders (id) on delete cascade,

  -- "Bu paydaştan ne istiyoruz": planın var olma sebebi, zorunlu. Amacı
  -- yazılmamış bir plan, sıradaki adımı olan bir alışkanlıktır.
  objective text not null,
  -- "Hangi mesajı veriyoruz": zorunlu DEĞİL, çünkü mesajın henüz
  -- kararlaştırılmamış olması gerçek bir hâl. Ekran bunu boş bırakmak yerine
  -- "mesaj kayıtlı değil" diye yazıyor.
  message text,

  -- Sıradaki adım ÜÇÜ BİR ARADA. Sorumlusu ve tarihi olmayan bir adım
  -- metni, Notion'dan taşınan 103 aksiyon satırının tam olarak kendisiydi:
  -- takip edildiğini sandırır, takip edilmez (CLAUDE.md §2).
  next_step text,
  next_step_owner uuid references profiles (id) on delete set null,
  next_step_due date,

  status engagement_plan_status not null default 'active',
  closed_at timestamptz,
  closed_note text,

  constraint engagement_plans_objective_not_blank check (btrim(objective) <> ''),

  constraint engagement_plans_step_is_whole check (
    (next_step is null and next_step_owner is null and next_step_due is null)
    or (
      btrim(coalesce(next_step, '')) <> ''
      and next_step_owner is not null
      and next_step_due is not null
    )
  ),

  -- Kapanış da bir bütün: tarih ve bir not. Notu olmayan bir kapanış,
  -- planın neden bittiğini kaybeder ve kaybı görünmez olur.
  constraint engagement_plans_close_is_whole check (
    (status = 'active' and closed_at is null and closed_note is null)
    or (
      status <> 'active'
      and closed_at is not null
      and btrim(coalesce(closed_note, '')) <> ''
    )
  ),
  constraint engagement_plans_close_not_before_start check (
    closed_at is null or closed_at >= created_at
  ),

  confidentiality confidentiality not null default 'confidential',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

-- Gizlilik varsayılanı `confidential`, `internal` değil (CLAUDE.md §4): bir
-- bakandan ne istediğimiz ve ona hangi mesajı verdiğimiz, portalda oturum
-- açabilen her müteahhidin okuyacağı şey değil.

create trigger touch_stakeholder_engagement_plans
  before insert or update on stakeholder_engagement_plans
  for each row execute function app.touch_row();
create trigger audit_stakeholder_engagement_plans
  after insert or update or delete on stakeholder_engagement_plans
  for each row execute function app.record_audit();

-- Bir paydaşın AYNI ANDA tek yürüyen planı olur. İki yürüyen plan bir plan
-- değil bir anlaşmazlıktır: ikisi farklı şey istiyorsa paydaşa iki ayrı
-- mesaj gider, ve hangisinin geçerli olduğunu kimse söyleyemez. Kapanmış
-- planlar sınırsız — plan geçmişi, ilişkinin kendi tarihidir.
--
-- Bu indeks aşağıdaki `engagement_plan_board` görünümünün de dayanağı:
-- görünüm paydaş başına TEK satır veriyor ve bunu yürüyen plana `left join`
-- ile yapıyor. İki yürüyen plan olsaydı paydaş iki kez listelenirdi.
create unique index engagement_plans_one_active_per_stakeholder
  on stakeholder_engagement_plans (stakeholder_id)
  where status = 'active';

create index engagement_plans_step_owner_idx
  on stakeholder_engagement_plans (next_step_owner, next_step_due)
  where status = 'active' and next_step is not null;

-- ---------------------------------------------------------------------------
-- Planı kim yazar
-- ---------------------------------------------------------------------------
--
-- İki kapı, ve ikincisi asıl olan: planı **ilişki sahibi** yazar. M4-05 her
-- paydaşa bir sorumlu atıyor; o sorumlunun kendi paydaşı için plan
-- yazamaması, sorumluluğu adı olan ama yetkisi olmayan bir şeye çevirirdi.
--
-- Birinci kapı (`can_assess`) sahibi olmayan paydaşlar ve yönetim için.
-- `can_minute` kullanılmadı: saha ekibinin temas günlüğü yazması ile bir
-- bakandan ne isteyeceğimize karar vermesi aynı şey değil — ikincisi ya
-- yönetimin işi ya da o ilişkiyi tutan kişinin.
create or replace function app.can_plan_engagement(p_stakeholder uuid)
returns boolean
language sql
stable
as $$
  select app.can_assess()
    or exists (
      select 1 from stakeholders s
      where s.id = p_stakeholder and s.relationship_owner = auth.uid()
    );
$$;

alter table stakeholder_engagement_plans enable row level security;
alter table stakeholder_engagement_plans force row level security;

-- Okuma iki kapıdan geçiyor: planın kendi gizlilik seviyesi, VE paydaşın
-- görülebilirliği. İkincisi olmasa plan, görülmemesi gereken bir kişinin
-- varlığını adıyla söylerdi — `stakeholder_stance_changes` ile aynı sebep.
-- Dış rollere `has_grant` yolu YOK: bir müteahhide "bu kişiden şunu
-- istiyoruz" belgesi tek tek paylaşılarak da verilmez.
create policy stakeholder_engagement_plans_read on stakeholder_engagement_plans
  for select using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_engagement_plans', id)
    and exists (
      select 1 from stakeholders s
      where s.id = stakeholder_id and app.can_see_stakeholder(s.confidentiality, s.id)
    )
  );

-- `can_read` burada da aynı sebeple: yetkisinin üstüne sınıflandırılmış bir
-- plan yazan kişi, o planı bir daha açamaz.
create policy stakeholder_engagement_plans_insert on stakeholder_engagement_plans
  for insert with check (
    app.can_plan_engagement(stakeholder_id)
    and app.can_read(confidentiality, 'stakeholder_engagement_plans', id)
  );

create policy stakeholder_engagement_plans_update on stakeholder_engagement_plans
  for update
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_engagement_plans', id)
    and app.can_plan_engagement(stakeholder_id)
  )
  with check (
    app.can_plan_engagement(stakeholder_id)
    and app.can_read(confidentiality, 'stakeholder_engagement_plans', id)
  );

create policy stakeholder_engagement_plans_delete on stakeholder_engagement_plans
  for delete
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_engagement_plans', id)
    and app.can_plan_engagement(stakeholder_id)
  );

-- ---------------------------------------------------------------------------
-- Dondurulmuş harita (M4-14)
-- ---------------------------------------------------------------------------
--
-- BURADAKİ ASIL KUSUR, YAZILMAMIŞ HÂLİNDE ŞU OLURDU: anlık görüntü canlı
-- satırlara bir referans tutar, ekran da onları okur. Mart ayında alınmış
-- "tarihli" bir harita, Nisan'da açıldığında Nisan'ın tutumlarını gösterir
-- ve üzerinde hâlâ Mart tarihi yazar. Hiçbir hata mesajı çıkmaz; sadece
-- mütevelliye gösterilen tarih yalan olur.
--
-- O yüzden `payload` bir referans değil, o anın KOPYASI. Ve kopyanın
-- kendisi değiştirilemez: değiştirilebilen bir kopya, geciktirilmiş bir
-- referanstan farksızdır.
create table stakeholder_map_snapshots (
  id uuid primary key default gen_random_uuid(),

  -- İnsanın verdiği ad ("Mütevelli kurulu, Mart 2026") ve serbest not. Bu
  -- ikisi SONRADAN DÜZELTİLEBİLİR: bir yazım hatası haritanın verisi değil,
  -- etiketi. Donmuş olan şey veri.
  title text not null,
  note text,

  -- Harita, o an görülebilen paydaşların kopyası. Tetikleyici yazıyor,
  -- istemci değil — aşağıdaki `app.freeze_stakeholder_map()` gönderilen
  -- değeri sessizce atıyor.
  payload jsonb not null,

  -- `taken_at` / `taken_by` KOLONU YOK: `created_at` / `created_by` zaten
  -- aynı şeyi söylüyor ve aynı olguyu iki kolonda tutmak ikisinin ayrışmasını
  -- beklemek demek (CLAUDE.md §4, 0057 ile aynı gerekçe).
  --
  -- `taken_as_role` ise bir kopya DEĞİL, ve bu göçün en önemli kolonu
  -- olabilir: anlık görüntü, alanın RLS altında GÖREBİLDİĞİ kadarıdır.
  -- Daha dar yetkili biri daha küçük bir harita alır, ve o harita eksik
  -- olduğunu söylemezse mütevelli onu tam harita sanır. Rol bugünkü
  -- profilden okunamaz: roller değişir, anlık görüntünün tarihi geçmişte
  -- kalır. O yüzden o andaki rol burada damgalanıyor.
  taken_as_role app_role not null,

  -- Bir anlık görüntü silinmez, GEÇERSİZ SAYILIR — ve geçersiz sayma bir
  -- gerekçe ister. Sebebi aşağıdaki tetikleyicide yazılı.
  discarded_at timestamptz,
  discarded_by uuid references profiles (id),
  discarded_reason text,

  constraint snapshots_title_not_blank check (btrim(title) <> ''),
  -- `payload`'ın bir LİSTE olduğuna dair bir check constraint YOK, ve ilk
  -- hâlinde vardı. Mutasyon listesini yazarken onu bozacak bir test
  -- bulamadım, sonra sebebini gördüm: kısıt hiç ateşlenemez. Tetikleyici
  -- her INSERT'te `payload`'ı kendisi yazıyor ve `jsonb_agg` ya bir dizi ya
  -- `'[]'` döndürüyor; UPDATE'te de `payload` değişemiyor. Yani istemcinin
  -- gönderdiği bir nesne kısıta hiç ulaşmıyor.
  --
  -- Görünümdeki `jsonb_array_length` gerçekten bir dizi gerektiriyor, ve
  -- onu garanti eden şey tetikleyici. İki garanti yazmak, ikincisinin
  -- sınanmadığını ve bir gün yanlış yere güvenileceğini kabul etmek olurdu
  -- (CLAUDE.md §3: başarısız olmayan test, test değildir).
  constraint snapshots_discard_is_whole check (
    (discarded_at is null and discarded_by is null and discarded_reason is null)
    or (discarded_at is not null and btrim(coalesce(discarded_reason, '')) <> '')
  ),

  -- Dondurulmuş siyasî harita, bu portaldaki en hassas tek kayıt: her
  -- paydaşın tutumu, nüfuzu ve sorumlusu bir arada. M4-11'in gizli
  -- değerlendirmesiyle aynı varsayılan.
  confidentiality confidentiality not null default 'restricted',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create trigger touch_stakeholder_map_snapshots
  before insert or update on stakeholder_map_snapshots
  for each row execute function app.touch_row();
create trigger audit_stakeholder_map_snapshots
  after insert or update or delete on stakeholder_map_snapshots
  for each row execute function app.record_audit();

create index stakeholder_map_snapshots_taken_idx
  on stakeholder_map_snapshots (created_at desc);

-- ---------------------------------------------------------------------------
-- Haritanın kendisi
-- ---------------------------------------------------------------------------
--
-- `security definer` YOK, ve bu bir eksiklik değil, bu fonksiyonun bütün
-- anlamı: tanımlayıcı yetkisiyle çalışsaydı RLS'i atlar ve çağıranın
-- göremediği paydaşları da kopyalardı — yani anlık görüntü bir sızıntı
-- aracına dönerdi. Çağıran yetkisiyle çalışıyor, o yüzden harita çağıranın
-- gördüğü kadar, ve ne kadar olduğu `taken_as_role` ile kayda geçiyor.
--
-- `relationship_owner` İKİ KOLON olarak kopyalanıyor, ve sebebi bir ayrım:
-- kimliği olup adı null olan bir sahip "profil görülemedi" demek, ikisi de
-- null olan "sahip atanmamış" demek (M4-05 bunu bir bulgu sayıyor). Tek
-- kolon olsaydı iki ayrı bilinmezlik tek boşluğa düşerdi (CLAUDE.md §2).
--
-- 2×2 matrisin ÇEYREĞİ kopyalanmıyor: o kural istemcide `quadrantOf` ile
-- yazılı ve nüfuz/ilgi puanlarından türüyor. Burada da hesaplamak, aynı
-- kuralı iki yere yazmak olurdu (CLAUDE.md §4) — sapan kopya her zaman
-- ikincisidir.
create or replace function app.stakeholder_map_payload()
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'full_name', s.full_name,
        'title', s.title,
        'organization', o.name,
        'category', s.category,
        'stance', s.stance,
        'influence', s.influence,
        'interest', s.interest,
        'relationship_owner_id', s.relationship_owner,
        'relationship_owner_name', p.full_name,
        'last_contact_at', a.last_contact_at,
        'has_gone_quiet', a.has_gone_quiet
      )
      order by s.full_name
    ),
    '[]'::jsonb
  )
  from stakeholders s
  left join organizations o on o.id = s.organization_id
  left join profiles p on p.id = s.relationship_owner
  left join stakeholder_attention a on a.id = s.id;
$$;

create or replace function app.freeze_stakeholder_map()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- TARİH SUNUCUDAN, VE BU BİR KONVANSİYON İHLALİ — kasıtlı.
    --
    -- `app.touch_row()` şema genelinde `coalesce(new.created_at, now())`
    -- yazıyor, yani istemci kendi tarihini gönderebilir. Her yerde doğru:
    -- bir temas günlüğü dün olmuş bir görüşmeyi anlatabilir. Burada yanlış,
    -- çünkü anlık görüntünün tarihi onun TEK iddiası — "bu harita o gün
    -- böyleydi" cümlesindeki "o gün". Geriye tarih atılabilen bir anlık
    -- görüntü, tarihsiz bir anlık görüntüden kötüdür: birincisi doğrulanmış
    -- sanılır.
    new.created_at := now();
    new.taken_as_role := app.current_role_name();
    -- Harita da sunucudan. İstemcinin gönderdiği `payload` okunmuyor bile:
    -- okunursa bir gün uydurulmuş bir harita yazılır ve üzerinde gerçek bir
    -- tarih durur. Kural Postgres'te (CLAUDE.md §5); istemci yalnızca
    -- "anlık görüntü al" diyor.
    new.payload := app.stakeholder_map_payload();
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Silinebilen bir sunum kaydı, kayıt değildir: bugünün anlatısına
    -- uymayan harita sessizce ortadan kalkar. Yol `discarded_at` ve bir
    -- gerekçe.
    --
    -- BEDELİ YAZIYORUM: geçersiz sayılmış anlık görüntüler süresiz
    -- birikiyor. Kütük onları varsayılan olarak gizliyor, ve her biri
    -- birkaç kilobayt. Kaybetme riskine karşı kabul edilmiş bir maliyet.
    raise exception
      'a stakeholder map snapshot is not deletable; discard it with a reason instead (M4-14)';
  end if;

  if new.payload is distinct from old.payload
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.taken_as_role is distinct from old.taken_as_role
  then
    raise exception
      'a frozen stakeholder map cannot be changed; take a new snapshot instead (M4-14)';
  end if;

  if old.discarded_at is not null
    and (
      new.discarded_at is distinct from old.discarded_at
      or new.discarded_reason is distinct from old.discarded_reason
    )
  then
    raise exception 'a discarded snapshot keeps the reason it was discarded for (M4-14)';
  end if;

  -- Geçersiz saymanın damgası sunucudan, 0057'nin `stamp_hold_release`'i
  -- ile aynı sebeple: tehlikeli olan fiil koymak değil kaldırmaktır.
  if new.discarded_at is not null and old.discarded_at is null then
    new.discarded_at := now();
    new.discarded_by := auth.uid();
  end if;

  return new;
end;
$$;

-- Tetikleyicinin adı `touch_...`'tan önce sıralanıyor ve bu önemsiz: ikisi de
-- doğru çalışıyor. `touch_row` `created_at`'i `coalesce` ile yazdığı için
-- burada damgalanmış değeri hiçbir sırada ezmiyor.
create trigger stakeholder_map_snapshots_frozen
  before insert or update or delete on stakeholder_map_snapshots
  for each row execute function app.freeze_stakeholder_map();

alter table stakeholder_map_snapshots enable row level security;
alter table stakeholder_map_snapshots force row level security;

create policy stakeholder_map_snapshots_read on stakeholder_map_snapshots
  for select using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_map_snapshots', id)
  );

-- Anlık görüntüyü M4-11'in gizli değerlendirmesini yazabilenler alıyor:
-- `can_assess`.
--
-- VE İKİNCİ BİR KOŞUL, BİR KUSURU KAPATIYOR — kusuru bu göçün testini
-- yazarken buldum, ve yazılmamış hâli şuydu: `can_assess` proje direktörünü
-- içeriyor, varsayılan gizlilik `restricted`, ve yetkisi `confidential` olan
-- bir proje direktörü (vekil direktör tam olarak bu) kendi aldığı haritayı
-- SONRADAN OKUYAMIYORDU. İstisna da çıkmıyordu: kayıt yazılıyor, ekranda
-- görünmüyor, ve alan kişi haritanın kaybolduğunu sanıyordu.
--
-- Kural artık genel: **kimse kendi yetkisinin üstüne kayıt yazamaz.**
-- `can_read` yeniden kullanılıyor, ikinci bir seviye karşılaştırması
-- yazılmıyor (CLAUDE.md §4). Daha dar yetkili biri haritasını kendi
-- tavanında sınıflandırmak zorunda, ve bu doğru cevap: aldığı harita
-- zaten kendi gördüğü kadar.
create policy stakeholder_map_snapshots_insert on stakeholder_map_snapshots
  for insert with check (
    app.can_assess()
    and app.can_read(confidentiality, 'stakeholder_map_snapshots', id)
  );

create policy stakeholder_map_snapshots_update on stakeholder_map_snapshots
  for update
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_map_snapshots', id)
    and app.can_assess()
  )
  with check (
    app.can_assess()
    and app.can_read(confidentiality, 'stakeholder_map_snapshots', id)
  );

-- SİLME POLİTİKASI VAR, VE HER SEFERİNDE REDDEDİLİYOR — çelişki değil.
--
-- Politika olmasaydı RLS silmeyi sessizce reddederdi: sıfır satır, hata yok,
-- ekranda hiçbir şey olmuyor. 0006 bu kusuru stance kütüğünde ismen
-- kaydetmiş ("fails silently with zero rows instead of saying no"). Politika
-- izin veriyor ki tetikleyici REDDİN SEBEBİNİ söyleyebilsin.
create policy stakeholder_map_snapshots_delete on stakeholder_map_snapshots
  for delete
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_map_snapshots', id)
  );

-- ---------------------------------------------------------------------------
-- Plan panosu (M4-12, M4-05)
-- ---------------------------------------------------------------------------
--
-- Görünüm PAYDAŞTAN başlıyor, plandan değil, ve bu bir tercih: planı olmayan
-- paydaş da bir satır. Plan tablosundan başlayan bir pano "yapılacak işler"
-- listesi olurdu ve hiç plan yazılmamış bir bakan o listede görünmezdi —
-- oysa asıl bulgu tam olarak o (CLAUDE.md §2, bilinmeyeni ekrana çıkar).
--
-- `days_to_step` planı ya da adımı olmayanda `null`, 0 değil: sıfır "bugün
-- vadesi geliyor" demek ve bu yanlış cevaptır.
create view engagement_plan_board with (security_invoker = true) as
select
  s.id as stakeholder_id,
  s.full_name,
  s.category,
  s.stance,
  s.influence,
  s.interest,
  s.relationship_owner,
  pl.id as plan_id,
  pl.objective,
  pl.message,
  pl.next_step,
  pl.next_step_owner,
  own.full_name as next_step_owner_name,
  pl.next_step_due,
  pl.status,
  pl.confidentiality as plan_confidentiality,
  case
    when pl.id is null then 'no_plan_recorded'
    when pl.next_step is null then 'no_step_recorded'
    when pl.next_step_due < current_date then 'overdue'
    when pl.next_step_due <= current_date + 14 then 'due_soon'
    else 'scheduled'
  end as step_state,
  case
    when pl.next_step_due is null then null
    else pl.next_step_due - current_date
  end as days_to_step,
  -- EKRANIN SORDUĞU YETKİ SORUSU, POLİTİKANIN KENDİ FONKSİYONUYLA. Plan
  -- yazma yetkisi role göre değil KİŞİYE göre değişiyor: ilişki sahibi kendi
  -- paydaşının planını yazabiliyor (M4-05). İstemcide `canAssess` ile
  -- yaklaşmak, saha ekibinden gerçekten sahip olduğu yetkiyi saklardı; ve
  -- kuralı istemcide yeniden yazmak sapacak ikinci kopya olurdu
  -- (CLAUDE.md §4, §5). Burada `insert` politikasının çağırdığı fonksiyonun
  -- ta kendisi çağrılıyor, satır başına.
  app.can_plan_engagement(s.id) as can_plan
from stakeholders s
left join stakeholder_engagement_plans pl
  on pl.stakeholder_id = s.id and pl.status = 'active'
left join profiles own on own.id = pl.next_step_owner;

comment on view engagement_plan_board is
  'M4-12: her paydaşın yürüyen etkileşim planı, ve planı olmayanlar. Paydaş '
  'başına tek satır; dayanağı engagement_plans_one_active_per_stakeholder.';

-- ---------------------------------------------------------------------------
-- Anlık görüntü kütüğü (M4-14)
-- ---------------------------------------------------------------------------
--
-- `payload` bu görünümde YOK, kasıtlı: kütüğü listelemek için her haritanın
-- tamamını tarayıcıya indirmek, bir listeyi okumanın bedelini bütün verinin
-- bedeli yapardı. Harita tek tek, açıldığında okunuyor.
--
-- Sayım burada HESAPLANIYOR, saklanmıyor. Tabloda bir `stakeholder_count`
-- kolonu olsaydı aynı olgu iki yerde durur ve bir gün ayrışırdı — hangisinin
-- doğru olduğunu da kimse bilemezdi (CLAUDE.md §4).
create view stakeholder_map_snapshot_index with (security_invoker = true) as
select
  sn.id,
  sn.title,
  sn.note,
  sn.confidentiality,
  sn.created_at as taken_at,
  sn.created_by as taken_by,
  taker.full_name as taken_by_name,
  sn.taken_as_role,
  jsonb_array_length(sn.payload) as stakeholder_count,
  -- Tutum dağılımı, o günkü hâliyle. Tek tek kolonlar yerine tek bir sözlük:
  -- `stance` dağarcığı büyüdüğünde burada bir kolon eklenmesi gerekmesin,
  -- yoksa dağarcık iki yere yazılmış olur. Boş haritada `null` döner —
  -- "sayım yok" demek, "hepsi sıfır" demek değil.
  (
    select jsonb_object_agg(t.stance, t.n)
    from (
      select e ->> 'stance' as stance, count(*) as n
      from jsonb_array_elements(sn.payload) e
      group by 1
    ) t
  ) as stance_tally,
  sn.discarded_at,
  sn.discarded_by,
  discarder.full_name as discarded_by_name,
  sn.discarded_reason
from stakeholder_map_snapshots sn
left join profiles taker on taker.id = sn.created_by
left join profiles discarder on discarder.id = sn.discarded_by;

comment on view stakeholder_map_snapshot_index is
  'M4-14: dondurulmuş paydaş haritalarının kütüğü, haritanın kendisi hariç. '
  'Sayım payload''dan hesaplanıyor; taken_as_role haritanın hangi rolün '
  'gördüğü kadar olduğunu söylüyor.';

select app.reset_function_grants();
