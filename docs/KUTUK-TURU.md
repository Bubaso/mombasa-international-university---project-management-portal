# Kütük turu — sıra ve gerekçesi

Asistan sayfası 3 Ekim 2026'da yeniden kuruldu çünkü kullanılamaz hâle gelmişti,
ve sebep bir ekran kusuru değildi: **hiçbir şey oradan çıkmıyordu.** Aynı
kusurun başka kütüklerde olup olmadığı soruldu. Bu dosya turun sırasını ve o
sıranın neyle belirlendiğini tutuyor.

## Dört soru

Her kütük ekranına sorulan şey:

1. Orada **çıkması gerekip de birikmiş** bir şey var mı?
2. **Sayfalama ve toplam** var mı, yoksa sessizce mi kesiyor (ya da hepsini mi
   çekiyor)?
3. **Bitmiş iş, bekleyen işle aynı ağırlıkta mı** duruyor?
4. Bir durum, bir sütunun **boşluğundan** mı çıkarılıyor — yani tahminle mi?

## Ölçüm, 3 Ekim 2026

**Dördüncü soru büyük ölçüde temiz.** İstemcide bir tarih ya da kimlik
sütununun boşluğundan durum çıkaran tek yer `WatchPanel`'deki
`shift.endedAt == null` ve o zaten dürüst davranıyor: "çıkışı kayıtlı değil"
diyor, "kişi sahada" demiyor. Politika testi bunu ayrıca zorluyor. Yani bu
turda aranan şey 1, 2 ve 3.

**İkinci soru beklediğimin tersi çıktı.** `src/api`'deki 139 liste
okumasından **130'u hiç sınır koymuyor**: `.limit` ya da `.range` yok, yani
her satır çekiliyor. Asistan sayfasında sorun sessizce kesmekti; kütüklerde
sorun hiç kesmemek. İkisi de aynı şeyin iki yüzü — kaç tane olduğunu
söylemeyen bir liste.

Ama bu 130'un hepsi kusur değil. `approval_thresholds` (3 satır),
`governance_organs` (3), `budget_categories` proje boyunca sabit kalan
listeler; onları sayfalamak gürültü olur. Ayrımı canlı satır sayısı değil
**büyüme şekli** yapıyor: bir satır her olayla mı doğuyor, yoksa projedeki
sabit bir şeye mi karşılık geliyor.

**Canlı sayılar bugün küçük** — en büyüğü `meeting_notes` 134, sonra
`action_triage` 103 ve `meeting_attendees` 94. Yani hiçbir kütük bugün
kırılmıyor ve sıra "hangisi şu an bozuk" sorusuyla belirlenemez.

**Kırk kütükte bitmiş hâl var.** Okunan 116 ilişkinin 40'ının durum enum'ında
açıkça son olan değerler var: `done`, `cancelled`, `fulfilled`, `closed`,
`paid`, `achieved`, `awarded`, `met`, `spent`, `withdrawn`, `dismissed`.
Sıra buradan çıkıyor.

## Sıra

Bir kütük, asistan sayfasının kusurundan şu ölçüde muzdarip: (a) içinde
**karara ya da işe bağlanması gereken** bir şey var mı, ve (b) karara
bağlanmış olan ekranda **aynı ağırlıkta** mı duruyor. Hiçbir şeyin karara
bağlanmadığı yerde (ekleme-yalnızca bir tarihçe, sabit bir liste) yalnız
hacim kalır, ve hacim daha küçük bir sorundur.

### Birinci dalga — iş kuyrukları

Alım kuyruğunun doğrudan kardeşleri: bir şey yapılmayı bekliyor ve
yapılmış olan geri çekilmeli.

