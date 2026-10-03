# MIU Portal — Kapsamlı Ürün Gereksinim Dokümanı

**Proje:** Mombasa International University Project Management Portal
**Kurum:** African University Trust of Kenya (AUTK) · Cap 164, Laws of Kenya
**Doküman sürümü:** 1.0 · 29 Eylül 2026
**Durum:** Analiz ve gereksinim tanımı — uygulama öncesi

---

## 0. Bu doküman nasıl kullanılır

Her gereksinimin bir kimliği var (`M3-04` gibi). Tek tek ele alıp uygulayabilirsin; birbirine bağımlı olanlarda bağımlılık açıkça yazıldı. Her modülün başında **"Neden"** bölümü var — çünkü bir özelliğin niçin var olduğunu bilmeden sade tutmak imkânsızdır.

Öncelik etiketleri:

| Etiket | Anlamı                                               |
| ------ | ---------------------------------------------------- |
| **P0** | Bu olmadan sistem kullanılamaz veya güvenli değildir |
| **P1** | Sistemin asıl değerini üreten çekirdek               |
| **P2** | Olgunlaşma; çekirdek oturduktan sonra                |
| **P3** | İyi olur; ertelenebilir                              |

---

## 1. Yönetici özeti

### 1.1 Bu sistem aslında ne?

Mevcut uygulama kendini "proje yönetim portalı" olarak tanımlıyor. Ama arşivi ve saha kayıtlarını okuduğumda gördüğüm ihtiyaç bundan farklı ve daha keskin:

> **MIU Portal, üç kıtaya dağılmış, birbirine güveni kırılgan, farklı dilleri konuşan ve farklı hukukî çerçevelerde hareket eden bir paydaş topluluğunun — ortak bir gerçeklik üzerinde anlaşabildiği tek yerdir.**

Bu bir Jira değil. Bir Trello değil. Bir inşaat takip yazılımı hiç değil. Bu, **kurumsal hafıza + yükümlülük takibi + ilişki yönetimi**nin birleştiği bir _yönetişim_ sistemidir. İnşaat ve finans modülleri bunun içinde birer parçadır, tersi değil.

### 1.2 Bu ihtiyaç nereden doğuyor?

2024 tarihli kendi *Proje Değerlendirme Raporu*nuz, başarısızlık nedenlerini şöyle sıralıyor:

- Vakıf organlarının tam kapasite çalışamaması, **düzenli toplantıların yapılamaması**
- **Profesyonel proje yönetim prensiplerinin etkin uygulanamaması**
- **Paydaş analizi, iletişim stratejisi ve risk yönetiminin** geliştirilememesi
- Mütevelli heyetinin **ortak hedefler doğrultusunda koordineli çalışamaması**
- Kenya'daki bazı bireysel girişimlerin **projede farklı algılara yol açması**

Bunların hiçbiri teknik bir problem değil. Hepsi **bilginin dağınık, takibin kişiye bağlı, kararın kayıtsız** olmasının sonucu. Portalın çözmesi gereken şey tam olarak budur.

Saha kayıtları da aynı resmi gösteriyor: iki hafta içinde ~25 toplantı; dört ayrı hukuk danışmanı adayının paralel değerlendirilmesi; bakanlık, valilik, büyükelçilik, ortak vakıf, denetçi, müteahhit ve topluluk liderleriyle eşzamanlı ilişki yürütülmesi; mütevelliler arasında çözülmemiş görüş ayrılıkları; ve bütün bunların tek bir kişinin not defterinde birikmesi. **Tek kişiye bağımlı kurumsal hafıza, bu projenin bir numaralı yapısal riskidir.**

### 1.3 Sistemin dört işi

Portal dört somut işi yapmalı. Bir özellik bu dördünden birine hizmet etmiyorsa kapsam dışıdır.

| #     | İş                            | Cevapladığı soru                                                                                 |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **A** | **Karar ve taahhüt hafızası** | "Bu kararı kim, ne zaman, hangi gerekçeyle aldı? Kim neyi taahhüt etti? Yapıldı mı?"             |
| **B** | **Yükümlülük takibi**         | "Vakıf senedi, kira sözleşmesi, mahkeme kararı ve MoU bize ne yüklüyor? Hangisi ihlâl riskinde?" |
| **C** | **İlişki ve nüfuz yönetimi**  | "Kim kimdir, bizden yana mı, kim kimi etkiliyor, en son ne zaman temas ettik?"                   |
| **D** | **Şeffaf ilerleme ve para**   | "Nerede duruyoruz, para nereye gitti, kim doğruladı?"                                            |

### 1.4 Alınan yön kararları

Bu doküman aşağıdaki dört karara göre yazıldı:

1. **Kapsam:** Yalnızca MIU projesine özel. Çok-projeli soyutlama yapılmayacak.
2. **Notion:** Mevcut Notion içeriği **tek seferlik göç** edilecek; sonrasında portal tek doğru kaynak (_system of record_) olacak.
3. **Dış erişim:** Avukat, müteahhit, mühendis, denetçi gibi dış paydaşlar **sisteme doğrudan girecek**, kendi alanlarında çalışacak.
4. **Öncelik:** Dört alan da (toplantı/karar, hukuk/risk, paydaş/CRM, inşaat/finans) öncelikli.

### 1.5 Üçüncü karardan doğan uyarı

Dış paydaşların sisteme girmesi doğru ve değerli bir karar — ama bir şartla: **gizlilik sınıflandırması ilk günden, özelliklerden önce kurulmalı.**

Arşivde şu nitelikte içerik var: mütevelliler arasındaki açık görüş ayrılıkları, karşı tarafın arkasında kimin olduğuna dair istihbarat değerlendirmeleri, yargı süreçlerine ilişkin ağır ithamlar, bir ortağın projeden çekilme ihtimaline dair beyanlar, hukuk danışmanlarının birbirleri hakkındaki değerlendirmeleri. Bu içeriğin bir müteahhitin veya değerlendirme aşamasındaki bir avukatın ekranına düşmesi, projeye davanın kendisinden daha fazla zarar verir.

Bu nedenle **M1 (Kimlik, Erişim, Gizlilik) her şeyden önce gelir.** Faz 1'in ilk işi budur; müzakereye kapalıdır.

---

## 2. Mevcut durum tespiti

Uygulama ~6.300 satır TypeScript/React. Tek commit. 1-2 saatlik bir çalışmanın ürünü olduğu bilgisiyle, aşağıdakiler suçlama değil **envanter**dir — neyin korunacağını, neyin atılacağını netleştirir.

### 2.1 Korunması gereken

- **Bilgi mimarisi sezgisi doğru.** Dashboard / Proje / Hukuk / İnşaat / Yönetişim / Finans / Belgeler / İletişim ayrımı, ihtiyacın gerçek şeklini yakalamış.
- **İki dillilik baştan düşünülmüş.** TR/EN ayrımı sonradan eklenen bir şey değil, en başından var. Bu doğru.
- **PWA + çevrimdışı farkındalığı var.** Mombasa sahasında bu bir lüks değil, zorunluluk.
- **Rol kavramı var.** Uygulaması yok ama kavram doğru yerde duruyor.
- **Görsel dil sakin ve ciddi.** Bir vakıf yönetişim aracına yakışıyor; abartılı değil.

### 2.2 Yapısal sorunlar

| #    | Sorun                                                                                                                                                                                                          | Etki                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| S-1  | **Kimlik doğrulama yok.** `switchRole()` sadece yerel bir state değiştiriyor; herkes tek tıkla "Mütevelli" olabiliyor.                                                                                         | Dış erişim kararı ile birlikte bu **kabul edilemez**.                                                                 |
| S-2  | **Supabase anon anahtarı tarayıcıda, RLS yok.** Anahtarı gören herkes tüm tabloları okuyup yazabilir.                                                                                                          | Veri sızıntısı ve veri bütünlüğü riski.                                                                               |
| S-3  | **İçerik koda gömülü.** Temyiz gerekçeleri, 30 yıllık kronoloji, "kim kimdir", eylem planı — hepsi JSX içinde sabit metin.                                                                                     | Kullanıcı hiçbir şeyi güncelleyemez. Her düzeltme için geliştirici gerekir.                                           |
| S-4  | **i18n iki farklı şekilde yapılmış.** Bir `translations.ts` var, ama yüzlerce yerde `language === 'tr' ? ... : ...` satır içi.                                                                                 | Üçüncü dil imkânsız; çeviri tutarsızlığı kaçınılmaz.                                                                  |
| S-5  | **Yükleme/hata durumu hiç yok.** Hiçbir yerde `isLoading`/`isError` kullanılmıyor; tüm sorgular sessizce `[]`'e düşüyor.                                                                                       | Bağlantı koptuğunda kullanıcı **boş ama sağlıklı görünen** bir ekran görür. Yönetişim aracında bu tehlikelidir.       |
| S-6  | **Kalıcı olmayan veriler.** Mütevelli kararları ve BoQ kalemleri yalnızca React state'inde; sayfa yenilenince kayboluyor.                                                                                      | Kullanıcı kaydettiğini sanır, kaybeder.                                                                               |
| S-7  | **Doğrulanamayan güvenlik iddiaları.** Arayüz "Şifreli Belge Kasası", "SHA-256 Doğrulandı", "Güvenli Belge" diyor; fakat dosya yükleme, şifreleme veya hash hesaplama **hiç yok** — sadece metadata yazılıyor. | Mütevelliler var olmayan bir güvenceye dayanarak karar verir.                                                         |
| S-8  | **Sahte muhasebe entegrasyonu.** "Canlı senkronizasyon" bir `setTimeout(1500)`; ardından "senkronizasyon tamamlandı" bildirimi çıkıyor.                                                                        | Aynı problem: gerçek olmayan bir doğrulama hissi.                                                                     |
| S-9  | **Mesaj sahipliği yok.** `addThreadMessage` gönderen adını `'Current User'` olarak sabit yazıyor, rolü `'executive'` varsayıyor.                                                                               | Kim ne dedi izlenemez. Ayrıca JSONB dizisini oku-değiştir-yaz yöntemi eşzamanlı mesajlarda **veri kaybına** yol açar. |
| S-10 | **"Kapat" = kalıcı silme.** Takvim uyarısını bir kullanıcı kapatınca kayıt veritabanından **herkes için** siliniyor.                                                                                           | Kritik bir duruşma hatırlatıcısı yanlışlıkla yok edilebilir.                                                          |

### 2.3 Somut hatalar (doğrulandı)

| #   | Hata                                                                                                                                                                                                                                                                    | Konum                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| H-1 | `HEARING_BRIEF_DATA.benchQuestions.filter(...)` — `benchQuestions` tanımlı değil. "Hâkimler Heyeti Soru-Cevapları" sekmesi açılınca uygulama çöker.                                                                                                                     | `src/views/LegalAffairsView.tsx:373`                                                              |
| H-2 | `activeCase` boş liste durumunda `undefined`; `activeCase.title` ve `activeCase.orders` korumasız. Supabase bağlı değilken "Temyiz Dosyası" sekmesi çöker.                                                                                                              | `src/views/LegalAffairsView.tsx:491, 579`                                                         |
| H-3 | Tüm `navigate()` çağrıları baştaki `/` olmadan yapılmış (`navigate('documents')`). React Router v7'de göreli yol **mevcut rota altına** çözülür — `/legal` içindeyken `/legal/documents`'a gider, eşleşen rota yoktur. 15 yerde aynı hata.                              | `DashboardView`, `LegalAffairsView`, `ConstructionView`, `ProjectInfoView`, `DeadlineAlertBanner` |
| H-4 | Navbar logosu `onClick={() => ('dashboard')}` — hiçbir şey yapmayan ölü kod.                                                                                                                                                                                            | `src/components/Navbar.tsx:38`                                                                    |
| H-5 | **Birim hatası:** Arayüz İngilizce "84 Acres" değerini Türkçeye "84 Dönüm" diye çeviriyor. 1 acre ≈ 4,047 m², 1 dönüm = 1.000 m². **84 acre ≈ 340 dönüm.** Kendi değerlendirme raporunuz da araziyi "340 dönüm" olarak yazıyor. Aynı hata 79 ve 5 acre için de geçerli. | `ProjectInfoView`, `App.tsx`, `translations.ts`                                                   |
| H-6 | `.env.example` `GEMINI_API_KEY` diyor, kod `VITE_GEMINI_API_KEY` okuyor. Supabase değişkenleri örnekte hiç yok.                                                                                                                                                         | `.env.example` ↔ `ContextualAIAssistant.tsx`, `lib/supabase.ts`                                   |
| H-7 | Gemini API anahtarı doğrudan tarayıcıya gömülüyor. Kodun kendi yorumu bunu kabul ediyor: _"In production, you would proxy this request through your backend"_.                                                                                                          | `src/components/ContextualAIAssistant.tsx:44`                                                     |
| H-8 | `README.md` hâlâ Google AI Studio şablonu; `package.json` adı `"react-example"`; `metadata.json` AI Studio'ya özel. `scratch/` altında 8 adet otomatik refactor betiği commit'lenmiş.                                                                                   | Kök dizin                                                                                         |

