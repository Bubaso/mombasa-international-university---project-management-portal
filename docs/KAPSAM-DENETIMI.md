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

**Tarih:** 2026-10-08 · migration 0056'ya kadar. (İlk hâli: 2026-10-01, 0044'e
kadar.)

## Özet

| Durum      | Satır |
| ---------- | ----- |
| Yapıldı    | 188   |
| Yok        | 22    |
| **Toplam** | 210   |

Öncelik dağılımı: P0 22 satır (1'i yok), P1 115 satır (1'i yok), P2 59 satır
(20'si yok), P3 14 satır (**hepsi yapıldı**).

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

### M13-17 kapandı — göç 0056, ve denetimin kendi alıntısı eskimişti

Bu satırı bu dosyaya "**Kodun kendisi bunu söylüyor**" diye yazmıştım ve
`rules.js`'teki şu yorumu alıntılamıştım: _"Faz 1 için sabit. M13-17 kapsamın
veritabanındaki kayıttan gelmesini istiyor ve Faz 4 bunu `intake_targets`
sorgusuyla değiştirecek."_

**O yorum eskimişti ve alıntı beni yanlış yere gönderiyordu.** 8 Ekim'de
ölçüldü: `REGISTERS` yalnızca `readClassification`'ı besliyor, o da hiçbir
canlı fonksiyondan çağrılmıyor — `document-intake` `readProposals` çağırıyor.
Yani kapsamı bugün yöneten şey `targets.js`'teki `PROPOSAL_TARGETS` (23
hedef). `REGISTERS`'ı veritabanına taşımak hiçbir şeyi kapatmazdı: ölü bir
listeyi taşımak olurdu. Yorum düzeltildi.

Ders, bu dosyanın kendi sınırıyla aynı: **bir kod yorumu bir kanıt değil bir
iddiadır.** Atıfı olan satırı atıfına dayandırmak, atıfın hâlâ doğru olduğunu
varsaymaktır.

0056 bir tablo (`intake_targets`), iki trigger, iki politika ve yirmi üç
tohum satırı getirdi. Taşınan şey **hangi** kayıt türlerinin kapsamda olduğu;
taşınmayan şey her hedefin alan şeması (1.379 satır), çünkü o şema yazan
fonksiyonu besliyor ve yazan fonksiyon kodda. Alan listesini veritabanına
taşımak kaçınılmaz olarak sapan kopyayı üretirdi (CLAUDE.md §4). İki yön de
kapıya bağlandı: kapsamdaki her anahtarın kodda bir şeması, koddaki her
hedefin kapsamda bir satırı olmak zorunda.

`targetsBriefing` ve `answerSchema` artık kapsamı **argüman olarak** alıyor ve
verilmezse **atıyor** — sessizce koddaki tam listeye dönmüyor. O dönüş tam
olarak M13-17'nin yasakladığı şey olurdu. Kapsam okunamazsa alım `failed`
oluyor, sebebiyle.

**O turda bıraktığım sınır aynı gün kapandı.** "Kapsamı değiştirmek bir
yöneticinin SQL güncellemesi; konsola bölüm eklemek doğru olurdu ama
`/admin` telefonda 8.931px" diye yazmıştım. T14-04 Faz 4 `/admin`'i yedi
sekmeye böldü (kurgu 8.931 → 1.044px) ve "Asistanın kapsamı" sekmesi eklendi:
yirmi üç hedef, kapatmak gerekçe istiyor. Alan şeması o ekranda yok ve
olmaması kasıtlı — şema yazan fonksiyonun yanında duruyor.

### M7-16 kapandı — ve bir ölçü körlüğü

Kritik yol. Gantt 0028'de yapılmıştı; eksik olan hesap, ve **göç
gerektirmedi**: `dependencies` tablosu 0016'dan beri duruyor.

Önce ölçtüm. `dependencies` kütükler arası bir tablo: bir bağımlılığın tarafı
dava, saha işi, yükümlülük, risk, kilometre taşı ya da çıplak bir etiket
olabiliyor. Kritik yol ise süreli bir faaliyet ağı ister, yani tablonun
tamamı yola girmiyor — ve girmeyeni sessizce atmak en tehlikelisi olurdu:
eksik bir ağdan çıkan zincir, tam bir zincir gibi okunur.

Ağa iki düğüm türü giriyor: iki tarihi de kayıtlı **saha işi** (süresi
`bitiş - başlangıç + 1`), ve hedef tarihi kayıtlı **kilometre taşı** (süresi
sıfır — bir olay, bir süreç değil). Panel kullanamadığı her şeyi sayıyla
bildiriyor.

**Bolluk (float) hesaplanmıyor** ve sebebi yazılı: bolluk planın
bağımlılıklarla tutarlı olmasını ister, buradaki tarihler elle girilmiş ve
bir bağımlının başlangıcı blokeyenin bitişinden önce olabilir. Böyle bir
planda bolluk hesaplamak veriden fazlasını iddia etmek olur. Onun yerine o
tutarsızlıklar bildiriliyor — bir planın kendi içinde çelişmesi, bolluk
rakamından daha çok işe yarar.

"Kritik" bu projede iki şey demek ve ikisi karıştırılmadı:
`milestones.critical` **elle** konan bir geri sayım bayrağı (M15-04),
buradaki kritik yol **hesaplanan** bir şey.

Yirmi assertion, dokuz mutasyon, dokuzu da düştü.