| #   | Kütük                                                                                         | Bitmiş hâli                                    |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | Aksiyonlar (`action_items`, `action_triage`)                                                  | `done`, `cancelled`; `adopted`, `dismissed`    |
| 2   | Yükümlülükler (`obligations`)                                                                 | `fulfilled`                                    |
| 3   | Açık sorular (`open_questions`)                                                               | `answered`, `dropped`                          |
| 4   | Ödeme fişleri (`payment_vouchers`)                                                            | `paid`, `rejected`, `withdrawn`                |
| 5   | RAID (`risks`, `issues`, `assumptions`)                                                       | `closed`, `resolved`, `broken`                 |
| 6   | Hukuk (`filings`, `hearings`, `legal_orders`)                                                 | `served`, `withdrawn`, `spent`, `discharged`   |
| 7   | Kilometre taşları (`milestones`)                                                              | `achieved`, `abandoned`                        |
| 8   | Tedarik (`procurement_requests`, `procurement_candidates`)                                    | `awarded`, `cancelled`, `selected`, `rejected` |
| 9   | Hakedişler (`valuations`, `contract_milestones`)                                              | `paid`, `rejected`                             |
| 10  | Uyum ve akreditasyon (`accreditation_requirements`, `charter_roadmap`, `academic_programmes`) | `met`, `done`, `approved`, `withdrawn`         |
| 11  | Raporlar (`report_runs`)                                                                      | `published`, `withdrawn`                       |
| 12  | Toplantılar (`meetings`)                                                                      | `completed`, `cancelled`                       |

### İkinci dalga — büyüyen kütükler

Burada karara bağlanan bir şey yok ve birikme doğru: bir tarihçe birikmek
için vardır. Soru yalnız hacim ve toplam — birinci ve üçüncü soru bu dalgaya
sorulmuyor.

**Ölçüm, 3 Ekim 2026 (ikinci tur):** `src/api`'de 134 okuma fonksiyonu var.
Onu bir dilim çekiyor, **dokuzu toplamı hiç söylemiyordu.** Bu, beklediğimin
tersiydi: kütüklerde sorunun "hiç kesmemek" olduğunu sanıyordum, ama dokuz
yerde tam olarak asistan sayfasının kusuru vardı — sessizce kesmek. Kırk
bildirim gösterip dört yüz tane olduğunu söylemeyen bir ekran, okuyana her
şeyi gördüğünü sandırıyor, ve bu bilinmeyeni bilinmiş gibi göstermenin en
sessiz hâli (CLAUDE.md §2).

Dokuzu çevrildi: denetim kaydı, yapay zekâ sorgu kütüğü, bildirim kutusu,
belge erişim kütüğü, kurul oturumları, kronoloji, kritik tarih şeridi, devriye
kütüğü, olay kütüğü. Her biri artık `Page<T>` döndürüyor — dilim ve **toplam**
— ve ekran `MoreRows` ile kaç tanesini gösterdiğini yazıyor. Şerit üçü
gösteriyor ve "+8 tarih daha" diyor; üçte kalmak gereksinimin kendisi, sayıyı
söylememek değil.

Bir de ikinci kusur: **denetim kaydının tür süzgeci çekilen dilimin içinde
süzüyordu.** "Sözleşme" seçen biri, kütükte sözleşme kaydı olduğu hâlde boş
liste görebilirdi — çünkü aranan yer son 200 satırdı. Süzgeç sunucuya taşındı;
açılır listedeki türler hâlâ görülenden çıkıyor ve etiket bunu söylüyor.

### İkinci parti: sayı dilimin değil kütüğün sayısı

Büyüyen on üç ekran-genişliğinde okumanın sekizi dilime çevrildi: yazışmalar,
duyuru erişimi, mesaj başlıkları, kasa listesi, çıkar çatışması beyanları, malî
hareketler, rapor derlemeleri, aksiyon adayları.

**Ve bu, bir dalga daha açtı.** Bir okumayı dilime çevirmek, o dilim üzerinde
**sayan** her yeri sessizce yanlış yaptı — yedi yerde:

| Nerede                   | Ne diyordu                        |
| ------------------------ | --------------------------------- |
| Kasa defteri             | belgesiz hareket sayısı           |
| Pano, denetim kuyruğu    | denetlenmemiş ve belgesiz sayısı  |
| Pano, denetlenmiş toplam | **bir para rakamı**               |
| Bildirim kutusu          | okunmamış bildirim sayısı         |
| Yazışmalar               | teyidi gelmemiş giden yazı sayısı |
| Kronoloji                | belgesi olmayan kayıt sayısı      |
| Belge kasası             | özeti hesaplanmamış belge sayısı  |

Ayrım şu: **kesilmiş bir liste dürüst olabilir** — "412 kayıttan 40 tanesi"
doğru bir cümledir. **Kesilmiş bir sayı olamaz,** çünkü kendisinin kesildiğini
söylemiyor; küçük, kesin ve yetkili görünür. Bir para toplamında bu, listeyi
kesmekten kötüdür (CLAUDE.md §2).

