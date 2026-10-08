/**
 * Ekran metninin hacmi ölçülü kalsın (T13-09).
 *
 * Ölçüm, 5 Ekim 2026: uygulama "yapım aşamasında gibi" göründü ve sebep
 * metnin hacmiydi — 2097 iki dilli metin, 66.523 TR karakteri, ve bunun
 * 37.034'ü yalnızca 262 uzun metinde. Asıl yük başlık altındaki tanıtım
 * paragrafları: 54 tanesi, 8.489 karakter.
 *
 * Bu dosya kesmiyor; kesilmiş olanın geri büyümemesini sağlıyor. Tavanlar
 * ÖLÇÜLEN değerler ve yalnızca aşağı iner: her dalga kendi kazancını buraya
 * yazar. Tavanı kesimden sonra yazmak, kendi sonucuna bakıp hedefi ona
 * uydurmak olurdu — bu yüzden ilk tavan kesimden önce yazıldı (T13-09, Faz 1)
 * ve T13-01'in her dalgası onu düşürüyor.
 *
 * Neden karakter sayıyor da satır ya da kelime değil: satır sayısı sarmaya
 * bağlı, kelime sayısı Türkçede eklerle oynuyor. Karakter, prettier'ın
 * paragrafı nasıl sardığından bağımsız tek ölçü.
 *
 * İki sıfır iddiası var ve ikisi tavan değil, kural:
 *
 *   **Sohbet cümlesi.** `IcsExport` paneli "İsterseniz onu ayrıca konuşalım"
 *   diye bitiyordu — kullanıcıya değil, yazara hitap eden bir cümle. Bir
 *   tane vardı ve bir daha olmamalı; tavan değil sıfır.
 *
 *   **Kurumun adı.** Dört yerde yazılıydı, üç biçimde, biri hiç iki dilli
 *   değildi. Artık `src/lib/org.ts`'te tek yerde; başka hiçbir dosyada
 *   geçmiyor. "Mombasa" kelimesinin kendisi serbest — şehir ve mahkeme adı
 *   olarak meşru geçiyor ("ELC Mombasa", "Mombasa merkezli"); yasak olan
 *   üniversitenin ADININ ikinci bir kopyası.
 */
import { readFileSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { raiseChecks } from './raised.mjs';
import {
  strip,
  stringsIn,
  introsIn,
  emptyStatesIn,
  pageLeadIn,
  JARGON,
  CHATTY,
} from '../scripts/screen-text.mjs';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Yükselmiş tavanlar, gerekçeleriyle. Kural `tests/raised.mjs`'te, tek yerde. */
const RAISED = [
  { what: 'textChars', from: 57640, to: 58086, row: 'M1-11' },
  { what: 'emptyChars', from: 2906, to: 2978, row: 'M1-11' },
  { what: 'textChars', from: 58086, to: 58257, row: 'M13-17' },
];
process.chdir(root);

// ---------------------------------------------------------------------------
// Ölçülen tavanlar — 5 Ekim 2026, Faz 1 sonrası
// ---------------------------------------------------------------------------
//
// Bir dalga bunları düşürdüğünde burayı da düşürür. Düşmesi iş, artması
// geri alma; ikisi de görünür olsun diye sayı burada duruyor.
//
// Faz 3'te tavanlar YÜKSELDİ ve sebebi metnin büyümesi değil, ölçümün
// görmeye başlaması: `stringsIn` veri dizisi alanlarını (`titleEn: '...'`)
// hiç saymıyordu ve yalnızca `LegalAffairsView`'da 3.273 karakter o
// biçimdeydi. Uygulama genelinde 2.467 karakter kör noktadaydı. Bir tavanı
// ölçüm düzeldiği için yükseltmek geri alma değil; düzeltmeden önceki sayıyı
// korumak, körlüğü tavan olarak yazmak olurdu.
const CEILING = {
  // Faz 5: 58.388 → 57.640 ve 28.171 → 26.994. T13-07'nin jargon
  // düzeltmeleri ve T13-08'in beş uzun boş durum açıklaması.
  //
  // 8 Ekim 2026: 57.640 → 58.086. M1-11'in erişim gözden geçirme bölümü yeni
  // bir ekran ve yeni metin getiriyor. Önce kesilecek bir şey arandı ve iki
  // tane bulundu: uyuşmazlık bloğunun ikinci cümlesi başlığın altındaki
  // cümleyi tekrar ediyordu, ve boş durum açıklaması gereğinden uzundu.
  // İkisi kesildi; kalan metin kesilemez, çünkü her cümle bir durumu
  // adlandırıyor (yetki yok / kayıt yok / karar uygulanmamış) ve ikisini
  // birleştirmek bilinmeyeni bilinmiş göstermek olurdu.
  //
  // Yükseltme `RAISED` içinde M1-11 adına kayıtlı; kural `tests/raised.mjs`.
  //
  // 8 Ekim 2026, T14-04 Faz 4: 58.086 → 58.257. M13-17'nin konsol bölümü
  // (`IntakeScopeSection`) yeni bir ekran ve yeni metin. İki yönde de
  // kesildi: bölümün alt başlığının ikinci cümlesi kapatma formunun
  // söylediğini tekrar ediyordu, formun "sebebi altı ay sonra sorulur"u ise
  // zorunlu alanın kendisini tekrar ediyordu. Aynı turda gösterge
  // panelinden 190 karakter de KESİLDİ (nabız panelinin alt başlığı), yani
  // net artış bölümün kendi metni.
  // 8 EKİM 2026, ÖLÇÜM DEĞİŞİKLİĞİ: 58.257 → 63.539. Metin BÜYÜMEDİ; ölçü
  // görmeye başladı. `PAIR` deseni backtick eşleştirmiyordu, yani template
  // literal kullanan iki dilli her metin dışarıdaydı — 75 dosyada 197 çift,
  // 4.951 karakter.
  //
  // Nasıl çıktı: M7-16'nın panelinde dört uzun cümle kestim ve tavan 11
  // karakter düştü. Kesim 300 karakterdi.
  //
  // Bu `RAISED`'a GİRMİYOR ve ayrım önemli: orada ekran başına ödenen
  // bedeller duruyor. Burada ödenen bir bedel yok, görülmeyen görünür oldu —
  // `populated.mjs`'in 8 Ekim'deki toptan yeniden ölçümüyle aynı ayrım.
  // Düzeltmeden önceki sayıyı korumak, körlüğü tavan olarak yazmak olurdu.
  //
  // Bugün bu tavan iki kez M1-11 ve M13-17 adına yükseltilmişti; o
  // yükseltmeler kör bir ölçüme göre yapılmıştı ve kayıtları duruyor, çünkü
  // o turlarda ekran metni gerçekten büyüdü. Değişen şey taban.
  textChars: 63539,
  // Aynı ölçüm değişikliği: 26.994 → 27.680.
  longChars: 27680,
  // Panel gerekçesi: T13-01'in kestiği şey. 8489 → 2753 (Faz 2).
  introChars: 2753,
  longestIntro: 98,
  // T13-01'in kriteri bir tavan değil kural: hiçbir panel gerekçesi 100
  // karakteri aşmasın. Ölçülen en uzun 98 ve tavan ayrıca 98 — ikisi bir
  // arada, çünkü biri geri büyümeyi, öteki kuralın kendisini tutuyor.
  introRule: 100,

  // LegalAffairsView ayrı sayılıyor ve sebebi ölçüm değil, türü: bu
  // paragraflar panel gerekçesi DEĞİL, davanın kendi içeriği — pozisyon
  // metinleri, Yargıtay içtihat başlıkları, mahkeme kayıt notu. Dedektör
  // onları başlık altında oldukları için yakalıyor; kesilecek şey değiller.
  //
  // Tek sayıda toplanırsa iki şey birden bozulur: T13-01'in kazancı
  // davanın içeriğiyle seyrelir, ve "en uzun gerekçe" tavanı bir gerekçe
  // değil bir dava pozisyonu tarafından belirlenir. T13-04 o ekranın kendi
  // turu ve oradaki soru farklı: içerik koda gömülü, kısaltılacak değil
  // veritabanına taşınacak.
  legalIntroChars: 0,
  longestLegalIntro: 0,

  /**
   * `LegalAffairsView`'ın tamamı (T13-04). Ekranın kendi tavanı var çünkü
   * kalan iş orada: 8.452 karakter, ikinci en yoğun dosyanın dört katı. Beş
   * blok hâlâ koda gömülü — temyiz itirazları, içtihatlar, heyet
   * soru-cevapları, duruşma brifingi, ziyaret planı — ve her birinin
   * veritabanında bir evi yok, yani sıradaki faz bir migration.
   *
   * Faz 3'te 10.770 → 8.452 indi: tarihçe ve taraf listesi kayda bağlandı.
   */
  // Faz 4'te 8.452 → 2.149: kalan beş blok da kayda bağlandı (0053) ve dosya
  // 1.577 satırdan 771'e indi. `legalIntroChars` ile `longestLegalIntro` artık
  // sıfır ve bu bir tavan değil olgu: o paragraflar dava pozisyon metinleriydi
  // ve kaynaktan çıktılar. Sıfır, tavanın en güçlü hâli — ekrana bir daha
  // gömülü hukukî metin girerse test düşer.
  // Faz 5: 2.166 → 2.117 (jargon düzeltmesi).
  legalScreenChars: 2117,

  /**
   * Boş durum açıklamaları (T13-08). Bir kaydın olmaması bir hata değil ve
   * ekran bunu bir paragrafla anlatmamalı: ne girileceğini söyleyen bir cümle
   * yeter.
   *
   * ÖLÇÜM DÜZELTMESİ. Faz 5'te bu satır için bildirdiğim rakamlar — "27
   * açıklama, 2.759 → 2.308, en uzun 120, hiçbiri 120 üstü değil" — her
   * kalemde yanlıştı, çünkü elle grep'le sayılmıştı ve grep iki şeyi
   * kaçırıyordu: prettier'ın `<EmptyState`'i satır sonunda bıraktığı çok
   * prop'lu kullanımlar, ve İngilizce taraf. Ölçüm artık bu depoda bir test:
   *
   *     HEAD (Faz 5 öncesi)   32 açıklama  3.501 kar  en uzun 179  120 üstü: 11
   *     Faz 5 sonrası         32 açıklama  2.906 kar  en uzun 120  120 üstü:  0
   *
   * Tavan, bildirdiğim yanlış sayıdan (2.308) YÜKSEK ve öyle kalıyor. 2.308'i
   * tutmak körlüğü hedef olarak yazmak olurdu — aynı hatayı Faz 3'te veri
   * dizisi deseninde yaptım ve çözüm aynı: ölçüm düzeltilince tavan ölçülene
   * çekilir, ölçülen tavana değil.
   *
   * Asıl kazanç hacim değil kural: 120 karakteri aşan 11 açıklama → 0.
   * Açıklama başına 109 → 91 karakter.
   *
   * `longestEmpty` tavan değil kural: hiçbiri 120'yi aşmasın, İKİ dilde de.
   */
  // 8 Ekim 2026: 2.906 → 2.978. M1-11'in bölümü yeni bir boş durum getiriyor
  // ve o boş durum iki olgu söylüyor: herkes son altı ayda gözden geçirildi,
  // ve yaklaşan bir bitiş yok. İkisinden birini atmak listenin niçin boş
  // olduğunu yarım bırakırdı. Açıklama bir kez kısaltıldı (116 → 71 karakter)
  // ve kalan 72 karakter yükseltme olarak M1-11 adına kayıtlı.
  // Aynı ölçüm değişikliği: 2.978 → 3.046.
  emptyChars: 3046,
  longestEmpty: 120,
};

/** Davanın içeriği, panel gerekçesi değil (T13-04). */
const LEGAL_CONTENT = 'src/views/LegalAffairsView.tsx';

/** Kurumun adının ikinci kopyası (T13-05). `org.ts` tek kaynak. */
const UNIVERSITY_NAME =
  /Mombasa\s+(?:Uluslararası|International|Int\.)\s*(?:Üniv|University|Universit)/i;

/** Jargon, kategorisi başına ölçülen tavan (T13-07). */
// Faz 5: desen daraltıldı, altı yanlış pozitif gitti, bir gerçek sızıntı
// düzeltildi, ve kalan üçünün hepsi `JARGON_ALLOWED`'da gerekçeli. Üç
// kategori **sıfır**; sıfır tavanın en güçlü hâli.
const JARGON_CEILING = {
  'gereksinim kimliği': 0,
  'kolon/ortam adı': 2,
  'veritabanı terimi': 0,
  kriptografi: 1,
  'mimari terimi': 0,
};

// ---------------------------------------------------------------------------
// Ölçüm aletinin kendisi, sabit bir örnekle
// ---------------------------------------------------------------------------
//
// Bu blok ürüne bakmıyor ve bakmaması gerekiyor. Tavanlar üst sınır, yani
// körleşen bir ölçüm onları HER ZAMAN geçer: desenlerden birini kaldırınca
// sayı düşüyor ve "tavanın altında" diyor. Mutasyonla sınarken tam bu oldu —
// veri dizisi desenini iptal ettim ve on sekiz kontrolün hepsi geçti.
//
// Alt sınır koymak da çözmüyor: metin kesildikçe sayı meşru olarak düşüyor,
// yani alt sınır her dalgada elle indirilmek zorunda kalır ve indirilen bir
// alt sınır koruma değildir. Ürüne bağlı olmayan tek cevap, aletin bilinen
// bir girdide bilinen bir cevabı vermesi.

const FIXTURE = `
  const a = tr ? 'Koşullu ifadedeki Türkçe' : 'The conditional English';
  const b = language === 'tr' ? 'Eski kalıptaki Türkçe' : 'The old pattern';
  const data = [{ titleTr: 'Veri dizisindeki Türkçe', titleEn: 'In a data array' }];
  // tr ? 'Yorumdaki metin sayılmaz' : 'A comment is not screen text'
  <h2>{tr ? 'Boş durum olmayan başlık' : 'Not an empty state'}</h2>
  <EmptyState
    icon={X}
    title={tr ? 'Kayıt yok' : 'Nothing here'}
    description={tr ? 'Boş durum açıklaması' : 'The empty state description'}
  />
  <EmptyState
    icon={X}
    title={tr ? 'İngilizcesi uzun' : 'Longer in English'}
    description={tr ? 'Kısa Türkçe.' : 'A noticeably longer English side of the very same description.'}
  />
  <p>{tr ? \`Backtick ile yazılmış metin\` : \`Written with a backtick\`}</p>
  <p>{tr ? \`\${n} kayıt sayıldı\` : \`\${n} records counted\`}</p>
`;

{
  const got = stringsIn(FIXTURE);
  const trs = got.map((r) => r.tr);
  // BACKTICK, VE BU KONTROL BİR KÖR NOKTANIN ARDINDAN EKLENDİ.
  //
  // 8 Ekim 2026'ya kadar desen yalnızca `'` ve `"` eşleştiriyordu; template
  // literal kullanan iki dilli her metin ölçünün dışındaydı — 75 dosyada 197
  // çift, 4.951 karakter. Fark şöyle çıktı: bir panelde 300 karakter kestim
  // ve tavan 11 karakter düştü. Bir kesimin ölçüye yansımaması, kesimin
  // değil ölçünün kusuru.
  check(
    trs.includes('Backtick ile yazılmış metin'),
    'ölçüm backtick ile yazılmış metni görüyor',
    trs.filter((t) => t.includes('Backtick')).join(' | ') || '(görülmedi)',
  );

  // Ve `${...}` yer tutucusu metin sayılmıyor: ekranda duran şey bir değer,
  // ve uzun bir değişken adı metni uzun göstermemeli.
  check(
    trs.includes('kayıt sayıldı'),
    've `${…}` yer tutucusunu metin saymıyor',
    trs.filter((t) => t.includes('sayıldı')).join(' | ') || '(görülmedi)',
  );

  check(
    trs.includes('Koşullu ifadedeki Türkçe'),
    'ölçüm `tr ? …` kalıbını görüyor',
    trs.includes('Koşullu ifadedeki Türkçe') ? '' : JSON.stringify(trs),
  );
  check(
    trs.includes('Eski kalıptaki Türkçe'),
    "ölçüm `language === 'tr' ? …` kalıbını görüyor",
    trs.includes('Eski kalıptaki Türkçe') ? '' : JSON.stringify(trs),
  );
  check(
    trs.includes('Veri dizisindeki Türkçe'),
    'ölçüm veri dizisi alanlarını görüyor',
    trs.includes('Veri dizisindeki Türkçe') ? '' : JSON.stringify(trs),
  );
  check(
    !trs.some((t) => t.includes('Yorumdaki')),
    'ölçüm kod yorumunu ekran metni saymıyor',
    trs.filter((t) => t.includes('Yorumdaki')).join(', '),
  );

  // Boş durum ölçümü de fixture'la sınanıyor, aynı sebeple: `emptyStatesIn`
  // sessizce boş dizi döndürürse tavan kendiliğinden geçer ve T13-08'in
  // kazancı korunuyor sanılır. Bir tavan körlüğü yakalayamaz — yakalayan şey,
  // ölçümün bilinen bir girdide bilineni bulduğunu görmektir.
  const empty = emptyStatesIn(FIXTURE).map((r) => r.tr);
  check(
    empty.includes('Boş durum açıklaması'),
    'ölçüm boş durum açıklamasını görüyor',
    empty.includes('Boş durum açıklaması') ? '' : JSON.stringify(empty),
  );
  check(
    !empty.some((t) => t.includes('Boş durum olmayan')),
    'ölçüm boş durum olmayan metni boş durum saymıyor',
    empty.filter((t) => t.includes('Boş durum olmayan')).join(', '),
  );

  // Uzunluk İKİ dilin uzun olanı olmalı ve bunu bir tavan sınayamaz: daha dar
  // bir ölçüm üst sınırı her zaman geçer. (Denendi — `len`'i Türkçeye
  // indirmek 2.906'yı 2.756'ya düşürdü ve tavan memnun geçti.) Yakalayan tek
  // şey, İngilizcesi daha uzun bilinen bir girdide ölçülenin İngilizce
  // uzunluğuna eşit olduğunu görmektir.
  const rows = emptyStatesIn(FIXTURE);
  const longer = rows.find((r) => r.tr === 'Kısa Türkçe.');
  check(
    longer?.len === 'A noticeably longer English side of the very same description.'.length,
    'boş durum uzunluğu iki dilin uzun olanı',
    longer ? `ölçülen ${longer.len}, tr ${longer.tr.length}, en ${longer.en?.length}` : 'satır yok',
  );
}

// ---------------------------------------------------------------------------
// Tek iki dilli kalıp (T13-06)
// ---------------------------------------------------------------------------
//
// Ölçüm, 5 Ekim 2026: uygulamada iki kalıp birlikte yaşıyordu — `tr ? …`
// 1919 yerde, `language === 'tr' ? …` 139 yerde. İkincisi en eski iki ekranda
// yoğundu (`ProjectInfoView` 50, `LegalAffairsView` 47) ve ölçüm betiğini
// **kör** bırakmıştı: ilk sürüm yalnızca birinciyi arıyor ve 10.613 karakteri
// kaçırıyordu.
//
// İlginç olan şu: `i18n/translations.ts` uzun biçimi ev kuralı diye
// belgeliyordu ("Everywhere else the project writes its text as
// `language === 'tr' ? …`"), oysa kod 1919'a 139 kısa biçimdeydi. Belgelenen
// kural azınlıkta kalmış, yani o da eskimiş bir iddiaydı; yorum düzeltildi.
//
// Bileşenler kısa biçimde tekilleştirildi. Kalan uzun biçim kullanımları
// MEŞRU ve üç sınıfta:
//
//   1. `const tr = language === 'tr';` — kalıbın kendisi.
//
//   2. `language`'ı PARAMETRE alan yardımcılar (`lib/units.ts`, `lib/ics.ts`,
//      `lib/meetings.ts`, `lib/search.ts`, `lib/auditFile.ts`, `lib/org.ts`,
//      `context/AppContext.tsx`, `api/capture.ts`, ve `ChronologyPanel`'in
//      `whenText`'i). Orada `tr` türetmek parametreyi gölgelemek olurdu.
//
//   3. YAZMA tarafında kolon seçimi: `titleEn: language === 'en' ? … ,
//      titleTr: language === 'tr' ? …`. Bu ekran metni değil, kullanıcının
//      yazdığının hangi kolona gideceği kararı, ve `'en'` satırıyla simetrik.
//      `tr ?` yapmak onu etiket seçimi gibi okutur.
//
// Bu yüzden T13-06'nın ilk kriteri ("ölçüm tek desenle tüm metni görüyor")
// YANLIŞTI ve düzeltildi: ikinci sınıf ekran metni üretiyor, yani çıkarıcı iki
// deseni de tutmak zorunda. Tutulan kural şu: bileşen ve ekran dosyalarında
// gereksiz ikinci biçim kalmasın.

// Parametre sınıfının tek istisnası, sebebiyle. Dosya adı değil satırın kendisi
// kayıtlı: aynı dosyada ikinci bir kaçak yine düşürür.
const LONG_FORM_ALLOWED = {
  'src/components/plan/ChronologyPanel.tsx': {
    line: "language === 'tr' ? 'tr-TR' : 'en-GB'",
    reason: 'whenText(event, language) — `language` parametre, `tr` kapsamda yok',
  },
};

{
  const DECLARATION = /const tr = language === 'tr';/g;
  const TR_FIELD = /(\w+)Tr:\s*language === 'tr'/;
  const stray = [];
  for (const file of globSync('src/{components,views}/**/*.tsx').sort()) {
    const lines = strip(readFileSync(file, 'utf8')).replace(DECLARATION, '').split('\n');
    for (const [n, line] of lines.entries()) {
      if (!line.includes("language === 'tr'")) continue;

      // Yazma tarafı çifti: aynı alanın `En` kardeşi komşu satırlarda.
      // Blok-yerel olmak zorunda — dosyada bir yerde `'en'` geçiyor diye
      // geçmek, kontrolü boşa çıkarır (ilk yazımda tam bu oldu).
      const field = TR_FIELD.exec(line)?.[1];
      const near = lines.slice(Math.max(0, n - 3), n + 4).join('\n');
      if (field && near.includes(`${field}En: language === 'en'`)) continue;

      const allowed = LONG_FORM_ALLOWED[file];
      if (allowed && line.includes(allowed.line)) continue;

      stray.push(`${file}:${n + 1}`);
    }
  }
  check(
    stray.length === 0,
    'bileşenlerde gereksiz ikinci iki dilli kalıp yok (T13-06)',
    stray.length ? stray.join(', ') : `${Object.keys(LONG_FORM_ALLOWED).length} kayıtlı istisna`,
  );
}

const files = globSync('src/**/*.{ts,tsx}').sort();
check(files.length > 100, 'ekran kaynakları bulundu', `${files.length} dosya`);

let textChars = 0;
let longChars = 0;
let introChars = 0;
let longestIntro = 0;
let longestIntroAt = '';
let legalIntroChars = 0;
let longestLegalIntro = 0;
let legalScreenChars = 0;
const overRule = [];
const chatty = [];
const nameCopies = [];
const jargon = {};

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const strings = stringsIn(source);
  const fileChars = strings.reduce((a, r) => a + r.len, 0);
  textChars += fileChars;
  if (file === LEGAL_CONTENT) legalScreenChars = fileChars;
  longChars += strings.filter((r) => r.len >= 80).reduce((a, r) => a + r.len, 0);

  for (const intro of introsIn(source, strings)) {
    if (file === LEGAL_CONTENT) {
      legalIntroChars += intro.len;
      longestLegalIntro = Math.max(longestLegalIntro, intro.len);
      continue;
    }
    introChars += intro.len;
    if (intro.len > CEILING.introRule) overRule.push(`${file}:${intro.line} (${intro.len})`);
    if (intro.len > longestIntro) {
      longestIntro = intro.len;
      longestIntroAt = `${file}:${intro.line}`;
    }
  }

  for (const row of strings) {
    if (CHATTY.test(row.tr)) chatty.push(`${file}:${row.line}`);
    if (file !== 'src/lib/org.ts' && UNIVERSITY_NAME.test(row.tr)) {
      nameCopies.push(`${file}:${row.line}`);
    }
    // İKİ dil de sınanıyor. Altıncı kör nokta buydu: dedektör yalnızca
    // `row.tr`'yi okuyordu, yani İngilizce yanındaki jargonu hiç görmüyordu.
    // Türkçesinden `(M13-10)` kaldırılmış bir cümlenin İngilizcesi onu hâlâ
    // taşıyordu ve ölçüm "temiz" diyordu. Ekranda duran şey okuyanın diline
    // göre değişiyor; ölçüm değişmemeli.
    for (const [kind, pattern] of Object.entries(JARGON)) {
      if (pattern.test(row.tr) || pattern.test(row.en)) jargon[kind] = (jargon[kind] ?? 0) + 1;
    }
  }
}

