import type { DonationState, Language, VoucherState } from '../types';
import { wordFor } from './labels';

type Bilingual = { tr: string; en: string };

const VOUCHER_STATES: Record<VoucherState, Bilingual> = {
  requested: { tr: 'Talep edildi', en: 'Requested' },
  approved: { tr: 'Onaylandı', en: 'Approved' },
  rejected: { tr: 'Reddedildi', en: 'Rejected' },
  paid: { tr: 'Ödendi', en: 'Paid' },
  withdrawn: { tr: 'Geri çekildi', en: 'Withdrawn' },
};

export const voucherStateLabel = (s: VoucherState, l: Language) => wordFor(VOUCHER_STATES, s, l);

export function voucherStateStyle(state: VoucherState): string {
  switch (state) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'approved':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'withdrawn':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-amber-100 text-amber-900 border-amber-300';
  }
}

const DONATION_STATES: Record<DonationState, Bilingual> = {
  pledged: { tr: 'Taahhüt edildi', en: 'Pledged' },
  partly_received: { tr: 'Kısmen geldi', en: 'Partly received' },
  received: { tr: 'Tamamı geldi', en: 'Received' },
  lapsed: { tr: 'Düştü', en: 'Lapsed' },
};

export const donationStateLabel = (s: DonationState, l: Language) => wordFor(DONATION_STATES, s, l);

const CATEGORIES: Record<string, Bilingual> = {
  civil_construction: { tr: 'İnşaat', en: 'Civil construction' },
  architectural_qs: { tr: 'Mimari / metraj', en: 'Architectural and QS' },
  legal_defence: { tr: 'Hukukî savunma', en: 'Legal defence' },
  site_security: { tr: 'Saha güvenliği', en: 'Site security' },
  land_administration: { tr: 'Arazi idaresi', en: 'Land administration' },
  statutory_compliance: { tr: 'Yasal yükümlülükler', en: 'Statutory compliance' },
};

export const TRANSACTION_CATEGORIES = Object.keys(CATEGORIES);

export const transactionCategoryLabel = (c: string, l: Language) => CATEGORIES[c]?.[l] ?? c;

/**
 * A share of a total, or null when the total is nothing.
 *
 * Null rather than zero on purpose: "this category is 0% of the budget" and
 * "there is no budget to be a percentage of" are different statements, and
 * only one of them should ever be drawn as an empty bar.
 */
export function share(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/**
 * Comma-separated values for the whole ledger (M8-10).
 *
 * The module this replaces reported a live QuickBooks connection that was a
 * `setTimeout`. What replaces it is not a smaller lie: it is a file. Every
 * amount goes out in the currency it was recorded in *and* in base, with the
 * rate beside them, so nothing about the conversion has to be taken on trust.
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (value: unknown): string => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((c) => escape(row[c])).join(',')),
  ].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // A BOM, so a spreadsheet opens the Turkish column headings as UTF-8
  // instead of guessing at a code page.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
