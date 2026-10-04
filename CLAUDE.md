# Çalışma usulü ve proje kuralları

Bu dosya bu depoda çalışan her oturum için geçerlidir.

## 1. Haberleşme — sessiz kalma

Uzun bir işte sessiz kalmak, işin kendisinden daha yorucudur. Kullanıcı ne
olduğunu bilmeden bekler ve bu kabul edilemez.

- **Önce plan.** Birkaç adımdan uzun bir işe girmeden numaralı adım listesi ve
  kaba süre ver. Beklemeyi öngörülebilir yapar.
- **Her adım sonunda bir satır.** Her araç çağrısında değil — her anlamlı iş
  biriminde. "0029 uygulandı, kronoloji yazıldı, şimdi kararlar."
- **On dakika kuralı.** On dakikadan fazla sessiz kalma. Uzun bir şey varsa böl
  ve arada haber ver.
- **Sürpriz bulguyu anında söyle.** Bir kusur, bir uyuşmazlık, beklenmeyen bir
  veri — bulduğun anda yaz, işin sonunda değil.
- **Görev listesini canlı tut.** Kullanıcı prosa okumadan adımların
  tiklendiğini görebilsin.

Varsayılan: **anlat ve devam et.** Her adımı onaya sunup bekleme; sadece haber
ver. Kullanıcı "her adımda dur" derse o zaman beklenir.

## 2. Dürüstlük kuralları — bu projenin omurgası

Portalın tamamı tek bir ilke üzerine kurulu: **bilinmeyen bir şeyi bilinmiş
gibi göstermemek.** Faz 0'da ekrandan kaldırılan şeyler bunun örnekleridir —
okunmamış dosyaların üzerindeki "SHA-256 verified", var olmayan bir muhasebe
entegrasyonunun "API Live" rozeti, kimsenin koymadığı sabit rakamlar.

- **Null sıfır değildir.** Teslim edilmemiş bir kilometre taşının gecikmesi
  `null`'dır, 0 değil. Teklif vermemiş bir adayın ücreti `null`'dır (0029).
  Kaydedilmemiş bir tutum `unknown`'dır, `neutral` değil.
- **Gönderilmeyen şeye "gönderildi" yazma.** Sağlayıcısı olmayan bir mecra için
  teslimat `unconfigured` kaydedilir (M11-06).
- **Kanıt isteyen durum kanıt olmadan girilemez.** "Ulaşıldı" bir belge ister,
  "teslim edildi" bir teyit ister, giden resmî yazı yazının kendisini ister.
  Bu kısıtlar kasıtlıdır; etrafından dolaşma.
- **Uydurma.** Notion'daki aksiyon metinlerinin sorumlusu ve tarihi yoktur;
  betik bunları uydurmaz, rapor eder. Uydurulmuş bir tarih, tarihi olmayan bir
  aksiyondan kötüdür — birincisi takip edildiğini sandırır.
- **Bilinmeyeni ekrana çıkar.** Arşiv 24 Nisan'da bitiyorsa, 25 Nisan'da vadesi
  gelen yükümlülük `open` kalır ve detayı "sonucu kayıtlı değil" der. Bu bir
  kusur değil, sorunun birinin önüne konmasıdır.

## 3. Test disiplini

- **Her yeni kural için assertion.** `tests/db/policies.test.sql` erişim ve
  bütünlük kurallarını, `tests/smoke.mjs` ekranda görünenleri kapsar.
- **Mutasyonla sına.** Yeni bir kural yazdıysan, kuralı bozup testin
  **başarısız olduğunu gör**. Başarısız olmayan test, test değildir.
- **Yanlış sebeple geçen testi düzelt.** Bu depoda en az beş kez oldu: rol
  sızması, `set_config(..., true)`'un işlem-yerel olması, kendi `FAIL`'ini
  yutan exception handler. Sayı tutmak yerine ayırt ediciliği kontrol et.
- **Çalıştırılacak tek komut `npm run verify`:** typecheck, lint, format,
  build, smoke, politika testleri, asistan kuralları.

## 4. Veri ve gizlilik

- **Gerçek proje verisi depoya girmez.** Bakanlar hakkında değerlendirmeler,
  hukukî strateji, özel iletişim kütüğü git geçmişine girmez. Göç betiği
  Notion'u canlı okur, Supabase'e canlı yazar; anlık görüntü ve ona dair
  hükümler scratchpad'de kalır (`docs/NOTION-GOC.md`).
- **Gizlilik varsayılanı kapalı tarafta.** Yeni bir kayıt için varsayılan
  `confidential`; `internal` yalnızca gerçekten her iç kullanıcının görmesi
  gereken şey içindir.
- **Kuralı iki yere yazma.** Erişim kuralı veritabanındadır; istemci onu
  tekrarlamaz, çünkü sapan kopya her zaman ikincisidir.

## 5. Mimari

- **Kural Postgres'te.** RLS politikaları, check constraint'ler, trigger'lar.
  İstemci kuralı uygulamaz, kuralın cevabını gösterir.
- **Migration'lar sıralı ve geri alınamaz.** `supabase/migrations/NNNN_*.sql`.
  Her biri neden var olduğunu yorumunda anlatır — ölçümle, varsa.
- **Fonksiyon oluşturan her migration `select app.reset_function_grants();`
  ile biter.** Postgres yeni fonksiyonun EXECUTE'unu PUBLIC'e verir ve bunu
  varsayılan ACL ile geri alamazsın (ölçüm 0026'da). Revoke satırlarını elle
  yazma: toptan `grant`, daha önce ismen kapatılmış her fonksiyonu yeniden
  açar — 0033 ile 0034 arasında tam bunu yaptı. İstisnalar o fonksiyonun
  içinde, tek yerde durur. Politika testi bunu zorlar.
- **Canlıya uygulama:** `node scripts/apply-migrations.mjs --project <ref>`.
  `SUPABASE_ACCESS_TOKEN` gerekir.

## 6. Kapsam

- Tasarım, UI ve UX bu çalışmanın kapsamı dışında — ayrı değerlendiriliyor.
- Gereksinimler `docs/URUN-GEREKSINIMLERI.md`'de numaralı: 197 satır, 15 modül.
  Bir iş bitince hangi satırları kapattığını söyle.
- Geliştirme dalı: `claude/elegant-knuth-4uapzy`. Başka dala izin almadan
  push yapma.
