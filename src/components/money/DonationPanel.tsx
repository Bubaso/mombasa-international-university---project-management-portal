/**
 * Pledges and what actually arrived (M8-08).
 *
 * These are two facts about the world, so they are two figures and the
 * difference between them is named. Adding them together is the easiest way
 * to lose a donor's trust: it makes a promise look like a payment, and the
 * first time somebody checks, everything else becomes questionable too.
 *
 * A tranche with no receipt against it is counted — money that arrived
 * without paperwork still arrived — and flagged, because a donation report
 * nobody can tie to a document is a press release.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HandCoins, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import { useDocumentOptions } from '../../api/documentHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { CURRENCIES, formatDate, money as fmt } from '../../lib/site';
import { donationStateLabel, share } from '../../lib/money';
import type { CurrencyCode, Donation } from '../../types';

export const DonationPanel: React.FC<{ canSpend: boolean }> = ({ canSpend }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const donations = money.useDonations();
  const pledge = money.usePledgeDonation();

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [donor, setDonor] = useState('');
  const [pledgedOn, setPledgedOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [rate, setRate] = useState('');

  const rows = donations.data ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      pledged: acc.pledged + row.pledgedAmountKes,
      received: acc.received + row.receivedKes,
      outstanding: acc.outstanding + row.outstandingKes,
    }),
    { pledged: 0, received: 0, outstanding: 0 },
  );

  return (
    <Section
      icon={HandCoins}
      title={tr ? 'Bağışlar ve dilimler' : 'Donations and tranches'}
      subtitle={
        tr
          ? 'Taahhüt bir şey, tahsilat başka bir şey. İkisi toplanmaz; aradaki fark açıkça yazılır.'
          : 'A pledge is one thing and a receipt is another. They are never added together; the difference is stated.'
      }
      whoMayUse={tr ? 'Direktör ve kurul.' : 'The director and the board.'}
      canUse={canSpend}
    >
      <QueryStatus queries={[donations]} />

      {rows.length > 0 && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Figure label={tr ? 'Taahhüt edilen' : 'Pledged'} value={totals.pledged} />
          <Figure
            label={tr ? 'Gelen' : 'Received'}
            value={totals.received}
            tone="text-emerald-700"
          />
          <Figure
            label={tr ? 'Bekleyen' : 'Outstanding'}
            value={totals.outstanding}
            tone={totals.outstanding > 0 ? 'text-amber-800' : 'text-slate-900'}
          />
        </div>
      )}

      {canSpend && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                pledge.mutate(
                  {
                    donorName: donor,
                    pledgedOn,
                    amount: Number(amount),
                    currency,
                    fxRateToKes: currency === 'KES' ? 1 : Number(rate),
                  },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field label={tr ? 'Bağışçı' : 'Donor'} className="min-w-[160px] flex-1">
                  <TextInput required value={donor} onChange={(e) => setDonor(e.target.value)} />
                </Field>
                <Field label={tr ? 'Taahhüt tarihi' : 'Pledged on'} className="w-40">
                  <TextInput
                    type="date"
                    required
                    value={pledgedOn}
                    onChange={(e) => setPledgedOn(e.target.value)}
                  />
                </Field>
                <Field label={tr ? 'Tutar' : 'Amount'} className="w-36">
                  <TextInput
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label={tr ? 'Para birimi' : 'Currency'} className="w-24">
                  <Select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                {currency !== 'KES' && (
                  <Field label={tr ? 'Kur (→ KES)' : 'Rate (→ KES)'} className="w-32">
                    <TextInput
                      type="number"
                      step="0.000001"
                      required
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                    />
                  </Field>
                )}
              </div>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="primary" disabled={pledge.isPending}>
                  {tr ? 'Taahhüdü kaydet' : 'Record the pledge'}
                </ActionButton>
                <ActionButton type="button" onClick={() => setAdding(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
              </div>
              <WriteError error={pledge.error} />
            </form>
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Taahhüt ekle' : 'Record a pledge'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={tr ? 'Bağış kaydı yok' : 'No donations'}
          description={
            tr
              ? 'Kayıtlı taahhüt yok, ya da bu kayıtlar sizin görebileceğiniz şeyler değil.'
              : 'Nothing pledged, or these records are not yours to see.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((donation) => (
            <DonationRow
              key={donation.id}
              donation={donation}
              open={openId === donation.id}
              onToggle={() => setOpenId(openId === donation.id ? null : donation.id)}
              canSpend={canSpend}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};

const Figure: React.FC<{ label: string; value: number; tone?: string }> = ({
  label,
  value,
  tone = 'text-slate-900',
}) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`font-mono text-base font-semibold ${tone}`}>{fmt(value, 'KES')}</div>
  </div>
);

const DonationRow: React.FC<{
  donation: Donation;
  open: boolean;
  onToggle: () => void;
  canSpend: boolean;
}> = ({ donation, open, onToggle, canSpend }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const tranches = money.useTranches(open ? donation.id : null);
  const documents = useDocumentOptions();
  const record = money.useRecordTranche();

  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [documentId, setDocumentId] = useState('');

  const pct = share(donation.receivedKes, donation.pledgedAmountKes);

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full cursor-pointer px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-slate-900">{donation.donorName}</span>
              <Pill>{donationStateLabel(donation.state, language)}</Pill>
              {donation.unevidencedTranches > 0 && (
                <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                  {tr
                    ? `${donation.unevidencedTranches} dilim belgesiz`
                    : `${donation.unevidencedTranches} without a receipt`}
                </Pill>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {tr ? 'Taahhüt: ' : 'Pledged '}
              {fmt(donation.pledgedAmount, donation.pledgedCurrency)}
              {' · '}
              {formatDate(donation.pledgedOn, language)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-sm font-semibold text-emerald-700">
              {fmt(donation.receivedKes, 'KES')}
            </div>
            <div className="text-xs text-slate-500">
              {tr ? 'bekleyen ' : 'outstanding '}
              <span className="font-mono">{fmt(donation.outstandingKes, 'KES')}</span>
            </div>
          </div>
        </div>
        {pct != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        )}
        <div className="mt-1 flex justify-end">
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3 text-xs">
          <QueryStatus queries={[tranches]} />
          {(tranches.data ?? []).length === 0 ? (
            <p className="text-slate-500">
              {tr
                ? 'Bu taahhütten henüz hiçbir dilim gelmedi.'
                : 'Nothing has arrived against this pledge yet.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {(tranches.data ?? []).map((tranche) => (
                <li
                  key={tranche.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1"
                >
                  <span>{formatDate(tranche.receivedOn, language)}</span>
                  <span className="font-mono">
                    {fmt(tranche.receivedAmount, tranche.receivedCurrency)}
                  </span>
                  {tranche.verified ? (
                    <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                      {tr ? 'belgeli' : 'receipted'}
                    </Pill>
                  ) : (
                    <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                      {tr ? 'belgesiz' : 'no receipt'}
                    </Pill>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canSpend && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                record.mutate(
                  {
                    donationId: donation.id,
                    receivedOn,
                    amount: Number(amount),
                    currency: donation.pledgedCurrency,
                    fxRateToKes:
                      donation.pledgedCurrency === 'KES'
                        ? 1
                        : donation.pledgedAmountKes / donation.pledgedAmount,
                    documentId: documentId || null,
                  },
                  { onSuccess: () => setAmount('') },
                );
              }}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <Field label={tr ? 'Geliş tarihi' : 'Received on'} className="w-40">
                <TextInput
                  type="date"
                  required
                  value={receivedOn}
                  onChange={(e) => setReceivedOn(e.target.value)}
                />
              </Field>
              <Field
                label={
                  tr
                    ? `Tutar (${donation.pledgedCurrency})`
                    : `Amount (${donation.pledgedCurrency})`
                }
                className="w-36"
              >
                <TextInput
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label={tr ? 'Dekont' : 'Receipt'} className="min-w-[150px]">
                <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                  <option value="">{tr ? 'Yok' : 'None'}</option>
                  {(documents.data ?? []).map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <ActionButton type="submit" tone="primary" disabled={record.isPending}>
                {tr ? 'Dilimi kaydet' : 'Record tranche'}
              </ActionButton>
              <WriteError error={record.error} />
            </form>
          )}
        </div>
      )}
    </li>
  );
};
