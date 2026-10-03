import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, Users, Link2, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as meetings from '../api/meetingHooks';
import { useAuthority } from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { AgendaPanel } from '../components/meetings/AgendaPanel';
import { CapturePanel } from '../components/meetings/CapturePanel';
import { TriagePanel } from '../components/meetings/TriagePanel';
import { useMachineMarks } from '../api/translateHooks';
import { MachineBadge } from '../components/ui/MachineBadge';
import { bilingualFrom } from '../lib/meetings';
import { splitBySettled } from '../lib/registerStates';
import { SettledSection } from '../components/ui/SettledSection';
import { MINUTE_KEEPERS, actsAs, clearanceLabel, clearanceStyle } from '../lib/authority';
import {
  MEETING_KIND_VALUES,
  MEETING_STATUS_VALUES,
  MINUTES_STATUS_STYLES,
  meetingKindLabel,
  meetingStatusLabel,
  minutesStatusLabel,
} from '../lib/meetings';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TextInput,
  WriteError,
} from '../components/ui/Controls';
import type { Confidentiality, Meeting, MeetingKind, MeetingStatus } from '../types';

/**
 * The meeting record (M3).
 *
 * The list is secondary. What this screen is really for is the panel above
 * it: the team already writes disciplined notes, and what does not happen is
 * the next step — the action nobody owns, the question nobody answered, the
 * thing that was not carried into the following meeting.
 */
