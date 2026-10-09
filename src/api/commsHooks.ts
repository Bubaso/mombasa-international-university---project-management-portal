/** Query hooks for communication and notification (M11). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';
import * as api from './comms';
import type { DigestAudience } from '../types';

/** Okunmamış bildirim sayısı — dilimden değil kütükten. */
export const useUnreadCount = () =>
  useQuery({ queryKey: ['unreadCount'], queryFn: api.countUnread, staleTime: 1000 * 60 * 2 });

/** Gönderilmiş ama teslimi teyit edilmemiş yazı sayısı. */
export const useUnconfirmedOutgoing = () =>
  useQuery({ queryKey: ['unconfirmedOutgoing'], queryFn: api.countUnconfirmedOutgoing });

export const useThreads = (limit = 25) =>
  useQuery({ queryKey: ['threads', limit], queryFn: () => api.fetchThreads(limit) });

export const useMessages = (threadId: string | null) =>
  useQuery({
    queryKey: ['threadMessages', threadId],
    queryFn: () => api.fetchMessages(threadId as string),
    enabled: threadId != null,
  });

export const useAnnouncementReach = (limit = 20) =>
  useQuery({ queryKey: ['announcementReach', limit], queryFn: () => api.fetchReach(limit) });

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

export const useCorrespondence = (limit = 25) =>
  useQuery({ queryKey: ['correspondence', limit], queryFn: () => api.fetchCorrespondence(limit) });

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
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addCorrespondence,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['correspondence'] });
      void translate('correspondence');
    },
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

// --- attachments, quoting and reactions (M11-13) ----------------------------

export const useMessageReactions = (threadId: string | null) =>
  useQuery({
    queryKey: ['messageReactions', threadId],
    queryFn: () => api.fetchReactions(threadId as string),
    enabled: threadId != null,
  });

export const useMessageAttachments = (threadId: string | null) =>
  useQuery({
    queryKey: ['messageAttachments', threadId],
    queryFn: () => api.fetchMessageAttachments(threadId as string),
    enabled: threadId != null,
  });

function useMessageInvalidator(): () => void {
  const client = useQueryClient();
  return () => {
    for (const key of ['messages', 'messageReactions', 'messageAttachments']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useReact() {
  const invalidate = useMessageInvalidator();
  return useMutation({ mutationFn: api.react, onSuccess: invalidate });
}

export function useUnreact() {
  const invalidate = useMessageInvalidator();
  return useMutation({ mutationFn: api.unreact, onSuccess: invalidate });
}

export function useAttachToMessage() {
  const invalidate = useMessageInvalidator();
  return useMutation({ mutationFn: api.attachToMessage, onSuccess: invalidate });
}

// --- browser push (M11-05) -------------------------------------------------

export const usePushHealth = () =>
  useQuery({ queryKey: ['pushHealth'], queryFn: api.fetchPushHealth });

/**
 * Which media deliver. Read rather than hardcoded: src/lib/comms.ts carried
 * the list as a constant, which a recorded VAPID key would have made wrong.
 */
export const useDeliveryMedia = () =>
  useQuery({ queryKey: ['deliveryMedia'], queryFn: api.fetchDeliveryMedia });

export const usePushKey = () => useQuery({ queryKey: ['pushKey'], queryFn: api.fetchPushKey });

export function useRecordDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.recordPushSubscription,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['pushHealth'] });
    },
  });
}

export function useForgetDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.forgetThisDevice,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['pushHealth'] });
    },
  });
}
