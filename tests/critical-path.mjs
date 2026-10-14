/**
 * Kritik yol hesabı (M7-16).
 *
 * Bu dosyanın sınadığı şey iki parçalı ve ikincisi daha önemli:
 *
 *   1. En uzun zincir doğru mu — daha uzun bir alternatif varken kısasını
 *      seçmiyor mu, ve zinciri sırayla veriyor mu.
 *
 *   2. **Kullanamadığını söylüyor mu.** `dependencies` kütükler arası bir
 *      tablo: bir bağımlılığın tarafı dava, yükümlülük, risk ya da çıplak bir
 *      etiket olabiliyor ve bunların süresi yok. Eksik bir ağdan çıkan
 *      zincir, tam bir zincir gibi okunur — ve bu, bilinmeyeni bilinmiş
 *      göstermenin en sessiz hâli (CLAUDE.md §2).
 *
 * Her fikstür ayırt edici olmak zorunda. Bu depoda en az üç kez bir assertion
 * doğru sebeple değil yanlış sebeple geçti; buradaki her "beklenen" değer,
 * yanlış bir hesabın VERMEYECEĞİ bir değer.
 *
 * MUTASYON HARNESS'I HAKKINDA BİR DERS. Bu dosyanın fikstürünü mutasyona
 * uğratan betiğim geri yüklemeyi `git checkout --` ile yapıyordu, ve dosya o
 * an henüz **izlenmiyordu**: geri yükleme sessizce hiçbir şey yapmadı ve
 * mutasyon (`days: 0` → `days: 1`) dosyada kaldı. `verify` bir sonraki
 * koşuda düştü ve beni o düşme kurtardı. İzlenmeyen bir dosyayı git ile
 * geri yüklemek, geri yüklediğini sanmaktır.
 *
 * Usage: npm run test:critical-path
 */
import { criticalPath, spanDays } from '../src/lib/criticalPath.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const task = (id, start, end) => ({
  id,
  kind: 'task',
  title: id,
  days: spanDays(start, end),
  start,
  end,
});
const event = (id, on) => ({ id, kind: 'milestone', title: id, days: 0, start: on, end: on });

// ---------------------------------------------------------------------------
// Süre: iki gün bir gün değil, ve tek gün sıfır değil
// ---------------------------------------------------------------------------

check(spanDays('2026-01-01', '2026-01-01') === 1, 'tek günlük bir iş bir gün sürer', '1');
check(spanDays('2026-01-01', '2026-01-10') === 10, 'on günlük bir aralık on gün', '10');
check(spanDays('2026-01-01', 'not a date') === 0, 'okunamayan tarih süre üretmiyor', '0');

// ---------------------------------------------------------------------------
// En uzun zincir, kısasını seçmeyecek şekilde
// ---------------------------------------------------------------------------
//
// a(10) → b(5) → d(1)  = 16
// a(10) → c(20) → d(1) = 31   ← beklenen
//
// Fikstür kasıtlı: iki yol aynı düğümde bitiyor, yani "son düğümü al" diyen
// bir hesap da geçerdi; ayırt eden şey TOPLAM, ve 16 ile 31 ayrı sayılar.
{
  const nodes = [
    task('a', '2026-01-01', '2026-01-10'),
    task('b', '2026-02-01', '2026-02-05'),
    task('c', '2026-03-01', '2026-03-20'),
    task('d', '2026-04-01', '2026-04-01'),
  ];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'd' },
    { from: 'a', to: 'c' },
    { from: 'c', to: 'd' },
  ];
  const out = criticalPath(nodes, edges);
  check(out.chain?.days === 31, 'en uzun zinciri seçiyor, kısasını değil', `${out.chain?.days}`);
  check(
    out.chain?.nodes.join('→') === 'a→c→d',
    've zinciri sırayla veriyor',
    out.chain?.nodes.join('→'),
  );
  check(out.cycle === null, 'döngü yokken döngü bildirmiyor');
  check(out.unused.length === 0, 'kullanılmayan bir şey yokken liste boş');
}

