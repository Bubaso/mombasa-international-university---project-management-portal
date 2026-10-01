/**
 * Which fields a machine may fill, and what they are called (M3-10).
 *
 * Derived from a measurement of the live schema: 43 tables carry a bilingual
 * field pair, 70 pairs in all, and 55 of the filled fields held one language
 * only — mostly the registers derived from the Notion archive, written in
 * English because that is the language the derivation was done in. A Turkish
 * trustee opening the obligations register read English or nothing.
 *
 * The registry is a table-to-bases map rather than seventy hand-written
 * entries. Three pairs are deliberately left out, and each is a rule
 * elsewhere in the schema rather than a preference:
 *
 *   notifications.title      — raised by the sweep in 0033 with both languages
 *                              already written, so there is never a half to
 *                              fill, and translating one would be rewriting a
 *                              message that has already been delivered.
 *
 *   action_candidates.text    — the sentence somebody wrote in a minute, which
 *                              0032 refuses to let anybody rewrite. It is a
 *                              quotation, and translating a quotation in place
 *                              alters it. A backfill learned this the hard
 *                              way: the UPDATE was refused by the trigger and
 *                              the marker was written anyway, leaving a claim
 *                              of machine text in an empty field — which is
 *                              exactly the state this feature exists to
 *                              prevent.
 *
 *   supplier_reviews.note     — append-only, under refuse_audit_mutation.
 *
 * Where a refusal is CONDITIONAL — a signed decision, a signed inspection —
 * the table stays, because translateRecord checks the write before it writes
 * the marker and a refusal leaves the field and the record both untouched.
 *
 * Two things the schema cannot supply:
 *
 *   `meetings` breaks the naming convention — its English title is the NOT
 *   NULL `title`, because every screen falls back to it.
 *
 *   A name for each field that a reviewer would recognise on the review
 *   screen. Thirty-three base names cover all seventy pairs, so the labels are
 *   a map over those rather than per table.
 */
import type { ContentLanguage } from '../types';

/** What each base name is called, for the review screen. */
const LABELS: Record<string, { en: string; tr: string }> = {
  answer: { en: 'Answer', tr: 'Cevap' },
  basis: { en: 'Basis', tr: 'Dayanak' },
  decision_note: { en: 'Award note', tr: 'Karar notu' },
  description: { en: 'Description', tr: 'Açıklama' },
  detail: { en: 'Detail', tr: 'Ayrıntı' },
  early_warning: { en: 'Early warning', tr: 'Erken uyarı' },
  interest: { en: 'Interest declared', tr: 'Beyan edilen menfaat' },
  intervention: { en: 'Response', tr: 'Müdahale' },
  justification: { en: 'Justification', tr: 'Gerekçe' },
  legal_basis: { en: 'Legal basis', tr: 'Hukukî dayanak' },
  name: { en: 'Name', tr: 'Ad' },
  need: { en: 'Need', tr: 'İhtiyaç' },
  note: { en: 'Note', tr: 'Not' },
  objective: { en: 'Objective', tr: 'Amaç' },
  outcome: { en: 'Outcome', tr: 'Sonuç' },
  position: { en: 'Position', tr: 'Tutum' },
  purpose: { en: 'Purpose', tr: 'Amaç' },
  question: { en: 'Question', tr: 'Soru' },
  rationale: { en: 'Rationale', tr: 'Gerekçe' },
  references: { en: 'References', tr: 'Referanslar' },
  remit: { en: 'Remit', tr: 'Görev alanı' },
  resolution: { en: 'Resolution', tr: 'Çözüm' },
  response_plan: { en: 'Response plan', tr: 'Müdahale planı' },
  scope: { en: 'Scope', tr: 'Kapsam' },
  seat: { en: 'Seat', tr: 'Koltuk' },
  statement: { en: 'Statement', tr: 'İfade' },
  strengths: { en: 'Strengths', tr: 'Güçlü yönler' },
  subject: { en: 'Subject', tr: 'Konu' },
  summary: { en: 'Summary', tr: 'Özet' },
  termination: { en: 'Termination', tr: 'Fesih' },
  text: { en: 'Text', tr: 'Metin' },
  title: { en: 'Title', tr: 'Başlık' },
  trigger: { en: 'Trigger', tr: 'Tetikleyici' },
  weaknesses: { en: 'Weaknesses', tr: 'Zayıf yönler' },
};

