/**
 * The critical countdown strip (M15-04).
 *
 * This is the matured version of the banner the requirement names. Three
 * things about it changed, and each was a defect rather than a preference.
 *
 * It read `deadline_notifications` — hand-typed dates with a `target_roles`
 * array deciding who saw them. That was a second answer to "what falls due"
 * beside the calendar every other screen reads, and a second access
 * mechanism weaker than the policies. The table is gone (0024); the strip now
 * reads `critical_dates`, computed from eight registers and filtered by the
 * same policies as everything else.
 *
 * Which dates count as critical is decided in SQL, once, and not here. Three
 * screens asking the same question should not be able to get three answers.
 *
 * And dismissing one used to DELETE the row — removing a court date from
 * every user of the portal. Faz 0 made it session-local with a comment saying
 * it would stay that way until per-user acknowledgements existed. They exist
 * now, so dismissing is persistent and takes the date off this reader's strip
 * and nobody else's.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, Gavel, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAcknowledgeDate, useCriticalDates } from '../api/planHooks';
import { formatDate } from '../lib/site';
import { calendarKindRoute } from '../lib/calendarKinds';

/** Where each kind of date lives, so the strip is clickable. */
export const DeadlineAlertBanner: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  // Three, because the requirement says three. A strip of nine is a list, and
  // a list at the top of every screen is furniture people stop reading.
  const dates = useCriticalDates(3);
  const acknowledge = useAcknowledgeDate();

  const rows = dates.data?.rows ?? [];
  // Üçü gösterip kaç tane olduğunu söylememek, şeridi okuyana "sırada bunlar
  // var" dedirtir — oysa sırada on bir tane olabilir. Sayı, kesmenin kendisi
  // kadar şeridin işi.
  const beyond = (dates.data?.total ?? 0) - rows.length;
  if (rows.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50/90 px-3 py-1.5 sm:px-4 sm:py-2.5">
      <div className="mx-auto flex max-w-7xl flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 text-xs font-semibold tracking-wider text-amber-900 uppercase sm:text-sm">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          <span>{tr ? 'Kritik tarihler' : 'Critical dates'}</span>
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          {rows.map((date) => {
            const title = tr ? (date.titleTr ?? date.titleEn) : (date.titleEn ?? date.titleTr);
            const past = date.daysAway < 0;
            return (
              <li key={`${date.kind}-${date.id}`} className="flex min-w-0 items-center gap-1.5">
                {date.kind === 'hearing' ? (
                  <Gavel className="h-3 w-3 shrink-0 text-amber-700" aria-hidden="true" />
                ) : (
                  <Clock className="h-3 w-3 shrink-0 text-amber-700" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => navigate(calendarKindRoute(date.kind))}
                  className="min-w-0 cursor-pointer truncate text-left text-amber-900 hover:underline"
                >
                  {title ?? (tr ? '(başlıksız)' : '(untitled)')}
                </button>
                {/* Signed, and said in words. "−3 days" is a number people
                    misread; "3 days ago" is not. */}
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs ${
                    past
                      ? 'border-rose-300 bg-rose-100 text-rose-900'
                      : date.daysAway <= 7
                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                        : 'border-amber-200 bg-white text-amber-800'
                  }`}
                  title={formatDate(date.dueOn, language)}
                >
                  {past
                    ? tr
                      ? `${-date.daysAway} gün önce`
                      : `${-date.daysAway}d ago`
                    : date.daysAway === 0
                      ? tr
                        ? 'bugün'
                        : 'today'
                      : tr
                        ? `${date.daysAway} gün`
                        : `${date.daysAway}d`}
                </span>
                <button
                  type="button"
                  onClick={() => acknowledge.mutate({ kind: date.kind, entryId: date.id })}
                  disabled={acknowledge.isPending}
                  aria-label={
                    tr
                      ? 'Gördüm — bu tarihi şeridimden kaldır'
                      : 'Seen it — take this date off my strip'
                  }
                  title={
                    tr
                      ? 'Gördüm. Yalnızca sizin şeridinizden kalkar.'
                      : 'Seen it. Taken off your strip only.'
                  }
                  className="shrink-0 cursor-pointer p-0.5 text-amber-600 hover:text-amber-900 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
          {beyond > 0 && (
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => navigate('/plan')}
                className="cursor-pointer text-xs font-medium text-amber-800 hover:underline"
              >
                {tr ? `+${beyond} tarih daha` : `+${beyond} more`}
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
