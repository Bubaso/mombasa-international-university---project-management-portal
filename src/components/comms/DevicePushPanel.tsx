/**
 * Turning this device into a push destination, and saying plainly when it is
 * not one (M11-05).
 *
 * The reason this is a panel and not a switch: "notifications are on" is
 * several different facts, and most of them are not the person's fault and
 * not the portal's to fix. A browser without push, a project with no key
 * recorded, a permission the person refused months ago in a dialog they have
 * forgotten — each produces a device that will never ring, and a switch
 * showing "on" over any of them is how somebody stops watching their inbox
 * because they believe their phone will tell them.
 *
 * The state is also re-read after every action rather than assumed from the
 * action having returned. requestPermission can resolve with 'default' if the
 * dialog is dismissed, and subscribe can reject for reasons the portal cannot
 * enumerate; both would otherwise leave the panel claiming a subscription
 * that does not exist.
 */
import React from 'react';
import { Bell, BellOff, CircleAlert, Smartphone, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useForgetDevice, usePushHealth, usePushKey, useRecordDevice } from '../../api/commsHooks';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import {
  pushStateWords,
  readPushState,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushState,
} from '../../lib/push';

export const DevicePushPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const health = usePushHealth();
  const key = usePushKey();
  const record = useRecordDevice();
  const forget = useForgetDevice();

  const [state, setState] = React.useState<PushState | null>(null);
  const [problem, setProblem] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);

  // Undefined while the query is in flight, and passed through as undefined.
  // Defaulting it to false here is what made the live screen assert "no key
  // is on record for this project" before the project had answered — a
  // verdict about the database printed in the gap before reading it, and on a
  // cold service worker it stayed on screen for twelve seconds.
  const keyOnRecord = health.data?.keyOnRecord;

  const refresh = React.useCallback(() => {
    void readPushState(keyOnRecord).then(setState);
  }, [keyOnRecord]);

  React.useEffect(refresh, [refresh]);

  const turnOn = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const publicKey = key.data;
      if (!publicKey) throw new Error(tr ? 'Kayıtlı anahtar yok.' : 'No key is on record.');
      const keys = await subscribeThisDevice(publicKey);
      // Null is the ordinary answer when somebody declines the dialog. It is
      // not an error and is not reported as one; the state line below will
      // say `blocked` or `not_asked` and that is the whole message.
      if (keys) await record.mutateAsync(keys);
    } catch (cause) {
      setProblem(cause);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const turnOff = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await forget.mutateAsync(endpoint);
    } catch (cause) {
      setProblem(cause);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const subscribed = state === 'subscribed';
  const canTurnOn = state === 'not_asked' || state === 'granted_not_subscribed';

  return (
    <div
      className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
      aria-label={tr ? 'Bu cihazda bildirim' : 'Notifications on this device'}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-slate-900">
          {tr ? 'Bu cihaz' : 'This device'}
        </span>

        {state === null || state === 'checking' ? (
          <Pill className="border-slate-300 bg-slate-50 text-slate-500">
            {tr ? 'kontrol ediliyor' : 'checking'}
          </Pill>
        ) : subscribed ? (
          <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
            <Bell className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {tr ? 'kayıtlı' : 'registered'}
          </Pill>
        ) : (
          <Pill className="border-slate-300 bg-slate-50 text-slate-700">
            <BellOff className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {tr ? 'kayıtlı değil' : 'not registered'}
          </Pill>
        )}

        {/* How many other browsers this person has registered. Shown because
            a trustee who turned push on at a desk in Istanbul and reads this
            on a phone in Mombasa would otherwise have no way to tell that
            the phone is the one that is off. */}
        {health.data != null && health.data.myDevices > 0 && (
          <span className="text-[11px] text-slate-500">
            {tr
              ? `hesabınızda ${health.data.myDevices} cihaz kayıtlı`
              : `${health.data.myDevices} device${health.data.myDevices === 1 ? '' : 's'} on your account`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {canTurnOn && (
            <ActionButton onClick={turnOn} disabled={busy || key.isLoading}>
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Bu cihazda aç' : 'Turn on here'}
            </ActionButton>
          )}
          {subscribed && (
            <ActionButton onClick={turnOff} disabled={busy}>
              <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Bu cihazda kapat' : 'Turn off here'}
            </ActionButton>
          )}
        </div>
      </div>

      {/* The sentence that does the work. Never "on": it says which of the
          five positions this device is in, and for the three the portal
          cannot change it says who can. */}
      {state != null && (
        <p
          className={`mt-1 flex items-start gap-1.5 text-[11px] ${
            state === 'subscribed' || state === 'checking' ? 'text-slate-500' : 'text-amber-900'
          }`}
        >
          {/* No warning triangle while it is still reading: an unknown is not
              a problem, and dressing it as one teaches the reader to ignore
              the ones that are. */}
          {state !== 'subscribed' && state !== 'checking' && (
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          {pushStateWords(state, tr)}
        </p>
      )}

      {/* Queued with no device of their own. The database names this state
          rather than letting a screen count it as a delivery. */}
      {health.data?.queuedWithNowhereToGo && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] font-semibold text-rose-800">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {tr
            ? `${health.data.myQueued} bildirim sırada bekliyor ve gidecek kayıtlı cihaz yok. Gönderilmiş sayılmıyorlar.`
            : `${health.data.myQueued} notification${health.data.myQueued === 1 ? '' : 's'} queued with no registered device to go to. They are not counted as sent.`}
        </p>
      )}

      {/* What the queue has actually done for this reader. `sent` is as far
          as the record goes: a push service accepted the bytes. */}
      {health.data != null && (health.data.mySent > 0 || health.data.myFailed > 0) && (
        <p className="mt-1 text-[11px] text-slate-500">
          {tr
            ? `Bu hesap için ${health.data.mySent} bildirim bir anlık bildirim servisine iletildi`
            : `${health.data.mySent} accepted by a push service for this account`}
          {health.data.myFailed > 0 &&
            (tr ? `, ${health.data.myFailed} başarısız` : `, ${health.data.myFailed} failed`)}
          {'. '}
          {tr
            ? 'Cihazın gösterip göstermediği buradan görülemez.'
            : 'Whether a device displayed them is not visible from here.'}
        </p>
      )}

      <WriteError error={problem} />
    </div>
  );
};
