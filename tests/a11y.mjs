/**
 * Bir redd, duyulmazsa redd değildir (T9-04).
 *
 * Ölçüm, 6 Ekim 2026: on dokuz rotanın on dokuzunda `aria-live` sayısı
 * SIFIRDI. Uygulamadaki tek canlı bölge `QueryStatus`'un yükleme satırıydı
 * ve o, yükleme bitince DOM'dan kalkıyor. Yani ekran okuyucu kullanan biri
 * bir kaydı eklemeye çalıştığında ve veritabanı reddettiğinde hiçbir şey
 * duymuyordu: düğmeye basıyor, hiçbir şey olmuyor, ve sebebi ekranda yazılı
 * ama ona okunmuyor.
 *
 * Bu depo reddi kelimesi kelimesine yazmayı ilke edindi (CLAUDE.md §2:
 * bilinmeyeni ekrana çıkar). O ilkenin okuyamayan biri için de geçerli
 * olması, metni yazmaktan ayrı bir iş.
 *
 * Neden burada, tarayıcıda değil: `WriteError` yalnızca bir yazma
 * reddedildiğinde çizilir. `tests/populated.mjs` okumaları sahteleyip on
 * dokuz rotayı geziyor ama hiçbir yazma denemiyor; bir reddi orada görmek
 * için kapıya yazma yolu eklemek gerekirdi. Kuralın kendisi ise kaynakta
 * görünür: tek paylaşılan bileşen + sıfır atlatma.
 *
 * İki iddia var ve ikisi birlikte kuralı kuruyor. Yalnızca birincisi
 * yazılsa, yarın bir ekran reddi kendi `<p>`'sinde basar ve kapı geçer.
 */
import { readFileSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// Canlı bölgeye sahip olması GEREKEN dosyalar: reddi ya da durumu kendisi
// yazanlar. Dördü de ölçülerek bulundu, elle seçilmedi.
/**
 * Canlı bir rolün imzası — ve baştaki `[\s{]` tam olarak bir mutasyon
 * yüzünden orada.
 *
 * İlk yazımda desen `/role="(alert|status)"/` idi. `role="status"`'ü
 * `data-role="status"`'e çevirerek sınadım: rol gitmişti ama kontrol
 * GEÇİYORDU, çünkü `data-role="status"` metninin içinde `role="status"`
 * dizgesi aynen duruyor. Düşmeyen bir mutasyon, testin kendisinin kusuru.
 */
const LIVE = /[\s{](?:role="(?:alert|status)"|aria-live=)/;

const SPEAKERS = [
  'src/components/ui/Controls.tsx', // WriteError — yazma reddi
  'src/components/QueryStatus.tsx', // okuma hatası ve yükleme
  'src/components/SignInPage.tsx', // girişin reddi
  'src/components/ErrorBoundary.tsx', // çöken ekran
];

// ---------------------------------------------------------------------------
// 1. Paylaşılan redd bileşeni canlı bir rol taşıyor
// ---------------------------------------------------------------------------
{
  const source = readFileSync('src/components/ui/Controls.tsx', 'utf8');
  const at = source.indexOf('export const WriteError');
  check(at !== -1, 'WriteError hâlâ bu dosyada', at === -1 ? 'bulunamadı' : '');
  const body = source.slice(at, at + 600);
  check(
    LIVE.test(body),
    'WriteError canlı bir rol taşıyor (T9-04)',
    /role="alert"/.test(body) ? 'role="alert"' : 'aria-live',
  );
}

// ---------------------------------------------------------------------------
// 2. Hiçbir ekran reddi kendisi basmıyor
// ---------------------------------------------------------------------------
//
// `\.message` tam olarak eşleşiyor: `t.messages` bir sayı, `answer.messageTr`
// bir cevap metni. İlk yazımda sınır konmamıştı ve ikisi de kusur gibi
// göründü — eşleşmenin kendisi değil, sınırı önemliydi.
{
  const DIRECT = /\{[^{}]*\.message([^A-Za-z]|$)/;
  const bypasses = [];
  let scanned = 0;
  for (const file of globSync('src/{views,components}/**/*.tsx').sort()) {
    if (SPEAKERS.includes(file)) continue;
    scanned += 1;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (DIRECT.test(line)) bypasses.push(`${file}:${i + 1}`);
    });
  }
  check(scanned > 100, 'tarama dosyaları gördü', `${scanned} dosya`);
  check(
    bypasses.length === 0,
    'hiçbir ekran reddi paylaşılan bileşenin dışında basmıyor (T9-04)',
    bypasses.slice(0, 8).join(', '),
  );
}

// ---------------------------------------------------------------------------
// 3. Körlük koruması: tek satırın gerçekten her yeri kapsadığı
// ---------------------------------------------------------------------------
//
// Yukarıdaki iki kontrol, `WriteError` kullanılmıyor olsa da geçerdi. Bir
// bileşen yeniden adlandırılır, çağrı yerleri başka bir şeye geçer ve kural
// sessizce boşa düşer. Bu depoda tam bu oldu: sekme gezgini on yedi sekmenin
// yedisini açıyordu ve "bulunanların hepsi açıldı" kontrolü geçiyordu.
//
// Ölçülen: 64 dosya `<WriteError` ÇİZİYOR. `WriteError` kelimesi 65 dosyada
// geçiyor; aradaki fark bileşeni tanımlayan `Controls.tsx`'in kendisi — ve
// tam bu yüzden sayılan şey çağrı, geçiş değil.
{
  const FLOOR = 50;
  const users = globSync('src/{views,components}/**/*.tsx').filter((f) =>
    readFileSync(f, 'utf8').includes('<WriteError'),
  );
  check(
    users.length >= FLOOR,
    'redd bileşeni ekranların çoğunda gerçekten çağrılıyor',
    `${users.length} dosya / en az ${FLOOR}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Durumu yazan diğer üç dosya da canlı bölgesini koruyor
// ---------------------------------------------------------------------------
for (const file of SPEAKERS) {
  const source = readFileSync(file, 'utf8');
  check(LIVE.test(source), `${file.replace('src/components/', '')} canlı bölgesini koruyor`);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} a11y check(s) failed.`);
  process.exit(1);
}
console.log('All a11y checks passed.');
