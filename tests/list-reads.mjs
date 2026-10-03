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
// ölçümden gelir, tahminden gelmez.
const UNBOUNDED_TODAY = 124;

const unbounded = reads.filter((r) => !r.bounded);
check(
  unbounded.length === UNBOUNDED_TODAY,
  'the number of reads that fetch every row is the number this test records',
  unbounded.length === UNBOUNDED_TODAY
    ? `${unbounded.length}`
    : `${unbounded.length} now, ${UNBOUNDED_TODAY} recorded — decide whether the new read needs a bound, then move the number`,
);

console.log('');
if (failures > 0) {
  console.error(`${failures} list-read check(s) failed.`);
  process.exit(1);
}
console.log('All list-read checks passed.');
