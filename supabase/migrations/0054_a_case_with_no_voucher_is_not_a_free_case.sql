-- ---------------------------------------------------------------------------
-- Dosya bazında hukuk harcaması (M5-09)
-- ---------------------------------------------------------------------------
--
-- M5-09 şunu istiyor: "Hukuk harcaması takibi: dosya bazında; M8 bütçesine
-- bağlı". 8 Ekim 2026'da ölçüldü: `payment_vouchers` bir bütçe satırına
-- (`budget_line_id`) ve bir hakedişe (`valuation_id`) bağlanabiliyor, ama
-- hiçbir sütun bir ödemenin hangi davaya ait olduğunu söylemiyor.
--
-- Yani "bu dava bize ne kadara mal oldu" sorusu **zor** değildi,
-- cevaplanamazdı. Avukat ücreti ödenmişti, fiş kayıtlıydı, bütçe satırına
-- bağlıydı — ama davaya bağlı değildi. Toplamı çıkarmak için fişlerin
-- `purpose` metnini okuyup hangisinin hangi dosya olduğuna karar vermek
-- gerekiyordu, ki bu bir ölçüm değil bir tahmindir.
--
-- Bu göç bir sütun, bir indeks, bir görünüm ve üç politika değişikliği
-- getiriyor. Tek yeni gerçek: bir fişin davası.

alter table payment_vouchers
  add column legal_case_id uuid references legal_cases (id) on delete set null;

comment on column payment_vouchers.legal_case_id is
  'Bu ödemenin ait olduğu dava (M5-09). Davası olmayan ödeme için null — '
  'hukuk harcaması olmayan ödeme bunların çoğu. `on delete set null`: bir '
  'dava kaydı silinse ödeme kaydı durur, çünkü para gerçekten çıktı.';

create index payment_vouchers_case_idx on payment_vouchers (legal_case_id);

-- ---------------------------------------------------------------------------
-- Sütunun açtığı delik
-- ---------------------------------------------------------------------------
--
-- Bu sütun bir erişim sonucu doğuruyor ve onu kapatmak sütunu eklemenin
-- parçası. `payment_vouchers_read` bugün "parayı görebiliyor musun" diye
-- soruyor; davayı görebiliyor musun diye sormuyordu, çünkü sormasına gerek
-- yoktu. Artık var: `restricted` bir davaya bağlı bir fiş, o davayı göremeyen
-- ama parayı gören birine davanın **varlığını** söylerdi — numarasını,
-- adını değil, ama bir dava olduğunu ve ona para harcandığını.
--
-- `app.can_see_case_child` bu deponun dava alt kaydı deyimi: 0009'dan beri
-- duruşma, layiha, delil, vekâlet hepsi onunla korunuyor. Sekizinci bir
-- kopya yazmak yerine aynısı kullanılıyor (CLAUDE.md §4).
--
-- Gizliliği davadan fişe **taşıyan bir trigger yazılmadı** ve bu kasıtlı.
-- Politika kuralın kendisi; bir de trigger, aynı kuralı iki yere yazmak
-- olurdu ve sapan kopya her zaman ikincisidir.

drop policy payment_vouchers_read on payment_vouchers;
create policy payment_vouchers_read on payment_vouchers
  for select using (
    app.can_read(confidentiality)
    and (app.can_see_money() or requested_by = auth.uid())
    and (legal_case_id is null or app.can_see_case_child(confidentiality, legal_case_id))
  );

drop policy payment_vouchers_insert on payment_vouchers;
create policy payment_vouchers_insert on payment_vouchers
  for insert with check (
    app.can_read(confidentiality)
    and requested_by = auth.uid()
    and (legal_case_id is null or app.can_see_case_child(confidentiality, legal_case_id))
  );

drop policy payment_vouchers_update on payment_vouchers;
create policy payment_vouchers_update on payment_vouchers
  for update
  using (
    app.can_read(confidentiality)
    and (app.can_spend() or app.acts_as('trustee', 'board_director')
         or (requested_by = auth.uid() and state = 'requested'))
    and (legal_case_id is null or app.can_see_case_child(confidentiality, legal_case_id))
  )
  with check (
    (app.can_spend() or app.acts_as('trustee', 'board_director')
     or (requested_by = auth.uid() and state in ('requested', 'withdrawn')))
    and (legal_case_id is null or app.can_see_case_child(confidentiality, legal_case_id))
  );

