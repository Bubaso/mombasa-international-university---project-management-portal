/**
 * The audit file (M8-16).
 *
 * The thing that makes this file dangerous is that it looks complete. Row
 * level security means an export taken by somebody without the top clearance
 * silently leaves rows out, and a spreadsheet of forty payments headed
 * "2026-Q1" will be read as the quarter's payments by everybody who opens it
 * afterwards. Nothing in the file itself would say otherwise.
 *
 * So the file leads with its own manifest, and the manifest is not a courtesy
 * header: it carries how many rows the period holds, how many are in the
 * file, how many are not and at which tier, how many entries arrived after
 * the close, and the gaps counted at the close. Where anything was withheld
 * the file says in its first line that it is not the complete record, in
 * words, before any number.
 *
 * The rows themselves are plain RFC 4180 CSV, quoted the same way the
 * contact export does it, with a byte-order mark so Excel reads Turkish as
 * Turkish.
 */

/** What a manifest row looks like coming out of audit_file_manifest. */
export interface AuditManifest {
  code: string;
  startsOn: string;
  endsOn: string;
  state: 'open' | 'closed';
  closedAt: string | null;
  rowsInThePeriod: number;
  rowsYouCanRead: number;
  rowsWithheld: number;
  withheldByTier: Record<string, number>;
  gaps: Record<string, number> | null;
  entriesAddedAfterTheClose: number;
}

export interface AuditRow {
  referenceNo: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  amountKes: number | null;
  payee: string | null;
  paymentVoucherId: string | null;
  documentId: string | null;
  auditedAt: string | null;
  confidentiality: string;
}

export interface AuditFile {
  text: string;
  /** Rows actually written into the file. */
  written: number;
  /** Rows the period holds that are not in it. */
  withheld: number;
  /** Whether the file may be described as the period's complete record. */
  complete: boolean;
}

function cell(value: string | number | null): string {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  'reference_no',
  'date',
  'category',
  'description',
  'amount',
  'currency',
  'amount_kes',
  'payee',
  'payment_voucher_id',
  'document_id',
  'audited_at',
  'confidentiality',
];

/** The gap keys, in the order a reader should meet them, with their words. */
const GAP_WORDS: { key: string; tr: string; en: string }[] = [
  {
    key: 'vouchers_never_decided',
    tr: 'Karara bağlanmamış ödeme talebi',
    en: 'Vouchers never decided',
  },
  {
    key: 'vouchers_approved_not_paid',
    tr: 'Onaylanıp ödenmemiş talep',
    en: 'Vouchers approved and not paid',
  },
  {
    key: 'vouchers_paid_with_no_ledger_entry',
    tr: 'Ödenmiş ama kasa defterinde karşılığı olmayan talep',
    en: 'Vouchers paid with no ledger entry',
  },
  {
    key: 'ledger_entries_with_no_document',
    tr: 'Belgesi olmayan kayıt',
    en: 'Ledger entries with no document',
  },
  {
    key: 'ledger_entries_never_audited',
    tr: 'Denetlenmemiş kayıt',
    en: 'Ledger entries never audited',
  },
  {
    key: 'ledger_entries_with_no_voucher',
    tr: 'Ödeme talebi olmayan kayıt',
    en: 'Ledger entries with no voucher',
  },
  {
    key: 'receipts_with_no_document',
    tr: 'Makbuzu olmayan tahsilat',
    en: 'Receipts with no document',
  },
  {
    key: 'certified_work_not_paid',
    tr: 'Onaylanmış ama ödenmemiş hakediş',
    en: 'Certified work not paid',
  },
];