### 2.4 İçerik güvenilirliği — en önemli tespit

Uygulamadaki hukukî içeriğin bir kısmı gerçek (Civil Appeal E062/2025, Plot No. MN/I/5141, Simon Karina, Khatib & Company, Zayed Vakfı, Moli Chogo ailesi), bir kısmı ise **kaynağı belirsiz veya sahayla çelişiyor**:

- Uygulama 9 Şubat 2026 tarihli bir "consent order" ve 28 Eylül 2026 tarihli bir duruşma etrafında kurulmuş. Saha kayıtlarınız Nisan 2026'da **AUTK'nın bağımsız kendi Record of Appeal dosyasını sunma kararı** alındığını gösteriyor — ki bu, uygulamada hiç yok.
- Uygulama "inşaat durduruldu" diyor. Saha kaydı 21 Nisan 2026'da mütevelli heyetinin **oybirliğiyle inşaata devam kararı** aldığını gösteriyor.
- Mali rakamlar (807,3M KShs; 1,25B bütçe; 980M taahhüt) tek bir yerde bile kaynağa bağlanmamış.

**Sonuç:** Uygulama şu anda gerçeğin değil, bir _anlatının_ kaydı. Bir yönetişim aracında bu en tehlikeli durumdur — çünkü ekran güvenilir görünür.

> **Bu gözlem, bütün dokümanın en önemli tasarım ilkesini doğuruyor: hiçbir veri kaynaksız girilemez.** (bkz. İlke 2)

---

## 3. Tasarım ilkeleri

Bu yedi ilke, ileride "bu özellik girsin mi?" tartışmasının hakemidir.

**İlke 1 — Tek doğru kaynak.**
Bir bilgi tam olarak bir yerde yaşar. Toplantı kararı hem toplantı notunda hem karar kütüğünde _kopya_ olarak durmaz; karar kütüğünde yaşar, toplantı ona referans verir.

**İlke 2 — Kaynaksız veri olmaz.**
Her maddi iddia (rakam, tarih, mahkeme kararı, taahhüt) ya bir belgeye ya bir toplantı kaydına ya da bir kişiye bağlanır. Bağlanamayan veri, arayüzde **"doğrulanmamış"** olarak işaretlenir. Bu işaret gizlenemez, üstü geçilemez.

**İlke 3 — Gizlilik varsayılan olarak kapalıdır.**
Yeni bir kayıt varsayılan olarak *Dâhilî*dir. Erişim açmak bilinçli bir eylemdir; kısıtlamak değil.

**İlke 4 — Herkesin kendi kapısı.**
Müteahhit, avukatın dünyasını görmez. Avukat, bütçe kalemlerini görmez. Bağışçı, yalnızca kendisi için hazırlanmış özeti görür. Tek uygulama, ama roller farklı ürünler gibi hissettirir.

**İlke 5 — Sahada çalışmalı.**
Mombasa şantiyesinde, telefondan, bağlantı kopukken. Çevrimdışı kayıt alınabilmeli, bağlantı gelince çakışmasız senkronlanmalı.

**İlke 6 — İki dil eşit vatandaştır.**
Türkçe bir "çeviri katmanı" değil. Bir mütevelli Türkçe not yazar, Kenyalı bir müdür onu İngilizce okur. Sistem bunu doğal kabul eder.

**İlke 7 — Ekran asla olduğundan emin görünmez.**
Veri yoksa "veri yok" yazar. Bağlantı yoksa söyler. Doğrulanmamışsa işaretler. Hesaplanmamış bir hash'i "doğrulandı" diye göstermez.

---

## 4. Roller ve yetkilendirme

### 4.1 Rol envanteri

Mevcut 6 rol yetersiz. Sahadaki gerçek aktörler şunlar:

#### İç çekirdek

| Rol                | Kim                                 | Ana yetki                                                                  |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| `admin`            | Sistem yöneticisi                   | Tam yetki + kullanıcı/rol yönetimi. Gizli içeriğe erişimi **kayda geçer**. |
| `project_director` | Proje direktörü / saha koordinatörü | Operasyonel tam yetki; gizlilik seviyesi atayabilir                        |
| `field_team`       | Saha ekibi üyesi                    | Toplantı, temas, saha kaydı oluşturur; _Gizli_ içerik göremez              |
| `trustee`          | Mütevelli (12 üye)                  | Tüm yönetişim içeriği + _Gizli_; oy kullanır                               |
| `board_director`   | Yönetim kurulu üyesi                | İcra kararları, onay akışları                                              |
| `audit_committee`  | Denetim komitesi                    | Mali kayıtların tamamı salt-okunur + doğrulama yetkisi                     |

#### Dış paydaş

| Rol                 | Kim                                   | Ana yetki                                                              |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `legal_counsel`     | Avukat / hukuk müşaviri               | **Yalnızca kendine atanmış** dava dosyaları; kendi layihalarını yükler |
| `contractor`        | Müteahhit / saha mühendisi            | **Yalnızca kendi blokları**; ilerleme + fotoğraf + HSE kaydı           |
| `quantity_surveyor` | Metraj/maliyet uzmanı (QS)            | BoQ, hakediş, keşif; mali onay yetkisi yok                             |
| `external_auditor`  | Bağımsız denetçi                      | Mali kayıt salt-okunur + denetim notu yazma                            |
| `donor`             | Bağışçı / hayırsever                  | Yalnızca _yayımlanmış_ bağışçı raporu ve kendi bağış izi               |
| `observer`          | Resmî kurum / gözlemci (CUE, valilik) | Yalnızca açıkça yayımlanmış kurumsal içerik                            |
| `consultant`        | Danışman                              | **Süreli** erişim; bitiş tarihi zorunlu                                |

### 4.2 Gizlilik sınıflandırması

Her kayıt (belge, not, karar, temas, risk) tam olarak bir seviye taşır:

| Seviye                               | Kimler görür                                     | Örnek                                                                      |
| ------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| **Genel** (`public`)                 | Tüm giriş yapmış kullanıcılar + bağışçı/gözlemci | Proje künyesi, yayımlanmış ilerleme raporu                                 |
| **Dâhilî** (`internal`) ← varsayılan | İç çekirdek + ilgili dış paydaş                  | Şantiye ilerlemesi, BoQ, toplantı özetleri                                 |
| **Gizli** (`confidential`)           | İç çekirdek + açıkça yetkilendirilmiş kişi       | Hukukî strateji, sözleşme müzakereleri, mali detay                         |
| **Çok Gizli** (`restricted`)         | **Adı adı** belirtilmiş kişiler                  | Mütevelli anlaşmazlıkları, karşı taraf istihbaratı, kişi değerlendirmeleri |

**Çok Gizli için ek kurallar (P0):**

- Dış paydaş rolleri bu seviyeye **hiçbir koşulda** yükseltilemez (veritabanı seviyesinde engel)
- Dışa aktarma ve yazdırma kapalı; ekranda kullanıcı adı filigranı
- AI dizinine **girmez** (bkz. M13-06)
- Her görüntüleme denetim kaydına yazılır
- Arama sonuçlarında yetkisiz kullanıcıya "gizli kayıt var" ipucu bile verilmez

### 4.3 Yetkilendirme gereksinimleri

| ID    | P   | Gereksinim                                                                                                                                           |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-01 | P0  | E-posta + parola ile kimlik doğrulama; zorunlu e-posta doğrulaması                                                                                   |
| M1-02 | P0  | `trustee`, `admin`, `board_director`, `project_director` için **iki faktörlü doğrulama zorunlu**                                                     |
| M1-03 | P0  | Supabase RLS: her tabloda satır düzeyi politika. Yetki kontrolü **istemcide değil veritabanında**                                                    |
| M1-04 | P0  | Gizlilik seviyesi her ana tabloda zorunlu sütun; varsayılan `internal`                                                                               |
| M1-05 | P0  | Kayıt bazlı paylaşım: bir kayda tek tek kişi yetkilendirilebilir (`record_grants`)                                                                   |
| M1-06 | P0  | Dış paydaş kapsamı: `legal_counsel` → atanmış davalar; `contractor` → atanmış bloklar. Kapsam dışı satır API'den **hiç dönmez**                      |
| M1-07 | P0  | Denetim kaydı (audit log): kim, ne zaman, hangi kaydı, ne yaptı. Değiştirilemez; silinemez                                                           |
| M1-08 | P1  | Davet akışı: yönetici davet eder → rol + kapsam + gizlilik tavanı + (varsa) bitiş tarihi belirler                                                    |
| M1-09 | P1  | Süreli erişim: `consultant` ve `observer` için zorunlu bitiş tarihi; süre dolunca otomatik kapanır                                                   |
| M1-10 | P1  | Oturum yönetimi: aktif cihazları görme, uzaktan kapatma                                                                                              |
| M1-11 | P1  | Erişim gözden geçirme: 6 ayda bir yöneticiye "bu kişiler hâlâ erişmeli mi?" listesi                                                                  |
| M1-12 | P2  | Tek oturum açma (Google Workspace) — Türk ve Kenya ekipleri için                                                                                     |
| M1-13 | P2  | IP/coğrafya anomali uyarısı: `restricted` içeriğe alışılmadık konumdan erişim                                                                        |
| M1-14 | P1  | **Acil durum devri:** proje direktörü erişilemez hâle gelirse, iki mütevellinin ortak onayıyla yetki devri. Tek kişiye bağımlılığın teknik panzehiri |

---

## 5. Modüller

Toplam **240 numaralandırılmış gereksinim**, 15 modül ve fonksiyonel olmayan gereksinimlere dağılmış durumda.

| Modül   | Konu                               | Nerede                                     |
| ------- | ---------------------------------- | ------------------------------------------ |
| **M1**  | Kimlik, erişim ve gizlilik         | §4.3 (roller ve sınıflandırmayla birlikte) |
| **M2**  | Yükümlülük ve taahhüt kütüğü ⭐    | §5                                         |
| **M3**  | Toplantı, karar ve aksiyon         | §5                                         |
| **M4**  | Paydaş ve ilişki yönetimi          | §5                                         |
| **M5**  | Hukuk ve dava yönetimi             | §5                                         |
| **M6**  | Risk, sorun, varsayım, bağımlılık  | §5                                         |
| **M7**  | İnşaat ve saha                     | §5                                         |
| **M8**  | Bütçe, finans, bağışçı şeffaflığı  | §5                                         |
| **M9**  | Belge kasası ve delil zinciri      | §5                                         |
| **M10** | Yönetişim, uyum, akademik hazırlık | §5                                         |
| **M11** | İletişim ve bildirim               | §5                                         |
| **M12** | Raporlama ve paneller              | §5                                         |
| **M13** | Arama, bilgi katmanı, AI           | §5                                         |
| **M14** | Tedarik ve sözleşme                | §5                                         |
| **M15** | Plan, takvim, kilometre taşları    | §5                                         |
| **G**   | Notion göçü                        | §7                                         |
| **N**   | Fonksiyonel olmayan gereksinimler  | §8                                         |

> **M1 neden burada değil:** Kimlik ve gizlilik, bir modül değil **her modülün üzerinde duran bir katman**. Bu yüzden rol tanımları ve gizlilik sınıflandırmasıyla birlikte §4'te duruyor. Uygulama sırasında ilk yapılacak iş odur.

