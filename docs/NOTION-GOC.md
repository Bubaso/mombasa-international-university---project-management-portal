# Notion'dan göçün haritası

Karar: **tek seferlik göç, sonrasında portal sistem kaydıdır.** "Tek seferlik"
göçün yönüyle ilgilidir, deneme sayısıyla değil — bir yıllık toplantı kaydını
ilk denemede doğru aktaran yoktur. Bu yüzden her satır nereden geldiğini
taşır (`source_system`, `source_id`, `source_url`) ve betik yeniden
çalıştığında kopya üretmez, düzeltir.

Çalıştırma:

```bash
NOTION_TOKEN=secret_… \
SUPABASE_URL=https://….supabase.co \
SUPABASE_SERVICE_ROLE_KEY=… \
npm run import:notion -- --dry-run
```

`--dry-run` her şeyi okur, eşleştirir, ne yazacağını ve **neyi
yazamayacağını** basar, hiçbir şeye dokunmaz. Önce onu çalıştırın. Asıl
okunması gereken şey rapordur: bu göçün yapamadıkları, yapabildiklerinden
daha önemli.

Depoda hiçbir veri tutulmaz. Betik Notion'u canlı okur, Supabase'e canlı
yazar — bir bakan hakkındaki değerlendirme, hukukî strateji ve özel bir
iletişim kütüğü git geçmişine girmez.

---

## Kaynak: Meeting Hub

Beş veritabanı:

| Notion                  | Portal                                             | Not                                            |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------- |
| 👥 Contacts             | `organizations` + `stakeholders`                   | Kurum serbest metin; isme göre tekilleştirilir |
| 📋 Meetings (EN)        | `meetings` + `meeting_notes` + `meeting_attendees` | Notlar `en`                                    |
| 📋 Toplantılar (Türkçe) | aynı tablolar                                      | Notlar `tr`                                    |
| 💡 Team Suggestions     | `suggestions`                                      | Bu göç için eklendi (0008)                     |
| 📁 Materials            | `document_vault`                                   | **Bu turda değil** — aşağıya bakın             |

---

## 1. Contacts → paydaş kütüğü

| Notion                   | Portal                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                     | `stakeholders.full_name`                                                                                                                    |
| Role / Title             | `title`                                                                                                                                     |
| Organization (metin)     | `organizations` satırı açılır → `organization_id`                                                                                           |
| Category                 | `category` — Government→`government`, NGO→`ngo`, Community Leader→`community_leader`, Partner→`partner_trust`, Media→`media`, Other→`other` |
| Email · Phone · Location | `email` · `phone` · `location`                                                                                                              |
| Topic / Relevance        | `interest_topic`                                                                                                                            |
| Notes                    | `notes`                                                                                                                                     |
| Added                    | `created_at`                                                                                                                                |

**Notion'da olmayıp portalın istediği her şey boş gelir, ve bu doğru olandır:**

- `stance` = `unknown`. Kimsenin kaydetmediği bir tutum "nötr" değil,
  "bilinmiyor"dur.
- `influence` / `interest` = 3.
- `relationship_owner` = **boş.** Yani göç biter bitmez her kişi "Sizin
  erişiminiz" ekranındaki dikkat listesinde "sorumlusu yok" uyarısıyla
  görünür. Bu bir kusur değil, göçün ilk çıktısı: kütüğü bir adres
  defterinden ilişki yönetimine çeviren iş, sorumlu atamakla başlar.

---

## 2. Meetings → toplantı kaydı

| Notion                           | Portal                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting Title / Toplantı Başlığı | `meetings.title`                                                                                                                                          |
| Date & Time / Tarih ve Saat      | `held_at`                                                                                                                                                 |
| Location / Konum                 | `location`                                                                                                                                                |
| Type / Tür                       | `kind` — Field Visit→`site`, Government→`official`, Partner→`partner`, Internal→`internal`, Other→`internal`                                              |
| Status / Durum                   | `status` — Completed→`completed`, `Progresing`→`in_progress` (İngilizce veritabanında bu şekilde yazılmış), Planlandı→`planned`, İptal Edildi→`cancelled` |
| Priority / Öncelik               | `priority`                                                                                                                                                |
| Agenda / Gündem                  | `meeting_notes(section='agenda')`                                                                                                                         |
| Meeting Notes / Toplantı Notları | `meeting_notes(section='discussed')`                                                                                                                      |
| Key Outcomes / Temel Sonuçlar    | `meeting_notes(section='outcomes')`                                                                                                                       |
| Action Items / Aksiyon Maddeleri | `meeting_notes(section='actions')` — **yalnızca metin olarak**                                                                                            |

Her toplantı `minutes_status = 'draft'` gelir. Tutanağı kesinleştirmek bir
insanın aldığı karardır; bir içe aktarma betiği insan değildir.

---

## 3. Göçün yapamadığı üç şey

Bunlar betiğin eksiği değil, kaynak verinin yapısı. Her biri, M3'ün neden var
olduğunu anlatıyor.

### 3.1 Aksiyonlar aksiyon olarak gelemez

Notion'da "Action Items" serbest metin bir alan. İçinde gerçekten sahip ve
tarih var:

