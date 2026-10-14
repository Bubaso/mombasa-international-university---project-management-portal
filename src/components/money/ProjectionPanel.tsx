import React from 'react';
import { TrendingDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import * as procurement from '../../api/procurementHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill, Section } from '../ui/Controls';
import { money as fmt } from '../../lib/site';
import { cashFlow } from '../../lib/cashFlow';

/**
 * Nakit akışı projeksiyonu (M8-13).
 *
 * Hesap `lib/cashFlow.ts`'te ve orada sınanıyor. Bu panelin işi, projeksiyonun
 * **kapsamadığını** aynı ekranda söylemek.
 *
 * M8-13 üç girdi sayıyor — "taahhütler, hakediş planı, hukuk harcaması" — ve
 * portalda bunların yalnızca biri tarihli: `contract_milestones.due_on`.
 * Onaylanmış ama ödenmemiş bir fiş bir borçtur, beklenen ödeme tarihi kayıtlı
 * değil; bir hukuk vekâlet ücretinin hiç kilometre taşı olmaz (0022'nin kendi
 * yorumu bunu söylüyor). Yani iki girdi tarihsiz.
 *
 * Onları aylara dağıtmak — eşit bölmek, bir "ortalama ödeme süresi"
 * uydurmak, ya da sessizce bu aya yazmak — bir projeksiyon değil bir kurgu
 * üretirdi: rakam makul görünür, toplam doğrudur, ve o ayın beklenen çıkışı
 * uydurulmuştur. Panel onları kendi başlıklarında gösteriyor.
 *
 * Boş bir ay satır olarak duruyor ve bu kasıtlı: atlanırsa okuyan bir
 * sonraki dolu aya bakıp onu bir sonraki ay sanar.
 *
 * Alt başlıkta "tarihi kayıtlı olmayan borç bir aya yazılmıyor" diye bir
 * cümle vardı; kesildi. Aşağıdaki "bir aya yazılamayanlar" bloğu aynı şeyi
 * RAKAMLA söylüyor, ve rakamla söylenen bir şeyi prozada tekrar etmek T6-01
 * ile T13-02 turlarının 54 paragrafta kaldırdığı şey.
 */

const MONTHS = 6;

export const ProjectionPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const instalments = procurement.useAllContractMilestones();
  const positions = money.useBudgetPositions();

  const today = new Date().toISOString().slice(0, 10);

  // Taahhüt `budget_position`'dan geliyor, burada yeniden hesaplanmıyor:
  // aynı sayıyı iki yerde hesaplamak ikisinin ayrı düşmesine davetiyedir.
  const committed = (positions.data ?? []).reduce((a, p) => a + (p.committedKes ?? 0), 0);

  const flow = cashFlow(instalments.data ?? [], today, MONTHS, committed);
  const scheduled = flow.months.reduce((a, m) => a + m.kes, 0);
  const peak = Math.max(1, ...flow.months.map((m) => m.kes));

  const monthName = (key: string) =>
    new Date(key + '-01T00:00:00Z').toLocaleDateString(tr ? 'tr-TR' : 'en-GB', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    });

  return (
    <Section
      icon={TrendingDown}
      title={tr ? 'Nakit akışı projeksiyonu' : 'Cash flow projection'}
      subtitle={
        tr
          ? `Önümüzdeki ${MONTHS} ay, hakediş planının vadelerinden.`
          : `The next ${MONTHS} months, from the dates on the payment schedule.`
      }
      whoMayUse={
        tr
          ? 'Rakamlar kayıtlı vadelerden; hiçbiri tahmin değil.'
          : 'The figures come from recorded due dates; none of them is an estimate.'
      }
      canUse
      waiting={flow.months.reduce((a, m) => a + m.count, 0)}
    >
      <QueryStatus queries={[instalments, positions]} />

      <ul className="space-y-1" data-projection="months">
        {flow.months.map((m) => (
          <li key={m.key} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm text-slate-600">{monthName(m.key)}</span>
            <span className="h-4 min-w-px flex-1 rounded bg-slate-100">
              <span
                className="block h-4 rounded bg-emerald-400"
                style={{ width: `${Math.round((m.kes / peak) * 100)}%` }}
                aria-hidden="true"
              />
            </span>
            <span className="w-28 shrink-0 text-right font-mono text-sm text-slate-900">
              {m.kes === 0 ? <span className="text-slate-400">0</span> : fmt(m.kes, 'KES')}
            </span>
            <span className="w-8 shrink-0 text-right text-sm text-slate-500">{m.count}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm text-slate-700">
        {tr ? `${MONTHS} ayın planlanmış toplamı: ` : `Scheduled over ${MONTHS} months: `}
        <span className="font-mono font-semibold text-slate-900">{fmt(scheduled, 'KES')}</span>
      </p>

      {/* Projeksiyona GİRMEYENLER. Dördü dört ayrı başlık, çünkü biri
          ötekinin yerine geçmiyor: "vadesi geçmiş" birikmiş bir borç,
          "tarihi yok" bir eksiklik, "pencerenin ötesinde" bir seçim. */}
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-700">
          {tr ? 'Bir aya yazılamayanlar' : 'What no month can hold'}
        </p>
        <ul className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
          {flow.pastDue.count > 0 && (
            <li>
              <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                {tr ? 'vadesi geçmiş' : 'past due'} · {fmt(flow.pastDue.kes, 'KES')} ·{' '}
                {flow.pastDue.count}
              </Pill>
            </li>
          )}
          {flow.committedWithoutADate > 0 && (
            <li>
              <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                {tr ? 'onaylı fiş, vadesi kayıtlı değil' : 'approved voucher, no date recorded'} ·{' '}
                {fmt(flow.committedWithoutADate, 'KES')}
              </Pill>
            </li>
          )}
          {flow.undatedInstalments.count > 0 && (
            <li>
              <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                {tr ? 'taksit, vadesi kayıtlı değil' : 'instalment, no date recorded'} ·{' '}
                {fmt(flow.undatedInstalments.kes, 'KES')} · {flow.undatedInstalments.count}
              </Pill>
            </li>
          )}
          {flow.beyondTheWindow.count > 0 && (
            <li>
              <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                {tr ? `${MONTHS} ayın ötesinde` : `beyond the ${MONTHS} months`} ·{' '}
                {fmt(flow.beyondTheWindow.kes, 'KES')} · {flow.beyondTheWindow.count}
              </Pill>
            </li>
          )}
          {flow.unrecognised.count > 0 && (
            <li>
              <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                {tr ? 'durumu tanınmıyor' : 'state not recognised'} ·{' '}
                {fmt(flow.unrecognised.kes, 'KES')} · {flow.unrecognised.count}
              </Pill>
            </li>
          )}
          {flow.pastDue.count === 0 &&
            flow.committedWithoutADate === 0 &&
            flow.undatedInstalments.count === 0 &&
            flow.beyondTheWindow.count === 0 &&
            flow.unrecognised.count === 0 && (
              <li className="text-slate-600">
                {tr
                  ? 'Yok: her borcun bir vadesi kayıtlı ve hepsi pencerenin içinde.'
                  : 'None: every debt has a recorded date and all of them fall inside the window.'}
              </li>
            )}
        </ul>
      </div>
    </Section>
  );
};
