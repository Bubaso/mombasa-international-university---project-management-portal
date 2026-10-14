-- Alım bir iş kuyruğudur, bir dolap değil (M13-18 … M13-24).
--
-- 0047 okumayı, 0048 teklifi, 0049 reddin modülden çıkmasını getirdi. Üçü de
-- tek tek doğruydu ve birlikte kullanılamaz bir ekran ürettiler: alım listesi
-- her şeyi tutuyor — okunuyor olan, kararı bekleyen, kararı bitmiş,
-- okunamayan, ve teklif üretemeyen bir sürümle okunmuş olan. Hepsi aynı
-- yerde, aynı ağırlıkta, "en yeni 20" diye sessizce kesilerek. Yüz belgede
-- değil, yirmide çalışılamaz hâle geliyor.
--
-- Kusur bir ekran kusuru değil, bir model kusuru: **hiçbir şey kuyruktan
-- çıkmıyor.** Çıkması için üç şeyin gitmesi gereken bir yer olmalı:
--
--   1. **Kabul edilen** kaydını kütüğünde açtı; kuyrukta kalmasının tek
--      sebebi, kaydın nereden geldiğini başka hiçbir yerin bilmemesiydi.
--      `record_provenance` onu kaydın yanına taşıyor.
--   2. **Reddedilen** 0049'dan beri siliniyor ve hiç iz bırakmıyordu. İz
--      bırakmadığı için aynı belge yeniden okunduğunda yeniden teklif
--      edilebiliyordu. `intake_rejections` kararı tutuyor — kuyrukta değil,
--      kararların durduğu yerde.
--   3. **Kararı bitmiş belge** kuyruktan düşmeli. Bunun için "bitmiş"in
--      hesaplanabilir olması gerekiyor: `intake_queue` görünümü her alımın
--      bekleyen / açılmış / reddedilmiş sayısını ve tek kelimelik
--      durumunu veriyor.
--
-- Dördüncü bir şey de burada düzeliyor ve o bir dürüstlük meselesiydi: eski
-- bir okumanın teklif üretmemiş olmasını, `about_en`'in boş olmasından
-- çıkarıyorduk. Bir sütunun boşluğundan başka bir şeyin yokluğunu çıkarmak
-- tahmindir. `proposals_at` artık ölçümü kendisi tutuyor: null ise teklif
-- aşaması o okumada hiç çalışmadı, dolu ise çalıştı ve sonucu ne ise odur.

-- ---------------------------------------------------------------------------
-- Teklif aşamasının çalıştığı an
-- ---------------------------------------------------------------------------

alter table document_intake add column proposals_at timestamptz;

comment on column document_intake.proposals_at is
  'Teklif aşamasının bittiği an. Null, o aşamanın hiç çalışmadığı anlamına '
  'gelir — sıfır teklif üretmiş bir okumadan farklıdır ve ekran ikisini '
  'ayırt eder.';

-- ---------------------------------------------------------------------------
-- Alıntının karşılaştırılabilir hâli
-- ---------------------------------------------------------------------------
--
-- Aynı cümle iki okumada farklı boşluklarla gelebiliyor. Normalleştirme tek
-- yerde duruyor: tablo bu fonksiyonla üretilen bir sütun tutuyor ve
-- karşılaştırmayı yapan fonksiyon da aynısını çağırıyor. İstemci tarafında
-- ikinci bir kopyası yok; olsaydı sapan kopya her zaman ikincisi olurdu
-- (CLAUDE.md §4).

