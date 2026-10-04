/**
 * Writing a meeting down with no connection (M3-11).
 *
 * The one thing this screen must never do is tell somebody their minute is
 * safe when it is sitting in a browser on a desk in Mombasa. So the
 * vocabulary is split and kept split:
 *
 *   "bu cihazda"  — written here, held here, lost if this profile is cleared
 *   "kayıtta"     — the server has it and other people can see it
 *
 * Nothing on this panel calls the first one saved. The badge at the top says
 * which of the two states each capture is in, the count is of captures that
 * have NOT reached the record, and it only goes down when a write succeeded.
 * A refusal is written on the capture it belongs to, with the stage it failed
 * at, because "senkron başarısız" tells a person nothing they can act on.
 *
 * Action lines go to the triage queue rather than becoming actions. In a
 * meeting with no signal nobody can look up a stakeholder, and an action here
 * needs an owner and a date; inventing them to make the sync succeed would be
 * the same defect the Notion import refused to commit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { CloudOff, HardDriveDownload, RefreshCw, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuthority } from '../../api/adminHooks';
import {
  useHeldCaptures,
  useHoldCapture,
  useOnline,
  useSyncCaptures,
} from '../../api/captureHooks';
import type { SyncSummary } from '../../api/captureHooks';
import { canHold, capture as makeCapture } from '../../lib/offlineQueue';
import { MINUTE_KEEPERS, actsAs } from '../../lib/authority';
import { MEETING_KIND_VALUES, meetingKindLabel } from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import type { Confidentiality, ContentLanguage, MeetingKind } from '../../types';

/** Local datetime for a datetime-local input. */
function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STAGE_LABEL: Record<string, { tr: string; en: string }> = {
  meeting: { tr: 'toplantı kaydı', en: 'the meeting record' },
  minute: { tr: 'tutanak metni', en: 'the minute' },
  actions: { tr: 'aksiyon satırları', en: 'the action lines' },
};

