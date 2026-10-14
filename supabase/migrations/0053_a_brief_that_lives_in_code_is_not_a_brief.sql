-- ---------------------------------------------------------------------------
-- Duruşma brifingi ve içtihat kütüphanesi, veri olarak (M5-12, M5-13, M5-17)
-- ---------------------------------------------------------------------------
--
-- M5-12 bunu kelimesi kelimesine istiyor: "beklenen sorular, cevaplar,
-- içtihat, savunma sütunları — **veri olarak**, koda gömülü değil". 5 Ekim
-- 2026'da ölçüldü: hâlâ koda gömülüydü. `LegalAffairsView` beş bloğu JSX
-- dizisi olarak tutuyordu — temyiz itirazları 124 satır, duruşma brifingi 200,
-- heyet soru-cevapları 98, Yargıtay içtihatları 88, ziyaret planı 91.
--
-- Gömülü olmanın bedeli ekranın kendi uyarısında yazılıydı: "hiçbiri
-- sistemdeki bir belgeye veya karara bağlı değildir ve güncelliği
-- doğrulanmamıştır". Bir duruşmaya bu metinle gidilmiyor; gidilen şey asıl
-- evrak. Yani blok, güncellenmediği için değil, güncellenemediği için
-- doğrulanmamıştı: kaydı değiştirmek bir dağıtım gerektiriyordu.
--
-- Brifingin başlığı için tablo YOK ve olmamalı. `bench` zaten
-- `hearings.bench`, dava adı `legal_cases`, kayıttaki avukat
-- `case_counsel.state = 'on_record'`. Üçünü yeniden tutmak, dördüncü bir
-- doğruluk kaynağı açmak olurdu (CLAUDE.md §4).

-- ---------------------------------------------------------------------------
-- Ortak kolonlar: migration'a özel yardımcı
-- ---------------------------------------------------------------------------
--
-- Bu yardımcı şemada KALMIYOR: tanımlanıyor, kullanılıyor ve sonunda
-- düşürülüyor — 0043 ve 0045'in yaptığı gibi. Kalıcı bir yardımcı, her tablonun
-- gizlilik ve denetim kolonlarını tek yerden değiştirebilen bir kol demek
-- olurdu; migration'a özel olanı, bir kez çalışıp gidiyor.

create or replace function app.add_common_columns(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists confidentiality confidentiality not null default 'internal',
      add column if not exists created_by uuid references profiles (id),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_by uuid references profiles (id),
      add column if not exists updated_at timestamptz not null default now();
  $f$, p_table);

  execute format(
    'create trigger %I before insert or update on %s for each row execute function app.touch_row()',
    'touch_' || p_table::text, p_table);

  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function app.record_audit()',
    'audit_' || p_table::text, p_table);
end;
$$;

-- ---------------------------------------------------------------------------
-- Temyiz itirazları (M5-17)
-- ---------------------------------------------------------------------------
--
-- M5-17 bu migration'la birlikte yazıldı. Dokuz itiraz koda gömülüydü ve
-- hiçbir gereksinim satırı onları istemiyordu — yani ürün dokümanının
-- bilmediği bir şey ekranda duruyordu. Satırı yazmadan tablo açmak,
-- gereksinimi koddan uydurmak olurdu.
--
-- Sıra numarası `ordinal` ve bir dava içinde tekil: temyiz dilekçesindeki
-- "1. itiraz" mahkeme kaydında bir numaradır, listedeki yeri değil. İki
-- itirazın aynı numarayı taşıdığı bir dosya, mahkemeye öyle sunulmamıştır.
create table appeal_grounds (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  ordinal int not null check (ordinal > 0),
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  -- İtirazın dayandığı karar paragrafı. Gömülü metin bunu düzyazıda
  -- söylüyordu ("Hâkim 142. paragrafta…"); bir alan olarak durduğunda
  -- aranabiliyor ve kararın kendisiyle karşılaştırılabiliyor.
  judgment_paragraph text,

  unique (legal_case_id, ordinal)
);

select app.add_common_columns('appeal_grounds');
create index appeal_grounds_case_idx on appeal_grounds (legal_case_id);

-- ---------------------------------------------------------------------------
-- İçtihat kütüphanesi (M5-13)
-- ---------------------------------------------------------------------------
--
-- Gereksinim dört şey istiyor: atıf, kullanım amacı, lehimize/aleyhimize,
-- ilke özeti. Dördü de burada.
--
-- `favours` iki değerli ve gereksinimin kendi kelimeleriyle: bu kütük AUTK'nin
-- kütüğü, "lehimize" AUTK lehine demek. M5-16 dış avukatın yalnızca kendi
-- dosyasını görmesini istiyor ve gizlilik seviyesi bunu zaten tutuyor, yani
-- bakış açısı taşıyan bir alanın okuyucusu da kısıtlı.
create type authority_side as enum ('ours', 'theirs');

