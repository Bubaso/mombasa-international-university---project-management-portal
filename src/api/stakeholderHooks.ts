import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as stakeholders from './stakeholders';

export const useStakeholders = () =>
  useQuery({ queryKey: ['stakeholders'], queryFn: stakeholders.fetchStakeholders });

export const useOrganizations = () =>
  useQuery({ queryKey: ['organizations'], queryFn: stakeholders.fetchOrganizations });

export const useRelationships = () =>
  useQuery({ queryKey: ['relationships'], queryFn: stakeholders.fetchRelationships });

export const useAttention = () =>
  useQuery({ queryKey: ['stakeholderAttention'], queryFn: stakeholders.fetchAttention });

export const useInteractions = (stakeholderId?: string) =>
  useQuery({
    queryKey: ['interactions', stakeholderId ?? 'all'],
    queryFn: () => stakeholders.fetchInteractions(stakeholderId),
  });

export const useStanceHistory = (stakeholderId: string | null) =>
  useQuery({
    queryKey: ['stanceHistory', stakeholderId],
    queryFn: () => stakeholders.fetchStanceHistory(stakeholderId as string),
    enabled: stakeholderId != null,
  });

/**
 * Fetched only when a record is open, and separately from the record itself.
 * The private assessment is a different table with a different classification,
 * and most people who can read a stakeholder cannot read this.
 */
export const useAssessments = (stakeholderId: string | null) =>
  useQuery({
    queryKey: ['assessments', stakeholderId],
    queryFn: () => stakeholders.fetchAssessments(stakeholderId as string),
    enabled: stakeholderId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateStakeholder = () => {
  const invalidate = useInvalidator(['stakeholders', 'stakeholderAttention']);
  return useMutation({ mutationFn: stakeholders.createStakeholder, onSuccess: invalidate });
};

export const useUpdateStakeholder = () => {
  // A stance change writes a history row, so that is refetched with it.
  const invalidate = useInvalidator(['stakeholders', 'stakeholderAttention', 'stanceHistory']);
  return useMutation({ mutationFn: stakeholders.updateStakeholder, onSuccess: invalidate });
};

export const useCreateOrganization = () => {
  const invalidate = useInvalidator(['organizations']);
  return useMutation({ mutationFn: stakeholders.createOrganization, onSuccess: invalidate });
};

export const useLogInteraction = () => {
  // Logging a conversation is what takes a relationship off the quiet list.
  const invalidate = useInvalidator(['interactions', 'stakeholderAttention']);
  return useMutation({ mutationFn: stakeholders.logInteraction, onSuccess: invalidate });
};

export const useAddAssessment = () => {
  const invalidate = useInvalidator(['assessments']);
  return useMutation({ mutationFn: stakeholders.addAssessment, onSuccess: invalidate });
};

export const useLinkStakeholders = () => {
  const invalidate = useInvalidator(['relationships']);
  return useMutation({ mutationFn: stakeholders.linkStakeholders, onSuccess: invalidate });
};

export const useUnlinkStakeholders = () => {
  const invalidate = useInvalidator(['relationships']);
  return useMutation({ mutationFn: stakeholders.unlinkStakeholders, onSuccess: invalidate });
};