Yedisi de sunucuya taşındı: `head: true` ile satır çekilmiyor, yalnız
sayılıyor. Üç yer satır çekmeye devam ediyor ve gerekçesi kendi dosyasında:
bir **toplam** bütün değerleri ister (denetlenmiş tutar), bir **seçici**
kesilemez (`fetchDocumentOptions`, `fetchTransactionOptions` — var olan bir
kaydı seçilemez kılmak, listeyi kesmekten kötü), ve bir **birleştirme**
doğrulayamadığım sözdizimiyle yazılmaz (`countUndigestedDocuments`).

Aksiyon adaylarında süzgeç de sunucuya taşındı: ekran bekleyenlerle karara
bağlananlar arasında geçiş yapıyor ve bunu dilimin içinde yapmak iki listeyi
birden yanlış yapardı.

Takvim ve "yürürlükteki sürümler" okumaları **kasıtlı olarak sınırsız bırakıldı**:
ikisinde de dilimlemek, dilimlenmemiş hâlinden daha yanlış. Satır sayısıyla
kesilmiş bir takvim, ekim ayı on iki kayıt taşıdığı hâlde üç gösterir; sürüm
arama tablosu kesilirse dilimin dışındaki belgeler "sürüm yok" görünür.
Takvimin doğru sınırı tarih penceresi, sürümlerin doğru çözümü `document_vault`
görünümüne katlamak — ikisi de o gün geldiğinde.

**Test tarafında üç kusur mutasyonla çıktı,** ve üçü de aynı aileden: vekil
veritabanı gibi davranmadığı sürece yeşil olan şey ekran değil vekilin
körlüğü. (1) Vekiller `Content-Range` göndermiyordu, yani her ekranda toplam
sıfırdı ve hiçbir test sayıyı sınamıyordu — 35 vekil cevabı düzeltildi.
(2) `Access-Control-Expose-Headers` olmadan tarayıcı o başlığı sayfadan
saklıyor; gerçek Supabase onu açıyor, vekil de açmak zorunda. (3) Süzgeç
sunucuya taşındığında vekil de süzmek zorunda: her isteğe bütün satırları
döndüren bir vekil, "karara bağlanmış satır kuyruktan çıktı" iddiasını
sınanamaz hâle getiriyordu.

Ve bir kural eklendi: **bir ekran `X.data?.rows` üzerinde sayı türetmiyor**
(`tests/list-reads.mjs`). Bu turun kendi hatasının tekrarlanmaması için.

**120 okuma hâlâ her satırı çekiyor** ve bu bugün kırılmıyor (en büyük kütük
134 satır). `tests/list-reads.mjs` sayıyı tutuyor: yeni bir okuma eklenince
sayı değişiyor, yani "buna sınır gerekiyor mu?" sorusuna cevap vermeden test
geçmiyor. Kalanlar — `meeting_notes`, `meeting_attendees`, `correspondence`,
mesajlar, `document_vault` ve sürümleri, `financial_transactions`,
`stakeholder_stance_changes`, `risk_score_changes`, `exhibit_custody` — büyüme
şekline göre sırayla aynı kalıba geçiyor.

### Üçüncü dalga — sabit listeler

Projedeki sabit şeylere karşılık gelen, büyümeyen kütükler. Dört sorudan üçü
bunlara sorulmuyor: `governance_organs`, `budget_categories`,
`approval_thresholds`, `profiles`, `construction_blocks`, `work_packages`,
`trustee_register`.

### Dördüncü dalga — kaydın kökeni

Her kütüğün detay ekranına bir satır: bu kayıt hangi belgeden, hangi
alıntıdan açıldı (M13-21). Mekanizma asistan turunda kuruldu
(`record_provenance`, `fetchProvenanceOfRecord`, `DocumentOrigin` kalıbı).

## Birinci dalganın sonucu: her liste kuyruk değil

Dalga "on iki iş kuyruğu" varsayımıyla başladı ve **beşinde varsayım yanlış
çıktı.** Bir listeyi kuyruk yapan şey satır sayısı ya da durum sütununun
varlığı değil, listenin cevapladığı soru:

- **Kuyruk** — "sırada ne var?" Bitmiş olan geri çekilir. Aksiyonlar,
  yükümlülükler, açık sorular, ödeme fişleri, riskler, sorunlar, layihalar,
  mahkeme kararları, kilometre taşları, tedarik talepleri, hakedişler, metraj
  sürümleri, akreditasyon kontrol listesi, toplantılar. **On dört liste.**
