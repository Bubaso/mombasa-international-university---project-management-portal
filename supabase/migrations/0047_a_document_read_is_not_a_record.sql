-- Belge alımı: okunan bir belge henüz bir kayıt değildir (M13-13, M13-14).
--
-- Bir belge yüklenir, modül okur, ve ne olduğu hakkında bir kanaate varır.
-- O kanaat bir kayıt değildir ve kayıt gibi davranmamalıdır: bir mahkeme
-- kararının "temyiz dosyası görünüyor" diye okunması, temyiz dosyası
-- kaydının kendisi değildir.
--
-- Bu tablo o ara durumu tutar. Deseni 0032'den (action_candidates) devralıyor
-- ve sebebi aynı: Notion göçünde 103 aksiyon satırının 85'i ne sorumlu ne
-- tarih içeriyordu, uygulama ise ikisini de zorunlu tutuyordu. Ne uydurmak ne
-- atmak doğruydu; üçüncü bir şey yazıldı — kaynağını taşıyan, değer değil
-- öneri taşıyan, bir insan karar verene kadar bekleyen kayıt. Burada aynı şey
-- bir kütük için değil, hepsi için.
--
-- Üç karar burada, şemada duruyor:
--
--   1. Alım, kasadaki gerçek bir sürüme bağlıdır (`not null`). Analiz için
--      ayrı bir geçici dosya alanı açmak, kasanın bütün kurallarının
--      (özet sunucuda hesaplanır, baytlara tek çıkış yolu okumayı kaydeder)
--      dışında ikinci bir depo yaratmak olurdu.
--
--   2. Alımı görmek, belgeyi görmekle aynı şeydir. Kendi gizlilik sütunu
--      yoktur; `app.can_see_document()` sorar. Gizlilik kuralını ikinci bir
--      yere yazmak, sapan kopyayı yaratmaktır (CLAUDE.md §4).
--
--   3. Modül bir kanaate varamadıysa bu bir hatadır, boş bir sınıflandırma
--      değil. `failed` durumu sebebini taşımak zorundadır — "okunamadı" ile
--      "okudum ama ne olduğunu anlamadım" farklı şeylerdir ve ikisi de
--      kullanıcıya söylenmeye değer.

create type intake_state as enum ('analysing', 'ready', 'failed');

create table document_intake (
  id uuid primary key default gen_random_uuid(),

  -- Kasadaki sürüm. Alım onun üzerinde çalışır, kopyası üzerinde değil.
  document_version_id uuid not null references document_versions (id) on delete cascade,
  -- Politikanın soracağı soru belge üzerinedir; sürümden türetmek yerine
  -- burada tutulur, çünkü politika alt sorgu yapmak zorunda kalmasın.
  document_id uuid not null references document_vault (id) on delete cascade,

  state intake_state not null default 'analysing',

  -- Modelin ne olduğunu düşündüğü ve neden öyle düşündüğü. İkincisi
  -- olmadan birincisi denetlenemez: "vakıf senedi" diyen bir satır, neden
  -- öyle dediğini söylemiyorsa inanılacak ya da inanılmayacak bir iddiadır.
  classified_as text,
  classification_why text,

  -- Hangi kütükleri ilgilendirdiği. Teklif değil, işaret: tekliflerin
  -- kendisi 2. fazda gelir.
  touches text[] not null default '{}',

  -- Çıkarılan metnin uzunluğu ve kaç sayfadan geldiği. Maliyeti ve
  -- "bu belge gerçekten okunabildi mi" sorusunu cevaplar.
  extracted_chars int,
  page_count int,

  -- Neden başarısız olduğu. Durumla birlikte zorunlu.
  failure_reason text,

  -- M13-10'un alım tarafı: hangi model, ne kadar belirteç, ne kadar tuttu.
  model text,
  input_tokens int,
  output_tokens int,

  requested_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,

  -- Bir kanaat ya vardır ya yoktur. `ready` ise ne olduğu ve neden öyle
  -- olduğu dolu olmak zorunda; değilse boş.
  constraint document_intake_ready_has_a_verdict check (
    (state = 'ready') = (
      btrim(coalesce(classified_as, '')) <> '' and btrim(coalesce(classification_why, '')) <> ''
    )
  ),
  -- Gerekçesiz başarısızlık, kullanıcıya "olmadı" demekten başka bir şey
  -- söylemez.
  constraint document_intake_failure_is_reasoned check (
    (state = 'failed') = (btrim(coalesce(failure_reason, '')) <> '')
  ),
  -- Bitmiş bir alımın bitiş zamanı vardır.
  constraint document_intake_settled_has_a_time check (
    (state = 'analysing') = (finished_at is null)
  ),
  -- Belirteç sayıları ya ölçülür ya bilinmez; negatif olmaz.
  constraint document_intake_tokens_are_counts check (
    coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0
  )
);

comment on table document_intake is
  'Bir belgenin okunması ve ne olduğu hakkındaki kanaat (M13-13). Kayıt '
  'değildir: kasadaki bir sürüme bağlıdır, kendi gizliliği yoktur, ve '
  'tekliflerinin kayda dönüşmesi kullanıcı onayından geçer (M13-14).';

create index document_intake_by_version on document_intake (document_version_id);
create index document_intake_by_document on document_intake (document_id);

-- Sürüm ile belge birbirini tutmak zorunda. İkisi ayrı sütun olduğu için
-- politika alt sorgu yapmıyor; bedeli, tutarlılığın trigger ile korunması.
create or replace function app.intake_version_belongs_to_its_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_document uuid;
begin
  select document_id into v_document
  from document_versions
  where id = new.document_version_id;

  if v_document is null then
    raise exception 'that document version does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if v_document <> new.document_id then
    raise exception 'that version belongs to a different document'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger document_intake_version_matches
  before insert or update of document_version_id, document_id on document_intake
  for each row execute function app.intake_version_belongs_to_its_document();

-- ---------------------------------------------------------------------------
-- Erişim: alımı görmek belgeyi görmektir
-- ---------------------------------------------------------------------------

alter table document_intake enable row level security;
alter table document_intake force row level security;

create policy document_intake_read on document_intake
  for select using (app.can_see_document(document_id));

-- Analiz isteyen, belgeye yazabilen kişidir. Okuyabildiği ama
-- yazamadığı bir belgeyi analize sokmak, kasaya yeni bir satır eklemek
-- demektir ve yazma yetkisi ister.
--
-- `state = 'analysing'` koşulu bir açığı kapatıyor: update yetkisini
-- almak yetmiyordu. Satırı eklemeye hakkı olan istemci onu doğrudan
-- `ready` ve uydurma bir `classified_as` ile ekleyebilirdi — yani
-- sınıflandırma, modelin değil tarayıcının iddiası olabilirdi. Alım
-- başlar, bitmiş doğmaz.
create policy document_intake_insert on document_intake
  for insert with check (
    app.can_see_document(document_id)
    and app.can_write('document_vault', document_id)
    and requested_by = auth.uid()
    and state = 'analysing'
  );

-- Durumu ilerleten taraf edge fonksiyonudur, servis anahtarıyla. Tarayıcıya
-- update verilmiyor: bir alımın "ready" olduğunu istemcinin söylemesi,
-- sınıflandırmayı istemcinin uydurabilmesi demektir.
revoke update, delete on document_intake from authenticated;
grant select, insert on document_intake to authenticated;

-- Alımın kendisi bir denetim olayıdır: kim hangi belgeyi modele okuttu.
create trigger document_intake_audit
  after insert or update or delete on document_intake
  for each row execute function app.record_audit();

select app.reset_function_grants();

notify pgrst, 'reload schema';
