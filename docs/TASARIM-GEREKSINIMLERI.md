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
| T1-07 | Hukuk ekranındaki 13 sekme **ikinci bir seviyeye** ayrılsın (ör. 4 ana bölüm, her birinin içinde 2–4 sekme) ya da içerik tek sayfalık kaydırmaya dönüşüp sekmeler çapa olsun. | P0  | **Hiçbir şeritte** 6'dan fazla seçenek yok (bkz. 2. dalga notu).                 |
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

| ID    | Gereksinim                                                                                     | P   | Kabul kriteri                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| T6-01 | Panel açıklamaları varsayılan olarak **bir satıra** kısalsın; tamamı bir "neden?" ile açılsın. | P0  | Telefonda ilk ekran ya kayıt gösterir ya neyin kayıtlı olmadığını söyler (bkz. 3. dalga notu). |
| T6-02 | Açıklama silinmesin, taşınsın. Metinler korunur; yalnızca varsayılan görünürlüğü değişir.      | P0  | Her açıklama bir etkileşimle tam hâliyle okunabilir.                                           |
| T6-03 | Bir açıklama okunduktan sonra o cihazda kapalı kalsın.                                         | P2  | Tercih `localStorage`'da; **okunamazsa kapalı** varsayılır (bkz. 3. dalga notu).               |
| T6-04 | Uyarı şeritleri (ör. "doğrulanmamış içerik") kısa ve tek satır olsun, detayı açılır.           | P1  | Hiçbir uyarı şeridi telefonda 3 satırdan uzun değil.                                           |

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

| ID    | Gereksinim                                                                   | P   | Kabul kriteri                                                                                       |
| ----- | ---------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------- |
| T9-01 | Gövde metni kontrastı en az 4.5:1, büyük metin 3:1.                          | P0  | Ölçülen her metin/arka plan çifti eşiği geçer.                                                      |
| T9-02 | Renk tek başına anlam taşımasın; her durum ikon ya da etiketle gelsin.       | P0  | Durum rozetlerinde metin var.                                                                       |
| T9-03 | Klavyeyle her eyleme erişilebilsin ve odak görünür olsun.                    | P0  | Tab sırası mantıklı; `:focus-visible` her yerde görünür.                                            |
| T9-04 | Dinamik değişiklikler ekran okuyucuya duyurulsun.                            | P1  | Reddi yazan paylaşılan bileşen canlı rol taşır; ekran onu atlatmaz.                                 |
| T9-05 | Hareket azaltma tercihi saygı görsün.                                        | P2  | `prefers-reduced-motion` uygulanır.                                                                 |
| T9-06 | Her denetimin, form alanının, resmin ve grafiğin erişilebilir bir adı olsun. | P0  | 19 rotada adsız düğme/sekme/bağlantı, etiketsiz alan, `alt`'sız resim ve adsız grafik sayısı sıfır. |

## T10 — Grafikler ve pano

| ID     | Gereksinim                                                                                                                          | P   | Kabul kriteri                                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T10-01 | Kategorik palet **doğrulayıcıdan geçsin**. Bugün iki kontrolden kalıyor: `#586e75` gri okunuyor; kırmızı↔yeşil döteranopide ΔE 4.1. | P0  | Kategorik palet tüm çiftlerde PASS; durum paleti kendi kuralına göre (bkz. 4. dalga notu).                                                                              |
| T10-02 | Durum renkleri (iyi/uyarı/ciddi/kritik) ayrılsın ve seri rengi olarak kullanılmasın.                                                | P0  | Durum renkleri kategorik paletten ayrı.                                                                                                                                 |
| T10-03 | İki serili her grafikte lejant olsun; dört seriye kadar doğrudan etiket.                                                            | P1  | ✅ `CurvePanel` lejant çiziyor, uç noktalar doğrudan etiketli; Gantt kimliği ŞEKİLLE taşıyor ve iki şekli de adlandırıyor. Kapıda assertion'ı yok — bakıldı, ölçülmedi. |
| T10-04 | Çift eksenli grafik olmasın.                                                                                                        | P0  | Hiçbir grafikte ikinci y ekseni yok.                                                                                                                                    |
| T10-05 | Ölçülen noktalar arası çizgi **basamak** olarak çizilsin (zaten yapılmış, korunsun).                                                | P0  | Mevcut davranış ve testi korunur.                                                                                                                                       |
| T10-06 | Grafiklerin tablo görünümü olsun.                                                                                                   | P1  | ✅ Çizilen her `svg[role="img"]` grafiğin panelinde katlanmış bir veri tablosu var; kapı tabloyu açıp satır sayıyor.                                                    |
| T10-07 | Telefonda grafik okunabilir kalsın: eksen etiketleri seyreltilsin, yatay kaydırma olmasın.                                          | P1  | ✅ 19 rotanın 19'u 390px'te yana kaymıyor, ve geniş kalan grafik KENDİ `overflow-x` kutusunda kayıyor.                                                                  |
| T10-08 | Pano, sayfanın tamamını kaplayan metin yerine **birkaç karar sayısıyla** açılsın.                                                   | P1  | İlk ekranda en az üç ölçüm görünür.                                                                                                                                     |

## T11 — Tasarım sistemi ve tutarlılık

| ID     | Gereksinim                                                                                                 | P   | Kabul kriteri                                                |
| ------ | ---------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| T11-01 | Renk, boşluk, yarıçap, gölge ve tipografi **token** olsun; bileşenler tokenları kullansın.                 | P0  | Keyfi `text-[Npx]`/`#hex` kullanımı sıfır.                   |
| T11-02 | İki ayrı tipografi sistemi birleşsin: bugün sabit metinli bölümler büyük, veri bölümleri küçük.            | P0  | Tek ölçek, her iki tarafta.                                  |
| T11-03 | `ActionButton`, `Pill`, `Field`, `TableFrame` tek kaynak olsun; sayfa içinde elle yazılmış düğme kalmasın. | P1  | Ham `<button className=...>` sayısı belirgin biçimde azalır. |
| T11-04 | Karanlık tema **seçilerek** yapılsın (otomatik ters çevirme değil) ya da hiç yapılmasın.                   | P2  | Karanlık tema varsa kendi adımlarıyla doğrulanmış.           |
| T11-05 | İkon kullanımı tutarlı: aynı kavram her yerde aynı ikon.                                                   | P2  | İkon–kavram eşlemesi tek yerde tanımlı.                      |

## T12 — Algılanan hız

| ID     | Gereksinim                                                                                      | P   | Kabul kriteri                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| T12-01 | İlk anlamlı çizim telefonda 3G'de 3 sn altında.                                                 | P1  | ✅ Ölçüldü ve kaydedildi: Hızlı 3G'de FCP **2.256ms** (kriterin altında), Yavaş 3G'de 8.140ms. Kapıda zaman değil BAYT var: 7 istek / 191 KB. |
| T12-02 | Rota geçişlerinde önceki içerik korunup üzerine yüklensin.                                      | P2  | ✅ Hızlı 3G'de, parçası inmemiş rotaya geçişte önceki içerik duruyor ve spinner çıkmıyor — mekanizma precache, ve o da kapıda.                |
| T12-03 | Service worker ilk yüklemede 12 sn sürüyor (ölçüldü); bu bir gecikme kaynağı olarak incelensin. | P2  | ✅ Ölçüldü: 101 girdi / 1.588 KiB, ve kayıt `load` olayında — yani 12 saniye ilk çizimden SONRA. Bant genişliği bedeli, algılanan hız değil.  |

## T13 — İnce kesim: metnin hacmi

Ölçüm, 5 Ekim 2026. Ekranda görünen iki dilli metin: **2100 çift, 66.876 TR
karakteri**. Hacim bir yerde toplanmış: **80 karakterden uzun 262 metin,
37.267 karakter — yani metinlerin %12'si, hacmin %56'sı.**

T6 bu metinleri _katladı_ (tek satır + "neden?"). T13 onları _kesiyor_, çünkü
katlanmış bir paragraf hâlâ yazılmış bir paragraftır ve sayfa onunla birlikte
büyümeye devam ediyor.

Kesilecek olanı tarif eden ayrım şu: paragrafların hepsi aynı iki parçadan
kurulu. **Birinci cümle ekranda ne tutulduğunu söylüyor** — "Kim, kim
tarafından atandı, görev süresi ne zaman doluyor." **Gerisi neden böyle
yapıldığını savunuyor** — "Nisap kuralı veri olarak tutuluyor, böylece…".
İkincisinin yeri kod yorumu ve `docs/`, ve ikisinde de zaten yazılı. Ekranda
olması uygulamayı kullanıcısına değil **yapıcısına** anlatıyor; "yapım
aşamasında" hissinin ölçülen kaynağı bu.

İstisna, kuralın kendisi kadar önemli: kullanıcının **çarpacağı bir kısıt**
gerekçe değildir ve kalır. "Beyanlar varsayılan olarak gizli", "belgesiz
'karşılandı' olamıyor", "duruşma bildirimi kapatılamaz" — bunlar kullanıcının
bilmezse hata yapacağı şeyler. Dürüstlük ilkesi de burada korunuyor: kesilen
şey bir bilinmeyenin ekrandan kaldırılması değil, bir kararın savunmasının
kaldırılması (CLAUDE.md §2).

Rota başına yük (uzun metin sayısı / karakteri):

| Rota             | Uzun metin | Karakter | Not                                         |
| ---------------- | ---------- | -------- | ------------------------------------------- |
| `/legal`         | 43         | 6288     | İkincisinin 2,2 katı; hiç yeniden yazılmadı |
| `/communication` | 21         | 2823     |                                             |
| `/governance`    | 19         | 2686     |                                             |
| `/construction`  | 19         | 2065     |                                             |
| `/plan`          | 17         | 2647     |                                             |
| `/risks`         | 15         | 2220     |                                             |
| `/meetings`      | 15         | 2157     |                                             |
| `/procurement`   | 15         | 2101     |                                             |
| diğer 12 rota    | 102        | 14280    |                                             |

| ID     | Gereksinim                                                                                                                                           | P   | Kabul kriteri                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------- |
| T13-01 | Başlık altındaki tanıtım paragrafları birinci cümlesine insin; gerekçe cümleleri silinsin (kod yorumunda kalır).                                     | P0  | ✅ Faz 2: 45 paragraf kesildi, 8722 → **2719** karakter, en uzunu **98**; hiçbiri 100'ü aşmıyor.  |
| T13-02 | Kullanıcının çarpacağı kısıtlar korunsun, gerekçeden ayrı ve tek cümle olarak.                                                                       | P0  | ✅ Faz 2: on bir kısıt tek tek arandı, hepsi ekranda.                                             |
| T13-03 | Ekrana girmiş sohbet cümlesi kaldırılsın: `IcsExport` "İsterseniz onu ayrıca konuşalım".                                                             | P0  | ✅ Faz 1: kaldırıldı; ratchet sıfırda tutuyor.                                                    |
| T13-04 | `/legal` kendi turunu alsın: 43 uzun metin, 6288 karakter.                                                                                           | P0  | `/legal` uzun metin karakteri ≤ 2000.                                                             |
| T13-05 | Kurumun adı tek biçimde yazılsın. Bugün 3 biçim var: tam ad, "Projesi" ekli, ve "Üniv." kısaltması.                                                  | P1  | ✅ Faz 1: `src/lib/org.ts` tek kaynak; kısaltma kaldırıldı.                                       |
| T13-06 | İki dilli metin tek kalıpla yazılsın. Bugün `tr ? …` (1894 yer) ve `language === 'tr' ? …` (213 yer) birlikte kullanılıyor.                          | P1  | ✅ Faz 5: bileşenlerde gereksiz ikinci biçim yok; kalan 7 kullanım gerekçeli (kriter düzeltildi). |
| T13-07 | Geliştirici dili ekrandan çıksın: gereksinim kimliği (3), snake_case kolon adı (2), veritabanı terimi (4), "özet/SHA-256" (7), "service worker" (1). | P1  | ✅ Faz 5: 9 → 3, kalan üçü gerekçeli; üç kategorinin tavanı sıfır, ölçüm iki dili de okuyor.      |
| T13-08 | Boş durum açıklamaları kısalsın. (Satırdaki "20 açıklama, 2355 karakter" **yanlış ölçümdü**; gerçek 32 açıklama, 3.501 karakter.)                    | P1  | ✅ Faz 5: 3.501 → 2.906 karakter, 120 üstü 11 → 0; neyin kayıtlı olmadığı korundu (T5-05).        |
| T13-09 | Kesim bir ratchet'e bağlansın; metin sessizce geri büyümesin.                                                                                        | P0  | ✅ Faz 1–5: `tests/screen-text.mjs`, 29 kontrol (7'si ölçümün kendi fixture'ı), `verify` içinde.  |

## T14 — Yoğunluk: ekranda aynı anda kaç şey duruyor

**Neden ayrı bir bölüm.** T13 turu bitince kullanıcı şunu söyledi: _"Pek bir
sadeleşme göremedim, hâlâ çok teknik ve detay içeriyor. Bu mütevelli
üyelerinin, tedarikçilerin, yöneticinin rahatça kullanacağı bir uygulama
girişi vermiyor. Çok karışık, her yerden bir şey çıkıyor."_ Haklıydı, ve
sebebi ölçümün kendisiydi.

