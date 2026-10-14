-- Teklifler: bir teklif, biri öyle diyene kadar kayıt değildir (M13-14, M13-15).
--
-- 0047 belgenin ne olduğunu kaydediyordu. Ölçüm 2 Ekim 2026, gerçek bir
-- mektupla: kanaat "bu bir mektuptur, göndereni ve konu satırı vardır" oldu ve
-- dokuz kütük "ilgilendirebilir" diye işaretlendi. İkisi de doğruydu ve ikisi
-- de işe yaramazdı. Dokuz kütük işaret etmek hiçbir şey işaret etmemektir, ve
-- belgenin biçimini anlatan bir cümle, belgeyi okumamış birine belgeyi
-- okumadığını hatırlatmaktan başka bir şey yapmaz.
--
-- Eksik olan şey teklifti: alanları doldurulmuş, onaylandığında kütüğe
-- girecek olan satır. Bu tablo onu tutuyor.
--
-- Dört karar burada duruyor:
--
--   1. **Teklif alıntısını taşır.** `quote` belgeden kelimesi kelimesine
--      alınmış bir parçadır ve `quote_found`, onun metinde gerçekten
--      bulunduğunu söyler. Dayanağı gösterilemeyen bir teklif, kaydın
--      kaynağını uydurmak demektir. Edge fonksiyonu bulunmayan alıntıyı zaten
--      düşürüyor; sütun, düşmeyenin de denetlenebilmesi için var.
--
--   2. **Teklifi makine yazar, kaydı insan açar.** `authenticated`'ın insert
--      yetkisi yok: teklifin modelden geldiği, yazanın kim olduğuyla
--      belli olmalı. Onay ise kullanıcının kendi oturumuyla, kütüğün kendi
--      normal yazma yolundan geçer — yani o kütüğün bütün politikaları,
--      kısıtları ve trigger'ları aynen işler. Teklif için ayrı bir yazma
--      yolu açmak, kuralların etrafından dolaşan ikinci bir kapı olurdu.
--
--   3. **Onaylayan, teklifin metnini değiştiremez.** `grant update` yalnız
--      karar sütunlarını kapsıyor (0026'nın ölçümünden beri bu depodaki
--      desen bu). Kullanıcı formda değerleri düzenleyebilir ve kütüğe
--      düzenlenmiş hâli girer; teklifin kendisi modelin söylediği gibi
--      kalır. Altı ay sonra "model ne demişti, biz ne yazdık" sorusunun
--      cevabı ancak böyle durur.
--
--   4. **Karar bir kere verilir.** Uygulanmış bir teklif yeniden
--      uygulanamaz; trigger reddeder. Yoksa bir teklif iki kayıt açar ve
--      ikisi de kendini tek sanır.

alter table document_intake
  add column if not exists about_en text;

comment on column document_intake.about_en is
  'Belgenin ne dediği, iki üç cümle. Ne olduğu (classified_as) ile ne dediği '
  'ayrı şeylerdir: birincisi türü, ikincisi içeriği. Eski satırlarda boş '
  'olabilir — o satırlar bu sütundan önce yazıldı ve geriye dönük '
  'doldurulmadı, çünkü doldurulmuş bir özet, okunmuş bir belgeyi iddia eder.';

create type proposal_state as enum ('proposed', 'applied', 'declined');

create table intake_proposals (
  id uuid primary key default gen_random_uuid(),

  intake_id uuid not null references document_intake (id) on delete cascade,
  -- Politikanın sorusu belge üzerinedir; 0047'deki gerekçenin aynısı.
  document_id uuid not null references document_vault (id) on delete cascade,

  -- Hangi kütük. Liste `supabase/functions/ai-assistant/targets.js`'de ve
  -- burada kısıt olarak tekrarlanmıyor: o liste bir veritabanı kavramı değil,
  -- hangi istemci fonksiyonunun çağrılacağının adı. İki yere yazılan kural,
  -- birinde eskir (CLAUDE.md §4). Bilinmeyen bir anahtarı `readProposals`
  -- reddediyor ve satır hiç oluşmuyor.
  register text not null,

  -- Neden bu kayıt. Tek satır.
  why text not null,

  -- Belgeden, kelimesi kelimesine. Ve metinde bulunup bulunmadığı.
  quote text not null,
  quote_found boolean not null,

  -- Alanların doldurulmuş hâli. Kütüğün sütunlarıyla birebir değil, hedef
  -- tanımındaki adlarla: istemci onları kendi yazma fonksiyonuna çeviriyor.
  proposed_values jsonb not null default '{}'::jsonb,

  state proposal_state not null default 'proposed',

  -- Onaylandıysa açılan kaydın kimliği. Polimorfik olduğu için foreign key
  -- yok; hangi tabloda olduğunu `register` söylüyor.
  created_record_id uuid,

  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  -- Bekleyen teklifin kararı yoktur.
  constraint intake_proposals_pending_is_undecided check (
    (state = 'proposed') = (decided_by is null and decided_at is null)
  ),
  -- Uygulanan teklif, açtığı kaydı gösterir. Göstermiyorsa "uygulandı"
  -- sözü kontrol edilemez.
  constraint intake_proposals_applied_points_at_its_record check (
    (state = 'applied') = (created_record_id is not null)
  ),
  constraint intake_proposals_quote_is_not_empty check (btrim(quote) <> ''),
  constraint intake_proposals_why_is_not_empty check (btrim(why) <> ''),
  constraint intake_proposals_register_is_not_empty check (btrim(register) <> '')
);

