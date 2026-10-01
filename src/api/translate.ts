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
import { missingHalves, tableFor } from '../lib/translate';
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
export async function translateRecord(input: {
  entityKind: string;
  id: string;
}): Promise<TranslationOutcome> {
  const table = tableFor(input.entityKind);
  const outcome: TranslationOutcome = { filled: [], refused: [] };
  if (!table) return outcome;

  // The row is read back rather than taken from the caller. Two reasons, and
  // the first one was a bug before it was a reason: the client's objects are
  // camelCase (`titleTr`) while the registry names columns (`title_tr`), so a
  // filled field read through the wrong name looks empty and gets overwritten
  // by a translation of itself. And a row read back shows what the database
  // actually holds after defaults and triggers, which is what is being
  // translated.
  const { data, error } = await supabase.from(table).select('*').eq('id', input.id).maybeSingle();
  if (error || !data) {
    outcome.refused.push({
      column: '(the record)',
      reason: error?.message ?? 'the record could not be read back',
    });
    return outcome;
  }
  const row = data as Record<string, unknown>;

  for (const gap of missingHalves(input.entityKind, row)) {
    const result = await oneField(table, input.id, gap);
    if (result.ok) {
      outcome.filled.push({ column: gap.column, labelEn: gap.labelEn, labelTr: gap.labelTr });
    } else {
      outcome.refused.push({ column: gap.column, reason: result.reason });
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
