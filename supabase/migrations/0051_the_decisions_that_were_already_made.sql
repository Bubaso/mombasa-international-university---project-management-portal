-- Verilmiş kararları geri getir (M13-19, M13-20, M13-23).
--
-- 0050 canlıya uygulandıktan sonra ölçüm şunu söyledi: beş okumanın beşi de
-- "eski okuma" göründü, ikisinin dokuz ve iki kaydı olmasına rağmen. Yani
-- ekran, teklif aşaması kesinlikle çalışmış iki okumaya "bu okuma teklif
-- üretemeyen bir sürümle yapıldı, yeniden oku" diyecekti. Bu bir görüntü
-- kusuru değil, ekranın yalan söylemesiydi.
--
-- Sebep `proposals_at`'in yeni bir sütun olması: eski satırlarda boş, ve
-- 0050 boşluğu "aşama hiç çalışmadı" diye okuyor. Doğru okuma şu: **kararın
-- varlığı, aşamanın çalıştığının kanıtıdır.** Bir okumadan kayıt açılmışsa ya
-- da bir teklifi reddedilmişse, o okumanın teklif aşaması çalışmıştır ve
-- bunu bir zaman damgasına ihtiyaç duymadan biliyoruz. Görünüm artık öyle
-- soruyor; `proposals_at` ileriye dönük kalıyor ve geçmişe uydurma bir an
-- yazılmıyor.
--
-- İkinci ve daha önemli şey: **daha önce reddedilen 26 teklif hiçbir iz
-- bırakmamıştı.** 0049 reddi siliyordu, 0050 ise reddi kaydetmeye yeni
-- başladı — arada kalan kararlar yalnız denetim kaydında duruyor. İz
-- olmadığı için aynı belge yeniden okunduğunda o 26 şey yeniden teklif
-- edilirdi, yani kullanıcının verdiği karar geri alınmış olurdu. Denetim
-- kaydı silinen satırın tamamını `before` alanında tutuyor (0001), yani
-- kararlar kurtarılabilir ve kurtarılıyor.
--
-- Kurtarılanın neyi kurtarıp neyi kurtarmadığı:
--
--   - **Gerekçe modelin kendi cümlesi.** O gün kullanıcının yazacağı bir
--     gerekçe alanı yoktu; teklifin `why`'ı taşınıyor ve `note` boş kalıyor.
--     Olmayan bir gerekçeyi uydurmak, gerekçesiz bir reddi gizlemekten kötü.
--   - **Yirmi redde aktör var, altısında yok.** O altısını 0049'un kendisi
--     sildi; oraya bir kişi yazmak olmayan bir kişiyi yazmak olurdu.
--   - **Karar zamanı silmenin zamanı.** Karar o an verildi, yani bu
--     yaklaşıklık değil.
--   - **Yeniden kurulamayan satır atlanıyor.** Kütüğü, alıntısı ya da
--     gerekçesi boş gelen bir denetim satırından teklif geri getirilemez;
--     sayılıyor ve atlanıyor, çünkü yarısı eksik bir red kaydı, red
--     kaydından beklenen işi yapmaz.

-- ---------------------------------------------------------------------------
-- Reddi geri getir
-- ---------------------------------------------------------------------------
--
-- Politika yerine doğrudan yazılıyor: 0050'nin insert politikası mezar taşını
-- hâlâ ortada olan bir teklife bağlıyor ve burada teklifler tanım gereği
-- silinmiş durumda. Bu bir göç adımı, bir kullanıcı işlemi değil.

-- Kurtarma bir fonksiyon, bir kere çalıştırılan bir sorgu değil. Sebebi
-- ölçüm değil tekrar: politika testi bu kuralı sınamak zorunda ve göçün
-- içindeki bir sorgunun kopyasını sınarsa iki taraf ayrı düşer (CLAUDE.md
-- §4). Fonksiyon `app.` altında ve tarayıcıya verilmiyor; bu bir göç adımı.
create or replace function app.recover_rejections_from_audit()
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  insert into intake_rejections (
    intake_id, document_id, register, why, quote, proposed_values, decided_by, decided_at
  )
  select
    (a.before ->> 'intake_id')::uuid,
    (a.before ->> 'document_id')::uuid,
    a.before ->> 'register',
    a.before ->> 'why',
    a.before ->> 'quote',
    coalesce((a.before -> 'proposed_values')::jsonb, '{}'::jsonb),
    a.actor_id,
    a.at
  from audit_log a
  where a.entity_type = 'intake_proposals'
    and a.action = 'DELETE'
    -- Uygulanmış bir teklif silinmişse o bir red değil.
    and coalesce(a.before ->> 'state', '') <> 'applied'
    -- Yeniden kurulamayan satır atlanıyor: yarısı eksik bir red kaydı, red
    -- kaydından beklenen işi yapmaz.
    and btrim(coalesce(a.before ->> 'register', '')) <> ''
    and btrim(coalesce(a.before ->> 'why', '')) <> ''
    and btrim(coalesce(a.before ->> 'quote', '')) <> ''
    and exists (select 1 from document_intake i where i.id = (a.before ->> 'intake_id')::uuid)
    and exists (select 1 from document_vault d where d.id = (a.before ->> 'document_id')::uuid)
  on conflict (document_id, register, quote_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function app.recover_rejections_from_audit() is
  'Denetim kaydındaki silinmiş teklifleri red kaydına çevirir (0051). '
  'Yeniden çağrılabilir: aynı karar ikinci bir satır açmaz.';

select app.recover_rejections_from_audit();

-- ---------------------------------------------------------------------------
-- Kuyruk: kararın varlığı aşamanın çalıştığının kanıtı
-- ---------------------------------------------------------------------------
--
-- 0050'nin sırası `proposals_at is null` koşulunu `settled`'dan önce
-- koyuyordu, yani sütunu olmayan her eski okuma "eski okuma" oluyordu.
-- Artık soru tersten soruluyor: aşamanın çalıştığına dair bir kanıt var mı —
-- kaydedilmiş bir an, açılmış bir kayıt, ya da verilmiş bir red. Üçü de
-- yoksa gerçekten bilinmiyor, ve o zaman "yeniden oku" doğru teklif.
--
-- Hiç teklif üretmemiş bir okuma ile aşamanın hiç çalışmadığı bir okuma, bu
-- satırdan sonra da ayırt edilemiyor: ikisi de kanıtsız. 0050'den sonraki
-- okumalarda ayrım `proposals_at` ile netleşiyor; öncesi için ayrımı
-- uydurmak yerine ikisine de aynı şey teklif ediliyor.

create or replace view intake_queue with (security_invoker = true) as
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
  case
    when i.state = 'analysing' then 'reading'
    when i.state = 'failed' then 'unreadable'
    when coalesce(p.pending, 0) > 0 then 'awaiting_decision'
    when i.proposals_at is not null
      or coalesce(p.applied, 0) > 0
      or coalesce(r.rejected, 0) > 0 then 'settled'
    else 'read_before_proposals'
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
  'durumu. Bir okumanın teklif aşamasının çalıştığını üç şeyden biri '
  'gösterir: kaydedilmiş an, açılmış kayıt, verilmiş red (0051).';

select app.reset_function_grants();

notify pgrst, 'reload schema';
