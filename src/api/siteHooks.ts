import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as site from './site';

export const useBlocks = () => useQuery({ queryKey: ['blocks'], queryFn: site.fetchBlocks });

/**
 * Fetched for the whole list at once. A block's progress is a view over its
 * tasks, so asking per block would be one query per row for a number that is
 * cheap to get in one.
 */
export const useBlockProgress = () =>
  useQuery({ queryKey: ['blockProgress'], queryFn: site.fetchBlockProgress });

export const usePhases = () => useQuery({ queryKey: ['phases'], queryFn: site.fetchPhases });

export const useContractors = () =>
  useQuery({ queryKey: ['contractors'], queryFn: site.fetchContractors });

const forBlock = <T>(key: string, blockId: string | null, fn: (id: string) => Promise<T>) => ({
  queryKey: [key, blockId],
  queryFn: () => fn(blockId as string),
  enabled: blockId != null,
});

export const useWorkPackages = (blockId: string | null) =>
  useQuery(forBlock('workPackages', blockId, site.fetchWorkPackages));

export const useTasks = (blockId: string | null) =>
  useQuery(forBlock('siteTasks', blockId, site.fetchTasks));

export const useInspections = (blockId: string | null) =>
  useQuery(forBlock('inspections', blockId, site.fetchInspections));

/** Null asks about every block the caller can see, not about none of them. */
export const useConflicts = (blockId: string | null) =>
  useQuery({
    queryKey: ['taskConflicts', blockId],
    queryFn: () => site.fetchConflicts(blockId),
  });

export const useBoqVersions = (blockId: string | null) =>
  useQuery(forBlock('boqVersions', blockId, site.fetchBoqVersions));

export const useValuations = (blockId: string | null) =>
  useQuery(forBlock('valuations', blockId, site.fetchValuations));

export const useProgress = (taskId: string | null) =>
  useQuery({
    queryKey: ['taskProgress', taskId],
    queryFn: () => site.fetchProgress(taskId as string),
    enabled: taskId != null,
  });

export const useFindings = (inspectionId: string | null) =>
  useQuery({
    queryKey: ['findings', inspectionId],
    queryFn: () => site.fetchFindings(inspectionId as string),
    enabled: inspectionId != null,
  });

export const useBoqItems = (versionId: string | null) =>
  useQuery({
    queryKey: ['boqItems', versionId],
    queryFn: () => site.fetchBoqItems(versionId as string),
    enabled: versionId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateWorkPackage = () => {
  const invalidate = useInvalidator(['workPackages', 'siteTasks']);
  return useMutation({ mutationFn: site.createWorkPackage, onSuccess: invalidate });
};

export const useCreateTask = () => {
  // A new task changes the denominator the block's progress is averaged over,
  // and may fall under a prohibition, so both of those go stale with it.
  const invalidate = useInvalidator([
    'siteTasks',
    'blockProgress',
    'taskConflicts',
    'workPackages',
  ]);
  return useMutation({ mutationFn: site.createTask, onSuccess: invalidate });
};

export const useSetTaskState = () => {
  const invalidate = useInvalidator(['siteTasks', 'blockProgress', 'taskConflicts']);
  return useMutation({ mutationFn: site.setTaskState, onSuccess: invalidate });
};

export const useReportProgress = () => {
  const invalidate = useInvalidator(['taskProgress', 'siteTasks', 'blockProgress']);
  return useMutation({ mutationFn: site.reportProgress, onSuccess: invalidate });
};

export const useCreateInspection = () => {
  const invalidate = useInvalidator(['inspections']);
  return useMutation({ mutationFn: site.createInspection, onSuccess: invalidate });
};

export const useAddFinding = () => {
  const invalidate = useInvalidator(['findings', 'inspections']);
  return useMutation({ mutationFn: site.addFinding, onSuccess: invalidate });
};

export const useResolveFinding = () => {
  const invalidate = useInvalidator(['findings', 'inspections']);
  return useMutation({ mutationFn: site.resolveFinding, onSuccess: invalidate });
};

export const useSignInspection = () => {
  const invalidate = useInvalidator(['inspections', 'findings']);
  return useMutation({ mutationFn: site.signInspection, onSuccess: invalidate });
};

export const useAcknowledgeConflict = () => {
  const invalidate = useInvalidator(['taskConflicts', 'obligations']);
  return useMutation({ mutationFn: site.acknowledgeConflict, onSuccess: invalidate });
};

export const useCreateBoqVersion = () => {
  const invalidate = useInvalidator(['boqVersions']);
  return useMutation({ mutationFn: site.createBoqVersion, onSuccess: invalidate });
};

export const useAddBoqItem = () => {
  const invalidate = useInvalidator(['boqItems', 'boqVersions']);
  return useMutation({ mutationFn: site.addBoqItem, onSuccess: invalidate });
};

export const useIssueBoqVersion = () => {
  const invalidate = useInvalidator(['boqVersions', 'boqItems']);
  return useMutation({ mutationFn: site.issueBoqVersion, onSuccess: invalidate });
};

export const useCreateValuation = () => {
  const invalidate = useInvalidator(['valuations']);
  return useMutation({ mutationFn: site.createValuation, onSuccess: invalidate });
};

export const useCertifyValuation = () => {
  const invalidate = useInvalidator(['valuations']);
  return useMutation({ mutationFn: site.certifyValuation, onSuccess: invalidate });
};

export const useApproveValuation = () => {
  const invalidate = useInvalidator(['valuations']);
  return useMutation({ mutationFn: site.approveValuation, onSuccess: invalidate });
};
