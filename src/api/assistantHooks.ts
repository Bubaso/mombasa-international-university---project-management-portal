/** Query hooks for the assistant and its usage log (M13). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ask, fetchAiQueries } from './assistant';

export function useAsk() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ask,
    // Every call is logged server-side, refusals included, so the log is
    // stale the moment one returns.
    onSettled: () => client.invalidateQueries({ queryKey: ['aiQueries'] }),
  });
}

export function useAiQueries(limit = 25) {
  return useQuery({ queryKey: ['aiQueries', limit], queryFn: () => fetchAiQueries(limit) });
}
