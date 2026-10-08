-- ---------------------------------------------------------------------------
-- Alımın kapsamı bir kayıttır, bir sabit değil (M13-17)
-- ---------------------------------------------------------------------------
--
-- M13-17: "Modül her yazılabilir kayıt türüne teklif verebilir; kapsamı
-- veritabanındaki kayıttan gelir, koddan değil."
--
-- ÖNCE BİR DÜZELTME: denetim dosyası bu satırı `rules.js`'teki `REGISTERS`
-- sabitine bağlıyordu ve o yorum eskimişti. 8 Ekim 2026'da ölçüldü:
-- `REGISTERS` yalnızca `readClassification`'ı besliyor, o da hiçbir canlı
-- fonksiyondan çağrılmıyor — `document-intake` `readProposals` çağırıyor.
-- Yani kapsamı bugün yöneten şey `targets.js`'teki `PROPOSAL_TARGETS` (23
-- hedef). `REGISTERS`'ı veritabanına taşımak hiçbir şeyi kapatmazdı: ölü bir
-- listeyi taşımak olurdu.
--
-- NE TAŞINIYOR, NE TAŞINMIYOR — VE NEDEN
--
-- Taşınan: **hangi** kayıt türlerinin kapsamda olduğu. Bu bir yetki kararı
-- ("asistan hukuk kütüğüne teklif verebilsin mi") ve bir kararın yeri bir
-- kayıttır.
--
-- Taşınmayan: her hedefin **alan şeması** (`targets.js`, 1.379 satır). Sebebi
-- CLAUDE.md §4: o şema üç şeyi birden besliyor — modele gönderilen şema, onay
-- formu, ve yazan fonksiyon (`src/api/proposals.ts`). Yazan fonksiyon kodda
-- olduğu sürece alan listesini veritabanına taşımak, kaçınılmaz olarak sapan
-- bir kopya üretir: veritabanı bir alan ekler, yazan fonksiyon onu yazmaz, ve
-- teklif sessizce eksilir.
--
-- Bu yüzden iki yön de kapıya bağlı (`tests/intake.mjs`): kapsamdaki her
-- anahtarın kodda bir şeması ve bir yazıcısı olmak zorunda, ve koddaki her
-- hedefin burada bir satırı olmak zorunda. Birincisi "veritabanı yazamayacağı
-- bir şeyi kapsama almasın" diyor, ikincisi "kodda sessizce yeni bir hedef
-- açılmasın".
--
-- KAPSAM OKUNAMAZSA ALIM BAŞARISIZ OLUR, KODA DÜŞMEZ. Koda düşmek tam olarak
-- M13-17'nin yasakladığı şey; "tablo yoktu, ben de listeyi koddan aldım"
-- cümlesi kapsamın koddan gelmesinin kendisidir.

create table intake_targets (
  -- `id` var ve `key` birincil anahtar DEĞİL, ve sebebi ölçülerek bulundu.
  --
  -- İlk yazışımda `key` birincil anahtardı. `app.record_audit()` denetim
  -- satırının `entity_id`'sini `to_jsonb(new) ->> 'id'` ile alıyor; `id`
  -- kolonu olmayan bir tabloda o ifade null döndürüyor ve hata vermiyor.
  -- Yani kapsam değişikliklerinin denetim kaydı yazılıyordu ama HANGİ
  -- hedefe ait olduğu yalnızca `before`/`after` içinde kalıyordu — bir
  -- hedefin geçmişini sorgulamak imkânsızdı. Sessizce bozulan bir denetim
  -- kaydı, olmayandan kötüdür: var sanılır.
  id uuid primary key default gen_random_uuid(),

  -- Koddaki şemanın anahtarıyla aynı. Desen kasıtlı: bir anahtar kod
  -- tanımlayıcısı olmak zorunda, çünkü karşılığı bir kod anahtarı.
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),

  -- Kapsamdan çıkarmak satırı silmek değil. Silinen bir satır "bu hedef hiç
  -- var olmadı" der; kapatılan bir satır "birinin kararıyla kapalı" der ve
  -- denetim kaydı o kararı taşır.
  enabled boolean not null default true,

  -- Modele gönderilen brifingin sırası. Tekil: iki hedefin sırası aynıysa
  -- hangisinin önce geldiği belirsizdir ve belirsiz bir sıra her koşuda
  -- başka bir brifing demek.
  sequence int not null unique,

  note text,

  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

comment on table intake_targets is
  'M13-17. Alımın kapsamı: asistanın hangi kayıt türlerine teklif '
  'verebileceği. Her hedefin ALAN ŞEMASI kodda kalıyor (targets.js), çünkü '
  'yazan fonksiyon kodda — alan listesini buraya taşımak sapan kopyayı '
  'yaratmak olurdu. Burada duran şey bir yetki kararı, bir form değil.';

create trigger touch_intake_targets before insert or update on intake_targets
  for each row execute function app.touch_row();
create trigger audit_intake_targets after insert or update or delete on intake_targets
  for each row execute function app.record_audit();

alter table intake_targets enable row level security;
alter table intake_targets force row level security;

-- Kapsam bir sır değil ve saklanması kimseye bir şey kazandırmaz: asistanın
-- neye teklif verebildiğini görmek, teklifi okuyan herkesin işine yarar.
-- `approval_thresholds_read` ile aynı gerekçe (0015).
create policy intake_targets_read on intake_targets
  for select using (app.current_clearance() is not null);

create policy intake_targets_write on intake_targets
  for all using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Bugünün kapsamı, kayda geçiyor
-- ---------------------------------------------------------------------------
--
-- Yirmi üç hedef, koddaki sıralarıyla. Sıra numaraları onluk: araya bir hedef
-- sokmak bütün listeyi yeniden numaralamayı gerektirmesin.
--
-- `note` boş bırakılıyor ve bu kasıtlı. Bu satırlar bir insanın kararı değil,
-- kodun o günkü hâlinin kaydı; uydurulmuş bir gerekçe ("mütevelli kararı")
-- gerekçesi olmayandan kötüdür (CLAUDE.md §2). Biri bir hedefi kapattığında
-- gerekçesini oraya yazar.

insert into intake_targets (key, enabled, sequence) values
  ('obligation', true, 10),
  ('chronology', true, 20),
  ('correspondence', true, 30),
  ('action', true, 40),
  ('risk', true, 50),
  ('hearing', true, 60),
  ('filing', true, 70),
  ('order', true, 80),
  ('meeting', true, 90),
  ('decision', true, 100),
  ('question', true, 110),
  ('stakeholder', true, 120),
  ('interaction', true, 130),
  ('milestone', true, 140),
  ('issue', true, 150),
  ('assumption', true, 160),
  ('legal_opinion', true, 170),
  ('exhibit', true, 180),
  ('transaction', true, 190),
  ('inspection', true, 200),
  ('procurement_request', true, 210),
  ('budget_line', true, 220),
  ('valuation', true, 230);

select app.reset_function_grants();