// Ölçüm aletinin kendisi: sıfır dönerse testin tamamı sessizce geçer.
raiseChecks({
  raises: RAISED,
  corpus:
    readFileSync(join(root, 'docs', 'URUN-GEREKSINIMLERI.md'), 'utf8') +
    readFileSync(join(root, 'docs', 'TASARIM-GEREKSINIMLERI.md'), 'utf8'),
  knownKeys: Object.keys(CEILING),
  check,
});

check(textChars > 10000, 'ölçüm metin görüyor', `${textChars} karakter`);

check(
  textChars <= CEILING.textChars,
  'ekran metni kayıtlı tavanın altında',
  `${textChars} / ${CEILING.textChars}`,
);
check(
  longChars <= CEILING.longChars,
  '80+ karakterlik metnin hacmi kayıtlı tavanın altında',
  `${longChars} / ${CEILING.longChars}`,
);
check(
  introChars <= CEILING.introChars,
  'başlık altı tanıtım paragraflarının hacmi kayıtlı tavanın altında',
  `${introChars} / ${CEILING.introChars}`,
);
check(
  longestIntro <= CEILING.longestIntro,
  'en uzun tanıtım paragrafı kayıtlı tavanın altında',
  `${longestIntro} / ${CEILING.longestIntro}${longestIntro > CEILING.longestIntro ? `  ${longestIntroAt}` : ''}`,
);

