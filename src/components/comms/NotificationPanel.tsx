/**
 * The inbox and the preferences behind it (M11-06, M11-07).
 *
 * The honest part of this screen is the column saying what did NOT go out.
 * Three of the four media the requirement names — e-mail, WhatsApp, browser
 * push — have no provider connected to this project, so a delivery for one of
 * them is recorded `unconfigured` rather than `sent`. The panel says that in
 * those words rather than showing four ticks, because a team that believes
 * notifications are going out when they are not is worse off than one that
 * knows they are not.
 *
 * The preference grid refuses nothing by itself. A hearing or a deadline
 * cannot be switched off in the portal, and that refusal comes from the
 * database with its own message — enforcing it here as well would be a second
 * copy of the rule, and the copy is what drifts.
 */
import React, { useState } from 'react';
import { Bell, BellOff, CircleCheck, Inbox, RefreshCw, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useDeliveryMedia,
  useInbox,
  useMarkNotificationRead,
  useNotificationHealth,
  usePreferences,
  useRunSweep,
  useSetPreference,
} from '../../api/commsHooks';
import { DevicePushPanel } from './DevicePushPanel';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import { MEDIA, TOPICS, mediumName, topicName } from '../../lib/comms';
import { formatDate } from '../../lib/site';
import type { NotificationMedium, NotificationTopic } from '../../types';
import { MoreRows } from '../ui/MoreRows';

