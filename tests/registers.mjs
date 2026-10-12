/**
 * Kütük kolonları: telefon kartında en çok dört ALAN (T5-02).
 *
 * NEDEN KAYNAKTAN, ÇALIŞMA ZAMANINDAN DEĞİL. Bu kriteri önce tarayıcıda
 * ölçtüm (`tests/populated.mjs`, 390px) ve ölçüm iki kütük buldu. Kaynağı
 * taradığımda on bir çıktı: aradaki dokuzu bir SEKMENİN arkasındaydı ve
 * telefon turu sekmelere dokunmuyor. Bir ölçü yalnızca render edileni görür;
 * kaynak taraması hepsini görür.
 *
 * Kalan yarı — kart yüksekliği ≤140px — çalışma zamanında ölçülüyor ve orada
 * kalmak zorunda: bir yüksekliği kaynaktan okumak mümkün değil. İki kapı
 * birlikte kriterin iki yarısını tutuyor.
 *
 * ALAN NE DEMEK, VE KRİTERDE YAPTIĞIM DEĞİŞİKLİĞİ AÇIKÇA SÖYLÜYORUM.
 * Kriter "en çok 4 alan: ne, kim, ne zaman, durum" diyor. Kütüklerin
 * çoğunda beşinci kolon bir EYLEM kolonu: başlığı boş ya da "İşlem", içinde
 * bir düğme var. O bir alan değil bir kontrol, ve onu alan saymak kriteri
 * dört VERİ alanından üçe indirirdi — kriterin söylemediği bir şey. O yüzden
 * sayım veri kolonlarını sayıyor, ve eylem kolonunun SON kolon olması ayrıca
 * sınanıyor (ortada duran bir düğme kolonu, kartta veriyi ikiye böler).
 *
 * Usage: npm run test:registers
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Her `.tsx` dosyası. */
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith('.tsx')) files.push(path);
  }
};
walk(join(root, 'src'));
check(files.length > 100, 'tarama dosyaları gördü', `${files.length} dosya`);

/**
 * `<TableFrame`'in `head={…}` bloğu, PARANTEZ EŞLEYEREK.
 *
 * İlk yazışımda `<TableFrame[\s\S]{0,2500}?</TableFrame>` deseniyle
 * arıyordum ve on altı kütüğün ALTISINI buldu: gövdeler 2500 karakterden
 * uzun, yani çoğu eşleşmedi ve kapı "aşan yok" dedi. Hiçbir şey bulamayan
 * bir ölçü, geçmiş gibi görünür — bu oturumda beşinci kez.
 */
function headsIn(source) {
  const heads = [];
  let i = -1;
  while ((i = source.indexOf('<TableFrame', i + 1)) !== -1) {
    const open = source.indexOf('head={', i);
    if (open === -1 || open > source.indexOf('>', i) + 4000) {
      heads.push(null);
      continue;
    }
    let depth = 0;
    let j = open + 5;
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    heads.push(source.slice(open, j + 1));
  }
  return heads;
}

/**
 * Bir eylem kolonu: başlığı BOŞ, ya da yetkiye bağlı olarak boşalabilen bir
 * koşullu.
 *
 * İLK YAZIŞIMDA "İşlem"/"Action" KELİMESİNE BAKIYORDUM ve yanlış pozitif
 * verdi: `AuditSection`'ın "İşlem" kolonu denetim kütüğünün kaydettiği
 * FİİL — insert, update, delete — yani bir veri alanı, bir düğme değil.
 * Kelime ikisini ayırmıyor.
 *
 * Ayıran şey KOŞULLULUK: bir kontrol kolonunun başlığı yetkiye bağlı
 * (`{canManage ? 'İşlem' : ''}`) ya da hiç yok (`<Th />`), çünkü yetkisi
 * olmayan için o kolonda bir şey yok. Bir veri kolonunun başlığı koşulsuz
 * durur — veri herkese aynı veridir.
 */
const isAction = (th) =>
  /^<Th[^>]*\/>$/.test(th) || /^<Th[^>]*>\s*<\/Th>$/.test(th) || /\?[\s\S]*:\s*''/.test(th);

let registers = 0;
const tooMany = [];
const actionNotLast = [];
const unreadable = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const head of headsIn(source)) {
    registers++;
    if (head === null) {
      unreadable.push(file);
      continue;
    }
    // KENDİ KENDİNİ KAPATAN `<Th />` ALTERNATİFİ ÖNDE, ve sırası bir
    // kusurdan sonra yazıldı. Önce `<Th[^>]*>[\s\S]*?<\/Th>` yazıyordum ve
    // o desen `<Th />`'yi de "açılış etiketi" sayıp bir SONRAKİ kolonun
    // `</Th>`'sine kadar yutuyordu: iki kolon tek eşleşme oluyor, sayım bir
    // eksik çıkıyor, ve eylem kolonunun kaçıncı sırada olduğu kayıyordu.
    //
    // Kusur mutasyonla çıktı: eylem kolonunu başa aldım, kapı düşmedi.
    // Orijinal dizilimde `<Th />` SON kolon olduğu için ilk alternatif
    // eşleşmiyordu (ardında `</Th>` yok) ve ölçüm tesadüfen doğruydu —
    // sayının doğru olması, ölçünün doğru olduğunu göstermiyor.
    const ths = head.match(/<Th[^>]*\/>|<Th[^>]*>[\s\S]*?<\/Th>/g) ?? [];
    if (ths.length === 0) {
      unreadable.push(file);
      continue;
    }
    const where = file.replace(`${root}/`, '');
    const actions = ths.filter(isAction);
    const data = ths.length - actions.length;
    if (data > 4) tooMany.push(`${where} (${data} veri, ${ths.length} kolon)`);
    // Eylem kolonu sonda olmalı: ortada duran bir düğme kolonu kartta
    // veriyi ikiye böler.
    for (let k = 0; k < ths.length - 1; k++) {
      if (isAction(ths[k])) actionNotLast.push(`${where} (${k + 1}. kolon)`);
    }
  }
}

// TABAN: seçici bir gün eşleşmez olursa "aşan yok" kendiliğinden geçer.
check(registers >= 16, 'her kütük bulundu', `${registers} kütük`);
check(
  unreadable.length === 0,
  've her birinin başlığı okunabildi — okunamayan bir başlık ölçülmemiş başlıktır',
  unreadable.join(', ') || '',
);
check(
  tooMany.length === 0,
  'T5-02 hiçbir kütük telefon kartına dörtten fazla veri alanı koymuyor',
  tooMany.join(' · ') || `${registers} kütüğün hepsi ≤4`,
);
check(
  actionNotLast.length === 0,
  've eylem kolonu her zaman sonda — ortada duran bir düğme kartı ikiye böler',
  actionNotLast.join(' · ') || 'hepsi sonda',
);

console.log('');
if (failures) {
  console.log(`${failures} register check(s) failed.`);
  process.exit(1);
}
console.log('All register checks passed.');
