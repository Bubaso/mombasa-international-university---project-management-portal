# Anlık bildirim kurulumu (M11-05, M11-06)

Bu dosya, tarayıcı bildirimlerinin canlı projede çalışması için yapılması
gereken üç işi ve her birinin neden gerektiğini anlatır. Kod tarafı bitti ve
`npm run verify` yeşil; aşağıdakiler canlı ortama dokunan adımlar.

## Neden bir anahtar gerekiyor

Web push, VAPID adı verilen bir anahtar çiftiyle çalışır (RFC 8292). Gönderen
taraf her isteği **özel** anahtarla imzalar; tarayıcı aboneliği **açık**
anahtara bağlı olarak kurar. İkisi uyuşmazsa anlık bildirim servisi isteği
**kabul eder** — 201 döner — ve tarayıcı yükü sessizce atar. Yani yanlış
anahtar, hata gibi görünmeyen bir arıza üretir.

Bu yüzden portal, "push yapılandırıldı" cümlesini tek bir şeye bağlar:
veritabanında kayıtlı bir açık anahtarın varlığı. `app.configured_media()`
`push_keys` tablosunu okur. Kayıt yoksa push gerçekten yapılandırılmamıştır,
çünkü hiçbir tarayıcı abone olamaz — ve ekran bunu "sağlayıcı yok" diye yazar.

**Özel anahtar veritabanına girmez.** Yalnızca gönderen fonksiyonun gizli
değişkeni olarak durur.

## Anahtar çifti

Bu oturumda üretilen çift (P-256, base64url):

- Açık: `BMq47JXQklEMTwhpk-4cu2ufkDaKNSPvj6faEHjwZZIQRmteM_RT9v7DbRWIYXKTKcYIO0tWR0v7QB1iVetjun8`
- Özel: scratchpad'de; depoya girmez. Yeni bir çift üretmek isterseniz
  `node -e` ile Web Crypto'dan `ECDSA P-256` üretip `d` değerini base64url
  olarak almak yeterli.

Çifti değiştirirseniz **mevcut tüm abonelikler ölür**: her cihazın yeniden
abone olması gerekir. `push_keys`'teki tek satır kuralı tam bunu önlemek için
var — iki açık anahtar, bir kısmı artık çözülemeyen abonelikler demektir.

## Üç adım

### 1. Göçü uygula

İki yol var; ikincisi token istemez.

**a) Göç betiği.** `SUPABASE_ACCESS_TOKEN` bir _kişisel erişim jetonu_ ister
(`sbp_...`). Bu, proje ayarlarındaki API anahtarlarından biri **değildir** —
hesap seviyesindedir ve Supabase Dashboard > hesap menüsü > **Access Tokens**
altından üretilir. Projenin `sb_publishable_...` ve `sb_secret_...`
anahtarları bu iş için kullanılamaz: ikisi de PostgREST anahtarıdır, DDL
çalıştıramazlar.

```
SUPABASE_ACCESS_TOKEN=<sbp_...> node scripts/apply-migrations.mjs --project fwaclhrlsmnhvmdqqdhe
```

**b) Dashboard SQL Editor.** Token gerekmez; editör zaten `postgres` rolüyle
çalışır. Göçün kendisi, göç kaydı ve açık anahtar satırı tek bir işleme
sarılmış hâlde hazırlanabilir — bir şey patlarsa hiçbir şey uygulanmaz ve
ikinci kez çalıştırılırsa açık bir mesajla durur.

0045 şunları kurar: `push_keys`, `delivery_media` görünümü, `push_health`
görünümü, `record_push_subscription`, `push_public_key`,
`claim_push_deliveries`, `settle_push_delivery`, `forget_push_subscription` ve
`notification_deliveries` üzerindeki teslim kuralının düzeltilmiş hâli.

### 2. Gizli değişkenler ve fonksiyon

```
supabase secrets set --project-ref fwaclhrlsmnhvmdqqdhe \
  VAPID_PUBLIC_KEY=<açık> VAPID_PRIVATE_KEY=<özel> VAPID_CONTACT=mailto:<adres>
supabase functions deploy send-notifications --project-ref fwaclhrlsmnhvmdqqdhe
```

`VAPID_CONTACT`, anlık bildirim servisinin şikâyet edebileceği bir adres
olmalı (RFC 8292 `sub`). Üçünden biri eksikse fonksiyon **503** döner ve "No
VAPID key is configured" der — boş bir koşu gibi davranmaz, çünkü "anahtar
yok" ile "sırada bir şey yoktu" farklı iki cevaptır.

Sunucu tarafı anahtarının iki nesli var: eski `SUPABASE_SERVICE_ROLE_KEY`
(JWT) ve yenisi `sb_secret_...`. Eski anahtarları kapatmış bir projede
yalnızca ikincisi bulunur. Fonksiyon üç ismi de deniyor
(`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SB_SECRET_KEY`),
hiçbirini bulamazsa **hangilerini aradığını söylüyor**, ve başarılı koşuşta
cevaba `keyUsed` alanıyla hangisini kullandığını yazıyor — ilk canlı çağrının
bunu tahmine bırakmaması için.