### M2 — Yükümlülük ve Taahhüt Kütüğü ⭐

> **Neden:** Bu modül, dokümandaki tek en özgün fikir ve bütün sistemin bağ dokusudur.
>
> Bu projede **dört ayrı kaynaktan** size yüklenmiş yükümlülükler var ve hiçbiri tek yerde toplu durmuyor:
>
> - **Kira sözleşmesi:** kampüste cami inşası, öğrencilerin %20'sine tam burs
> - **Mahkeme kararları:** sınır ihlâli yasağı, satış/devir yasağı, inşaat kısıtı
> - **Vakıf senedi (Cap 164):** organ yapısı, toplantı ve tescil yükümlülükleri
> - **MoU ve resmî taahhütler:** Mombasa Valiliği ile imzalanan mutabakat, CUE akreditasyon şartları
>
> Ayrıca **kişilerin size verdiği sözler** var: bir bakanın "bağlantılarımı kullanacağım" taahhüdü, bir büyükelçinin brifing talebi, bir mütevellinin üstlendiği sorumluluk. Bunlar bugün toplantı notlarının içinde gömülü duruyor ve takip edilmiyor.
>
> **Her ikisi de aynı şeydir: bir tarafın yapmayı üstlendiği, tarihi olan, delili olması gereken bir şey.** Tek kütükte toplanırlar.

| ID    | P   | Gereksinim                                                                                                                                                                                                             |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2-01 | P1  | **Yükümlülük** varlığı: başlık, kaynak türü (sözleşme/mahkeme/senet/MoU/mevzuat/kişisel taahhüt), kaynak belge bağlantısı, yükümlü taraf, lehtar taraf, son tarih, durum, gizlilik                                     |
| M2-02 | P1  | Kaynak belgeye zorunlu bağ. Belgesiz yükümlülük "doğrulanmamış" işaretiyle girer                                                                                                                                       |
| M2-03 | P1  | Durum seti: `Açık` · `Devam ediyor` · `Yerine getirildi` · `İhlâl riski` · `İhlâl edildi` · `Askıda (hukukî)`                                                                                                          |
| M2-04 | P1  | **Uyum kanıtı:** her yükümlülüğe kanıt (belge/fotoğraf/karar) eklenmeden `Yerine getirildi` yapılamaz                                                                                                                  |
| M2-05 | P1  | Mahkeme kararını yükümlülüğe çevirme: bir karar kaydedilirken "bu karar neyi yasaklıyor / neyi emrediyor" maddeleri ayrı ayrı yükümlülüğe dönüşür                                                                      |
| M2-06 | P1  | **İnşaat görevi ↔ yükümlülük çakışma kontrolü:** aktif bir yasak varken çakışan bir saha görevi açılırsa sistem uyarır ve onay ister. Bu, "inşaata devam" kararı gibi bilinçli riskleri **kayda geçirir** — engellemez |
| M2-07 | P1  | Kişisel taahhütler: toplantı kaydından tek tıkla taahhüt oluşturma; taahhüt eden kişi Paydaş kaydına bağlanır                                                                                                          |
| M2-08 | P1  | Taahhüt gerçekleşme oranı: her paydaşın "söz verdiği / yaptığı" oranı profilinde görünür. İlişki yönetiminin en sert ve en dürüst metriği                                                                              |
| M2-09 | P1  | Son tarih takvimi + eşikli hatırlatma (60/30/14/7/1 gün)                                                                                                                                                               |
| M2-10 | P2  | Tekrarlayan yükümlülükler (yıllık tescil, dönemsel beyan)                                                                                                                                                              |
| M2-11 | P2  | **Yükümlülük ısı haritası:** kaynağa göre gruplanmış, risk seviyesine göre renklenmiş tek ekran                                                                                                                        |

---

### M3 — Toplantı, Karar ve Aksiyon Yönetimi

> **Neden:** Bugün ekibin en olgun pratiği bu — Notion'da gündem, katılımcı, not, çıktı, aksiyon alanları zaten disiplinle dolduruluyor. Ama kayıt **takibe dönüşmüyor**: aksiyonun sahibi yok, kapandığı belli değil, bir sonraki toplantıya taşınmıyor. Değerlendirme raporunuzun "düzenli toplantı yapılamaması" tespiti de buraya bakıyor.
>
> **Bu modülün tek hedefi:** toplantı notunu _arşiv_ olmaktan çıkarıp _taahhüt üreten mekanizma_ hâline getirmek.

| ID    | P   | Gereksinim                                                                                                                                                                                                                               |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-01 | P1  | **Toplantı** varlığı: başlık, tarih/saat, yer, tür (İç · Mütevelli · Resmî · Ortak · Hukuk · Saha · Topluluk), öncelik, durum (Planlandı · Devam · Tamamlandı · İptal), hazırlayan, gizlilik                                             |
| M3-02 | P1  | Katılımcılar **serbest metin değil**, Paydaş kayıtlarına bağlı. İç kullanıcı + dış kişi karışık olabilir                                                                                                                                 |
| M3-03 | P1  | Yapılandırılmış not: _Görüşülenler_ · _Kararlar_ · _Aksiyonlar_ · _Çıktılar_ · _Açık sorular_. Mevcut Notion şemanızın birebir karşılığı                                                                                                 |
| M3-04 | P1  | **Karar** ayrı bir varlıktır: numara, metin, gerekçe, alan organ, oylama sonucu (oybirliği/çoğunluk/karşı oy), karşı oy kullanan, tarih, dayandığı belgeler, durum (Yürürlükte · Uygulandı · Geri alındı · Askıda)                       |
| M3-05 | P1  | **Aksiyon** ayrı bir varlıktır: metin, **tek sorumlu** (zorunlu), son tarih (zorunlu), durum, çıktığı toplantı, bağlı karar                                                                                                              |
| M3-06 | P1  | Aksiyon sahibi sistemde kullanıcı **veya** dış paydaş olabilir; dış paydaşa e-posta/WhatsApp ile bildirim gider                                                                                                                          |
| M3-07 | P1  | **Gündem, açık aksiyonlardan otomatik kurulur.** Yeni toplantı açıldığında geçmiş açık aksiyonlar gündeme aday olarak düşer. Hiçbir aksiyon sessizce kaybolamaz                                                                          |
| M3-08 | P1  | Toplantı zinciri: "bu toplantı X'in devamıdır" bağı; bir konunun toplantılar arası izi tek ekranda                                                                                                                                       |
| M3-09 | P1  | **Açık soru / görüş ayrılığı kaydı:** çözülmemiş konular kapanmadan kaybolmaz; sahibi ve hedef çözüm tarihi olur. _(Sahada mütevelliler arasında çözülmemiş değerlendirme farkları mevcut — bunlar bugün hiçbir yerde takip edilmiyor.)_ |
| M3-10 | P1  | Türkçe/İngilizce çift not; birinde yazılan diğerine çeviri önerisi olarak düşer, onaylanana kadar "makine çevirisi" işaretlidir                                                                                                          |
| M3-11 | P1  | Çevrimdışı toplantı kaydı; bağlantı gelince senkron                                                                                                                                                                                      |
| M3-12 | P2  | Sesli not → metin → yapılandırılmış tutanak önerisi (insan onayı zorunlu)                                                                                                                                                                |
| M3-13 | P2  | **Mütevelli toplantı dosyası (board pack):** toplantıdan önce otomatik derlenen PDF — gündem, açık aksiyonlar, mali özet, hukukî durum, riskler, karar taslakları                                                                        |
| M3-14 | P2  | Nisap ve oy kaydı; vakıf senedindeki nisap kuralına göre uyarı                                                                                                                                                                           |
| M3-15 | P2  | Tutanak onay akışı: taslak → katılımcı onayı → kesinleşme. Kesinleşen tutanak değiştirilemez, ancak zeyilname eklenebilir                                                                                                                |
| M3-16 | P3  | Takvim entegrasyonu (Google/Outlook, .ics)                                                                                                                                                                                               |

---

### M4 — Paydaş ve İlişki Yönetimi

> **Neden:** Değerlendirme raporunuzun en net iki maddesi "detaylı paydaş analizi ve yönetimi stratejisi" ile "kamuoyundaki algı yönetimi". Saha kayıtları da bunu doğruluyor: iki haftada bakan, vali, büyükelçi, senatör, ortak vakıf, dört avukat adayı, denetçi, müteahhit ve topluluk liderleriyle ilişki yürütülmüş.
>
> Mevcut Notion Contacts tablosu düz bir rehber — isim, kurum, telefon. Eksik olan şey **ilişkinin kendisi**: bu kişi bizden yana mı, kimi etkiliyor, en son ne zaman konuştuk, ne söz verdi, bir dahaki temas ne zaman olmalı?
>
> Bu, uluslararası proje yönetiminde _stakeholder register_ + _power/interest grid_ + _engagement plan_ üçlüsüdür. Burada hayatî olmasının sebebi şu: **bu projede sonucu belirleyen şey teknik ilerleme değil, ilişki ağı.**

| ID    | P   | Gereksinim                                                                                                                                                                                                                                          |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4-01 | P1  | **Kişi** ve **Kurum** ayrı varlıklar; kişi bir kuruma bağlı, kurum birden çok kişiye sahip                                                                                                                                                          |
| M4-02 | P1  | Kişi alanları: ad, unvan, kurum, kategori (Devlet · Yargı · Ortak Vakıf · Hukuk · Müteahhit · Akademi · Topluluk lideri · Medya · Bağışçı · Karşı taraf · Diğer), iletişim, konum, dil, ilgi/ilişki konusu                                          |
| M4-03 | P1  | **Tutum** alanı: `Şampiyon` · `Destekçi` · `Nötr` · `Şüpheci` · `Muhalif` · `Bilinmiyor` — değişim geçmişiyle birlikte                                                                                                                              |
| M4-04 | P1  | **Nüfuz** (1-5) ve **İlgi** (1-5) puanları → otomatik 2×2 matris görünümü (_Yakından yönet · Memnun tut · Bilgilendir · İzle_)                                                                                                                      |
| M4-05 | P1  | **İlişki sahibi:** her paydaşın sorumlusu bir iç kullanıcıdır. Sahipsiz paydaş uyarı üretir                                                                                                                                                         |
| M4-06 | P1  | Temas günlüğü: tarih, kanal (yüz yüze/telefon/mesaj/e-posta/resmî yazı), özet, sonuç, gizlilik                                                                                                                                                      |
| M4-07 | P1  | **Son temas + ilişki soğuma uyarısı:** kritik paydaşla X gündür temas yoksa ilişki sahibine hatırlatma. Nüfuz puanına göre eşik değişir                                                                                                             |
| M4-08 | P1  | Taahhüt bağı: M2'deki kişisel taahhütler kişinin profilinde listelenir; gerçekleşme oranı görünür                                                                                                                                                   |
| M4-09 | P1  | **Kişi–kişi ilişki bağı:** "X, Y'yi etkiler", "X, Y'nin akrabasıdır", "X, Y ile çalışır". Bu proje kim-kimi-tanıyor üzerinden yürüyor                                                                                                               |
| M4-10 | P2  | **İlişki ağı görselleştirmesi:** nüfuz ve tutuma göre renklenmiş ağ grafiği. "Bakana ulaşmak için en kısa yol kim?" sorusuna görsel cevap                                                                                                           |
| M4-11 | P1  | **Hassas not ayrımı:** her paydaş kaydında iki bölüm — _paylaşılabilir profil_ ve _gizli değerlendirme_. İkincisi varsayılan `restricted`, dış rollere asla açılmaz                                                                                 |
| M4-12 | P2  | Etkileşim planı: bu paydaştan ne istiyoruz, hangi mesajı veriyoruz, sıradaki adım, sorumlu, tarih                                                                                                                                                   |
| M4-13 | P2  | Hizmet sağlayıcı değerlendirmesi: aday avukat/müteahhit/denetçi için karşılaştırma tablosu — teklif, referans, güçlü/zayıf yön, karar. _(Dört hukuk danışmanı adayının paralel değerlendirildiği süreç bugün dağınık toplantı notlarında duruyor.)_ |
| M4-14 | P2  | Paydaş haritası anlık görüntüsü: mütevelli sunumları için tarihli dondurulmuş görünüm                                                                                                                                                               |
| M4-15 | P3  | vCard / CSV içe-dışa aktarma                                                                                                                                                                                                                        |