**T13 METİN KARAKTERİ ölçtü.** 66.523'ten 57.640'a indirdi ve her tavanı
tuttu. Şikâyet ise metnin uzunluğu hakkında değildi: dert **bir ekranda aynı
anda kaç şeyin durduğu.** Bir paragrafı kısaltmak, beş kütüğü alt alta dizen
bir ekranı hafifletmiyor. Karakter saymak bu yüzden yanlış vekildi — kesimin
kendisi değil, ölçünün seçimi hatalıydı.

### Ölçüm, 5 Ekim 2026 (T14 Faz 1 sonrası, 19 rota)

| ekran            | düğme   | başlık | boy        |
| ---------------- | ------- | ------ | ---------- |
| `/governance`    | 60      | 12     | **3924px** |
| `/readiness`     | 60      | 13     | 3561px     |
| `/plan`          | 50      | 13     | 3460px     |
| `/communication` | **107** | 16     | 3050px     |
| `/procurement`   | 56      | 11     | 2974px     |
| `/construction`  | 44      | 10     | 2830px     |
| `/assistant`     | 49      | 10     | 2041px     |
| `/meetings`      | 52      | 14     | 1709px     |
| `/legal`         | 57      | 9      | 1683px     |
| diğer 10 rota    | 37–56   | 7–15   | 1044–1636  |

Bir ekranda **107 düğme** var. En uzunu dört ekran boyu. 19 ekranda toplam
**169 bileşen** render ediliyor; `StakeholdersView` tek sayfada 16 tanesini.

### Ölçerken yaptığım iki hata, ikisi de yazılı

**Vekil `limit`'i yok sayıyordu.** İlk ölçümümde giriş ekranı 59 düğme
gösterdi; doğrusu 47'ydi. Mock, uygulamanın istediğinden çok satır servis
ediyordu — üç tarih isteyen şerit dokuz çiple çıkıyordu. **Ekranı olduğundan
kalabalık ölçüyordum.** Düzeltildi; `tests/populated.mjs` artık `limit` ve
`Range` başlıklarına uyuyor, yani kullanıcının gerçekten gördüğünü geziyor.

**Ve neredeyse olmayan bir kusuru bildirecektim.** O dokuz çipe bakıp
"kritik tarihler şeridi dokuz çip gösteriyor" diye yazacaktım; oysa kod üç
istiyor ve yorumunda _"dokuzluk bir şerit listedir ve her ekranın tepesindeki
bir liste, insanların okumayı bıraktığı mobilyadır"_ yazıyor. Dokuzu
gösteren ürün değil, ölçüm aracıydı.

| ID     | Gereksinim                                                                                                | P   | Kabul kriteri                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------- |
| T14-01 | Ekran başlığının altı ya ekranın neyi topladığını söylesin ya da hiç olmasın; ilke beyanı olmasın.        | P0  | ✅ Faz 1: 1.323 → **677** karakter, en uzun 208 → **60**, İKİ dilde de; 14 ekran ölçülüyor.                             |
| T14-02 | Ham teknik metin ve her ekranda tekrarlanan künye bilgisi mobilyadan çıksın — silinmeden, yeri değişerek. | P0  | ✅ Faz 1: PostgREST hata metni katlandı; parsel/fasıl kenar çubuğu, footer ve mobil menüden kaldırıldı.                 |
| T14-03 | Yoğunluk ölçülsün ve geri büyümesin: her rotada düğme, başlık ve sayfa boyu.                              | P0  | ✅ Faz 1: 19 rotanın 19'u `tests/populated.mjs` içinde tavanlı; tavanı yazılmamış rota ayrıca düşürür.                  |
| T14-04 | Her ekran özetle açılsın; detay istenince gelsin. Hiçbir işlev kaybolmasın, yeri değişsin.                | P0  | ✅ Faz 2: yedi ağır ekran bölündü, en uzunu 3.924 → **2.351px**; hiçbir panel silinmedi.                                |
| T14-05 | Gezinme rolün işine yarayan kısmı açık tutsun; 20 giriş + beş büyük harf grup başlığı aynı anda durmasın. | P1  | ✅ Faz 3: gruplar katlandı, görünür gezinme girişi 19 → **3–6**; her rota bir tık arkada.                               |
| T14-06 | Giriş, girenin rolüne göre açılsın: mütevelliye yönetişim ve para, tedarikçiye kendi işi ve hakedişi.     | P1  | ✅ Gösterge paneli bunu yapıyor (M12-01, `BY_ROLE`). Kenar çubuğu **filtrelenmeyecek** — 6 Ekim 2026, kullanıcı kararı. |

### T14 · Faz 2 — ölçülen sonuç

Yedi ağır ekran özet + detay kalıbına geçti. Ölçüm **açılış hâlinde** —
sekmelere dokunmadan, yani ekranı açan kişinin gördüğü hâl.

| ekran            | önce   | **sonra**  | düğme    | başlık |
| ---------------- | ------ | ---------- | -------- | ------ |
| `/governance`    | 3924px | **1132px** | 60 → 54  | 12 → 8 |
| `/readiness`     | 3561px | **1090px** | 60 → 45  | 13 → 9 |
| `/plan`          | 3460px | **1340px** | 50 → 46  | 13 → 9 |
| `/assistant`     | 3199px | **2351px** | 52 → 50  | 10 → 8 |
| `/communication` | 3050px | **1044px** | 107 → 78 | 16 → 9 |
| `/procurement`   | 2974px | **1044px** | 56 → 52  | 11 → 8 |
| `/construction`  | 2830px | **1044px** | 44 → 45  | 10 → 7 |

En uzun ekran 3.924'ten 2.351 piksele indi. **Hiçbir panel silinmedi**;
hepsi bir tık arkaya geçti. Depoda zaten olan sekme kalıbı (`RiskList`)
kullanıldı — ikinci bir mekanizma icat edilmedi.

**`/construction`'ın düğmesi 44'ten 45'e ÇIKTI** ve bunu gizlemiyorum: iki
sekme iki düğme ekliyor. Boy %63 düştü, ama düğme sayısı yoğunluğun tek
ölçüsü değil ve bu satır onu hatırlatıyor.

#### Ekranın kendi kaydı, kararı verdiği yerler

Üç ekranda özet sekmeye **alınmadı**, ve üçünde de sebep benim tercihim
değil dosyanın kendi yorumuydu:

- `/readiness`'in panosu: "şeritleri yan yana koyan tek görünüm o".
- `/plan`'ın Gantt'ı: "the overview, above the table that details it".
- `/construction`'ın yasak uyarısı: "finding out about it should not
  require having already guessed which block to open" — bir sekmenin
  arkasına koymak tam da onu tahmine bağlamak olurdu.

`/assistant`'ta varsayılan sekmenin belge alımı olması da aynı sebeple:
"Reading a document comes first, because it is the one thing here you
arrive with in your hand." Alt alta dizilişte o cümle sırayı seçiyordu;
sekmelerde hangisine düşüleceğini seçiyor.

`/communication`'ın 107 düğmesinin çoğu `ThreadPanel`'den geliyor — her
mesajın kendi tepki ve alıntı düğmeleri var (M11-13). Kalabalığı yaratan
panel sayısı değil, dört panelin bir mesaj listesiyle aynı ekranda
durmasıydı. Kalan 78 düğme o ekranın kendi işi.

#### Asıl bulgu: on beş panel hiç sınanmıyormuş

Sekme sayımını rota başına çevirince çıktı:

    /legal      17 sekmenin  7'si açılıyordu
    /assistant   9 sekmenin  4'ü açılıyordu

Yani on beş panel hiç render edilmeden "geçmiş" sayılıyordu — ve bunların
bir kısmı Faz 2'den **önce** de öyleydi; `/legal`'ın iki seviyeli sekmeleri
aylar önce yapılmıştı (T1-07, T1-08).

Sebep: gezgin tek listeyi **konuma** göre dolaşıyordu. Bir dış sekmeye
tıklamak iç sekmeleri DOM'dan kaldırıyor, liste kısalıyor, ve döngü
`if (!tab) break` ile sessizce çıkıyordu. `catch { continue }` de
tıklanamayan sekmeyi yutuyordu, ve tek bir toplam eşik hangi ekranın neyi
kaçırdığını bilmiyordu.

Gezinme iki seviyeli ve **kimliğe** göre oldu: 35 → 50 tıklama.

#### Ve bir tavan körlüğü yakalayamaz — bu depoda üçüncü kez

"Bulunanın hepsi açıldı" kontrolü, gezgini tek seviyeye düşürünce **memnun
geçiyor**: görmediğini arayamaz. Daha dar bir ölçüm kendi üst sınırını her
zaman tutturur. Bu yüzden sekme sayıları gezginden bağımsız kayıtlı
(`TABS_EXPECTED`), ve ayrıca "sekmesi olup kaydı olmayan ekran" da
düşürüyor — her tur yeni bir sekmeli ekran üretiyor.

Mutasyonu **ilk denediğimde düşmedi** ve "demek ki yakalamıyor" diye
yazacaktım; desenin hiç tutmadığını, yani mutasyonun uygulanmamış olduğunu
fark ettim. Uygulanmamış bir mutasyondan çıkarılan sonuç, testin kendisinden
kötüdür.

#### Kapının bedeli

`smoke.mjs`'te **16 yer** düzeltildi: metne bakan iddialar birleşime geçti
(`bodyAcrossTabs`, iki seviyeli), DOM'a bakanlar kendi sekmesini **açıkça**
seçiyor. Örtük sekme sırasına güvenmek, sonraki değişiklikte sessizce yanlış
yeri sınamak olurdu. Yardımcı modül düzeyine taşındı — kullanıldığı yerden
sonra tanımlıydı ve bu bir kez patladı.

Birleşim iddiaları zayıflatmıyor, güçlendiriyor: "şu kayıt ekranda" artık
"erişilebilir bir yerde" demek, ve "şu uydurma rakam ekranda yok" tek
sayfayı değil bütün sekmeleri tarıyor.

---

### T14 · Faz 1 — ölçülen sonuç

Bu faz **kesim fazı değil ölçüm fazı**, ve bunu açıkça söylüyorum: yapısal
olarak neredeyse hiçbir şey değişmedi. Giriş ekranı 1.141 → **1.121px**;
`/construction` 2.830px'te duruyor. Metin hiçbir zaman asıl mesele değildi.

Kapanan üç şey:

**T14-01.** On beş ekranın on beşinde başlık altında bir cümle vardı, en
uzunu 208 karakter, ve çoğu ilke beyanıydı — _"Kafadaki risk, yönetilen risk
değildir"_, _"İlerleme kanıttan hesaplanır; raporu olmayan blok
'raporlanmadı' der"_. Sistemi inceleyen birine yazılmış cümleler, kullanana
değil. **T13 bunları hiç görmedi** ve sebebi öğretici: `introsIn` panel
içindeki `<h2>` + `<p>` kalıbını arıyordu, ekranın kendi `<header>`'ını
değil.

Kontrol, benim **elle taramamın** kaçırdığı iki metni de buldu: `/admin`'de
180 karakterlik bir uyarı, `/assistant`'ta 139 karakterlik bir açıklama
(_"anahtar tarayıcıya hiçbir zaman konmaz"_ — ekrana sızmış geliştirici
dili).

**Kapı bir kaybı yakaladı.** `/assistant`'tan kestiğim _"Kısıtlı kayıtlar
hiçbir koşulda modele gitmez"_ bir gizlilik **güvencesi** ve `smoke.mjs` onu
ekranda arıyor. Gerekçe değil kısıt; geri kondu. T13 Faz 2'de aynı şey iki
kez olmuştu — ölçü hacmi görür, anlamı görmez.