create or replace function app.quote_key(p_quote text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(btrim(regexp_replace(coalesce(p_quote, ''), '\s+', ' ', 'g')));
$$;

comment on function app.quote_key(text) is
  'Bir alıntının karşılaştırma anahtarı: boşluklar tek boşluğa iner, kenarlar '
  'kırpılır, harfler küçülür. Normalleştirmenin tek tanımı.';

-- ---------------------------------------------------------------------------
-- Reddin kaydı
-- ---------------------------------------------------------------------------

create table intake_rejections (
  id uuid primary key default gen_random_uuid(),

  intake_id uuid not null references document_intake (id) on delete cascade,
  -- Politikanın sorusu belge üzerinedir, 0047 ve 0048'deki gerekçenin aynısı.
  document_id uuid not null references document_vault (id) on delete cascade,

  register text not null,
  why text not null,
  quote text not null,

  -- Üretilen sütun: elle yazılmıyor, dolayısıyla teklifle mezar taşı arasında
  -- normalleştirme farkı oluşamıyor.
  quote_key text generated always as (app.quote_key(quote)) stored,

  -- Teklifin o anki hâli. Reddin neyi reddettiği sonradan okunabilsin.
  proposed_values jsonb not null default '{}'::jsonb,

  -- Reddedenin kendi cümlesi. Zorunlu değil: "bu kayıt açılmasın" başlı
  -- başına bir karardır ve gerekçe istemek, gerekçesiz reddi engellemez,
  -- yalnız uydurulmuş gerekçe üretir.
  note text,

  decided_by uuid references profiles (id),
  decided_at timestamptz not null default now(),

  constraint intake_rejections_register_is_not_empty check (btrim(register) <> ''),
  constraint intake_rejections_quote_is_not_empty check (btrim(quote) <> ''),
  constraint intake_rejections_why_is_not_empty check (btrim(why) <> ''),
  constraint intake_rejections_note_is_not_blank check (note is null or btrim(note) <> ''),

  -- Aynı belgede aynı kütük için aynı cümle bir kez reddedilir. İkinci bir
  -- satır yeni bir bilgi taşımaz.
  unique (document_id, register, quote_key)
);

comment on table intake_rejections is
  'Reddedilen teklifin kaydı (M13-18). Teklif iş kuyruğundan çıkar; kararı '
  'burada kalır ve aynı şeyin yeniden teklif edilmesini engeller (M13-19).';

create index intake_rejections_document_idx on intake_rejections (document_id, register);

alter table intake_rejections enable row level security;
alter table intake_rejections force row level security;

-- Red bir denetim olayıdır: kim neyi kaydetmemeye karar verdi.
create trigger intake_rejections_audit
  after insert or update or delete on intake_rejections
  for each row execute function app.record_audit();

-- Görmek: belgeyi görebilen görür. Reddedilmiş bir teklif, belgenin kendi
-- hikâyesinin parçası.
create policy intake_rejections_read on intake_rejections
  for select using (app.can_see_document(document_id));

-- Yazmak: belgeye yazabilen, kendi adına, ve **ancak reddettiği teklif
-- gerçekten ortadayken.** Son koşul mezar taşını teklife bağlıyor: hiç
-- teklif edilmemiş bir cümle için sessizce bastırma kaydı yazılamıyor.
-- `app.decline_proposal` bu yüzden önce taşı koyuyor, sonra satırı siliyor.
create policy intake_rejections_record on intake_rejections
  for insert with check (
    app.can_see_document(document_id)
    and app.can_write('document_vault', document_id)
    and decided_by = auth.uid()
    and exists (
      select 1
        from intake_proposals p
       where p.intake_id = intake_rejections.intake_id
         and p.register = intake_rejections.register
         and app.quote_key(p.quote) = intake_rejections.quote_key
         and p.state <> 'applied'
    )
  );

-- Değiştirmek ve silmek yok. Bir karar, verildikten sonra düzeltilen bir şey
-- değil; yanlış reddedildiyse belge yeniden okunur ve yeni teklif yeni bir
-- karar alır.
revoke all on intake_rejections from authenticated;
grant select, insert on intake_rejections to authenticated;

-- ---------------------------------------------------------------------------
-- Reddi uygula
-- ---------------------------------------------------------------------------
--
-- İki yazma tek çağrıda: taş konur, satır silinir. Ayrı ayrı yapılsa arada
-- kalan bir hata ya izi olmayan bir red ya da teklifi olmayan bir taş
-- bırakırdı.

create or replace function public.decline_proposal(p_proposal uuid, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row intake_proposals;
begin
  select * into v_row from intake_proposals where id = p_proposal;
  if not found then
    -- Görünmeyen bir teklif ile var olmayan bir teklif, dışarıdan aynı
    -- cevabı almalı.
    raise exception 'this proposal cannot be declined'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.state = 'applied' then
    raise exception 'an applied proposal is what links its record to the document'
      using errcode = 'check_violation';
  end if;

  insert into intake_rejections (
    intake_id, document_id, register, why, quote, proposed_values, note, decided_by
  )
  values (
    v_row.intake_id, v_row.document_id, v_row.register, v_row.why, v_row.quote,
    v_row.proposed_values, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  )
  on conflict (document_id, register, quote_key) do nothing;

  delete from intake_proposals where id = p_proposal;
  if not found then
    -- Politika sildirmedi: görebiliyor ama yazamıyor. Sessiz bir sıfır satır
    -- yerine cümle.
    raise exception 'this proposal cannot be declined'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.decline_proposal(uuid, text) is
  'Teklifi reddet: kararı intake_rejections''a yaz ve teklifi kuyruktan '
  'kaldır. İkisi bir işlemde; uygulanmış teklif reddedilemez.';

-- Kalanları tek kararla reddet.
--
-- Toplu **kabul** yok ve bu kasıtlı: bir kaydın açılması, o kaydı birinin
-- görmüş olmasını ister. Toplu red ise bir kayıt açmıyor — açmamaya karar
-- veriyor, ve o kararın tek gerekçesi olabilir (M13-24).
create or replace function public.decline_remaining_proposals(p_intake uuid, p_note text default null)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from intake_proposals where intake_id = p_intake and state = 'proposed' order by created_at
  loop
    perform public.decline_proposal(v_id, p_note);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.decline_remaining_proposals(uuid, text) is
  'Bir alımın bekleyen bütün tekliflerini aynı gerekçeyle reddet. Toplu kabul '
  'karşılığı yoktur.';

-- ---------------------------------------------------------------------------
-- Daha önce reddedilmiş olanlar
-- ---------------------------------------------------------------------------
--
-- Alım fonksiyonu adayları buraya veriyor ve hangilerinin daha önce
-- reddedildiğini öğreniyor. Karşılaştırma burada yapılıyor, çünkü
-- normalleştirmenin tanımı burada: fonksiyon kendi kopyasını tutsaydı iki
-- taraf farklı iki cümleyi aynı sayabilirdi.
--
-- `security invoker`: görmediği bir reddi, bu çağıran için red saymıyoruz.
-- Kütükteki kaydın varlığı da aynı şekilde çağıranın gözünden ölçülüyor.

create or replace function public.candidates_already_rejected(
  p_document uuid,
  p_candidates jsonb
)
returns int[]
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg((c.ord - 1)::int order by c.ord), '{}'::int[])
    from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) with ordinality as c(item, ord)
   where exists (
     select 1
       from intake_rejections r
      where r.document_id = p_document
        and r.register = c.item ->> 'register'
        and r.quote_key = app.quote_key(c.item ->> 'quote')
   );
