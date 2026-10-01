/** Query hooks for communication and notification (M11). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './comms';
import type { DigestAudience } from '../types';

export const useThreads = () => useQuery({ queryKey: ['threads'], queryFn: api.fetchThreads });

export const useMessages = (threadId: string | null) =>
  useQuery({
    queryKey: ['threadMessages', threadId],
    queryFn: () => api.fetchMessages(threadId as string),
    enabled: threadId != null,
  });

export const useAnnouncementReach = () =>
  useQuery({ queryKey: ['announcementReach'], queryFn: api.fetchReach });

export const useChannelMembers = () =>
  useQuery({ queryKey: ['channelMembers'], queryFn: api.fetchChannelMembers });

export const useInbox = (limit = 40) =>
  useQuery({
    queryKey: ['inbox', limit],
    queryFn: () => api.fetchInbox(limit),
    // The bell is on every screen. Two minutes is long enough not to poll the
    // database on every navigation and short enough that a hearing notice
    // does not sit unseen through a working session.
    staleTime: 1000 * 60 * 2,
  });

export const usePreferences = () =>
  useQuery({ queryKey: ['notificationPreferences'], queryFn: api.fetchPreferences });

export const useCorrespondence = () =>
  useQuery({ queryKey: ['correspondence'], queryFn: api.fetchCorrespondence });

export const useDigest = (audience: DigestAudience, from: string, to: string) =>
  useQuery({
    queryKey: ['weeklyDigest', audience, from, to],
    queryFn: () => api.fetchDigest(audience, from, to),
  });

// --- mutations -------------------------------------------------------------

function invalidateThreads(client: ReturnType<typeof useQueryClient>, threadId?: string) {
  client.invalidateQueries({ queryKey: ['threads'] });
  client.invalidateQueries({ queryKey: ['announcementReach'] });
  if (threadId) client.invalidateQueries({ queryKey: ['threadMessages', threadId] });
}

export function useStartThread() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.startThread,
    onSuccess: () => invalidateThreads(client),
  });
}

export function usePostMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      api.postMessage(threadId, body),
    onSuccess: (_result, variables) => invalidateThreads(client, variables.threadId),
  });
}

export function useCloseThread() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.closeThread,
    onSuccess: () => invalidateThreads(client),
  });
}

export function useAcknowledgeAnnouncement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.acknowledgeAnnouncement,
    onSuccess: () => invalidateThreads(client),
  });
}

export function useAddChannelMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.addChannelMember,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['channelMembers'] });
      // Adding somebody to a channel changes what they can see, so the list
      // they are looking at is no longer the list they should be looking at.
      client.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => client.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useSetPreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.setPreference,
    onSuccess: () => client.invalidateQueries({ queryKey: ['notificationPreferences'] }),
  });
}

export function useAddCorrespondence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.addCorrespondence,
    onSuccess: () => client.invalidateQueries({ queryKey: ['correspondence'] }),
  });
}

export function useConfirmDelivery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.confirmDelivery,
    onSuccess: () => client.invalidateQueries({ queryKey: ['correspondence'] }),
  });
}

export const useNotificationHealth = () =>
  useQuery({ queryKey: ['notificationHealth'], queryFn: api.fetchNotificationHealth });

export function useRunSweep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.runNotificationSweep,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['notificationHealth'] });
      // A sweep is what fills the inbox, so the inbox is now out of date.
      client.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}
