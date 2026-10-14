/** Query hooks for compiled reports (M12-06 … M12-09). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as curvesApi from './curves';
import * as api from './reports';

export const useReportRuns = (limit = 20) =>
  useQuery({ queryKey: ['reportRuns', limit], queryFn: () => api.fetchReportRuns(limit) });

function invalidate(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ['reportRuns'] });
}

export function useOpenReport() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.openReport, onSuccess: () => invalidate(client) });
}

export function useApproveReport() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.approveReport, onSuccess: () => invalidate(client) });
}

export function usePublishReport() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.publishReport, onSuccess: () => invalidate(client) });
}

export function useWithdrawReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.withdrawReport(id, reason),
    onSuccess: () => invalidate(client),
  });
}

export const useCurves = () => useQuery({ queryKey: ['curves'], queryFn: curvesApi.fetchCurves });
