/**
 * The contract register, its warnings and its settlement
 * (M14-03, M14-04, M14-05, M14-07).
 *
 * The column that earns this panel its place is `renewalDrafted`. A renewal
 * date on its own is a date; a renewal date with nothing drafted against it
 * is the thing that lapses. On this project a lease has already gone that
 * way, so the 90/60/30 bands sort by whichever date comes first and the
 * un-drafted ones are coloured.
 *
 * Opening a contract shows its terms and the obligation each one raised in
 * M2. That link is the whole of M14-04: the duty is not described here and
 * tracked somewhere else, it IS the obligation, and clicking through goes to
 * the register that carries its evidence and its breach state.
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  FileSignature,
  ScrollText,
  TriangleAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useContracts,
  useContractTerms,
  useMilestones,
  useSettlement,
} from '../../api/procurementHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import {
  BAND_TONE,
  CONTRACT_TONE,
  URGENT_BANDS,
  bandLabel,
  contractStateLabel,
  milestoneLabel,
  partyLabel,
  valueBasisLabel,
} from '../../lib/procurement';
import { money, formatDate } from '../../lib/site';
import { splitBySettled } from '../../lib/registerStates';
import { SettledSection } from '../ui/SettledSection';
import type { ContractRow } from '../../types';

export const ContractPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();

  const alerts = useContracts();
  const settlement = useSettlement();
  const [openId, setOpenId] = useState<string | null>(null);
  const terms = useContractTerms(openId);
  const milestones = useMilestones(openId);

  const rows = alerts.data ?? [];
  const byContract = new Map((settlement.data ?? []).map((s) => [s.contractId, s]));
  // Sona ermiş ya da feshedilmiş sözleşme kimseyi bağlamıyor; askıya alınmış
  // olan bağlıyor, çünkü askı kalkabilir. Hüküm `lib/registerStates`'te
  // (`contract_state`) ve SQL'deki tek kopyası `app.contract_is_open` (0052).
  //
  // 0052'ye kadar bu ekran bitmiş sözleşmeyi **hiç** gösteremiyordu: uyarı
  // akışını okuyordu ve o akış canlı durumlara süzülüyor. Artık kütüğü okuyor
  // ve bitmiş olanı geri çekiyor — saklamıyor.
  const { open: waiting, settled } = splitBySettled(rows, 'contract_state', (c) => c.state);

  /** Bir satır; iki yerde çiziliyor (yürürlükte olan ve sona ermiş). */
  const row = (c: ContractRow) => {
    const open = openId === c.contractId;
    const s = byContract.get(c.contractId);
    const urgent =
      !c.renewalDrafted &&
      ((c.renewalBand && URGENT_BANDS.includes(c.renewalBand)) ||
        (c.expiryBand && URGENT_BANDS.includes(c.expiryBand)));
    return (
      <li key={c.contractId} className="py-2">
        <button
          type="button"
          onClick={() => setOpenId(open ? null : c.contractId)}
          aria-expanded={open}
          className="w-full cursor-pointer text-left"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {c.referenceNo && (
                  <span className="font-mono text-xs font-semibold text-indigo-800">
                    {c.referenceNo}
                  </span>
                )}
                <span className="text-sm font-medium text-slate-900">{c.counterpartyName}</span>
                <Pill className={CONTRACT_TONE[c.state]}>
                  {contractStateLabel(c.state, language)}
                </Pill>
                {c.renewalDrafted && (
                  <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                    {tr ? 'devamı yazıldı' : 'successor drafted'}
                  </Pill>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {(tr ? c.subjectTr : c.subjectEn) ?? c.subjectEn}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-mono">{money(c.valueAmount, c.valueCurrency)}</span>
                {/* What kind of number that is. A blank value column
                          would tell a donor nothing; "a cap" tells them
                          something. */}
                <span>{valueBasisLabel(c.valueBasis, language)}</span>
                {c.startsOn && c.endsOn && (
                  <span>
                    {formatDate(c.startsOn, language)} → {formatDate(c.endsOn, language)}
                  </span>
                )}
                {c.noticeDays != null && (
                  <span>{tr ? `${c.noticeDays} gün ihbar` : `${c.noticeDays}d notice`}</span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {/* The renewal decision falls due before the contract
                        does, and missing it is the failure that matters, so
                        it is listed first. */}
              {c.renewalBand && c.renewalBand !== 'later' && (
                <Pill className={BAND_TONE[c.renewalBand]}>
                  <CalendarClock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {tr ? 'yenileme: ' : 'renewal: '}
                  {bandLabel(c.renewalBand, language)}
                </Pill>
              )}
              {c.expiryBand && c.expiryBand !== 'later' && (
                <Pill className={BAND_TONE[c.expiryBand]}>
                  {tr ? 'bitiş: ' : 'ends: '}
                  {bandLabel(c.expiryBand, language)}
                </Pill>
              )}
              {urgent && (
                <span className="text-xs font-semibold text-rose-700">
                  {tr ? 'devamı yazılmamış' : 'no successor drafted'}
                </span>
              )}
              {s && s.milestones > 0 && (
                <span className="font-mono text-xs text-slate-500">
                  {s.percentPaid ?? 0}% {tr ? 'ödendi' : 'paid'}
                </span>
              )}
            </div>
          </div>
        </button>

        {open && (
          <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {/* M14-04: the terms, and the obligation each one became. */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <ScrollText className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                  {tr
                    ? 'Şartlar ve düştüğü yükümlülükler'
                    : 'Terms, and the obligations they raised'}
                </p>
              </div>
              <QueryStatus queries={[terms]} />
              {(terms.data ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">
                  {tr
                    ? 'Şart girilmemiş. Girilen her şart kendiliğinden M2’de bir yükümlülük açar.'
                    : 'No term entered. Each one recorded raises an obligation in M2 by itself.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {(terms.data ?? []).map((term) => (
                    <li
                      key={term.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {term.clause && (
                            <span className="font-mono text-xs text-slate-500">{term.clause}</span>
                          )}
                          <span className="text-sm text-slate-900">
                            <Bilingual
                              table="contract_terms"
                              id={term.id}
                              base="title"
                              en={term.titleEn}
                              tr={term.titleTr}
                            />
                          </span>
                          <Pill>
                            {tr ? 'borçlu: ' : 'owed by '}
                            {partyLabel(term.owedBy, language)}
                          </Pill>
                          {term.obligationState && (
                            <Pill className="border-sky-300 bg-sky-50 text-sky-900">
                              {term.obligationState}
                            </Pill>
                          )}
                        </div>
                        {term.dueOn && (
                          <span className="text-xs text-slate-500">
                            {tr ? 'vade ' : 'due '}
                            {formatDate(term.dueOn, language)}
                          </span>
                        )}
                      </div>
                      {term.obligationId && (
                        <button
                          type="button"
                          onClick={() => navigate('/obligations')}
                          className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-indigo-700 hover:underline"
                        >
                          {tr ? 'yükümlülüğe git' : 'open the obligation'}
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* M14-07: the schedule, and whether it outgrew the contract. */}
            <div className="border-t border-slate-200 pt-2">
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                {tr ? 'Ödeme planı' : 'Payment schedule'}
              </p>
              {s?.overCommitted && (
                <p className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {tr
                    ? 'Plan, kayıtlı sözleşme tutarını aşıyor. Bu bir tadil olabilir — engellenmiyor, söyleniyor.'
                    : 'The schedule exceeds the recorded contract value. That may be a variation — it is reported, not blocked.'}
                </p>
              )}
              <QueryStatus queries={[milestones]} />
              {(milestones.data ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">
                  {tr ? 'Ödeme planı girilmemiş.' : 'No schedule has been entered.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {(milestones.data ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-500">{m.sequence}</span>
                        <span className="text-sm text-slate-900">
                          <Bilingual
                            table="contract_milestones"
                            id={m.id}
                            base="title"
                            en={m.titleEn}
                            tr={m.titleTr}
                          />
                        </span>
                        <Pill>{milestoneLabel(m.state, language)}</Pill>
                        {m.valuationId && (
                          <Pill className="border-indigo-300 bg-indigo-50 text-indigo-900">
                            {tr ? 'hakedişe bağlı' : 'matched to a valuation'}
                          </Pill>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-xs text-slate-700">
                          {money(m.amount, m.currency)}
                        </span>
                        {m.dueOn && (
                          <span className="block text-xs text-slate-500">
                            {formatDate(m.dueOn, language)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s && (
                <p className="mt-1.5 font-mono text-xs text-slate-500">
                  {tr ? 'planlanan ' : 'scheduled '}
                  {s.scheduledKes ?? 0} KES · {tr ? 'ödenen ' : 'paid '}
                  {s.paidKes ?? 0} KES
                  {s.valueKes != null && ` · ${tr ? 'sözleşme ' : 'contract '}${s.valueKes} KES`}
                </p>
              )}
            </div>
          </div>
        )}
      </li>
    );
  };

  // A date approaching with no successor drafted is the one worth surfacing.
  const needsAttention = rows.filter(
    (r) =>
      !r.renewalDrafted &&
      ((r.renewalBand && URGENT_BANDS.includes(r.renewalBand)) ||
        (r.expiryBand && URGENT_BANDS.includes(r.expiryBand))),
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="flex flex-wrap items-center gap-1.5 text-base font-bold text-slate-900">
              {tr ? 'Sözleşme kütüğü' : 'Contract register'}
              <Pill>{waiting.length}</Pill>
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Taraf, konu, tutar, süre, yenileme tarihi ve fesih şartı. Taslak olmayan her sözleşmenin belgesi kasada olmak zorunda; şartları da M2’de yükümlülük olarak duruyor.'
                : 'Party, subject, value, term, renewal date and termination clause. Any contract past draft must have its document in the vault, and its terms live in M2 as obligations.'}
            </p>
          </div>
        </div>
        {needsAttention > 0 && (
          <Pill className="border-rose-300 bg-rose-50 text-rose-900">
            <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {tr
              ? `${needsAttention} sözleşmenin devamı yazılmamış`
              : `${needsAttention} with no successor drafted`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[alerts, settlement]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Kütükte sözleşme yok. Avukat vekâletnamesi, müteahhit sözleşmesi ve danışmanlık anlaşmaları burada durur — ve 90/60/30 uyarısı buradan çıkar. Sona ermiş sözleşmeler de burada kalır; bir ihtilafta en çok okunan sözleşme, biteni olur.'
            : 'No contract is on the register. The advocates’ retainers, the works contracts and the consultancy agreements belong here — and the 90/60/30 warning comes off them. Contracts that have ended stay too: in a dispute, the one most read is usually the one that ended.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">{waiting.map(row)}</ul>

          {/* Yürürlükte sözleşme kalmadıysa bunu söylemek gerekiyor: boş bir
              alan, sona ermişlerin altında "hepsi bitti" ile "kütük boş"u
              birbirine karıştırır. */}
          {waiting.length === 0 && settled.length > 0 && (
            <p className="text-xs text-slate-500">
              {tr
                ? 'Yürürlükte sözleşme yok; kayıtlı olanların hepsi sona ermiş ya da feshedilmiş.'
                : 'No contract is live; every one on the register has expired or been terminated.'}
            </p>
          )}

          <SettledSection rows={settled} label={{ tr: 'Sona ermiş', en: 'Ended' }}>
            {(shown) => <ul className="divide-y divide-slate-100">{shown.map(row)}</ul>}
          </SettledSection>
        </>
      )}
    </section>
  );
};
