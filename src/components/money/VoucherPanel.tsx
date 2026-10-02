/**
 * Payment vouchers, and the chain of signatures behind them (M8-04, M8-05).
 *
 * Three things here are the database's and not this file's. Who may rule on a
 * voucher of a given size comes from a table of thresholds, so the refusal
 * names the band and the roles in it. Nobody may rule on their own request.
 * And what the budget line had left is stamped onto the voucher at the moment
 * of the decision — so it is shown here as part of the record rather than as
 * something the approver was once looking at.
 *
 * The thresholds are printed at the top. A rule about who has to sign is not
 * a secret, and one nobody can see is one only the people it constrains can
 * enforce.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Receipt, Scale } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { CURRENCIES, formatDate, money as fmt } from '../../lib/site';
import { voucherStateLabel, voucherStateStyle } from '../../lib/money';
import { roleLabel } from '../../lib/roles';
import type { CurrencyCode, PaymentVoucher, UserRole } from '../../types';

export const VoucherPanel: React.FC<{ canRule: boolean }> = ({ canRule }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const vouchers = money.useVouchers();
  const thresholds = money.useThresholds();
  const lines = money.useBudgetLines();
  const request = money.useRequestVoucher();

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const [reference, setReference] = useState('');
  const [payee, setPayee] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lineId, setLineId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const [rate, setRate] = useState('1');

  const rows = vouchers.data ?? [];

  return (
    <Section
      icon={Receipt}
      title={tr ? 'Ödeme fişleri' : 'Payment vouchers'}
      subtitle={
        tr
          ? 'Talep → onay → ödeme. Tutar büyüdükçe onaylayacak kişi yükselir, ve kimse kendi talebine karar veremez.'
          : 'Request, then ruling, then payment. The larger the amount the higher the approver, and nobody rules on their own request.'
      }
      whoMayUse={
        tr
          ? 'Herkes ödeme talep edebilir; karar bandın adlandırdığı kişilerindir.'
          : 'Anybody may ask to be paid; the ruling belongs to whoever the band names.'
      }
      canUse
    >
      <QueryStatus queries={[vouchers]} />

      {(thresholds.data ?? []).length > 0 && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Onay eşikleri' : 'Who has to sign'}
          </p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {(thresholds.data ?? []).map((threshold) => (
              <li key={threshold.id}>
                <span className="font-mono">{fmt(threshold.minAmountKes, 'KES')}+</span>
                {' — '}
                {threshold.requiredRoles.map((r) => roleLabel(r as UserRole, language)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate(
                {
                  referenceNo: reference,
                  budgetLineId: lineId || null,
                  payee,
                  purpose,
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
              <Field label={tr ? 'Fiş no' : 'Reference'} className="w-32">
                <TextInput
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <Field label={tr ? 'Alacaklı' : 'Payee'} className="min-w-[140px] flex-1">
                <TextInput required value={payee} onChange={(e) => setPayee(e.target.value)} />
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
            <div className="flex flex-wrap gap-2">
              <Field label={tr ? 'Bütçe kalemi' : 'Budget line'} className="min-w-[160px]">
                <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
                  <option value="">{tr ? 'Bağlamadan' : 'Not against a line'}</option>
                  {(lines.data ?? []).map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.titleEn}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr ? 'Gerekçe' : 'Purpose'} className="min-w-[180px] flex-1">
                <TextInput required value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <ActionButton type="submit" tone="primary" disabled={request.isPending}>
                {tr ? 'Talep et' : 'Request'}
              </ActionButton>
              <ActionButton type="button" onClick={() => setAdding(false)}>
                {tr ? 'Vazgeç' : 'Cancel'}
              </ActionButton>
            </div>
            <WriteError error={request.error} />
          </form>
        ) : (
          <ActionButton tone="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Ödeme talep et' : 'Request a payment'}</span>
          </ActionButton>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={tr ? 'Ödeme fişi yok' : 'No vouchers'}
          description={
            tr
              ? 'Henüz ödeme talebi yok. Kendi talepleriniz, mali kayıtları göremeseniz bile size görünür.'
              : 'Nothing requested yet. Your own requests are visible to you even where the financial records are not.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((voucher) => (
            <VoucherRow
              key={voucher.id}
              voucher={voucher}
              open={openId === voucher.id}
              onToggle={() => setOpenId(openId === voucher.id ? null : voucher.id)}
              canRule={canRule}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};

const VoucherRow: React.FC<{
  voucher: PaymentVoucher;
  open: boolean;
  onToggle: () => void;
  canRule: boolean;
}> = ({ voucher, open, onToggle, canRule }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const approvals = money.useApprovals(open ? voucher.id : null);
  const setState = money.useSetVoucherState();
  const [note, setNote] = useState('');

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-slate-500">
              {voucher.referenceNo}
            </span>
            <span className="text-sm font-medium text-slate-900">{voucher.payee}</span>
            <Pill className={voucherStateStyle(voucher.state)}>
              {voucherStateLabel(voucher.state, language)}
            </Pill>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {voucher.purpose}
            {voucher.budgetLineTitle && ` · ${voucher.budgetLineTitle}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-900">
            {fmt(voucher.amount, voucher.currency)}
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3 text-xs">
          {voucher.currency !== 'KES' && (
            <p className="text-slate-600">
              {tr ? 'Taban karşılığı: ' : 'In base currency: '}
              <span className="font-mono">{fmt(voucher.amountKes, 'KES')}</span>
            </p>
          )}

          <p className="text-slate-600">
            {tr ? 'Talep eden: ' : 'Requested by '}
            {voucher.requestedByName ?? '—'} · {formatDate(voucher.requestedAt, language)}
          </p>

          {/* The budget check, as part of the record rather than as something
              a screen once showed the approver. */}
          {voucher.budgetRemainingAtDecision != null && (
            <p className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700">
              {tr ? 'Karar anında kalemde kalan: ' : 'The line had left, at the decision: '}
              <span className="font-mono font-semibold">
                {fmt(voucher.budgetRemainingAtDecision, 'KES')}
              </span>
              {voucher.budgetRemainingAtDecision < voucher.amountKes && (
                <span className="ml-1.5 font-semibold text-rose-700">
                  {tr ? '— kalemden fazlası' : '— more than the line had'}
                </span>
              )}
            </p>
          )}

          <QueryStatus queries={[approvals]} />
          {(approvals.data ?? []).length > 0 && (
            <ul className="space-y-1">
              {(approvals.data ?? []).map((approval) => (
                <li
                  key={approval.id}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1"
                >
                  <span className="font-medium text-slate-800">
                    {voucherStateLabel(approval.decision, language)}
                  </span>
                  {' — '}
                  {approval.decidedByName ?? '—'}
                  {' · '}
                  {roleLabel(approval.actingAs as UserRole, language)}
                  {' · '}
                  {formatDate(approval.decidedAt, language)}
                  {approval.note && <span className="block text-slate-600">{approval.note}</span>}
                </li>
              ))}
            </ul>
          )}

          {canRule && voucher.state === 'requested' && (
            <div className="space-y-1.5">
              <TextInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={tr ? 'Karar notu' : 'Note on the decision'}
              />
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  tone="primary"
                  onClick={() =>
                    setState.mutate({ id: voucher.id, state: 'approved', note: note || null })
                  }
                  disabled={setState.isPending}
                >
                  {tr ? 'Onayla' : 'Approve'}
                </ActionButton>
                <ActionButton
                  tone="danger"
                  onClick={() =>
                    setState.mutate({ id: voucher.id, state: 'rejected', note: note || null })
                  }
                  disabled={setState.isPending}
                >
                  {tr ? 'Reddet' : 'Reject'}
                </ActionButton>
              </div>
            </div>
          )}

          {canRule && voucher.state === 'approved' && (
            <ActionButton
              tone="primary"
              onClick={() => setState.mutate({ id: voucher.id, state: 'paid' })}
              disabled={setState.isPending}
            >
              {tr ? 'Ödendi olarak işaretle' : 'Mark as paid'}
            </ActionButton>
          )}

          <WriteError error={setState.error} />
        </div>
      )}
    </li>
  );
};