export const NotificationPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 40;
  const [limit, setLimit] = useState(PAGE);
  const inbox = useInbox(limit);
  const health = useNotificationHealth();
  const preferences = usePreferences();
  const sweep = useRunSweep();
  const markRead = useMarkNotificationRead();
  const setPreference = useSetPreference();
  // Read, not hardcoded. This file carried CONFIGURED_MEDIA = ['in_app'] from
  // lib/comms.ts; it was right until a VAPID key was recorded and would then
  // have labelled a working medium "no provider" for as long as nobody
  // noticed. app.configured_media() is the one place that changes.
  const media = useDeliveryMedia();

  const rows = inbox.data?.rows ?? [];
  const unread = rows.filter((r) => r.readAt == null).length;

  // What somebody has actually said, against the default the database applies
  // to everybody who has said nothing.
  const stated = new Map(
    (preferences.data ?? []).map((p) => [`${p.topic}:${p.medium}`, p.enabled]),
  );
  const isOn = (topic: NotificationTopic, medium: NotificationMedium, critical: boolean) => {
    const said = stated.get(`${topic}:${medium}`);
    if (said != null) return said;
    return medium === 'in_app' || critical;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Bildirimler' : 'Notifications'}
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              {tr
                ? 'Ekip Türkiye, Mombasa ve Nairobi arasında dağılmış; bir duruşma tarihinin kimsenin gözünden kaçmaması bu modülün var olma sebebi. Bu yüzden duruşma ve son tarih bildirimi portal içinde kapatılamaz.'
                : 'The team is spread across Türkiye, Mombasa and Nairobi, and the stated reason this module exists is that a hearing date must not slip past anybody. So a hearing and a deadline cannot be switched off in the portal itself.'}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <Pill className="border-indigo-300 bg-indigo-50 text-indigo-900">
            {tr ? `${unread} okunmamış` : `${unread} unread`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[inbox, preferences, health, media]} />

      {/* Whether this browser will ever ring, before anything about what it
          would say. The panel below is the only place that can answer it:
          permission and subscription are per device, and the database can
          only see the devices that have already reported in. */}
      <DevicePushPanel />

      {/* Why the inbox looks the way it does.
          A notification is not typed by hand — a sweep looks at the registers
          and raises what their dates now say. So an empty inbox has two
          explanations that are indistinguishable from the inbox itself:
          nothing was due, or the sweep stopped running weeks ago. The second
          is the dangerous one and it is silent, so this strip is shown
          whether or not there is anything in the list. */}
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        {health.data == null ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {tr
              ? 'Bildirim taraması hiç çalışmamış. Gelen kutusu bu yüzden boş olabilir — bir şeyin olmaması değil, kimsenin bakmamış olması.'
              : 'The sweep has never run. That, rather than an absence of deadlines, may be why the inbox is empty.'}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={health.data.looksStopped ? 'text-rose-800' : 'text-slate-600'}>
              {health.data.looksStopped ? (
                <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
              ) : null}
              {tr ? 'Son tarama: ' : 'Last swept '}
              <span className="font-mono">{formatDate(health.data.lastRanAt, language)}</span>
              {' · '}
              {tr
                ? `${Math.round(health.data.hoursSince)} saat önce`
                : `${Math.round(health.data.hoursSince)}h ago`}
              {' · '}
              {tr
                ? `${health.data.lastRaised} bildirim üretti`
                : `raised ${health.data.lastRaised}`}
            </span>
            {health.data.looksStopped && (
              <span className="font-semibold text-rose-800">
                {tr
                  ? 'Takvim durmuş görünüyor — sessizlik, olay olmadığı anlamına gelmiyor.'
                  : 'The schedule looks stopped, so silence here does not mean nothing is due.'}
              </span>
            )}
            {health.data.mediaWithoutAProvider.length > 0 && (
              <span className="text-slate-600">
                {tr ? 'Sağlayıcısı olmayan mecra: ' : 'No provider for '}
                {health.data.mediaWithoutAProvider.map((m) => mediumName(m, tr)).join(', ')}
              </span>
            )}
            <ActionButton
              className="ml-auto"
              onClick={() => sweep.mutate()}
              disabled={sweep.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${sweep.isPending ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {tr ? 'Şimdi tara' : 'Sweep now'}
            </ActionButton>
          </div>
        )}
        <WriteError error={sweep.error} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Gelen kutusu' : 'Inbox'}
          </h3>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {tr
                ? 'Bildirim yok. Bildirimler elle yazılmaz; tarama kütüklere bakar ve tarihlerin söylediğini bildirime çevirir. Yukarıdaki satır taramanın ne zaman çalıştığını söylüyor — boşluğun sebebi o.'
                : 'No notifications. They are not typed by hand: one is raised when a hearing, a deadline or an announcement is recorded.'}
            </p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {rows.map((n) => (
                <li
                  key={n.deliveryId}
                  className={`rounded-lg border p-2 ${
                    n.readAt == null
                      ? 'border-indigo-200 bg-indigo-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                      {topicName(n.topic, tr)}
                    </Pill>
                    {n.urgent && (
                      <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                        {tr ? 'acil' : 'urgent'}
                      </Pill>
                    )}
                    <span className="min-w-0 flex-1 text-sm text-slate-900">
                      {(tr ? n.titleTr : n.titleEn) ?? n.titleEn}
                    </span>
                    {n.readAt == null && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate(n.deliveryId)}
                        className="shrink-0 cursor-pointer text-xs text-indigo-700 underline"
                      >
                        {tr ? 'okundu' : 'mark read'}
                      </button>
                    )}
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{formatDate(n.raisedAt, language)}</span>
                    {n.raisedBy && <span>{n.raisedBy}</span>}
                  </div>
                  {/* The column that keeps this honest. */}
                  {n.awaitingAProvider.length > 0 && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-amber-800">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      {tr
                        ? `${n.awaitingAProvider.map((m) => mediumName(m, tr)).join(', ')} ile gönderilmedi — bu proje için sağlayıcı bağlı değil.`
                        : `Not sent by ${n.awaitingAProvider.map((m) => mediumName(m, tr)).join(', ')} — no provider is connected for this project.`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Kesilen neyse söylenecek: kırk bildirim gösterip dört yüz tane
              olduğunu söylememek, okuyana hepsini gördüğünü sandırır. */}
          <MoreRows
            shown={rows.length}
            total={inbox.data?.total ?? 0}
            onMore={() => setLimit(limit + PAGE)}
            busy={inbox.isFetching}
          />
          <WriteError error={markRead.error} />
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            {tr ? 'Nasıl ulaşılsın' : 'How you are reached'}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table
              className="w-full text-left"
              aria-label={tr ? 'Konu ve mecra tercihleri' : 'Topic and medium preferences'}
            >
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    {tr ? 'Konu' : 'Topic'}
                  </th>
                  {MEDIA.map((m) => (
                    <th
                      key={m.key}
                      className="px-2 py-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase"
                    >
                      {tr ? m.tr : m.en}
                      {/* Three states, not two. An unread list must not
                          render as "everything delivers": that is the same
                          silent reassurance this column exists to remove. */}
                      {media.data == null ? (
                        <span className="block text-xs font-normal text-slate-500 normal-case">
                          {tr ? 'sağlayıcı bilinmiyor' : 'provider unknown'}
                        </span>
                      ) : (
                        !media.data.withAProvider.includes(m.key) && (
                          <span className="block text-xs font-normal text-amber-700 normal-case">
                            {tr ? 'sağlayıcı yok' : 'no provider'}
                          </span>
                        )
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TOPICS.map((t) => (
                  <tr key={t.key}>
                    <td className="px-2 py-1.5 text-xs text-slate-800">
                      {tr ? t.tr : t.en}
                      {t.critical && (
                        <span className="ml-1 text-xs text-rose-700">
                          {tr ? '(kapatılamaz)' : '(cannot be off)'}
                        </span>
                      )}
                    </td>
                    {MEDIA.map((m) => {
                      const on = isOn(t.key, m.key, t.critical);
                      const locked = t.critical && m.key === 'in_app';
                      return (
                        <td key={m.key} className="px-2 py-1.5">
                          <button
                            type="button"
                            disabled={locked || setPreference.isPending}
                            onClick={() =>
                              setPreference.mutate({ topic: t.key, medium: m.key, enabled: !on })
                            }
                            aria-label={`${topicName(t.key, tr)} — ${mediumName(m.key, tr)}`}
                            className={`cursor-pointer rounded border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed ${
                              on
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            {on ? (
                              <CircleCheck className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <BellOff className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <WriteError error={setPreference.error} />
          <p className="mt-1 text-xs text-slate-500">
            {tr
              ? 'Bu tercihler yalnızca sizindir — yönetici dahil kimse okuyamaz. Kritik olanların açık kalmasını denetim değil, veritabanı garanti ediyor.'
              : 'These preferences are yours alone; nobody, an administrator included, can read them. What keeps the critical ones on is the database, not supervision.'}
          </p>
        </div>
      </div>
    </section>
  );
};
