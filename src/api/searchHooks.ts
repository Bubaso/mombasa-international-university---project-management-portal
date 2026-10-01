/** Query hooks for the search box and the searches somebody keeps (M13). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MIN_QUERY,
  deleteSavedSearch,
  fetchSavedSearches,
  saveSearch,
  searchRecords,
  fetchSimilarRecords,
} from './search';
import type { SearchKind } from '../types';

export function useSearch(query: string, kinds?: SearchKind[] | null, limit = 30) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed, kinds ?? null, limit],
    queryFn: () => searchRecords(trimmed, kinds, limit),
    // Below the floor there is nothing to ask for. Disabling rather than
    // returning early keeps the four fetch states honest: an idle box is not
    // a box that found nothing.
    enabled: trimmed.length >= MIN_QUERY,
    // A search is a question about right now, but the same question asked
    // twice in a minute has the same answer.
    staleTime: 1000 * 30,
  });
}

export function useSavedSearches() {
  return useQuery({ queryKey: ['savedSearches'], queryFn: fetchSavedSearches });
}

export function useSaveSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveSearch,
    onSuccess: () => client.invalidateQueries({ queryKey: ['savedSearches'] }),
  });
}

export function useDeleteSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedSearch,
    onSuccess: () => client.invalidateQueries({ queryKey: ['savedSearches'] }),
  });
}

/**
 * What to look at next, and why (M13-12). One query per record on screen,
 * because the suggestion depends on the record and nothing else.
 */
export const useSimilarRecords = (kind: SearchKind | null, id: string | null) =>
  useQuery({
    queryKey: ['similarRecords', kind, id],
    queryFn: () => fetchSimilarRecords(kind as SearchKind, id as string),
    enabled: kind != null && id != null,
  });