- **Karşılaştırma** — "hangisi, neden?" Elenen satır karşılaştırmanın
  içeriğidir. Tedarik adayları (M14-02 tam olarak geri çekilecek kaydı
  istiyor: diğer üçünün neden seçilmediği).
- **Aritmetik** — "toplam tutuyor mu?" Ödenmiş kalem toplamı açıklar.
  Sözleşmenin ödeme planı.
- **Güzergâh** — "neredeyiz?" Geçilmiş kısım konumu söyleyen şeydir. Berat yol
  haritası: aşamalar sıralı, aralarında ok var, her biri öncekine bakıyor.
- **Katalog** — "ne var?" Onaylanmış satır en önemli satırdır. Akademik
  programlar: üniversitenin ne vereceğinin listesi.
- **Arşiv seçicisi** — "hangisini okuyacağım?" Yayımlanmış olan okunmaya
  gelinen şeydir. Rapor derlemeleri.

Son beşinde bitmiş hâl ekranda kalıyor, ve **gerekçesi hükmün kendisinde**
duruyor (`registerStates.ts`, `keepOnScreen`). Bu bir kaçış kapısı değil: alan
boşsa ve ekran bölünmemişse test başarısız oluyor, yani "bakıldı, bölmek yanlış
olurdu" ile "kimse bakmamış" ayrı kalıyor (0047'nin dersi). İki listede ise
bölünecek bir şey yok, çünkü enum'un son değeri yok: varsayımlar ve duruşma
hazırlığı.

Duruşmalar bir istisna: bitmişliği enum söylemiyor, **tarih ve kaydedilmiş
sonuç** söylüyor. Geçmiş ama sonucu yazılmamış duruşma bitmiş sayılmıyor —
ekranda kalıyor ve kaç tanesinin sonucunun kayıtlı olmadığı başlıkta yazıyor
(CLAUDE.md §2).

## Sözleşme kütüğü bitmiş sözleşmeyi gösteremiyor

Tur sırasında çıkan kusur, geri çekmenin tersi: `ContractPanel` "Sözleşme
kütüğü" başlığıyla `contract_alerts` görünümünü okuyor ve o görünüm
`where c.state in ('draft', 'signed', 'active', 'suspended')` ile süzüyor
(0022:627). Yani **süresi dolmuş ya da feshedilmiş her sözleşme portalın
hiçbir yerinde görünmüyor**: şartları, doğurduğu yükümlülükler, ödeme planı,
performans değerlendirmeleri. Görünümün kendisi dürüst — adı "alerts" ve
bitmiş sözleşme için 90/60/30 uyarısı üretmemesi doğru. Kusur, uyarı akışının
kütük yerine kullanılması. Düzeltmesi bir migration istiyor (0052) ve
istemci tarafı ona kadar bekliyor.

## Kuralı bir yere yazmak

On iki ekranı on iki ayrı şekilde düzeltmek, "bitmiş hâl" listesini on iki
yere yazmak demektir ve o liste birinde eskir (CLAUDE.md §4). Hangi değerin
son olduğu bir alan hükmü: şema enum'un değerlerini biliyor, hangisinin son
olduğunu bilmiyor. Bu yüzden hüküm tek yerde, gerekçesiyle duruyor
(`src/lib/registerStates.ts`), ve bir test onu şemadaki enum değerlerine
bağlıyor: enum büyüdüğünde yeni değerin son olup olmadığına karar verilmeden
derleme geçmiyor. Enum sapmasında işe yarayan desenin aynısı.

**Ama hüküm veritabanında da yazılı.** Ölçüm, 3 Ekim 2026: migration'larda 22
yerde bir durum sütunu bir enum'un `open` ya da `settled` kümesinin tamamıyla
karşılaştırılıyor — yedi takvim görünümü, bildirim koşucusu, tedarik ihale
koruması. Hepsi meşru (bitmiş aksiyonu listeleyen bir takvim yanlış olurdu) ve
hepsi hükmün ikinci kopyası. SQL bir TypeScript sabitini okuyamadığı için
kopyalar kalıyor; test onları adıyla ve satırıyla tutuyor, ve hüküm
değiştiğinde artık uyuşmayan her satırı tek tek söylüyor. Elli başka SQL
listesi enum'un bir **alt kümesini** sayıyor ve onlar hükmün kopyası değil,
kendi soruları ("henüz sunulmamış layiha", "bağlanmış para", "kimse
hazırlanmamış"); ölçüldüler ve bırakıldılar.
