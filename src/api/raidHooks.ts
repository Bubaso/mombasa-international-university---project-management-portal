import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
import * as raid from './raid';

export const useRisks = () => useQuery({ queryKey: ['risks'], queryFn: raid.fetchRisks });
export const useIssues = () => useQuery({ queryKey: ['issues'], queryFn: raid.fetchIssues });
export const useAssumptions = () =>
  useQuery({ queryKey: ['assumptions'], queryFn: raid.fetchAssumptions });
export const useDependencies = () =>
  useQuery({ queryKey: ['dependencies'], queryFn: raid.fetchDependencies });
export const useRiskMatrix = () =>
  useQuery({ queryKey: ['riskMatrix'], queryFn: raid.fetchMatrix });

export const useScoreHistory = (riskId: string | null) =>
  useQuery({
    queryKey: ['riskScoreHistory', riskId],
    queryFn: () => raid.fetchScoreHistory(riskId as string),
    enabled: riskId != null,
  });

export const useEscalations = (riskId: string | null) =>
  useQuery({
    queryKey: ['riskEscalations', riskId],
    queryFn: () => raid.fetchEscalations(riskId as string),
    enabled: riskId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

/** A score change moves the register, the matrix, the history and possibly an escalation. */
const SCORE_KEYS = ['risks', 'riskMatrix', 'riskScoreHistory', 'riskEscalations'];

export const useCreateRisk = () => {
  const onSuccess = useTranslatingInvalidator(SCORE_KEYS, 'risks');
  return useMutation({ mutationFn: raid.createRisk, onSuccess });
};

export const useRescoreRisk = () => {
  const invalidate = useInvalidator(SCORE_KEYS);
  return useMutation({ mutationFn: raid.rescoreRisk, onSuccess: invalidate });
};

export const useSetResponse = () => {
  const invalidate = useInvalidator(['risks']);
  return useMutation({ mutationFn: raid.setResponse, onSuccess: invalidate });
};

export const useSetRiskState = () => {
  const invalidate = useInvalidator(['risks', 'riskMatrix']);
  return useMutation({ mutationFn: raid.setRiskState, onSuccess: invalidate });
};

export const useAcknowledgeEscalation = () => {
  const invalidate = useInvalidator(['risks', 'riskEscalations']);
  return useMutation({ mutationFn: raid.acknowledgeEscalation, onSuccess: invalidate });
};

export const useMaterialiseRisk = () => {
  // One act, two registers: the risk moves and an issue appears.
  const invalidate = useInvalidator([...SCORE_KEYS, 'issues']);
  return useMutation({ mutationFn: raid.materialiseRisk, onSuccess: invalidate });
};

export const useCreateIssue = () => {
  const onSuccess = useTranslatingInvalidator(['issues'], 'issues');
  return useMutation({ mutationFn: raid.createIssue, onSuccess });
};

export const useResolveIssue = () => {
  const invalidate = useInvalidator(['issues']);
  return useMutation({ mutationFn: raid.resolveIssue, onSuccess: invalidate });
};

export const useCreateAssumption = () => {
  const onSuccess = useTranslatingInvalidator(['assumptions'], 'assumptions');
  return useMutation({ mutationFn: raid.createAssumption, onSuccess });
};

export const useSetAssumptionState = () => {
  // Breaking one raises a risk in the database, so the risk register and the
  // matrix are stale the moment this returns.
  const invalidate = useInvalidator(['assumptions', ...SCORE_KEYS]);
  return useMutation({ mutationFn: raid.setAssumptionState, onSuccess: invalidate });
};

export const useCreateDependency = () => {
  const onSuccess = useTranslatingInvalidator(['dependencies'], 'dependencies');
  return useMutation({ mutationFn: raid.createDependency, onSuccess });
};

export const useDeleteDependency = () => {
  const invalidate = useInvalidator(['dependencies']);
  return useMutation({ mutationFn: raid.deleteDependency, onSuccess: invalidate });
};
