# Kapsam denetimi — 210 modül gereksinimi

Bu dosya `docs/URUN-GEREKSINIMLERI.md`'nin **modül** satırlarını (`M*`)
**atıf değil özellik** olarak ölçer. `N*` (fonksiyonel olmayan) ve `G*` (göç)
satırları kapsam dışı: ilki bir özellik değil bir nitelik, ikincisi bir kerelik
bir iş ve sonucu `docs/NOTION-GOC.md`'de. Ayrımın nedeni ölçümün kendisi: satır kimliklerini depoda
grep'lemek yalnızca hangi migration'ın bir ID yazdığını sayar, hangi özelliğin
var olduğunu saymaz. İlk deneme 43 satırı "atıfsız" diye bildirdi; örneklemede
M7-05, M9-06, M2-03 ve M4-02 yapılmış ama anılmamış çıktı.

**Yöntem.** Her satır için o özelliğin kanıtı arandı: bir tablo, bir enum, bir
sütun, bir fonksiyon, bir görünüm, bir ekran bileşeni ya da bir assertion.
Yalnızca `supabase/migrations`, `supabase/functions`, `src` ve `tests`
sayıldı — `supabase/bundled` üretilmiş çıktı olduğu için hariç, yoksa her
desen iki kez eşleşiyor.

**Tarih:** 2026-10-08 · migration 0055'e kadar. (İlk hâli: 2026-10-01, 0044'e
kadar.)

## Özet

| Durum      | Satır |
| ---------- | ----- |
| Yapıldı    | 185   |
| Yok        | 25    |
| **Toplam** | 210   |

