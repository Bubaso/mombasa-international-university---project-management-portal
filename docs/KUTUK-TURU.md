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

`meeting_notes`, `meeting_attendees`, `correspondence`, mesajlar,
`document_vault` ve sürümleri, `financial_transactions`,
`stakeholder_stance_changes`, `risk_score_changes`, `exhibit_custody`,
devriye kayıtları.

### Üçüncü dalga — sabit listeler

Projedeki sabit şeylere karşılık gelen, büyümeyen kütükler. Dört sorudan üçü
bunlara sorulmuyor: `governance_organs`, `budget_categories`,
`approval_thresholds`, `profiles`, `construction_blocks`, `work_packages`,
`trustee_register`.

### Dördüncü dalga — kaydın kökeni

Her kütüğün detay ekranına bir satır: bu kayıt hangi belgeden, hangi
alıntıdan açıldı (M13-21). Mekanizma asistan turunda kuruldu
(`record_provenance`, `fetchProvenanceOfRecord`, `DocumentOrigin` kalıbı).

## Kuralı bir yere yazmak

On iki ekranı on iki ayrı şekilde düzeltmek, "bitmiş hâl" listesini on iki
yere yazmak demektir ve o liste birinde eskir (CLAUDE.md §4). Hangi değerin
son olduğu bir alan hükmü: şema enum'un değerlerini biliyor, hangisinin son
olduğunu bilmiyor. Bu yüzden hüküm tek yerde, gerekçesiyle duruyor
(`src/lib/registerStates.ts`), ve bir test onu şemadaki enum değerlerine
bağlıyor: enum büyüdüğünde yeni değerin son olup olmadığına karar verilmeden
derleme geçmiyor. Enum sapmasında işe yarayan desenin aynısı.
