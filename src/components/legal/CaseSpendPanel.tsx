import React from 'react';
import { Coins, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate, money } from '../../lib/site';

/**
 * Dava başına hukuk harcaması (M5-09).
 *
 * 8 Ekim 2026'da ölçüldü: `payment_vouchers` bir bütçe satırına ve bir
 * hakedişe bağlanabiliyordu, bir davaya bağlanamıyordu. Yani "bu dava bize ne
 * kadara mal oldu" zor bir soru değildi — cevaplanamazdı. 0054 sütunu ekledi,
 * bu panel cevabı gösteriyor.
 *
 * Ekranın işi burada üç bilinmezliği **birbirine karıştırmamak**, ve göç bunu
 * veri seviyesinde ayırt edilebilir yaptığı için yapılabiliyor:
 *
 *   `moneyVisible` false → sayılar yok çünkü yetki yok. Kayıt olmadığını
 *   söylemek yanlış olurdu; biz bilmiyoruz, kayıt biliyor.
 *
 *   `voucherCount === 0` → bu gerçek bir ölçüm: bu dosyaya bağlı kayıtlı fiş
 *   yok. Ama "bu dava bedavaya geldi" demek değil, ve panel bunu bu
 *   kelimelerle söylüyor: bağlanmamış bir fiş de olabilir.
 *
 *   `paidKes === null` ama fiş var → talep var, ödeme yok.
 *
 * `unbudgetedCount` M5-09'un "M8 bütçesine bağlı" yarısının dürüst kısmı. Bir
 * dava masrafının bütçe satırı yoksa o masraf bütçede değildir; toplamı
 * gösterip "bütçeye bağlı" demek, kaçının bağlı olmadığını saklamak olurdu.
 *
 * Panelin altında kalıcı bir uyarı paragrafı vardı — "toplam yalnızca
 * bağlanmış fişlerden gelir" — ve `tests/screen-text.mjs`'in tavanını 33
 * karakterle aştı. Tavanı yükseltmek yerine paragrafı kestim, çünkü kesilmesi
 * zaten doğruydu: aynı şeyin **somut** hâli bir satır yukarıda duruyor
 * ("N fiş bütçe satırına bağlı değil"), ve soyut uyarı kayıt varken de
 * yokken de aynı cümleyi basıyordu. Sayı rakamı kurtarmak için kesilmedi;
 * rakam kesilecek bir şeyin orada olduğunu söyledi.
 */
export const CaseSpendPanel: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const spend = legal.useCaseSpend(caseId);
  const row = spend.data;

  /** Kayıtlı olmayan tutar bir çizgi, bir sıfır değil. */
  const kes = (value: number | null) =>
    value == null ? (
      <span className="text-slate-400">{tr ? 'kayıtlı değil' : 'not recorded'}</span>
    ) : (
      money(value, 'KES')
    );

  const Figure: React.FC<{ label: string; value: number | null; note?: string }> = ({
    label,
    value,
    note,
  }) => (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{kes(value)}</p>
      {note && <p className="mt-0.5 text-sm text-slate-500">{note}</p>}
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Coins className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Hukuk harcaması' : 'Legal spend'}
          {row?.voucherCount != null && <Pill>{row.voucherCount}</Pill>}
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[spend]} />

        {spend.isSuccess && row && !row.moneyVisible && (
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              {tr
                ? 'Bu dosyanın tutarları yetkinizin dışında. Harcama olmadığı anlamına gelmez — kayıt var ya da yok, bunu bu ekrandan göremiyorsunuz.'
                : 'The figures on this file are outside your authority. It does not mean there was no spend: whether or not there is a record, this screen cannot show it to you.'}
            </span>
          </p>
        )}

        {spend.isSuccess && row?.moneyVisible && row.voucherCount === 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {tr
              ? 'Bu dosyaya bağlı kayıtlı ödeme fişi yok. Bu, davanın masrafı olmadığı anlamına gelmez: bir fiş kaydedilmiş ama bu davaya bağlanmamış olabilir.'
              : 'No payment voucher is recorded against this file. That does not mean the case cost nothing: a voucher may exist without being linked to it.'}
          </p>
        )}

        {spend.isSuccess && row?.moneyVisible && (row.voucherCount ?? 0) > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Figure label={tr ? 'Ödenen' : 'Paid'} value={row.paidKes} />
              <Figure
                label={tr ? 'Taahhüt (onaylı, ödenmemiş)' : 'Committed (approved, unpaid)'}
                value={row.committedKes}
              />
              <Figure label={tr ? 'Karar bekleyen' : 'Awaiting a ruling'} value={row.awaitingKes} />
            </div>

            <ul className="space-y-0.5 text-sm text-slate-600">
              <li>
                {tr ? 'Bütçe satırı: ' : 'Budget lines drawn on: '}
                <span className="font-medium text-slate-900">{row.budgetLineCount}</span>
                {(row.unbudgetedCount ?? 0) > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-amber-700">
                      {tr
                        ? `${row.unbudgetedCount} fiş bütçe satırına bağlı değil`
                        : `${row.unbudgetedCount} voucher not on any budget line`}
                    </span>
                  </>
                )}
              </li>
              {(row.rejectedCount ?? 0) > 0 && (
                <li>
                  {tr
                    ? `Reddedilen ödeme talebi: ${row.rejectedCount}. Tutarı toplama girmiyor, çünkü reddedilmiş bir fiş harcama değildir.`
                    : `Payment requests refused: ${row.rejectedCount}. Their amounts are not in the totals, because a refused voucher is not spend.`}
                </li>
              )}
              {(row.withdrawnCount ?? 0) > 0 && (
                <li>
                  {tr
                    ? `Geri çekilen talep: ${row.withdrawnCount}`
                    : `Requests withdrawn: ${row.withdrawnCount}`}
                </li>
              )}
              <li>
                {tr ? 'Son ödeme: ' : 'Last payment: '}
                {row.lastPaidAt ? (
                  formatDate(row.lastPaidAt, language)
                ) : (
                  <span className="text-slate-400">{tr ? 'kayıtlı değil' : 'not recorded'}</span>
                )}
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  );
};
