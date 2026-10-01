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
import { assistantConfigured } from './assistant';

const KEY = ['translationReview'];

/** Whether anything could translate at all. No proxy, no key, no translation. */
export const translationConfigured = assistantConfigured;

export function useAutoTranslate() {
  const client = useQueryClient();

  return useCallback(
    async (entityKind: string, id: string): Promise<api.TranslationOutcome | null> => {
      if (!translationConfigured) return null;

      try {
        const outcome = await api.translateRecord({ entityKind, id });
        if (outcome.filled.length > 0) {
          void client.invalidateQueries({ queryKey: KEY });
          // The field now says something it did not; every screen reading it
          // is out of date.
          for (const key of [
            'meetings',
            'meeting',
            'decisions',
            'actions',
            'questions',
            'actionCandidates',
            'agenda',
          ]) {
            void client.invalidateQueries({ queryKey: [key] });
          }
        }
        return outcome;
      } catch {
        // See above: the save stands, the gap stands, nothing is claimed.
        return null;
      }
    },
    [client],
  );
}

export const useTranslationReview = () =>
  useQuery({ queryKey: KEY, queryFn: api.fetchTranslationReview });

function settled(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: KEY });
  for (const key of ['meetings', 'meeting', 'decisions', 'actions', 'questions']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
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
