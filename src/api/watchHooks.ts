import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
import * as watch from './watch';

export const useWatches = () =>
  useQuery({ queryKey: ['watches'], queryFn: () => watch.fetchWatches() });

export const useWatchRounds = (shiftId: string | null) =>
  useQuery({
    queryKey: ['watchRounds', shiftId],
    queryFn: () => watch.fetchRounds(shiftId as string),
    enabled: shiftId != null,
  });

export const useOpenEntries = () =>
  useQuery({ queryKey: ['gatePresence'], queryFn: watch.fetchOpenEntries });

export const useIncidents = () =>
  useQuery({ queryKey: ['siteIncidents'], queryFn: () => watch.fetchIncidents() });

export const useWatchHealth = () =>
  useQuery({ queryKey: ['watchHealth'], queryFn: watch.fetchWatchHealth });

function useInvalidator(keys: string[]): () => void {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useOpenWatch = () => {
  const invalidate = useInvalidator(['watches', 'watchHealth']);
  return useMutation({ mutationFn: watch.openWatch, onSuccess: invalidate });
};

export const useCloseWatch = () => {
  const invalidate = useInvalidator(['watches', 'watchHealth', 'gatePresence']);
  return useMutation({ mutationFn: watch.closeWatch, onSuccess: invalidate });
};

export const useRecordRound = () => {
  // A round changes the shortfall, which lives in watch_health as well as in
  // the register itself.
  const invalidate = useInvalidator(['watchRounds', 'watches', 'watchHealth']);
  return useMutation({ mutationFn: watch.recordRound, onSuccess: invalidate });
};

export const useRecordEntry = () => {
  const invalidate = useInvalidator(['gatePresence', 'watchHealth']);
  return useMutation({ mutationFn: watch.recordEntry, onSuccess: invalidate });
};

export const useRecordExit = () => {
  const invalidate = useInvalidator(['gatePresence', 'watchHealth']);
  return useMutation({ mutationFn: watch.recordExit, onSuccess: invalidate });
};

export const useRecordIncident = () => {
  // The narrative goes in in one language; the other half is the machine's
  // job, as everywhere else (M3-10).
  const onSuccess = useTranslatingInvalidator(
    ['siteIncidents', 'watchHealth', 'translationBacklog'],
    'site_incidents',
  );
  return useMutation({ mutationFn: watch.recordIncident, onSuccess });
};

export const useRecordResponse = () => {
  const onSuccess = useTranslatingInvalidator(
    ['siteIncidents', 'watchHealth', 'translationBacklog'],
    'site_incidents',
  );
  return useMutation({ mutationFn: watch.recordResponse, onSuccess });
};

export const useRecordNotification = () => {
  const invalidate = useInvalidator(['siteIncidents', 'watchHealth']);
  return useMutation({ mutationFn: watch.recordNotification, onSuccess: invalidate });
};

export const useRecordNoNotificationNeeded = () => {
  const invalidate = useInvalidator(['siteIncidents', 'watchHealth']);
  return useMutation({ mutationFn: watch.recordNoNotificationNeeded, onSuccess: invalidate });
};

export const useAddIncidentEvidence = () => {
  const invalidate = useInvalidator(['siteIncidents', 'watchHealth']);
  return useMutation({ mutationFn: watch.addIncidentEvidence, onSuccess: invalidate });
};

export const useConfirmIncident = () => {
  const invalidate = useInvalidator(['siteIncidents', 'watchHealth']);
  return useMutation({ mutationFn: watch.confirmIncident, onSuccess: invalidate });
};
