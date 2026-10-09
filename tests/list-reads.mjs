/**
 * Bir liste sessizce kesiyor mu?
 *
 * Kütük turunun ikinci sorusu. İki kusur var ve ikisi aynı şeyin iki yüzü:
 *
 *   **Sessizce kesmek.** Kırk bildirim çekip dört yüz tane olduğunu
 *   söylememek. Okuyan her şeyi gördüğünü sanıyor, ve bu bilinmeyeni bilinmiş
 *   gibi göstermenin en sessiz hâli (CLAUDE.md §2). Asistan sayfasının
 *   kusurunun yarısı buydu.
 *
 *   **Hiç kesmemek.** Her satırı çekmek. Bugün zararsız — en büyük kütük 134
 *   satır — ama beş yıllık bir projede toplantı notları, yazışmalar ve malî
 *   hareketler bugünkü sayılarında kalmıyor.
 *
 * Bu dosya birinciyi yasaklıyor: **sınır koyan her okuma toplamı da
 * istemek zorunda** (`count: 'exact'`), ve döndürdüğü şey `Page<T>` oluyor.
 * İkinciyi yasaklamıyor, sayıyor: kaç okumanın sınırsız olduğu burada yazılı,
 * ve yeni bir okuma eklenince sayı değişiyor — yani her yeni okumada "buna
 * sınır gerekiyor mu?" sorusuna cevap vermek gerekiyor.
 *
 * Usage: npm run test:list-reads
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'src', 'api');

/**
 * Okuma fonksiyonlarını gövdeleriyle çıkar.
 *
 * İlk hâli `.from('x') … ;` zincirini arıyordu ve `fetchQueue`'yu kaçırdı:
 * sorgu birkaç deyime bölünmüş (`let query = …` sonra `query = query.ilike`).
 * Sayıyı yanlış veren bir ölçüm, ölçüm olmamasından kötüdür — fonksiyon
 * gövdesine bakılıyor.
 */
