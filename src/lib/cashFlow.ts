/**
 * Nakit akışı projeksiyonu (M8-13).
 *
 * M8-13 üç girdi sayıyor: "taahhütler, hakediş planı, hukuk harcaması". Bu
 * dosyanın asıl işi onları toplamak değil, **tarihi olmayanı bir aya
 * yazmamak**.
 *
 * Bir projeksiyon tarih ister. Portalda tarihli olan tek ödeme yükümlülüğü
 * `contract_milestones.due_on`: sözleşmenin hakediş planı. Onaylanmış ama
 * ödenmemiş bir ödeme fişi (taahhüt) bir **borç**tur, ama beklenen ödeme
 * tarihi kayıtlı değil — ve bir hukuk vekâlet ücretinin hiç kilometre taşı
 * olmaz (0022'nin yorumu bunu söylüyor: "a legal retainer has neither").
 *
 * Yani üç girdinin ikisi tarihsiz. Onları aylara dağıtmak — eşit bölmek,
 * "ortalama ödeme süresi" uydurmak, ya da sessizce bu aya yazmak — bir
 * projeksiyon değil bir kurgu üretir. Burada yapılan şey: tarihlisi aylara,
 * tarihsizi kendi başlığına, ve vadesi geçmişi üçüncü bir başlığa.
 *
 * VADESİ GEÇMİŞ GELECEK DEĞİL. Vadesi dün olan ve ödenmemiş bir taksit,
 * bu ayın beklenen çıkışı değil: zaten gecikmiş bir borç. Gelecek bir aya
 * yazmak projeksiyonu olduğundan hafif gösterir, bu aya yazmak ise
 * gecikmeyi saklar.
 */

export type MilestoneLike = {
  id: string;
  dueOn: string | null;
  state: string;
  amountKes: number;
};

export interface Month {
  /** `2026-07` — ayın kendisi, bir etiket değil bir anahtar. */
  key: string;
  kes: number;
  count: number;
}

export interface CashFlow {
  months: Month[];
  /** Vadesi geçmiş ve hâlâ ödenmemiş: gelecek değil, birikmiş borç. */
  pastDue: { kes: number; count: number };
  /** Ödenecek ama tarihi kayıtlı olmayan taksit. */
  undatedInstalments: { kes: number; count: number };
  /**
   * Onaylanmış ama ödenmemiş fişler: borç, beklenen tarihi yok. Çağıran
   * veriyor, çünkü bu sayı `budget_position`'dan geliyor ve bu dosya onu
   * yeniden hesaplamıyor (CLAUDE.md §4).
   */
  committedWithoutADate: number;
  /**
   * Tarihi var ama baktığımız aralığın ötesinde. `undatedInstalments` ile
   * AYNI KUTUYA KONMUYOR: ilk yazışımda koymuştum ve kendi yorumum ikisinin
   * aynı şey olmadığını söylüyordu. "Tarihi yok" bir eksiklik, "pencerenin
   * ötesinde" bir seçim — pencereyi uzatan görür.
   */
  beyondTheWindow: { kes: number; count: number };
  /** Durumu tanınmayan taksit: bir göç yeni bir değer ürettiyse. */
  unrecognised: { kes: number; count: number };
}

/** Beklenen çıkış sayılan durumlar. Ödenmiş ve iptal, beklenen çıkış değil. */
const AWAITING = new Set(['planned', 'due', 'certified']);
const SETTLED = new Set(['paid', 'cancelled']);

const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * `months` kaç ay ileri bakılacağı. Aralıktaki her ay, çıkışı sıfır olsa da
 * satır olarak dönüyor: boş bir ay gerçek bir ölçüm ("o ay için planlanmış
 * taksit yok") ve atlanırsa okuyan bir sonraki dolu aya bakıp onu bir
 * sonraki ay sanar.
 */
export function cashFlow(
  instalments: MilestoneLike[],
  today: string,
  months: number,
  committedWithoutADate = 0,
): CashFlow {
  const now = Date.parse(today);
  const start = new Date(today.slice(0, 7) + '-01T00:00:00Z');

  const buckets = new Map<string, Month>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    const key = d.toISOString().slice(0, 7);
    buckets.set(key, { key, kes: 0, count: 0 });
  }

  const pastDue = { kes: 0, count: 0 };
  const undated = { kes: 0, count: 0 };
  const beyond = { kes: 0, count: 0 };
  const unrecognised = { kes: 0, count: 0 };

  for (const row of instalments) {
    if (SETTLED.has(row.state)) continue;
    if (!AWAITING.has(row.state)) {
      unrecognised.kes += row.amountKes;
      unrecognised.count++;
      continue;
    }
    if (!row.dueOn) {
      undated.kes += row.amountKes;
      undated.count++;
      continue;
    }
    const due = Date.parse(row.dueOn);
    if (Number.isNaN(due)) {
      undated.kes += row.amountKes;
      undated.count++;
      continue;
    }
    if (due < now) {
      pastDue.kes += row.amountKes;
      pastDue.count++;
      continue;
    }
    const bucket = buckets.get(monthKey(row.dueOn));
    if (!bucket) {
      // Pencerenin ötesi, kendi başlığında. Sessizce atmak bir toplamı
      // eksik gösterirdi; `undated`'a yazmak ise tarihi olan bir taksiti
      // tarihsiz saymak olurdu.
      beyond.kes += row.amountKes;
      beyond.count++;
      continue;
    }
    bucket.kes += row.amountKes;
    bucket.count++;
  }

  return {
    months: [...buckets.values()],
    pastDue,
    undatedInstalments: undated,
    beyondTheWindow: beyond,
    committedWithoutADate,
    unrecognised,
  };
}
