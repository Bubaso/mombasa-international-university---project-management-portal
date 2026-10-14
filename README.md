# MIU Portal

Mombasa International University (MIU) projesinin — **African University Trust
of Kenya (AUTK)** çatısı altında — ortak kaydı. Katılımcıları Türkiye, Mombasa
ve Nairobi'ye dağılmış bir işin tek bir yerde cevaplanabilmesi için var: ne
karar verildi, kim neye söz verdi, vakfın hangi yükümlülükleri var, saha ve
bütçe nerede duruyor.

[![CI](https://github.com/Bubaso/mombasa-international-university---project-management-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/Bubaso/mombasa-international-university---project-management-portal/actions/workflows/ci.yml)

> **English summary.** A project-management and stakeholder portal for the
> Mombasa International University project, built for the African University
> Trust of Kenya. Fifteen modules — obligations, meetings and decisions,
> stakeholders, legal cases, RAID, construction, budget, a document vault with
> a chain of custody, governance, messaging, reporting, search and an assistant,
> procurement, and the project backbone — over Postgres, where **the access
> rules live in the database** as row-level-security policies rather than in the
> client. The requirements are numbered and auditable
> ([`docs/URUN-GEREKSINIMLERI.md`](docs/URUN-GEREKSINIMLERI.md), 253 rows), the
> coverage audit counts features rather than citations
> ([`docs/KAPSAM-DENETIMI.md`](docs/KAPSAM-DENETIMI.md)), and one command —
> `npm run verify` — runs all 28 gates including the authorization suite against
> a real PostgreSQL. Documentation is in Turkish; the application itself is
> bilingual Turkish/English.

---

## Durum

| Ölçü                                     | Bugün                                      |
| ---------------------------------------- | ------------------------------------------ |
| Numaralı gereksinim                      | **253** (210 `M*`, 37 `N*`, 6 `G*`)        |
| Modül gereksinimi: yapıldı / yapılmadı   | **194 / 16**                               |
| Tasarım gereksinimi (`T*`), kapıya bağlı | 31 / 96                                    |
| Göç dosyası                              | 58 (`0001`…`0058`)                         |
| `npm run verify` adımı                   | **28**                                     |
| Politika testi                           | `tests/db/policies.test.sql`, 11 bin satır |
| Gezinme rotası                           | **19** (+ `/meetings/:id` detay ekranı)    |
| Edge fonksiyonu                          | 6                                          |

Bu tablodaki her sayı **ölçülüyor**, elle yazılmıyor: `npm run test:doc-counts`
rakamları depodan sayıp buradakilerle karşılaştırıyor ve ayrışırsa düşer. Kapı
bu README için yazıldı çünkü eski hâli iki yerde yanlıştı — "henüz kimlik
doğrulama yok" ve "240 numaralı gereksinim"; ikisi de yazıldığı gün doğruydu ve
hiçbir şey onları denetlemiyordu.

Yapılmamış 16 satırın her biri için **neyin eksik olduğu ve neye bağlı olduğu**
yazılı: bir kısmı kod değil karar bekliyor (ör. MFA'nın hangi roller için
zorunlu olacağı), bir kısmı dışarıdan bir servis bekliyor (OCR, muhasebe
entegrasyonu, sunucu tarafı PDF). Liste
[`docs/KAPSAM-DENETIMI.md`](docs/KAPSAM-DENETIMI.md)'de ve sayıları
`npm run test:doc-counts` kapısına bağlı — doküman eskiyse kapı düşer.

### Şu an bekleyen tek operasyonel iş

`0054`–`0058` göçleri **canlı projeye uygulanmadı.** Uygulanmadan önce plan
panosu, dondurulmuş paydaş haritası, hukukî muhafaza ve saklama politikası
sekmeleri hata verir. Sıra ve doğrulama için aşağıdaki
[Göçler](#göçler) bölümüne bakın.

---

## Portalın dayandığı tek ilke

**Bilinmeyen bir şeyi bilinmiş gibi göstermemek.** Bu bir slogan değil, kodda
uygulanan bir kısıt; portalın ilk sürümünden ekrandan kaldırılan şeyler bunun
örnekleriydi — okunmamış dosyaların üzerindeki "SHA-256 doğrulandı" rozeti, var
olmayan bir muhasebe entegrasyonunun "API Live" etiketi, kimsenin koymadığı
sabit rakamlar.

Günlük hâliyle:

- **`null` sıfır değildir.** Teslim edilmemiş bir kilometre taşının gecikmesi
  `null`'dır, 0 değil. Teklif vermemiş bir adayın ücreti `null`'dır. Kaydedilmemiş
  bir tutum `unknown`'dır, `neutral` değil.
- **Gönderilmeyen şeye "gönderildi" yazılmaz.** Sağlayıcısı olmayan bir mecra
  için teslimat `unconfigured` kaydedilir.
- **Kanıt isteyen durum kanıt olmadan girilemez.** "Ulaşıldı" bir belge ister,
  "teslim edildi" bir teyit ister, giden resmî yazı yazının kendisini ister. Bu
  kısıtlar veritabanındadır, etrafından dolaşılamaz.
- **Uydurulmuş bir tarih, tarihi olmayan bir aksiyondan kötüdür** — birincisi
  takip edildiğini sandırır. Notion'dan taşınan 103 aksiyon satırının sorumlusu
  ve tarihi yoktu; göç betiği onları uydurmadı, rapor etti.
- **Bilinmeyen ekrana çıkar.** Arşiv 24 Nisan'da bitiyorsa, 25 Nisan'da vadesi
  gelen yükümlülük `open` kalır ve detayı "sonucu kayıtlı değil" der. Bu bir
  kusur değil, sorunun birinin önüne konmasıdır.

Aynı ilke **ölçüme** de uygulanıyor: bir kuralı yazdıktan sonra kural bozulur ve
testin **düştüğü görülür**. Başarısız olmayan bir test, test değildir. Bu depoda
en az yedi kez "yanlış sebeple geçen test" bulundu ve her biri
`docs/KAPSAM-DENETIMI.md` ile `docs/TASARIM-GEREKSINIMLERI.md` içinde ismen
kayıtlı — sayı tutmak yerine ölçünün ayırt ediciliği kontrol ediliyor.

---

## Mimari

**Kural Postgres'te.** Erişim kuralları RLS politikaları, bütünlük kuralları
check constraint ve trigger. İstemci kuralı uygulamaz, **kuralın cevabını
gösterir** — aynı kuralın istemcide ikinci bir kopyası olsa, sapan kopya her
zaman ikincisi olurdu.

```
Tarayıcı (React 19 + TanStack Query)
    │  anon key ile, yani her sorgu RLS altında
    ▼
Supabase / PostgreSQL
    ├── RLS politikaları          kim neyi görür
    ├── check constraint + trigger  hangi kayıt tutarlıdır
    ├── görünümler                hesaplanmış cevaplar (vade, boşluk, yol)
    └── audit_log                 istemciden yazılamayan kayıt
    ▲
    │  sunucuda durması gereken işler
Edge fonksiyonları (Deno)
    ai-assistant · document-intake · document-download
    invite-user · send-notifications · verify-document
```

Model API anahtarı, davet yetkisi, bildirim imzalama anahtarı ve belge indirme
tarayıcıya hiç gelmiyor; hepsi edge fonksiyonunda duruyor.

**Yığın:** React 19 · TypeScript 5.7 (`strict`, `noUncheckedIndexedAccess`) ·
Vite 8 · Tailwind 4 · TanStack Query 5 · Supabase · PWA · Playwright.

---

## Roller ve gizlilik

**On üç rol**, altısı iç çekirdek (`admin`, `project_director`, `field_team`,
`trustee`, `board_director`, `audit_committee`), yedisi dış paydaş
(`legal_counsel`, `contractor`, `quantity_surveyor`, `external_auditor`,
`donor`, `observer`, `consultant`). Dış roller kendi kapsamlarıyla sınırlı:
avukat **yalnızca kendine atanmış** dosyayı, müteahhit **yalnızca kendi
bloklarını** görür.

**Dört gizlilik seviyesi**, her kayıt tam olarak birini taşır:

| Seviye                  | Kimler görür                                    |
| ----------------------- | ----------------------------------------------- |
| `public`                | Giriş yapmış herkes, bağışçı ve gözlemci dâhil  |
| `internal` ← varsayılan | İç çekirdek + ilgili dış paydaş                 |
| `confidential`          | İç çekirdek, ya da açıkça yetkilendirilmiş kişi |
| `restricted`            | Adı adı belirtilmiş kişiler                     |

`restricted` için ek kurallar veritabanı seviyesinde: dış paydaş rolleri bu
seviyeye **hiçbir koşulda** yükseltilemez, AI dizinine girmez, her görüntüleme
denetim kaydına yazılır, ve arama yetkisiz kullanıcıya "gizli kayıt var" ipucu
bile vermez.

Ayrıntı: [`docs/URUN-GEREKSINIMLERI.md`](docs/URUN-GEREKSINIMLERI.md) §4.

---

## Modüller ve ekranlar

| Modül   | Konu                               | Ekran                        |
| ------- | ---------------------------------- | ---------------------------- |
| **M1**  | Kimlik, erişim ve gizlilik         | `/admin`                     |
| **M2**  | Yükümlülük ve taahhüt kütüğü ⭐    | `/obligations`               |
| **M3**  | Toplantı, karar ve aksiyon         | `/meetings`, `/meetings/:id` |
| **M4**  | Paydaş ve ilişki yönetimi          | `/stakeholders`              |
| **M5**  | Hukuk ve dava yönetimi             | `/legal`                     |
| **M6**  | Risk, sorun, varsayım, bağımlılık  | `/risks`                     |
| **M7**  | İnşaat ve saha                     | `/construction`              |
| **M8**  | Bütçe, finans, bağışçı şeffaflığı  | `/finance`                   |
| **M9**  | Belge kasası ve delil zinciri      | `/documents`                 |
| **M10** | Yönetişim, uyum, akademik hazırlık | `/governance`, `/readiness`  |
| **M11** | İletişim ve bildirim               | `/communication`             |
| **M12** | Raporlama ve paneller              | `/`, `/reports`              |
| **M13** | Arama, bilgi katmanı, AI asistanı  | `/assistant`                 |
| **M14** | Tedarik ve sözleşme                | `/procurement`               |
| **M15** | Plan, takvim, kilometre taşları    | `/plan`, `/calendar`         |
| —       | Proje künyesi                      | `/project_info`              |

M1 bir modül değil **her modülün üzerinde duran bir katman**; o yüzden
gereksinim dokümanında rol ve gizlilik tanımlarıyla birlikte duruyor.

---

## Depo düzeni

```
src/
  api/            Supabase okuma ve yazma; her kütük için bir dosya + hook'lar
  components/     paylaşılan arayüz; modül klasörlerinde panel bileşenleri
  context/        dil ve oturum
  hooks/          çapraz davranışlar
  i18n/           Türkçe ve İngilizce metin
  lib/            Supabase istemcisi, kural kitaplıkları (yol hesabı, saklama,
                  etkileşim, tarih ve birim dönüşümü)
  types/          alan modeli; veritabanı enum'larının istemci karşılıkları
  views/          rota başına bir ekran
supabase/
  migrations/     NNNN_*.sql — sıralı, geri alınamaz
  functions/      edge fonksiyonları (Deno)
tests/
  db/             politika testleri + atılabilir Postgres koşucusu
  *.mjs           28 kapı: tarayıcı turu, kurgu, enum sapması, ekran metni,
                  erişilebilirlik, doküman sayıları…
scripts/          göç uygulama, SQL paketleme, Notion göçü, ekran metni ölçümü
docs/             gereksinimler, tasarım gereksinimleri, kapsam denetimi,
                  durum raporu, göç haritası, canlı doğrulama betikleri
```

---

## Çalıştırma

**Gerekenler:** Node.js 22+, ve politika testleri için yerel bir PostgreSQL
(`initdb`/`pg_ctl` yeterli; betik kendi atılabilir örneğini kuruyor).

```bash
npm install
cp .env.example .env.local      # değerleri doldurun
npm run dev                     # http://localhost:3000
```

`VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olmadan uygulama **açılıyor ama
giriş yapılamıyor**: giriş sayfası "veri kaynağı bağlı değil" diyen bir şerit
gösteriyor ve formu kapatıyor. Bu kasıtlı — yapılandırılmamış bir kurulum bir
zamanlar sağlıklı ve boş bir portal gibi görünüyordu, ki insanların karar aldığı
bir sistemde verilebilecek en kötü cevap o.

**Ortam değişkenleri** (`.env.example` içinde açıklamalı):

| Değişken                 | Ne                                                                 |
| ------------------------ | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Supabase proje URL'i                                               |
| `VITE_SUPABASE_ANON_KEY` | Anon anahtar — **tasarımı gereği açık**; onu güvenli kılan şey RLS |
| `VITE_AI_PROXY_URL`      | `ai-assistant` fonksiyonunun adresi                                |

`VITE_` önekli her şey tarayıcı paketine gömülüyor. Model API anahtarı, servis
anahtarı ve VAPID özel anahtarı **buraya girmez**; onlar edge fonksiyonlarının
sırrı olarak duruyor.

---

## Doğrulama: `npm run verify`

Çalıştırılacak **tek komut** bu. Yirmi sekiz adım, CI'ın koştuğu sırayla:

| Grup             | Adımlar                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Derleme          | `typecheck` · `lint` · `format:check` · `build`                                                                            |
| Yetkilendirme    | `test:policies` — atılabilir bir PostgreSQL kurar, 58 göçü uygular, 11 bin satırlık politika testini **RLS altında** koşar |
| Alan kuralları   | `test:critical-path` · `test:obligation-heat` · `test:cash-flow` · `test:reach-path`                                       |
| Şema ↔ istemci   | `test:enum-drift` · `test:register-states` · `test:sql-objects` · `test:list-reads`                                        |
| Tarayıcı         | `test:smoke` · `test:populated` (19 rota, iki genişlik, kurgulanmış veriyle)                                               |
| Arayüz kuralları | `test:registers` · `test:nav` · `test:palette` · `test:a11y` · `test:screen-text` · `test:design-rows`                     |
| Modüller         | `test:assistant` · `test:intake` · `test:translate` · `test:exports` · `test:push` · `test:push:sw`                        |
| Doküman          | `test:doc-counts` — dokümanların **ve bu README'nin** kendi sayılarını depoya bağlar                                       |

Bu kapıların bir kısmı **tavan**: ekran metninin hacmi, ekran başına düğme ve
yükseklik, telefon kartı boyu. Tavanlar yalnızca düşer; bir yükseltme
gerekçesiyle ve hangi gereksinim satırının kazandığıyla birlikte kaydedilir, ve
"var olan bir satır gösterme" zorunluluğu ayrıca sınanır.

Tek tek koşmak için `package.json`'daki `test:*` betikleri. Telefon ölçümünü
canlı projeye giriş yaparak alan `npm run test:design` **`verify`'ın içinde
değil**: kimlik bilgisi istiyor ve gerçek kayıtların üzerinde ölçüyor.

---

## Göçler

`supabase/migrations/NNNN_*.sql` — **sıralı ve geri alınamaz.** Her göç neden
var olduğunu kendi yorumunda anlatıyor; ölçümle, varsa.

Depo kuralları:

- Fonksiyon oluşturan her göç `select app.reset_function_grants();` ile biter.
  Postgres yeni bir fonksiyonun `EXECUTE`'unu `PUBLIC`'e veriyor ve bunu
  varsayılan ACL ile geri alamıyorsunuz; toptan `grant` ise daha önce ismen
  kapatılmış her fonksiyonu yeniden açar. İstisnalar fonksiyonun içinde, tek
  yerde durur. Politika testi bunu zorlar.
- Her yeni kural için bir assertion, ve **kural bozulup testin düştüğü
  görülür**.

**Canlıya uygulama** iki yolla yapılabilir:

```bash
# Management API üzerinden (SUPABASE_ACCESS_TOKEN gerekir)
node scripts/apply-migrations.mjs --project <ref> --from 54

# ya da elle: SQL Editor'a yapıştırmak için tek dosya
npm run sql:bundle
```

Uygulamadan **sonra** doğrulama betiğini koşun. `docs/00NN-CANLIYA.sql`
dosyaları o göçün isimlendirdiği her nesneyi sayar ve eksikse hangisinin eksik
olduğunu söyler; her zaman satır döndürürler, yani "Success ama okunacak bir şey
yok" hâli yapıştırmanın yarıda kesildiği anlamına gelir.

| Göç    | Ne getirdi                                                    | Doğrulama               |
| ------ | ------------------------------------------------------------- | ----------------------- |
| `0054` | Dosya bazında hukuk harcaması (M5-09)                         | `docs/0054-CANLIYA.sql` |
| `0055` | Erişim gözden geçirme kuyruğu (M1-11)                         | `docs/0055-CANLIYA.sql` |
| `0056` | Asistan kapsamı: sabit değil kayıt (M13-17)                   | `docs/0056-CANLIYA.sql` |
| `0057` | Hukukî muhafaza ve saklama politikası (M9-11, M9-13)          | `docs/0057-CANLIYA.sql` |
| `0058` | Etkileşim planı ve dondurulmuş paydaş haritası (M4-12, M4-14) | `docs/0058-CANLIYA.sql` |

Bu beşi **henüz uygulanmadı.**

---

## Dağıtım

```bash
npm run deploy          # build + paket kontrolü + Firebase Hosting (proje: miu-kenya)
```

Edge fonksiyonları Supabase CLI ile ayrı dağıtılıyor. Bildirim kurulumu — VAPID
anahtar çifti, hangi kısmın doğrulanabildiği ve hangi kısmın doğrulanamadığı
dâhil — [`docs/BILDIRIM-KURULUMU.md`](docs/BILDIRIM-KURULUMU.md)'de.

**VAPID özel anahtarı veritabanına hiç yazılmıyor**; yalnızca açık yarısı
kayıtlı.

---

## Dokümanlar

| Dosya                                                              | Ne                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [`docs/URUN-GEREKSINIMLERI.md`](docs/URUN-GEREKSINIMLERI.md)       | 253 numaralı gereksinim, 15 modül, roller ve gizlilik modeli         |
| [`docs/TASARIM-GEREKSINIMLERI.md`](docs/TASARIM-GEREKSINIMLERI.md) | 96 numaralı UI/UX gereksinimi, her biri ölçülebilir kabul kriteriyle |
| [`docs/KAPSAM-DENETIMI.md`](docs/KAPSAM-DENETIMI.md)               | Kapsam denetimi: **atıf değil özellik** sayar; 194 / 16              |
| [`docs/DURUM-RAPORU.md`](docs/DURUM-RAPORU.md)                     | Durum raporu                                                         |
| [`docs/KUTUK-TURU.md`](docs/KUTUK-TURU.md)                         | Kütük turu: sıra ve gerekçesi                                        |
| [`docs/ASISTAN-MODULU.md`](docs/ASISTAN-MODULU.md)                 | Belge alımı ve teklif eden asistan — olabilirlik raporu              |
| [`docs/NOTION-GOC.md`](docs/NOTION-GOC.md)                         | Notion'dan göçün haritası                                            |
| [`docs/BILDIRIM-KURULUMU.md`](docs/BILDIRIM-KURULUMU.md)           | Anlık bildirim kurulumu                                              |
| [`CLAUDE.md`](CLAUDE.md)                                           | Çalışma usulü: haberleşme, dürüstlük, test disiplini, mimari         |

---

## Bilinen sınırlar

Bunlar eksiklik olarak **yazılı**, çünkü yazılmamış bir eksiklik yapılmış
sanılır.

**Karar bekleyen:**

- **M1-02** — Dört rol için iki faktörlü doğrulama. Supabase projesinde MFA'nın
  açılması ve hangi roller için zorunlu olacağının kararlaştırılması gerekiyor;
  portal tarafında `aal2` kontrolü yazılır. Kimlik sağlayıcısında bir ayar
  olmadan kod tek başına yetmez.

**Dışarıdan bir şeye bağlı:**

- **M1-12** tek oturum açma (Workspace OAuth istemcisi) · **M1-13** IP/coğrafya
  anomalisi (bir coğrafya kaynağı; `audit_log` IP tutmuyor) · **M3-12** sesli
  not → metin · **M9-10** TR/EN OCR · **M5-15** ve **M9-12** sunucu tarafı PDF
  birleştirme ve filigran · **M8-11** muhasebe entegrasyonu (QuickBooks/Xero/SAP).

**Ölçülemediği için kapıya bağlanmamış:**

- **T6-04** (uyarı şeridi telefonda ≤3 satır). Şeridi **renkten** bulan bir ölçü
  bu palette çalışmıyor: proje solarized-light tonlarında ve `bg-white` bile
  krem (`rgb(252,249,238)`), yani ekrandaki her yüzey sıcak. İki deneme ters
  yöne kaçtı; gerekçe `docs/TASARIM-GEREKSINIMLERI.md` 5. dalga notunda
  ölçümlerle yazılı. Doğru yol kaynaktan sayım ve ayrı bir iş.
- **T5-02**'nin yükseklik yarısı: 16 telefon kartının 14'ü hedefin altında, ikisi
  bir hücresi ikinci satıra sardığı için değil — rota başına tavanla kayıtlı.

**Deneyebileceğiniz ama olmayan:** `M1-10` oturum yönetimi (aktif cihazlar,
uzaktan kapatma) `auth.sessions` üzerinden sunucu tarafı bir fonksiyon istiyor.

**Henüz yazılmadı — bağımlılığı yok, sırası gelmedi:** **M2-10** tekrarlayan
yükümlülükler · **M5-11** hukukî senaryo analizi ("kaybedersek") · **M5-13**
içtihat/mevzuat kütüphanesi · **M7-13** değişiklik emri · **M7-14** mevsim ve
iklim risk takvimi · **M7-15** aynı açıdan fotoğraf zaman serisi · **M8-14** KRA
vergi muafiyeti takibi. Yedisi de yeni birer göç istiyor; portal içinde
yapılabilir, kimseyi beklemiyorlar.

Bu bölümdeki satırların toplamı yukarıdaki tablodaki **16**'yı veriyor: 1 karar,
7 dış bağımlılık, 7 yazılmamış, 1 sunucu tarafı fonksiyon. `T*` satırları ayrı
sayılıyor.

---

## Veri ve gizlilik

**Gerçek proje verisi bu depoya girmez.** Kişiler hakkındaki değerlendirmeler,
hukukî strateji ve özel iletişim kütüğü git geçmişine girmez; göç betiği
Notion'u canlı okur ve Supabase'e canlı yazar, anlık görüntü ve ona dair
hükümler depo dışında kalır. Tasarım ve gereksinim dokümanlarında kişi adı,
adres ya da kayıt yoktur.

**Sınıflandırma varsayılanı tek yerde.** Kütük tablolarının 87'si ortak
kolonlarını `app.add_common_columns()`'dan alıyor ve o fonksiyon
`confidentiality`'yi `internal` varsayılanıyla kuruyor. Bunun üzerine çıkan
altı kütük **ismen** yükseltilmiş:

| Kütük                          | Varsayılan     | Göç    |
| ------------------------------ | -------------- | ------ |
| `stakeholder_assessments`      | `restricted`   | `0006` |
| `conflict_declarations`        | `confidential` | `0021` |
| `gate_visits`                  | `confidential` | `0037` |
| `site_incidents`               | `confidential` | `0037` |
| `stakeholder_engagement_plans` | `confidential` | `0058` |
| `stakeholder_map_snapshots`    | `restricted`   | `0058` |

Bunu olduğu gibi yazmanın sebebi var: `CLAUDE.md` §4 "yeni bir kayıt için
varsayılan `confidential`" diyor, şema ise tabandan `internal` verip hassas
kütükleri tek tek yükseltiyor. Yani **yeni eklenen bir kütük, kimse
yükseltmezse `internal` olur.** Bu bir uyuşmazlık ve kapatılmış değil; yeni bir
kütük yazan kişinin sınıflandırmayı açıkça seçmesi gerekiyor.

---

## Katkı

- Geliştirme dalı: `claude/elegant-knuth-4uapzy`. Başka dala izin almadan push
  yapılmaz.
- Push'tan önce `npm run verify` — exit 0 olmadan push yok.
- Yeni bir kural yazdıysanız kuralı **bozun** ve testin düştüğünü görün.
  Başarısız olmayan test, test değildir.
- Bir iş bitince hangi gereksinim satırlarını kapattığını söyleyin ve
  `docs/KAPSAM-DENETIMI.md`'yi güncelleyin; sayılar `npm run test:doc-counts`
  kapısına bağlı.