create table legal_authorities (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  -- Atıf serbest metin, çünkü bir içtihadın adı mahkemenin verdiği addır;
  -- normalleştirilmiş bir biçime zorlamak atfı bozar.
  citation text not null check (btrim(citation) <> ''),
  favours authority_side not null,
  principle_en text not null check (btrim(principle_en) <> ''),
  principle_tr text,
  -- Ne için kullanıldığı. Bir içtihat ilkesiyle değil, kullanıldığı yerle
  -- işe yarıyor: aynı ilke iki ayrı itirazda ayrı şey yapar.
  use_note_en text,
  use_note_tr text,
  -- Kararın kendisi kasada varsa ona bağlı. Yoksa null, ve null "belge yok"
  -- demek — "aranmadı" demek değil, çünkü aranıp bulunamadığı da budur.
  document_id uuid references document_vault (id),

  unique (legal_case_id, citation)
);

select app.add_common_columns('legal_authorities');
create index legal_authorities_case_idx on legal_authorities (legal_case_id);

-- ---------------------------------------------------------------------------
-- Beklenen heyet soruları ve savunma sütunları (M5-12)
-- ---------------------------------------------------------------------------
--
-- `topic` **enum değil, serbest metin** ve bu kasıtlı. İstemcideki tip
-- `'stay' | 'contempt' | 'trustees' | 'wall_repair' | 'jurisdiction'` diyordu;
-- `wall_repair` bu uyuşmazlığın bir olgusu. Bir davanın olgusunu Postgres
-- enum'una koymak şemayı o davaya bağlar: ikinci bir dosya kendi konusunu
-- eklemek için migration isterdi, ve enum sapması testi istemciyi tek davaya
-- özgü değerlere bağlardı.
create table bench_questions (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  -- Soru belli bir duruşma için hazırlandıysa ona bağlı. Değilse null:
  -- dosyanın genel soruları da var ve tarihi olmayan bir hazırlık yok sayılmaz.
  hearing_id uuid references hearings (id) on delete set null,
  topic text not null check (btrim(topic) <> ''),
  question_en text not null check (btrim(question_en) <> ''),
  question_tr text,
  answer_en text,
  answer_tr text
);

select app.add_common_columns('bench_questions');
create index bench_questions_case_idx on bench_questions (legal_case_id);

-- Savunma sütunları: itiraz değil, bir iddiaya karşı duruş. Gömülü hâlinde
-- "contemptDefencePillars" adıyla duruyordu ve itaatsizlik başvurusuna
-- özeldi; tablo hangi iddiaya karşı olduğunu `against` ile söylüyor, yani
-- ikinci bir başvuru geldiğinde ad değiştirmek gerekmiyor.
create table defence_pillars (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  ordinal int not null check (ordinal > 0),
  against text not null check (btrim(against) <> ''),
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,

  unique (legal_case_id, against, ordinal)
);

select app.add_common_columns('defence_pillars');
create index defence_pillars_case_idx on defence_pillars (legal_case_id);

-- ---------------------------------------------------------------------------
-- Bir davadan doğan aksiyon, davayı söylemek zorunda
-- ---------------------------------------------------------------------------
--
-- `action_items` 0007'den beri toplantıya ve karara bağlanıyor ama davaya
-- bağlanmıyordu. Hukuk ekranının "Kenya ziyaret planı" sekmesi bu yüzden
-- numaralı bir strateji planını koda gömülü tutuyordu: adımların her biri
-- aslında bir aksiyon, ve aksiyonun kütüğü sorumlu ile tarihi **zorunlu**
-- tutuyor (M3-02) — gömülü plan ikisini de taşımıyordu.
--
-- Kronolojide aynı bağ 0024'ten beri var (`chronology_entries.legal_case_id`)
-- ve sebebi aynı: dosyadan doğan bir kaydı dosyada göremiyorsanız, kaydeden
-- kişi kaydının kaybolduğunu sanar.
alter table action_items
  add column if not exists legal_case_id uuid references legal_cases (id) on delete set null;

create index if not exists action_items_case_idx on action_items (legal_case_id);

-- ---------------------------------------------------------------------------
-- Erişim: dört tablo da davanın çocuğu
-- ---------------------------------------------------------------------------
--
-- 0009'un kalıbı aynen: okuma `can_see_case_child`, yazma
-- `can_keep_legal_record`. Kural burada tekrar YAZILMIYOR, çağrılıyor —
-- sapan kopya her zaman ikincisidir (CLAUDE.md §4).

alter table appeal_grounds enable row level security;
alter table appeal_grounds force row level security;
alter table legal_authorities enable row level security;
alter table legal_authorities force row level security;
alter table bench_questions enable row level security;
alter table bench_questions force row level security;
alter table defence_pillars enable row level security;
alter table defence_pillars force row level security;

create policy appeal_grounds_read on appeal_grounds
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy appeal_grounds_insert on appeal_grounds
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy appeal_grounds_update on appeal_grounds
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy appeal_grounds_delete on appeal_grounds
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy legal_authorities_read on legal_authorities
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy legal_authorities_insert on legal_authorities
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy legal_authorities_update on legal_authorities
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy legal_authorities_delete on legal_authorities
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy bench_questions_read on bench_questions
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy bench_questions_insert on bench_questions
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy bench_questions_update on bench_questions
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy bench_questions_delete on bench_questions
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy defence_pillars_read on defence_pillars
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy defence_pillars_insert on defence_pillars
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy defence_pillars_update on defence_pillars
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy defence_pillars_delete on defence_pillars
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