---

### M5 — Hukuk ve Dava Yönetimi

> **Neden:** Projenin bugünkü varlık sebebi. Ama mevcut uygulama **tek bir davayı**, hem de sabit metin olarak gösteriyor. Gerçekte en az beş dosya var, sürekli yeni başvurular açılıyor, dört farklı avukatla çalışılıyor ve mahkeme kararları inşaattan finansa her şeyi kilitliyor.
>
> Buradaki asıl değer, dava takvimini göstermek değil: **mahkeme kararını uyum yükümlülüğüne çevirmek** (M2-05) ve **hukukî durumu operasyonel kararlara bağlamak**.

| ID    | P   | Gereksinim                                                                                                                                                                                    |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5-01 | P1  | **Dava dosyası** varlığı: dosya no, mahkeme, tür, taraflar, konu, durum, açılış tarihi, risk seviyesi, sorumlu avukat, gizlilik. Çoklu dosya zorunlu                                          |
| M5-02 | P1  | Dosyalar arası ilişki: `birleştirildi` · `temyizidir` · `bağlantılıdır`                                                                                                                       |
| M5-03 | P1  | **Duruşma takvimi:** tarih, tür, heyet, hazırlık durumu, gereken belgeler, katılacak kişiler, geri sayım                                                                                      |
| M5-04 | P1  | **Layiha/dilekçe kütüğü:** tür, sunum tarihi, **son sunum tarihi**, durum, dosyalayan, belge bağı. Usul süresi kaçırma bu projede fiilî bir risk                                              |
| M5-05 | P1  | **Karar/emir kütüğü:** tarih, veren, metin, durum (yürürlükte/değiştirildi/kalktı), **ve otomatik yükümlülük üretimi** (M2-05)                                                                |
| M5-06 | P1  | Delil/ek kütüğü: ek işareti, tanım, kaynak, ilgili olduğu iddia, belge bağı, **delil zinciri** (kim, ne zaman, kime teslim etti)                                                              |
| M5-07 | P1  | Tasdikli suret takibi: hangi belgenin tasdikli sureti var, nerede, ne zaman alındı. _(Tasdikli tapu suretinin eklenmemesi temyiz gerekçelerinizden biri — bu takip doğrudan davanın konusu.)_ |
| M5-08 | P1  | **Avukat portföyü:** hangi avukat hangi dosyada, vekâletname durumu, iletişim, sözleşme, ücret modeli                                                                                         |
| M5-09 | P1  | **Hukuk harcaması takibi:** dosya bazında; M8 bütçesine bağlı                                                                                                                                 |
| M5-10 | P1  | Hukukî görüş arşivi: kimden, ne zaman, hangi soruya, sonuç. Birden fazla avukattan alınan görüşler karşılaştırılabilir                                                                        |
| M5-11 | P2  | **Senaryo analizi:** "kaybedersek", "ortak vakıf temyizden çekilirse", "karar bozulursa" — her senaryonun olasılığı, etkisi, hazırlık planı. Riskle (M6) bağlanır                             |
| M5-12 | P2  | Duruşma brifingi: beklenen sorular, cevaplar, içtihat, savunma sütunları — **veri olarak**, koda gömülü değil                                                                                 |
| M5-13 | P2  | İçtihat/mevzuat kütüphanesi: atıf, kullanım amacı, lehimize/aleyhimize, ilke özeti                                                                                                            |
| M5-14 | P2  | **Kronoloji görünümü:** 30 yıllık mülkiyet ve dava tarihçesi; her olay kaynağa bağlı, düzenlenebilir                                                                                          |
| M5-15 | P2  | Mahkemeye hazır dosya dışa aktarımı: seçilen belgeler numaralı, indeksli tek PDF                                                                                                              |
| M5-16 | P1  | Dış avukat erişimi: yalnızca kendi dosyaları; kendi layihasını yükler; diğer dosyaları ve mali verileri **hiç görmez**                                                                        |

---

### M6 — Risk, Sorun, Varsayım ve Bağımlılık (RAID)

> **Neden:** Değerlendirme raporunuzun açıkça eksik saydığı üç şeyden biri risk yönetimi. Ve bu projenin riskleri sıradan değil: bir ortağın çekilme ihtimali, siyasî iklim değişimi, sahada fizikî tehdit, yargı süreci, muson mevsimi, akreditasyon takvimi.
>
> Bugün bu riskler yalnızca insanların kafasında. **Kafadaki risk, yönetilen risk değildir.**

| ID    | P   | Gereksinim                                                                                                                                                                                          |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6-01 | P1  | **Risk** varlığı: başlık, kategori (Hukukî · Siyasî · Mali · İtibar · Saha güvenliği · İnşaat · Akreditasyon · Ortaklık · Doğa/iklim), olasılık (1-5), etki (1-5), skor, sahip, durum, gizlilik     |
| M6-02 | P1  | Tepki stratejisi: `Kaçın` · `Azalt` · `Devret` · `Kabul et` + somut aksiyon planı (M3 aksiyonlarına bağlı)                                                                                          |
| M6-03 | P1  | **Tetikleyici ve erken uyarı göstergesi:** "bu olursa risk gerçekleşiyor demektir"                                                                                                                  |
| M6-04 | P1  | **Sorun (issue)** varlığı: gerçekleşmiş risk veya bağımsız problem; sahip, etki, çözüm durumu                                                                                                       |
| M6-05 | P1  | Risk → Sorun dönüşümü tek tıkla; iz korunur                                                                                                                                                         |
| M6-06 | P1  | **Varsayım kütüğü:** "kira sözleşmesi geçerli kalacak", "ortak vakıf temyizi sürdürecek" gibi üzerine plan kurulan varsayımlar; her birinin doğrulanma durumu. Çöken varsayım otomatik risk doğurur |
| M6-07 | P1  | **Bağımlılık kütüğü:** "X olmadan Y başlayamaz" — özellikle hukukî karar ↔ inşaat ↔ akreditasyon zinciri                                                                                            |
| M6-08 | P1  | Risk matrisi görünümü (5×5 ısı haritası) + eşik aşımında otomatik bildirim                                                                                                                          |
| M6-09 | P2  | Risk geçmişi: skorun zaman içindeki seyri — "bu risk büyüyor mu?"                                                                                                                                   |
| M6-10 | P2  | Tırmandırma kuralları: skor > eşik → mütevelli heyetine otomatik bildirim                                                                                                                           |
| M6-11 | P2  | **Saha güvenlik olay kaydı:** tarih, olay, müdahale, resmî bildirim yapıldı mı, kanıt. _(Saha fizikî tehdit altında; bu kayıt hem güvenlik hem hukukî delil değeri taşır.)_                         |
| M6-12 | P3  | Senaryo/duyarlılık analizi: birden çok riskin aynı anda gerçekleşmesi                                                                                                                               |

---

### M7 — İnşaat ve Saha Yönetimi

> **Neden:** Mevcut modül bloklar ve yüzdelerden ibaret. Eksik olan: ilerlemenin **kanıtı**, işin **hukukî uyumu**, sahanın **güvenliği** ve hakedişin **mali karşılığı**.
>
> Bu projede bir inşaat görevi asla sadece inşaat görevi değildir — bir mahkeme kararıyla, bir bütçe kalemiyle ve bir akreditasyon şartıyla aynı anda ilişkilidir.

| ID    | P   | Gereksinim                                                                                                                                                   |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M7-01 | P1  | **İş kırılım yapısı:** Faz → Blok/Yapı → İş paketi → Görev. Mevcut düz blok listesi yetersiz                                                                 |
| M7-02 | P1  | Blok: kod, ad, işlev, kat, alan (m²), durum, başlangıç/bitiş hedefi, sorumlu mühendis, müteahhit                                                             |
| M7-03 | P1  | **İlerleme kanıta bağlı:** yüzde güncellemesi fotoğraf/rapor olmadan kaydedilemez. Fotoğrafta tarih ve (mümkünse) konum                                      |
| M7-04 | P1  | **Saha denetim raporu:** denetçi, tarih, bulgular, fotoğraflar, tespit edilen uygunsuzluklar, imza. Değiştirilemez kayıt                                     |
| M7-05 | P1  | Görev durumu: `Planlandı` · `Devam` · `Tamamlandı` · `Hukuken askıda` · `Acil koruma` · `Engellendi`                                                         |
| M7-06 | P1  | **Yükümlülük kontrolü:** görev açılırken aktif hukukî kısıtla çakışma kontrolü (M2-06). Çakışma varsa gerekçe ve onay zorunlu                                |
| M7-07 | P1  | **Metraj ve keşif (BoQ):** kalem, birim, miktar, birim fiyat, tutar, blok bağı, hazırlayan QS, sürüm. Kalıcı — bugün olduğu gibi sayfa yenilenince kaybolmaz |
| M7-08 | P1  | **Hakediş (interim valuation):** dönem, gerçekleşen iş, tutar, QS onayı, direktör onayı, ödeme durumu → M8'e bağlanır                                        |
| M7-09 | P1  | Müteahhit kaydı: firma, sözleşme, kapsam, süre, teminat, performans notu                                                                                     |
| M7-10 | P1  | Dış müteahhit erişimi: **yalnızca kendi blokları**; ilerleme + fotoğraf + HSE girer, mali veriyi görmez                                                      |
| M7-11 | P1  | **Koruma (preservation) görevleri ayrı sınıf:** açıkta kalan yapıyı koruma işleri, yeni inşaattan ayrı izlenir; hukukî gerekçesi kayıtlıdır                  |
| M7-12 | P2  | **İSG / olay kaydı:** kaza, ramak kala, güvenlik ihlâli, müdahale, bildirim                                                                                  |
| M7-13 | P2  | Değişiklik emri (variation order): talep, gerekçe, maliyet etkisi, süre etkisi, onay zinciri                                                                 |
| M7-14 | P2  | **Mevsim/iklim risk takvimi:** muson dönemi ve açıkta kalan yapılar için otomatik uyarı                                                                      |
| M7-15 | P2  | Fotoğraf arşivi: blok ve tarihe göre; aynı açıdan zaman serisi karşılaştırma                                                                                 |
| M7-16 | P2  | Gantt / zaman çizelgesi; kritik yol                                                                                                                          |
| M7-17 | P3  | Mimari çizim görüntüleyici; sürüm karşılaştırma                                                                                                              |
| M7-18 | P3  | Saha güvenlik nöbet kaydı (devriye, giriş-çıkış, olay)                                                                                                       |

---

### M8 — Bütçe, Finans ve Bağışçı Şeffaflığı

> **Neden:** Değerlendirme raporunuzun "başarılı" saydığı iki şeyden biri bütçe yönetimiydi — bu iyi bir temel. Ama bugün portal bunu **doğrulanamaz** biçimde gösteriyor: sahte senkronizasyon, kaynağı belirsiz rakamlar, "denetlendi" rozeti.
>
> Bağışçılar Türkiye'de, harcama Kenya'da, denetim üçüncü bir yerde. **Para, projeye olan güvenin ölçüldüğü yerdir** — burada gerçek olmayan tek bir rozet, tüm sistemin inandırıcılığını götürür.