check(
  overRule.length === 0,
  `hiçbir panel gerekçesi ${CEILING.introRule} karakteri aşmıyor`,
  overRule.join(', '),
);
check(
  legalIntroChars <= CEILING.legalIntroChars,
  'LegalAffairsView içeriğinin hacmi kayıtlı tavanın altında',
  `${legalIntroChars} / ${CEILING.legalIntroChars}`,
);
check(
  longestLegalIntro <= CEILING.longestLegalIntro,
  "LegalAffairsView'ın en uzun paragrafı kayıtlı tavanın altında",
  `${longestLegalIntro} / ${CEILING.longestLegalIntro}`,
);
check(
  legalScreenChars <= CEILING.legalScreenChars,
  "LegalAffairsView'ın toplam metni kayıtlı tavanın altında (T13-04)",
  `${legalScreenChars} / ${CEILING.legalScreenChars}`,
);

check(
  chatty.length === 0,
  'hiçbir ekran metni kullanıcıya değil yazara hitap etmiyor (T13-03)',
  chatty.length ? chatty.join(', ') : '',
);

check(
  nameCopies.length === 0,
  'kurumun adı yalnızca src/lib/org.ts içinde',
  nameCopies.length ? nameCopies.join(', ') : '',
);

for (const [kind, ceiling] of Object.entries(JARGON_CEILING)) {
  const n = jargon[kind] ?? 0;
  check(n <= ceiling, `ekranda "${kind}" kayıtlı tavanın altında`, `${n} / ${ceiling}`);
}

