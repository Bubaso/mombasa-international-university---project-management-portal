/** Labels, section order and the Markdown export for compiled reports (M12). */
import type { ReportKind, ReportRow, ReportRun, ReportState } from '../types';
import { wordFor } from './labels';

export const KINDS: { key: ReportKind; tr: string; en: string; why: { tr: string; en: string } }[] =
  [
    {
      key: 'board_pack',
      tr: 'Mütevelli toplantı dosyası',
      en: 'Board pack',
      why: {
        tr: 'Gündem, açık aksiyonlar, mali özet, hukukî durum, riskler ve karar bekleyenler — bir toplantı için derlenir.',
        en: 'Agenda, open actions, money, legal position, risks and what awaits a decision — compiled for one meeting.',
      },
    },
    {
      key: 'donor_report',
      tr: 'Bağışçı raporu',
      en: 'Donor report',
      why: {
        tr: 'Bağışçının kendi katkısı, kaynakların kategori bazında kullanımı ve yayımlanmış gelişmeler. Yayımlanmadan önce başka biri onaylar.',
        en: 'The donor’s own contribution, the use of funds by category, and what has been published. Approved by somebody else before it goes out.',
      },
    },
    {
      key: 'status_report',
      tr: 'Proje durum raporu',
      en: 'Project status report',
      why: {
        tr: 'Seçilen tarih aralığı için: ne oldu, inşaat, para, kilometre taşları, riskler ve sırada ne var.',
        en: 'For the dates you pick: what happened, construction, money, milestones, risks and what comes next.',
      },
    },
  ];

export const kindName = (key: ReportKind, tr: boolean): string => {
  const found = KINDS.find((k) => k.key === key);
  return found ? (tr ? found.tr : found.en) : key;
};

export const STATE_LABEL: Record<ReportState, { tr: string; en: string; tone: string }> = {
  draft: {
    tr: 'taslak',
    en: 'draft',
    tone: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  approved: {
    tr: 'onaylandı',
    en: 'approved',
    tone: 'border-sky-300 bg-sky-50 text-sky-900',
  },
  published: {
    tr: 'yayımlandı',
    en: 'published',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  withdrawn: {
    tr: 'geri çekildi',
    en: 'withdrawn',
    tone: 'border-rose-300 bg-rose-50 text-rose-900',
  },
};

/** The sections as the compilers name them, with headings. */
const SECTION: Record<string, { tr: string; en: string }> = {
  meeting: { tr: 'Toplantı', en: 'The meeting' },
  agenda: { tr: 'Gündem', en: 'Agenda' },
  money: { tr: 'Mali özet', en: 'Money' },
  legal: { tr: 'Hukukî durum', en: 'Legal position' },
  risks: { tr: 'Riskler', en: 'Risks' },
  'decisions wanted': { tr: 'Karar bekleyenler', en: 'Awaiting a decision' },
  'falling due': { tr: 'Vadesi gelenler', en: 'Falling due' },
  donor: { tr: 'Bağışçı', en: 'The donor' },
  'your contribution': { tr: 'Katkınız', en: 'Your contribution' },
  'use of funds': { tr: 'Kaynakların kullanımı', en: 'Use of funds' },
  'what was achieved': { tr: 'Neler başarıldı', en: 'What was achieved' },
  period: { tr: 'Dönem', en: 'Period' },
  'what happened': { tr: 'Olanlar', en: 'What happened' },
  construction: { tr: 'İnşaat', en: 'Construction' },
  milestones: { tr: 'Kilometre taşları', en: 'Milestones' },
  'what comes next': { tr: 'Sırada ne var', en: 'What comes next' },
};

export const sectionName = (key: string, tr: boolean): string => {
  const found = SECTION[key];
  return found ? (tr ? found.tr : found.en) : key;
};

/** The sections in the order the compiler produced them, de-duplicated. */
export function sectionsOf(rows: ReportRow[]): string[] {
  const seen: string[] = [];
  for (const row of rows) if (!seen.includes(row.section)) seen.push(row.section);
  return seen;
}

function formatValue(row: ReportRow, tr: boolean): string {
  const parts: string[] = [];
  if (row.valueNumber != null) {
    const n = new Intl.NumberFormat(tr ? 'tr-TR' : 'en-GB').format(row.valueNumber);
    parts.push(row.unit ? `${n} ${row.unit}` : n);
  }
  if (row.valueText) parts.push(row.valueText);
  return parts.join(' · ');
}

/**
 * The report as Markdown.
 *
 * This is the export, and it is deliberately Markdown rather than a .docx:
 * there is no document generator in this project, Word opens Markdown, and a
 * PDF comes from the browser's own print dialogue — which really does produce
 * a PDF. Claiming a generator that does not exist would be the same class of
 * defect as the vault's old "SHA-256 verified".
 *
 * The source column travels with the export. A figure that leaves the portal
 * without the register it came from is exactly the figure the requirement's
 * measure counts.
 */
export function toMarkdown(run: ReportRun, tr: boolean): string {
  const lines: string[] = [];
  lines.push(`# ${run.title}`);
  lines.push('');
  lines.push(`${kindName(run.kind, tr)} · ${wordFor(STATE_LABEL, run.state, tr ? 'tr' : 'en')}`);
  if (run.periodFrom && run.periodTo) {
    lines.push(`${tr ? 'Dönem' : 'Period'}: ${run.periodFrom} — ${run.periodTo}`);
  }
  if (run.meetingTitle) lines.push(`${tr ? 'Toplantı' : 'Meeting'}: ${run.meetingTitle}`);
  if (run.stakeholderName) lines.push(`${tr ? 'Bağışçı' : 'Donor'}: ${run.stakeholderName}`);
  lines.push(
    `${tr ? 'Derleyen' : 'Compiled by'}: ${run.preparedByName ?? '—'} · ${run.preparedAt.slice(0, 10)}`,
  );
  if (run.approvedByName) {
    lines.push(
      `${tr ? 'Onaylayan' : 'Approved by'}: ${run.approvedByName} · ${(run.approvedAt ?? '').slice(0, 10)}`,
    );
  }
  lines.push('');
  lines.push(
    tr
      ? '> Bu rapor kütüklerden derlendi. Her satır hangi kütükten geldiğini taşır.'
      : '> Compiled from the registers. Each row names the register it came from.',
  );

  for (const section of sectionsOf(run.rows)) {
    lines.push('');
    lines.push(`## ${sectionName(section, tr)}`);
    lines.push('');
    lines.push(
      `| ${tr ? 'Kalem' : 'Item'} | ${tr ? 'Değer' : 'Value'} | ${tr ? 'Kaynak' : 'Source'} |`,
    );
    lines.push('| --- | --- | --- |');
    for (const row of run.rows.filter((r) => r.section === section)) {
      const label = (tr ? row.labelTr : row.labelEn) ?? row.labelEn ?? '—';
      lines.push(
        `| ${label.replace(/\|/g, '\\|')} | ${formatValue(row, tr).replace(/\|/g, '\\|')} | ${row.sourceNote ?? '—'} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

export { formatValue };
