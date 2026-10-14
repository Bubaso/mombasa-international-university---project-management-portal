# Durum raporu — 2 Ekim 2026

Kapsam denetiminden (`docs/KAPSAM-DENETIMI.md`, 1 Ekim) bu yana ne yapıldı,
uygulama nerede, ve mütevelli kütüğünde bulunan üç kusur.

Bu dosyada kişi adı, adres ya da kayıt kimliği yok: gerçek proje verisi depoya
girmez (CLAUDE.md §4). Aşağıda anlatılan kusurların hiçbiri belirli bir kişiye
bağlı değil, hepsi koddaki bir boşluk.

## 1. Denetimden bu yana: yedi commit

| Commit    | Ne                                                                           |
| --------- | ---------------------------------------------------------------------------- |
| `6c869dd` | Denetimin kendisi + M11-13 + **kaydedilmiş ama uygulanmayan gizlilik**       |
| `37d5e3a` | Push bildirimleri gerçekten gönderiliyor (M11-05, M11-06) — 0045             |
| `14aa17c` | Okunamayan mecra listesi "bilinmiyor", "hepsi çalışıyor" değil               |
| `70eb828` | Sunucu anahtarının iki neslinden hangisi varsa onu kabul et                  |
| `7e2e459` | Service worker'a gerçek push olayları + yakaladığı kusur                     |
| `deb6152` | **Canlı giriş arızası** (test build'i deploy edilmişti) + "kontrol ediliyor" |
| `9c36b5f` | CI sekiz suite'ten ikisini, push'u olmayan bir tarayıcıda koşuyordu          |

### Bulunan ve düzeltilen dokuz kusur

Bu commit'lerin değeri eklenen özellikten çok, yazılırken ortaya çıkan
kusurlarda. Dokuzu da aynı yönde sessiz: bilinmeyeni bilinmiş, olmayanı olmuş
gibi gösteren taraf.

1. **Bir tier kaydedilmiş, uygulanmamış.** 0027'nin mesaj okuma politikası
   mesajı yalnızca konusuna bakarak veriyor, mesajın kendi `confidentiality`
   kolonuna hiç bakmıyordu. `internal` bir konu içinde `restricted` işaretlenmiş
   bir not, o kanalın her üyesi tarafından okunabiliyordu — 0027'nin kendi
   seed'inin `internal` yetkiyle kanala eklediği sürveyör dahil. Hiç tier
   olmamasından kötü, çünkü işaretleyen kişi bir şeyi sınıflandırdığını sanıyor.
   Alıntılama testi yazılırken, assertion kısıtlı kelimelerle geri geldiği için
   yakalandı.
2. **Cihazı olmayan alıcının teslimi sıkışıyordu.** `attempted_at` basılıyor,
   satır döndürülmüyordu: `queued` kalıyor, hiç gönderilmiyor, hiç başarısız
   olmuyor ve bir daha asla talep edilemiyordu — kişi sonradan cihaz kaydetse
   bile.
3. **İki cihazı olan kişinin teslimi iki kez kapatılıyordu**; kalan durum en son
   cevap verenin durumu oluyordu. Ölü bir dizüstü, telefona ulaşmış bir
   bildirimi `failed` yazabiliyordu.
4. **0027'nin teslim tetikleyicisi her durum değişikliğini reddediyordu**,
   koşulsuz, her rol için. Kimse farketmemişti çünkü bugüne kadar hiçbir şey bir
   teslimi kapatmıyordu; elinde gerçek bir sağlayıcı cevabı olan ilk şey
   reddedildi.
5. **İstemci `app.configured_media()`'nın elle tutulan kopyasını taşıyordu**
   (`CONFIGURED_MEDIA = ['in_app']`). Anahtar kaydedildiği an yanlış olacaktı.
   Silindi; kural artık veritabanından okunuyor (CLAUDE.md §4).
6. **Okunamayan mecra listesi hiç etiket üretmiyordu**, yani "dördü de
   çalışıyor" gibi görünüyordu. Üç durum oldu: yapılandırıldı · sağlayıcı yok ·
   **sağlayıcı bilinmiyor**.
7. **Okunamayan yük ile gövdesiz yük karıştırılıyordu.** Sorunsuz okunmuş ama
   gövdesi olmayan bir bildirimin üzerine "bu cihaz metnini okuyamadı"
   yazılıyordu — yükü kusursuz okumuş bir cihaz hakkında yanlış bir cümle.
8. **Panel bilmediği şeyi bilinmiş gibi yazıyordu.** `keyOnRecord` bir sorgudan
   geliyor; sorgu havadayken `false` sayılıyor ve ekran "projede kayıtlı anahtar
   yok" diyordu — veritabanı cevap vermeden veritabanı hakkında bir hüküm.
   Soğuk service worker'da bu 12 saniye ekranda kalıyordu. `checking` artık
   kendi durumu, uyarı üçgeni olmadan.
9. **Test build'i deploy edilebiliyordu.** `build:smoke` gerçek build ile aynı
   `dist/`'e yazıyordu ve `verify` smoke testleriyle bitiyordu; o klasör deploy
   edilince canlı portal kimseyi içeri almadı ("Failed to fetch"). Kodda bir şey
   yoktu, yanlış klasör gönderildi. Artık `dist-smoke` ayrı ve
   `scripts/check-dist.mjs` smoke işareti taşıyan ya da hiç proje URL'i olmayan
   bir bundle'ı reddediyor; `npm run deploy` build + kontrol + deploy.

### Test disiplini

|                      | Denetim günü | Şimdi   |
| -------------------- | ------------ | ------- |
| Politika assertion'ı | 825          | **882** |
| Smoke kontrolü       | 301          | **316** |
| Suite sayısı         | 6            | **8**   |
| CI'da koşan suite    | 2            | **8**   |

Yeni iki suite: `tests/push.mjs` (RFC 8291/8292 kriptosunu gidiş-dönüş çözerek
sınar — yanlış bir türetme servisten 201 alıp bildirimi sessizce düşürdüğü için
tek geçerli sınama bu) ve `tests/push-sw.mjs` (service worker'a DevTools
protokolüyle gerçek push olayları gönderir).

CI, `verify`'ın alt kümesiydi: kripto, service worker, çeviri, dışa aktarma ve
asistan kuralları CI'da hiç koşmuyordu. Yerel kapının alt kümesi olan bir kapı,
yerel kapının yakalayacağı şeyleri geçirir. Artık CI `npm run verify` koşuyor.

Ayrıca iki test hijyeni düzeltmesi: suite'ler kendi başlatmadıkları bir sunucuya
düşmeyi reddediyor (orphan bir `vite preview` bir saat yanlış teşhise yol açtı),
ve kendi sunucularını süreç grubu olarak kapatıyor.

## 2. Uygulama nerede

**Gereksinimler.** 197 satırın **171'i yapıldı, 26'sı yok**: 1 P0, 3 P1, 22 P2.
P3'ün on dördü de tamam. Denetimden bu yana sayı değişmedi; değişen, M11-05 ve
M11-06'nın artık "kaydı var" değil "gönderiyor" anlamına gelmesi.

**Kalan 26 satırın niteliği.** Dokuzu portal dışında bir şeye bağlı: Workspace
OAuth istemcisi, OCR servisi, muhasebe yazılımı, IP coğrafya kaynağı, sunucu
tarafı PDF. Geri kalanı portal içinde yapılabilir ama sıraya girmemiş. Tek P0
(M1-02, iki faktörlü doğrulama) bir karar bekliyor: kimlik sağlayıcısında ayar
olmadan kod tek başına yetmiyor.

**Canlı ortam.** 45 migration uygulandı (0001–0045). Beş edge function etkin:
`invite-user`, `ai-assistant`, `document-download`, `verify-document`,
`send-notifications`. Ön yüz `miu-kenya.web.app`'te, gerçek projeye bakıyor,
giriş çalışıyor. Push yapılandırıldı: VAPID açık anahtarı veritabanında, özel
yarısı fonksiyon gizli değişkeni ve hiçbir yerde kayıtlı değil.

**Boyut.** 196 kaynak dosyası (48.588 satır), 20.316 satır migration, 16.427
satır test, altı npm bağımlılığı.

**Doğrulanmayan tek halka.** Kenar fonksiyonundan gerçek bir anlık bildirim
servisine ve oradan gerçek bir cihaza giden ağ adımı. Kripto gidiş-dönüşle,
durum makinesi 882 assertion'la, service worker gerçek push olaylarıyla
doğrulandı; bu adım bir gerçek abonelikle sınanmayı bekliyor.

## 3. Mütevelli kütüğündeki üç kusur — düzeltildi (0046)

Bir mütevelli eklenip organ listesinde görülemediği, silinemediği ve "görevden
ayrıldı" işaretlenince üstünün çizildiği bildirildi. Üçü de gerçek boşluk.

### (a) Portalda kimseyi bir organa oturtmak mümkün değil

`organ_memberships` istemcide **salt okunur**: ne API fonksiyonu var ne de
ekranda kontrol. Kütüğe eklenen bir mütevelli bu yüzden Mütevelli Heyeti'nin
üye listesine hiçbir zaman giremiyor. Canlıda şu an sıfır organ üyeliği var ve
üç organın nisap kuralı `null` — ekran bunu dürüstçe "söyleyemiyorum" diye
yazıyor, ama söyleyebilmesi için gereken veri portaldan girilemiyor.

**Kütük ile koltuk iki ayrı şey.** Kütük kimin mütevelli olduğunu, kimin
atadığını ve süresinin ne zaman dolduğunu tutar. Koltuk, o kişinin hangi organda
oy hakkıyla oturduğunu tutar; nisap hesabı buradan çıkar. Birincisi var,
ikincisi yok.

### (b) Yanlışlıkla eklenen bir kayıt silinemiyor

Veritabanı yöneticiye silme izni **veriyor** (`trustees_delete ... using
(app.is_admin())`), ama istemcide `deleteTrustee` yok ve ekranda düğme yok. Elde
kalan tek seçenek "görevden ayrıldı" — görev yapıp ayrılmış biri için doğru,
yanlış girilmiş bir kayıt için yanlış: o kişi hiç mütevelli olmadı, ayrılmış da
olamaz. İkisini aynı duruma yazmak, kütüğü okuyan birine olmamış bir görev
süresi gösterir.

### (c) "Görev" alanı Türkçe arayüzde görünmüyor

Form "Görev" diye soruyor ama `seat_en` kolonuna yazıyor; liste Türkçede
`seat_tr`'yi gösteriyor ve o boş olduğu için hiçbir görev etiketi çıkmıyor. Alan
otomatik çeviri listesinde (`trustees: ['seat']`), ama bu projede makine
çevirisi onaylanana kadar kaydın kendisi olmaz — tasarım böyle (M3-10). Yani
Türkçe girilen bir görev, çeviri kuyruğunda onaylanana kadar Türkçe arayüzde
görünmez.

### Yapılan

Üçü birlikte düzeltildi; `0046_a_seat_a_rule_and_a_record_that_never_was.sql`
ve ona bağlı istemci değişiklikleri.

**(a) Koltuk.** Organ panelinde artık bir mütevelli koltuğa oturtulabiliyor:
hangi mütevelli, hangi koltuk, **oy hakkı var mı**, hangi tarihten itibaren.
Oy hakkı soruluyor, varsayılmıyor — oy kullanmayan bir sekreter hazır sayılır
ama nisaba sayılmaz, ve ikisini birbirine karıştırmak bir oturumun yetkisiz
olduğu hâlde yetkili gibi tutanağa geçmesinin yoludur. Koltuğu bitirmek bir
**tarih**, bir silme değil: Mart'ta yapılmış bir oturumun nisabı Mart'ta kimin
koltuğu olduğundan hesaplanıyor, dolayısıyla ortadan kaybolan bir koltuk
geçmişi yeniden yazar. Yanlış girilmiş bir koltuğu silmek ayrı bir eylem ve
yöneticinin.

Nisap kuralı da artık kaydedilebiliyor (en az üye sayısı, koltukların yüzdesi,
ya da ikisi). Bu dördüncü boşluktu ve (a) onsuz yarım kalırdı: koltuklar
girilse bile kural olmadan `quorum_met` yine `null` kalırdı. Boş bırakılan alan
`null` kalıyor, yani "kimse kuralı yazmamış" — "nisap yok" değil.

**(b) Silme.** Kütükte yöneticiye silme geldi, ama kuralı **Postgres'te**:
`app.what_holds_the_trustee()` üç sicile bakıyor (organ koltuğu, çıkar beyanı,
senet atfı) ve bir mütevelliyi tutan varsa tetikleyici silmeyi **hangi sicilin
tuttuğunu söyleyerek** reddediyor. Üç yabancı anahtar da `on delete cascade`
olduğu için bu olmadan gerçekten görev yapmış birini silmek geçmiş bir oturumun
nisabını sessizce götürürdü. Fonksiyon `security definer`: çağıranın
göremediği bir beyanı da sayması gerekiyor, yoksa yetkisi yetmeyen biri için
"bunu tutan bir şey yok" cevabı verir ve cascade çalışır.

Aynı fonksiyon `trustee_register` görünümünde de okunuyor, yani ekran düğmeyi
**basılmadan önce** doğru gösteriyor. Kural tek yerde: ilk taslakta aynı üç
`exists` hem fonksiyonda hem tetikleyicide yazılıydı, ki CLAUDE.md §4 tam
bunun için var.

**(c) Görev alanı.** İki yarısı birlikte düzeltildi: form artık yazıldığı dilin
kolonuna yazıyor, ve liste `bilingual()` kullanıyor — okuyucunun dilini tercih
edip diğerine düşüyor. Depoda bu helper zaten vardı, panel onu kullanmıyordu.

**Testler.** Politika tarafında yedi yeni assertion, smoke tarafında on bir.
Yedi mutasyon denendi, yedisi de isimli bir assertion'ı öldürdü. İkisi ilk
seferde **hayatta kaldı** ve ikisi de fixture boşluğuydu: görev yalnızca
Türkçe yazılı bir satırla Türkçe okurken eski kod da geçiyordu (satır
İngilizce'ye çevrildi), ve yazma tarafı hiç gönderilmediği için hangi kolona
gittiği sınanmıyordu (form artık gönderiliyor ve gövdesi okunuyor).

Bu arada bir test kendi yanlışıyla da yakalandı: "proje direktörü nisap
kuralını değiştiremez" assertion'ı beklenen bir hata olarak yazılmıştı, oysa
RLS UPDATE'te satırı **süzer**, hata vermez — sıfır satır değişir ve sessizce
geçer. Doğru test kuralın yerinde kaldığını ölçmek.

## 4. Hukuk ekranındaki sekme şeridi

On üç sekme yatay kayan bir şeritteydi, yani çoğu ekran dışında kalıyordu ve
orada olduklarını söyleyen hiçbir şey yoktu: şeridi sürüklemeyi akıl etmeyen
biri kronolojiyi ya da hâkim sorularını hiç bulamıyordu. Şerit artık satır
atlıyor, hepsi bir anda görünüyor.

Mevcut sekme testleri bu kusuru yakalayamazdı: Playwright tıklamadan önce
öğeyi görünüre kaydırdığı için on üç sekmenin tıklanabilirliği her iki hâlde de
geçiyordu. Yeni assertion tıklamayı değil şeridin yatay taşmasını ölçüyor —
eski hâlinde 2223px içerik 960px kutuya sığmıyordu, şimdi sığıyor.
