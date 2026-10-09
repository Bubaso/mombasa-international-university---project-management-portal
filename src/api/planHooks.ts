/** Query hooks for the project backbone (M15). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';
import * as api from './plan';

/** Belgesi olmayan kayıtlı olay sayısı. */
export const useUnevidencedCount = () =>
  useQuery({ queryKey: ['unevidencedEvents'], queryFn: api.countUnevidencedEvents });

export const usePlanMilestones = () =>
  useQuery({ queryKey: ['milestones'], queryFn: api.fetchMilestones });

export const usePhases = () => useQuery({ queryKey: ['phasePosition'], queryFn: api.fetchPhases });

export const useBaselines = () =>
  useQuery({ queryKey: ['planBaselines'], queryFn: api.fetchBaselines });

export const useVariance = (baselineId: string | null) =>
  useQuery({
    queryKey: ['baselineVariance', baselineId],
    queryFn: () => api.fetchVariance(baselineId as string),
    enabled: baselineId != null,
  });

export const useChronology = (limit = 50) =>
  useQuery({ queryKey: ['chronology', limit], queryFn: () => api.fetchChronology(limit) });

/** Bir davanın kendi tarihçesi (M5-13). Aynı kütük, davaya göre süzülmüş. */
export const useCaseChronology = (caseId: string | undefined, limit = 50) =>
  useQuery({
    queryKey: ['chronology', 'case', caseId, limit],
    queryFn: () => api.fetchChronology(limit, 0, caseId as string),
    enabled: caseId != null,
  });

export const useCriticalDates = (limit = 3) =>
  useQuery({
    queryKey: ['criticalDates', limit],
    queryFn: () => api.fetchCriticalDates(limit),
    // The strip sits on every screen, so it is refetched on focus but not on
    // every navigation.
    staleTime: 1000 * 60 * 2,
  });

// --- mutations -------------------------------------------------------------

/**
 * Anything that changes a milestone moves the plan, and the plan feeds the
 * phases, the countdown strip, the calendar and every baseline comparison.
 * Listing them here beats discovering a stale number on a screen later.
 */
function invalidatePlan(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ['milestones'] });
  client.invalidateQueries({ queryKey: ['phasePosition'] });
  client.invalidateQueries({ queryKey: ['criticalDates'] });
  client.invalidateQueries({ queryKey: ['projectCalendar'] });
  client.invalidateQueries({ queryKey: ['baselineVariance'] });
  client.invalidateQueries({ queryKey: ['chronology'] });
}

export function useAddMilestone() {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addMilestone,
    onSuccess: () => {
      invalidatePlan(client);
      void translate('milestones');
    },
  });
}

export function useMoveTarget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; targetOn: string | null }) =>
      api.moveTarget(input.id, input.targetOn),
    onSuccess: () => invalidatePlan(client),
  });
}

export function useAchieveMilestone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; achievedOn: string; evidenceDocumentId: string }) =>
      api.achieveMilestone(input.id, input.achievedOn, input.evidenceDocumentId),
    onSuccess: () => invalidatePlan(client),
  });
}

export function useMarkMissed() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) => api.markMissed(input.id, input.note),
    onSuccess: () => invalidatePlan(client),
  });
}

export function useTakeBaseline() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; note?: string | null }) =>
      api.takeBaseline(input.name, input.note),
    onSuccess: () => client.invalidateQueries({ queryKey: ['planBaselines'] }),
  });
}

export function useAddChronologyEntry() {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addChronologyEntry,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['chronology'] });
      void translate('chronology_entries');
    },
  });
}

export function useAcknowledgeDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; entryId: string }) =>
      api.acknowledgeDate(input.kind, input.entryId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['criticalDates'] }),
  });
}

export const usePlanNetwork = () =>
  useQuery({ queryKey: ['planNetwork'], queryFn: api.fetchPlanNetwork });
