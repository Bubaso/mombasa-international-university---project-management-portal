import React, { useState } from 'react';
import { AlertTriangle, UserX, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAttention } from '../../api/stakeholderHooks';
import { daysSince, stanceLabel, stanceStyle } from '../../lib/stakeholders';
import { Pill } from '../ui/Controls';

/**
 * The two ways a relationship fails without anyone deciding to let it.
 *
 * Nobody ever resolves to drop a minister. What happens is that the person who
 * was talking to them stops, or was never named, and six weeks pass. This
 * strip is the portal doing the noticing, because a register that only answers
 * questions you thought to ask is an address book again.
 */
export const AttentionStrip: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const attention = useAttention();
  const [expanded, setExpanded] = useState(false);

  const rows = attention.data ?? [];
  const unowned = rows.filter((r) => r.needsAnOwner);
  const quiet = rows.filter((r) => r.hasGoneQuiet && !r.needsAnOwner);
  const flagged = [...unowned, ...quiet];

  if (attention.isPending || flagged.length === 0) {
    return rows.length > 0 ? (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
        {tr
          ? 'Her paydaşın bir sorumlusu var ve hiçbiri nüfuzuna göre beklenenden uzun süredir sessiz değil.'
          : 'Every stakeholder has somebody keeping them, and none has been quiet longer than their influence warrants.'}
      </div>
    ) : null;
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="min-w-0 text-xs text-amber-900">
            <span className="font-semibold">
              {tr
                ? `${flagged.length} ilişki ilgi bekliyor`
                : `${flagged.length} relationships need attention`}
            </span>
            <span className="ml-2 text-amber-900/70">
              {unowned.length > 0 &&
                (tr ? `${unowned.length} sahipsiz` : `${unowned.length} with nobody keeping them`)}
              {unowned.length > 0 && quiet.length > 0 && ' · '}
              {quiet.length > 0 && (tr ? `${quiet.length} sessiz` : `${quiet.length} gone quiet`)}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <ul className="divide-y divide-amber-200 border-t border-amber-200">
          {flagged.map((row) => {
            const quietFor = daysSince(row.lastContactAt);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2 text-left text-xs hover:bg-amber-100/60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-amber-950">{row.fullName}</span>
                    <Pill className={stanceStyle(row.stance)}>
                      {stanceLabel(row.stance, language)}
                    </Pill>
                    <span className="shrink-0 font-mono text-[10px] text-amber-900/60">
                      {tr ? 'nüfuz' : 'influence'} {row.influence}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-[11px] text-amber-900/80">
                    {row.needsAnOwner && (
                      <span className="flex items-center gap-1">
                        <UserX className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'sorumlusu yok' : 'no owner'}
                      </span>
                    )}
                    {row.hasGoneQuiet && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {quietFor == null
                          ? tr
                            ? 'hiç temas yok'
                            : 'never contacted'
                          : tr
                            ? `${quietFor} gündür sessiz`
                            : `${quietFor} days quiet`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
