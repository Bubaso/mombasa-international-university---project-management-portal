/** Query hooks for the governance, compliance and readiness registers (M10). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './governance';

export const useOrgans = () => useQuery({ queryKey: ['organs'], queryFn: api.fetchOrgans });

export const useMemberships = (organId?: string | null) =>
  useQuery({
    queryKey: ['organMemberships', organId ?? null],
    queryFn: () => api.fetchMemberships(organId),
  });

export const useSittings = (limit = 20) =>
  useQuery({ queryKey: ['sittings', limit], queryFn: () => api.fetchSittings(limit) });

export const useTrusteeRegister = () =>
  useQuery({ queryKey: ['trusteeRegister'], queryFn: api.fetchTrustees });

export const useResolutions = (organOnly = true) =>
  useQuery({
    queryKey: ['resolutions', organOnly],
    queryFn: () => api.fetchResolutions(organOnly),
  });

export const useComplianceCalendar = () =>
  useQuery({ queryKey: ['complianceCalendar'], queryFn: api.fetchComplianceCalendar });

export const useAccreditation = () =>
  useQuery({ queryKey: ['accreditation'], queryFn: api.fetchAccreditation });

export const useRoadmap = () => useQuery({ queryKey: ['roadmap'], queryFn: api.fetchRoadmap });

export const useProgrammes = () =>
  useQuery({ queryKey: ['programmes'], queryFn: api.fetchProgrammes });

export const useObligationProgress = () =>
  useQuery({ queryKey: ['obligationProgress'], queryFn: api.fetchObligationProgress });

export const useConflicts = () =>
  useQuery({ queryKey: ['conflicts'], queryFn: api.fetchConflicts });

export const useReadiness = () =>
  useQuery({ queryKey: ['readiness'], queryFn: api.fetchReadiness });

// --- mutations -------------------------------------------------------------

export function useAddTrustee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.addTrustee,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['trusteeRegister'] });
      // A new seat changes the quorum arithmetic on every past sitting the
      // register covers, so the sittings have to be refetched with it.
      client.invalidateQueries({ queryKey: ['sittings'] });
    },
  });
}

export function useStandDownTrustee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; on: string }) => api.standDownTrustee(input.id, input.on),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['trusteeRegister'] });
      client.invalidateQueries({ queryKey: ['sittings'] });
    },
  });
}

export function useSignResolution() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { decisionId: string; documentId?: string | null }) =>
      api.signResolution(input.decisionId, input.documentId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['resolutions'] }),
  });
}

export function useRaiseCompliance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.raiseComplianceObligation,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['complianceCalendar'] });
      // It becomes an obligation, so M2's register and the calendar both move.
      client.invalidateQueries({ queryKey: ['obligations'] });
      client.invalidateQueries({ queryKey: ['projectCalendar'] });
    },
  });
}

export function useDeclareInterest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.declareInterest,
    onSuccess: () => client.invalidateQueries({ queryKey: ['conflicts'] }),
  });
}
