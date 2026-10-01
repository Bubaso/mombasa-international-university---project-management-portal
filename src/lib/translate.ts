/**
 * Which fields may be filled by a machine, and what they are called (M3-10).
 *
 * The portal is bilingual in 43 tables and 70 field pairs; measured on the
 * live database, 55 filled fields hold one language only. This registry is
 * not that list — it is the subset this feature writes into, which for now is
 * the meeting record and everything the meeting form produces, because that
 * is where the minutes are taken and where a Turkish-only or English-only
 * entry is created every week.
 *
 * It is deliberately a short, hand-written list rather than the schema-derived
 * `translatable_fields` view, for one reason: the view says what COULD be
 * translated, and a machine writing into a field nobody asked it to is the
 * failure mode worth avoiding. The database's whitelist is the safety net; this
 * is the intent.
 *
 * Two things every entry needs and the schema cannot supply: which column is
 * English and which is Turkish — `meetings` breaks the convention, its English
 * title being the NOT NULL `title` because every screen falls back to it — and
 * a name for the field that a reviewer would recognise on a review screen.
 */
import type { ContentLanguage } from '../types';

export interface FieldPair {
  en: string;
  tr: string;
  labelEn: string;
  labelTr: string;
}

export interface TranslatableEntity {
  table: string;
  fields: FieldPair[];
}

export const TRANSLATES: Record<string, TranslatableEntity> = {
  meeting: {
    table: 'meetings',
    fields: [{ en: 'title', tr: 'title_tr', labelEn: 'Title', labelTr: 'Başlık' }],
  },
  decision: {
    table: 'decisions',
    fields: [
      { en: 'text_en', tr: 'text_tr', labelEn: 'Decision', labelTr: 'Karar' },
      { en: 'rationale_en', tr: 'rationale_tr', labelEn: 'Rationale', labelTr: 'Gerekçe' },
    ],
  },
  action_item: {
    table: 'action_items',
    fields: [{ en: 'text_en', tr: 'text_tr', labelEn: 'Action', labelTr: 'Aksiyon' }],
  },
  action_candidate: {
    table: 'action_candidates',
    fields: [{ en: 'text_en', tr: 'text_tr', labelEn: 'Action line', labelTr: 'Aksiyon cümlesi' }],
  },
  open_question: {
    table: 'open_questions',
    fields: [
      { en: 'question_en', tr: 'question_tr', labelEn: 'Question', labelTr: 'Soru' },
      { en: 'detail_en', tr: 'detail_tr', labelEn: 'Detail', labelTr: 'Ayrıntı' },
      { en: 'answer_en', tr: 'answer_tr', labelEn: 'Answer', labelTr: 'Cevap' },
    ],
  },
};

/** What a field pair needs doing, if anything. */
export interface Missing {
  /** The column to write into. */
  column: string;
  /** The text to translate. */
  source: string;
  /** Which language the source is in, and which the result will be. */
  from: ContentLanguage;
  into: ContentLanguage;
  labelEn: string;
  labelTr: string;
}

const filled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * The gaps in one record: a side that is empty while the other side says
 * something.
 *
 * A pair with both sides filled is left alone — the point is never to
 * overwrite what a person wrote, in either language. A pair with neither side
 * filled has nothing to translate from, and is not a gap but an empty field.
 */
export function missingHalves(
  entityKind: keyof typeof TRANSLATES | string,
  row: Record<string, unknown>,
): Missing[] {
  const entity = TRANSLATES[entityKind];
  if (!entity) return [];

  const gaps: Missing[] = [];
  for (const pair of entity.fields) {
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

export function tableFor(entityKind: string): string | null {
  return TRANSLATES[entityKind]?.table ?? null;
}