const reads = [];
for (const file of readdirSync(apiDir).filter((f) => f.endsWith('.ts'))) {
  const text = readFileSync(join(apiDir, file), 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const signature = /^export (?:async )?function (\w+)/.exec(lines[i]);
    if (!signature) continue;
    const body = [];
    for (let j = i; j < lines.length; j++) {
      body.push(lines[j]);
      if (j > i && lines[j] === '}') break;
    }
    const text_body = body.join('\n');
    if (!text_body.includes('.select(')) continue;
    if (!/\.from\('[a-z0-9_]+'\)/.test(text_body)) continue;
    if (/\.(insert|update|upsert|delete)\(/.test(text_body)) continue;
    reads.push({
      file,
      line: i + 1,
      name: signature[1],
      relations: [
        ...new Set([...text_body.matchAll(/\.from\('([a-z0-9_]+)'\)/g)].map((m) => m[1])),
      ],
      bounded: text_body.includes('.limit(') || text_body.includes('.range('),
      counted: text_body.includes("count: 'exact'"),
      paged: /Promise<Page</.test(text_body),
      // Yalnız sayan okuma: `head: true` ile satır çekilmiyor. Böyle bir
      // okumaya sınır sormak anlamsız — zaten hiçbir satır taşımıyor.
      headOnly: text_body.includes('head: true') && !/\.select\((?![^)]*head)/.test(text_body),
    });
  }
}

check(reads.length > 120, 'the api layer parses into its read functions', `${reads.length}`);

// ---------------------------------------- sınır koyan okuma toplamı da istiyor
//
// Ölçüm, 3 Ekim 2026: on okumadan dokuzu kesiyor ve toplamı söylemiyordu —
// denetim kütüğü, yapay zekâ sorguları, bildirim kutusu, belge erişim kütüğü,
// kurul oturumları, kronoloji, kritik tarih şeridi, devriye kütüğü, olay
// kütüğü. Dokuzu da bu turda çevrildi.

const bounded = reads.filter((r) => r.bounded);
check(
  bounded.length >= 10,
  'some reads ask for a slice rather than everything',
  `${bounded.length}`,
);

for (const read of bounded) {
  check(
    read.counted,
    `${read.file}:${read.line} ${read.name} asks for the total it is cutting against`,
    read.counted ? '' : 'it slices with no exact count, so the screen cannot say what it hid',
  );
  check(read.paged, `and ${read.name} hands back a Page<T>, so the screen is given the total`);
}

// ------------------------------------------------- sınırsız okumaların sayısı
//
// Bu sayı bir hedef değil, bir muhasebe. Değiştiğinde yeni okumanın sınıra
// ihtiyacı olup olmadığına karar verilmiş olması gerekiyor; karar vermemek
// için testi güncellemek mümkün ama o zaman kararı birisi **vermiş** olur,
// ki bu sessizce olmasından iyidir (0047'nin dersi).

// Ölçüm, 3 Ekim 2026. İlk yazdığımda 125 demiştim ve ölçüm 124 dedi; sayı
// ölçümden gelir, tahminden gelmez. İkinci partiden sonra 118: sekiz okuma
// dilime çevrildi, iki tanesi de yeni eklendi (`fetchDocumentOptions`,
// `fetchTransactionOptions`) — ikisi kasıtlı olarak sınırsız, çünkü bir
// **seçici** kesilemez: var olan bir kaydı seçilemez kılmak, listeyi
// kesmekten kötüdür.
// İkinci partiden sonra 120. Yol: 124 → sekiz okuma dilime çevrildi (116) →
// dört yeni okuma satır çekiyor ve kasıtlı olarak sınırsız: iki seçici
// (`fetchDocumentOptions`, `fetchTransactionOptions` — kesilmiş bir seçici,
// var olan bir kaydı seçilemez kılar), bir toplam (`fetchLedgerGaps`'in
// denetlenmiş tutarı — bir toplam bütün değerleri ister) ve bir bütünlük
// sayımı (`countUndigestedDocuments` — birleştirmeyi doğrulayamadığım için iki
// ucuz okuma). Dördünün gerekçesi kendi dosyasında yazılı.
// Dördüncü dalgadan sonra 121: `fetchProvenanceOfRecords` eklendi ve sınır
// koymuyor, ama **koymasına gerek yok** — `.in('record_id', ids)` ile
// çağıranın verdiği kimliklerle sınırlı, yani ekranın dilimden fazla satır
// döndürmesi imkânsız. Sınır çağıranın dilimi.
//
// T13 Faz 3'ten sonra 122: `fetchCaseParties` eklendi ve kasıtlı olarak
// sınırsız. Taraf listesi bir dilim olamaz, çünkü listenin kendisi "bu
// davanın tarafları kim" sorusunun cevabı: dokuz tarafın dördünü gösteren bir
// liste, dört taraf varmış gibi okunur. Kesilmiş bir **liste** dürüst olabilir
// ("412 kayıttan 40 tanesi"); kesilmiş bir **küme** olamaz. Bir davanın
// tarafları bir elin parmakları kadar ve `legal_case_id` ile zaten tek davaya
// bağlı, yani okuma kütüğün tamamını değil bir davayı çekiyor.
//
// T13 Faz 4'ten sonra 126: brifingin üç listesi ve itirazlar eklendi
// (`fetchAppealGrounds`, `fetchLegalAuthorities`, `fetchBenchQuestions`,
// `fetchDefencePillars`), dördü de kasıtlı olarak sınırsız ve sebebi
// `fetchCaseParties` ile aynı — bunlar dilim değil **küme**:
//
//   Dokuz itirazın dördünü gösteren bir liste, dört itiraz varmış gibi okunur,
//   ve temyiz dilekçesinde kaç itiraz olduğu mahkeme kaydındaki bir olgu.
//
//   Kesilmiş bir içtihat kütüphanesi, görmediğiniz aleyhe kararı duruşmada
//   gösterir. Kesilmiş bir hazırlık listesi, sorulan soruyu saklar. Kesilmiş
//   bir savunma, delikli bir savunmadır.
//
// Dördü de `legal_case_id` ile tek dosyaya bağlı, yani okuma kütüğün tamamını
// değil bir davayı çekiyor.
//
// M5-09'dan sonra 127: `fetchCaseSpend` eklendi. Bu okuma **bir liste değil**,
// bir dava için tek satır: `.eq('legal_case_id', caseId).maybeSingle()`.
// Sınır koymanın anlamı yok, çünkü kesilebilecek bir şey yok — birden fazla
// satır dönerse `maybeSingle()` hata verir, yani sessizce kesmek bu okumanın
// yapabileceği bir şey değil.
//
// M1-11'den sonra 128: `fetchAccessReviewQueue` eklendi ve kasıtlı olarak
// sınırsız. Gerekçe `fetchCaseParties` ile aynı — bu bir dilim değil bir
// **küme**: "bu kişiler hâlâ erişmeli mi" sorusunun cevabı listenin tamamı,
// ve kırk kişinin onunu gösteren bir liste on kişi varmış gibi okunur.
// Gözden geçirilmeyen otuzu görünmediği için gözden geçirilmemiş kalır, ki
// listenin var olma sebebi tam olarak o.
//
// Görünümün kendisi `app.can_audit_people()` ile sınırlı, yani okuma bir
// kütüğü değil portaldaki insanları çekiyor; bugün on dört satır.
//
// M13-17'den sonra 129: `fetchIntakeTargets` eklendi ve sınırsız. Yirmi üç
// satır, ve listenin tamamı cevabın kendisi: kesilmiş bir kapsam, kapsamı
// yanlış göstermek olur. "Asistan şu on türe teklif verebilir" diyen bir
// ekran, aslında yirmi üç tür varken, okuyana yanlış bir sınır öğretir.
//
// M7-16'dan sonra 130: `fetchPlanNetwork` eklendi ve sınırsız. Kritik yol bir
// AĞ ve ağın bir dilimi ağ değil: eksik bir düğüm, eksik bir zincir demek, ve
// kesilmiş bir ağdan çıkan "en uzun yol" tam bir yol gibi okunur. Bu, kesik
// bir listenin toplamını göstermekten daha sessiz bir yanlış — sayı makul
// görünür.
//
// Ayrıştırıcı bu fonksiyonu tek okuma sayıyor, oysa içinde üç sorgu var
// (işler, kilometre taşları, bağımlılıklar). Üçü bir arada bir ağ kurduğu
// için tek fonksiyonda duruyorlar; üçünü ayrı okuyup ekranda birleştirmek,
// ağın şeklini ekrana kurdurmak olurdu.
//
// M8-13'ten sonra 131: `fetchAllContractMilestones` eklendi ve sınırsız.
// Nakit akışı projeksiyonu bir TOPLAM, ve kesilmiş bir listeden çıkan toplam
// projeksiyonu olduğundan HAFİF gösterir — bir eksik taksit bir eksik ay
// demek, ve eksikliği okuyan göremez çünkü rakam makul görünür. Kesilmiş bir
// liste ("412 kayıttan 40 tanesi") dürüst olabilir; kesilmiş bir TOPLAM
// olamaz.
//
// Okuma dört kolon çekiyor (kimlik, vade, durum, tutar): projeksiyonun
// ihtiyacı o kadar, ve sözleşme başına okumanın kolonlarını yeniden
// kullanmak çekilen veriyi üçe katlardı.
// M4-10'dan sonra 132: `fetchSpokenToIds` eklendi ve sınırsız. Burada
// sınır KOYMAK yanlış olurdu, ve sebebi öbürlerinden farklı: dönen şey bir
// KÜME, bir dilim değil — "hangi paydaşlarla görüşme kaydımız var". Eksik bir
// başlangıç noktası, var olan bir yolun hiç görünmemesi demek, yani ekran
// "kayıtlı yol yok" derken kayıt duruyor olur. Kesik bir liste kendini
// söyleyebilir; eksik bir küme, yokluğu kanıt gibi gösterir.
//
// Okuma tek kolon çekiyor (`stakeholder_id`) ve kümeyi istemcide
// tekilleştiriyor. Doğru yeri sunucu: `distinct` bir görünüm ya da bir
// fonksiyon, yani bir göç — ve bugün üç göç uygulanmayı bekliyor, o yüzden
// burada duruyor. Bunu yazıyorum ki "neden istemcide" sorusunun cevabı
// kaybolmasın: ölçüm 134 paydaş ve bugünkü görüşme kütüğü için ucuz, beş
// yıllık bir kütük için değil.
// M9-11 ve M9-13'ten sonra 135: üç okuma eklendi ve üçü de sınırsız, ama
// sebepleri AYNI DEĞİL ve üçünü ayrı yazmak gerekiyor.
//
// `fetchHolds` bir belgenin muhafaza kayıtları. Kaç tane olabilir: bir
// belgeye konulup kaldırılmış muhafazaların tamamı, yani on yıllık bir
// dosyada belki beş. Sınır koymak sayıyı okunur yapmaz, kodu uzatır.
//
// `fetchRetentionPolicies` kategori başına BİR satır, ve kategori sayısı
// şemadaki enum'un boyu — dokuz. Bir enum'u sayfalamak, sayfalamanın ne
// olduğunu anlamamaktır.
//
// `fetchRetentionDue` her belge için bir satır, yani kütük kadar. Burada
// sınır koymak YANLIŞ olurdu ve sebebi M4-10'daki kümeyle aynı değil: bu
// liste "hangi belgenin süresi doldu" sorusunun cevabı, ve kesilmiş bir
// cevap kalan belgeleri kimsenin bakmadığı yerde bırakır — süresi dolmuş
// bir belge görünmediği için arşivlenmez, ve görünmediği de görünmez.
// Doğru yeri durum bazlı bir süzgeç (sunucuda), ama o bir göç; bugün üç
// göç uygulanmayı bekliyor.
const UNBOUNDED_TODAY = 135;

// Sayan okumalar sayılmıyor: sorumuz "kaç okuma her satırı çekiyor", ve
// `head: true` olan hiç satır çekmiyor.
const unbounded = reads.filter((r) => !r.bounded && !r.headOnly);
check(
  unbounded.length === UNBOUNDED_TODAY,
  'the number of reads that fetch every row is the number this test records',
  unbounded.length === UNBOUNDED_TODAY
    ? `${unbounded.length}`
    : `${unbounded.length} now, ${UNBOUNDED_TODAY} recorded — decide whether the new read needs a bound, then move the number`,
);

// ------------------------------------------- dilimin içinden sayan yer yok
//
// Bu turun kendi hatası, ve bedeli en pahalı olanı: bir okumayı dilime
// çevirmek, o dilim üzerinde **sayan** her yeri sessizce yanlış yapıyor.
// İkinci partide yedi yerde oldu — kasa defterinde belgesiz hareket sayısı,
// panoda denetim kuyruğu ve **denetlenmiş toplam** (bir para rakamı),
// bildirim kutusunda okunmamış sayısı, yazışmada teyit edilmemiş giden,
// kronolojide belgesiz kayıt, kasada özeti olmayan belge.
//
// Kesilmiş bir **liste** dürüst olabilir: "412 kayıttan 40 tanesi" doğru bir
// cümle. Kesilmiş bir **sayı** olamaz, çünkü kendisinin kesildiğini
// söylemiyor — ve küçük, kesin, yetkili görünür. Bir para toplamında bu,
// listeyi kesmekten kötüdür (CLAUDE.md §2).
//
// Kural: bir ekran `X.data?.rows` üzerinde sayı türetmiyor. Saymak isteyen
// sunucudan sayı ister (`head: true`), ya da toplamı okur.

const screens = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx$/.test(entry.name)) screens.push(path);
  }
};
walk(join(root, 'src'));
check(screens.length > 90, 'the screens are there to read', `${screens.length}`);

/** `rows` adlı bir dilimden türetilmiş sayı. İki satıra sarılmış olabilir. */
const COUNTS_A_SLICE =
  /(\w+)\.data\?\.rows\s*\?\?\s*\[\]\s*\)?\s*\.(?:filter|reduce)\([\s\S]{0,200}?\)\s*(?:\.length|,\s*0\s*\))/;

let counted = 0;
for (const file of screens) {
  const text = readFileSync(file, 'utf8');
  const m = COUNTS_A_SLICE.exec(text);
  if (!m) continue;
  counted++;
  const line = text.slice(0, m.index).split('\n').length;
  check(
    false,
    `${file.slice(file.indexOf('src/'))}:${line} does not count inside a slice`,
    'it derives a number from the rows it happened to fetch — ask the server for the count',
  );
}
check(counted === 0, 'no screen derives a number from the slice it fetched', `${counted} did`);

console.log('');
if (failures > 0) {
  console.error(`${failures} list-read check(s) failed.`);
  process.exit(1);
}
console.log('All list-read checks passed.');
