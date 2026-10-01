/** Query hooks for action candidates (M3-05, M3-07, G-04). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './candidates';

export const useActionCandidates = () =>
  useQuery({ queryKey: ['actionCandidates'], queryFn: api.fetchCandidates });

function settled(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ['actionCandidates'] });
  // Adopting one creates a real action, which the meeting screens, the
  // agenda candidates and the calendar all read.
  client.invalidateQueries({ queryKey: ['actionItems'] });
  client.invalidateQueries({ queryKey: ['meetings'] });
  client.invalidateQueries({ queryKey: ['calendar'] });
}

export function useAdoptCandidate() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.adoptCandidate, onSuccess: () => settled(client) });
}

export function useDismissCandidate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.dismissCandidate(id, reason),
    onSuccess: () => settled(client),
  });
}
