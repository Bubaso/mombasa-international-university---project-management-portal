import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Gavel,
  FileText,
  ScrollText,
  CircleAlert,
  HelpCircle,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchCalendar } from '../api/calendar';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { bilingual, bilingualFrom } from '../lib/meetings';
import { useMachineMarks } from '../api/translateHooks';
import { MachineBadge } from '../components/ui/MachineBadge';
import { IcsExport } from '../components/calendar/IcsExport';
import { Pill } from '../components/ui/Controls';
import type { CalendarEntry, CalendarKind, Language } from '../types';

const KINDS: Record<
  CalendarKind,
  { icon: React.ElementType; tr: string; en: string; style: string }
> = {
  hearing: {
    icon: Gavel,
    tr: 'Duruşma',
    en: 'Hearing',
    style: 'border-rose-300 bg-rose-50 text-rose-900',
  },
  filing: {
    icon: FileText,
    tr: 'Layiha süresi',
    en: 'Filing deadline',
    style: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  obligation: {
    icon: ScrollText,
    tr: 'Yükümlülük',
    en: 'Obligation',
    style: 'border-purple-300 bg-purple-50 text-purple-900',
  },
  action: {
    icon: CircleAlert,
    tr: 'Aksiyon',
    en: 'Action',
    style: 'border-teal-300 bg-teal-50 text-teal-900',
  },
  question: {
    icon: HelpCircle,
    tr: 'Açık soru',
    en: 'Open question',
    style: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  meeting: {
    icon: Users,
    tr: 'Toplantı',
    en: 'Meeting',
    style: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  },
};

const KIND_ORDER = Object.keys(KINDS) as CalendarKind[];

/** The bands the requirements name, applied across every register at once. */
function band(dueOn: string | null): { key: string; tr: string; en: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (!dueOn) return { key: 'undated', tr: 'Tarihsiz', en: 'No date' };
  if (dueOn < today) return { key: 'overdue', tr: 'Geçmiş', en: 'Already passed' };
  const days = Math.round(
    (new Date(`${dueOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days <= 1) return { key: 'now', tr: 'Bugün ve yarın', en: 'Today and tomorrow' };
  if (days <= 7) return { key: 'week', tr: 'Bu hafta', en: 'This week' };
  if (days <= 30) return { key: 'month', tr: 'Bu ay', en: 'This month' };
  if (days <= 90) return { key: 'quarter', tr: 'Önümüzdeki üç ay', en: 'The next three months' };
  return { key: 'later', tr: 'Daha ileride', en: 'Later' };
}

const BAND_ORDER = ['overdue', 'now', 'week', 'month', 'quarter', 'later', 'undated'];

function daysFrom(dueOn: string | null, language: Language): string | null {
  if (!dueOn) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round(
    (new Date(`${dueOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  const tr = language === 'tr';
  if (days === 0) return tr ? 'bugün' : 'today';
  if (days < 0) return tr ? `${Math.abs(days)} gün geçti` : `${Math.abs(days)} days ago`;
  return tr ? `${days} gün` : `in ${days} days`;
}

/**
 * Everything with a date, in one place (M15-03, M15-04).
 *
 * By now the portal holds five separate things that come due — a court
 * hearing, a filing deadline, an obligation from the lease or an order, an
 * action somebody undertook, and a question that should have had an answer.
 * Each lives in its own register for good reasons, and nobody plans a week by
 * opening five screens.
 *
 * What is on this page depends entirely on who is reading it. The view is
 * declared security_invoker, so an advocate gets their own court dates and a
 * contractor gets what they owe — without this component filtering anything.
 */
export const CalendarView: React.FC = () => {
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';

  const calendar = useQuery({ queryKey: ['projectCalendar'], queryFn: fetchCalendar });
  const [kind, setKind] = useState<CalendarKind | ''>('');

  const entries = calendar.data ?? [];

  // The calendar mixes six registers; three of them can hold machine text
  // today. A badge here matters as much as on the record's own screen: this is
  // the list people plan a week from.
  const actionMarks = useMachineMarks(
    'action_items',
    entries.filter((e) => e.kind === 'action').map((e) => e.id),
  );
  const questionMarks = useMachineMarks(
    'open_questions',
    entries.filter((e) => e.kind === 'question').map((e) => e.id),
  );
  const meetingMarks = useMachineMarks(
    'meetings',
    entries.filter((e) => e.kind === 'meeting').map((e) => e.id),
  );
  const machineWritten = (entry: (typeof entries)[number]): boolean => {
    const side = bilingualFrom(entry.titleEn, entry.titleTr, language).side;
    if (entry.kind === 'action') return actionMarks.is(entry.id, 'text', side);
    if (entry.kind === 'question') return questionMarks.is(entry.id, 'question', side);
    if (entry.kind === 'meeting') return meetingMarks.is(entry.id, 'title', side);
    return false;
  };
  const shown = useMemo(
    () => (kind ? entries.filter((e) => e.kind === kind) : entries),
    [entries, kind],
  );

  const banded = useMemo(() => {
    const map = new Map<string, { label: { tr: string; en: string }; rows: CalendarEntry[] }>();
    for (const entry of shown) {
      const b = band(entry.dueOn);
      const existing = map.get(b.key) ?? { label: { tr: b.tr, en: b.en }, rows: [] };
      existing.rows.push(entry);
      map.set(b.key, existing);
    }
    return BAND_ORDER.filter((k) => map.has(k)).map((k) => ({
      key: k,
      ...(map.get(k) as { label: { tr: string; en: string }; rows: CalendarEntry[] }),
    }));
  }, [shown]);

  const overdue = entries.filter((e) => e.needsAttention).length;

  const open = (entry: CalendarEntry) => {
    if (entry.kind === 'meeting' && entry.meetingId) navigate(`/meetings/${entry.meetingId}`);
    else if (entry.kind === 'obligation') navigate('/obligations');
    else if (entry.kind === 'hearing' || entry.kind === 'filing') navigate('/legal');
    else if (entry.meetingId) navigate(`/meetings/${entry.meetingId}`);
    else navigate('/meetings');
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Takvim ve Geri Sayım' : 'Calendar & Countdown'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Duruşma, usul süresi, yükümlülük, aksiyon ve cevaplanmamış soru — tarihi olan her şey tek listede. Haftasını planlamak için beş ekran açan kimse yok.'
                : 'Hearings, procedural deadlines, obligations, actions and unanswered questions — everything with a date, in one list. Nobody plans a week by opening five screens.'}
            </p>
          </div>
        </div>
        {overdue > 0 && (
          <Pill className="border-rose-300 bg-rose-50 text-rose-800">
            {tr ? `${overdue} geçmiş` : `${overdue} already passed`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[calendar]} />

      <IcsExport entries={entries} />

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={kind === ''} onClick={() => setKind('')}>
          {tr ? 'Hepsi' : 'Everything'} ({entries.length})
        </FilterChip>
        {KIND_ORDER.map((k) => {
          const count = entries.filter((e) => e.kind === k).length;
          if (count === 0) return null;
          const Icon = KINDS[k].icon;
          return (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(kind === k ? '' : k)}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {KINDS[k][language]} ({count})
            </FilterChip>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tr ? 'Tarihli bir şey yok' : 'Nothing is due'}
          description={
            entries.length === 0
              ? tr
                ? 'Duruşma, süre, yükümlülük ya da aksiyon kaydedildikçe burada görünürler. Bu listede yalnızca sizin görmeye yetkili olduğunuz kayıtlar yer alır.'
                : 'Hearings, deadlines, obligations and actions appear here as they are recorded. This list shows only what you are allowed to see.'
              : tr
                ? 'Bu türde kayıt yok.'
                : 'Nothing of that kind.'
          }
        />
      ) : (
        <div className="space-y-4">
          {banded.map((group) => (
            <section
              key={group.key}
              className={`rounded-xl border bg-white shadow-xs ${
                group.key === 'overdue' ? 'border-rose-300' : 'border-slate-200'
              }`}
            >
              <header
                className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${
                  group.key === 'overdue'
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <h2
                  className={`text-sm font-semibold ${
                    group.key === 'overdue' ? 'text-rose-900' : 'text-slate-900'
                  }`}
                >
                  {group.label[language]}
                </h2>
                <span className="text-xs text-slate-400">{group.rows.length}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {group.rows.map((entry) => {
                  const Icon = KINDS[entry.kind].icon;
                  return (
                    <li key={`${entry.kind}-${entry.id}`}>
                      <button
                        type="button"
                        onClick={() => open(entry)}
                        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <Icon
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              entry.needsAttention ? 'text-rose-600' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-900">
                              {bilingual(entry.titleEn, entry.titleTr, language) ||
                                (tr ? '(başlıksız)' : '(untitled)')}
                              {machineWritten(entry) && <MachineBadge className="ml-1.5" />}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                              <span>{KINDS[entry.kind][language]}</span>
                              {entry.detail && <span>· {entry.detail.replace(/_/g, ' ')}</span>}
                              {entry.state && entry.state !== entry.detail && (
                                <span>· {entry.state.replace(/_/g, ' ')}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`font-mono text-xs ${
                              entry.needsAttention
                                ? 'font-semibold text-rose-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {daysFrom(entry.dueOn, language)}
                          </span>
                          <span className="hidden font-mono text-xs text-slate-400 sm:inline">
                            {entry.dueOn}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? 'border-amber-400 bg-amber-50 text-amber-900'
        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);
