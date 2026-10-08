/**
 * Yükümlülük ısı haritası (M2-11).
 *
 * Sınanan iki şey var ve ikincisi daha önemli:
 *
 *   1. Her kayıt doğru banda düşüyor mu.
 *
 *   2. **Hiçbir kayıt uydurulmuş bir banda düşmüyor mu.** Tanınmayan bir
 *      durum ve okunamayan bir tarih için bant UYDURULMUYOR; uydurulmuş bir
 *      bant, bandı olmayandan kötüdür, çünkü doğru yerde durduğunu
 *      sandırır (CLAUDE.md §2).
 *
 * İlk hâlinde bir toplayıcı da sınanıyordu (`obligationHeat`); o fonksiyon
 * ekran ölçülünce gereksiz çıktı ve silindi — `/obligations` zaten kaynağa
 * göre bölümlenmiş, yani ikinci bir gruplamaya gerek yoktu. Testleri de
 * onunla gitti: kullanılmayan bir fonksiyonun testi, test değil ağırlık.
 *
 * Usage: npm run test:obligation-heat
 */
import { HEAT_BANDS, bandOf } from '../src/lib/obligationHeat.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const TODAY = '2026-06-15';
const row = (id, source, state, dueOn) => ({ id, source, state, dueOn });

// ---------------------------------------------------------------------------
// Bantlar
// ---------------------------------------------------------------------------

check(bandOf(row('1', 'lease', 'breached', null), TODAY) === 'breached', 'ihlâl kaydın kendi sözü');
check(bandOf(row('2', 'lease', 'at_risk', null), TODAY) === 'at_risk', 'ihlâl riski de öyle');
check(
  bandOf(row('3', 'lease', 'open', '2026-06-14'), TODAY) === 'overdue',
  'açık ve vadesi dün geçmiş: vadesi geçmiş',
);
check(
  bandOf(row('4', 'lease', 'in_progress', '2026-07-01'), TODAY) === 'soon',
  'on altı gün sonrası: otuz gün içinde',
);
check(
  bandOf(row('5', 'lease', 'open', '2026-08-01'), TODAY) === 'later',
  'kırk yedi gün sonrası: ötesinde',
);
// Sınır: tam otuz gün içeride, otuz birinci gün dışarıda. Sınırı sınamayan
// bir test, sınırın hangi yöne kaydığını söyleyemez.
check(
  bandOf(row('6', 'lease', 'open', '2026-07-15'), TODAY) === 'soon',
  'tam otuzuncu gün içeride',
);
check(
  bandOf(row('7', 'lease', 'open', '2026-07-16'), TODAY) === 'later',
  've otuz birinci gün dışarıda',
);

// VADESİ KAYITLI DEĞİL: bu bant bu dosyanın sebebi. "İleride" saymak vadesi
// varmış gibi göstermek, hiç göstermemek ise kaydı yok saymak olurdu.
check(
  bandOf(row('8', 'lease', 'open', null), TODAY) === 'undated',
  'açık ama vadesi kayıtlı değilse kendi bandında',
);
check(
  bandOf(row('9', 'lease', 'open', 'not a date'), TODAY) === 'undated',
  've okunamayan bir tarih de "ileride" sayılmıyor',
);

// Tanınmayan durum: bir göç yeni bir enum değeri ürettiyse. Uydurulmuş bir
// bant, bandı olmayandan kötüdür.
check(
  bandOf(row('10', 'lease', 'a_state_a_later_migration_adds', '2026-07-01'), TODAY) === null,
  'tanınmayan durum için bant uydurulmuyor',
);

check(HEAT_BANDS.length === 6, 'altı bant', `${HEAT_BANDS.length}`);
check(new Set(HEAT_BANDS).size === HEAT_BANDS.length, 've hiçbiri iki kez yazılmamış');

console.log('');
if (failures > 0) {
  console.error(`${failures} obligation-heat check(s) failed.`);
  process.exit(1);
}
console.log('All obligation-heat checks passed.');