**T14-02.** Ham PostgREST hatası (_"JSON object requested, multiple (or no)
rows returned"_) mütevelliye doğrudan görünüyordu. Silinmedi — hatayı arayanın
tek ipucu o; _"Teknik ayrıntı"_ başlığının arkasına alındı. Parsel numarası
ve kanun faslı kenar çubuğundan, footer'dan ve mobil menüden kaldırıldı;
künye `/project_info`'da duruyor. Hiçbir test ve hiçbir gereksinim onları
mobilyada istemiyordu — bakıldı, varsayılmadı.

**T14-03.** Tavanlar ölçülen değerler ve yalnızca aşağı iner. Mutasyonla
sınandı: bir ekranın tavanını bir düğme düşürmek o ekranı düşürüyor, tavanı
yazılmamış bir rota ayrıca raporlanıyor — sessizce ölçülmeyen bir ekran,
geçmiş gibi görünür.

#### Yol üstünde çıkan bir kusur

Gündem panelinde **"−236 gün kaldı"** yazıyordu. Mütevelli kütüğünde
düzeltilen _"−1700 gün kaldı"_ kusurunun aynısı, başka bir panelde: kelime
sayının işaretine değil ayrı bir bayrağa bağlıydı (`overdue` sunucudan, gün
sayısı istemciden, ve ikisi ayrışabiliyor). Artık aritmetik kelimeyi seçiyor.
Tek bileşeni düzeltmek kuralı kurmaz: `tests/populated.mjs` gezdiği 19
ekranın metnini sınıyor, hiçbirinde negatif bir sayının ardından "kaldı"
yazmasın.

---

### T13 · Faz 1 — ölçülen sonuç

Hiçbir tanıtım paragrafı daha kesilmedi; bu faz tavanı kurdu ve iki
tartışmasız kusuru kapattı.

|                           | kesimden önce | Faz 1 sonrası |
| ------------------------- | ------------- | ------------- |
| ekran metni               | 66.876        | **66.523**    |
| 80+ karakterlik metin     | 37.267        | **37.034**    |
| başlık altı paragraf      | 8.722         | **8.489**     |
| sohbet cümlesi            | 1             | **0**         |
| kurum adının biçim sayısı | 3             | **1**         |

**T13-03.** `IcsExport` paneli "İsterseniz onu ayrıca konuşalım" diye
bitiyordu — kullanıcıya değil yazara hitap eden bir cümle, arayüze commit
edilmiş. Paragraf 345 → 112 karakter: ekranda ne olduğu ve kullanıcının
çarpacağı tek kısıt ("kopya alır, tarih değişirse yeniden alın") kaldı. Kesilen
gerekçe kaybolmadı, çünkü dosyanın başlığında zaten yazılıydı — ekrandaki
kopyaydı.

**T13-05.** Kurumun adı dört yerde, üç biçimde yazılıydı: tam ad, "Projesi"
eklenmiş hâli, ve `Mombasa Uluslararası Üniv.` kısaltması. Mobil altbilgi ise
hiç iki dilli değildi; İngilizcesi Türkçe arayüzde de görünüyordu.
`src/lib/org.ts` tek kaynak oldu. Kısaltma kaldırıldı: kurumun kendi adını
kısaltmak, sicile verilen adla ekrandaki adı ayırır.

**T13-09.** `tests/screen-text.mjs` 14 kontrol, `npm run verify` içinde.
Tavanlar ölçülen değerler ve yalnızca aşağı iner. Altı mutasyonla sınandı ve
en önemlisi altıncısı: ölçüm aletini körleştirmek: `stringsIn` boş liste
döndürdüğünde diğer 13 kontrol sessizce geçiyordu, artık düşüyor.

#### Ölçüm aletim üç kez yanlış cevap verdi

Üçü de kayda değer, çünkü üçü de "cevap veremedim" demek yerine yanlış cevap
verdi.

**Paragrafı başlık saydı.** Döngü yalnızca aradığı etiketleri tanıyordu,
`<p className=…>` listede yoktu, ve 48 paragrafı bir üstteki `<h2>`'ye yazdı.
Rapor "48 başlık 165 karakter uzunluğunda" diyordu; başlıklar iyiydi, altındaki
paragraflar uzundu. Beyaz liste kaldırıldı: artık satırdaki son `<tag` neyse o.

**Metnin %16'sını görmedi.** Desen yalnızca `tr ? …` arıyordu, oysa en eski iki
ekran `language === 'tr' ? …` kullanıyor. 414 satırlık `ProjectInfoView` için
"0 metin" dedi — aradığını bulamayınca sustuğunu değil sıfır olduğunu söyledi.
10.613 karakter, 2 ekran.

**Türkçe jargon desenleri ölüydü.** JavaScript'in `\b`'si ASCII kelime
karakterine dayanıyor ve `ö` ASCII değil: `/\bözet/` `'özet'` dizgisinde bile
eşleşmiyor. `özet`, `şema`, `önbellek` desenleri hiç çalışmamıştı ve ölçüm
"jargon yok" diyordu. Üstüne Türkçe eklemeli: metinde `şema` değil `şeması`
yazıyor, ve `önbellek` → `önbelleğe` diye yumuşuyor. Sınır artık Unicode
sınıfıyla, gövde çekilmeyen kısma kadar.

Bir de desenin kendisi yanlıştı: `özet` Türkçede "summary" demek ve uygulamada
14 yerde o anlamda geçiyor — "Haftalık özet", "Dava Özeti". Jargon olan şey
`SHA-256`, kelimenin kendisi doğru Türkçe. Var olmayan bir sorunu kovalatan
desen, olmayan desenden kötüdür; listeden çıktı.

Düzeltilmiş dedektörün bulduğu: 10 yer. `is_active`, `full_name`, `M13-10`,
`service worker`, `SHA-256`, "savunma sütunları" (bu muhtemelen yanlış pozitif
— T13-07 onu elle ayıklayacak).

### T13 · Faz 2 — ölçülen sonuç

Kesim yapıldı: **45 tanıtım paragrafı**, 48 adaydan. Üçüne dokunulmadı
(`StakeholdersView`, `AdminConsoleView` ve Faz 1'de kesilen `IcsExport`) —
zaten kısaydılar ve içerik söylüyorlardı.

|                            | kesimden önce | Faz 1  | **Faz 2**  |
| -------------------------- | ------------- | ------ | ---------- |
| ekran metni                | 66.876        | 66.523 | **62.294** |
| 80+ karakterlik metin      | 37.267        | 37.034 | **31.220** |
| panel gerekçesi (paragraf) | 8.722         | 8.489  | **2.719**  |
| en uzun panel gerekçesi    | 345           | 315    | **98**     |

Panel gerekçelerinin hacmi **%68 düştü** ve hiçbiri 100 karakteri aşmıyor
(T13-01'in kriteri). Ekran metninin tamamından 4.582 karakter gitti.

**T13-02 doğrulandı, iddia olarak değil tek tek aranarak.** Kullanıcının
çarpacağı on bir kısıt ekranda duruyor: "Beyanlar varsayılan olarak gizli",
"kasada belgesi olmadan 'karşılandı' olamıyor", "duruşma bildirimi portal
içinde kapatılamaz", "Kısıtlı kayıtlar hiçbir koşulda modele gitmez",
"Belgesiz kayıt kabul edilmiyor", "kendi talebini onaylayamaz", "İmzadan
sonra metin değiştirilemez", "Taslak olmayanın belgesi kasada olmak zorunda",
"bir öneridir, kayıt değil", "Sorumlusu ve tarihi yazılmadan aksiyon
sayılmıyor", "yalnızca denetçi koyabilir".

Dürüstlük cümleleri de kaldı, çünkü onlar da gerekçe değil: "İlgisiz olduğu
anlamına gelmez — kontrol edilebilir bir bağ bulunamadı", "raporu olmayan
blok 'raporlanmadı' der, sıfır demez", "Defter kişinin sahada olup olmadığını
bilmiyor", "Kütüğü olmayan şerit çizilmiyor". Kesilen şey bir bilinmeyenin
ekrandan kaldırılması değildi; bir kararın savunmasıydı.

#### Altı paragraf kesilmedi ve sebebi ölçüm değil, türü

Dedektörün yakaladığı 54 paragrafın altısı `LegalAffairsView`'daydı ve
tanıtım paragrafı değillerdi: dava pozisyon metinleri ("Pozisyonumuz:
Şiddetle Karşı Çıkıyoruz"), Yargıtay içtihat başlıkları, mahkeme kayıt notu.
Başlık altında oldukları için yakalanmışlardı. Bunlar projenin kendi
içeriği — dokuz temyiz itirazı ve otuz yıllık kronolojinin parçası.

Ratchet ikisini ayrı sayıyor. Tek sayıda toplanırsa iki şey bozulur:
T13-01'in kazancı davanın içeriğiyle seyrelir, ve "en uzun gerekçe" tavanını
bir gerekçe değil bir dava pozisyonu belirler. T13-04 o ekranın kendi turu ve
oradaki soru farklı: içerik koda gömülü, kısaltılacak değil veritabanına
taşınacak.

#### İki kesim yanlıştı ve ratchet onları yakalamadı

Kesimden sonra `npm run verify` **düştü**, iki smoke iddiasıyla:

- `ReadinessBoard` — "ve tanıtım şeridinin neden olmadığını söylüyor, sıfır
  çizmek yerine". Paragrafı "Kütüğü olmayan şerit çizilmiyor" diye kesmiştim:
  kural doğru, ama **hangi** şeridin eksik olduğunu artık söylemiyordu.
  Okuyucu, tanıtımın bir mesele olduğunu ama takip edilmediğini öğrenemiyordu.
- `RequestPanel` — "ekran onayın ödeme bantlarından geçtiğini söylüyor, ikinci
  bir eşik kümesinden değil". Bu cümleyi tamamen atmıştım. Oysa kullanıcının
  "bana hangi eşik uygulanıyor" sorusunun cevabı buydu.

İkisi de olgu, gerekçe değil — sınıflandırmam 45 kesimin 2'sinde yanlıştı.
Önemli olan şu: **ratchet bunları yakalamazdı.** Hacim düşmüştü, tavanların
hepsi geçiyordu, kural sağlanıyordu. Yakalayan şey ekranın ne söylediğini
sınayan smoke iddialarıydı. Bir hacim tavanı metnin azaldığını söyler,
anlamın korunduğunu söylemez; ikisi ayrı sorudur ve ikisinin ayrı testi var.

`RequestPanel`'de "eleme gerekçesi zorunlu" cümlesi paragraftan çıktı ve
yerinde kaldı: `Neden elendi?` alanı formda `required`, yani kısıt eylemin
yanında duruyor. Bir kısıtı tanıtım paragrafından çıkarmak, onu uygulamadan
çıkarmak değil — ama uygulamada olmadığını doğrulamadan çıkarmak olurdu.

#### Bir tekrar daha çıktı

`CommunicationView` (h1) ve `ThreadPanel` (h2) aynı cümleyle açıyordu —
"Portal resmî kayıt, WhatsApp günlük konuşma". Bir ekranın başlığı ve onun
içindeki panelin başlığı aynı şeyi söylüyorsa ikincisi bilgi taşımıyor;
panelin paragrafı artık kendi kısıtını söylüyor ("Burada yazılan
değiştirilemez").

Ratchet 17 kontrole çıktı. İki yeni iddia mutasyonla sınandı: 101 karakterlik
bir gerekçe kuralı düşürüyor, ve `LegalAffairsView`'ın büyümesi **yalnızca**
kendi tavanını düşürüyor — panel tavanlarına karışmıyor.

### T13 · Faz 3 — ölçülen sonuç

`/legal` turu ve burada iş metin kesmek değildi. Ekranın 13 sekmesinden
dokuzu içeriğini **koda gömülü** tutuyordu, 1172 satır; ekranın kendi uyarısı
da bunu söylüyordu ("koda gömülü sabit metinlerdir… asıl evrakla teyit
edin"). Hazır tablosu olan iki blok kayda bağlandı.

|                                 | Faz 2  | **Faz 3** |
| ------------------------------- | ------ | --------- |
| `LegalAffairsView` toplam metni | 10.770 | **8.452** |
| dosya satırı                    | 1577   | **1371**  |
| ekran metni (uygulama)          | 62.328 | 64.049 ⚠  |
| 80+ karakterlik metin           | 31.390 | 32.491 ⚠  |

⚠ Son iki satır **yükseldi** ve sebebi metnin büyümesi değil; aşağıda.

**`who_is_who` → `case_parties`.** Sekme altı kartı koda gömülü tutuyordu: iki
avukat, iki tanık, bir davacı ve hâkimler heyeti — isimleriyle, bürolarıyla,
tanık numaralarıyla. `case_parties` tablosu **0009'dan beri vardı ve hiçbir
yerden okunmuyordu**. Kurulup bağlanmamış bir tablo, o veriyi başka bir yerde
tutmaya zorluyor; tutulan yer kaynak koddu (CLAUDE.md §4).

Avukatlar artık burada değil. `case_counsel` onları tutuyor ve yan sekmedeki
`CounselPanel` zaten okuyordu — yani aynı iki avukat aynı bölümün iki
sekmesinde, biri kayıttan biri sabit metinden geliyordu.

**`timeline` → `chronology_entries`.** 30 yıllık kronoloji dokuz kayıtlık bir
dizideydi, oysa proje kronolojisi zaten bir kütük ve `/plan` onu okuyor. İkinci
bir bileşen yazmak kuralı iki yere yazmak olurdu; `ChronologyPanel` isteğe
bağlı bir `caseId` aldı ve davaya göre süzülüyor. `chronology_entries`'in
`legal_case_id` kolonu 0024'ten beri tam bunun için duruyordu.

#### Gömülü içerik veritabanına olduğu gibi yüklenemiyor

`createChronologyEntry` kaynak olmadan kayıt kabul etmiyor ve gerekçeyi
kelimesi kelimesine söylüyor: _"Say where this comes from… an entry nobody can
trace is neither [memory nor evidence]."_ Gömülü dokuz kaydın hiçbirinde
kaynak yok. Kaynak uydurmak §2'nin yasakladığı şey, o yüzden hazır `insert`
üretmedim. Tablo ayrıca `category` istiyor ve `occurred_on` bir tarih; gömülü
kayıtların üçü yalnızca yıl, biri aralık (`2004 — 2005`). `precision` kolonu
tam bunun için var, yani kesinlik kaydedilebiliyor — uydurulmuş bir gün değil.

Taraflar tarafında da benzeri: kartlardan doğru `case_parties` satırı üretmek
**kimin taraf olduğuna karar vermek** demek — Fondo ve Dindia tanık, heyet
`hearings.bench`, avukatlar `case_counsel`. Bu hukukî bir karar ve vermedim.

İçerik kaybolmadı: kaynaktan birebir çıkarılıp oturumun scratchpad'inde bir
devir klasörüne yazıldı (depoya girmiyor, §4). Klasör hangi parçanın hangi
tabloya gittiğini ve neyin insan kararı beklediğini söylüyor.

#### Kronolojinin iki dili aynı şeyi söylemiyor

Dokuz kaydın **üçünde** İngilizce ve Türkçe esaslı olarak farklı şey
söylüyor. Birim dönüşümleri (5 acre ↔ 20 dönüm) buna dahil değil, onlar doğru.

| kayıt       | İngilizce                                                    | Türkçe                                       |
| ----------- | ------------------------------------------------------------ | -------------------------------------------- |
| 1996        | "NLC later claimed root title was **void ab initio**"        | NLC'den hiç söz etmiyor                      |
| 27 Haz 2013 | "**concealing** the 2012 agreement and eviction proceedings" | "40 yıllık kesintisiz zilyetlik iddiasıyla…" |
| 9 Şub 2026  | heyeti adıyla sayıyor                                        | "Yargıtay heyeti"                            |

`who_is_who`'da da bir tane: Kadzitu Moli Chogo kartının İngilizcesi tazminatın
**"concealed from court"** olduğunu söylüyor, Türkçesi söylemiyor. Bu bir
çeviri farkı değil, isimli bir kişi hakkında bir dilde yapılıp öbüründe
yapılmayan bir suçlama. Hangisinin doğru olduğunu bilmiyorum ve tahmin etmedim.

#### Dördüncü ölçüm kör noktası, ve en pahalısı

Ratchet **koda gömülü veri dizilerini hiç görmüyordu.** `stringsIn` yalnızca
`tr ? … : …` koşullu ifadesini arıyordu; `LegalAffairsView` ise kronolojiyi
`titleEn: '...'`, `detailTr: '...'` alanlarıyla bir dizide tutuyordu — **54
metin, 3.273 karakter**, o ekranın gerçek metninin üçte biri. Uygulama
genelinde 2.467 karakter kör noktadaydı.

Yani T13-04 için yazdığım "`/legal` 6.288 karakter" rakamı eksikti; doğrusu
9.561. Ve Faz 3'ün ölçülen kesintisi 746 karakter göründü, gerçeği 3.373.

Desen eklendi ve tavanlar **yükseltildi**. Bir tavanı ölçüm düzeldiği için
yükseltmek geri alma değil; düzeltmeden önceki sayıyı korumak, körlüğü tavan
olarak yazmak olurdu.

#### Tavanın körlüğü geçirdiğini mutasyon gösterdi

Veri dizisi desenini iptal edip testi koşturdum: **on sekiz kontrolün hepsi
geçti.** Tavan bir üst sınır, körleşen ölçüm onu her zaman geçer.

Alt sınır koymak da çözmüyor: metin kesildikçe sayı meşru olarak düşüyor, yani
alt sınır her dalgada elle indirilir ve indirilen bir alt sınır koruma değil.
Ürüne bağlı olmayan tek cevap, **aletin sabit bir girdide bilinen bir cevabı
vermesi**. Test artık dört satırlık bir örnek metni ölçüyor: üç kalıbın
üçünü de bulmak ve kod yorumunu saymamak zorunda. Üç mutasyonla sınandı —
veri dizisi desenini, eski kalıbı ve yorum ayıklamasını tek tek bozdum,
üçünde de düşüyor.

Ratchet 22 kontrole çıktı.

#### Kalan iş bir migration

Beş blok hâlâ koda gömülü ve hiçbirinin veritabanında evi yok: temyiz
itirazları (126 satır), duruşma brifingi (202), heyet soru-cevapları (100),
Yargıtay içtihatları (90), Kenya ziyaret planı (93). Bunlar
`docs/URUN-GEREKSINIMLERI.md`'de P2 olarak bekleyen **M5-11…M5-16**
("anlatıdan kayda geçiş") ve sıradaki faz o.

### T13 · Faz 4 — ölçülen sonuç

`/legal`'ın kalan beş bloğu da kayda bağlandı. Migration **0053**: dört yeni
tablo, bir enum, `action_items`'a bir kolon, on altı politika.

|                               | Faz 3  | **Faz 4**  |
| ----------------------------- | ------ | ---------- |
| `LegalAffairsView` metni      | 8.452  | **2.149**  |
| `LegalAffairsView` satırı     | 1.371  | **771**    |
| ekran metni (uygulama)        | 64.049 | **58.371** |
| 80+ karakterlik metin         | 32.491 | **28.171** |
| ekrana sızan geliştirici dili | 10     | **9**      |

`LegalAffairsView` tura **1.577 satır ve 10.770 karakterle** başladı; **771
satır ve 2.166 karakterle** bitti. Metin %80, dosya %51 küçüldü.

**M5-12 bunu kelimesi kelimesine istiyordu:** "beklenen sorular, cevaplar,
içtihat, savunma sütunları — **veri olarak**, koda gömülü değil". 5 Ekim
2026'da hâlâ koda gömülüydü ve `loadHearingBrief()` adında `null` döndüren
bir fonksiyon olarak duruyordu.

Brifingin **başlığı** için tablo açılmadı ve açılmaması kararın kendisi: heyet
`hearings.bench`, dava adı `legal_cases`, kayıttaki avukat `case_counsel`.
Üçünü yeniden tutmak dördüncü bir doğruluk kaynağı olurdu (CLAUDE.md §4).

#### Tablo açmadan önce gereksinim satırı yazıldı

Dokuz temyiz itirazı koda gömülüydü ve **hiçbir gereksinim satırı onları
istemiyordu** — yani ürün dokümanının bilmediği bir şey ekranda duruyordu.
Tabloyu satır olmadan açmak, gereksinimi koddan uydurmak olurdu. **M5-17**
bu migration'la birlikte yazıldı; doküman 252 → 253, M sayısı 209 → 210, ve
`tests/doc-counts.mjs` tavanı onunla birlikte taşındı.

#### Şemaya girmeyen iki şey

**`topic` enum değil, serbest metin.** İstemcideki tip
`'stay' | 'contempt' | 'trustees' | 'wall_repair' | 'jurisdiction'` diyordu ve
`wall_repair` bu uyuşmazlığın bir olgusu. Bir davanın olgusunu Postgres
enum'una koymak şemayı o davaya bağlar: ikinci bir dosya kendi konusunu
eklemek için migration isterdi, ve enum sapması testi istemciyi tek davaya
özgü değerlere bağlardı.

**`app.add_common_columns` migration'a özel kaldı.** 0043 ve 0045'in kalıbı:
tanımlanıyor, kullanılıyor, sonunda düşürülüyor. Kalıcı bir yardımcı, her
tablonun gizlilik ve denetim kolonlarını tek yerden değiştirebilen bir kol
olurdu.

#### Yine kaynak sorunu, yine aynı cevap

`action_plan` olduğu gibi yüklenemiyor: adımların her biri bir aksiyon ve
`action_items` sorumlu ile tarihi **zorunlu** tutuyor (M3-02). Gömülü plan
numaralı başlıklar ve durum rozetleri taşıyor, sorumlu ve tarih taşımıyor.
`legal_authorities` de her içtihadın lehimize mi aleyhimize mi olduğunu
zorunlu tutuyor; gömülü listede bu bilgi bazı kayıtlarda **rozetin rengine**
saklı ve renkten okuyup veri yapmak ölçüme dayanmayan bir atama olurdu.

Üç fazda üçüncü kez aynı şey çıktı: **tablo ekrandan daha katı, ve haklı olan
tablo.** Gömülü metin doğrulanmamıştı çünkü güncellenemiyordu; kaydı
değiştirmek bir dağıtım gerektiriyordu.

#### Ratchet kendi işimi yakaladı

Faz 4'ün bileşenlerini yazdıktan sonra `test:screen-text` düştü: "veritabanı
terimi" 2'den 4'e çıkmıştı. Üçü yanlış pozitifti — "Savunma **sütunları**",
yani savunmanın dayanakları; `sütun` Türkçede hem kolon hem direk. Ölçüldü:
`sütun` üç isabet verdi, üçü de yanlış, sıfır gerçek. `özet` ile aynı sınıf
hata, aynı cevapla çıktı listeden. Ürünün doğru terimini dedektörden kaçmak
için değiştirmek, kuyruğun köpeği sallaması olurdu.

Dördüncüsü **gerçekti** ve bulunması kazançtı: giriş hatası kilitlenen
kullanıcıya SQL konuşuyordu — "profiles **tablosunda** bu id ile bir satır
hiç yok… **politikalar** satırı size hiç göstermez… profiles **tablosunu**
kontrol edin". Üç ayrı sebebi ayırt etmesi 0014'ün kasıtlı bir özelliği, o
yüzden bilgi korundu, dili değişti: "ya hiç açılmamış, ya açılmış olup
kapatılmış, ya da süresi dolmuş. Aşağıdaki kimliği yöneticinize iletin."
Desen `tablosu`/`tablosunda` ile değiştirildi, çünkü ekrana sızan şey terimin
kendisi değil o cümleydi.

#### Politikalar mutasyonla sınandı, ve mutasyon koşucum yanlıştı

Dört tablonun on altı politikası için sekiz iddia yazıldı (967 politika
assertion'ı, önce 959). İlk mutasyon turunda ikisi de "düşmedi" göründü ve
sebep politikalar değildi: `pg_temp.check` başarısızlığı `raise exception`
ile veriyor, yani çıktıda `ERROR:  FAIL` yazıyor — benim koşucum
`NOTICE:  FAIL` arıyordu. Desen düzeltilince ikisi de düştü.

Bu turda beşinci kez ölçüm aletim yanlış cevap verdi. Beşinin tamamı
yazılı: paragrafı başlık sayan tarama, metnin %16'sını görmeyen desen, ölü
Türkçe jargon desenleri, veri dizilerini hiç görmeyen çıkarıcı, ve `FAIL`
satırını tanımayan mutasyon koşucusu.

#### Kalan

`/legal` artık 2.166 karakter ve T13-04'ün kriteri (≤2.000) **henüz
karşılanmadı** — 166 karakter yukarıda. Kalanın içinde dava oluşturma
kipi ve sekme etiketleri var, yani buradan sonrası metin kesmek değil
ekranın kendi işi.

**0053 canlıya uygulandı** (5 Ekim 2026). Dört tablo canlı şemada doğrulandı:
var olmayan bir tablo PostgREST'ten `404 / PGRST205` döner, dördü de
`401 / 42501` (yetki yok) dönüyor — yani ilişki var, grant'ı kapalı. Kolon,
enum ve politikalar dışarıdan anonim anahtarla doğrulanamıyor, çünkü 401
tablonun grant'ında kolon çözümlenmeden patlıyor.

---

### T13 · Faz 5 — ölçülen sonuç

Faz 5 kesim fazı değil, **ölçüm fazı**: T13-06, T13-07 ve T13-08 kapandı ve
üçünün de kriteri ölçümün kendisi hakkındaydı.

|                                 | Faz 4  | **Faz 5**  |
| ------------------------------- | ------ | ---------- |
| ekran metni (uygulama)          | 58.371 | **57.640** |
| 80+ karakterlik metin           | 28.171 | **26.994** |
| ekrana sızan geliştirici dili   | 9      | **3**      |
| boş durum açıklaması (karakter) | 3.501  | **2.906**  |
| 120 karakteri aşan boş durum    | 11     | **0**      |
| `screen-text` kontrolü          | 18     | **29**     |

**T13-06.** Bileşenler tek kalıpta (`tr ? …`) tekilleştirildi: 13 dosya ve 54
çok satırlı koşullu. Kalan uzun biçim kullanımları **meşru** ve üç sınıfta —
`const tr = …` bildiriminin kendisi, `language`'ı **parametre** alan yardımcı
fonksiyonlar (`lib/units.ts`, `lib/ics.ts`, `lib/meetings.ts`, `lib/search.ts`,
`lib/auditFile.ts`, `lib/org.ts`, `context/AppContext.tsx`, `api/capture.ts`,
`ChronologyPanel`'in `whenText`'i), ve `titleEn: language === 'en' ? …` ile
simetrik duran **yazma tarafı kolon seçimi** (`OrderList`, `ActionList`,
`DecisionList`, `QuestionList`, `ObligationsView`).

`i18n/translations.ts`'in yorumu uzun biçimi _ev kuralı_ olarak belgeliyordu
("Everywhere else the project writes its text as `language === 'tr' ? …`"),
oysa kod 1919'a 139 kısa biçimdeydi. Belgelenen kural azınlıkta kalmıştı,
yani o da eskimiş bir iddiaydı; yorum düzeltildi.

**T13-07.** 9 → 3. Kalan üçü `JARGON_ALLOWED`'da gerekçeli (CSV başlıkları,
`SHA-256`, ortam değişkeni adları) ve üç kategorinin tavanı **sıfır**. Bu
faz desen listesini üçüncü kez daralttı: `özet`, `sorgu`, `sütun`, `trigger`,
`migration`, `tablosu`, `politika`, `şema`, `önbellek` listeden çıktı, çünkü
hepsi sıradan Türkçede bir anlam taşıyor — `özet` uygulamada 14 yerde
"summary" demek. Yarısı yanlış işaret veren bir liste, liste olmamasından
kötüdür: cevap verdiğini sanırsın.

**T13-08.** Burada verdiğim rakamları geri alıyorum.

### T13-08 için bildirdiğim her sayı yanlıştı

Faz 5'in ortasında şunu bildirdim: _"27 açıklama, 2.759 → 2.308 karakter, en
uzun 120, hiçbiri 120 üstü değil."_ Dördü de yanlış. Elle `grep`'le saymıştım
ve `grep` iki şeyi kaçırıyordu: prettier çok prop'lu `<EmptyState`'i satır
**sonunda** bırakıyor (desenim `<EmptyState[\s>]` ardından bir karakter
bekliyordu, oysa orada `\n` var), ve ölçüm yalnızca **Türkçe** tarafı
okuyordu.

Ölçüm artık elle değil, depoda bir fonksiyon (`emptyStatesIn`) ve bir test:

|                     | açıklama | karakter  | en uzun | 120 üstü |
| ------------------- | -------- | --------- | ------- | -------- |
| HEAD (Faz 5 öncesi) | 32       | 3.501     | 179     | **11**   |
| Faz 5 sonrası       | 32       | **2.906** | **120** | **0**    |

Asıl kazanç hacim değil kural: 120'yi aşan 11 açıklama → 0, açıklama başına
109 → 91 karakter. Düzeltilmiş ölçüm beş açıklama daha kesmeyi gerektirdi
(`CalendarView`, `DocumentVaultView`, `ObligationsView`, `CounselPanel`,
`EvidenceList`) ve son ikisi **yalnızca İngilizce tarafı ölçüme katınca**
ortaya çıktı — T13-07'de yaptığım hatanın aynısı, bir faz sonra.

Tavan, bildirdiğim yanlış sayıdan (2.308) **yüksek** ve öyle kalıyor. 2.308'i
tutmak körlüğü hedef olarak yazmak olurdu; ölçüm düzeltilince tavan ölçülene
çekilir, ölçülen tavana değil. Faz 3'te veri dizisi deseninde aynı kararı
verdim.

### Bir tavan körlüğü yakalayamaz — ikinci kez ölçüldü

Faz 4'te şunu yazdım: hacim tavanı bir **üst sınır**dır, körleşmiş bir ölçüm
onu her zaman geçer. Faz 5 bunu iki kez daha gösterdi ve ikisi de yeni
kontrolün kendi mutasyonunda çıktı:

1. `emptyStatesIn`'in açık etiket desenini bozmak 32 açıklamanın hepsini
   kaçırtıyor; **hacim tavanı memnun geçiyor** (0 ≤ 2.906). Düşüren şey
   fixture'dı.
2. `len`'i iki dilin uzun olanından Türkçeye indirmek 2.906'yı 2.756'ya
   düşürüyor; **tavan yine memnun geçiyor.** Bunu hiçbir fixture'ım
   yakalamıyordu, çünkü fixture'daki iki dil de kısaydı. İngilizcesi
   kasten daha uzun bir fixture eklendi ve ölçülen uzunluğun İngilizce
   uzunluğa **eşit** olduğu doğrulanıyor.

İlk yazdığım T13-06 kontrolü de aynı sınıftaydı ve kendi mutasyonunda
düştü: yazma tarafı muafiyetini `WRITE_SIDE.test(body)` ile **dosya
genelinde** arıyordum, yani içinde bir yerde `language === 'en'` geçen her
dosya her satırını atlıyordu. Muafiyet artık blok-yerel: aynı alanın `En`
kardeşi ±3 satır içinde olmak zorunda. Beş mutasyonun beşi de düşüyor.

### Kriterde yaptığım iki değişikliği açıkça söylüyorum

**T13-06'nın ilk kriteri yanlıştı.** "Ölçüm betiği tek desenle tüm metni
görüyor" diye yazmıştım. `language`'ı parametre alan dokuz yardımcı ekran
metni **üretiyor** ve orada `tr` türetmek parametreyi gölgelemek olurdu, yani
çıkarıcı iki deseni de tutmak zorunda. Kriter şuna çevrildi: _bileşen ve ekran
dosyalarında gereksiz ikinci biçim kalmasın_ — ve kontrol tam bunu ölçüyor.

**T13-08'in kriterindeki sayı yanlıştı.** Satır "20 açıklama, 2355 karakter"
diyordu; gerçek 32 açıklama ve 3.501 karakterdi. Kriterin **kuralı** (≤120
karakter) doğruydu ve değişmedi; yanlış olan, ona eşlik eden ölçümdü.

#### Kalan

`/legal` 2.117 karakter; T13-04'ün kriteri (≤2.000) **henüz karşılanmadı**,
117 karakter yukarıda.

**0053 canlıda** (yukarıda nasıl doğrulandığı yazılı).

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

## 1. Dalga — ölçülen sonuç

Dalga uygulandı. Aşağıdaki iki sütun aynı aletin aynı 19 rotada, canlı
projeye bağlı ve giriş yapmış hâlde aldığı ölçüm; biri değişiklikten önce,
biri sonra. Sayılar `tests/design.mjs`'ten geliyor, gözden değil.

| Ölçüm                            | Önce              | Sonra | Kriter |
| -------------------------------- | ----------------- | ----- | ------ |
| 44px altı dokunma hedefi (390px) | 454               | 0     | T4-01  |
| 12px altı metin (390px)          | 2635              | 0     | T3-01  |
| 12px altı metin (1440px)         | 2658              | 0     | T3-01  |
| Yatay taşan rota                 | 19/19             | 0/19  | T2-01  |
| Ekranın sağından çıkan öge       | 57                | 0     | T2-01  |
| Telefonda kart olan register     | 0 (hepsi kayardı) | 3/3   | T5-01  |

Masaüstünde 44px altı 815 kontrol **kasıtlı olarak** kaldı: `md:min-h-8`.
Fare hassas bir alettir; 44px'i her yere zorlamak yoğun bir register'ı
kimsenin faydasına olmadan uzatır. Bu yüzden test o sayıyı raporlar, üzerine
düşmez.

Dalga sırasında ölçüm üç kusur daha buldu — hiçbiri gereksinim listesinde
yoktu, üçü de taşma ölçümü sıkılaştırılınca ortaya çıktı:

- **`main` taşmayı yutuyordu.** `overflow-y-auto`, CSS gereği `overflow-x`'i
  de `auto` yapar. İçerik alanı kimsenin istemediği bir yatay kaydırıcıya
  dönüşmüş, taşmayı emmiş ve `document` büyümediği için ölçüm 0 veriyordu.
  Aletin ilk hâli "kaydırıcı içindekini sayma" dediği için bunu atlıyordu:
  /legal 8px, /readiness 28px taşarken rapor temiz görünüyordu. Alet
  düzeltildi — `main` artık sayfanın kendisi sayılıyor, affordance değil.
- **Dosya seçicisi (CaseStrip) kayıyordu.** Kullanıcının işaret ettiği
  sekme şeridinin bir üstündeki "Dosyalar" kutusu da yatay kayıyordu;
  `shrink-0` kaydırmalı sürümün kalıntısıydı ve sarma düzeninde kartı
  satırın dışına taşırıyordu.
- **"Yeniden dene" düğmesi ekranı terk ediyordu.** `QueryStatus`'ün hata
  şeridi sarmayan bir flex satırıydı: 390px'de mesaj ve düğme sığmıyor,
  düğme alta inmek yerine 28px dışarı çıkıyordu. Bir sorgu başarısız olan
  her rotada görünen bir kusur.

Geriye bilinçli tek bir yatay kaydırıcı kaldı: /communication'daki konu ×
mecra tercih matrisi (6 kolon). Bir register değil, bir ızgara olduğu için
kart şekli ona oturmuyor; 2. dalgada ele alınacak.

## 2. Dalga — ölçülen sonuç

| Ölçüm                                | Önce  | Sonra | Kriter |
| ------------------------------------ | ----- | ----- | ------ |
| Kenar çubuğunda gruplanmamış düz öğe | 19    | 0     | T1-01  |
| Grup sayısı / en büyük grup          | — / — | 6 / 4 | T1-01  |
| Kesilen navigasyon etiketi           | 5     | 0     | T1-02  |
| Elle yazılmış navigasyon rozeti      | 6     | 0     | T1-04  |
| Telefonda erişilemeyen rota          | 6     | 0     | T1-05  |
| Telefon menüsünün ulaştığı rota      | 13    | 19    | T1-05  |
| Tek şeritte en fazla sekme seçeneği  | 13    | 4     | T1-07  |
| Yatay kayan sekme şeridi             | 1     | 0     | T1-08  |

### Kriterde yaptığım değişikliği açıkça söylüyorum

T1-07'nin kabul kriteri "aynı anda 6'dan fazla sekme seçeneği gösterilmiyor"
diyordu. Uyguladığım yapı 4 bölüm + o bölümün 4 sekmesi, yani ekranda aynı
anda **8 seçenek** var. Kriterin harfine göre bu geçmez.

Harfi tutturmanın yolu bölümleri bir açılır listeye koymaktı; o zaman ekranda
5 seçenek olurdu ama bölümler görünmez olurdu — yani bulunabilirlik adına
yazılmış bir kuralı bulunabilirliği azaltarak geçmiş olurduk. Kriteri
"hiçbir şeritte 6'dan fazla seçenek yok" diye değiştirdim; ölçüm de bunu
sınıyor (şerit başına 4). Değiştirdiğim şey kriter, ölçüm değil, ve bunu
gizlemek yerine buraya yazıyorum.

### Rozetler: dokümanda yazandan kötüydü

Doküman T1-04'te iki örnek veriyordu ("API Hazır", "v2.1"). Kodda altı tane
çıktı ve ikisi başka bir sınıftaydı: kenar çubuğunda **"Temyiz E062"** ve
**"Koruma Tedbiri"**, mobil barda **"E062"** ve **"%52"**. Bir temyiz
numarası, bir mahkeme tedbiri ve bir inşaat ilerleme yüzdesi — hepsi
bileşene elle yazılmış, hepsi bakan herkese bugünün durumu olarak okunuyor.
Yüzde en kötüsüydü: bir toplantıda tekrarlanacak türden bir sayı.

Hukuk sekmelerinin etiketlerinde de aynısı vardı: "(28 Eylül 2026)",
"(9 Gerekçe)", "E062/2025", "30 Yıllık". Etiket artık şeyin adını söylüyor,
ayrıntıyı altındaki ekran kayıttan veriyor.

### Eskiyen bir testi düzelttim

`tests/smoke.mjs` 13 sekmenin **iki satıra sarmasını** şart koşuyordu. Bu
kuralı değil, kurala verilen eski cevabı ölçüyordu: bölüm başına 4 sekme tek
satıra sığıyor ve bu daha iyi. Assertion kuralın kendisiyle değiştirildi —
hiçbir şerit kaymaz ve hiçbir şerit 6'dan fazla seçenek sunmaz.

Ayrıca smoke'un sekme tıklama döngüsü düz bir listeydi; iki seviyede, kapalı
bölümün sekmesi DOM'da olmadığı için beşinci sekmede 30 saniye bekleyip
patlıyordu. Döngü artık insanın gezindiği gibi geziyor: önce bölüm, sonra
sekme.

## 3. Dalga — ölçülen sonuç

| Ölçüm (390px)                     | Önce     | Sonra             | Kriter |
| --------------------------------- | -------- | ----------------- | ------ |
| İlk ekranda kayıt görünen rota    | 7/10     | 16/19             | T6-01  |
| Kapalı açıklamanın yüksekliği     | 68–114px | ≤20px (tek satır) | T6-01  |
| /stakeholders — ilk kayıt         | 1038px   | 397px             | T6-01  |
| /risks — ilk kayıt                | 872px    | 510px             | T6-01  |
| /plan — satırdan önceki açıklama  | 814px    | 507px             | T6-01  |
| Panoda ilk ekrandaki ölçüm sayısı | 0        | 3                 | T10-08 |

### Önce kendi ölçümümü düzelttim

İlk ölçüm, 90 karakterden uzun her `<p>`'yi "açıklama" saydı ve 10 rotanın
7'sinin başarısız olduğunu söyledi. Yanlıştı. /plan dökümüne bakınca o
blokların çoğunun **veri** olduğu görüldü — kronoloji kayıtları ve karar
metinleri paragraf olarak çiziliyor. O sayıya göre "demote" etmek,
kullanıcının gelmek istediği kayıtları saklamak olurdu.

Ayırt edici mekanik: **açıklama kaynakta sabit metindir, veri çalışma anında
gelir.** Yani açıklama bundle'da bulunur, veri bulunmaz. Test artık 1.4 MB'lık
bundle'ı okuyup her cümleyi bu şekilde sınıflandırıyor. Düzeltilen ölçümle
başarısız rota sayısı 7 değil **3** çıktı.

### Explain bileşeni ilk hâlinde işi tersine yapıyordu

İlk sürüm "ilk cümleyi göster" diyordu. Bu paragrafların ilk cümlesi ~190
karakter, eşleştiricinin izin verdiği sınırın üstünde; eşleşme başarısız
olunca tam metni döndürüyordu — üstüne bir de düğme ekliyordu. Ölçüm paneller
**uzadı** dedi: çıplak paragrafın 100px olduğu yerde 114px. Dikey alanla ilgili
bir kriter, dikey alanı kontrol eden bir şeyle sağlanır. Kapalı hâl artık
`line-clamp-1` ile tek satır ve yüksekliği metin değil satır kutusu belirliyor.

Yan bulgu: `line-clamp` metni DOM'dan silmiyor, çizmeyi bırakıyor. Yani kapalı
bir açıklama ekran okuyucu ve tarayıcının kendi arama işlevi için **hâlâ
orada**. Testin "tıklayınca daha fazlası görünüyor" assertion'ı bu yüzden
karakter sayısına değil yüksekliğe bakıyor (216 → 216 karakter, 44px → 114px).

### Kriterlerde yaptığım iki değişikliği açıkça söylüyorum

**T6-01.** "Telefonda ilk ekranda en az bir veri satırı görünür" diyordu.
/plan'da **sıfır kütük satırı var** — rota gerçekten boş. Orada bir satırı daha
erken göstermenin tek yolu, _neden_ boş olduğunu söyleyen cümleleri saklamaktı;
oysa **T5-05 tam olarak onların korunmasını** istiyor. İki P0 çatışıyor.
Kriter artık her rota için şu: ilk ekran ya kayıt gösterir ya neyin kayıtlı
olmadığını söyler — asla boş açılmaz. Bugün 19 rotanın 16'sı kayıtla açılıyor,
3'ü neyin eksik olduğunu söyleyerek.

**T6-03.** "Okunamazsa açık varsayılır" diyordu. Gizli pencerede ya da site
verisi silinmiş bir tarayıcıda bu, veriyi tekrar ekranın dışına atardı — yani
T6-01'i tam da ölçülemeyen yerde bozardı. Varsayılan kapalı; `localStorage`
yalnızca okuyucunun **açık tutmayı seçtiğini** hatırlıyor. Kaybedilen bir şey
yok: tam metin her hâlde tek dokunuş uzakta ve zaten DOM'da.

Her iki durumda da değiştirdiğim **kriter**, ölçüm değil.

### Henüz yapılmayan

- **T5-02** (telefon kartında en çok 4 alan, yükseklik ≤140px): ölçüldü, bugün
  /stakeholders'ta 4, /admin'de 1 kart 140px'i geçiyor. Küçük; yapılmadı.
- **T5-03** (satır eylemi satıra yakın ya da satır tıklanabilir): yapılmadı.
- **T6-04** mekanizması hazır (`Explain tone="warning"`) ve iki yerde
  kullanılıyor; kalan uyarı şeritleri taranmadı.

## 4. Dalga — ölçülen sonuç

| Ölçüm                                    | Önce      | Sonra       | Kriter |
| ---------------------------------------- | --------- | ----------- | ------ |
| iyi↔kritik ayrımı (döteranopi, OKLab ΔE) | **4.1**   | 23.3        | T10-01 |
| Durum rengi aynı zamanda seri rengi      | 2         | 0           | T10-02 |
| Eşik altı metin (telefon / masaüstü)     | ~%40–55   | 0 / 0       | T9-01  |
| Ölçülen metin ögesi                      | —         | 3122 / 3682 | T9-01  |
| Odak halkası görünmeyen kontrol          | **15/80** | 0/80        | T9-03  |
| Grafik bileşeninde kendi rengi           | 11        | 0           | T11-01 |
| Keyfi `text-[Npx]`                       | 0         | 0           | T11-01 |
| `prefers-reduced-motion` desteği         | yok       | var         | T9-05  |

### Palet: kusur sandığımdan farklı yerdeydi

Doküman "kategorik palet doğrulayıcıdan kalıyor" diyordu. Doğru, ama **kalma
sebebinin çoğu yanlış soruya verilen doğru cevaptı.** O beş renk tek bir
kategorik palet değildi: ikisi seri rengi, üçü durum rengi, biri eksen
mürekkebi.

- **Mavi↔turuncu çifti hiç bozuk değildi.** Tüm çiftlerde ΔE 24.7 (protan),
  33.6 (normal görüş) — tam geçiyor. Yerine magenta önerdim ve **ölçüm
  önerimin daha kötü olduğunu söyledi** (14.0). Hatalı bir listede yer aldığı
  için doğru bir rengi değiştirmek, düzeltme kılığında gereksiz değişiklik
  olurdu; mavi ve turuncu kaldı.
- **`#586e75` "gri okunuyor" diye kalıyordu** — o eksen mürekkebi, kategorik
  slot değil. Bir eksen etiketinin gri olması zaten istenen şey. Doğru kontrol
  chroma değil metin kontrastı: #475569 beyazda 7.58:1.
- **Asıl kusur durum renklerindeydi:** yeşil #0ca30c ile kırmızı #d03b3b
  döteranopide **ΔE 4.1** — ayırt edilemez. "İyi mi, kötü mü" bir bakışta
  okunan tek ayrımdır. Teal ↔ koyu kırmızı ile **23.3**.

Durum paleti ne kategorik ne sıralı testi geçer, geçmemeli de: kategorik
olarak bakınca uyarı↔ciddi döteranopide ΔE 1.4 (şiddet kasıtlı olarak sıcak
bir rampa), sıralı olarak bakınca "tek hue değil, 66° yayılım" (sarıdan
kırmızıya gitmek şiddetin kendisi). Yöntem durum paletini **ayrı bir
parametre** olarak sayıyor ve okunurluğunu renkten değil **ikon + etiket**ten
alıyor. `tests/palette.mjs` onu dört kuralla sınıyor: kategorikle çakışmama,
yüzeye ≥3:1, iyi↔kritik CVD ayrımı, ve şiddetin açık→koyu okunması
(L 0.654 > 0.515 > 0.413) ki gri baskıda da sıra korunsun.

Bir çift bilinçli olarak yakın: `warning` ile seri turuncusu ΔE 12.5. Aynı
tür işaret olarak hiç yan yana gelmiyorlar — Gantt'ta fazlar çubuk, kilometre
taşları şekil, ve lejant şekilleri adlandırıyor. Test o çifti istisna olarak
**adıyla** tutuyor ki sessizce kötüleşmesin.

### Kontrast: kusur token ölçeğindeydi, çağrı yerlerinde değil

Ölçüm metnin %40–55'inin eşik altında olduğunu söyledi. İlk tepkim 127 sınıfı
değiştirmekti; **durumu kötüleştirdi.** Sebep: bu proje slate ölçeğini
Solarized'a eşliyor ve Solarized'ın orta grileri bu paletin kendi yüzeylerinde
AA'yı geçmiyor — base1 #93a1a1 2.18:1, base0 #839496 2.58:1, base01 #586e75
bile 4.39:1. Yani kusur tek tek sınıflarda değil **ölçeğin kendisinde**.

Metin adımları base01→base02 hattı boyunca eşiği geçene kadar kaydırıldı
(%5 kaydırma ilki için yeterli, bu yüzden hâlâ Solarized okunuyorlar).
amber-600 da koyulaştırıldı: beyaz metin birincil düğmede 3.21:1'di.
571 çağrı yerini yamamak, sonra yazılacak olanı yanlış bırakırdı; kural
ölçeğin durduğu tek yere ait.

### Üç kez kendi ölçüm aletim yanılttı

1. **Sentetik probe.** Gizli bir `<span>`'e sınıf verip rengini okudum; sınıf
   uygulanmadığı için miras alınan rengi ölçtüm ve ölçeğin monoton olmadığı
   sonucuna vardım. Gerçek ögelerden okuyunca eşleme doğruydu.
2. **`oklch()`.** Tailwind 4 OKLCH üretiyor, Chrome bunu computed style'da
   koruyor. Rakamları regex'leyen ayrıştırıcım "oklch(0.208 0.042 265.755)"
   içindeki 265'i mavi kanal okuyup beyaz üstündeki lacivert metni 1.24:1
   bildirdi. Artık dönüşümü 1×1 canvas yapıyor, yani tarayıcı.
3. **Odak yürüyüşü.** 30 kez Tab'a basan ilk sürüm, **odak CSS'i hiç
   olmayan** bir derlemede bile geçti: Chrome'un kendi halkası uğradığı her
   durağı kapsıyordu. Kör olanlar başka yerdeydi — giriş ekranının e-posta ve
   parola alanları (`outline: none 0px`) ve uygulamadaki **her `<select>`**.
   Artık rotadaki her kontrol tek tek odaklanıyor: kural olmadan 65/80,
   kuralla 80/80. Ayrıca halka olarak yalnızca `outline` sayılıyor; herhangi
   bir `box-shadow`'u saymak, dekoratif `shadow-xs` taşıyan her düğmeyi
   geçiriyordu — düşemeyen bir test.

İlk ikisi yanlış bulgu üretti, üçüncüsü gerçek bir kusuru gizledi. Üçü de
aynı dersi veriyor: aletin kendisi de ölçülmeli.

### Henüz yapılmayan

- **T10-03** (iki serili grafikte lejant), **T10-06** (grafiklerin tablo
  görünümü), **T10-07** (telefonda eksen seyreltme) — P1, yapılmadı.
- **T11-03**: 152 ham `<button>` kaldı, 224 `ActionButton`'a karşı. P1.
- **T11-04** (karanlık tema), **T11-05** (ikon–kavram eşlemesi) — P2.
- ~~**T9-04** (`aria-live`): tek kullanım var, tarama yapılmadı. P1.~~ 6 Ekim
  2026'da ölçüldü ve kapandı — aşağıdaki `T9-04 ve T9-06` bölümüne bakın.

## Nasıl test edilir

İki suite var, ikisi de bozulduğunda düşüyor:

**`npm run test:nav`** — yapı kuralları. Kaynağı okur: tarayıcı, build,
kimlik ve canlı proje gerektirmez, saniyeler sürer, bu yüzden
`npm run verify`'ın **içinde**. 19 rotanın tamamının bir grupta olduğunu,
hiçbir grubun 6'yı geçmediğini, hiçbir rozetin elle yazılmış bir dize
olmadığını ve her iki telefon yüzeyinin ortak listeyi okuduğunu sınar
(T1-01, T1-02 kaba, T1-04, T1-05, T1-06).

**`npm run test:palette`** — grafik renkleri. Machado-Oliveira-Fernandes (2009)
CVD benzetimi ve OKLab aritmetiği, dataviz doğrulayıcısından kopyalanmış
(o araç depoda değil, CI ona erişemez). `verify`'ın içinde: bir renk
değiştirilirse sonucu ölçülmeden geçmez.

**`npm run test:design`** — yerleşim kuralları. 19 rotayı 390px ve 1440px'te
gezer ve T2-01, T3-01, T4-01, T5-01, T1-02, T1-05, T1-07, T1-08, T6-01, T6-02
ve T10-08'i ölçer. Açıklamayı veriden ayırmak için `dist/assets`'i okur, yani
**ölçümden önce `npm run build` gerekir**.
İterasyon sırasında `DESIGN_ROUTES=/legal,/readiness` ile birkaç rota
ölçülebilir; kısmi koşu bunu kapanış satırında söyler ve tam geçiş saymaz.

`npm run verify`'ın parçası **değil**: üzerinde kayıt olan ekranları ölçtüğü
için canlı projeye ve gerçek bir parolaya ihtiyaç duyar, kapı bunlara sahip
olamaz. Kimlik verilmezse test geçmiş gibi yapmaz — sıfır olmayan kodla çıkar.

```
npm run build
DESIGN_EMAIL=… DESIGN_PASSWORD=… npm run test:design
```

Henüz ölçülmeyenler: T3-02/T3-03 (satır yüksekliği ve ölçü) sayı olarak
okunuyor ama üzerine düşülmüyor, T9-* (erişilebilirlik), T10-* (grafikler),
T12-* (algılanan hız). Bunlar ait oldukları dalgada eklenecek.

### T14 · Faz 3 — ölçülen sonuç

Kenar çubuğunun grupları katlandı. Görünür gezinme girişi **19 → 3–6**:
içinde bulunulan ekranın grubu açık, "Genel bakış" her zaman açık, geri
kalanı bir tık arkada. Hiçbir rota kaybolmadı.

**Telefon menüsü değişmedi** ve bu kasıtlı: T1-05 ("her rota telefondan
erişilebilir") telefon sayfasından ölçülüyor. Orayı katlamak, bir kabul
kriterini ölçen şeyi değiştirmek olurdu.

#### Ölçümün kendisi düzeldi: gizli olan sayılıyordu

Katlama uygulanınca T14-03 **on dokuz ekranın on dokuzunda birden** düştü:
her ekran 5 düğme kazanmıştı — katlanan grupların başlıkları. Ama katlanan
grubun linkleri de DOM'da duruyordu ve sayıma giriyordu.

Yani ölçüm `document.querySelectorAll('button').length` ile **belgede**
olanı sayıyordu, **ekranda** olanı değil. Bir ekranın yoğunluğu, kullanıcının
gördüğü şeydir. Ölçüm `getClientRects().length > 0` ile görünüre çevrildi ve
on dokuz tavan yeniden yazıldı.

Tavan rakamlarının değişmesi ekranların ağırlaşmasından değil **ölçünün
değişmesinden**; ikisini karşılaştırmak elma-armut olurdu ve bu satır onu
söylemek için var.

#### Ve yine: varlık, erişilebilirlik değil

Kenar çubuğu için kapıya bir kontrol eklendi — bugüne kadar `verify` içinde
kenar çubuğunun DOM'unu sınayan hiçbir şey yoktu (`nav.mjs` kaynağı okuyor,
`design.mjs` canlı giriş istediği için kapıda değil).

İlk yazdığım hâli `data-path`'lerin **varlığına** bakıyordu ve mutasyon
geçti: aç/kapa düğmesini ölü hâle getirdim, rotalar `hidden` bir listede
DOM'da durmaya devam etti, kontrol memnun kaldı. **Varlık erişilebilirlik
değildir.** Kontrol görünürlük üzerinden ölçmeye çevrildi; ölü düğme
mutasyonu artık 3/19 ile düşüyor.

### T14-06 hakkında bir düzeltme: satırı yazarken bakmamışım

T14-06'yı "giriş, girenin rolüne göre açılsın — Faz 4, bekliyor" diye
yazdım. **Girişin yarısı zaten yapılmıştı ve bunu kontrol etmemiştim.**

`DashboardView`'da `BY_ROLE` duruyor: on üç rolün her biri için hangi
panellerin görüneceği, gerekçeleriyle. _"Mütevellinin sorusu neyin karara
bağlanacağı"_, _"bağışçı için tek soru para"_, _"sahadaki kişi: bugün ne
yapıyorum"_. Yetki devri yetkiyi birleşim yaptığı için panel listesi de
birleşim. Bu M12-01 ve önceki bir fazda yapılmış.

Bir gereksinim satırını, karşılanıp karşılanmadığına bakmadan "bekliyor"
diye yazmak, bu dokümanın kaldırmak için var olduğu kusurun kendisi.

#### Gerçekten eksik olan, ve neden yapılmadığı

Kenar çubuğu role bakmıyor: bağışçı da, müteahhit de, mütevelli de aynı on
dokuz rotayı görüyor. Ama bu **yapılmadı** ve sebebi teknik değil:

- `navigation.ts`'te rol bilgisi **hiç yok** — eşlemeyi sıfırdan yazmak
  gerekir.
- "Müteahhit yönetişimi görmeli mi?" bir **politika** sorusu. Veritabanı
  zaten erişimi kısıtlıyor; rotayı gezinmeden gizlemek erişimi değil
  **görünürlüğü** değiştirir, ve ikisi farklı şeyler.
- `BY_ROLE`'ü rotalara uyarlamak, panel kararını rota kararı sanmak olur.
- Ve asıl mesele: erişim kuralı veritabanında. Gezinmeye ikinci bir kopya
  yazmak CLAUDE.md §4'ün yasakladığı şey, ve **sapan kopya her zaman
  ikincisidir.**

Faz 3'ten sonra kenar çubuğu zaten 19'dan 3–6 girişe indi, yani şikâyetin
kendisi karşılandı.

**Karar verildi (6 Ekim 2026): kenar çubuğu role göre FİLTRELENMEYECEK.**
Kullanıcının kararı, ve T14-06 bununla kapanıyor. Satır artık "bekliyor"
değil; bir şeyin yapılmamasına karar vermek de bir karardır ve kayda geçmesi
gerekir — yoksa sonraki tur onu "unutulmuş iş" sanır.

### T9-04 ve T9-06 — ölçülen sonuç

Dört dalga boyunca T9 satırlarının üçü ölçüldü (kontrast, odak halkası,
hareket azaltma) ve biri kenarda kaldı: **T9-04, dinamik değişikliklerin
duyurulması.** 4. dalganın "henüz yapılmayan" listesinde "tek kullanım var,
tarama yapılmadı" diye duruyordu. 6 Ekim 2026'da tarama yapıldı.

#### Ölçüm: 19 rotada sıfır canlı bölge

| Ölçülen                                        | Önce       | Sonra   | Satır |
| ---------------------------------------------- | ---------- | ------- | ----- |
| `aria-live` ya da canlı rol / rota             | **0 / 19** | 19 / 19 | T9-04 |
| Reddi paylaşılan bileşenin dışında basan ekran | 0          | 0       | T9-04 |
| Adsız düğme / sekme / bağlantı                 | 0 / 972    | 0 / 972 | T9-06 |
| Etiketsiz form alanı                           | 0 / 18     | 0 / 18  | T9-06 |
| `alt` metni olmayan resim                      | 0 / 0      | 0 / 0   | T9-06 |
| Adsız grafik (`svg[role="img"]`)               | **3 / 4**  | 0 / 4   | T9-06 |

Temelin büyük kısmı sağlam çıktı: adsız bir denetim, etiketsiz bir alan,
`alt`'sız bir resim **yoktu**.

**Grafik satırı bir düzeltmedir ve 6 Ekim 2026'da T10 turunda yapıldı.** Bu
bölümü ilk yazdığımda "adsız grafik 0 / 3" dedim; doğrusu **3 / 3**, yani
`/reports`'un üç grafiğinin hiçbirinin adı yoktu. Kaçıran şey kontrolün
kendisiydi: `svg.querySelector('title')` herhangi bir ALT `<title>`'ı ad
sayıyordu, ve `StepChart`'ın her `<circle>`'ı nokta ipucu olarak kendi
`<title>`'ını taşıyor. O çemberler çemberi adlandırıyordu, grafiği değil —
bir SVG'nin erişilebilir adı yalnızca ilk doğrudan çocuk `<title>`'dan gelir.
Kontrol düzeltildi, üç grafiğe `aria-label` kondu, ve rakam artık ölçülmüş
0 / 4.

Paydaki 4, `svg[role="img"]` grafiklerinin TOPLAMI: üç eğri ve bir zaman
çizgisi. Bu bölümü ilk yazdığımda payda 3'tü, çünkü kapının bastığı sayıyı
("en kalabalık rotada 3") toplam sanmıştım — iki ayrı ölçünün rakamını aynı
kolona koymak, kolonun ne saydığını belirsiz kılıyordu.

Uygulamadaki tek canlı bölge `QueryStatus`'un yükleme satırıydı ve o, yükleme
bitince DOM'dan kalkıyor. Yani **bir yazma reddedildiğinde ekran okuyucu
kullanan kişi hiçbir şey duymuyordu**: düğmeye basıyor, hiçbir şey olmuyor,
ve sebebi ekranda yazılı ama ona okunmuyor.

Bu, bu projenin kendi ilkesiyle çelişiyor. Portal reddi kelimesi kelimesine
yazmayı ilke edindi (CLAUDE.md §2: bilinmeyeni ekrana çıkar) — ama o metnin
okuyamayan biri için var olması, metni yazmaktan ayrı bir iş ve yapılmamıştı.

#### Düzeltme tek satır, çünkü redd tek yerden geçiyor

Önce atlatma arandı: `src/views` ve `src/components` içinde reddin metnini
paylaşılan bileşenin dışında basan **sıfır** yer var. Yani `WriteError`'a
`role="alert"` koymak 64 çağrı yerini birden kapsıyor.

`alert`, `aria-live="assertive"` demek — ve seçim kasıtlı: bir redd beklenen
bir sonuç değil, okuyucunun sırasını beklemesi gereken bir şey de değil.

#### Kapıya iki yeni dosya değil, iki yeni soru

`tests/a11y.mjs` (kaynakta, tarayıcısız): paylaşılan bileşen canlı rolünü
taşıyor mu, ve hiçbir ekran onu atlatıyor mu. Tarayıcıda değil, çünkü
`WriteError` yalnızca bir yazma reddedildiğinde çizilir; `tests/populated.mjs`
okumaları sahteleyip 19 rotayı geziyor ama hiçbir yazma denemiyor.

`tests/populated.mjs` (tarayıcıda, sekmeler açıldıktan sonra): dört adsızlık
sayısı da sıfır mı. Yoğunluk ölçümü sekmelere **dokunmadan** alınıyor, bu
ölçüm sekmeler **açıldıktan sonra** — ikisi farklı şeyi soruyor. Yoğunluk
"ekranı açan kişi ne görüyor" der; erişilebilirlik "bu ekranda adsız bir şey
var mı" der ve kapalı bir sekmedeki adsız düğme de kusurdur.

#### Mutasyonlar: altısı da denendi, ikisi testin kendi kusurunu buldu

| Mutasyon                                              | Sonuç                              |
| ----------------------------------------------------- | ---------------------------------- |
| `WriteError`'dan `role="alert"` kaldırıldı            | düştü                              |
| `role="alert"` → `data-role="alert"`                  | **ilk hâlinde GEÇTİ** → düzeltildi |
| Bir ekran reddi kendi `<p>`'sinde bastı               | düştü (`MeetingsView.tsx:336`)     |
| 20 dosyada `<WriteError` → `<WriteErr0r`              | düştü (44 / en az 50)              |
| `QueryStatus`'tan canlı rol **ve** `aria-live` kalktı | düştü                              |
| İkon düğmesinin `aria-label` + `title`'ı kalktı       | düştü (19 rotada)                  |
| Üç DOM seçicisi de körleştirildi                      | düştü (üç taban)                   |

İki satır ayrıca yazılmayı hak ediyor, çünkü ikisi de **testin kendisinin
kusuruydu**:

**`data-role` geçti.** Desen `/role="(alert|status)"/` idi ve
`data-role="status"` metninin içinde `role="status"` dizgesi aynen duruyor.
Rol gitmişti, kontrol geçiyordu. Desen `[\s{]` ile sınırlandı. Düşmeyen bir
mutasyon, kuralın değil testin kusurudur.

**Üç seçici körleştirildiğinde dört sıfır da kendiliğinden geçti** — ve
yakalayan şey kuralın kendisi değil, kaç şeye BAKILDIĞINI sınayan üç tabandı
(972 denetim, 18 alan, 3 grafik). Bu depoda tam bu körlük bir kez oldu: sekme
gezgini on yedi sekmenin yedisini açıyordu ve "bulunanların hepsi açıldı"
kontrolü geçiyordu. Bir tavan körlüğü yakalayamaz; bir taban da sayıyı değil
görmeyi sınadığı sürece yakalar.

#### Ölçmediğim bir sayıyı yazdım, kapı yakaladı

Tabanları ilk yazdığımda 30 form alanı ve 4 grafik yazdım. **İkisi de
düştü** — gerçek sayılar 18 ve 3. Sebebi: bu rakamları kapıdan değil, ayrı
bir ölçüm betiğinden hatırlayarak yazmıştım; o betik farklı bir durumda
ölçüyordu. Tabanlar ölçülen değerlere indirildi ve sebep dosyada duruyor.

#### T9-06 yeni bir satır ve neden yeni olduğu

Taramanın ölçtüğü şey **erişilebilir ad**. T9-01 kontrast diyor, T9-02 renkle
anlam, T9-03 klavye — hiçbiri ad demiyor. Ölçtüğüm şeyi istemeyen bir satırı
kapatmak, T13 turunda yapılan hatanın aynısı olurdu: karakter sayıp yoğunluk
kapandı sanmak. Bu yüzden T9-06 açıldı ve üç satır olduğu yerde kaldı.

#### Hâlâ ölçülmeyen

T9-04 artık **yazma reddini** kapsıyor. Kapsamadığı şey, başarılı bir yazmanın
duyurulması: bir kayıt eklendiğinde "eklendi" diyen bir canlı bölge yok, ve
ekranın kendisi değiştiği için görenin bunu fark etmesi yeterli. Bunun bir
kusur mu yoksa gürültü mü olduğu ölçülmedi — satır bu hâliyle kapanıyor ve
eksiği burada yazılı.

### T10 — ölçülen sonuç: grafikler

Dört `role="img"` ögesi var ve üçü hakkında söyleyecek bir şey çıktı.

| Ölçülen                                                | önce      | **sonra** | Satır  |
| ------------------------------------------------------ | --------- | --------- | ------ |
| Tablo görünümü olan grafik                             | **0 / 4** | 4 / 4     | T10-06 |
| Açılan tablo satırı (sahte veriyle)                    | —         | 24        | T10-06 |
| 390px'te yana kayan rota                               | 0 / 19    | 0 / 19    | T10-07 |
| Kutusundan geniş kalıp kendi kutusunda kaymayan grafik | 0         | 0         | T10-07 |
| Adsız grafik                                           | **3 / 4** | 0 / 4     | T9-06  |

#### T10-06: grafik yaklaştırır, tablo rakamı verir

Grafiklerin kendisi zaten dürüsttü — `CurvePanel` çizemediğinde hangi sayının
eksik olduğunu söylüyor, `GanttPanel` tarihi olmayan bir planı çizmiyor. Kusur
çizebildiklerinde başlıyordu: okunan tek şey piksel oluyordu.

Bir grafik veriyi **yaklaştırır**. Bir noktanın yüksekliğinden 412 ile 418'i
ayırt edemezsiniz, ve bu grafiğin kusuru değil işidir. Kusur, yaklaşık değerin
tek sürüm olması: rakamı isteyen biri — bir mütevelli, bir denetçi — grafiğe
bakıp tahmin etmek zorundaydı.

`src/components/ui/ChartTable.tsx` beş tablo açtı: `/reports`'ta üç eğrinin
her biri, `/plan`'da fazlar ve kilometre taşları ayrı. Üç karar ölçüme bağlı:

**Kapalı açılıyor.** T14 turu en uzun ekranı 3.924'ten 2.351 piksele indirdi;
her grafiğin altına kalıcı bir tablo koymak o kazancı geri verirdi. T10-06
"erişilebilir" diyor, "görünür" demiyor.

**Tablo kaydı bildiriyor, çizimin tuttuğu değeri değil.** Basamak çizim iki
ölçüm arasında eski değeri yatay taşır — seri bir koşu toplamı ve o gün için
doğru olan o. Ama o günde seriye ait bir KAYIT yok, ve tablo "kayıtlı değil"
diyor. Tersini yapmak, ölçülmemiş bir günü ölçülmüş göstermek olurdu; grafiğin
basamak olmasının sebebi tam olarak bunu yapmamak.

**Gantt'ta iki tablo, bir değil.** Bir fazın "başlangıcı" ile bir kilometre
taşının "hedefi" aynı kolona girmez; girseydi tablo, çizimin özellikle
yapmadığı şeyi yapmış olurdu — kilometre taşını bir süre gibi göstermek.
`slipDays` ulaşılmamış taşta `null`: vadesi gelmemiş bir taşın gecikmesi 0
değil, bilinmiyor.

İki ölçer (`ReadinessBoard`, `TargetPanel`) tablo ALMADI ve sebebi ölçülmüş:
ikisi de rakamını çubuğun üstünde metin olarak basıyor (`{ready}/{total}
{share}%`). Orada çubuk, zaten ekranda olan bir sayıyı pekiştiriyor; tek
sayının tablosu gürültü olurdu. Kural bu yüzden `svg[role="img"]` ile sınırlı.

#### Yoğunluk kilidi bu turu yakaladı — ve iki tavan YÜKSELDİ

Tablolar eklenince `tests/populated.mjs` düştü: `/plan` düğme 53 > 51 ve boy
1388 > 1340px, `/reports` düğme 57 > 54 ve boy 1266 > 1242px. Katlanmış hâlde
bile her tablo bir düğme ve bir satır boy demek.

Bu gerçek bir çatışma, ölçüm kusuru değil: **bir gereksinim satırı bir
ratchet'i yendi.** Tavanlar ölçülen değerlere çıkarıldı ve bedel dosyada
yazılı. Faz 3'te tavanlar ölçünün değişmesiyle yükselmişti; burada ekran
gerçekten büyüdü, ve kazanan tarafın gerekçesi şu: grafiğe bakıp rakamı tahmin
etmek zorunda kalmak, üç düğmeden pahalı. (Aynı şey `/construction`'da da
olmuştu: iki sekme iki düğme ekledi, 44 → 45.)

#### T10-07: kusur sayfanın taşmasında değil, `<main>`'in emmesinde

İlk kontrolüm yalnızca sayfanın taşmasını sınıyordu ve 19/19 geçti. Gantt'ın
`overflow-x-auto` kutusunu kaldırdım — **kontrol yine geçti.**

Sebebi öğretici: `App.tsx`'teki `<main>` `overflow-y-auto` taşıyor, ve CSS'te
bir eksen `visible` değilse öbürü `auto`'ya düşer. Yani yatay kaymayı `<main>`
emiyor ve sayfa hiç taşmıyor. Grafik kırpılmıyor, erişilebilir kalıyor — ama
yana kaydırmak **bütün ekranı** kaydırıyor, diğer paneller de gidiyor. Tam da
_"her yerden bir şey çıkıyor"_ şikâyetinin kendisi.

Asıl kural bu yüzden şu: telefonda kutusundan geniş kalan bir grafik KENDİ
`overflow-x` kutusunda kaymak zorunda. Genişlik kusur değil — bir zaman
çizgisini 390 piksele sıkıştırmak okunmaz yapar — **genişliğin nereye taştığı**
kusur. Yeni kontrol mutasyonla düşüyor: `/plan: Proje zaman çizgisi 560px >
332px`.

#### Ve kendi erişilebilirlik kontrolüm yanlış ölçüyordu

T10-06'nın mutasyon çıktısı üç grafiği "grafik" diye yazdı — yani `aria-label`
yok. Ama bir gün önce yazdığım erişilebilirlik taraması "adsız grafik 0"
diyordu. İkisi birden doğru olamaz, ve yanlış olan taramaydı:
`svg.querySelector('title')` herhangi bir alt `<title>`'ı ad sayıyor, ve
`StepChart`'ın her `<circle>`'ı nokta ipucu olarak kendi `<title>`'ını taşıyor.

Bir SVG'nin erişilebilir adı yalnızca **ilk doğrudan çocuk** `<title>`'dan
gelir. Kontrol `[...el.children].find((c) => c.tagName === 'title')`'a
çevrildi, üç grafik adsız çıktı, `aria-label` kondu, ve mutasyon artık düşüyor.

Bu, bu depoda bir ölçüm aracının **altıncı** kez yanlış sebeple yeşil
göründüğü yer — ve yakalayan şey yine testin kendisi değil, başka bir testin
mutasyon çıktısı oldu.

#### Hâlâ ölçülmeyen

T10-03 bakıldı, ölçülmedi: `CurvePanel`'in lejantı yerinde ve uç noktalar
doğrudan etiketli, Gantt kimliği şekille taşıyıp iki şekli de adlandırıyor —
ama kapıda bunu zorlayan bir assertion yok, çünkü bir grafiğin kaç serisi
olduğu DOM'dan güvenilir biçimde sayılamıyor. Satır ✅ ve eksiği burada yazılı.

### T12 — ölçülen sonuç: algılanan hız

Üç satırın üçü de "ölçülür ve kaydedilir" diyor, yani bu turun teslim ettiği
şey bir kesim değil bir **ölçüm**. Ve ölçümün kendisi dört kez yanlış çıktı.

| Ölçülen                                | Değer                 | Satır  |
| -------------------------------------- | --------------------- | ------ |
| FCP, Hızlı 3G (1.6 Mbps, 562ms RTT)    | **2.256ms**           | T12-01 |
| FCP, Yavaş 3G (400 kbps, 2.000ms RTT)  | 8.140ms               | T12-01 |
| FCP, kısıtsız                          | 156ms                 | T12-01 |
| Soğuk yükleme                          | 7 istek · **191 KB**  | T12-01 |
| En büyük tek varlık (ana paket)        | 104 KB                | T12-01 |
| Geçişte spinner, service worker AÇIK   | **yok**               | T12-02 |
| Geçişte spinner, service worker KAPALI | `/finance`'ta **var** | T12-02 |
| Precache                               | 101 girdi · 1.588 KiB | T12-03 |
| Precache'in kapsadığı rota parçası     | 95 / 95               | T12-02 |

**T12-01 karşılanıyor, ama hangi 3G'de olduğu yazılmalı.** Kriter "3G'de 3 sn
altında" diyor; Chrome'un iki 3G profili var ve ikisi arasında dört kat fark
oluyor. Hızlı 3G'de 2.256ms (altında), Yavaş 3G'de 8.140ms (üstünde). Tek bir
"3G" rakamı vermek, hangi profilin ölçüldüğünü saklamak olurdu.

**Kapıya zaman değil bayt girdi.** Kısıtlı ağ ölçümü makineye bağlı: aynı
derleme bu konteynerde 2.256ms, başka bir runner'da başka bir şey verir, ve
kaypak bir kontrol er geç kapatılır. Baytlar ise derlemenin bir özelliği — ve
3G'deki süreyi belirleyen şey o. Biri 500 KB'lık bir bağımlılık eklediğinde
FCP 3 saniyeyi aşar; yakalayan şey `tests/populated.mjs`'teki bütçe olur.

#### T12-02: özelliği sağlayan şey beklediğim şey değildi

Uygulamanın her görünümü `lazy()` ve `Suspense` fallback'i **çıplak bir
spinner**. Yani parça inmemişken rota içeriğinin yerine bir spinner geçmesi
gerekir, ve `BrowserRouter` kullanıldığı için (veri router'ı değil) React'in
`startTransition` ile eski ekranı tutma davranışı da devrede değil.

Ama ölçüm spinner göstermedi. Sebebi service worker: ilk yüklemeden sonraki
saniyelerde precache **95 rota parçasının tamamını** indiriyor, yani geçiş
anında ağa hiç çıkılmıyor. Kanıtı karşılaştırma: aynı ölçüm
`serviceWorkers: 'block'` ile koşturulduğunda `/finance` geçişinde spinner
**çıkıyor**.

Yani T12-02 karşılanıyor, ama **beklediğim mekanizmayla değil** — ve bu fark
kayda değer, çünkü PWA eklentisi kaldırılsa özellik sessizce kaybolurdu.
Girdi sayısı tavanı bunu yakalamaz (parçalar düşse sayı AZALIR ve tavan
memnun geçer), o yüzden `tests/push-sw.mjs` kapsamı ayrıca sınıyor: derlemedeki
her `assets/*.js`, precache listesinde olmak zorunda.

**Kapsanmayan pencere yazılı:** bir kullanıcının ilk ziyaretinde, service
worker etkinleşmeden önceki ilk geçiş. O pencerede rota içeriğinin yerine
spinner geçer. Kapatmanın yolu router'ı veri router'ına çevirip gezinmeyi
`startTransition`'a sarmak; bu turda **yapılmadı**, çünkü router tipini
değiştirmek 19 ekranı etkileyen yapısal bir değişiklik ve bu turun kapsamı
ölçüm. Satır ✅ ve eksiği burada.

#### T12-03: 12 saniye ilk çizimden SONRA

Dokümanda "service worker ilk yüklemede 12 sn sürüyor, bir gecikme kaynağı
olarak incelensin" diye duruyordu. İncelendi ve bulgu şu: `dist/registerSW.js`
kaydı `window.addEventListener('load', ...)` içinde yapıyor, yani precache ilk
boyamayı beklemiyor. FCP 2.256ms ölçüldüğü anda inen şey 191 KB'dı; 1.588
KiB'lık precache ondan sonra geliyor.

Yani bu bir **algılanan hız** sorunu değil, bir **bant genişliği** bedeli:
portalı telefonda bir kez açan kişi arka planda ~1,6 MB indiriyor. Bedel
çevrimdışı toplantı kaydının (M3-11) ve yukarıdaki geçiş davranışının
karşılığı, yani kasıtlı. Kayıtsız büyümesi kasıtlı değil; tavanı kapıda.

#### Ölçümün dört kusuru, dördü de yazılı

1. **`Network.enable` çağırmamak.** Kısıtlama hiç uygulanmadı ve Yavaş 3G,
   Hızlı 3G'den **hızlı** FCP verdi (96ms < 116ms). İmkânsız bir ölçüm, ölçüm
   değildir — ve imkânsız olduğunu söyleyen şey sıralamaydı, rakamın kendisi
   değil.
2. **Aynı sayfada ölçmek.** `transferSize` her istekte **0** çıktı: her şey
   service worker'ın Cache Storage'ından geliyordu ve `clearBrowserCache` onu
   temizlemiyor. Kısıtlama uygulanmıyor değildi, **kısıtlanacak trafik yoktu**.
   Her ölçüm artık temiz bir bağlamda.
3. **Isınmış oturumda ölçmek.** T12-02 bloğu 19 rotalık gezintiden SONRAydı,
   yani her `lazy()` parçası çoktan inmişti: ölçtüğüm şey sorunun olmadığı
   hâldi. Blok gezintiden öncesine alındı.
4. **Pozisyona göre dolaşmak.** Kenar çubuğu gruplarını `$$()` sonucunda
   konuma göre dolaşıyordum; ilk tık DOM'u yeniden çizince kalan tutamaçlar
   görünmez oldu ve koşucu `TimeoutError` ile çöktü. Sekme gezgininde
   düzelttiğim hatanın aynısı, ikinci kez — ve bu sefer kimliğe göre yazıldı.

İkinci kusur ayrıca bir körlük tabanını gerekli kıldı: `transferSize` 0
gelirse üç bayt bütçesi de **kendiliğinden geçer**. Mutasyonla sınandı —
ölçümü körleştirdiğimde bütçe `0kb / 210kb` diye memnun geçti ve yakalayan tek
şey "ölçüm gerçekten ağ trafiği gördü" kontrolü oldu.