**Ve bu tur bir ölçü körlüğü buldu.** Panelde dört uzun cümle kestim ve ekran
metni tavanı yalnızca **11 karakter** düştü; kesim 300 karakterdi. Sebep:
`scripts/screen-text.mjs`'in deseni yalnızca `'` ve `"` eşleştiriyordu,
backtick'i değil. Ölçüldü: **75 dosyada 197 iki dilli çift, 4.951 karakter**
kör noktadaydı. Desen düzeltildi, `${…}` yer tutucuları metin sayılmıyor, ve
iki fikstür kontrolü eklendi. Üç tavan gerçek ölçüme yazıldı (58.257 →
63.539, 26.994 → 27.680, 2.978 → 3.046) — metin büyümedi, ölçü görmeye
başladı.

Aynı gate'in ikinci kör noktası; ilki 5 Ekim'de veri dizisi alanlarıydı
(2.467 karakter). Ders aynı: **bir ölçü neyi görmediğini söylemez**, o yüzden
görmediğini aramak gerekir.

### M2-11 kapandı — ve yazdığım paneli ölçüm sildi

Yükümlülük ısı haritası: kaynağa göre gruplu, duruma göre bantlı. Göç
gerektirmedi.

**Ayrı bir ısı haritası paneli yazdım, sınadım, sonra sildim.** Bir toplayıcı
(`obligationHeat`), bir ızgara paneli, yirmi assertion ve dokuz mutasyon —
hepsi çalışıyordu. Sonra ekranı bölüm bölüm ölçtüm ve `/obligations`'ın
**zaten kaynağa göre bölümlenmiş** olduğunu gördüm: yedi kaynak, yedi bölüm.
Panel aynı veriyi ikinci kez gruplayacaktı, ve iki gruplamanın iki sayısı her
zaman birbirinden sapar (CLAUDE.md §4).

M2-11'in gerçekten eklediği şey gruplama değil **bantlama**. Bant şeridi her
kaynağın kendi başlığına kondu; panel ve toplayıcı silindi, testleri de
onlarla gitti. Kullanılmayan bir fonksiyonun testi, test değil ağırlık.

Kalan şey `bandOf` — hangi kaydın hangi banda düştüğü, tek yerde, ve ekranın
her grubu onu çağırıyor. Altı bant, ve altıncısı dosyanın sebebi:
**`undated`**, yani açık ama vadesi kayıtlı değil. O bant olmadan böyle bir
yükümlülük ya "ileride" sayılırdı (vadesi varmış gibi) ya hiç görünmezdi;
ikisi de bilinmeyeni bilinmiş göstermek olur.

Tanınmayan bir durum için bant **uydurulmuyor** (null döner) ve okunamayan
bir tarih "ileride" sayılmıyor. Dokuz mutasyon, dokuzu da düştü.

Renk tek başına hiçbir şey söylemiyor: her bantta sayı ve ad da basılı, yani
renk körü biri için de basılı bir kopyada da aynı bilgi okunuyor.

**Ve bir kapı kusuru daha.** Bantlar `Pill` kullanıyor — ne düğme ne başlık —
yani `/obligations`'ın yoğunluk tavanı hiç değişmedi. Tavanın değişmemesi
"render edildi" demek değil; `/admin`'de tam bu yüzden bir bölüm hiç
çizilmediği hâlde sayı 42'de kalmıştı. Ayrı bir tutamak eklendi. İlk hâli
yalnızca sekme turunun içinde çağrılıyordu ve `/obligations` için sıfır
döndü: o ekranda sekme yok, yani tur gövdesi hiç çalışmıyor. Açılışta da
çağrılıyor artık, ve ikisi de mutasyonla sınandı.

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

21 satır. Her biri için neyin eksik olduğu ve neye bağlı olduğu yazıldı,
çünkü bir kısmı kod değil karar ya da hesap bekliyor.

### P0 — 1 satır

| ID    | Gereksinim                                   | Durum                                                                                                                                                                                                     |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-02 | Dört rol için iki faktörlü doğrulama zorunlu | **Sizin kararınıza bağlı.** Supabase projesinde MFA'nın açılması ve rol bazlı zorunluluk gerekir; portal tarafında `aal2` kontrolü yazılır. Kimlik sağlayıcısında bir ayar olmadan kod tek başına yetmez. |

### P1 — 1 satır

| ID    | Gereksinim                                       | Durum                                                                                                     |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| M1-10 | Oturum yönetimi: aktif cihazlar, uzaktan kapatma | Supabase `auth.sessions` üzerinden okunur; kapatma yönetici yetkisiyle sunucu tarafı bir fonksiyon ister. |

### P2 — 20 satır

Portal içinde yapılabilenler (bağımlılığı yok):

| ID    | Gereksinim                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| M2-10 | Tekrarlayan yükümlülükler (yıllık tescil, dönemsel beyan) — `compliance_requirements` zaten yineleme taşıyor, yükümlülükler taşımıyor |
| M4-10 | İlişki ağı görselleştirmesi                                                                                                           |
| M4-12 | Etkileşim planı (ne istiyoruz, sıradaki adım, sorumlu)                                                                                |
| M4-14 | Paydaş haritası anlık görüntüsü (dondurulmuş)                                                                                         |
| M5-11 | Hukukî senaryo analizi ("kaybedersek")                                                                                                |
| M5-13 | İçtihat/mevzuat kütüphanesi                                                                                                           |
| M7-13 | Değişiklik emri (variation order)                                                                                                     |
| M7-14 | Mevsim/iklim risk takvimi (muson uyarısı)                                                                                             |
| M7-15 | Fotoğraf arşivi, aynı açıdan zaman serisi                                                                                             |
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
Yukarıdaki 21 satırın her biri bu yüzden elle teyit edildi, ve "yapıldı"
sayılan 188 satırın hepsi tek tek teyit edilmedi — yalnızca atıfı olanlar
atıfına, atıfı olmayan yedisi kanıtına dayanıyor.
