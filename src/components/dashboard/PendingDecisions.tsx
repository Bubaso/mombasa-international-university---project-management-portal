/**
 * What is waiting on a ruling (M12-10).
 *
 * The requirement calls it a decision support panel, and the reason it earns
 * a place above everything else is how decisions actually get delayed here.
 * Nobody refuses. The item simply never reaches the top of anybody's screen,
 * because it lives in the sixth register somebody would have to think to
 * open. So it is one list, sorted by how long it has been waiting, and each
 * row says which roles can settle it.
 *
 * `mine` marks the ones the person reading can settle themselves. Everything
 * else stays visible — knowing what the board is sitting on is part of
 * knowing where the project is — but it is not dressed up as their problem.
 */
import React from 'react';
import {
  ArrowUpRight,
  Bell,
  Gavel,
  HandCoins,
  HelpCircle,
  KeyRound,
  Receipt,
  ScaleIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { usePendingDecisions } from '../../api/decisionHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { roleLabel } from '../../lib/roles';
import { formatDate } from '../../lib/site';
import type { DecisionKind, PendingDecision, UserRole } from '../../types';

const SHAPE: Record<
  DecisionKind,
  { icon: React.ElementType; route: string; tr: string; en: string }
> = {
  risk_escalation: {
    icon: Bell,
    route: '/risks',
    tr: 'Eşiği aşan risk',
    en: 'Risk over the line',
  },
  payment_voucher: { icon: Receipt, route: '/finance', tr: 'Ödeme onayı', en: 'Payment approval' },
  valuation_approval: {
    icon: HandCoins,
    route: '/construction',
    tr: 'Hakediş onayı',
    en: 'Valuation approval',
  },
  open_question: {
    icon: HelpCircle,
    route: '/meetings',
    tr: 'Açık soru',
    en: 'Open question',
  },
  work_under_prohibition: {
    icon: Gavel,
    route: '/construction',
    tr: 'Yasak kapsamında iş',
    en: 'Work under a prohibition',
  },
  delegation_approval: {
    icon: KeyRound,
    route: '/admin',
    tr: 'Yetki devri onayı',
    en: 'Delegation approval',
  },
};

function waitedDays(since: string | null): number | null {
  if (!since) return null;
  return Math.floor((Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24));
}

export const PendingDecisions: React.FC<{ limit?: number }> = ({ limit }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const decisions = usePendingDecisions();
  const authority = useAuthority();
  const navigate = useNavigate();

  const roles = authority.data?.roles ?? [];
  const rows = decisions.data ?? [];
  const mine = (d: PendingDecision) => d.waitingOn.some((r) => roles.includes(r as never));

  // Theirs first, then by how long it has been sitting. Waiting time is the
  // only ordering that does not require the panel to have an opinion about
  // which register matters most.
  const sorted = [...rows].sort((a, b) => {
    if (mine(a) !== mine(b)) return mine(a) ? -1 : 1;
    const aw = waitedDays(a.waitingSince) ?? -1;
    const bw = waitedDays(b.waitingSince) ?? -1;
    return bw - aw;
  });

  const shown = limit ? sorted.slice(0, limit) : sorted;
  const forMe = rows.filter(mine).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <ScaleIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Karar bekleyenler' : 'Waiting on a decision'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Altı kütüğün tamamından. Kimse reddetmiyor — bunlar kimsenin ekranının üstüne çıkmadığı için bekliyor.'
                : 'From all six registers. Nobody refuses these; they wait because they never reach the top of anybody’s screen.'}
            </p>
          </div>
        </div>
        {forMe > 0 && (
          <Pill className="border-indigo-300 bg-indigo-100 text-indigo-900">
            {tr ? `${forMe} tanesi sizde` : `${forMe} are yours`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[decisions]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {tr
            ? 'Hiçbir şey karar beklemiyor. Bu, kütüklerin boş olması da olabilir — dolduktan sonra burası asıl işini yapar.'
            : 'Nothing is waiting on a ruling. That may also mean the registers are empty — this panel earns its place once they are not.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((decision) => {
            const shape = SHAPE[decision.kind];
            const Icon = shape.icon;
            const days = waitedDays(decision.waitingSince);
            const isMine = mine(decision);

            return (
              <li key={`${decision.kind}-${decision.id}`}>
                <button
                  type="button"
                  onClick={() => navigate(shape.route)}
                  className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        isMine ? 'text-indigo-600' : 'text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-900">
                          {tr ? (decision.titleTr ?? decision.titleEn) : decision.titleEn}
                        </span>
                        <Pill>{tr ? shape.tr : shape.en}</Pill>
                        {isMine && (
                          <Pill className="border-indigo-300 bg-indigo-100 text-indigo-900">
                            {tr ? 'sizde' : 'yours'}
                          </Pill>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-slate-500">
                        {decision.detail && <span className="truncate">{decision.detail}</span>}
                        {/* Whose it is, named. This is the column that turns a
                            list of worries into a list somebody answers for. */}
                        <span>
                          {tr ? 'karar: ' : 'settled by '}
                          {decision.waitingOn
                            .map((r) => roleLabel(r as UserRole, language))
                            .join(', ')}
                        </span>
                        {decision.dueOn && (
                          <span>
                            {tr ? 'hedef ' : 'target '}
                            {formatDate(decision.dueOn, language)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {days != null && (
                      <span
                        className={`font-mono text-xs ${
                          days >= 14 ? 'font-semibold text-rose-700' : 'text-slate-500'
                        }`}
                      >
                        {tr ? `${days} gün` : `${days}d`}
                      </span>
                    )}
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {limit != null && rows.length > limit && (
        <p className="mt-2 text-xs text-slate-500">
          {tr
            ? `${rows.length - limit} tanesi daha bekliyor.`
            : `${rows.length - limit} more are waiting.`}
        </p>
      )}
    </section>
  );
};
