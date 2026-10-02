# Tasarım gereksinimleri — UI/UX

Bu dosya, portalın masaüstü ve telefon deneyimi için numaralı gereksinimleri
tutar. `docs/URUN-GEREKSINIMLERI.md` ne yapılacağını söylüyordu; bu dosya
nasıl görüneceğini ve nasıl kullanılacağını söylüyor.

Her satırın bir **ölçülebilir kabul kriteri** var. Bu depoda bir kural, onu
bozduğunuzda düşen bir testle birlikte gelir; tasarım kuralları da öyle olmalı,
yoksa ilk yoğun haftada sessizce geri alınırlar.

Burada kişi adı, adres ya da kayıt yok: gerçek proje verisi depoya girmez
(CLAUDE.md §4).

## Bu gereksinimler neyin üzerine kurulu

Tahmin değil, ölçüm. 2 Ekim 2026'da canlı uygulamada (`miu-kenya.web.app`),
oturum açılmış hâlde, 19 rotanın tamamı iki genişlikte gezildi ve her sayfada
DOM ölçüldü.

| Ölçüm                         | Telefon (390×844)     | Masaüstü (1440×900)    |
| ----------------------------- | --------------------- | ---------------------- |
| Yatay sayfa taşması olan rota | **19 / 19**           | 0 / 19                 |
| Dokunma hedefi < 44px         | **455 / 607 (%75)**   | 816 / 873 (%93)        |
| Dokunma hedefi < 32px         | **372 / 607 (%61)**   | 391 / 873 (%45)        |
| Metin < 12px                  | **2449 / 3161 (%77)** | 2480 / 3611 (%69)      |
| Metin < 11px                  | 712                   | 700                    |
| İçerik sütunu                 | 390px                 | 1024px (ekranın %71'i) |

Masaüstündeki %93, 44px dokunma standardına göre ölçüldüğü için yanıltıcı:
fareyle kullanılan bir arayüzde makul taban ~32px'dir ve o ölçüde oran %45.
Telefonda ise 44px doğru taban ve oran %75.

Koddan sayılan diğer olgular:

- Tipografi ölçeği: `text-[11px]` **720 kullanım**, `text-[10px]` 88,
  `text-[9px]` 3; `text-xs` 244, `text-sm` 81. Üst taraf neredeyse boş
  (`text-lg` 24, `text-xl` 8, `text-2xl` 1). Yani ölçek 9–14px arasına
  sıkışmış.
- `TableFrame` **koşulsuz `min-w-[640px]`** taşıyor ve 43 yerde kullanılıyor.
  390px telefonda her kütük yatay kayar. (Canlı veritabanı şu an seyrek
  olduğu için ekranda ölçülemedi; kod kesin.)
- Kırılma noktası kullanımı: `sm:` 153, `md:` 18, `lg:` 23, `xl:` 6. Yani
  pratikte iki düzen var — telefon ve "telefon değil".
- Kenar çubuğu **19 düz öğe**, gruplama yok.
- Mobil navigasyon 4 + 9 = 13 rota kapsıyor. **6 rota telefonda
  navigasyondan erişilemiyor**: Uyum/Akademik Hazırlık, Risk, Plan, Tedarik,
  Raporlar, Asistan.
- Grafik paleti (`#2a78d6, #eb6834, #0ca30c, #d03b3b, #586e75`) altı
  kontrolden ikisinden kalıyor: `#586e75` gri okunuyor, ve kırmızı↔yeşil
  döteranopide **ΔE 4.1** — ayırt edilemez.

**Ölçülmeyen:** gerçek cihazda dokunma isabeti, ağ yavaşken algılanan hız,
ekran okuyucu ile uçtan uca gezinme, ve veriyle dolu kütüklerin telefonda
nasıl davrandığı (canlı veritabanı seyrek). Bunlar yapılmalı; bu dosya onların
yerine geçmez.

---

## T1 — Bilgi mimarisi: çok sekme sorunu

Bu portalın asıl zorluğu burada. 19 rota, bazılarının altında 13 sekme, ve
hepsi aynı görsel ağırlıkta. Kullanıcı aradığını bulamıyorsa özelliğin var
olması bir şey ifade etmiyor.

| ID    | Gereksinim                                                                                                                                                                    | P   | Kabul kriteri                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------- |
| T1-01 | Kenar çubuğu 19 düz öğe yerine **adlandırılmış gruplara** ayrılsın (ör. Yönetim · Hukuk · Saha · Para · Kayıt · Sistem).                                                      | P0  | Hiçbir grup 6 öğeden fazla değil; her grubun görünür başlığı var.                |
| T1-02 | Kenar çubuğu etiketleri **kesilmesin**. Bugün "Hukuk İşleri ve …", "Plan, Kilometre Taşları ve Kron…" gibi beş etiket okunamıyor.                                             | P0  | 1280px ve üstünde hiçbir nav etiketinde `text-overflow: ellipsis` tetiklenmiyor. |
| T1-03 | Kenar çubuğundaki rozetler etiketle **aynı satırda yarışmasın**; rozet ya ikinci satıra iner ya ikona iliştirilir.                                                            | P1  | Rozetli öğelerde etiketin tam metni görünür.                                     |
| T1-04 | Doğrulanamayan rozetler kaldırılsın. "API Hazır" ve "v2.1" gibi etiketler Faz 0'da ekrandan kaldırılan iddiaların aynısı.                                                     | P0  | Navigasyondaki her rozet bir sorgudan geliyor; sabit metin rozet yok.            |
| T1-05 | **Altı erişilemeyen rota** mobil navigasyona girsin.                                                                                                                          | P0  | Kenar çubuğundaki her rota, telefonda en çok iki dokunuşla erişilebilir.         |
| T1-06 | Mobil alt navigasyon en çok 5 öğe; geri kalanı tek bir "Menü" sayfasında **gruplanmış** olarak.                                                                               | P1  | "Menü" sayfası T1-01'deki gruplamayı kullanır.                                   |
| T1-07 | Hukuk ekranındaki 13 sekme **ikinci bir seviyeye** ayrılsın (ör. 4 ana bölüm, her birinin içinde 2–4 sekme) ya da içerik tek sayfalık kaydırmaya dönüşüp sekmeler çapa olsun. | P0  | Aynı anda 6'dan fazla sekme seçeneği gösterilmiyor.                              |
| T1-08 | Her sekme şeridi sığsın, kaymasın (hukuk için yapıldı).                                                                                                                       | P0  | Her sekme kabında `scrollWidth <= clientWidth`, 390px ve 1440px'te.              |
| T1-09 | Nerede olunduğu her zaman belli olsun: kırıntı yolu ya da başlıkta bölüm adı.                                                                                                 | P1  | Her rotada `<h1>` ya da kırıntı, aktif nav öğesiyle aynı adı taşır.              |
| T1-10 | Global arama (⌘K) telefonda da erişilebilir ve navigasyonun **eşiti** olsun — 19 rotalı bir uygulamada arama birincil gezinme yoludur.                                        | P1  | Telefonda arama düğmesi üst barda, 44px, her rotada görünür.                     |

## T2 — Responsive düzen

| ID    | Gereksinim                                                                                                      | P   | Kabul kriteri                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- |
| T2-01 | **Hiçbir rotada yatay sayfa taşması olmasın.** Bugün 19/19 rotada 8px taşma var; kaynağı üst bardaki sağ grup.  | P0  | 390px'te her rotada `documentElement.scrollWidth == clientWidth`.                      |
| T2-02 | Kırılma noktaları üç olsun: telefon (<640), tablet (640–1023), masaüstü (≥1024); ayrıca ≥1536 için geniş düzen. | P1  | `md:`/`lg:`/`xl:` kullanımı anlamlı düzen değişikliği üretiyor, yalnızca boşluk değil. |
| T2-03 | Masaüstünde genişlik kullanılsın: ≥1280px'te kütükler iki sütuna ya da ana içerik + bağlam paneline ayrılsın.   | P1  | 1440px'te içerik sütunu ekranın en az %85'i ya da ikinci bir sütun var.                |
| T2-04 | Telefonda kart kenar boşluğu 16px'ten az olmasın ve içerik kenara yapışmasın.                                   | P2  | 390px'te her kartın sol/sağ boşluğu ≥12px.                                             |
| T2-05 | Üst bar telefonda sığsın: logo + arama + menü; dil ve çıkış menüye insin.                                       | P0  | 320px'te bile üst bar taşmıyor.                                                        |
| T2-06 | Uzun sayfalarda telefonda "başa dön" ya da yapışkan bölüm başlığı olsun.                                        | P2  | 3 ekran boyundan uzun her sayfada mevcut.                                              |

## T3 — Tipografi ve hiyerarşi

Bugünkü ölçek ters: açıklama metni büyük ve koyu, **veri küçük ve soluk**.
Kullanıcı veriye bakmaya geliyor.

| ID    | Gereksinim                                                                                                              | P   | Kabul kriteri                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------- |
| T3-01 | Gövde metni taban **14px**, telefonda da. Bugün baskın boyut 11px.                                                      | P0  | Hiçbir veri metni 14px'in altında değil; 12px yalnızca ikincil üstveri için. |
| T3-02 | 9px ve 10px tamamen kalksın.                                                                                            | P0  | Kod tabanında `text-[9px]` ve `text-[10px]` yok.                             |
| T3-03 | Beş basamaklı bir ölçek tanımlansın (ör. 12 · 14 · 16 · 20 · 28) ve token olarak kullanılsın; keyfi `text-[Npx]` yasak. | P0  | `text-\[[0-9]+px\]` eşleşmesi sıfır.                                         |
| T3-04 | Hiyerarşi **veriyi** öne çıkarsın: kayıt başlığı, açıklama metninden büyük ve koyu olsun.                               | P1  | Her kütük satırında başlık ≥16px; panel açıklaması ≤14px ve ikincil renk.    |
| T3-05 | Satır yüksekliği okunur olsun (gövde için ≥1.5).                                                                        | P2  | Gövde metinlerinde `line-height` ≥1.5.                                       |
| T3-06 | Sayılar ve tarihler tabular rakamla hizalansın.                                                                         | P2  | Kütüklerdeki sayı sütunlarında `font-variant-numeric: tabular-nums`.         |

## T4 — Dokunma hedefleri ve kontroller

| ID    | Gereksinim                                                                      | P   | Kabul kriteri                                                    |
| ----- | ------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------- |
| T4-01 | Telefonda her etkileşimli öğe en az **44×44px**. Bugün %75'i altında.           | P0  | ≤768px'te 44px altı görünür etkileşimli öğe sayısı 0.            |
| T4-02 | Masaüstünde taban **32px**. Bugün %45'i altında.                                | P1  | ≥1024px'te 32px altı etkileşimli öğe sayısı 0.                   |
| T4-03 | Komşu dokunma hedefleri arasında en az 8px boşluk.                              | P1  | Hiçbir iki etkileşimli öğenin kenarı 8px'ten yakın değil.        |
| T4-04 | Birincil eylem her ekranda tek ve belirgin olsun; ikincil eylemler sessiz.      | P1  | Her sayfada en çok bir dolu-renk düğme.                          |
| T4-05 | Telefonda birincil eylem başparmak erişiminde olsun (alt bölge) ya da yapışkan. | P2  | Form gönderme düğmeleri ekranın alt üçte birinde ya da yapışkan. |
| T4-06 | Her ikon-düğmenin erişilebilir adı olsun.                                       | P0  | Metinsiz her `button`'da `aria-label` var.                       |

## T5 — Kütükler, tablolar, listeler

| ID    | Gereksinim                                                                                                | P   | Kabul kriteri                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------- |
| T5-01 | `TableFrame`'in koşulsuz `min-w-[640px]`'i kalksın; telefonda tablo **kart listesine** dönüşsün.          | P0  | 390px'te hiçbir kütükte yatay kaydırıcı yok.                                  |
| T5-02 | Telefon kartında en çok 4 alan görünür: ne, kim, ne zaman, durum. Gerisi detayda.                         | P1  | Kart yüksekliği ≤ 140px.                                                      |
| T5-03 | Satır eylemleri masaüstünde satırın sonunda değil, **satıra yakın** ya da satır tıklanabilir olsun.       | P1  | Eylem hedefi satır başlığından ≤480px uzakta ya da satırın tamamı hedef.      |
| T5-04 | Uzun listelerde filtre ve sayım üstte ve yapışkan olsun.                                                  | P2  | Kaydırırken filtre çubuğu görünür kalır.                                      |
| T5-05 | Boş durum, bugünkü gibi **neden boş olduğunu** söylemeye devam etsin — bu zaten doğru yapılmış, korunsun. | P0  | Her boş durumda sebep cümlesi var (mevcut smoke testleri bunu zaten koruyor). |
| T5-06 | Gruplanmış kütüklerde grup başlığı ve sayısı kalsın (yükümlülüklerde iyi çalışıyor).                      | P2  | Grup başlıklarında sayı görünür.                                              |

## T6 — Açıklama metinleri

Bu uygulamaya özgü ve en büyük UX yükü. Her panel 3–5 satırlık bir
gerekçeyle başlıyor. Metinler iyi ve dürüstlük ilkesinin parçası — ama kalıcı
mobilya olduklarında kullanıcının geldiği şeyi ekrandan itiyorlar. Telefonda
Toplantılar ekranında ilk üç ekranda **tek bir veri satırı** görünüyor.

| ID    | Gereksinim                                                                                     | P   | Kabul kriteri                                         |
| ----- | ---------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------- |
| T6-01 | Panel açıklamaları varsayılan olarak **bir satıra** kısalsın; tamamı bir "neden?" ile açılsın. | P0  | Telefonda ilk ekranda en az bir veri satırı görünür.  |
| T6-02 | Açıklama silinmesin, taşınsın. Metinler korunur; yalnızca varsayılan görünürlüğü değişir.      | P0  | Her açıklama bir etkileşimle tam hâliyle okunabilir.  |
| T6-03 | Bir açıklama okunduktan sonra o cihazda kapalı kalsın.                                         | P2  | Tercih `localStorage`'da; okunamazsa açık varsayılır. |
| T6-04 | Uyarı şeritleri (ör. "doğrulanmamış içerik") kısa ve tek satır olsun, detayı açılır.           | P1  | Hiçbir uyarı şeridi telefonda 3 satırdan uzun değil.  |

## T7 — Formlar ve veri girişi

| ID    | Gereksinim                                                                                          | P   | Kabul kriteri                                   |
| ----- | --------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------- |
| T7-01 | Telefonda form alanları tam genişlik ve ≥44px yükseklik.                                            | P0  | 390px'te her `input`/`select` yüksekliği ≥44px. |
| T7-02 | Etiket alanın üstünde ve görünür olsun; yalnızca placeholder yasak.                                 | P0  | Her alanın bağlı `<label>`'ı var.               |
| T7-03 | Veritabanı reddini kullanıcı diline çeviren mesaj gösterilsin; ham Postgres hatası ekrana düşmesin. | P1  | Bilinen hata kodları için insan cümlesi var.    |
| T7-04 | Zorunlu alan ve zorunlu olmayan ayrımı yazıyla belli olsun.                                         | P2  | Zorunlu alanlarda görsel + metinsel işaret.     |
| T7-05 | Çift dilli alanlarda hangi dile yazıldığı belli olsun (0046'da öğrenildi).                          | P1  | Form, girilen dilin kolonuna yazdığını söyler.  |
| T7-06 | Uzun formlarda kaydedilmemiş değişiklik uyarısı.                                                    | P2  | Sayfadan ayrılırken uyarı.                      |

## T8 — Durum, geri bildirim, bekleme

| ID    | Gereksinim                                                                       | P   | Kabul kriteri                                         |
| ----- | -------------------------------------------------------------------------------- | --- | ----------------------------------------------------- |
| T8-01 | Yüklenirken iskelet gösterilsin, boş ekran değil.                                | P1  | Her kütükte yükleme iskeleti var.                     |
| T8-02 | "Bilinmiyor" ile "yok" ayrı görünsün — bu portalın omurgası, arayüzde de sürsün. | P0  | Üç durum (var · yok · bilinmiyor) görsel olarak ayrı. |
| T8-03 | Yazma işlemleri sonucu görünür bir onayla bitsin.                                | P1  | Her mutasyonun görünür sonucu var.                    |
| T8-04 | Çevrimdışıyken ne kaydedilmediği ekranda kalsın (bugün doğru yapılmış).          | P0  | Mevcut davranış korunur.                              |

## T9 — Erişilebilirlik

| ID    | Gereksinim                                                             | P   | Kabul kriteri                                            |
| ----- | ---------------------------------------------------------------------- | --- | -------------------------------------------------------- |
| T9-01 | Gövde metni kontrastı en az 4.5:1, büyük metin 3:1.                    | P0  | Ölçülen her metin/arka plan çifti eşiği geçer.           |
| T9-02 | Renk tek başına anlam taşımasın; her durum ikon ya da etiketle gelsin. | P0  | Durum rozetlerinde metin var.                            |
| T9-03 | Klavyeyle her eyleme erişilebilsin ve odak görünür olsun.              | P0  | Tab sırası mantıklı; `:focus-visible` her yerde görünür. |
| T9-04 | Dinamik değişiklikler ekran okuyucuya duyurulsun.                      | P1  | Önemli bölgelerde `aria-live`.                           |
| T9-05 | Hareket azaltma tercihi saygı görsün.                                  | P2  | `prefers-reduced-motion` uygulanır.                      |

## T10 — Grafikler ve pano

| ID     | Gereksinim                                                                                                                          | P   | Kabul kriteri                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------- |
| T10-01 | Kategorik palet **doğrulayıcıdan geçsin**. Bugün iki kontrolden kalıyor: `#586e75` gri okunuyor; kırmızı↔yeşil döteranopide ΔE 4.1. | P0  | Palet doğrulayıcısı PASS.                       |
| T10-02 | Durum renkleri (iyi/uyarı/ciddi/kritik) ayrılsın ve seri rengi olarak kullanılmasın.                                                | P0  | Durum renkleri kategorik paletten ayrı.         |
| T10-03 | İki serili her grafikte lejant olsun; dört seriye kadar doğrudan etiket.                                                            | P1  | Lejant mevcut.                                  |
| T10-04 | Çift eksenli grafik olmasın.                                                                                                        | P0  | Hiçbir grafikte ikinci y ekseni yok.            |
| T10-05 | Ölçülen noktalar arası çizgi **basamak** olarak çizilsin (zaten yapılmış, korunsun).                                                | P0  | Mevcut davranış ve testi korunur.               |
| T10-06 | Grafiklerin tablo görünümü olsun.                                                                                                   | P1  | Her grafiğin yanında veri tablosu erişilebilir. |
| T10-07 | Telefonda grafik okunabilir kalsın: eksen etiketleri seyreltilsin, yatay kaydırma olmasın.                                          | P1  | 390px'te grafik taşmıyor.                       |
| T10-08 | Pano, sayfanın tamamını kaplayan metin yerine **birkaç karar sayısıyla** açılsın.                                                   | P1  | İlk ekranda en az üç ölçüm görünür.             |

## T11 — Tasarım sistemi ve tutarlılık

| ID     | Gereksinim                                                                                                 | P   | Kabul kriteri                                                |
| ------ | ---------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| T11-01 | Renk, boşluk, yarıçap, gölge ve tipografi **token** olsun; bileşenler tokenları kullansın.                 | P0  | Keyfi `text-[Npx]`/`#hex` kullanımı sıfır.                   |
| T11-02 | İki ayrı tipografi sistemi birleşsin: bugün sabit metinli bölümler büyük, veri bölümleri küçük.            | P0  | Tek ölçek, her iki tarafta.                                  |
| T11-03 | `ActionButton`, `Pill`, `Field`, `TableFrame` tek kaynak olsun; sayfa içinde elle yazılmış düğme kalmasın. | P1  | Ham `<button className=...>` sayısı belirgin biçimde azalır. |
| T11-04 | Karanlık tema **seçilerek** yapılsın (otomatik ters çevirme değil) ya da hiç yapılmasın.                   | P2  | Karanlık tema varsa kendi adımlarıyla doğrulanmış.           |
| T11-05 | İkon kullanımı tutarlı: aynı kavram her yerde aynı ikon.                                                   | P2  | İkon–kavram eşlemesi tek yerde tanımlı.                      |

## T12 — Algılanan hız

| ID     | Gereksinim                                                                                      | P   | Kabul kriteri            |
| ------ | ----------------------------------------------------------------------------------------------- | --- | ------------------------ |
| T12-01 | İlk anlamlı çizim telefonda 3G'de 3 sn altında.                                                 | P1  | Ölçülür ve kaydedilir.   |
| T12-02 | Rota geçişlerinde önceki içerik korunup üzerine yüklensin.                                      | P2  | Geçişte beyaz ekran yok. |
| T12-03 | Service worker ilk yüklemede 12 sn sürüyor (ölçüldü); bu bir gecikme kaynağı olarak incelensin. | P2  | Ölçüm kaydedilir.        |

---

## Önerilen sıra

Sırayı etki/çaba belirledi, moda değil.

**1. Dalga — telefonu kullanılabilir yapan dört şey (P0, hepsi ölçülebilir)**
T2-01 (yatay taşma), T3-01/T3-02/T3-03 (tipografi tabanı), T4-01 (dokunma
hedefleri), T5-01 (tabloların kart olması). Bu dört madde telefon
deneyimindeki ölçülen sorunun büyük kısmını kapatır ve hiçbiri bilgi
mimarisine dokunmaz.

**2. Dalga — bulunabilirlik**
T1-01, T1-02, T1-04, T1-05, T1-07. Çok sekme sorunu burada çözülür; altı
erişilemeyen rota burada erişilebilir olur.

**3. Dalga — ekranın geldiği işe ayrılması**
T6-01…T6-04 (açıklamaların demote edilmesi), T5-02, T5-03, T10-08.

**4. Dalga — sistemleştirme**
T11-01…T11-03, T9-*, T10-01…T10-07.

İlk dalga tek başına ölçülebilir bir fark yaratır: telefonda 44px altı hedef
455'ten 0'a, 12px altı metin 2449'dan ~0'a, yatay taşma 19 rotadan 0'a.

## Nasıl test edilir

Bu dosyadaki kriterlerin çoğu bir tarayıcıda ölçülebilir, yani smoke
suite'ine eklenebilir. Önerilen: `tests/design.mjs` — her rotayı iki genişlikte
gezip T2-01, T3-01, T3-02, T4-01, T4-02, T4-03, T5-01, T9-01 ve T1-08'i
sayısal olarak ölçen bir suite. Böylece bu gereksinimler, bu depodaki diğer
kurallar gibi, bozulduğunda düşen bir testle korunur.
