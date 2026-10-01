/** The capture queue, and whether there is a connection to drain it (M3-11). */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as queue from '../lib/offlineQueue';
import { SyncFailure, syncCapture } from './capture';
import type { OfflineCapture } from '../lib/offlineQueue';

const KEY = ['offlineCaptures'];

/**
 * navigator.onLine is a weak signal — it says the machine has an interface,
 * not that the server is reachable — so it is used only to decide when to
 * TRY. Whether a capture actually went is decided by the write itself, which
 * is the only thing that can tell the truth about it.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * `networkMode: 'always'` on everything in this file, and it is the whole
 * feature.
 *
 * TanStack Query defaults to 'online', which PAUSES a query or a mutation
 * while the browser reports no connection. That is right for a query that
 * talks to a server and exactly wrong here: reading and writing the local
 * capture store touches no network, and pausing it means the minute somebody
 * types in a room with no signal is never written down at all — the one
 * failure this requirement exists to prevent. The smoke test found it by
 * actually taking the browser offline.
 *
 * The sync mutation gets it too, because when a capture goes is decided by
 * the panel's own online check and by the write's own answer, not by a
 * library pausing something behind the screen's back.
 */
export const useHeldCaptures = () =>
  useQuery({
    queryKey: KEY,
    queryFn: queue.held,
    networkMode: 'always',
    // The queue is local; refetching it over the network makes no sense, and
    // retrying a blocked IndexedDB three times just delays the message.
    retry: false,
    staleTime: 0,
  });

export function useHoldCapture() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: queue.hold,
    networkMode: 'always',
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

export interface SyncSummary {
  sent: number;
  failed: number;
  /** The first refusal, which is the one worth putting on the screen. */
  firstError: string | null;
}

/**
 * Works the queue oldest first and stops at nothing: one capture refusing is
 * not a reason to abandon the rest, and a capture that fails stays held with
 * the refusal written on it.
 */
export function useSyncCaptures() {
  const client = useQueryClient();
  return useMutation<SyncSummary, Error, OfflineCapture[]>({
    networkMode: 'always',
    mutationFn: async (captures) => {
      let sent = 0;
      let failed = 0;
      let firstError: string | null = null;

      for (const capture of captures) {
        try {
          await syncCapture(capture);
          await queue.release(capture.id);
          sent += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          if (firstError === null) firstError = message;
          await queue.hold({
            ...capture,
            attempts: capture.attempts + 1,
            lastError: message,
            lastStage: error instanceof SyncFailure ? error.stage : null,
            lastTriedAt: new Date().toISOString(),
          });
        }
      }
      return { sent, failed, firstError };
    },
    onSuccess: (summary) => {
      client.invalidateQueries({ queryKey: KEY });
      if (summary.sent > 0) {
        // What arrived is now on the record, so every screen built from it is
        // out of date.
        client.invalidateQueries({ queryKey: ['meetings'] });
        client.invalidateQueries({ queryKey: ['actionCandidates'] });
        client.invalidateQueries({ queryKey: ['calendar'] });
      }
    },
  });
}
