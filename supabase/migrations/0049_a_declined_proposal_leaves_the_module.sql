-- Reddedilen teklif modülden çıkar (M13-14).
--
-- 0048 reddi bir durum olarak tutuyordu: `declined`, kim ve ne zaman.
-- Kullanıcının isteği başka: reddedilen teklif listeden ve kayıttan tamamen
-- kalksın, hiçbir yerde görünmesin. İsteği karşılamak, bu depoda kaydın
-- kaybolması anlamına gelmiyor ve bu yüzden karşılanabilir:
--
--   **Denetim kaydı silmeyi tutuyor.** `app.record_audit()` DELETE'te
--   `before`'a satırın tamamını yazıyor (0001). Yani teklif gider, ama
--   teklifin metni, alıntısı, önerdiği değerler, silen kişi ve zamanı
--   `audit_log`'da kalır. Bir eylemin kaydı, eylemlerin kaydedildiği yerde
--   durur; teklif listesi bir iş kuyruğudur, arşiv değil.
--
-- İki şey silinemez ve ikisi de kasıtlı:
--
--   1. **Uygulanmış teklif.** Açtığı kaydın belgeye bağı odur:
--      `created_record_id` ile `document_id` aynı satırda duruyor. Silmek,
--      kütükteki kaydın nereden geldiğini unutmak demektir.
--   2. **Başkasının belgesine ait teklif.** Silmek de bir yazma işlemidir
--      ve aynı yetkiyi ister: belgeye yazabilen kişi.

create policy intake_proposals_discard on intake_proposals
  for delete using (
    app.can_see_document(document_id)
    and app.can_write('document_vault', document_id)
    and state <> 'applied'
  );

-- Politikanın `state <> 'applied'` kısmı burada yeterli ve 0048'deki hatanın
-- tekrarı değil: orada koşul bir UPDATE'i sessizce sıfır satıra düşürüyordu,
-- çünkü güncelleme "oldu" sanılabilirdi. Silme de sıfır satır siler, ama
-- istemci silinen satır sayısını okuyup kullanıcıya söylüyor — sessiz
-- kalmıyor.

grant delete on intake_proposals to authenticated;

-- Bu kuraldan önce reddedilmiş olanlar da gider. Denetim trigger'ı her birini
-- `before` alanında tamamıyla saklıyor, yani kayıt kaybolmuyor; yalnız iş
-- kuyruğundan çıkıyor. Aktörü boş görünecek, çünkü bunu bir kişi değil bu
-- migration yapıyor — ve öyle yazmak, olmayan bir kişiyi yazmaktan iyidir.
delete from intake_proposals where state = 'declined';

select app.reset_function_grants();

notify pgrst, 'reload schema';