export const CapturePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const online = useOnline();
  const authority = useAuthority();
  const captures = useHeldCaptures();
  const hold = useHoldCapture();
  const sync = useSyncCaptures();

  const held = captures.data ?? [];
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);

  const [title, setTitle] = useState('');
  const [heldAt, setHeldAt] = useState(nowLocal);
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState<MeetingKind>('internal');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');
  const [noteLanguage, setNoteLanguage] = useState<ContentLanguage>(tr ? 'tr' : 'en');
  const [minute, setMinute] = useState('');
  const [lines, setLines] = useState('');

  // When the connection returns, drain the queue — once, and not again until
  // something actually changes.
  //
  // The dependencies are deliberately two numbers rather than the queue
  // itself: `held` is a fresh array on every render, and an effect that
  // depends on it would re-fire immediately after a refusal, which is a retry
  // loop against a server that has just said no. With `pending` instead, a
  // failed pass leaves the deps untouched and nothing happens until a new
  // capture is written or the connection flips. Retrying after a refusal is
  // then a person's decision, which is the right place for it.
  const draining = useRef(false);
  const queued = useRef(held);
  const send = useRef(sync.mutate);
  queued.current = held;
  send.current = sync.mutate;
  const pending = held.length;

  useEffect(() => {
    if (!online || pending === 0 || draining.current) return;
    draining.current = true;
    send.current(queued.current, {
      onSuccess: (result) => setSummary(result),
      onSettled: () => {
        draining.current = false;
      },
    });
  }, [online, pending]);

  // Somebody who cannot keep minutes cannot create a meeting, and the server
  // is where that is decided. Offline we have no answer, which the panel says
  // rather than guessing either way.
  const authorityKnown = authority.data != null;
  const mayKeep = actsAs(authority.data, ...MINUTE_KEEPERS);
  const refused = authorityKnown && !mayKeep;

  const supported = canHold();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <HardDriveDownload
            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Bağlantısız toplantı kaydı' : 'Capturing a meeting with no connection'}
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              {tr
                ? 'Sahada, valilikte, yolda — bağlantı olmadığı yerde toplantı yazılabilsin diye. Yazdığınız şey bağlantı gelene kadar yalnızca bu cihazdadır; kayda geçtiği an bunu açıkça söyler. Aksiyon cümleleri aksiyon olmaz, aday kuyruğuna düşer: sahada tarih ve sorumlu uydurmak zorunda kalmazsınız.'
                : 'For the rooms the network does not reach. What you write stays on this device until the connection returns, and the panel says so plainly until it has gone. Action sentences become candidates rather than actions, so nobody has to invent an owner and a date in a room with no signal.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {online ? (
            <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
              <Wifi className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
              {tr ? 'bağlantı var' : 'connected'}
            </Pill>
          ) : (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              <WifiOff className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
              {tr ? 'bağlantı yok' : 'no connection'}
            </Pill>
          )}
          {held.length > 0 && (
            <Pill className="border-slate-300 bg-slate-50 text-slate-700">
              {tr
                ? `${held.length} kayıt bu cihazda, kayıtta değil`
                : `${held.length} held on this device, not on the record`}
            </Pill>
          )}
          {!open && supported && !refused && (
            <ActionButton onClick={() => setOpen(true)}>
              {tr ? 'Toplantı yaz' : 'Write a meeting down'}
            </ActionButton>
          )}
          {held.length > 0 && online && (
            <ActionButton
              onClick={() => sync.mutate(held, { onSuccess: (r) => setSummary(r) })}
              disabled={sync.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {tr ? 'Şimdi gönder' : 'Send them now'}
            </ActionButton>
          )}
        </div>
      </header>

      {!supported && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {tr
            ? 'Bu tarayıcı çevrimdışı saklama yapamıyor (gizli pencere ya da site verisi engelli olabilir). Burada toplantı yazmayın — tuşa bastığınızda hiçbir yere gitmez. Bağlantı varken normal toplantı kaydını kullanın.'
            : 'This browser will not hold anything offline — a private window, or site data blocked. Do not write a meeting here: it would go nowhere. Use the ordinary meeting record while you have a connection.'}
        </p>
      )}

      {refused && (
        <p className="mb-2 text-xs text-slate-600">
          {tr
            ? 'Tutanak tutma yetkiniz yok, bu yüzden yazdığınız bir toplantı sunucuda reddedilirdi. Bu kutu size kayıt göstermekle sınırlı.'
            : 'You do not keep minutes, so a meeting written here would be refused by the server. This panel is read-only for you.'}
        </p>
      )}

      {summary && (
        <p
          className={`mb-2 rounded-lg px-3 py-2 text-xs ${
            summary.failed > 0
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {/* Never "hepsi gönderildi" unless nothing refused. */}
          {tr
            ? `${summary.sent} kayıt kütüğe geçti` +
              (summary.failed > 0
                ? `, ${summary.failed} tanesi reddedildi ve bu cihazda duruyor.`
                : '.')
            : `${summary.sent} reached the record` +
              (summary.failed > 0
                ? `, ${summary.failed} were refused and are still held here.`
                : '.')}
          {summary.firstError && <span className="ml-1 font-mono">{summary.firstError}</span>}
        </p>
      )}

      {open && supported && !refused && (
        <form
          aria-label={tr ? 'Bağlantısız toplantı kaydı' : 'Offline meeting capture'}
          className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            hold.mutate(
              makeCapture({
                title: title.trim(),
                heldAt: new Date(heldAt).toISOString(),
                location: location.trim() || null,
                kind,
                confidentiality,
                language: noteLanguage,
                minute,
                actionLines: lines.split('\n'),
              }),
              {
                onSuccess: () => {
                  setTitle('');
                  setLocation('');
                  setMinute('');
                  setLines('');
                  setHeldAt(nowLocal());
                  setOpen(false);
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Field label={tr ? 'Başlık' : 'Title'} className="sm:col-span-2">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <Field label={tr ? 'Tarih ve saat' : 'Date and time'}>
              <TextInput
                type="datetime-local"
                value={heldAt}
                onChange={(e) => setHeldAt(e.target.value)}
                required
              />
            </Field>
            <Field label={tr ? 'Yer' : 'Location'}>
              <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field label={tr ? 'Tür' : 'Kind'}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as MeetingKind)}>
                {MEETING_KIND_VALUES.map((k) => (
                  <option key={k} value={k}>
                    {meetingKindLabel(k, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Gizlilik' : 'Tier'}>
              <Select
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
              >
                <option value="public">{tr ? 'Açık' : 'Public'}</option>
                <option value="internal">{tr ? 'Kuruma özel' : 'Internal'}</option>
                <option value="confidential">{tr ? 'Gizli' : 'Confidential'}</option>
                <option value="restricted">{tr ? 'Kısıtlı' : 'Restricted'}</option>
              </Select>
            </Field>
          </div>

          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-600">
                {tr ? 'Görüşülenler' : 'What was discussed'}
              </label>
              <Select
                value={noteLanguage}
                onChange={(e) => setNoteLanguage(e.target.value as ContentLanguage)}
                aria-label={tr ? 'Tutanak dili' : 'Minute language'}
                className="w-auto"
              >
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </Select>
            </div>
            <textarea
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm leading-relaxed text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="mt-2.5">
            <label className="text-xs font-semibold text-slate-600">
              {tr ? 'Aksiyon cümleleri — her satıra bir tane' : 'Action sentences, one per line'}
            </label>
            <textarea
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              rows={3}
              placeholder={
                tr
                  ? 'Mühendislik raporu Cumartesiye kadar teslim edilecek'
                  : 'Engineering report to be delivered by Saturday'
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm leading-relaxed text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {tr
                ? 'Bunlar aksiyon olmayacak. Kayda geçtiklerinde aday kuyruğuna düşer; sorumlu ve tarihi orada, bağlantı varken siz koyarsınız.'
                : 'These do not become actions. They land in the triage queue, where you set the owner and the date once you have a connection.'}
            </p>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            {!authorityKnown && (
              <span className="mr-auto text-xs text-amber-800">
                {tr
                  ? 'Yetkiniz şu an doğrulanamıyor — sunucuya ulaşılamıyor. Reddedilirse bunu ancak bağlantı gelince öğrenirsiniz.'
                  : 'Your authority cannot be checked while the server is unreachable. If it refuses, you will learn that when the connection returns.'}
              </span>
            )}
            <ActionButton type="button" onClick={() => setOpen(false)}>
              {tr ? 'Vazgeç' : 'Cancel'}
            </ActionButton>
            <ActionButton type="submit" tone="primary" disabled={hold.isPending}>
              {tr ? 'Bu cihazda tut' : 'Hold it on this device'}
            </ActionButton>
            <div className="w-full">
              <WriteError error={hold.error} />
            </div>
          </div>
        </form>
      )}

      <WriteError error={captures.error} />

      {held.length > 0 && (
        <ul className="space-y-1">
          {held.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <CloudOff className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                <span className="font-semibold text-slate-900">{c.title}</span>
                <span className="font-mono text-slate-500">
                  {c.heldAt.slice(0, 16).replace('T', ' ')}
                </span>
                <span className="text-slate-500">
                  {tr
                    ? `${c.actionLines.length} aksiyon cümlesi`
                    : `${c.actionLines.length} action ${c.actionLines.length === 1 ? 'line' : 'lines'}`}
                </span>
                <span className="ml-auto font-semibold text-amber-900">
                  {tr ? 'bu cihazda — kayıtta değil' : 'on this device — not on the record'}
                </span>
              </div>
              {c.lastError && (
                <p className="mt-1 text-rose-800">
                  {tr ? 'Sunucu reddetti' : 'The server refused'}
                  {c.lastStage &&
                    ` (${tr ? STAGE_LABEL[c.lastStage]?.tr : STAGE_LABEL[c.lastStage]?.en})`}
                  {': '}
                  <span className="font-mono">{c.lastError}</span>
                  {c.attempts > 1 && (
                    <span className="ml-1 text-slate-500">
                      {tr ? `${c.attempts} deneme` : `${c.attempts} attempts`}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