/** Every bilingual pair in the portal, by table. */
const BASES: Record<string, string[]> = {
  academic_programmes: ['name'],
  accreditation_requirements: ['detail', 'position', 'title'],
  action_items: ['text'],
  assumptions: ['statement'],
  boq_items: ['description'],
  budget_categories: ['name'],
  budget_lines: ['title'],
  charter_stages: ['detail', 'title'],
  chronology_entries: ['detail', 'title'],
  compliance_requirements: ['detail', 'title'],
  conflict_declarations: ['interest'],
  construction_blocks: ['purpose'],
  contract_milestones: ['title'],
  contract_terms: ['detail', 'title'],
  contractors: ['scope'],
  contracts: ['subject', 'termination'],
  correspondence: ['subject'],
  decisions: ['rationale', 'text'],
  dependencies: ['note'],
  document_vault: ['description'],
  donations: ['purpose'],
  governance_organs: ['name', 'remit'],
  hearings: ['outcome'],
  inspection_findings: ['description'],
  issues: ['detail', 'resolution', 'title'],
  legal_cases: ['description'],
  legal_orders: ['text'],
  meetings: ['title'],
  milestones: ['detail', 'title'],
  obligation_targets: ['basis'],
  obligations: ['detail', 'title'],
  open_question_parties: ['position'],
  open_questions: ['answer', 'detail', 'question'],
  procurement_candidates: ['decision_note', 'references', 'scope', 'strengths', 'weaknesses'],
  procurement_requests: ['justification', 'need'],
  project_phases: ['name', 'objective', 'scope'],
  risks: ['detail', 'early_warning', 'response_plan', 'title', 'trigger'],
  site_incidents: ['description', 'intervention'],
  site_inspections: ['summary'],
  site_tasks: ['legal_basis', 'title'],
  trustees: ['seat'],
  work_packages: ['title'],
};

export interface FieldPair {
  base: string;
  en: string;
  tr: string;
  labelEn: string;
  labelTr: string;
}

/** The English column of a pair. `meetings.title` is the one exception. */
export function enColumn(table: string, base: string): string {
  return table === 'meetings' && base === 'title' ? 'title' : `${base}_en`;
}

export function fieldsOf(table: string): FieldPair[] {
  return (BASES[table] ?? []).map((base) => ({
    base,
    en: enColumn(table, base),
    tr: `${base}_tr`,
    labelEn: LABELS[base]?.en ?? base,
    labelTr: LABELS[base]?.tr ?? base,
  }));
}

export const TRANSLATED_TABLES = Object.keys(BASES);

export function translates(table: string): boolean {
  return table in BASES;
}

/** What a field pair needs doing, if anything. */
export interface Missing {
  column: string;
  source: string;
  from: ContentLanguage;
  into: ContentLanguage;
  labelEn: string;
  labelTr: string;
}

const filled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * The gaps in one row: a side that is empty while the other says something.
 *
 * A pair with both sides filled is left alone — the point is never to
 * overwrite what a person wrote, in either language. A pair with neither side
 * filled has nothing to translate from, and is an empty field rather than a
 * gap.
 */
export function missingHalves(table: string, row: Record<string, unknown>): Missing[] {
  const gaps: Missing[] = [];
  for (const pair of fieldsOf(table)) {
    const en = row[pair.en];
    const tr = row[pair.tr];
    if (filled(en) && !filled(tr)) {
      gaps.push({
        column: pair.tr,
        source: en,
        from: 'en',
        into: 'tr',
        labelEn: pair.labelEn,
        labelTr: pair.labelTr,
      });
    } else if (filled(tr) && !filled(en)) {
      gaps.push({
        column: pair.en,
        source: tr,
        from: 'tr',
        into: 'en',
        labelEn: pair.labelEn,
        labelTr: pair.labelTr,
      });
    }
  }
  return gaps;
}

/** The columns to read when looking for gaps in a table. */
export function columnsOf(table: string): string[] {
  const pairs = fieldsOf(table);
  return ['id', ...pairs.flatMap((p) => [p.en, p.tr])];
}

/**
 * Which column a badge would be about, given the side that actually supplied
 * the text on screen.
 *
 * Pure, and here rather than in the hook, because two of its three rules are
 * easy to get wrong and silent when wrong — and a rule nothing can test is a
 * rule nobody is keeping. A mutation that ignored the null case survived the
 * browser tests, which is how this function came to exist.
 *
 *   null side      — the field is empty in both languages, so nothing is on
 *                    screen and there is nothing to mark. Badging it would
 *                    claim a machine wrote a sentence that is not there.
 *   meetings.title — the pair that breaks the convention.
 *   everything else is <base>_<side>.
 */
export function markedColumn(table: string, base: string, side: 'en' | 'tr' | null): string | null {
  if (!side) return null;
  return side === 'en' ? enColumn(table, base) : `${base}_tr`;
}
