/**
 * Periodic financial close, and the audit file (M8-16).
 *
 * A close is where a register stops being a running list and becomes a
 * statement. The dishonest version is easy: sum what is recorded, show the
 * totals, and the things nobody entered are simply not in the picture —
 * totals always look complete.
 *
 * So this screen is built around three sentences the close is required to
 * say. What it leaves out, counted at the moment of closing and frozen with
 * the figures. What has been entered into the period since, because a late
 * invoice is a real payment and the drift between the reported figure and the
 * register belongs beside the figure. And, on the file itself, how many rows
 * the reader's own clearance kept out of it — the worst artefact this whole
 * system could produce is a spreadsheet holding forty of forty-four payments
 * under the heading of a quarter.
 */
import React, { useState } from 'react';
import { CalendarCheck, Download, Lock, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import { fetchAuditFileParts } from '../../api/money';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { formatDate, money as amount } from '../../lib/site';
import { auditFileName, toAuditFile } from '../../lib/auditFile';
import type { FinancialPeriod } from '../../types';

const GAP_WORDS: { key: string; tr: string; en: string }[] = [
  { key: 'ledger_entries_never_audited', tr: 'denetlenmemiş kayıt', en: 'never audited' },
  { key: 'ledger_entries_with_no_document', tr: 'belgesi olmayan kayıt', en: 'with no document' },
  {
    key: 'ledger_entries_with_no_voucher',
    tr: 'ödeme fişi olmayan kayıt',
    en: 'with no voucher',
  },
  { key: 'vouchers_never_decided', tr: 'karara bağlanmamış fiş', en: 'vouchers never decided' },
  {
    key: 'vouchers_approved_not_paid',
    tr: 'onaylanıp ödenmemiş fiş',
    en: 'approved and not paid',
  },
  {
    key: 'vouchers_paid_with_no_ledger_entry',
    tr: 'ödenip deftere geçmemiş fiş',
    en: 'paid with no ledger entry',
  },
  {
    key: 'receipts_with_no_document',
    tr: 'makbuzu olmayan tahsilat',
    en: 'receipts with no document',
  },
  {
    key: 'certified_work_not_paid',
    tr: 'onaylanmış ödenmemiş hakediş',
    en: 'certified work unpaid',
  },
];

/** The gaps worth saying out loud: the ones above zero. */
function gapLines(gaps: Record<string, number> | null, tr: boolean): string[] {
  if (gaps == null) return [];
  return GAP_WORDS.filter((g) => (gaps[g.key] ?? 0) > 0).map(
    (g) => `${gaps[g.key]} ${tr ? g.tr : g.en}`,
  );
}

export const ClosePanel: React.FC<{ canClose: boolean }> = ({ canClose }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const periods = money.usePeriods();
  const open = money.useOpenPeriod();
  const close = money.useClosePeriod();

  const [code, setCode] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const [lastFile, setLastFile] = useState<{ written: number; withheld: number } | null>(null);

  const rows = periods.data ?? [];

  async function takeTheFile(period: FinancialPeriod): Promise<void> {
    setExporting(period.financialPeriodId);
    setExportError(null);
    try {
      const { manifest, rows: ledger } = await fetchAuditFileParts(period.financialPeriodId);
      const file = toAuditFile(ledger, manifest, { language });
      // toAuditFile writes its own byte-order mark, so this does not add a
      // second one the way downloadCsv would.
      const url = URL.createObjectURL(new Blob([file.text], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = auditFileName(period.code, new Date());
      link.click();
      URL.revokeObjectURL(url);
      setLastFile({ written: file.written, withheld: file.withheld });
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-2 flex items-start gap-2.5">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              {tr ? 'Dönemsel mali kapanış' : 'Periodic financial close'}
            </h3>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              {tr
                ? 'Rakamlar kapanış anında dondurulur ve saklanır.'
                : 'The figures are frozen at the moment of closing and kept.'}
            </p>
          </div>
        </header>

        {canClose && (
          <form
            className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-4"
            aria-label={tr ? 'Dönem aç' : 'Open a period'}
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim() === '' || startsOn === '' || endsOn === '') return;
              open.mutate(
                { code: code.trim(), startsOn, endsOn },
                {
                  onSuccess: () => {
                    setCode('');
                    setStartsOn('');
                    setEndsOn('');
                  },
                },
              );
            }}
          >
            <Field label={tr ? 'Dönem adı' : 'Period code'}>
              <TextInput
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="2026-Q1"
                required
              />
            </Field>
            <Field label={tr ? 'Başlangıç' : 'Starts'}>
              <TextInput
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                required
              />
            </Field>
            <Field label={tr ? 'Bitiş' : 'Ends'}>
              <TextInput
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
                required
              />
            </Field>
            <div className="flex items-end">
              <ActionButton type="submit" disabled={open.isPending}>
                {tr ? 'Dönemi aç' : 'Open the period'}
              </ActionButton>
            </div>
            <div className="sm:col-span-4">
              <WriteError error={open.error} />
            </div>
          </form>
        )}

        <QueryStatus queries={[periods]} />

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {tr
              ? 'Tanımlı dönem yok. Bu, hiçbir şeyin kapanmadığı anlamına gelir — hepsinin yolunda olduğu anlamına gelmez.'
              : 'No period is defined. That means nothing has been closed — not that everything is in order.'}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={tr ? 'Mali dönemler' : 'Financial periods'}>
            {rows.map((period) => {
              const gaps = gapLines(period.gaps, tr);
              const closed = period.state === 'closed';
              return (
                <li
                  key={period.financialPeriodId}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{period.code}</span>
                    <span className="text-xs text-slate-500">
                      {formatDate(period.startsOn, language)} –{' '}
                      {formatDate(period.endsOn, language)}
                    </span>
                    {closed ? (
                      <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {tr ? 'Kapandı' : 'Closed'}
                      </Pill>
                    ) : (
                      <Pill className="border-slate-300 bg-white text-slate-600">
                        {tr ? 'Açık' : 'Open'}
                      </Pill>
                    )}
                    {canClose && !closed && (
                      <ActionButton
                        onClick={() => close.mutate(period.financialPeriodId)}
                        disabled={close.isPending}
                      >
                        {tr ? 'Kapanışı al' : 'Take the close'}
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={() => void takeTheFile(period)}
                      disabled={exporting === period.financialPeriodId}
                    >
                      <Download className="mr-1 inline h-3 w-3" aria-hidden="true" />
                      {tr ? 'Denetim dosyası' : 'Audit file'}
                    </ActionButton>
                  </div>

                  {closed ? (
                    <p className="mt-1 font-mono text-sm text-slate-600">
                      {period.closingTransactions} {tr ? 'kayıt' : 'records'} ·{' '}
                      {amount(period.closingLedgerKes, 'KES')} {tr ? 'defter' : 'ledger'} ·{' '}
                      {amount(period.closingReceiptsKes, 'KES')} {tr ? 'tahsilat' : 'receipts'}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">
                      {tr
                        ? 'Kapanış alınmadı, bu yüzden dondurulmuş bir rakam yok. Buradaki boşluklar da sayılmadı — sıfır oldukları anlamına gelmez.'
                        : 'The close has not been taken, so there is no frozen figure. The gaps have not been counted either, which does not mean they are zero.'}
                    </p>
                  )}

                  {/* What the close left out. */}
                  {closed &&
                    (gaps.length === 0 ? (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {tr
                          ? 'Kapanış anında sayılan eksik yok.'
                          : 'No gap was counted at the close.'}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-amber-800">
                        {tr ? 'Kapanışın dışında bıraktıkları: ' : 'What the close leaves out: '}
                        {gaps.join(' · ')}
                      </p>
                    ))}

                  {/* The drift. A late invoice is a real payment. */}
                  {period.entriesAddedAfterTheClose > 0 && (
                    <p className="mt-0.5 flex items-start gap-1.5 text-sm text-amber-900">
                      <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        {tr
                          ? `Kapanıştan sonra bu döneme ${period.entriesAddedAfterTheClose} kayıt girildi, toplam ${amount(period.addedAfterTheCloseKes, 'KES')}. Dondurulmuş rakam yerinde duruyor; aradaki fark budur.`
                          : `${period.entriesAddedAfterTheClose} entr(ies) were added to this period after it closed, totalling ${amount(period.addedAfterTheCloseKes, 'KES')}. The frozen figure stands; this is the difference.`}
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <WriteError error={close.error} />
        <WriteError error={exportError} />

        {lastFile != null && (
          <p
            className={`mt-2 rounded-lg border px-2.5 py-2 text-sm ${
              lastFile.withheld > 0
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {lastFile.withheld > 0
              ? tr
                ? `Dosya ${lastFile.written} kayıt içeriyor; ${lastFile.withheld} kayıt okuma yetkinizin üstünde olduğu için girmedi. Dosyanın ilk satırı bunu söylüyor — tam kayıt diye sunmayın.`
                : `The file holds ${lastFile.written} records; ${lastFile.withheld} were above your clearance and are not in it. The file's first line says so — do not present it as the complete record.`
              : tr
                ? `Dosya dönemin ${lastFile.written} kaydını içeriyor ve hiçbir kayıt yetki nedeniyle dışarıda kalmadı.`
                : `The file holds all ${lastFile.written} records in the period; nothing was withheld by clearance.`}
          </p>
        )}
      </div>
    </div>
  );
};
