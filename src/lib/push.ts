/**
 * Turning this browser into a push destination (M11-05).
 *
 * The state machine here exists because "notifications are on" is four
 * different facts, and a single toggle hides three of them:
 *
 *   * the browser has no push at all (an older iOS Safari, a desktop with it
 *     disabled, the portal opened in a context without a service worker);
 *   * the project has no VAPID key on record, so no browser can subscribe;
 *   * permission was refused, which the portal cannot undo and must not
 *     pretend to — only the person can, in browser settings;
 *   * permission was granted and this device is, or is not, subscribed.
 *
 * A switch showing "on" in any of the first three cases is the exact failure
 * this portal exists to refuse: somebody stops watching their inbox because
 * they believe their phone will tell them.
 */

/**
 * What this device can actually be told, and why not when it cannot.
 *
 * `checking` is the one that was missing and had to be added after the live
 * screen was caught saying something false. The panel derives the state from
 * `keyOnRecord`, which comes from a query; while that query is in flight the
 * caller used to pass `false`, so the screen asserted "no key is on record
 * for this project" — a verdict about the database, printed before the
 * database had answered. On a cold service worker that stale line survived
 * twelve seconds. Not knowing yet is its own state and it says so.
 *
 * `worker_not_ready` is the same principle applied to the other wait: the
 * browser has push, but its service worker has not activated, so nothing can
 * subscribe yet and that is neither "unsupported" nor "off".
 */
export type PushState =
  | 'checking'
  | 'unsupported'
  | 'no_key'
  | 'blocked'
  | 'not_asked'
  | 'worker_not_ready'
  | 'granted_not_subscribed'
  | 'subscribed';

/** A P-256 point and an auth secret, as the push service will want them. */
export interface DeviceKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushIsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** base64url, as VAPID keys and subscription keys are carried everywhere. */
export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * applicationServerKey wants the raw 65 bytes, not the text. The padding has
 * to go back on before atob, which is the step everybody's first attempt
 * leaves out — and it fails as an InvalidCharacterError rather than as
 * anything about keys.
 */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function keysOf(subscription: PushSubscription): DeviceKeys | null {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!p256dh || !auth) return null;
  return {
    endpoint: subscription.endpoint,
    p256dh: toBase64Url(p256dh),
    auth: toBase64Url(auth),
  };
}

/**
 * How long to wait for the service worker before calling it not ready. On a
 * first visit to the live site a cold registration took about twelve seconds,
 * so this is generous; the point is that it ends, because `ready` on its own
 * never does and a promise that never settles leaves the screen showing
 * whatever it last said.
 */
const WORKER_WAIT_MS = 20000;

/**
 * The worker the PWA plugin registered. Awaited rather than assumed: on a
 * first visit the registration is still in flight, and subscribing against
 * nothing throws an error about an invalid state that says nothing about why.
 */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushIsSupported()) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), WORKER_WAIT_MS)),
    ]);
  } catch {
    return null;
  }
}

/**
 * What this device's position is, without asking for anything.
 *
 * `keyOnRecord` is `boolean | undefined` on purpose: undefined means the
 * query has not answered, and the only honest reading of that is `checking`.
 * Taking undefined for `false` is what made the screen claim there was no key
 * when there was one.
 */
export async function readPushState(keyOnRecord: boolean | undefined): Promise<PushState> {
  if (!pushIsSupported()) return 'unsupported';
  if (keyOnRecord === undefined) return 'checking';
  if (!keyOnRecord) return 'no_key';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'default') return 'not_asked';

  const registration = await worker();
  // Push is supported — that was established above — so a missing
  // registration means it has not activated, which is a wait and not a
  // verdict about the browser.
  if (!registration) return 'worker_not_ready';
  const existing = await registration.pushManager.getSubscription();
  return existing ? 'subscribed' : 'granted_not_subscribed';
}

/**
 * Asks, subscribes, and hands back the keys for recording. Returns null when
 * the person says no or the browser refuses — the caller re-reads the state
 * rather than being told it worked.
 */
export async function subscribeThisDevice(publicKey: string): Promise<DeviceKeys | null> {
  const registration = await worker();
  if (!registration) return null;

  if (Notification.permission === 'default') {
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') return null;
  }
  if (Notification.permission !== 'granted') return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    // A subscription made against a different key cannot be decrypted by the
    // current sender, and the push service accepts the send anyway — the
    // silent failure the one-key rule in 0045 exists for. So it is replaced
    // rather than reused.
    const current = existing.options?.applicationServerKey;
    const sameKey = current ? toBase64Url(current as ArrayBuffer) === publicKey : false;
    if (sameKey) return keysOf(existing);
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    // Required by Chrome, and honest: every push this portal sends shows a
    // notification. A silent push would be a background message the person
    // never agreed to.
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });

  return keysOf(subscription);
}

/**
 * Stops this device. Returns the endpoint that was dropped so the caller can
 * forget it in the database too; null when there was nothing to stop.
 */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const registration = await worker();
  if (!registration) return null;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return null;
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  return endpoint;
}

/** What the state means, in the language on screen. Never "on" when it is not. */
export function pushStateWords(state: PushState, tr: boolean): string {
  switch (state) {
    case 'checking':
      return tr
        ? 'Bu cihazın durumu kontrol ediliyor.'
        : 'Checking what this device is set up for.';
    case 'worker_not_ready':
      return tr
        ? "Tarayıcı bildirimi destekliyor ama bu sekmenin service worker'ı henüz hazır değil. Sayfayı yenileyin; hazır olmadan abonelik kurulamaz."
        : "This browser supports push, but this tab's service worker has not started yet. Reload the page; nothing can subscribe until it has.";
    case 'unsupported':
      return tr
        ? 'Bu tarayıcı anlık bildirim desteklemiyor. Portalı açmadan haber alamazsınız.'
        : 'This browser cannot take push notifications, so nothing will reach you unless the portal is open.';
    case 'no_key':
      return tr
        ? 'Projede kayıtlı bir anahtar yok; hiçbir cihaz abone olamaz. Bunu bir yönetici kurar.'
        : 'No key is on record for this project, so no device can subscribe. An administrator records one.';
    case 'blocked':
      return tr
        ? 'Bildirim izni bu site için reddedilmiş. Portal bunu geri alamaz — tarayıcı ayarlarından açmanız gerekir.'
        : 'Notifications are blocked for this site. The portal cannot undo that; it has to be changed in browser settings.';
    case 'not_asked':
      return tr
        ? 'Bu cihaz henüz bildirim almıyor.'
        : 'This device is not receiving notifications yet.';
    case 'granted_not_subscribed':
      return tr
        ? 'İzin verilmiş ama bu cihaz kayıtlı değil — yani bildirim gelmez.'
        : 'Permission was given but this device is not registered, so nothing will arrive.';
    case 'subscribed':
      return tr
        ? 'Bu cihaz kayıtlı. Gönderim, bir anlık bildirim servisinin isteği kabul etmesine kadar doğrulanabilir; cihazın gösterip göstermediğini portal bilemez.'
        : 'This device is registered. Sending can be confirmed as far as the push service accepting it; whether the device displayed anything is not something the portal can know.';
  }
}
