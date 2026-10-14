/**
 * The capture queue (M3-11).
 *
 * The minutes of this project are taken in rooms the network does not always
 * reach — a county office, a site hut, a car between Mombasa and Nairobi.
 * The requirement is that the meeting can still be written down, and that it
 * reaches the record when the connection returns.
 *
 * The whole difficulty is in one sentence: a capture sitting in this queue is
 * NOT on the record. It is in one browser, on one device, and it is gone if
 * that profile is cleared. Every other portal solves this by showing a tick
 * and saying "saved"; that tick is a lie until the server has the row, and it
 * is exactly the kind of claim Faz 0 stripped out of this app. So the queue
 * carries the distinction in its own vocabulary — a capture is `held` here
 * and only becomes a meeting when the server says so — and the screen above
 * it never uses the word "kaydedildi" for something only this device has.
 *
 * IndexedDB rather than localStorage: minutes are long, localStorage is 5MB
 * and synchronous, and a half-written minute that blocks the main thread in a
 * meeting is worse than no feature. It can still be unavailable — private
 * windows, blocked site data — and when it is, the screen says so rather than
 * accepting text it cannot keep.
 */
import type { Confidentiality, ContentLanguage, MeetingKind } from '../types';

const DB_NAME = 'miu-offline';
const DB_VERSION = 1;
const STORE = 'captures';

/** Where a sync stopped, so the screen can say which part did not go. */
export type CaptureStage = 'meeting' | 'minute' | 'actions';

export interface OfflineCapture {
  /**
   * Generated on the device and reused as the meeting's own id. That is what
   * makes a retry safe: a second attempt inserts the same primary key and the
   * database refuses it, which is the answer "already there" rather than a
   * duplicate meeting.
   */
  id: string;
  capturedAt: string;
  title: string;
  heldAt: string;
  location: string | null;
  kind: MeetingKind;
  confidentiality: Confidentiality;
  /** Which language the minute below is written in. */
  language: ContentLanguage;
  minute: string;
  /** One sentence each. These become action candidates, never actions. */
  actionLines: string[];
  attempts: number;
  lastError: string | null;
  lastStage: CaptureStage | null;
  lastTriedAt: string | null;
}

/** Whether this browser will hold anything at all. */
export function canHold(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Old browsers and non-secure origins. Still a v4 shape, still random.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canHold()) {
      reject(new Error('This browser will not hold anything offline.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open.'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('The capture store refused.'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function hold(capture: OfflineCapture): Promise<void> {
  await run('readwrite', (store) => store.put(capture));
}

/** Oldest first: a queue is worked in the order things were said. */
export async function held(): Promise<OfflineCapture[]> {
  const rows = await run<OfflineCapture[]>('readonly', (store) => store.getAll());
  return [...rows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function release(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/**
 * What the capture form produces. Nothing here is a meeting yet, which is why
 * the function is named for the act and not for the record.
 */
export function capture(input: {
  title: string;
  heldAt: string;
  location: string | null;
  kind: MeetingKind;
  confidentiality: Confidentiality;
  language: ContentLanguage;
  minute: string;
  actionLines: string[];
}): OfflineCapture {
  return {
    id: newId(),
    capturedAt: new Date().toISOString(),
    ...input,
    actionLines: input.actionLines.map((l) => l.trim()).filter((l) => l !== ''),
    attempts: 0,
    lastError: null,
    lastStage: null,
    lastTriedAt: null,
  };
}
