/**
 * Nakit akışı projeksiyonu (M8-13).
 *
 * Sınanan şey toplama değil **dağıtmama**: bir projeksiyonun en sessiz
 * yanlışı, tarihi olmayan bir borcu bir aya yazmasıdır. Rakam makul görünür,
 * toplam doğrudur, ve o ayın beklenen çıkışı uydurulmuştur.
 *
 * Dört ayrı "bu aya yazılamaz" durumu var ve dördü ayrı sayılıyor, çünkü
 * biri ötekinin yerine geçmiyor:
 *
 *   vadesi geçmiş — gelecek değil, birikmiş borç
 *   tarihi kayıtlı değil — eksiklik
 *   pencerenin ötesinde — seçim; pencereyi uzatan görür
 *   durumu tanınmıyor — bir göç yeni bir değer üretmiş
 *
 * Usage: npm run test:cash-flow
 */
import { cashFlow } from '../src/lib/cashFlow.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const TODAY = '2026-06-15';
const row = (id, dueOn, state, amountKes) => ({ id, dueOn, state, amountKes });

// ---------------------------------------------------------------------------
// Tarihli taksit, ayına
// ---------------------------------------------------------------------------

{
  const out = cashFlow(
    [
      row('a', '2026-06-20', 'due', 100),
      row('b', '2026-06-28', 'planned', 50),
      row('c', '2026-07-05', 'certified', 200),
    ],
    TODAY,
    3,
  );
  check(out.months.length === 3, 'pencere istenen ay sayısında', `${out.months.length}`);
  check(out.months[0]?.key === '2026-06', 'ilk ay bu ay', out.months[0]?.key);
  check(out.months[0]?.kes === 150, 'bu ayın iki taksiti toplanıyor', `${out.months[0]?.kes}`);
  check(out.months[1]?.kes === 200, 'gelecek ay kendi taksitini alıyor', `${out.months[1]?.kes}`);
  // Boş ay satır olarak duruyor: atlanırsa okuyan bir sonraki dolu aya bakıp
  // onu bir sonraki ay sanar.
  check(
    out.months[2]?.kes === 0 && out.months[2]?.key === '2026-08',
    'boş ay yine satır',
    out.months[2]?.key,
  );
}

// ---------------------------------------------------------------------------
// Dört ayrı "bu aya yazılamaz" — bu dosyanın sebebi
// ---------------------------------------------------------------------------

{
  const out = cashFlow(
    [
      row('past', '2026-05-01', 'due', 10),
      row('undated', null, 'planned', 20),
      row('unreadable', 'not a date', 'planned', 30),
      row('beyond', '2027-01-01', 'planned', 40),
      row('drifted', '2026-07-01', 'a_state_a_later_migration_adds', 50),
      row('paid', '2026-06-20', 'paid', 60),
      row('cancelled', '2026-06-20', 'cancelled', 70),
    ],
    TODAY,
    3,
  );
  check(out.pastDue.kes === 10, 'vadesi geçmiş kendi başlığında', `${out.pastDue.kes}`);
  check(
    out.undatedInstalments.kes === 50 && out.undatedInstalments.count === 2,
    'tarihi olmayan ve okunamayan aynı başlıkta',
    `${out.undatedInstalments.kes}`,
  );
  // Pencerenin ötesi AYRI: "tarihi yok" bir eksiklik, "ötede" bir seçim.
  check(
    out.beyondTheWindow.kes === 40,
    'pencerenin ötesi ayrı sayılıyor',
    `${out.beyondTheWindow.kes}`,
  );
  check(out.unrecognised.kes === 50, 'tanınmayan durum ayrı sayılıyor', `${out.unrecognised.kes}`);
  // Ödenmiş ve iptal beklenen çıkış değil: hiçbir başlığa girmiyorlar.
  const everywhere =
    out.months.reduce((a, m) => a + m.kes, 0) +
    out.pastDue.kes +
    out.undatedInstalments.kes +
    out.beyondTheWindow.kes +
    out.unrecognised.kes;
  check(everywhere === 150, 'ödenmiş ve iptal hiçbir yere yazılmıyor', `${everywhere}`);
  check(
    out.months.every((m) => m.kes === 0),
    've hiçbiri bir aya düşmedi',
  );
}

// Onaylanmış ama ödenmemiş fişler: borç, beklenen tarihi yok. Bu dosya onu
// hesaplamıyor, çağırandan alıyor — `budget_position` zaten söylüyor ve aynı
// sayıyı iki yerde hesaplamak ikisinin ayrı düşmesine davetiyedir.
{
  const out = cashFlow([], TODAY, 2, 12_345);
  check(
    out.committedWithoutADate === 12_345,
    'taahhüt çağırandan geliyor',
    `${out.committedWithoutADate}`,
  );
  check(
    out.months.every((m) => m.kes === 0),
    've hiçbir aya dağıtılmıyor — bir projeksiyon değil kurgu olurdu',
  );
}

// KONTROL: her şey tarihliyse hiçbir başlık dolmuyor. Bu satır olmadan
// yukarıdaki assertion'lar "her zaman bir başlığa yazan" bir hesapla da
// geçerdi.
{
  const out = cashFlow([row('a', '2026-07-01', 'due', 100)], TODAY, 3);
  check(
    out.pastDue.count === 0 &&
      out.undatedInstalments.count === 0 &&
      out.beyondTheWindow.count === 0 &&
      out.unrecognised.count === 0,
    'KONTROL: tarihli ve tanınan taksit hiçbir istisna başlığına girmiyor',
  );
  check(out.months[1]?.kes === 100, 've ayına yazılıyor', `${out.months[1]?.kes}`);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} cash-flow check(s) failed.`);
  process.exit(1);
}
console.log('All cash-flow checks passed.');
