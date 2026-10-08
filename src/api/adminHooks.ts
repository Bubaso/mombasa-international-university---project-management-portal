import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as admin from './admin';

/**
 * What the caller may do, asked of the database rather than worked out from
 * the profile row — the row says nothing about a delegation in force.
 *
 * This shapes the console. It is never the thing that permits anything: every
 * call it guards is refused independently by a policy if it should be.
 */
export const useAuthority = () =>
  useQuery({ queryKey: ['authority'], queryFn: admin.fetchAuthority, staleTime: 60_000 });

export const useProfiles = () => useQuery({ queryKey: ['profiles'], queryFn: admin.fetchProfiles });

export const useCaseAssignments = () =>
  useQuery({ queryKey: ['caseAssignments'], queryFn: admin.fetchCaseAssignments });

export const useBlockAssignments = () =>
  useQuery({ queryKey: ['blockAssignments'], queryFn: admin.fetchBlockAssignments });

export const useGrants = () => useQuery({ queryKey: ['grants'], queryFn: admin.fetchGrants });

export const useDelegations = () =>
  useQuery({ queryKey: ['delegations'], queryFn: admin.fetchDelegations });

export const useAuditLog = (limit = 50, entityType = '') =>
  useQuery({
    queryKey: ['auditLog', limit, entityType],
    queryFn: () => admin.fetchAuditLog(limit, 0, entityType || undefined),
  });

/** Refreshes the queries a write can plausibly have changed. */
function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useInviteUser = () => {
  const invalidate = useInvalidator(['profiles', 'auditLog']);
  return useMutation({ mutationFn: admin.inviteUser, onSuccess: invalidate });
};

export const useUpdateProfile = () => {
  // A profile change can alter the caller's own authority, so that is
  // refetched too.
  const invalidate = useInvalidator(['profiles', 'authority', 'auditLog']);
  return useMutation({ mutationFn: admin.updateProfile, onSuccess: invalidate });
};

export const useAssign = () => {
  const invalidate = useInvalidator(['caseAssignments', 'blockAssignments', 'auditLog']);
  return useMutation({ mutationFn: admin.assign, onSuccess: invalidate });
};

export const useUnassign = () => {
  const invalidate = useInvalidator(['caseAssignments', 'blockAssignments', 'auditLog']);
  return useMutation({ mutationFn: admin.unassign, onSuccess: invalidate });
};

export const useCreateGrant = () => {
  const invalidate = useInvalidator(['grants', 'auditLog']);
  return useMutation({ mutationFn: admin.createGrant, onSuccess: invalidate });
};

export const useRevokeGrant = () => {
  const invalidate = useInvalidator(['grants', 'auditLog']);
  return useMutation({ mutationFn: admin.revokeGrant, onSuccess: invalidate });
};

export const useRequestDelegation = () => {
  const invalidate = useInvalidator(['delegations', 'auditLog']);
  return useMutation({ mutationFn: admin.requestDelegation, onSuccess: invalidate });
};

export const useApproveDelegation = () => {
  // The second approval is what transfers the authority, so the caller's own
  // authority may have changed the moment this returns.
  const invalidate = useInvalidator(['delegations', 'authority', 'auditLog']);
  return useMutation({ mutationFn: admin.approveDelegation, onSuccess: invalidate });
};

export const useRevokeDelegation = () => {
  const invalidate = useInvalidator(['delegations', 'authority', 'auditLog']);
  return useMutation({ mutationFn: admin.revokeDelegation, onSuccess: invalidate });
};

export const useAccessReviewQueue = () =>
  useQuery({ queryKey: ['accessReviewQueue'], queryFn: admin.fetchAccessReviewQueue });

export const useRecordAccessReview = () => {
  const invalidate = useInvalidator(['accessReviewQueue', 'auditLog']);
  return useMutation({ mutationFn: admin.recordAccessReview, onSuccess: invalidate });
};