| ID    | P   | Gereksinim                                                                                                                                                                                  |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M8-01 | P1  | **Bütçe yapısı:** Faz → Kategori → Kalem; her kalem WBS'e (M7-01) bağlanabilir                                                                                                              |
| M8-02 | P1  | Dört ayrı rakam net ayrılır: **Bütçe** · **Taahhüt edilen** · **Harcanan** · **Kalan**. Bugün bunlar birbirine karışmış durumda                                                             |
| M8-03 | P1  | **Çoklu para birimi:** KShs · USD · TRY. Her işlem kendi para biriminde saklanır + işlem tarihindeki kur. Raporlama para birimi seçilebilir. Türk bağışçı TRY, Kenya tedarikçisi KShs görür |
| M8-04 | P1  | **Ödeme fişi (PV) akışı:** talep → bütçe kontrolü → onay (tutara göre kademeli) → ödeme → belge → denetim doğrulaması. Bugünkü tek adımlı "kaydet" yetersiz                                 |
| M8-05 | P1  | Onay eşikleri: tutar arttıkça onaycı yükselir (direktör → kurul → mütevelli heyeti)                                                                                                         |
| M8-06 | P1  | **"Denetlendi" rozeti yalnızca denetim komitesi/dış denetçi işaretlerse görünür.** Varsayılan olarak konulamaz                                                                              |
| M8-07 | P1  | Her işlem belgeye bağlı (fatura, dekont, hakediş). Belgesiz işlem "doğrulanmamış"                                                                                                           |
| M8-08 | P1  | **Bağış ve dilim takibi:** bağışçı, taahhüt tutarı, taahhüt tarihi, gelen dilimler, kalan. Taahhüt ≠ tahsilat                                                                               |
| M8-09 | P1  | Kategori bazlı harcama dağılımı — veriden hesaplanır, sabit yazılmaz                                                                                                                        |
| M8-10 | P1  | Mevcut sahte muhasebe entegrasyonu **kaldırılır**. Yerine: ya gerçek entegrasyon ya da dürüst CSV içe/dışa aktarım                                                                          |
| M8-11 | P2  | Muhasebe yazılımı entegrasyonu (QuickBooks/Xero/SAP B1) — sunucu tarafında, gerçek OAuth, gerçek hata yönetimi                                                                              |
| M8-12 | P2  | **Bağışçı raporu:** otomatik derlenen, yayımlanmadan önce onaylanan, bağışçının kendi katkısının nereye gittiğini gösteren rapor                                                            |
| M8-13 | P2  | Nakit akışı projeksiyonu: taahhütler, hakediş planı, hukuk harcaması                                                                                                                        |
| M8-14 | P2  | Vergi muafiyeti (KRA) durum takibi ve bağışçıya sağladığı avantajın gösterimi                                                                                                               |
| M8-15 | P2  | Bütçe aşım uyarısı: kalem bazında eşik aşıldığında sorumluya bildirim                                                                                                                       |
| M8-16 | P3  | Dönemsel mali kapanış ve denetim dosyası dışa aktarımı                                                                                                                                      |

---

### M9 — Belge Kasası ve Delil Zinciri

> **Neden:** Mevcut modül en tehlikeli olanı. "Şifreli", "SHA-256 doğrulandı", "Güvenli belge" yazıyor — ama dosya yükleme bile yok. Bu, var olmayan bir güvenceyi görsel olarak vaat etmektir.
>
> Gerçek ihtiyaç ciddi: mahkemeye sunulacak belgeler, tasdikli suretler, vakıf senedi, kira sözleşmesi, mimari çizimler, bağış dekontları. Bunların **hangi sürümünün geçerli olduğu** ve **kimin ne zaman gördüğü** hukukî sonuç doğurur.

| ID    | P   | Gereksinim                                                                                                                                 |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| M9-01 | P0  | **Gerçek dosya yükleme ve depolama** (Supabase Storage / S3). Metadata-only kayıt kaldırılır                                               |
| M9-02 | P0  | **SHA-256 sunucu tarafında hesaplanır**, kullanıcıdan alınmaz. Hesaplanmamışsa "doğrulandı" gösterilmez                                    |
| M9-03 | P0  | Şifreleme iddiası ancak gerçekten sağlanıyorsa gösterilir (at-rest + in-transit). Aksi hâlde metin kaldırılır                              |
| M9-04 | P1  | **Sürüm yönetimi:** her yükleme yeni sürüm; eski sürümler silinmez; "geçerli sürüm" açıkça işaretli                                        |
| M9-05 | P1  | Kategori: Vakıf senedi · Mahkeme kararı · Layiha · Delil · Sözleşme/MoU · Mimari · Metraj/mali · Akreditasyon · Yazışma · Fotoğraf · Diğer |
| M9-06 | P1  | Gizlilik seviyesi belge düzeyinde; M1 kurallarına tâbi                                                                                     |
| M9-07 | P1  | **Erişim kaydı:** kim, ne zaman indirdi/görüntüledi. `confidential` ve üzeri için zorunlu                                                  |
| M9-08 | P1  | Belge ↔ varlık bağı: dava, yükümlülük, toplantı, işlem, blok, paydaş                                                                       |
| M9-09 | P1  | **Tasdikli/asıl nüsha takibi:** aslı nerede, tasdikli sureti var mı, ne zaman alındı, geçerlilik süresi                                    |
| M9-10 | P2  | Tam metin arama + TR/EN OCR (taranmış mahkeme evrakı için zorunlu)                                                                         |
| M9-11 | P2  | **Hukukî muhafaza (legal hold):** davaya konu belge silinemez, arşivlenemez                                                                |
| M9-12 | P2  | Hassas belge indirmede kullanıcı adı filigranı                                                                                             |
| M9-13 | P2  | Saklama politikası ve arşivleme                                                                                                            |
| M9-14 | P3  | Belge içi yorum ve vurgulama                                                                                                               |

---

### M10 — Yönetişim, Kurumsal Uyum ve Akademik Hazırlık

> **Neden:** Vakıf üç organlı (Mütevelli Heyeti · Yönetim Kurulu · Denetim Komitesi) ve bunların düzgün işlememesi değerlendirme raporunuzda açıkça bir başarısızlık nedeni olarak yazılı. Ayrıca CUE akreditasyonu, KRA muafiyeti, Cap 164 tescil yükümlülükleri ve 2027 ilk öğrenci alımı hedefi — bunların hepsi takvimli ve kanıtlı süreçler.
>
> Akademik hazırlık bugün portalda **hiç yok**. Oysa projenin amacı bir üniversite; inşaat sadece aracı.

