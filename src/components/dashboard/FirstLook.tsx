import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { daysUntil } from '../../lib/date';
import { formatDate } from '../../lib/site';
import type { CalendarEntry } from '../../types';

/**
 * Three numbers at the top of the dashboard, so the screen opens with the
 * state of the project rather than with a paragraph about itself (T10-08).
 *
 * All three are read from the project calendar, which the dashboard already
 * fetches: everything with a date, from every register, under the reader's
 * own access. No new query, and nothing here that a query did not produce —
 * the figure this screen used to open with was a capital total of 807.3M that
 * nothing computed.
 *
 * On the honesty rule that matters most here: a count over a list that
 * arrived is a measurement, and zero is a real answer — "nothing is overdue"
 * is worth knowing. What is NOT a measurement is a count over a list that
 * never arrived, so this renders nothing at all until the query settles, and
 * `QueryStatus` above it says which of the four states the fetch is in. The
 * one genuinely unknowable figure is the next date when nothing has one; that
 * says so in words instead of showing a dash that reads as zero days.
 */

interface FirstLookProps {
  entries: CalendarEntry[] | undefined;
}

export const FirstLook: React.FC<FirstLookProps> = ({ entries }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();

  // Nothing fetched yet: no tiles. A zero here would be a claim about the
  // project rather than a statement about the request.
  if (!entries) return null;

  const dated = entries.filter((e) => e.dueOn);
  const overdue = dated.filter((e) => {
    const d = daysUntil(e.dueOn);
    return d !== null && d < 0 && e.needsAttention;
  });
  const thisWeek = dated.filter((e) => {
    const d = daysUntil(e.dueOn);
    return d !== null && d >= 0 && d <= 7;
  });
  const next = dated
    .map((e) => ({ entry: e, days: daysUntil(e.dueOn) }))
    .filter((x): x is { entry: CalendarEntry; days: number } => x.days !== null && x.days >= 0)
    .sort((a, b) => a.days - b.days)[0];

  const tiles: { label: string; value: string; note: string; tone: string; to: string }[] = [
    {
      label: tr ? 'Vadesi geçmiş' : 'Past due',
      value: String(overdue.length),
      note: tr ? 'hâlâ dikkat bekliyor' : 'still needing attention',
      tone:
        overdue.length > 0
          ? 'border-rose-300 bg-rose-50 text-rose-900'
          : 'border-slate-200 bg-white text-slate-900',
      to: '/calendar',
    },
    {
      label: tr ? 'Önümüzdeki 7 gün' : 'Next 7 days',
      value: String(thisWeek.length),
      note: tr ? 'tarihli kayıt' : 'dated records',
      tone:
        thisWeek.length > 0
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-white text-slate-900',
      to: '/calendar',
    },
    {
      label: tr ? 'Sıradaki tarih' : 'Next date',
      // The only one that can be unknown: with nothing dated there is no next
      // date, and a "0" or a "—" would both read as an answer.
      value: next ? (next.days === 0 ? (tr ? 'bugün' : 'today') : String(next.days)) : '—',
      note: next
        ? next.days === 0
          ? (tr ? '' : '') + formatDate(next.entry.dueOn, language)
          : `${tr ? 'gün sonra' : 'days away'} · ${formatDate(next.entry.dueOn, language)}`
        : tr
          ? 'tarihli kayıt yok'
          : 'nothing is dated',
      tone: 'border-slate-200 bg-white text-slate-900',
      to: '/calendar',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2" data-first-look>
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => navigate(t.to)}
          className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors hover:brightness-95 ${t.tone}`}
        >
          <div className="text-xs font-medium tracking-wide uppercase opacity-70">{t.label}</div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums">{t.value}</div>
          <div className="text-xs leading-tight opacity-70">{t.note}</div>
        </button>
      ))}
    </div>
  );
};