Öncelik dağılımı: P0 22 satır (1'i yok), P1 115 satır (2'si yok), P2 59 satır
(22'si yok), P3 14 satır (**hepsi yapıldı**).

### 8 Ekim 2026 güncellemesi — ve başlıktaki sayı hakkında bir düzeltme

Bu dosyanın ilk hâli 2026-10-01 tarihliydi ve 0044'e kadar ölçüyordu. O gün
`M*` satırı 197'ydi; bugün **210**. Aradaki **13 satır** denetimin hiç
görmediği satırlar: belge asistanı turunun on ikisi (M13-13…M13-24) ve
M5-17 (temyiz itirazları kütüğü).

On üçü tek tek teyit edildi ve **on ikisi yapılmış**. Biri yapılmamış ve
aşağıdaki P1 listesine eklendi: **M13-17**.

Bir şeyi açıkça söylüyorum: başlıkta "197 gereksinim satırı" yazıyordu ve bu
**eksik bir ifadeydi**, yanlış bir sayı değil. 197 o günün `M*` sayısıydı;
dokümanın o günkü toplamı 240'tı (197 `M*` + 37 `N*` + 6 `G*`). Başlık hangi
kümeyi saydığını söylemediği için dosyayı sonradan okuyan biri — ben — onu
dokümanın toplamı sanıp "denetim 56 satır eskimiş" diye ölçtü. Eskimişliği 13
satırdı. **Hangi kümeyi saydığını söylemeyen bir sayı, yanlış bir sayıdan
daha kötüdür**: ikincisi düzeltilir, birincisi her okunduğunda yeniden yanlış
anlaşılır.

Toplam artık `tests/doc-counts.mjs` içinde ölçülüyor ve dokümanın `M*` satır
sayısına bağlı — yani bir gereksinim eklenip burası güncellenmezse kapı düşer.

### M5-09 kapandı — göç 0054

Dosya bazında hukuk harcaması. Eksik olan şey bir hesap değil bir **bağ**'dı:
`payment_vouchers` bir bütçe satırına ve bir hakedişe bağlanabiliyordu, bir
davaya bağlanamıyordu. "Bu dava bize ne kadara mal oldu" sorusu zor değildi,
cevaplanamazdı — toplamı çıkarmak fişlerin gerekçe metnini okuyup hangisinin
hangi dosya olduğuna karar vermek demekti, ki bu bir ölçüm değil bir tahmin.

0054 bir sütun (`legal_case_id`), bir indeks, bir görünüm (`legal_case_spend`)
ve üç politika değişikliği getirdi. Politikalar sütunun açtığı deliği
kapatıyor: `restricted` bir davaya bağlı bir fiş, o davayı göremeyen ama
parayı gören birine davanın varlığını söylerdi.

Görünüm üç bilinmezliği ayırıyor — yetki yok, kayıt yok, kayıt var — ve
sayıları parayı göremeyen için `null` bırakıyor, çünkü boş kümede 0 dönen bir
`count()` "bağlı fiş yok" diye okunur ve bu yanlış cevaptır. `unbudgeted_count`
M5-09'un "M8 bütçesine bağlı" yarısının dürüst kısmı: bir dava masrafının
bütçe satırı yoksa o masraf bütçede değildir, ve toplamı gösterip "bütçeye
bağlı" demek kaçının bağlı olmadığını saklamak olurdu.

Onbeş assertion `tests/db/policies.test.sql`'de, yedisi mutasyonla sınandı ve
yedisi de düştü. Yedincisi ilk denemede **düşmedi**: fikstürde davaya bağlı
iki fiş vardı, biri bütçeli biri bütçesiz, yani "bütçesizleri say" ile
"bütçelileri say" aynı cevabı (1) veriyordu. Üçüncü bir fiş eklendi ve
mutasyon düştü. Ayırt edici olmayan bir fikstür, ayırt edici olmayan bir test
demek.

### M1-11 kapandı — göç 0055, ve bir kapı körlüğü

Altı ayda bir erişim gözden geçirme listesi. Portalda erişimin **verilmesi**
kayıtlıydı (davet, devir) ve **süresi** kayıtlıydı (M1-09); kayıtlı olmayan
tek şey birinin dönüp bakmış olmasıydı.

0055 bir enum, bir tablo (`access_reviews`, yalnız eklenir), iki trigger, iki
politika ve bir görünüm (`access_review_queue`) getirdi. Kuyruk dört sebebi
ayrı ayrı adlandırıyor ve `null` bir tarihi "çok eski" saymıyor: "hiç gözden
geçirilmedi" ile "altı aydan eski" ayrı cümlelerdir.

**Son giriş zamanı bu kuyrukta yok, ve sebebini yazdım.** Bu satırı denetime
"`profiles.expires_at` ve son giriş zamanından türetilen bir kuyruk" diye ben
yazmıştım ve son girişin elimde olduğunu varsaymıştım. İki sebep çıktı:
`auth.users` istemciye kapalı (0006 bunu zaten söylüyor), ve Supabase'in
`last_sign_in_at`'i token yenilemede güncellenmiyor — yani o sayıdan kurulan
bir uykuda-hesap listesi en aktif kullanıcıları işaretler. Onun yerine
portalın kendi denetim kaydı kullanıldı ve adı doğru konuldu:
`last_action_at`, "son giriş" değil "portalda son kayıtlı işlem".

Yirmi dokuz assertion, on iki mutasyon, on ikisi de düştü. Biri ilk denemede
yanlış şeyi bekliyordu: append-only trigger'ı `authenticated` için hiç
ateşlenmiyor, çünkü UPDATE politikası olmadığı için satır seviyesi güvenlik
güncellemeyi sıfır satıra indiriyor. İki katman ayrı ayrı sınandı —
politika `authenticated`'ı, trigger tablonun sahibini.

**Ve bu tur bir kapı körlüğü buldu.** Paneli `/admin`'e koydum ve yoğunluk
ölçüsü 42'den 42'ye gitti. `tests/populated.mjs`'in sahte backend'inde
`current_authority` satırı ölü koddu (`supabase.rpc()` bir POST, yazma
muhafızı ondan önce geliyordu), yani yetkiye bağlı her bölüm — gösterge
panelinin karar kuyruğu, konsolun denetim/kapsam/paylaşım/devir bölümleri —
hiç render edilmiyordu. Düzeltilince iki gerçek çökme ortaya çıktı, biri
önceden vardı. Ayrıntısı `docs/TASARIM-GEREKSINIMLERI.md`'de; T15-04 artık
karşılanmış sayılmıyor.

## 0045 sonrası bir düzeltme

M11-05 ve M11-06 bu denetimde "yapıldı" sayılıyordu ve öyleydi: teslim kaydı
vardı, push `unconfigured` olarak yazılıyordu ve ekran bunu söylüyordu. 0045
ile push **gerçekten** teslim ediyor — VAPID anahtarı kayıtlıysa. Satır sayısı
değişmedi; değişen şey, o iki satırın artık "kaydı var" değil "gönderiyor"
anlamına gelmesi. Kurulumu ve doğrulanamayan kısmı `docs/BILDIRIM-KURULUMU.md`
anlatıyor.

E-posta ve WhatsApp hâlâ `unconfigured`: biri bir sağlayıcı API anahtarı,
diğeri bir Meta işletme hesabı istiyor. İkisi de bu depoda çözülecek şeyler
değil.

## Yapılmış ama ID'si anılmamış satırlar

Bunlar "yapıldı" sayılır; eksik olan tek şey migration yorumundaki atıf.

| ID    | P   | Kanıt                                                                                          |
| ----- | --- | ---------------------------------------------------------------------------------------------- |
| M2-03 | P1  | `obligation_state` enum (0010): açık · devam · yerine getirildi · ihlâl riski · ihlâl · askıda |
| M4-02 | P1  | `stakeholder_category` enum (0006), on iki değer                                               |
| M4-08 | P1  | `obligations.owner_stakeholder_id` (0010) — bağ veritabanında var                              |
| M7-05 | P1  | `work_state` enum (0013), altı değer, `legally_suspended` dahil                                |
| M3-14 | P2  | `governance_organs.quorum_members` / `quorum_fraction` (0021) + oturum kontrolü ekranda        |
| M5-12 | P2  | `hearing_brief` sekmesi (LegalAffairsView)                                                     |
| M5-14 | P2  | `chronology_entries` (0030) + `ChronologyPanel`                                                |

## Yapılmamış satırlar

24 satır. Her biri için neyin eksik olduğu ve neye bağlı olduğu yazıldı,
çünkü bir kısmı kod değil karar ya da hesap bekliyor.

### P0 — 1 satır

| ID    | Gereksinim                                   | Durum                                                                                                                                                                                                     |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-02 | Dört rol için iki faktörlü doğrulama zorunlu | **Sizin kararınıza bağlı.** Supabase projesinde MFA'nın açılması ve rol bazlı zorunluluk gerekir; portal tarafında `aal2` kontrolü yazılır. Kimlik sağlayıcısında bir ayar olmadan kod tek başına yetmez. |

### P1 — 2 satır

| ID     | Gereksinim                                                    | Durum                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-10  | Oturum yönetimi: aktif cihazlar, uzaktan kapatma              | Supabase `auth.sessions` üzerinden okunur; kapatma yönetici yetkisiyle sunucu tarafı bir fonksiyon ister.                                                                                                                                                                                                                                                                                                 |
| M13-17 | Modülün kapsamı veritabanındaki kayıttan gelsin, koddan değil | **Kodun kendisi bunu söylüyor.** `supabase/functions/ai-assistant/rules.js` şöyle yazıyor: _"Faz 1 için sabit. M13-17 kapsamın veritabanındaki kayıttan gelmesini istiyor ve Faz 4 bunu `intake_targets` sorgusuyla değiştirecek."_ Bugün liste `REGISTERS` sabitinde ve teklif hedefleri `targets.js`'te; ikisi de kod. Gereken: `intake_targets` tablosu + fonksiyonun oradan okuması. Bağımlılığı yok. |

### P2 — 22 satır

Portal içinde yapılabilenler (bağımlılığı yok):

| ID    | Gereksinim                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| M2-10 | Tekrarlayan yükümlülükler (yıllık tescil, dönemsel beyan) — `compliance_requirements` zaten yineleme taşıyor, yükümlülükler taşımıyor |
| M2-11 | Yükümlülük ısı haritası (kaynağa göre gruplu)                                                                                         |
| M4-10 | İlişki ağı görselleştirmesi                                                                                                           |
| M4-12 | Etkileşim planı (ne istiyoruz, sıradaki adım, sorumlu)                                                                                |
| M4-14 | Paydaş haritası anlık görüntüsü (dondurulmuş)                                                                                         |
| M5-11 | Hukukî senaryo analizi ("kaybedersek")                                                                                                |
| M5-13 | İçtihat/mevzuat kütüphanesi                                                                                                           |
| M7-13 | Değişiklik emri (variation order)                                                                                                     |
| M7-14 | Mevsim/iklim risk takvimi (muson uyarısı)                                                                                             |
| M7-15 | Fotoğraf arşivi, aynı açıdan zaman serisi                                                                                             |
| M7-16 | Gantt + **kritik yol** — `dependencies` var, kritik yol hesabı yok                                                                    |
| M8-13 | Nakit akışı projeksiyonu                                                                                                              |
| M8-14 | KRA vergi muafiyeti takibi                                                                                                            |
| M9-11 | Hukukî muhafaza (legal hold)                                                                                                          |
| M9-13 | Saklama politikası ve arşivleme                                                                                                       |

Dışarıdan bir şeye bağlı olanlar:

| ID    | Gereksinim                                   | Neye bağlı                                                                   |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| M1-12 | Tek oturum açma (Google Workspace)           | Workspace tarafında OAuth istemcisi                                          |
| M1-13 | IP/coğrafya anomali uyarısı                  | Bir IP coğrafya kaynağı; `audit_log` IP tutmuyor, önce o eklenir             |
| M3-12 | Sesli not → metin → tutanak önerisi          | Bir konuşma tanıma servisi; AI proxy'si üzerinden, anahtar sunucuda          |
| M5-15 | Mahkemeye hazır tek PDF (numaralı, indeksli) | Sunucu tarafı PDF birleştirme — M9-12 ile aynı bağımlılık                    |
| M8-11 | Muhasebe entegrasyonu (QuickBooks/Xero/SAP)  | Satıcı hesabı ve OAuth; M8-10 sahte entegrasyonu kaldırdı, yerine gerçeği bu |
| M9-10 | TR/EN OCR (taranmış mahkeme evrakı)          | Bir OCR servisi                                                              |
| M9-12 | İndirmede kullanıcı adı filigranı            | Sunucu tarafı PDF işleme; M9-14'te konuştuğumuz pdf bağımlılığının aynısı    |

## Bu denetimin ilk hâlindeki hata

Bu dosyanın ilk hâli özetinde "P3 14 satır, hepsi yapıldı" yazıyordu. Yanlıştı:
**M11-13** (mesaja dosya ekleme, alıntılama, tepki) yapılmamıştı ve 0027 bunu
kendi yorumunda açıkça söylüyordu. Satırları saymak yerine hangilerini
yaptığımı hatırlamaya güvenmişim. Hata, P3 listesini tek tek bastırmakla
ortaya çıktı — ve M11-13 o yüzden 0044'te yapıldı, yani şimdi o cümle doğru.
Denetim dosyasının kendi iddiası da denetlenmek zorundaydı.

## Bu denetimin kendi sınırı

Kanıt araması desen eşlemesidir ve iki yönde yanılabilir. Gevşek bir desen
yapılmamış bir şeyi yapılmış gösterir — ilk geçişte "muson" kendi yazdığım
0040 yorumunda eşleşti, "sap" bir başka kelimenin içinde, "retention" bir
hakediş sütununda. Dar bir desen ise yapılmış bir şeyi kaçırır; M1-08 ilk
taramada `supabase/functions/` dizini sayılmadığı için yok görünüyordu.
Yukarıdaki 24 satırın her biri bu yüzden elle teyit edildi, ve "yapıldı"
sayılan 185 satırın hepsi tek tek teyit edilmedi — yalnızca atıfı olanlar
atıfına, atıfı olmayan yedisi kanıtına dayanıyor.
