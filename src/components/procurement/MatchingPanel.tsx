/**
 * Where the payment schedule and the works register disagree (M14-07).
 *
 * The schedule could already be read in one direction: from an instalment to
 * the measured valuation behind it, which is what the "hakedişe bağlı" mark
 * on the contract panel says. This panel is the four things that reading
 * cannot see, and every one of them is two registers saying different things
 * about the same money:
 *
 *   * measured work with no instalment against it — the direction nothing
 *     looked in, because every view started from the schedule;
 *   * an instalment whose amount disagrees with the valuation it cites;
 *   * an instalment marked certified or paid whose valuation carries no
 *     surveyor's certification;
 *   * an instalment citing work measured for a different firm.
 *
 * None of them is blocked. A variation is a real thing and so is a joint
 * venture, and refusing the entry only moves the true figure into somebody's
 * spreadsheet. What the portal will not do is let the two registers disagree
 * quietly.
 */
import React from 'react';
import { ArrowLeftRight, ScaleIcon, SearchX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as procurement from '../../api/procurementHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate, money } from '../../lib/site';
import type { AmountVerdict, MilestoneMatch, PaymentMatchingHealth } from '../../types';
import { unknownValue } from '../../lib/unknownValue';

/**
 * What a verdict is called. "İki para birimi" is not a disagreement and is
 * deliberately not worded as one: a valuation carries no exchange rate, so
 * the two numbers cannot be compared at all, and calling them unequal would
 * be inventing the comparison that is missing.
 */
function verdictWords(verdict: AmountVerdict, tr: boolean): { text: string; grave: boolean } {
  switch (verdict) {
    case 'disagree':
      return {
        text: tr ? 'tutarlar uyuşmuyor' : 'the amounts disagree',
        grave: true,
      };
    case 'different_currencies':
      return {
        text: tr
          ? 'iki ayrı para birimi — hakedişte kur yok, karşılaştırılamıyor'
          : 'two currencies, and a valuation carries no rate — not comparable',
        grave: false,
      };
    case 'unmatched':
      return {
        text: tr ? 'henüz ölçülmüş bir iş gösterilmemiş' : 'no measured work cited yet',
        grave: false,
      };
    case 'agree':
      return { text: tr ? 'tutarlar uyuşuyor' : 'the amounts agree', grave: false };
  }
  // 0038'in `case` ifadesi bugün dört cevap üretiyor ve `else`'i var, yani
  // beşinci bir değer ancak o SQL değişirse gelir. Geldiği gün bu satır
  // değeri olduğu gibi gösterir; alternatifi, hakediş eşleşmesinin tamamını
  // ekrandan kaldırmaktı.
  return { text: unknownValue(verdict), grave: false };
}

function disagreements(health: PaymentMatchingHealth, tr: boolean): string[] {
  const out: string[] = [];
  if (health.certifiedWorkWithNoInstalment > 0)
    out.push(
      tr
        ? `${health.certifiedWorkWithNoInstalment} onaylanmış hakedişin ödeme planında karşılığı yok`
        : `${health.certifiedWorkWithNoInstalment} certified valuation(s) with no instalment against them`,
    );
  if (health.instalmentsClaimingAnUncertifiedMeasurement > 0)
    out.push(
      tr
        ? `${health.instalmentsClaimingAnUncertifiedMeasurement} taksit, ölçüm kaydının taşımadığı bir onayı iddia ediyor`
        : `${health.instalmentsClaimingAnUncertifiedMeasurement} instalment(s) claim a certification the works register does not hold`,
    );
  if (health.instalmentsWhoseAmountDisagrees > 0)
    out.push(
      tr
        ? `${health.instalmentsWhoseAmountDisagrees} taksitin tutarı hakedişiyle uyuşmuyor`
        : `${health.instalmentsWhoseAmountDisagrees} instalment(s) disagree with their valuation`,
    );
  if (health.instalmentsMatchedToAnotherFirmsWork > 0)
    out.push(
      tr
        ? `${health.instalmentsMatchedToAnotherFirmsWork} taksit başka bir firmanın ölçülmüş işini gösteriyor`
        : `${health.instalmentsMatchedToAnotherFirmsWork} instalment(s) cite another firm's measured work`,
    );
  if (health.settledInstalmentsWithNoMeasurement > 0)
    out.push(
      tr
        ? `${health.settledInstalmentsWithNoMeasurement} kapanmış taksitin arkasında ölçüm yok`
        : `${health.settledInstalmentsWithNoMeasurement} settled instalment(s) with nothing measured behind them`,
    );
  if (health.instalmentsThatCannotBeCompared > 0)
    out.push(
      tr
        ? `${health.instalmentsThatCannotBeCompared} taksit, kur kayıtlı olmadığı için hakedişiyle karşılaştırılamıyor`
        : `${health.instalmentsThatCannotBeCompared} instalment(s) cannot be compared with their valuation — no rate recorded`,
    );
  return out;
}

/** Only the instalments something is wrong with. The rest are on the contract. */
function worthShowing(row: MilestoneMatch): boolean {
  return (
    row.amountVerdict === 'disagree' ||
    row.amountVerdict === 'different_currencies' ||
    row.claimsACertificationTheWorksDoNot ||
    row.matchedToAnotherFirmsWork
  );
}

export const MatchingPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const matching = procurement.useMilestoneMatching();
  const unscheduled = procurement.useUnscheduledValuations();
  const health = procurement.usePaymentMatchingHealth();

  const instalments = matching.data ?? [];
  const flagged = instalments.filter(worthShowing);
  const owed = unscheduled.data ?? [];
  const lines = health.data ? disagreements(health.data, tr) : [];

  // Nothing to match is not the same as everything matching, and the
  // difference is the whole point of this panel: with no schedule and no
  // measurement recorded, "every measured valuation has an instalment
  // against it" is a reassurance about an empty register.
  const nothingToMatch = instalments.length === 0 && owed.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {tr ? 'Ödeme planı ↔ hakediş eşleştirmesi' : 'Payment schedule ↔ valuation match'}
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Hiçbiri engellenmiyor; engellenen şey iki kaydın sessizce ayrı rakam söylemesi.'
                : 'Nothing here is blocked; what is blocked is two records quietly saying different figures.'}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <QueryStatus queries={[matching, unscheduled, health]} />

        {nothingToMatch ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Eşleştirilecek bir şey yok: ne ödeme planı taksiti ne de ölçülmüş bir hakediş kayıtlı. Bu "her şey yerinde" demek değil — henüz karşılaştırılacak iki kayıt yok.'
              : 'There is nothing to match: no schedule instalment and no measured valuation is recorded. That is not "all in order" — there are not yet two registers to compare.'}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'İki kayıt arasında ölçülebilir bir uyuşmazlık yok. Bu, her taksitin ölçülmüş bir işe bağlı olduğu anlamına gelmez — planlanmış bir taksitin arkasında henüz hakediş olmaması normaldir.'
              : 'No measurable disagreement between the two registers. That does not mean every instalment cites measured work — a planned instalment with no valuation yet is the normal state of a payment plan.'}
          </p>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
              <ScaleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {tr ? 'İki kaydın ayrıldığı yerler' : 'Where the two registers part company'}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900">
              {lines.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Measured work with no instalment: the half that was missing. */}
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
            {tr ? 'Ödemesi planlanmamış hakediş' : 'Measured work with no instalment'}
          </p>
          {owed.length === 0 ? (
            <p className="text-xs text-slate-500">
              {nothingToMatch
                ? tr
                  ? 'Kayıtlı hakediş yok.'
                  : 'No valuation is recorded.'
                : tr
                  ? 'Her ölçülmüş iş bir taksite bağlı.'
                  : 'Every measured valuation has an instalment against it.'}
            </p>
          ) : (
            <ul
              className="divide-y divide-slate-200"
              aria-label={tr ? 'Ödemesi planlanmamış hakediş' : 'Measured work with no instalment'}
            >
              {owed.map((row) => (
                <li key={row.valuationId} className="flex flex-wrap items-baseline gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="text-sm text-slate-900">
                      {row.contractorName ?? (tr ? 'firma kayıtlı değil' : 'no firm recorded')}
                      {row.blockCode != null && (
                        <span className="text-slate-500"> · {row.blockCode}</span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(row.periodStart, language)} –{' '}
                      {formatDate(row.periodEnd, language)}
                      {row.certified ? (
                        <span className="ml-1.5 font-medium text-amber-800">
                          {tr
                            ? '· ölçüm onaylanmış, planda karşılığı yok'
                            : '· certified, and nothing scheduled against it'}
                        </span>
                      ) : (
                        <span className="ml-1.5">
                          {tr
                            ? '· henüz onaylanmamış bir çalışma rakamı'
                            : '· a working figure, not yet certified'}
                        </span>
                      )}
                    </span>
                    {row.theOnlyLiveContractForThatFirm == null && (
                      <span className="block text-xs text-slate-500">
                        {tr
                          ? 'Hangi sözleşmeye ait olduğu söylenemiyor — o firmanın tek bir yürürlükteki sözleşmesi yok.'
                          : 'Which contract this belongs to cannot be said — that firm has no single live contract.'}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-700">
                    {money(row.amount, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Instalments something is wrong with. */}
        <div className="border-t border-slate-200 pt-2">
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
            {tr ? 'Hakedişiyle ayrışan taksitler' : 'Instalments that part from their valuation'}
          </p>
          {flagged.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <SearchX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {nothingToMatch
                ? tr
                  ? 'Kayıtlı ödeme planı taksiti yok.'
                  : 'No schedule instalment is recorded.'
                : tr
                  ? 'Hakedişi gösteren taksitlerin hiçbirinde ayrışma yok.'
                  : 'No instalment that cites a valuation parts from it.'}
            </p>
          ) : (
            <ul
              className="divide-y divide-slate-200"
              aria-label={
                tr ? 'Hakedişiyle ayrışan taksitler' : 'Instalments that part from their valuation'
              }
            >
              {flagged.map((row) => {
                const verdict = verdictWords(row.amountVerdict, tr);
                return (
                  <li key={row.contractMilestoneId} className="py-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-xs text-slate-500">{row.sequence}</span>
                      <span className="text-sm text-slate-900">{row.titleEn}</span>
                      <span className="text-xs text-slate-500">
                        {row.referenceNo ?? row.counterpartyName}
                      </span>
                      {row.claimsACertificationTheWorksDoNot && (
                        <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                          {tr
                            ? 'ölçüm kaydında onay yok'
                            : 'no certification in the works register'}
                        </Pill>
                      )}
                      {row.matchedToAnotherFirmsWork && (
                        <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                          {tr ? 'başka firmanın işi' : "another firm's work"}
                        </Pill>
                      )}
                    </div>
                    <p
                      className={`text-xs ${verdict.grave ? 'font-medium text-rose-700' : 'text-slate-500'}`}
                    >
                      {money(row.amount, row.currency)}
                      {row.valuationAmount != null && (
                        <> ↔ {money(row.valuationAmount, row.valuationCurrency)}</>
                      )}
                      {' · '}
                      {verdict.text}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
