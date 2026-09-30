import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as obligations from './obligations';

export const useObligations = () =>
  useQuery({ queryKey: ['obligations'], queryFn: obligations.fetchObligations });

export const useOverrides = () =>
  useQuery({ queryKey: ['obligationOverrides'], queryFn: obligations.fetchOverrides });

export const useCommitmentRecords = () =>
  useQuery({ queryKey: ['commitmentRecords'], queryFn: obligations.fetchCommitmentRecords });

export const useEvidence = (obligationId: string | null) =>
  useQuery({
    queryKey: ['obligationEvidence', obligationId],
    queryFn: () => obligations.fetchEvidence(obligationId as string),
    enabled: obligationId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateObligation = () => {
  const invalidate = useInvalidator(['obligations', 'commitmentRecords']);
  return useMutation({ mutationFn: obligations.createObligation, onSuccess: invalidate });
};

export const useSetObligationState = () => {
  // A state change is what the commitment-keeping rate is computed from.
  const invalidate = useInvalidator(['obligations', 'commitmentRecords']);
  return useMutation({ mutationFn: obligations.setObligationState, onSuccess: invalidate });
};

export const useAddEvidence = () => {
  // Evidence is what unlocks 'fulfilled', so the register is refetched with it.
  const invalidate = useInvalidator(['obligationEvidence', 'obligations']);
  return useMutation({ mutationFn: obligations.addEvidence, onSuccess: invalidate });
};

export const useRecordOverride = () => {
  const invalidate = useInvalidator(['obligationOverrides', 'auditLog']);
  return useMutation({ mutationFn: obligations.recordOverride, onSuccess: invalidate });
};
