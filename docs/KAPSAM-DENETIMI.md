# Kapsam denetimi — 197 gereksinim satırı

Bu dosya `docs/URUN-GEREKSINIMLERI.md`'nin 197 satırını **atıf değil özellik**
olarak ölçer. Ayrımın nedeni ölçümün kendisi: satır kimliklerini depoda
grep'lemek yalnızca hangi migration'ın bir ID yazdığını sayar, hangi özelliğin
var olduğunu saymaz. İlk deneme 43 satırı "atıfsız" diye bildirdi; örneklemede
M7-05, M9-06, M2-03 ve M4-02 yapılmış ama anılmamış çıktı.

**Yöntem.** Her satır için o özelliğin kanıtı arandı: bir tablo, bir enum, bir
sütun, bir fonksiyon, bir görünüm, bir ekran bileşeni ya da bir assertion.
Yalnızca `supabase/migrations`, `supabase/functions`, `src` ve `tests`
sayıldı — `supabase/bundled` üretilmiş çıktı olduğu için hariç, yoksa her
desen iki kez eşleşiyor.

**Tarih:** 2026-10-01 · migration 0044'e kadar.

## Özet

| Durum      | Satır |
| ---------- | ----- |
| Yapıldı    | 171   |
| Yok        | 26    |
| **Toplam** | 197   |

Öncelik dağılımı: P0 16 satır (1'i yok), P1 109 satır (3'ü yok), P2 58 satır
(22'si yok), P3 14 satır (**hepsi yapıldı**).

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

26 satır. Her biri için neyin eksik olduğu ve neye bağlı olduğu yazıldı,
çünkü bir kısmı kod değil karar ya da hesap bekliyor.

### P0 — 1 satır

| ID    | Gereksinim                                   | Durum                                                                                                                                                                                                     |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-02 | Dört rol için iki faktörlü doğrulama zorunlu | **Sizin kararınıza bağlı.** Supabase projesinde MFA'nın açılması ve rol bazlı zorunluluk gerekir; portal tarafında `aal2` kontrolü yazılır. Kimlik sağlayıcısında bir ayar olmadan kod tek başına yetmez. |

### P1 — 3 satır

| ID    | Gereksinim                                        | Durum                                                                                                                                   |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M1-10 | Oturum yönetimi: aktif cihazlar, uzaktan kapatma  | Supabase `auth.sessions` üzerinden okunur; kapatma yönetici yetkisiyle sunucu tarafı bir fonksiyon ister.                               |
| M1-11 | Altı ayda bir erişim gözden geçirme listesi       | Tamamen portal içinde yapılabilir: `profiles.expires_at` ve son giriş zamanından türetilen bir kuyruk + kararın kaydı. Bağımlılığı yok. |
| M5-09 | Dosya bazında hukuk harcaması, M8 bütçesine bağlı | `payment_vouchers`'a `legal_case_id` ve dava başına bir görünüm gerekir. Bağımlılığı yok.                                               |

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
Yukarıdaki 26 satırın her biri bu yüzden elle teyit edildi, ve "yapıldı"
sayılan 171 satırın hepsi tek tek teyit edilmedi — yalnızca atıfı olanlar
atıfına, atıfı olmayan yedisi kanıtına dayanıyor.
