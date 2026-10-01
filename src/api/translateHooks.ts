/**
 * Automatic translation, hung off the saves that create bilingual records
 * (M3-10).
 *
 * `afterSaving` is the shape every call site uses: the record has already been
 * written, the save has already succeeded, and this fills whichever half of a
 * bilingual field is empty. It never throws, because a translation that could
 * not be made is not a reason to tell somebody their minute failed to save —
 * the gap is simply still there, visible as an empty field, which is the
 * honest state.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './translate';
import { markedColumn, translates } from '../lib/translate';
import { assistantConfigured } from './assistant';

const KEY = ['translationReview'];

/** Whether anything could translate at all. No proxy, no key, no translation. */
export const translationConfigured = assistantConfigured;

/**
 * Translating what a save left single-language, hung on the create mutations
 * (M3-10).
 *
 * Takes the table and nothing else. A create mutation knows what it wrote; it
 * does not always know the new row's id, and making twenty-three api functions
 * return one would have been a lot of churn for a fact the sweep does not
 * need.
 *
 * Only the create paths. An update is somebody editing, and a machine writing
 * into the other language while a person is working in this one is the kind of
 * help nobody asked for.
 */
export function useAutoTranslate() {
  const client = useQueryClient();

  return useCallback(
    async (table: string): Promise<api.TranslationOutcome | null> => {
      if (!translationConfigured || !translates(table)) return null;
      try {
        // A create leaves at most a handful of gaps. The cap keeps a save from
        // turning into a sweep of an entire register.
        const outcome = await api.translateTable(table, { limit: 6 });
        if (outcome.filled.length > 0) settled(client);
        return outcome;
      } catch {
        // The save stands, the gap stands, nothing is claimed.
        return null;
      }
    },
    [client],
  );
}

/** The whole backlog, on purpose and with the count in front of somebody. */
export function useSweepTranslations() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (table: string) => api.translateTable(table, { limit: 60 }),
    onSuccess: () => settled(client),
  });
}

export const useTranslationReview = () =>
  useQuery({ queryKey: KEY, queryFn: api.fetchTranslationReview });

/**
 * Everything a translation can have changed. Broad on purpose: a field in any
 * of forty-three registers now says something it did not, and a screen showing
 * the old value with no badge is the state this feature exists to prevent.
 */
function settled(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: KEY });
  void client.invalidateQueries({ queryKey: ['translationBacklog'] });
  void client.invalidateQueries({ queryKey: ['machineMarked'] });
  void client.invalidateQueries();
}

export function useApproveTranslation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.approveTranslation,
    onSuccess: () => settled(client),
  });
}

export function useCorrectTranslation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.correctTranslation,
    onSuccess: () => settled(client),
  });
}

export const useTranslationBacklog = () =>
  useQuery({ queryKey: ['translationBacklog'], queryFn: api.fetchTranslationBacklog });

/**
 * The badge for a screenful of records.
 *
 * `is(id, base)` takes the field's base name and the side the text actually
 * came from, because `bilingualFrom` falls back: a reader in Turkish whose
 * record has no Turkish is shown the English, and badging that would put a
 * machine-translation warning on a sentence no machine wrote.
 */
export function useMachineMarks(table: string, ids: string[]) {
  // Sorted and joined so the key is stable while the list is the same set,
  // rather than refetching whenever the parent re-renders a new array.
  const key = [...ids].sort().join(',');
  const query = useQuery({
    queryKey: ['machineMarked', table, key],
    queryFn: () => api.fetchMachineMarked(table, ids),
    enabled: ids.length > 0,
  });

  const marks = query.data;
  return {
    is: (id: string, base: string, side: 'en' | 'tr' | null): boolean => {
      if (!marks) return false;
      // The three rules behind this live in markedColumn, where they can be
      // tested: a null side means nothing is on screen to mark.
      const column = markedColumn(table, base, side);
      return column != null && marks.has(`${id}:${column}`);
    },
  };
}

/**
 * The marks for a whole register, fetched once and shared by every row.
 *
 * `useMachineMarks` takes the ids a screen has; this takes none, because the
 * component that draws a badge is handed one row and cannot know the others.
 */
export function useTableMarks(table: string) {
  const query = useQuery({
    queryKey: ['machineMarked', table, 'all'],
    queryFn: () => api.fetchMachineMarked(table, null),
    enabled: translates(table),
  });
  const marks = query.data;
  return {
    is: (id: string, base: string, side: 'en' | 'tr' | null): boolean => {
      if (!marks) return false;
      const column = markedColumn(table, base, side);
      return column != null && marks.has(`${id}:${column}`);
    },
  };
}