-- ---------------------------------------------------------------------------
-- Dava başına harcama (M5-09, M8-02 ile aynı kelimeler)
-- ---------------------------------------------------------------------------
--
-- Sözlük `budget_position`'dan alındı ve kasten aynı: **taahhüt** onaylanmış
-- ve henüz ödenmemiş, **ödenen** ödenmiş. İki ekranda iki ayrı "harcama"
-- tanımı olsaydı, hangisinin hangisi olduğunu kimse bilemezdi.
--
-- Reddedilen ve geri çekilen fişlerin **tutarı toplanmıyor, sayısı
-- yazılıyor**. Reddedilmiş bir fiş bir harcama değil; tutarını bir sütuna
-- koymak birinin onu toplama eklemesine davetiye olurdu. Sayı ise gerçek bir
-- bilgi: bu dosyada ödeme talebi reddedilmiş.
--
-- Üç ayrı bilinmezlik, üçü ayrı ayrı adlandırılıyor — ve bu görünümün bütün
-- mesele ettiği şey (CLAUDE.md §2):
--
--   **Parayı göremiyorsan** sayılar `null`, `money_visible` false. `count()`
--   boş kümede 0 döner ve o 0 "bağlı fiş yok" diye okunur — oysa doğru cevap
--   "bunu göremezsin". Bu yüzden sayılar da `case when` arkasında: veri
--   seviyesinde yanlış okunabilen bir sıfır bırakmıyoruz.
--
--   **Görebiliyorsan ve `voucher_count` 0 ise** bu gerçek bir ölçüm: bu
--   davaya bağlı kayıtlı fiş yok. Harcama olmadığı anlamına **gelmez** —
--   bağlanmamış bir fiş de olabilir — ve ekran bunu bu kelimelerle söylüyor.
--
--   **`voucher_count` > 0 ama `paid_kes` null ise** talep var, ödeme yok.
--
-- `unbudgeted_count` M5-09'un "M8 bütçesine bağlı" yarısının dürüst kısmı:
-- bir dava masrafının bütçe satırı yoksa o masraf bütçede değildir. Toplamı
-- gösterip "bütçeye bağlı" demek, kaçının bağlı olmadığını saklamak olurdu.

create view legal_case_spend with (security_invoker = true) as
select
  c.id as legal_case_id,
  c.case_number,
  c.title,
  c.confidentiality,
  app.can_see_money() as money_visible,
  case when app.can_see_money() then count(v.id) end as voucher_count,
  case when app.can_see_money() then count(v.id) filter (where v.state = 'requested') end
    as awaiting_count,
  case when app.can_see_money() then count(v.id) filter (where v.state = 'rejected') end
    as rejected_count,
  case when app.can_see_money() then count(v.id) filter (where v.state = 'withdrawn') end
    as withdrawn_count,
  case when app.can_see_money()
       then count(v.id) filter (where v.id is not null and v.budget_line_id is null) end
    as unbudgeted_count,
  case when app.can_see_money() then count(distinct v.budget_line_id) end
    as budget_line_count,
  (sum(v.amount_kes) filter (where v.state = 'requested'))::numeric(18, 2) as awaiting_kes,
  (sum(v.amount_kes) filter (where v.state = 'approved'))::numeric(18, 2) as committed_kes,
  (sum(v.amount_kes) filter (where v.state = 'paid'))::numeric(18, 2) as paid_kes,
  max(v.paid_at) filter (where v.state = 'paid') as last_paid_at
from legal_cases c
left join payment_vouchers v on v.legal_case_id = c.id
group by c.id, c.case_number, c.title, c.confidentiality;

comment on view legal_case_spend is
  'Dava başına hukuk harcaması (M5-09). Taahhüt onaylanmış, ödenen ödenmiş — '
  'budget_position ile aynı sözlük. Reddedilen fişin tutarı değil sayısı var, '
  'çünkü reddedilmiş bir fiş harcama değildir. Parayı göremeyen için bütün '
  'sayılar null ve money_visible false: boş kümede 0 dönen bir count, '
  '"bağlı fiş yok" diye okunur ve bu yanlış cevaptır.';

grant select on legal_case_spend to authenticated;

-- Bu göç fonksiyon oluşturmuyor, ama görünüm `app.can_see_money()` çağırıyor
-- ve o fonksiyonun EXECUTE'u yerinde olmak zorunda. Çağrı toptan grant değil;
-- ölçüm 0026'nın kurduğu durumu geri getiriyor.
select app.reset_function_grants();
