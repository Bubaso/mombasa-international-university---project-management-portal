/**
 * Filling the other half of a bilingual field, and saying a machine did it
 * (M3-10, M13-09).
 *
 * The order of the two writes matters and is the whole honesty of this file:
 *
 *   1. write the translated text into the column
 *   2. record where it came from
 *
 * If the second fails, the field holds machine text that nothing marks as
 * machine text — the exact condition this feature must not create. So a failed
 * marker is not swallowed: the text is put back to empty and the gap is
 * reported. A missing translation is a visible absence; an unmarked one is an
 * invisible claim, and of the two the absence is the one to prefer.
 *
 * Nothing here overwrites a filled field. The gaps come from missingHalves(),
 * which only ever names a side that is empty while the other side says
 * something.
 */
import { supabase } from '../lib/supabase';
import { ask } from './assistant';
import { columnsOf, missingHalves, translates } from '../lib/translate';
import type { Missing } from '../lib/translate';
import type { ContentLanguage } from '../types';

export interface TranslationOutcome {
  /** Fields now holding a marked machine translation. */
  filled: { column: string; labelEn: string; labelTr: string }[];
  /** Fields that were left alone, with why. */
  refused: { column: string; reason: string }[];
}

async function oneField(
  table: string,
  id: string,
  gap: Missing,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let text: string;
  let model: string;
  try {
    const answer = await ask({
      task: 'translation',
      text: gap.source,
      from: gap.from,
      to: gap.into,
    });
    if (answer.refused || !answer.text) {
      return { ok: false, reason: answer.messageEn ?? 'the assistant declined' };
    }
    text = answer.text.trim();
    // The model is provenance and the client must not guess it. Without it
    // there is nothing honest to record, so there is nothing to write.
    if (!answer.model) {
      return { ok: false, reason: 'the proxy did not say which model answered' };
    }
    model = answer.model;
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const { error: writeError } = await supabase
    .from(table)
    .update({ [gap.column]: text })
    .eq('id', id);
  if (writeError) return { ok: false, reason: writeError.message };

  const { error: markError } = await supabase.rpc('record_machine_translation', {
    p_table: table,
    p_id: id,
    p_column: gap.column,
    p_into: gap.into,
    p_from: gap.from,
    p_model: model,
    p_text: text,
  });

  if (markError) {
    // Unmarked machine text is worse than an empty field, so it goes back.
    await supabase
      .from(table)
      .update({ [gap.column]: null })
      .eq('id', id);
    return {
      ok: false,
      reason: `could not mark it as a machine translation: ${markError.message}`,
    };
  }

  return { ok: true };
}

/**
 * Translates whatever is missing in one record.
 *
 * Returns rather than throws: this runs after a save that has already
 * succeeded, and a translation that could not be made is not a reason to tell
 * somebody their minute failed to save.
 */
/**
 * Translates whatever is missing in one table.
 *
 * Keyed on the table rather than on a record id, and that is what made the
 * rest of the portal reachable. A create mutation knows which table it wrote
 * but not always what the new row's id is — twenty-three of them returned
 * void — and changing all of their signatures to find out would have been a
 * great deal of churn for a fact this does not need. Sweeping the table it
 * just wrote finds the new row's gap and, as a side effect, any gap an earlier
 * record was left with.
 *
 * Returns rather than throws: this runs after a save that has already
 * succeeded, and a translation that could not be made is not a reason to tell
 * somebody their record failed to save. The gap simply stays, visible as an
 * empty field, which is the honest state.
 */
export async function translateTable(
  table: string,
  options: { limit?: number } = {},
): Promise<TranslationOutcome> {
  const outcome: TranslationOutcome = { filled: [], refused: [] };
  if (!translates(table)) return outcome;

  // Read only the bilingual columns. These registers are small — the largest
  // is 103 rows — so the gaps are found by reading rather than by a filter
  // expression that would have to be built per pair.
  const { data, error } = await supabase.from(table).select(columnsOf(table).join(', ')).limit(500);
  if (error) {
    outcome.refused.push({ column: `(${table})`, reason: error.message });
    return outcome;
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const limit = options.limit ?? 40;

  for (const row of rows) {
    const id = row.id as string | undefined;
    if (!id) continue;
    for (const gap of missingHalves(table, row)) {
      if (outcome.filled.length >= limit) return outcome;
      const result = await oneField(table, id, gap);
      if (result.ok) {
        outcome.filled.push({ column: gap.column, labelEn: gap.labelEn, labelTr: gap.labelTr });
      } else {
        outcome.refused.push({ column: gap.column, reason: result.reason });
      }
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

export interface TranslationReviewRow {
  id: string;
  entityTable: string;
  entityId: string;
  columnName: string;
  intoLanguage: ContentLanguage;
  fromLanguage: ContentLanguage;
  model: string;
  machineText: string;
  currentText: string;
  stillTheMachinesWords: boolean;
  translatedAt: string;
  approvedAt: string | null;
  corrected: boolean;
}

export async function fetchTranslationReview(): Promise<TranslationReviewRow[]> {
  const { data, error } = await supabase.rpc('translation_review');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    entityTable: row.entity_table as string,
    entityId: row.entity_id as string,
    columnName: row.column_name as string,
    intoLanguage: row.into_language as ContentLanguage,
    fromLanguage: row.from_language as ContentLanguage,
    model: row.model as string,
    machineText: row.machine_text as string,
    currentText: row.current_text as string,
    stillTheMachinesWords: Boolean(row.still_the_machines_words),
    translatedAt: row.translated_at as string,
    approvedAt: row.approved_at as string | null,
    corrected: Boolean(row.corrected),
  }));
}

export async function approveTranslation(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_translation', { p_id: id });
  if (error) throw new Error(error.message);
}

/**
 * Rewriting one. The text is written by the ordinary update, which is also
 * what makes the marker's machine_text disagree with the field from then on —
 * so the record of "the machine said X and a person made it Y" survives.
 */
export async function correctTranslation(input: {
  id: string;
  table: string;
  entityId: string;
  column: string;
  text: string;
}): Promise<void> {
  if (!input.text.trim()) {
    throw new Error('A correction cannot be empty — approve it or rewrite it.');
  }
  const { error: writeError } = await supabase
    .from(input.table)
    .update({ [input.column]: input.text.trim() })
    .eq('id', input.entityId);
  if (writeError) throw new Error(writeError.message);

  const { error } = await supabase.rpc('mark_translation_corrected', { p_id: input.id });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// How much of the portal is single-language
// ---------------------------------------------------------------------------

export interface BacklogRow {
  entityTable: string;
  base: string;
  onlyEn: number;
  onlyTr: number;
  inBoth: number;
}

export async function fetchTranslationBacklog(): Promise<BacklogRow[]> {
  const { data, error } = await supabase.rpc('translation_backlog');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      entityTable: row.entity_table as string,
      base: row.base as string,
      onlyEn: Number(row.only_en),
      onlyTr: Number(row.only_tr),
      inBoth: Number(row.in_both),
    }))
    .filter((row) => row.onlyEn + row.onlyTr > 0)
    .sort((a, b) => b.onlyEn + b.onlyTr - (a.onlyEn + a.onlyTr));
}

// ---------------------------------------------------------------------------
// The badge, for every reader
// ---------------------------------------------------------------------------

/**
 * Which of these records hold unapproved machine text, and in which column.
 *
 * Deliberately not a read of machine_translations: that table is internal-only,
 * which would leave a donor or outside counsel reading machine-written Turkish
 * with nothing to say so — the readers who most need telling. The function
 * returns a location and never a wording, and only for the ids it is given.
 */
export async function fetchMachineMarked(
  table: string,
  ids: string[] | null,
): Promise<Set<string>> {
  if (ids !== null && ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc('machine_marked', {
    p_table: table,
    // Null asks about the whole register, which is what a component handed one
    // row of it needs: the marks are then fetched once and shared.
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
  return new Set(
    ((data ?? []) as Record<string, unknown>[]).map(
      (row) => `${row.entity_id as string}:${row.column_name as string}`,
    ),
  );
}