// ---------------------------------------------------------------------------
// Kilometre taşı sıfır süreli bir OLAY
// ---------------------------------------------------------------------------
//
// a(10) → m(0) → b(5) = 15. Kilometre taşı bir gün eklemiyor; eklerse 16
// çıkar ve bu assertion düşer.
{
  const out = criticalPath(
    [
      task('a', '2026-01-01', '2026-01-10'),
      event('m', '2026-01-11'),
      task('b', '2026-02-01', '2026-02-05'),
    ],
    [
      { from: 'a', to: 'm' },
      { from: 'm', to: 'b' },
    ],
  );
  check(out.chain?.days === 15, 'kilometre taşı zincire gün eklemiyor', `${out.chain?.days}`);
  check(out.chain?.nodes.length === 3, 've zincirde yine görünüyor', `${out.chain?.nodes.length}`);
}

// ---------------------------------------------------------------------------
// Kullanamadığını söylüyor mu — bu dosyanın asıl sorusu
// ---------------------------------------------------------------------------

{
  const out = criticalPath(
    [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-02-01', '2026-02-05')],
    [
      { from: 'a', to: 'b' },
      // Ağın dışına işaret eden bağımlılıklar: bir dava, bir etiket.
      { from: 'case-7', to: 'b' },
      { from: 'a', to: 'accreditation' },
      // Kendine bağımlılık.
      { from: 'a', to: 'a' },
    ],
  );
  const outside = out.unused.find((u) => u.reason === 'dependency_outside_the_network');
  check(outside?.count === 2, 'ağın dışındaki bağımlılıkları sayıyor', `${outside?.count}`);
  const itself = out.unused.find((u) => u.reason === 'dependency_to_itself');
  check(itself?.count === 1, 've kendine bağımlılığı ayrı sayıyor', `${itself?.count}`);
  check(out.edgeCount === 1, 've hesaba yalnız gerçekten kullanılanı katıyor', `${out.edgeCount}`);
  check(out.chain?.days === 15, 'zincir yine doğru', `${out.chain?.days}`);
}

// ---------------------------------------------------------------------------
// Döngü: tanımsız, ve "zincir yok" ile aynı cümle değil
// ---------------------------------------------------------------------------

{
  const out = criticalPath(
    [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-02-01', '2026-02-05')],
    [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  );
  check(out.chain === null, 'döngüde zincir hesaplanmıyor');
  check(out.cycle?.length === 2, 've döngüdeki düğümler adıyla bildiriliyor', `${out.cycle}`);
}

// Boş ağ: zincir null, SIFIR GÜNLÜK BİR ZİNCİR DEĞİL. Sıfır bir ölçüm
// iddiasıdır ("bir zincir var, uzunluğu sıfır"); null "zincir yok" der.
{
  const out = criticalPath([], []);
  check(out.chain === null, 'boş ağda zincir null, sıfır değil', JSON.stringify(out.chain));
  check(out.cycle === null, 've boş ağ bir döngü değil');
}

// ---------------------------------------------------------------------------
// Planın kendi çelişkisi
// ---------------------------------------------------------------------------
//
// b, a bitmeden başlıyor. Bolluk hesaplamıyoruz (plan tutarlı olmak zorunda
// değil) ama çelişkiyi bildiriyoruz: bir planın kendi içinde çelişmesi,
// bolluk rakamından daha çok işe yarar.
{
  const out = criticalPath(
    [task('a', '2026-03-01', '2026-03-20'), task('b', '2026-03-10', '2026-03-15')],
    [{ from: 'a', to: 'b' }],
  );
  check(out.conflicts.length === 1, 'bağımlı blokeyen bitmeden başlıyorsa bildiriliyor');
  check(
    out.conflicts[0]?.from === 'a' && out.conflicts[0]?.to === 'b',
    've hangi iki kayıt olduğu yazılı',
    JSON.stringify(out.conflicts[0]),
  );
}

// KONTROL: tutarlı bir plan çelişki üretmiyor. Bu satır olmadan yukarıdaki
// assertion "her zaman çelişki bildiren" bir hesapla da geçerdi.
{
  const out = criticalPath(
    [task('a', '2026-03-01', '2026-03-10'), task('b', '2026-03-11', '2026-03-15')],
    [{ from: 'a', to: 'b' }],
  );
  check(out.conflicts.length === 0, 'KONTROL: tutarlı planda çelişki bildirilmiyor');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} critical-path check(s) failed.`);
  process.exit(1);
}
console.log('All critical-path checks passed.');
