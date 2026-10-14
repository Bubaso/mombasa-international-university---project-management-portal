/**
 * A bilingual field, with the mark on it when a machine wrote it (M3-10).
 *
 * Seventeen registers render one of these, and before this component each
 * would have needed its own hook, its own imports and its own call to
 * markedColumn — seventeen chances to key the badge to the reader's language
 * instead of to the column the words came from, which is the mistake that is
 * silent when made.
 *
 * The marks are fetched once per table and shared by every row through the
 * query cache, which is why machine_marked takes a null id list: a component
 * handed one row cannot know the other ninety-nine.
 */
import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTableMarks } from '../../api/translateHooks';
import { MachineBadge } from './MachineBadge';
import { bilingualFrom } from '../../lib/meetings';

export const Bilingual: React.FC<{
  table: string;
  id: string;
  base: string;
  en: string | null | undefined;
  tr: string | null | undefined;
  /** What to show when neither language says anything. */
  fallback?: string;
}> = ({ table, id, base, en, tr, fallback = '' }) => {
  const { language } = useApp();
  const marks = useTableMarks(table);
  const { text, side } = bilingualFrom(en, tr, language);
  return (
    <>
      {text || fallback}
      {marks.is(id, base, side) && <MachineBadge className="ml-1.5" />}
    </>
  );
};