comment on table intake_proposals is
  'Bir belgeden çıkarılan, onaylandığında kütüğe girecek kayıt önerisi '
  '(M13-14). Kaydın kendisi değildir: onayı kullanıcı verir ve kaydı '
  'kullanıcının kendi oturumu açar, kütüğün normal yazma yolundan.';

create index intake_proposals_by_intake on intake_proposals (intake_id);
create index intake_proposals_by_document on intake_proposals (document_id);
create index intake_proposals_pending on intake_proposals (state) where state = 'proposed';

-- Teklif, alımının belgesine ait olmak zorunda. 0047'deki trigger'ın aynısı,
-- aynı sebeple: politika alt sorgu yapmasın diye iki sütun ayrı duruyor.
create or replace function app.proposal_belongs_to_its_intake()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_document uuid;
begin
  select document_id into v_document from document_intake where id = new.intake_id;

  if v_document is null then
    raise exception 'that intake does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if v_document <> new.document_id then
    raise exception 'that intake belongs to a different document'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger intake_proposals_match_their_intake
  before insert or update of intake_id, document_id on intake_proposals
  for each row execute function app.proposal_belongs_to_its_intake();

-- Bir teklif bir kere karara bağlanır.
--
-- Bunsuz, uygulanmış bir teklif tekrar uygulanabilir ve iki kayıt açar;
-- ikisi de kendini tek sanar, ve kütükte sebebi görünmeyen bir çift durur.
create or replace function app.a_proposal_is_decided_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.state <> 'proposed' then
    raise exception 'this proposal was already %, and a decision is made once', old.state
      using errcode = 'check_violation';
  end if;

  if new.state = 'proposed' then
    raise exception 'a decision must say applied or declined'
      using errcode = 'check_violation';
  end if;

  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end;
$$;

create trigger intake_proposals_decided_once
  before update on intake_proposals
  for each row execute function app.a_proposal_is_decided_once();

-- ---------------------------------------------------------------------------
-- Erişim
-- ---------------------------------------------------------------------------

alter table intake_proposals enable row level security;
alter table intake_proposals force row level security;

create policy intake_proposals_read on intake_proposals
  for select using (app.can_see_document(document_id));

-- Kararı, belgeye yazabilen kişi verir. Teklifin kendisini kimse eklemez:
-- insert yetkisi `authenticated`'da yok, çünkü teklifin modelden geldiği
-- satırın nasıl oluştuğuyla belli olmalı.
-- `state = 'proposed'` bu politikada DEĞİL, ve bu kasıtlı.
--
-- Oraya konmuştu ve test onu düşürdü: RLS reddetmez, filtreler. Karara
-- bağlanmış bir teklif politikanın kapsamı dışında kalınca ikinci güncelleme
-- sıfır satırı etkiliyor, hiçbir şey yükselmiyor, ve tarayıcı "oldu" sanıyor.
-- Koşul trigger'da duruyor, çünkü orada reddin bir cümlesi var: aynı teklifi
-- ikinci kez uygulamaya çalışan kişi, neden olmadığını öğreniyor.
create policy intake_proposals_decide on intake_proposals
  for update using (
    app.can_see_document(document_id)
    and app.can_write('document_vault', document_id)
  )
  with check (app.can_see_document(document_id));

revoke insert, delete on intake_proposals from authenticated;
revoke update on intake_proposals from authenticated;
grant select on intake_proposals to authenticated;
-- Sütun bazlı yetki, 0026'dan beri bu depodaki desen: onaylayan kararı
-- verir, teklifin metnini değiştiremez. Politika satırı seçer, grant sütunu.
grant update (state, created_record_id) on intake_proposals to authenticated;

create trigger intake_proposals_audit
  after insert or update or delete on intake_proposals
  for each row execute function app.record_audit();

select app.reset_function_grants();

notify pgrst, 'reload schema';