$$;

comment on function public.candidates_already_rejected(uuid, jsonb) is
  'Verilen {register, quote} adaylarından daha önce reddedilmiş olanların '
  'sıfır tabanlı sıraları. Alım fonksiyonu bunları hiç teklif etmez.';

-- ---------------------------------------------------------------------------
-- Kuyruk
-- ---------------------------------------------------------------------------
--
-- Ekranın okuduğu tek şey. Durum tek kelime ve hesaplanıyor: saklanan bir
-- "bitmiş" alanı, teklifler değiştikçe eskir.

create view intake_queue with (security_invoker = true) as
select
  i.id as intake_id,
  i.document_id,
  i.document_version_id,
  d.title as document_title,
  d.category as document_category,
  i.state,
  i.classified_as,
  i.classification_why,
  i.about_en,
  i.extracted_chars,
  i.page_count,
  i.failure_reason,
  i.created_at,
  i.finished_at,
  i.proposals_at,
  coalesce(p.pending, 0)::int as pending,
  coalesce(p.applied, 0)::int as applied,
  coalesce(r.rejected, 0)::int as rejected,
  -- Sıra önemli: okunuyor ve okunamadı, teklif sayısından önce gelir, çünkü
  -- henüz teklif aşamasına gelmemiş bir alımın sıfır teklifi bir cevap değil.
  case
    when i.state = 'analysing' then 'reading'
    when i.state = 'failed' then 'unreadable'
    when coalesce(p.pending, 0) > 0 then 'awaiting_decision'
    when i.proposals_at is null then 'read_before_proposals'
    else 'settled'
  end as disposition
from document_intake i
join document_vault d on d.id = i.document_id
left join (
  select
    intake_id,
    count(*) filter (where state = 'proposed') as pending,
    count(*) filter (where state = 'applied') as applied
  from intake_proposals
  group by intake_id
) p on p.intake_id = i.id
left join (
  select intake_id, count(*) as rejected
  from intake_rejections
  group by intake_id
) r on r.intake_id = i.id;

comment on view intake_queue is
  'Alım kuyruğu (M13-20): her okuma, kararlarının sayısı ve tek kelimelik '
  'durumu. Durum hesaplanır; saklanmış olsa tekliflere göre eskirdi.';

-- ---------------------------------------------------------------------------
-- Kaydın nereden geldiği
-- ---------------------------------------------------------------------------
--
-- Kabul edilen teklifin kuyrukta kalmasının tek sebebi, bu bilgiyi başka
-- hiçbir yerin tutmamasıydı (M13-21). Artık kaydın yanında duruyor ve kuyruk
-- onu bırakabiliyor.

create view record_provenance with (security_invoker = true) as
select
  p.created_record_id as record_id,
  p.register,
  p.intake_id,
  p.document_id,
  d.title as document_title,
  d.category as document_category,
  p.quote,
  p.why,
  p.decided_at,
  p.decided_by,
  who.full_name as decided_by_name
from intake_proposals p
join document_vault d on d.id = p.document_id
left join profiles who on who.id = p.decided_by
where p.state = 'applied' and p.created_record_id is not null;

comment on view record_provenance is
  'Bir kütük kaydının hangi belgeden, hangi alıntıdan ve kimin onayıyla '
  'açıldığı (M13-21).';

select app.reset_function_grants();

notify pgrst, 'reload schema';
