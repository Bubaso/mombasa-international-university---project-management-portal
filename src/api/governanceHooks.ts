/** Query hooks for the governance, compliance and readiness registers (M10). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';
import * as api from './governance';

export const useOrgans = () => useQuery({ queryKey: ['organs'], queryFn: api.fetchOrgans });

export const useMemberships = (organId?: string | null) =>
  useQuery({
    queryKey: ['organMemberships', organId ?? null],
    queryFn: () => api.fetchMemberships(organId),
  });

export const useSittings = (limit = 12) =>
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
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addTrustee,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['trusteeRegister'] });
      // A new seat changes the quorum arithmetic on every past sitting the
      // register covers, so the sittings have to be refetched with it.
      client.invalidateQueries({ queryKey: ['sittings'] });
      void translate('trustees');
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

/**
 * Everything a seat touches.
 *
 * A seat changes who held a place on the day of every past sitting the
 * register covers, so the sittings have to be refetched with it — the quorum
 * verdict on a meeting minuted last March is derived, not stored.
 */
function useSeatInvalidator(): () => void {
  const client = useQueryClient();
  return () => {
    for (const key of ['organs', 'organMemberships', 'sittings', 'trusteeRegister']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useDeleteTrustee() {
  const invalidate = useSeatInvalidator();
  return useMutation({ mutationFn: api.deleteTrustee, onSuccess: invalidate });
}

export function useSeatOnOrgan() {
  const invalidate = useSeatInvalidator();
  return useMutation({ mutationFn: api.seatOnOrgan, onSuccess: invalidate });
}

export function useEndSeat() {
  const invalidate = useSeatInvalidator();
  return useMutation({
    mutationFn: (input: { id: string; on: string }) => api.endSeat(input.id, input.on),
    onSuccess: invalidate,
  });
}

export function useRemoveSeat() {
  const invalidate = useSeatInvalidator();
  return useMutation({ mutationFn: api.removeSeat, onSuccess: invalidate });
}

export function useSetQuorumRule() {
  const invalidate = useSeatInvalidator();
  return useMutation({
    mutationFn: (input: {
      organId: string;
      quorumMembers: number | null;
      quorumFraction: number | null;
    }) =>
      api.setQuorumRule(input.organId, {
        quorumMembers: input.quorumMembers,
        quorumFraction: input.quorumFraction,
      }),
    onSuccess: invalidate,
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
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.declareInterest,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['conflicts'] });
      void translate('conflict_declarations');
    },
  });
}

// --- the governance reference, cited to the trust deed (M10-13) --------------

export const useCharterClauses = () =>
  useQuery({ queryKey: ['charterClauses'], queryFn: api.fetchCharterClauses });

export const useCharterCitations = () =>
  useQuery({ queryKey: ['charterCitations'], queryFn: api.fetchCharterCitations });

export const useUncitedGovernance = () =>
  useQuery({ queryKey: ['uncitedGovernance'], queryFn: api.fetchUncitedGovernance });

const CHARTER_KEYS = ['charterClauses', 'charterCitations', 'uncitedGovernance'];

function useCharterInvalidator(): () => void {
  const client = useQueryClient();
  return () => {
    for (const key of CHARTER_KEYS) void client.invalidateQueries({ queryKey: [key] });
  };
}

export function useRecordCharterClause() {
  const invalidate = useCharterInvalidator();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.recordCharterClause,
    onSuccess: () => {
      invalidate();
      // The heading and the summary are translated like every other register.
      // quoted_text is not in the registry at all: a translated quotation is
      // a paraphrase carrying a quotation's authority, which is the one thing
      // this page exists to keep apart.
      void translate('charter_clauses');
    },
  });
}

export function useMarkClauseChecked() {
  const invalidate = useCharterInvalidator();
  return useMutation({ mutationFn: api.markClauseChecked, onSuccess: invalidate });
}

export function useWithdrawClauseCheck() {
  const invalidate = useCharterInvalidator();
  return useMutation({ mutationFn: api.withdrawClauseCheck, onSuccess: invalidate });
}

export function useCiteClause() {
  const invalidate = useCharterInvalidator();
  return useMutation({ mutationFn: api.citeClause, onSuccess: invalidate });
}
