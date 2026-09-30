/**
 * The ledger, the audit badge and the CSV (M8-06, M8-07, M8-10).
 *
 * The badge is the reason this file is careful. It used to be a boolean with
 * a default that any writer could set on their own transaction, which is the
 * single most expensive untruth a project like this can print: a donor who
 * finds one "audited" that nobody audited has no reason to believe the next
 * one. It is now written by one function that refuses everybody but the audit
 * committee and the external auditor, so the control below is drawn for them
 * and for nobody else — and if it were drawn wrongly, the refusal would still
 * come back from the database.
 *
 * The export is what replaces the accounting integration that never existed.
 * A file is not a smaller version of that lie; it is a different kind of
 * thing. Every row carries the amount as recorded, the rate, and the base
 * figure, so nothing about the conversion has to be taken on trust.
 */
import React, { useState } from 'react';
import { BadgeCheck, Download, FileWarning, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import { useDocuments } from '../../api/documentHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import {
  ActionButton,
  Field,
  Pill,
  Section,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../ui/Controls';
import { CURRENCIES, formatDate, money as fmt } from '../../lib/site';
import {
  TRANSACTION_CATEGORIES,
  downloadCsv,
  toCsv,
  transactionCategoryLabel,
} from '../../lib/money';
import type { CurrencyCode, FinancialTransaction } from '../../types';

interface Props {
  canSpend: boolean;
  canAudit: boolean;
}

export const LedgerPanel: React.FC<Props> = ({ canSpend, canAudit }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const ledger = money.useLedger();
  const lines = money.useBudgetLines();
  const documents = useDocuments();
  const record = money.useRecordTransaction();
  const attach = money.useAttachDocument();
  const audit = money.useMarkAudited();

  const [adding, setAdding] = useState(false);
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(TRANSACTION_CATEGORIES[0] ?? 'civil_construction');
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const [rate, setRate] = useState('1');
  const [documentId, setDocumentId] = useState('');
  const [lineId, setLineId] = useState('');

  const rows = ledger.data ?? [];
  const unverified = rows.filter((t) => !t.verified).length;

  const exportCsv = () => {
    const csv = toCsv(
      rows.map((t) => ({
        reference: t.referenceNo,
        date: t.date,
        category: t.category,
        description: t.description,
        payee: t.payee,
        amount: t.amount,
        currency: t.currency,
        fx_rate_to_kes: t.fxRateToKes,
        amount_kes: t.amountKes,
        // Both states go out with the data, so a spreadsheet cannot quietly
        // lose the distinction the screen is careful about.
        has_document: t.verified ? 'yes' : 'no',
        audited_at: t.auditedAt ?? '',
        audited_by: t.auditedByName ?? '',
      })),
      [
        'reference',
        'date',
        'category',
        'description',
        'payee',
        'amount',
        'currency',
        'fx_rate_to_kes',
        'amount_kes',
        'has_document',
        'audited_at',
        'audited_by',
      ],
    );
    downloadCsv(`ledger-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Section
      icon={BadgeCheck}
      title={tr ? 'Kasa defteri' : 'The ledger'}
      subtitle={
        tr
          ? '"Denetlendi" rozetini yalnızca denetim komitesi ya da dış denetçi koyabilir — harcayan koyamaz.'
          : 'The audited badge can only be set by the audit committee or the external auditor — never by whoever spent the money.'
      }
      whoMayUse={
        tr
          ? 'Kayıt direktörün, rozet denetçinin.'
          : 'The record is the director’s, the badge the auditor’s.'
      }
      canUse={canSpend || canAudit}
    >
      <QueryStatus queries={[ledger]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canSpend && !adding && (
          <ActionButton tone="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'İşlem kaydet' : 'Record a transaction'}</span>
          </ActionButton>
        )}
        {rows.length > 0 && (
          <ActionButton onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'CSV indir' : 'Export CSV'}</span>
          </ActionButton>
        )}
      </div>

      {unverified > 0 && (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-amber-900">
            <span className="font-semibold">
              {tr
                ? `${unverified} işlemin belgesi yok.`
                : `${unverified} transactions have nothing attached.`}
            </span>{' '}
            {tr
              ? 'Belgesiz bir işlem yine de kaydedilir — kaydedilmemiş bir ödeme, doğrulanmamış olandan kötüdür — ama doğrulanmamış sayılır.'
              : 'A transaction with no paper behind it is still recorded — an unrecorded payment is worse than an unverified one — but it counts as unverified.'}
          </p>
        </div>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate(
              {
                referenceNo: reference,
                date,
                category: category as FinancialTransaction['category'],
                description,
                payee,
                amount: Number(amount),
                currency,
                fxRateToKes: currency === 'KES' ? 1 : Number(rate),
                budgetLineId: lineId || null,
                documentId: documentId || null,
              },
              { onSuccess: () => setAdding(false) },
            );
          }}
          className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
        >
          <div className="flex flex-wrap gap-2">
            <Field label={tr ? 'Referans' : 'Reference'} className="w-32">
              <TextInput
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label={tr ? 'Tarih' : 'Date'} className="w-40">
              <TextInput
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label={tr ? 'Kategori' : 'Category'} className="min-w-[140px]">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {TRANSACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {transactionCategoryLabel(c, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Alacaklı' : 'Payee'} className="min-w-[140px] flex-1">
              <TextInput required value={payee} onChange={(e) => setPayee(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <Field label={tr ? 'Bütçe kalemi' : 'Budget line'} className="min-w-[150px]">
              <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
                <option value="">{tr ? 'Bağlamadan' : 'Not against a line'}</option>
                {(lines.data ?? []).map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.titleEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Belge' : 'Document'} className="min-w-[150px]">
              <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                <option value="">{tr ? 'Yok — doğrulanmamış' : 'None — unverified'}</option>
                {(documents.data ?? []).map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={tr ? 'Açıklama' : 'Description'}>
            <TextInput
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <ActionButton type="submit" tone="primary" disabled={record.isPending}>
              {tr ? 'Kaydet' : 'Record'}
            </ActionButton>
            <ActionButton type="button" onClick={() => setAdding(false)}>
              {tr ? 'Vazgeç' : 'Cancel'}
            </ActionButton>
          </div>
          <WriteError error={record.error} />
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={tr ? 'İşlem yok' : 'No transactions'}
          description={
            tr
              ? 'Kasa defteri boş, ya da mali kayıtlar sizin görebileceğiniz şeyler değil.'
              : 'The ledger is empty, or the financial records are not yours to see.'
          }
        />
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Referans' : 'Reference'}</Th>
              <Th>{tr ? 'Açıklama' : 'Description'}</Th>
              <Th className="text-right">{tr ? 'Tutar' : 'Amount'}</Th>
              <Th>{tr ? 'Durum' : 'Standing'}</Th>
              <Th />
            </tr>
          }
        >
          {rows.map((transaction) => (
            <tr key={transaction.id} className="border-t border-slate-100">
              <Td>
                <span className="font-mono text-[11px]">{transaction.referenceNo}</span>
                <span className="block text-[11px] text-slate-400">
                  {formatDate(transaction.date, language)}
                </span>
              </Td>
              <Td>
                {transaction.description}
                <span className="block text-[11px] text-slate-500">
                  {transaction.payee} · {transactionCategoryLabel(transaction.category, language)}
                </span>
              </Td>
              <Td className="text-right font-mono">
                {fmt(transaction.amount, transaction.currency)}
                {transaction.currency !== 'KES' && (
                  <span className="block text-[11px] text-slate-400">
                    {fmt(transaction.amountKes, 'KES')}
                  </span>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {transaction.verified ? (
                    <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                      {tr ? 'belgeli' : 'documented'}
                    </Pill>
                  ) : (
                    <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                      {tr ? 'belgesiz' : 'no document'}
                    </Pill>
                  )}
                  {transaction.auditedAt ? (
                    <Pill className="border-emerald-200 bg-emerald-100 text-emerald-800">
                      <span
                        className="flex items-center gap-1"
                        title={`${transaction.auditedByName ?? ''} · ${formatDate(transaction.auditedAt, language)}`}
                      >
                        <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'denetlendi' : 'audited'}
                      </span>
                    </Pill>
                  ) : (
                    <Pill className="border-slate-200 bg-white text-slate-500">
                      {tr ? 'denetlenmedi' : 'not audited'}
                    </Pill>
                  )}
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {canSpend && !transaction.verified && (documents.data ?? []).length > 0 && (
                    <Select
                      value=""
                      onChange={(e) =>
                        attach.mutate({ id: transaction.id, documentId: e.target.value })
                      }
                      className="w-auto"
                    >
                      <option value="">{tr ? 'Belge bağla…' : 'Attach…'}</option>
                      {(documents.data ?? []).map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))}
                    </Select>
                  )}
                  {/* Drawn for the auditors alone. If it were drawn wrongly
                      the function would still refuse — this is the interface
                      agreeing with the database, not enforcing anything. */}
                  {canAudit && transaction.auditedAt == null && (
                    <ActionButton
                      onClick={() => audit.mutate({ id: transaction.id, note: null })}
                      disabled={audit.isPending}
                    >
                      {tr ? 'Denetledim' : 'Mark audited'}
                    </ActionButton>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </TableFrame>
      )}

      <WriteError error={attach.error} />
      <WriteError error={audit.error} />
    </Section>
  );
};