export const MeetingsView: React.FC = () => {
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';

  const list = meetings.useMeetings();
  const authority = useAuthority();
  const canKeep = actsAs(authority.data, ...MINUTE_KEEPERS);

  const [creating, setCreating] = useState(false);
  const rows = list.data ?? [];
  const marks = useMachineMarks(
    'meetings',
    rows.map((m) => m.id),
  );
  // Yapılmış ya da iptal edilmiş toplantı kimseden bir şey istemiyor;
  // planlanmış olan istiyor. Toplantıdan çıkan aksiyonlar kendi kütüğünde
  // duruyor, yani geri çekilen şey kaydın kendisi, işi değil. Hüküm
  // `lib/registerStates`'te, bir kez (CLAUDE.md §4).
  const { open: waiting, settled } = splitBySettled(rows, 'meeting_status', (m) => m.status);

  /** Bir satır; iki yerde çiziliyor (önümüzdeki ve yapılmış). */
  const row = (meeting: Meeting) => (
    <li key={meeting.id}>
      <button
        type="button"
        onClick={() => navigate(`/meetings/${meeting.id}`)}
        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-1 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900">
              {/* The record is bilingual where the migration
                        found both minutes; the reader's own language
                        wins, and the English title is the fallback
                        because it is the one that is never null. */}
              {(tr ? meeting.titleTr : meeting.title) ?? meeting.title}
            </span>
            {marks.is(
              meeting.id,
              'title',
              bilingualFrom(meeting.title, meeting.titleTr, language).side,
            ) && <MachineBadge />}
            <Pill>{meetingKindLabel(meeting.kind, language)}</Pill>
            <Pill className={MINUTES_STATUS_STYLES[meeting.minutesStatus]}>
              {minutesStatusLabel(meeting.minutesStatus, language)}
            </Pill>
            {meeting.confidentiality !== 'internal' && (
              <Pill className={clearanceStyle(meeting.confidentiality)}>
                {clearanceLabel(meeting.confidentiality, language)}
              </Pill>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="font-mono">{meeting.heldAt.slice(0, 16).replace('T', ' ')}</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              {meeting.attendeeCount}
            </span>
            {meeting.location && <span>{meeting.location}</span>}
            {meeting.continuesMeetingTitle && (
              <span className="flex items-center gap-1">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                {tr ? 'devamı: ' : 'continues: '}
                {meeting.continuesMeetingTitle}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-slate-500">
          {meetingStatusLabel(meeting.status, language)}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Toplantılar ve Kararlar' : 'Meetings & Decisions'}
            </h1>
            <p className="text-sm text-slate-500">
              {tr
                ? 'Toplantı notunu arşiv olmaktan çıkarıp taahhüt üreten bir mekanizmaya çevirmek için.'
                : 'To stop a meeting note being an archive and make it something that produces commitments.'}
            </p>
          </div>
        </div>
        {canKeep && !creating && (
          <ActionButton tone="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Toplantı aç' : 'Record a meeting'}</span>
          </ActionButton>
        )}
      </header>

      <QueryStatus queries={[list]} />

      <AgendaPanel />

      {/* Above the queue because it is what a person reaches for in a
          room with no signal, and below the agenda because that is what
          they came to the screen for. */}
      <CapturePanel />

      {/* The queue sits above the list because it is the thing that is
          actually owed. The list is what happened; the queue is what was
          said in those meetings and has not yet been decided. */}
      <TriagePanel />

      {creating && (
        <NewMeetingForm
          existing={rows.map((m) => ({
            id: m.id,
            title: m.title,
            titleTr: m.titleTr,
            heldAt: m.heldAt,
          }))}
          onDone={(id) => {
            setCreating(false);
            if (id) navigate(`/meetings/${id}`);
          }}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {tr ? 'Kayıtlı toplantılar' : 'Recorded meetings'}
            <Pill className="ml-1.5">{waiting.length}</Pill>
          </h2>
        </header>
        <div className="p-4">
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={tr ? 'Toplantı kaydı yok' : 'No meetings recorded'}
              description={
                tr
                  ? 'İlk toplantıyı kaydedin, ya da Notion göçünü bekleyin. Bir toplantı kaydı açıldığında açık aksiyonlar gündemine otomatik düşer.'
                  : 'Record the first one, or wait for the Notion migration. Open actions land on a new meeting’s agenda by themselves.'
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">{waiting.map(row)}</ul>

              {/* Önümüzde toplantı kalmadıysa bunu söylemek gerekiyor: boş bir
                  alan, yapılmışların altında "takvim boş" ile "hiç toplantı
                  yok"u birbirine karıştırır. */}
              {waiting.length === 0 && settled.length > 0 && (
                <p className="text-xs text-slate-500">
                  {tr
                    ? 'Önümüzde toplantı yok; kayıtlı olanların hepsi yapılmış ya da iptal edilmiş.'
                    : 'No meeting is ahead; every one recorded has been held or cancelled.'}
                </p>
              )}

              <SettledSection rows={settled} label={{ tr: 'Yapılmış', en: 'Held' }}>
                {(shown) => <ul className="divide-y divide-slate-100">{shown.map(row)}</ul>}
              </SettledSection>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Local datetime, for a datetime-local input. */
function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

const NewMeetingForm: React.FC<{
  existing: { id: string; title: string; titleTr: string | null; heldAt: string }[];
  onDone: (id: string | null) => void;
}> = ({ existing, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = meetings.useCreateMeeting();

  const [title, setTitle] = useState('');
  const [heldAt, setHeldAt] = useState(nowLocal);
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState<MeetingKind>('internal');
  const [status, setStatus] = useState<MeetingStatus>('planned');
  const [continues, setContinues] = useState('');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            title: title.trim(),
            heldAt: new Date(heldAt).toISOString(),
            location: location.trim() || null,
            kind,
            priority: 'normal',
            status,
            minutesStatus: 'draft',
            continuesMeetingId: continues || null,
            confidentiality,
          },
          { onSuccess: (created) => onDone(created.id) },
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
        <Field label={tr ? 'Tür' : 'Kind'}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as MeetingKind)}>
            {MEETING_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {meetingKindLabel(k, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Durum' : 'Status'}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)}>
            {MEETING_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {meetingStatusLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Yer' : 'Location'}>
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={tr ? 'Şunun devamı' : 'Continues'} className="sm:col-span-2">
          <Select value={continues} onChange={(e) => setContinues(e.target.value)}>
            <option value="">{tr ? 'Bağımsız toplantı' : 'Stands on its own'}</option>
            {existing.map((m) => (
              <option key={m.id} value={m.id}>
                {m.heldAt.slice(0, 10)} · {(tr ? m.titleTr : m.title) ?? m.title}
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

      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {tr
            ? 'Toplantıya katılan dış paydaşlar kaydı yalnızca kendi gizlilik seviyeleri elveriyorsa görür. Katılım kapsamı daraltır, gizlilik seviyesini yükseltmez — gizli bir toplantıya katılmak onu okunur yapmaz.'
            : 'An outside attendee reads the record only if their own clearance allows it. Attendance narrows scope; it never lifts a ceiling, so sitting in a confidential meeting does not make it readable.'}
        </span>
      </p>

      <WriteError error={create.error} />

      <div className="mt-2.5 flex justify-end gap-2">
        <ActionButton type="button" onClick={() => onDone(null)} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Aç' : 'Create'}
        </ActionButton>
      </div>
    </form>
  );
};