export function toAuditFile(
  rows: AuditRow[],
  manifest: AuditManifest,
  options: { language: 'tr' | 'en' },
): AuditFile {
  const tr = options.language === 'tr';
  const complete = manifest.rowsWithheld === 0;
  const lines: string[] = [];

  const say = (label: string, value: string | number | null) =>
    lines.push(`${cell(label)},${cell(value)}`);

  // The warning first, in words, before any figure. A number buried in a
  // header is a number a reader scrolls past.
  if (!complete) {
    lines.push(
      cell(
        tr
          ? 'DİKKAT: bu dosya dönemin tam kaydı DEĞİLDİR. Okuma yetkinizin üstündeki ' +
              'kayıtlar dosyaya girmedi; sayısı ve seviyesi aşağıda.'
          : 'NOTE: this file is NOT the complete record of the period. Rows above ' +
              'your clearance are not in it; the count and the tier are below.',
      ),
    );
    lines.push('');
  }

  say(tr ? 'Dönem' : 'Period', manifest.code);
  say(tr ? 'Başlangıç' : 'Starts', manifest.startsOn);
  say(tr ? 'Bitiş' : 'Ends', manifest.endsOn);
  say(
    tr ? 'Durum' : 'State',
    manifest.state === 'closed' ? (tr ? 'Kapandı' : 'Closed') : tr ? 'Açık' : 'Open',
  );
  // An open period's figures are not a close. Said here because a file taken
  // mid-quarter is otherwise indistinguishable from one taken after it.
  if (manifest.state !== 'closed') {
    say(
      tr ? 'Uyarı' : 'Caution',
      tr
        ? 'Dönem kapanmadı; bu rakamlar bir kapanış değil, o anki hâldir'
        : 'The period is not closed; these are the figures as they stand, not a close',
    );
  }
  say(tr ? 'Kapanış anı' : 'Closed at', manifest.closedAt);
  say(tr ? 'Dönemdeki kayıt' : 'Rows in the period', manifest.rowsInThePeriod);
  say(tr ? 'Bu dosyadaki kayıt' : 'Rows in this file', rows.length);
  say(tr ? 'Bu dosyada olmayan' : 'Rows withheld', manifest.rowsWithheld);

  const tiers = Object.entries(manifest.withheldByTier);
  if (tiers.length > 0) {
    say(
      tr ? 'Yetki dışı kalan seviyeler' : 'Withheld by tier',
      tiers.map(([tier, n]) => `${tier}: ${n}`).join('; '),
    );
  }
  say(
    tr ? 'Kapanıştan sonra girilen' : 'Entered after the close',
    manifest.entriesAddedAfterTheClose,
  );

  // The gaps, as counted at the close. A close with no gap list is one that
  // has not been taken yet, and the file says that rather than printing eight
  // zeroes.
  lines.push('');
  lines.push(cell(tr ? 'Kapanışta sayılan eksikler' : 'Gaps counted at the close'));
  if (manifest.gaps == null) {
    lines.push(
      cell(
        tr
          ? 'Kapanış alınmadığı için eksikler sayılmadı — bu sıfır demek değil'
          : 'The close has not been taken, so the gaps were never counted — which is not zero',
      ),
    );
  } else {
    for (const gap of GAP_WORDS) {
      say(tr ? gap.tr : gap.en, manifest.gaps[gap.key] ?? null);
    }
  }

  lines.push('');
  lines.push(cell(tr ? 'Kayıtlar' : 'Records'));
  lines.push(COLUMNS.join(','));
  for (const row of rows) {
    lines.push(
      [
        row.referenceNo,
        row.date,
        row.category,
        row.description,
        row.amount,
        row.currency,
        row.amountKes,
        row.payee,
        row.paymentVoucherId,
        row.documentId,
        row.auditedAt,
        row.confidentiality,
      ]
        .map(cell)
        .join(','),
    );
  }

  return {
    text: '﻿' + lines.join('\r\n') + '\r\n',
    written: rows.length,
    withheld: manifest.rowsWithheld,
    complete,
  };
}

/** The file's name. The period and the day it was taken, so two differ. */
export function auditFileName(code: string, takenOn: Date): string {
  const day = takenOn.toISOString().slice(0, 10);
  return `denetim-${code.replace(/[^A-Za-z0-9-]/g, '-')}-${day}.csv`;
}