// Tavanda olmayan bir jargon kategorisi eklenirse sessizce geçmesin.
const unlisted = Object.keys(jargon).filter((k) => !(k in JARGON_CEILING));
check(
  unlisted.length === 0,
  'her jargon kategorisinin kayıtlı bir tavanı var',
  unlisted.join(', '),
);

// ---------------------------------------------------------------------------
// Boş durum açıklamaları (T13-08)
// ---------------------------------------------------------------------------
//
// Ölçüm, 5 Ekim 2026: 27 boş durum açıklaması, 2.759 karakter, en uzunu 198 —
// yani bir kaydın olmaması dört satırla anlatılıyordu. Kesim sonrası 2.308 ve
// en uzun 120.
{
  let emptyChars = 0;
  let longestEmpty = 0;
  let emptyCount = 0;
  const overEmpty = [];
  for (const file of globSync('src/{components,views}/**/*.tsx').sort()) {
    for (const row of emptyStatesIn(readFileSync(file, 'utf8'))) {
      emptyChars += row.len;
      emptyCount += 1;
      if (row.len > longestEmpty) longestEmpty = row.len;
      if (row.len > CEILING.longestEmpty) overEmpty.push(`${file}:${row.line} (${row.len})`);
    }
  }
  check(emptyCount > 20, 'boş durum açıklamaları bulundu', `${emptyCount} açıklama`);
  check(
    emptyChars <= CEILING.emptyChars,
    'boş durum açıklamalarının hacmi kayıtlı tavanın altında (T13-08)',
    `${emptyChars} / ${CEILING.emptyChars}`,
  );
  check(
    overEmpty.length === 0,
    `hiçbir boş durum açıklaması ${CEILING.longestEmpty} karakteri aşmıyor`,
    overEmpty.length ? overEmpty.join(', ') : `en uzun ${longestEmpty}`,
  );
}