| ID     | P   | Gereksinim                                                                                                                               |
| ------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| M10-01 | P1  | **Mütevelli kütüğü:** ad, atayan kurum, atama tarihi, görev süresi, rol, iletişim, aktiflik, kimlik belgesi                              |
| M10-02 | P1  | Organ yapısı: üç organ, üyeleri, yetki alanları, toplantı sıklığı, nisap kuralı                                                          |
| M10-03 | P1  | **Karar kütüğü (resmî):** M3-04'teki kararların yönetişim organlarına ait olanları; numaralı, imzalı, arşivli                            |
| M10-04 | P1  | Kararların uygulanma takibi: her karara bağlı aksiyonların durumu; "alınmış ama uygulanmamış kararlar" listesi                           |
| M10-05 | P1  | **Mevzuat uyum takvimi:** Cap 164 tescil/beyan, KRA, CUE, valilik. Her biri M2'de yükümlülük olarak yaşar                                |
| M10-06 | P1  | **CUE akreditasyon kontrol listesi:** gereken şart → mevcut durum → kanıt belgesi → sorumlu → hedef tarih                                |
| M10-07 | P1  | Berat yol haritası: aşamalar, bağımlılıklar, hedef tarihler — veri olarak, sabit metin değil                                             |
| M10-08 | P2  | **Akademik program kütüğü:** program adı, derece, onay durumu, müfredat belgesi, akademik kadro gereksinimi                              |
| M10-09 | P2  | **Burs taahhüdü takibi:** %20 tam burs yükümlülüğü — hedef, tahsis, gerçekleşme. Kira sözleşmesinden doğan yükümlülük olarak M2'ye bağlı |
| M10-10 | P2  | Kampüs cami yükümlülüğü takibi (aynı şekilde M2'ye bağlı)                                                                                |
| M10-11 | P2  | Çıkar çatışması beyan kütüğü                                                                                                             |
| M10-12 | P2  | İlk öğrenci alımı hazırlık panosu: altyapı, kadro, müfredat, akreditasyon, tanıtım — tek ekranda geri sayım                              |
| M10-13 | P3  | Vakıf senedi maddelerine atıflı yönetişim referans sayfası                                                                               |

---

### M11 — İletişim ve Bildirim

> **Neden:** "Paydaş iletişim stratejisi geliştirilmesi" değerlendirme raporunuzun _hemen uygulanabilir görevler_ listesinde ikinci madde. Ayrıca ekip Türkiye, Mombasa ve Nairobi arasında dağılmış; kritik bir duruşma tarihi kimsenin gözünden kaçmamalı.
>
> Not: Portal içi mesajlaşma **WhatsApp'ın yerini almaz**. Almaya çalışmak başarısızlığın garantisidir. Portal _resmî kayıt_, WhatsApp _günlük konuşma_ olarak kalır; portal WhatsApp'a bildirim gönderir.

| ID     | P   | Gereksinim                                                                                                        |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------- |
| M11-01 | P1  | Konu (thread) tabanlı tartışma; her konu bir kanala ve gizlilik seviyesine bağlı                                  |
| M11-02 | P0  | **Mesaj sahipliği gerçek kullanıcıdan gelir** — bugünkü sabit `'Current User'` kaldırılır                         |
| M11-03 | P0  | Mesaj ekleme atomik olmalı (ayrı satır); bugünkü JSONB oku-değiştir-yaz yöntemi eşzamanlı mesajda veri kaybediyor |
| M11-04 | P1  | Kanallar: Mütevelli · Hukuk · İnşaat · Mali · Resmî ilişkiler · Genel. Kanal bazlı üyelik ve gizlilik             |
| M11-05 | P1  | Varlığa bağlı tartışma: bir dava, blok, yükümlülük veya işlem üzerinde doğrudan konuşma                           |
| M11-06 | P1  | **Bildirim kanalları:** uygulama içi + e-posta + WhatsApp (Kenya'da fiilî standart) + PWA push                    |
| M11-07 | P1  | Kullanıcı bazlı bildirim tercihleri; kritik bildirimler (duruşma, son tarih) kapatılamaz                          |
| M11-08 | P1  | **Kritik duyuruda okundu bilgisi:** kimin gördüğü kayıtlı                                                         |
| M11-09 | P1  | **Takvim uyarısını "kapatma" kişiseldir** — bugünkü gibi herkes için silinmez (S-10)                              |
| M11-10 | P2  | **Haftalık otomatik özet:** mütevelliye ayrı, saha ekibine ayrı, bağışçıya ayrı içerik                            |
| M11-11 | P2  | Duyuru (tek yönlü) ile tartışma (çift yönlü) ayrımı                                                               |
| M11-12 | P2  | Dış paydaşa gönderilen resmî yazı kaydı: gönderim tarihi, kanal, ek, teslim teyidi                                |
| M11-13 | P3  | Dosya/fotoğraf ekleme, alıntılama, tepki                                                                          |

---

### M12 — Raporlama ve Gösterge Panelleri

> **Neden:** Farklı roller aynı gerçeğin farklı özetine ihtiyaç duyar. Mütevelli "ne karar vermem gerekiyor?", bağışçı "param nereye gitti?", saha "bugün ne yapacağım?" diye sorar. Tek bir panelin hepsini karşılaması mümkün değil.

| ID     | P   | Gereksinim                                                                                                                  |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------------- |
| M12-01 | P1  | **Role göre ana ekran.** Mütevelli, saha ekibi, avukat, müteahhit, bağışçı farklı giriş ekranı görür                        |
| M12-02 | P1  | **Gündem paneli:** açık kritik aksiyonlar, yaklaşan son tarihler, yükselen riskler, bekleyen onaylar — tek ekranda          |
| M12-03 | P1  | Tüm göstergeler **veriden hesaplanır**; sabit yazılmış rakam kalmaz (S-3)                                                   |
| M12-04 | P1  | **Yükleme, hata ve boş durumları ayrı ayrı gösterilir** (S-5). Bağlantı yoksa "veri yok" değil "bağlanamadı" yazar          |
| M12-05 | P1  | Veri tazeliği göstergesi: "son güncelleme: X"                                                                               |
| M12-06 | P2  | **Mütevelli toplantı dosyası** otomatik derleme (M3-13)                                                                     |
| M12-07 | P2  | Bağışçı şeffaflık raporu (M8-12)                                                                                            |
| M12-08 | P2  | Dönemsel proje durum raporu (PDF/Word), TR ve EN                                                                            |
| M12-09 | P2  | Tarih aralığı seçimli özel rapor                                                                                            |
| M12-10 | P2  | **Karar destek paneli:** "şu an mütevelli kararı bekleyen konular" — açık sorular, onay bekleyenler, tırmandırılmış riskler |
| M12-11 | P3  | Grafikler: ilerleme eğrisi, harcama eğrisi, risk seyri                                                                      |
| M12-12 | P3  | Yazdırmaya uygun görünümler                                                                                                 |

---

### M13 — Arama, Bilgi Katmanı ve AI Asistanı

> **Neden:** Mevcut AI asistanı kavramsal olarak doğru yerde, uygulaması ise sorunlu: API anahtarı tarayıcıda (H-7), bağlam olarak ham JSON gönderiliyor, kaynak gösterilmiyor, gizlilik seviyesi tanımıyor.
>
> AI burada süs değil gerçek bir ihtiyaç: iki dilli, on yıllık, binlerce sayfalık bir arşiv var ve kurumsal hafıza tek kişide. Ama **yetkisiz bir kullanıcıya gizli içeriği özetleyen bir asistan**, sızıntının en hızlı yoludur.

| ID     | P   | Gereksinim                                                                                                                                                                                         |
| ------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M13-01 | P0  | **API anahtarı sunucuda.** Tüm AI çağrıları sunucu tarafı proxy üzerinden (H-7)                                                                                                                    |
| M13-02 | P0  | **Gizlilik farkındalığı:** AI yalnızca o kullanıcının görmeye yetkili olduğu kayıtlar üzerinde çalışır. Yetki kontrolü sorgu anında, sunucuda                                                      |
| M13-03 | P0  | `restricted` içerik AI dizinine **hiç girmez**                                                                                                                                                     |
| M13-04 | P1  | **Kaynak gösterme zorunlu:** her cevap dayandığı kayıtlara bağlantı verir. Kaynaksız cevap üretilmez                                                                                               |
| M13-05 | P1  | Global arama: dava, belge, paydaş, toplantı, karar, yükümlülük, işlem — hepsi tek kutudan, yetkiye göre filtreli                                                                                   |
| M13-06 | P1  | TR/EN çapraz arama: Türkçe sorgu İngilizce belgeyi bulur                                                                                                                                           |
| M13-07 | P1  | AI kullanım alanları **sınırlı ve tanımlı:** (a) arşiv üzerinde soru-cevap, (b) toplantı notu → yapılandırılmış tutanak, (c) TR↔EN çeviri önerisi, (d) haftalık özet taslağı, (e) uzun belge özeti |
| M13-08 | P0  | **AI hukukî görüş üretmez.** Hukukî soru sorulduğunda mevcut kayıtlı görüşlere yönlendirir. Üretilen her metin "taslak — insan onayı gerekir" etiketiyle çıkar                                     |
| M13-09 | P1  | AI çıktısı doğrudan kayda yazılmaz; kullanıcı onaylar                                                                                                                                              |
| M13-10 | P2  | AI kullanım kaydı: kim ne sordu (denetim ve maliyet takibi)                                                                                                                                        |
| M13-11 | P2  | Kaydedilmiş arama / filtre                                                                                                                                                                         |
| M13-12 | P3  | Benzer kayıt önerisi ("bu toplantı şu konuyla ilgili")                                                                                                                                             |
| M13-13 | P1  | **Belge alımı:** yüklenen belge analiz edilmeden önce kasaya girer; analiz kasadaki sürüme referansla çalışır                                                                                      |
| M13-14 | P0  | Alımdan çıkan her şey **teklif**tir. Kayda dönüşmesi kullanıcı onayı ister ve yazma, kullanıcının kendi yetkisiyle normal kurallardan geçer (M13-09'un alım tarafı)                                |
| M13-15 | P0  | Teklif edilen her alan, belgede hangi cümleden geldiğini taşır. **Alıntısı olmayan değer teklif edilemez**                                                                                         |
| M13-16 | P0  | Belirsiz bir değer uydurulmaz: `null` kalır ve neden belirsiz olduğu yazılır                                                                                                                       |
| M13-17 | P1  | Modül her yazılabilir kayıt türüne teklif verebilir; kapsamı veritabanındaki kayıttan gelir, koddan değil                                                                                          |
| M13-18 | P0  | Reddedilen teklif **iş kuyruğundan çıkar, kararı kalır**: red, gerekçesi ve dayandığı alıntıyla kaydedilir — listede değil, belgenin yanında                                                       |
| M13-19 | P0  | **Reddedilmiş bir şey yeniden teklif edilmez.** Aynı belge yeniden okunduğunda daha önce reddedilen alıntı bir daha önerilmez                                                                      |
| M13-20 | P0  | Alım ekranı bir **iş kuyruğudur, arşiv değil**: karar bekleyen önce gelir ve en eskiden akar, kararı bitmiş okuma kuyruktan düşer                                                                  |
| M13-21 | P1  | Kabul edilen teklifin açtığı kayıt, **hangi belgeden ve hangi alıntıdan** geldiğini gösterir                                                                                                       |
| M13-22 | P1  | Kuyruk sayfalanır ve aranabilir; "en yeni N" diye sessizce kesilmez — kaç tane olduğu da yazar                                                                                                     |
| M13-23 | P1  | Teklif üretemeyen bir sürümle yapılmış okuma, teklif üretip hiçbir şey bulamamış okumadan **kayıtla** ayırt edilir, tahminle değil                                                                 |
| M13-24 | P1  | **Toplu red vardır, toplu kabul yoktur**: bir kaydın açılması, o kaydı birinin görmüş olmasını ister                                                                                               |

---

### M14 — Tedarik ve Sözleşme Yönetimi

> **Neden:** Uluslararası proje yönetimi standartlarının (PMBOK _procurement management_) karşılığı. Bu projede fiilen yaşanıyor: dört avukat adayı, müteahhit seçimi, denetçi arayışı, danışmanlar. Ama hiçbirinin seçim gerekçesi, teklifi ve sözleşmesi tek yerde durmuyor.
>
> Bir vakıfta bu sadece verimlilik meselesi değil — **bağışçıya ve denetime hesap verebilirliktir.**

| ID     | P   | Gereksinim                                                                                                                |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------- |
| M14-01 | P2  | Tedarik talebi: ihtiyaç, gerekçe, tahmini bütçe, talep eden, onay durumu                                                  |
| M14-02 | P2  | **Aday değerlendirme tablosu:** teklif, kapsam, ücret, referans, güçlü/zayıf yön, puan, karar gerekçesi (M4-13 ile ortak) |
| M14-03 | P2  | **Sözleşme kütüğü:** taraf, konu, tutar, süre, başlangıç/bitiş, yenileme tarihi, fesih şartı, belge bağı                  |
| M14-04 | P2  | Sözleşme yükümlülükleri otomatik olarak M2'ye düşer                                                                       |
| M14-05 | P2  | Bitiş/yenileme uyarısı (90/60/30 gün)                                                                                     |
| M14-06 | P2  | Tedarikçi performans değerlendirmesi                                                                                      |
| M14-07 | P3  | Ödeme planı ve sözleşme-hakediş eşleştirmesi                                                                              |

---

### M15 — Proje Omurgası: Plan, Takvim ve Kilometre Taşları

> **Neden:** Şu anda portalda "proje planı" diye bir şey yok — sadece modüller var. Oysa değerlendirme raporunuzun ilk stratejik önerisi "profesyonel proje yönetim prensiplerinin tam entegrasyonu".
>
> Bu modül diğerlerini birbirine bağlayan zaman eksenidir.

| ID     | P   | Gereksinim                                                                                                                  |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------------- |
| M15-01 | P1  | **Kilometre taşı** varlığı: ad, hedef tarih, gerçekleşen tarih, durum, sahip, bağımlılıklar, kanıt                          |
| M15-02 | P1  | Faz yapısı: proje fazları ve her fazın kapsamı                                                                              |
| M15-03 | P1  | **Birleşik takvim:** duruşmalar, toplantılar, son tarihler, kilometre taşları, mevzuat tarihleri — tek görünüm, filtreli    |
| M15-04 | P1  | **Kritik geri sayım şeridi:** en yakın kritik üç tarih her ekranda üstte (mevcut `DeadlineAlertBanner`'ın olgunlaşmış hâli) |
| M15-05 | P2  | Bağımlılık zinciri görselleştirmesi: hukukî karar → inşaat → akreditasyon → öğrenci alımı                                   |
| M15-06 | P2  | Temel plan (baseline) ve sapma: "6 ay önce ne demiştik, şimdi neredeyiz?"                                                   |
| M15-07 | P2  | **Proje kronolojisi:** 1993'ten bugüne tek zaman çizelgesi; her olay kaynağa bağlı. Hem kurumsal hafıza hem hukukî delil    |
| M15-08 | P3  | Gantt görünümü                                                                                                              |

---

## 6. Veri modeli — ana varlıklar

Doğrudan `src/types/index.ts` yerine geçecek çekirdek. İlişkiler, modüllerin birbirine gerçekten bağlanmasını sağlayan şey.

```
KİMLİK
  User ── Role, gizlilik tavanı, kapsam (dava/blok listesi), bitiş tarihi
  AuditLog ── actor, action, entity, before/after, timestamp   [değiştirilemez]
  RecordGrant ── user, entity_type, entity_id, izin            [kayıt bazlı paylaşım]

PAYDAŞ
  Organization ── ad, tür, ülke, notlar
  Person ── ad, unvan, Organization, kategori, tutum, nüfuz, ilgi,
            ilişki sahibi (User), dil, iletişim, gizlilik
  Relationship ── from Person, to Person, tür, güç        [kim kimi etkiliyor]
  Interaction ── Person, tarih, kanal, özet, sonuç, gizlilik

YÜKÜMLÜLÜK  ⭐ bağ dokusu
  Obligation ── başlık, kaynak türü, kaynak belge, yükümlü, lehtar,
                son tarih, durum, kanıt, gizlilik
       └─ bağlanır → LegalOrder · Contract · Decision · Task · Transaction

TOPLANTI & KARAR
  Meeting ── başlık, tarih, yer, tür, durum, hazırlayan, gizlilik
  MeetingAttendee ── Meeting × (User | Person)
  Decision ── metin, organ, oylama, tarih, durum, Meeting
  ActionItem ── metin, sorumlu, son tarih, durum, Meeting, Decision
  OpenQuestion ── konu, taraflar, durum, hedef çözüm tarihi   [görüş ayrılıkları]
  Suggestion ── öneri, öneren, tür, durum, inceleyen          [Notion'dan göç]

HUKUK
  LegalCase ── dosya no, mahkeme, taraflar, durum, risk, sorumlu avukat
  Hearing ── LegalCase, tarih, tür, heyet, hazırlık durumu
  Filing ── LegalCase, tür, son tarih, sunum tarihi, durum
  LegalOrder ── LegalCase, tarih, metin, durum  → Obligation üretir
  Exhibit ── LegalCase, işaret, tanım, Document, delil zinciri
  LegalOpinion ── soru, veren (Person), tarih, sonuç, Document

RİSK
  Risk ── başlık, kategori, olasılık, etki, sahip, strateji, tetikleyici
  Issue ── başlık, kaynak Risk, etki, çözüm durumu, sahip
  Assumption ── ifade, doğrulanma durumu, çökerse doğacak Risk
  Dependency ── from, to, tür, durum

İNŞAAT
  Phase → Block → WorkPackage → Task
  Task ── ad, durum, sorumlu, tarih, Obligation çakışma bayrağı
  ProgressUpdate ── Block/Task, yüzde, tarih, kanıt (Document), kaydeden
  Inspection ── Block, denetçi, tarih, bulgular, fotoğraflar, imza
  BoQItem ── Block, kalem, birim, miktar, birim fiyat, sürüm, QS
  Valuation ── dönem, tutar, QS onayı, direktör onayı  → Transaction
  Contractor ── firma, Contract, kapsam, performans
  SafetyIncident ── tarih, tür, müdahale, bildirim, kanıt

FİNANS
  BudgetLine ── faz, kategori, kalem, tutar, para birimi, WBS bağı
  Pledge ── bağışçı (Person/Org), tutar, para birimi, tarih, durum
  Transaction ── referans, tarih, tutar, para birimi, kur, kategori,
                 alıcı, BudgetLine, belge, onay zinciri, denetim durumu
  Approval ── Transaction, onaylayan, seviye, tarih

BELGE
  Document ── başlık, kategori, gizlilik, sahip, geçerli sürüm
  DocumentVersion ── Document, sürüm no, dosya, sha256, yükleyen, tarih
  DocumentAccess ── Document, User, action, timestamp
  CertifiedCopy ── Document, asıl konumu, tasdik tarihi, geçerlilik

YÖNETİŞİM
  Trustee ── Person, atayan kurum, atama tarihi, süre, aktiflik
  Organ ── ad, üyeler, yetki, nisap kuralı
  ComplianceItem ── mevzuat, gereklilik, son tarih, durum, kanıt → Obligation
  AcademicProgram ── ad, derece, onay durumu, müfredat belgesi

PLAN
  Milestone ── ad, hedef, gerçekleşen, durum, sahip, bağımlılıklar
  TimelineEvent ── tarih, başlık, açıklama, kaynak, kategori

İLETİŞİM
  Channel ── ad, üyeler, gizlilik
  Thread ── Channel, başlık, bağlı varlık, durum
  Message ── Thread, gönderen (User), metin, ek, tarih    [ayrı satır, JSONB değil]
  Notification ── alıcı, tür, kanal, durum, okundu
```

**Her ana varlıkta ortak alanlar:** `confidentiality`, `created_by`, `created_at`, `updated_by`, `updated_at`, `source_document_id` (İlke 2), `verified` (doğrulanmış mı).

---

## 7. Notion'dan göç planı

Mevcut Notion içeriği tek seferde taşınacak. Eşleştirme:

| Notion                                                                                                                                 | →   | Portal                          | Not                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 📅 Meetings (Meeting Title, Date, Location, Type, Priority, Status, Attendees, Agenda, Notes, Key Outcomes, Action Items, Prepared By) | →   | `Meeting`                       | Alanlar birebir karşılanıyor                                                                                                     |
| Meetings → _Action Items_ (serbest metin, numaralı liste)                                                                              | →   | `ActionItem` satırları          | **Ayrıştırma gerekir:** metin listesi tek tek kayda bölünecek, her birine sorumlu ve tarih atanacak. Göçün en emek isteyen kısmı |
| Meetings → _Key Outcomes_                                                                                                              | →   | `Decision` + `Meeting.outcomes` | Karar niteliğindekiler ayrı varlığa çıkarılır                                                                                    |
| Meetings → _Attendees_ (serbest metin)                                                                                                 | →   | `Person` + `MeetingAttendee`    | İsimler eşleştirilip kişi kayıtlarına bağlanacak                                                                                 |
| 📋 Toplantılar (Türkçe)                                                                                                                | →   | `Meeting` (TR alanları)         | Aynı toplantının TR kaydıysa birleştirilir, ayrı toplantıysa ayrı kayıt                                                          |
| 👥 Contacts (Name, Organization, Role/Title, Category, Phone, Email, Location, Topic/Relevance, Notes)                                 | →   | `Person` + `Organization`       | **Genişletme:** tutum, nüfuz, ilgi, ilişki sahibi alanları göç sırasında elle doldurulacak                                       |
| 📁 Materials (Title, Type, Tags, Date, File/URL, Description, Meeting Ref, Uploaded By)                                                | →   | `Document` + `DocumentVersion`  | `sensitive` etiketi → `confidential`; `public` → `public`; diğerleri → `internal`                                                |
| 💡 Team Suggestions (Suggestion, Type, Details, Suggested By, Status, Priority, Reviewed By, Review Notes)                             | →   | `Suggestion`                    | Şema birebir; `Added to Plan` olanlar `ActionItem`'a bağlanır                                                                    |
| Reports / All Reports                                                                                                                  | →   | `Document` (kategori: Rapor)    | Proje Değerlendirme Raporu dâhil                                                                                                 |
| Subjects, Kitaplar                                                                                                                     | →   | `Document` (kategori: Referans) | Düşük öncelik                                                                                                                    |
| Project Sections, Mind Map                                                                                                             | →   | —                               | Göç edilmez; portal yapısı bunun yerine geçer                                                                                    |

**Göç gereksinimleri:**

| ID   | P   | Gereksinim                                                                                                                                                                          |
| ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | P1  | Göç betiği tekrar çalıştırılabilir olmalı (idempotent); iki kez çalışınca kayıt çiftlenmemeli                                                                                       |
| G-02 | P1  | Her göç edilen kayıtta `source: notion` ve orijinal Notion URL'i saklanır — izlenebilirlik                                                                                          |
| G-03 | P1  | **Gizlilik seviyesi göç sırasında atanır.** Varsayılan `internal`; toplantı notlarındaki hassas değerlendirmeler elle `restricted` işaretlenir. Otomatik değil, **insan kararıyla** |
| G-04 | P1  | Göç raporu: kaç kayıt taşındı, kaç tanesi eşleşemedi, hangileri elle müdahale bekliyor                                                                                              |
| G-05 | P1  | Göç sonrası doğrulama listesi: kişi eşleştirmeleri, aksiyon sorumluları, tarihler                                                                                                   |
| G-06 | P2  | Notion salt-okunur arşiv olarak saklanır (silinmez), portal tek doğru kaynak olur                                                                                                   |

---

## 8. Fonksiyonel olmayan gereksinimler

### 8.1 Güvenlik

| ID   | P   | Gereksinim                                                                                         |
| ---- | --- | -------------------------------------------------------------------------------------------------- |
| N-01 | P0  | Yetkilendirme **veritabanı seviyesinde** (Supabase RLS). İstemci kontrolü tek başına yeterli değil |
| N-02 | P0  | Hiçbir gizli anahtar istemci paketinde olmaz (Gemini, muhasebe API'leri, servis anahtarları)       |
| N-03 | P0  | Aktarımda TLS; durağan veride şifreleme; dosya depolamada imzalı ve süreli erişim bağlantıları     |
| N-04 | P0  | Denetim kaydı değiştirilemez ve silinemez                                                          |
| N-05 | P1  | Parola politikası + oturum zaman aşımı (hassas roller için daha kısa)                              |
| N-06 | P1  | Hız sınırlama; kaba kuvvet koruması                                                                |
| N-07 | P1  | Dosya yüklemede tür ve boyut doğrulama, kötü amaçlı içerik taraması                                |
| N-08 | P1  | Bağımlılık güvenlik taraması (CI'da)                                                               |
| N-09 | P2  | Düzenli yedek + **geri yükleme tatbikatı**. Yedeği test edilmemiş sistem yedeksizdir               |
| N-10 | P2  | Güvenlik olayı müdahale planı                                                                      |

### 8.2 Hukukî uyum

| ID   | P   | Gereksinim                                                                            |
| ---- | --- | ------------------------------------------------------------------------------------- |
| N-11 | P1  | **Kenya Data Protection Act 2019** uyumu — kişisel veri işleniyor ve veriler Kenya'da |
| N-12 | P1  | Türkiye tarafı için **KVKK** uyumu; AB'li bağışçı varsa **GDPR**                      |
| N-13 | P1  | Veri saklama konumu bilinçli seçilir ve belgelenir                                    |
| N-14 | P2  | Aydınlatma metni, veri işleme kaydı, silme/erişim talebi akışı                        |
| N-15 | P2  | Dış paydaş sözleşmelerinde veri işleme maddesi                                        |

### 8.3 Performans ve erişilebilirlik

| ID   | P   | Gereksinim                                                                                              |
| ---- | --- | ------------------------------------------------------------------------------------------------------- |
| N-16 | P1  | **3G bağlantıda kullanılabilir.** İlk anlamlı çizim < 3 sn                                              |
| N-17 | P1  | Çevrimdışı okuma: son görüntülenen veriler erişilebilir                                                 |
| N-18 | P1  | **Çevrimdışı yazma:** saha kaydı, toplantı notu, fotoğraf kuyruğa alınır, bağlantı gelince senkronlanır |
| N-19 | P1  | Çakışma çözümü: aynı kayıt iki yerden değiştiyse kullanıcıya gösterilir, sessizce üzerine yazılmaz      |
| N-20 | P1  | Mobil öncelikli tasarım; şantiyede telefonla kullanılabilir olmalı                                      |
| N-21 | P2  | WCAG 2.1 AA: kontrast, klavye erişimi, ekran okuyucu etiketleri                                         |
| N-22 | P2  | Düşük bant genişliği modu: fotoğraflar isteğe bağlı yüklenir                                            |

### 8.4 Çok dillilik

| ID   | P   | Gereksinim                                                                                                                                |
| ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| N-23 | P1  | **Tek i18n mekanizması.** Satır içi `language === 'tr' ? ...` kullanımı tamamen kaldırılır (S-4)                                          |
| N-24 | P1  | Arayüz metinleri çeviri dosyalarında; koda gömülü metin kalmaz                                                                            |
| N-25 | P1  | **İçerik çok dilliliği ayrı meseledir:** kullanıcı verisi (toplantı notu, karar metni) kendi dilinde saklanır + isteğe bağlı çeviri alanı |
| N-26 | P1  | Makine çevirisi **her zaman** işaretlidir; insan onayıyla "onaylı çeviri"ye döner                                                         |
| N-27 | P1  | **Birim ve para birimi doğru dönüştürülür** — acre ↔ dönüm ↔ m², KShs ↔ USD ↔ TRY (H-5)                                                   |
| N-28 | P2  | Tarih/sayı biçimleri yerelleştirilir; saat dilimi (EAT / TRT) açıkça gösterilir                                                           |
| N-29 | P3  | Üçüncü dil (Svahili) için altyapı hazır olmalı                                                                                            |

### 8.5 Yazılım kalitesi

| ID   | P   | Gereksinim                                                                                    |
| ---- | --- | --------------------------------------------------------------------------------------------- |
| N-30 | P1  | ESLint + Prettier + `tsc --noEmit` çalışır durumda (bugün tip tanımları eksik)                |
| N-31 | P1  | Yetkilendirme kuralları için **otomatik test zorunlu.** Bu testler olmadan dış erişim açılmaz |
| N-32 | P1  | CI: derleme + tip kontrolü + test, her PR'da                                                  |
| N-33 | P1  | Hata izleme (Sentry vb.) — sessiz hata kalmaz                                                 |
| N-34 | P1  | React hata sınırı (error boundary): bir modülün çökmesi tüm uygulamayı düşürmez               |
| N-35 | P2  | Veritabanı şeması göç dosyalarıyla sürümlenir                                                 |
| N-36 | P2  | `scratch/` dizini kaldırılır; README ve `package.json` projeye göre yazılır (H-8)             |
| N-37 | P2  | Ortam değişkenleri `.env.example` ile tutarlı (H-6)                                           |

---

## 9. Teknik mimari önerisi

Mevcut yığın (React 19 + Vite + TypeScript + Tailwind + TanStack Query + Supabase + PWA) bu iş için **doğru seçim**. Değiştirmeye gerek yok; eksikleri tamamlamak yeterli.

### 9.1 Korunacak

- React + TypeScript + Vite
- Tailwind
- TanStack Query (sunucu durumu için doğru araç)
- Supabase (PostgreSQL + Auth + Storage + RLS — bu proje için ideal; RLS zaten ihtiyaç duyduğumuz güvenlik modeli)
- PWA / çevrimdışı

### 9.2 Eklenecek

| Katman                  | Öneri                                             | Gerekçe                                                          |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| **Sunucu tarafı işlev** | Supabase Edge Functions                           | AI proxy, göç, rapor üretimi, bildirim gönderimi, hash hesaplama |
| **Yetkilendirme**       | Postgres RLS + `record_grants` tablosu            | Kritik. İstemci kontrolü sahte güvenliktir                       |
| **Dosya**               | Supabase Storage + imzalı süreli URL              | Gerçek belge kasası                                              |
| **Form**                | React Hook Form + Zod                             | Yoğun form içeren bir sistem; el yazımı state sürdürülemez       |
| **i18n**                | i18next veya benzeri                              | Satır içi ternary'lerin yerine (N-23)                            |
| **Tablo**               | TanStack Table                                    | Kütük ekranlarının tamamı tablo                                  |
| **Bildirim**            | E-posta (Resend/Postmark) + WhatsApp Business API | Kenya'da WhatsApp fiilî standart                                 |
| **Çevrimdışı yazma**    | IndexedDB kuyruk + senkron katmanı                | Saha kullanımının şartı                                          |
| **Hata izleme**         | Sentry                                            | Sessiz hata kalmamalı                                            |
| **Test**                | Vitest + Playwright                               | Özellikle yetkilendirme testleri (N-31)                          |

### 9.3 Yapılmayacak

- Mikroservis mimarisi — bu ölçek için gereksiz karmaşa
- Ayrı mobil uygulama — PWA yeterli
- Kendi kimlik doğrulama sistemini yazmak — Supabase Auth kullanılır
- Grafik veritabanı — ilişki ağı (M4-10) Postgres üzerinde rahatlıkla çözülür

---

## 10. Faz planı

Dört alan da öncelikli, ama hepsi aynı anda yapılamaz. Sıralamanın mantığı: **önce güvenlik, sonra hafıza, sonra takip, sonra şeffaflık.**

### Faz 0 — Temizlik ve dürüstlük (1-2 hafta)

Yeni özellik yok. Amaç: mevcut uygulamayı _yanıltıcı olmaktan_ çıkarmak.

1. H-1 … H-8 hatalarının tamamını düzelt
2. Doğrulanamayan güvenlik ve senkronizasyon iddialarını kaldır (S-7, S-8) — modüller gerçekten yazılana kadar "yakında" der
3. Yükleme / hata / boş durumlarını ekle (S-5)
4. Hata sınırı ve hata izleme
5. Kaynağı belirsiz sabit içeriği işaretle veya kaldır (bkz. §2.4)
6. `scratch/` temizliği, README, `package.json`, `.env.example`
7. ESLint/Prettier/CI kur

> **Neden ilk:** Bugün portal mütevellilere gösterilse, gösterdiği şeylerin bir kısmı doğru değil. Bunu düzeltmeden üzerine bir şey inşa etmek borcu büyütür.

### Faz 1 — Güvenlik temeli (2-3 hafta) · **P0**

1. M1-01 … M1-07: gerçek kimlik doğrulama, roller, RLS, gizlilik seviyeleri, kayıt bazlı paylaşım, denetim kaydı
2. M1-14: acil durum yetki devri
3. N-31: yetkilendirme testleri
4. Rol bazlı yönlendirme ve boş modül iskeletleri

> **Neden:** Dış paydaş erişimi kararı bunu zorunlu kılıyor. Bu faz bitmeden **hiçbir gerçek veri sisteme girmemeli.**

### Faz 2 — Hafıza: Toplantı, Karar, Aksiyon, Paydaş (3-4 hafta)

1. M4-01 … M4-08: Kişi/Kurum, tutum, nüfuz, temas günlüğü
2. M3-01 … M3-09: Toplantı, Karar, Aksiyon, Açık soru
3. M3-10, M3-11: çift dil, çevrimdışı
4. **Notion göçü** (G-01 … G-05)
5. M12-02: gündem paneli

> **Neden bu sıra:** Toplantı katılımcıları paydaş kayıtlarına bağlanacak; paydaş modülü önce gelmeli. Göç bu iki modül hazır olduğunda anlamlı.
>
> **Bu fazın sonunda sistem ilk kez gerçek değer üretir:** hiçbir aksiyon kaybolmaz, her karar kayıtlı, her ilişkinin sahibi var.

### Faz 3 — Yükümlülük ve Hukuk (3-4 hafta)

1. M2 (tamamı): Yükümlülük kütüğü
2. M5-01 … M5-10: Dava, duruşma, layiha, karar, delil, avukat portföyü
3. M5-05 + M2-05: mahkeme kararı → yükümlülük dönüşümü
4. M9-01 … M9-09: gerçek belge kasası
5. M5-16: dış avukat erişimi
6. M15-03, M15-04: birleşik takvim ve geri sayım

> **Neden:** Yükümlülük kütüğü hukuk modülünün çıktısını tüketir; ikisi birlikte yapılmalı. Belge kasası delil zinciri için şart.

### Faz 4 — Saha ve Para (3-4 hafta)

1. M7-01 … M7-11: WBS, kanıtlı ilerleme, denetim raporu, BoQ, hakediş, müteahhit erişimi
2. M7-06: yükümlülük çakışma kontrolü
3. M8-01 … M8-10: bütçe, çoklu para birimi, PV akışı, onay eşikleri, gerçek denetim rozeti
4. M6-01 … M6-08: risk ve sorun kütüğü

### Faz 5 — Görünürlük ve olgunlaşma (sürekli)

1. M12: role göre paneller, mütevelli dosyası, bağışçı raporu
2. M13: gizlilik farkındalıklı arama ve AI
3. M10: yönetişim, uyum takvimi, CUE, burs taahhüdü
4. M11-06 … M11-12: bildirim kanalları, haftalık özet
5. M14: tedarik ve sözleşme
6. Kalan P2/P3 maddeleri

---

## 11. Başarı ölçütleri

Portalın işe yarayıp yaramadığı aşağıdakilerle ölçülür. Hiçbiri "kaç özellik yaptık" değil.

| Ölçüt                                                               | Hedef                        |
| ------------------------------------------------------------------- | ---------------------------- |
| Süresi geçmiş açık aksiyon oranı                                    | < %10                        |
| Sorumlusu veya tarihi olmayan aksiyon                               | **0**                        |
| Kanıta bağlanmamış "yerine getirildi" yükümlülüğü                   | **0**                        |
| Kritik paydaşlarda 30 günü aşan temassızlık                         | < %15                        |
| Mütevelli toplantı dosyasının hazırlanma süresi                     | < 10 dakika (bugün: saatler) |
| Kaynağa bağlanmamış maddi rakam                                     | **0**                        |
| Mütevellilerin toplantı öncesi dosyayı açma oranı                   | > %70                        |
| Dış paydaşın kendi alanı dışına erişim denemesinin engellenme oranı | %100                         |
| "Bu bilgi kimde?" sorusunun portal dışında sorulma sıklığı          | Zamanla sıfıra yaklaşmalı    |

Son ölçüt en önemlisidir: **amaç, kurumsal hafızayı kişilerden sisteme taşımaktır.**

---

## 12. Bilinçli olarak kapsam dışı

Sadeliği korumanın tek yolu, neyin yapılmayacağını yazmaktır.

| Kapsam dışı                                      | Gerekçe                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Öğrenci bilgi sistemi, kayıt, not, ders programı | Üniversite açıldıktan sonraki ayrı bir üründür                                |
| İnsan kaynakları / bordro                        | Muhasebe yazılımının işi                                                      |
| Tam muhasebe defteri                             | Portal _proje_ mali görünümünü verir; yevmiye muhasebe yazılımında kalır      |
| Genel amaçlı anlık mesajlaşma                    | WhatsApp'ın yerini almaya çalışmak başarısız olur (M11)                       |
| Kamuya açık web sitesi / tanıtım                 | Ayrı iş. Mütevelli kararı gereği kamuoyu iletişimi zaten temkinli yürütülüyor |
| Çok-projeli / çok-kurumlu mimari                 | Alınan karar gereği MIU'ya özel                                               |
| Dış CRM/ERP entegrasyonları (Faz 5 öncesi)       | Çekirdek oturmadan entegrasyon borç üretir                                    |
| AI'ın hukukî görüş üretmesi                      | M13-08 — açıkça yasak                                                         |
| Blokzincir / NFT tabanlı belge doğrulama         | SHA-256 + denetim kaydı bu ihtiyacı fazlasıyla karşılar                       |

---

## 13. Ek A — Faz 0 düzeltme kontrol listesi

Doğrudan uygulanabilir, sırasıyla:

- [ ] `LegalAffairsView.tsx:373` — `HEARING_BRIEF_DATA.benchQuestions` tanımsız; sekme çöküyor (H-1)
- [ ] `LegalAffairsView.tsx:491,579` — `activeCase` boş liste durumunda korumasız (H-2)
- [ ] 15 adet `navigate('...')` çağrısına baştaki `/` eklenmeli (H-3)
- [ ] `Navbar.tsx:38` — `onClick={() => ('dashboard')}` ölü kodu; ana sayfaya yönlendirme yapmalı (H-4)
- [ ] Acre ↔ dönüm dönüşümü: 84 acre = ~340 dönüm, 79 acre = ~320 dönüm, 5 acre = ~20 dönüm (H-5)
- [ ] `.env.example` ↔ kod uyumu: `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (H-6)
- [ ] Gemini çağrısı sunucu tarafına taşınmalı; anahtar istemciden çıkmalı (H-7)
- [ ] README / `package.json` adı / `metadata.json` projeye göre yazılmalı; `scratch/` kaldırılmalı (H-8)
- [ ] "Şifreli", "SHA-256 Doğrulandı", "Güvenli Belge" metinleri — gerçek uygulama gelene kadar kaldırılmalı (S-7)
- [ ] Sahte muhasebe senkronizasyonu (`setTimeout` + başarı bildirimi) kaldırılmalı (S-8)
- [ ] `addThreadMessage` — sabit `'Current User'` ve oku-değiştir-yaz yöntemi (S-9)
- [ ] Takvim uyarısı "kapat" = kalıcı `DELETE`; kişisel onaya çevrilmeli (S-10)
- [ ] Tüm sorgulara yükleme / hata / boş durumu (S-5)
- [ ] Hata sınırı + hata izleme
- [ ] `tsconfig` tip tanımı hatası: `vite/client` ve `vite-plugin-pwa/client` çözülemiyor
- [ ] Mütevelli kararları ve BoQ kalemleri kalıcı hâle getirilmeli veya "kaydedilmez" uyarısı konmalı (S-6)

---

## 14. Ek B — Kaynaklar

Bu doküman aşağıdakilere dayanıyor:

**Kod tabanı**

- `src/` altındaki 24 dosya, ~6.300 satır (tek commit, 29 Eylül 2026)
- `src/types/index.ts` — mevcut veri modeli
- `package.json`, `vite.config.ts`, `firebase.json`, `.env.example`

**Proje arşivi (Notion)**

- _Proje Değerlendirme Raporu_ (24 Kasım 2024) — başarısızlık nedenleri ve stratejik öneriler; bu dokümanın §1.2'sinin temeli
- _Meeting Hub_ — 📅 Meetings, 👥 Contacts, 📁 Materials, 💡 Team Suggestions, 📋 Toplantılar veritabanları
- Nisan 2026 saha toplantı kayıtları (~25 kayıt) — operasyonel gerçekliğin kaynağı
- _Mombasa International University Project_ kök sayfası ve alt veritabanları

**Uluslararası standartlar (uyarlanarak)**

- PMBOK 7 bilgi alanları: kapsam, takvim, maliyet, kalite, kaynak, iletişim, risk, tedarik, paydaş, entegrasyon
- PRINCE2: iş gerekçesi, yönetişim organları, aşama kapıları
- ISO 21500 / ISO 21502: proje yönetişimi
- RAID kütüğü pratiği (Risks, Assumptions, Issues, Dependencies)
- Paydaş nüfuz/ilgi matrisi (Mendelow)

> **Not:** Bu doküman, arşivdeki hassas içeriği (kişiler hakkındaki değerlendirmeler, kurumlar arası anlaşmazlıklar, karşı tarafa ilişkin istihbarat) bilinçli olarak **tekrarlamaz**. Bunlara yalnızca _gereksinim doğuran kategoriler_ olarak atıf yapılmıştır — çünkü bu doküman git deposunda yaşayacak ve dış paydaşların da eline geçebilir. Aynı ayrım, sistemin kendisinde M1 ve M4-11 ile kurulur.

---

_Doküman sonu · v1.0_