> 1. **Minister Mawiale** to follow up with the responsible official and ensure
>    MoU is signed before Mr. Fatih's departure to Turkey (deadline: April 15, 2026)
> 2. **Team** to confirm Mr. Fatih's travel date…
> 3. **Minister** to activate contacts…

Ama alan olarak yok. 1. maddede tarih var, 2 ve 4'te yok. "Team" bir kişi
değil. Portalda bir aksiyonun **tek sorumlusu ve son tarihi zorunludur** —
modülün var olma sebebi tam olarak budur (M3-05). Betik bu ikisini uydurmaz.

**Sonuç:** metin `actions` başlığı altında aynen durur, `action_items` satırı
üretilmez, ve rapor hangi toplantıda kaç maddenin elden geçmesi gerektiğini
söyler. Toplantı ekranında da bu görünür: notunda aksiyon metni olup aksiyon
kaydı olmayan toplantı bunu söyler.

Bu, göçün en çok emek isteyen kısmı ve devredilemez olanı. Uydurulmuş bir
tarih, tarihi olmayan bir aksiyondan kötüdür: birincisi takip edildiğini
sandırır.

### 3.2 Katılımcılar eşleştirilir, uydurulmaz

"Attendees" da serbest metin: `Mr. Minister Mawiale, Mr. Musaib (First Advisor
to Mombasa Governor), Mr. Ahmad, Mr. Hamid, Mr. Fatih, Mr. Burhan`. M3-02'nin
"serbest metin değil" dediği şey tam olarak bu.

Betik unvanları (Mr., Dr., H.E., Sayın…) ve parantez içini atar, kalan
kelimeleri Contacts kayıtlarıyla karşılaştırır. **Yalnızca tek bir aday
kaldığında** eşleştirir. Hiç eşleşmeyen ya da birden çok eşleşen her isim
raporda sayısıyla listelenir; betik aralarından seçim yapmaz.

Eşleşmeyen isimler için iki yol var: kişiyi Contacts'a ekleyip göçü yeniden
çalıştırmak, ya da bırakmak. İkincisinde toplantı notu kimin orada olduğunu
söylemeye devam eder — portal söylemez.

### 3.3 Kararlar üretilmez

Notion'da ayrı bir karar veritabanı yok; kararlar "Key Outcomes" içinde düz
metin. Portalda bir `decision` kaydının numarası, alan organı, oylama sonucu
ve durumu (yürürlükte/uygulandı/geri alındı) vardır. Bunları düzyazıdan
çıkarmak uydurmaktır.

**Sonuç:** metin `outcomes` başlığı altında durur. Hangi cümlenin gerçekten
bir kurul kararı olduğuna bir insan karar verir ve karar kaydını o açar.

---

## 4. Team Suggestions

0008 ile eklendi. Notion'daki "Suggested By" ve "Reviewed By" serbest
metindir; portalda hem referans hem serbest metin alanı vardır. Göç ismi
metin olarak yazar, kişi portalda tanınıyorsa referansı da kurar. Böylece
aktarılan bir öneri ne sahipsiz kalır, ne de sahip olmadığı bir atfa sahipmiş
gibi görünür.

Öneriyi yapan kişi — kurum dışından biri olsa bile — kendi önerisinin ne
olduğunu görür. Geri dönüşü olmayan bir öneri kutusu kutu değil, çöp
kutusudur.

---

## 5. Bu turda yapılmayanlar

- **📁 Materials → belge kasası.** Belge kasası bugün yalnızca künye
  tutuyor; dosya yükleme, sürüm ve özet doğrulama yok (Faz 0'da bu iddialar
  ekrandan kaldırıldı). Dosyaları taşıyacak yer hazır olmadan künyelerini
  taşımak, olmayan bir kasanın dolu görünmesine yol açar. Faz 3'te belge
  modülüyle birlikte.
- **Toplantı sayfalarının gövdesi.** Notion sayfalarının içinde, özellik
  alanlarından daha zengin, başlıklı ve biçimli notlar var (örn. "🗒️ What Was
  Discussed" altındaki alt başlıklar). Bu turda özellik alanları aktarılıyor;
  gövdeyi de aktarmak, biçimlendirmenin nasıl saklanacağına karar vermeyi
  gerektiriyor.
- **Gizlilik sınıflandırması.** Her şey `internal` olarak gelir. Hangi
  toplantının `confidential`, hangi paydaşın `restricted` olduğuna bir insan
  karar verir; varsayılanın yanlış tarafta olması, açık tarafta olmasından
  iyidir.

---

## 6. Göçten sonraki ilk iş

Sırayla:

1. `--dry-run` raporunu okuyun. Eşleşmeyen isimleri ve yapılandırılmamış
   aksiyon sayısını görün.
2. Eksik kişileri Contacts'a ekleyip dry-run'ı tekrarlayın.
3. Göçü çalıştırın.
4. **Her paydaşa bir ilişki sorumlusu atayın.** Dikkat listesi bunu
   söyleyecek.
5. Aksiyon metinlerini tek tek gerçek aksiyona çevirin: bir sorumlu, bir
   tarih. Gündem paneli o andan itibaren çalışmaya başlar.
6. Gerçekten kurul kararı olan çıktıları karar kaydına geçirin.

4 ve 5 olmadan portal, Notion'un daha yavaş bir kopyasıdır.