// ---------------------------------------------------------------------------
// Ekran başlığının altı (T14-01)
// ---------------------------------------------------------------------------
//
// Ölçüm, 5 Ekim 2026: 15 ekranın 15'inde bir cümle, 1.323 karakter, en uzunu
// 208. Kesimden sonra 645 ve hiçbiri 60'ı aşmıyor — İKİ dilde de.
{
  const LEAD_RULE = 60;
  let leadChars = 0;
  let leads = 0;
  const overLead = [];
  for (const file of globSync('src/views/*.tsx').sort()) {
    const row = pageLeadIn(readFileSync(file, 'utf8'));
    if (!row) continue;
    leads += 1;
    leadChars += row.tr.length;
    const longest = Math.max(row.tr.length, row.en.length);
    if (longest > LEAD_RULE) overLead.push(`${file} (${longest})`);
  }
  check(leads >= 12, 'ekran başlığı altı cümleler bulundu', `${leads} ekran`);
  check(
    overLead.length === 0,
    `hiçbir ekran başlığının altı ${LEAD_RULE} karakteri aşmıyor (T14-01)`,
    overLead.length ? overLead.join(', ') : `${leadChars} karakter toplam`,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} screen-text check(s) failed.`);
  process.exit(1);
}
console.log('All screen-text checks passed.');