### 3. Açık anahtarı kaydet

Yönetici olarak, portaldan ya da SQL ile:

```sql
insert into push_keys (public_key, contact, note)
values ('<açık anahtar>', 'mailto:<adres>', 'Canlı proje');
```

Bu satır yazıldığı anda `app.configured_media()` push'u sayar, ekrandaki
"sağlayıcı yok" etiketi kalkar ve cihazlar abone olabilir.

### Çağırma

Fonksiyon gövdesiz POST ile çağrılır ve servis anahtarını ister. Bir zamanlayıcı
(pg_cron + http, ya da herhangi bir dış zamanlayıcı) her beş dakikada bir
çağırabilir. Cevap `{claimed, sent, failed, forgotten}` döner; `claimed`
ayrıca raporlanır, çünkü "hiçbir şey bulamadı" ile "hiçbir şey gönderemedi"
ayrı iki sonuçtur.

## Doğrulanan ve doğrulanamayan

**Doğrulandı.** Şifreleme ve imza, `tests/push.mjs` içinde 19 kontrolle
gidiş-dönüş sınanıyor: yük şifrelenip alıcının özel anahtarıyla **çözülüyor**
ve düz metnin geri geldiği görülüyor. Türkçe karakterler korunuyor; başlık
düzeni (idlen 65, rs 4096 big-endian) kontrol ediliyor; aynı yük iki kez
gönderildiğinde farklı çıkıyor; başka bir abonelik onu açamıyor; yanlış auth
secret ile çözme başarısız oluyor; VAPID imzası ilan edilen anahtarla
doğrulanıyor; `aud` uç noktaya göre değişiyor; `exp` 12 saat sonrası.

Bir kütüphane yerine RFC 8291/8292'nin elle yazılmasının sebebi bu: yanlış bir
türetme, anlık bildirim servisinden 201 alır ve bildirimi sessizce düşürür.
Gidiş-dönüş çözme, bunu yakalayan tek sınamadır.

**Doğrulanamadı.** Gerçek bir uçtan uca gönderim — gerçek tarayıcı, gerçek
anlık bildirim servisi — bu kaptan sınanamaz. Sınanmış olan kripto ve durum
makinesidir; servisin kabul ettiği baytların bir cihazda görünüp görünmediği
portalın bilebileceği bir şey değil. `settle_push_delivery` bu yüzden
`delivered` durumunu **reddeder**; push yalnızca `sent` olabilir.

## 0045'te bulunan üç sessiz kusur

Teslim yolunun testini yazarken ortaya çıktılar; üçü de bu projenin reddettiği
yönde sessizdi.

1. **Cihazı olmayan alıcının teslimi sıkışıyordu.** İlk taslak sıradaki her
   satıra `attempted_at` basıyor, sonra `push_subscriptions` ile birleştiriyordu.
   Cihazı olmayan birinin satırı damgalanıyor ama döndürülmüyordu: `queued`
   kalıyor, hiç gönderilmiyor, hiç başarısız olmuyor ve bir daha asla
   talep edilemiyordu — kişi sonradan telefon kaydetse bile. Artık gidecek
   yeri olmayan teslim talep edilmiyor; `push_health.queued_with_nowhere_to_go`
   bu arada ekranda bunu söylüyor.

2. **İki cihazı olan kişinin teslimi iki kez kapatılıyordu.** Dizüstü ve
   telefon iki abonelik, bir teslim satırıdır. Fonksiyon cihaz başına satır
   döndürüyordu, gönderen aynı teslimi iki kez kapatıyordu ve kalan durum en
   son cevap verenin durumu oluyordu — ölü bir dizüstü, telefona ulaşmış bir
   bildirimi `failed` yazabiliyordu. Artık cihazlar tek teslime karşı bir dizi
   olarak dönüyor ve gönderen hepsi için bir kez kapatıyor.

3. **0027'nin teslim tetikleyicisi her durum değişikliğini reddediyordu.**
   Yorumu "yalnızca `read_at` sizin" diyordu ve amacı doğruydu: alıcı durumu
   yazmasın. Ama koşulsuz yazılmıştı ve kimse farketmemişti, çünkü bugüne
   kadar hiçbir şey bir teslimi kapatmıyordu — `fan_out` durumu insert'te
   yazıyor, sonra kimse dokunmuyordu. Elinde gerçekten bir sağlayıcı cevabı
   olan ilk şey, yani bu gönderen, tetikleyici tarafından reddedildi.
   Kural ikiye ayrıldı: alıcı `state` sütununa **yetkili değil** (kolon bazlı
   grant), tetikleyici ise hangi geçişlerin var olduğunu söylüyor — sıradaki
   kapatılabilir, kapatılmış olan kapalı kalır, hiçbir teslim başka bir
   bildirime/kişiye/mecraya yöneltilemez.
