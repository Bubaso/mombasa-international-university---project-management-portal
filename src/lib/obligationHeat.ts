/**
 * Yükümlülük ısı haritası: kaynağa göre gruplu, duruma göre bantlı (M2-11).
 *
 * M2-11 "kaynağa göre gruplanmış, risk seviyesine göre renklenmiş tek ekran"
 * istiyor. Hesap burada, çünkü bir gruplama bir karar: hangi bantlar var,
 * hangi kayıt hangi banda düşer, ve **hangi kayıt hiçbir banda düşmez**.
 *
 * BU DOSYA BİR TOPLAYICI DEĞİL, BİR KURAL — ve o fark ölçülerek bulundu.
 *
 * İlk hâlinde `obligationHeat()` adında bir toplayıcı vardı: kaynak başına
 * bant sayıları, ve ayrı bir panelde bir ızgara. Yazdım, sınadım (yirmi
 * assertion, dokuz mutasyon), sonra ekranı ölçtüm — ve `/obligations`'ın
 * ZATEN kaynağa göre bölümlenmiş olduğunu gördüm: yedi kaynak, yedi bölüm.
 * Panel aynı veriyi ikinci kez gruplayacaktı, ve iki gruplamanın iki sayısı
 * her zaman birbirinden sapar (CLAUDE.md §4).
 *
 * M2-11'in gerçekten eklediği şey gruplama değil **bantlama**. Toplayıcı ve
 * testleri silindi; kalan şey `bandOf` — hangi kaydın hangi banda düştüğü,
 * tek yerde, ve ekranın her grubu onu çağırıyor.
 *
 * ALTI BANT, VE ALTINCISI BU DOSYANIN SEBEBİ:
 *
 *   `breached` ve `at_risk` kaydın kendi söylediği şey — türetilmiş değil.
 *
 *   `overdue`: açık ya da devam eden bir yükümlülüğün vadesi geçmiş. Kayıt
 *   "bitti" demiyor ve tarih geçmiş; ikisi birden bir olgu.
 *
 *   `soon`: otuz gün içinde. `later`: ötesinde.
 *
 *   **`undated`: açık, ama vadesi KAYITLI DEĞİL.** Bu bant olmadan böyle bir
 *   yükümlülük ya "ileride" sayılırdı (vadesi varmış gibi) ya da hiç
 *   görünmezdi. İkisi de bilinmeyeni bilinmiş göstermek olur: vadesi
 *   olmayan bir yükümlülük geç kalmış da olabilir ve kimse bilmiyor
 *   (CLAUDE.md §2).
 *
 * `fulfilled` ve `suspended` ısı haritasına GİRMİYOR, ama sayıları dönüyor.
 * Askıya alınmış bir yükümlülük "bitmiş" değil — mahkeme saati durdurmuş —
 * ve onu yerine getirilenlerle aynı kutuya koymak ikisini birden yanlış
 * anlatırdı.
 */

export type HeatBand = 'breached' | 'at_risk' | 'overdue' | 'soon' | 'later' | 'undated';

/** Isı haritasının bantları, en ağırdan hafife. Ekrandaki sıra bu. */
export const HEAT_BANDS: HeatBand[] = [
  'breached',
  'at_risk',
  'overdue',
  'soon',
  'later',
  'undated',
];

export interface HeatInput {
  id: string;
  source: string;
  state: string;
  dueOn: string | null;
}

/** Bandın adı ve rengi. Renk tek başına hiçbir şey söylemiyor: her yerde
 * sayı ve ad da basılı, yani renk körü biri için de basılı bir kopyada da
 * aynı bilgi okunuyor. */
export const BAND_WORDS: Record<HeatBand, { tr: string; en: string }> = {
  breached: { tr: 'ihlâl', en: 'breached' },
  at_risk: { tr: 'ihlâl riski', en: 'at risk' },
  overdue: { tr: 'vadesi geçmiş', en: 'overdue' },
  soon: { tr: '30 gün', en: '30 days' },
  later: { tr: 'ileride', en: 'later' },
  undated: { tr: 'vadesi yok', en: 'undated' },
};

export const HEAT_BAND_STYLES: Record<HeatBand, string> = {
  breached: 'border-rose-300 bg-rose-100 text-rose-900',
  at_risk: 'border-rose-200 bg-rose-50 text-rose-800',
  overdue: 'border-amber-300 bg-amber-100 text-amber-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-800',
  later: 'border-slate-200 bg-slate-50 text-slate-700',
  undated: 'border-slate-300 bg-slate-100 text-slate-800',
};

const DAY = 86_400_000;
const SOON_DAYS = 30;

/**
 * Bir yükümlülüğün bandı. Tanınmayan bir durum için null — uydurulmuş bir
 * bant, bandı olmayandan kötüdür, çünkü doğru yerde durduğunu sandırır.
 *
 * Vadesi kayıtlı olmayan ya da okunamayan bir kayıt `undated`: "ileride"
 * saymak vadesi varmış gibi göstermek olurdu, ve vadesi olmayan bir
 * yükümlülük geç kalmış da olabilir — kimse bilmiyor (CLAUDE.md §2).
 */
export function bandOf(row: HeatInput, today: string): HeatBand | null {
  if (row.state === 'breached') return 'breached';
  if (row.state === 'at_risk') return 'at_risk';
  if (row.state !== 'open' && row.state !== 'in_progress') return null;
  if (!row.dueOn) return 'undated';
  const due = Date.parse(row.dueOn);
  const now = Date.parse(today);
  if (Number.isNaN(due) || Number.isNaN(now)) return 'undated';
  if (due < now) return 'overdue';
  return due - now <= SOON_DAYS * DAY ? 'soon' : 'later';
}
