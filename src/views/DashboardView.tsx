/**
 * The home screen, which is a different screen depending on who you are
 * (M12-01).
 *
 * The requirement's own reasoning is the design: a trustee asks "what do I
 * have to decide", the site asks "what am I doing today", a donor asks "where
 * did my money go", and one dashboard cannot answer all three. What the old
 * screen did instead was answer none of them at length, out of hand-written
 * copy — four agenda cards typed into the component, sitting directly above
 * an agenda panel that computes the same thing from the actual registers, and
 * a capital figure of 807.3M that no query produced.
 *
 * All of that is gone. Every number on this screen now comes from a query
 * (M12-03), the four states of a fetch are distinguished by QueryStatus
 * rather than collapsed into an empty list (M12-04), and the top of the page
 * says when what you are reading was last fetched (M12-05).
 *
 * The one panel every role gets is the agenda, because it is the only part of
 * the portal that asks somebody for something rather than describing a state.
 */
import React from 'react';
import { Compass } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAuthority } from '../api/adminHooks';
import { AgendaPanel } from '../components/meetings/AgendaPanel';
import { PendingDecisions } from '../components/dashboard/PendingDecisions';
import {
  AuditQueue,
  ComingUp,
  LegalNext,
  MoneyWhere,
  ProjectPulse,
  SiteToday,
} from '../components/dashboard/RolePanels';
import { DataFreshness } from '../components/DataFreshness';
import { FirstLook } from '../components/dashboard/FirstLook';
import { fetchCalendar } from '../api/calendar';
import { roleLabel } from '../lib/roles';
import type { UserRole } from '../types';

type PanelName = 'decisions' | 'pulse' | 'site' | 'legal' | 'money' | 'audit' | 'coming';

/**
 * Which panels each role opens on, and in what order.
 *
 * Order is the whole point. Everybody could be shown everything — the
 * policies already decide what comes back — but a home screen that puts the
 * same thing first for a trustee and for a bricklayer has not answered
 * either of their questions.
 */
const BY_ROLE: Record<string, PanelName[]> = {
  admin: ['decisions', 'pulse', 'coming', 'site', 'money'],
  // The board's question is what needs deciding, then whether the shape of
  // the project has changed.
  trustee: ['decisions', 'pulse', 'coming', 'money'],
  board_director: ['decisions', 'pulse', 'money', 'coming'],
  // Runs the thing day to day, so: what is asked of me, then everything.
  project_director: ['decisions', 'pulse', 'site', 'coming', 'money'],
  field_team: ['site', 'coming', 'pulse'],
  legal_counsel: ['legal', 'coming'],
  contractor: ['site', 'coming'],
  quantity_surveyor: ['site', 'money', 'coming'],
  // Money is the only question, and pledge against receipt is the honest
  // version of it.
  donor: ['money'],
  audit_committee: ['audit', 'money', 'pulse'],
  external_auditor: ['audit', 'money'],
  observer: ['coming'],
  consultant: ['coming'],
};

const PANELS: Record<PanelName, React.FC> = {
  decisions: () => <PendingDecisions limit={6} />,
  pulse: ProjectPulse,
  site: SiteToday,
  legal: LegalNext,
  money: MoneyWhere,
  audit: AuditQueue,
  coming: ComingUp,
};

/** A panel that spans the grid rather than sitting in a column. */
const WIDE: PanelName[] = ['decisions'];

export const DashboardView: React.FC = () => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const authority = useAuthority();

  // Freshness is measured on the one query every layout shares, so the
  // indicator means the same thing on every role's screen.
  const calendar = useQuery({ queryKey: ['projectCalendar'], queryFn: fetchCalendar });

  const roles = authority.data?.roles ?? [];
  // Delegation makes authority a union of roles, so the layout is the union
  // of their layouts — in the order of the highest one, with nothing
  // duplicated. Somebody acting under a borrowed trustee role should see the
  // trustee's screen without losing their own.
  const panels: PanelName[] = [];
  for (const role of Object.keys(BY_ROLE)) {
    if (!roles.includes(role as never)) continue;
    for (const panel of BY_ROLE[role] ?? []) {
      if (!panels.includes(panel)) panels.push(panel);
    }
  }
  if (panels.length === 0) panels.push('coming');

  const wide = panels.filter((p) => WIDE.includes(p));
  const narrow = panels.filter((p) => !WIDE.includes(p));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {user?.name
                ? tr
                  ? `Merhaba, ${user.name}`
                  : `Hello, ${user.name}`
                : tr
                  ? 'Gösterge paneli'
                  : 'Dashboard'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {/* Saying which role's screen this is, because under a
                  delegation it may not be the one they expect. */}
              {roles.length > 0
                ? tr
                  ? `${roles.map((r) => roleLabel(r as UserRole, language)).join(' + ')} ekranı. Buradaki her rakam veriden geliyor.`
                  : `The ${roles.map((r) => roleLabel(r as UserRole, language)).join(' + ')} screen. Every figure here comes from a query.`
                : tr
                  ? 'Buradaki her rakam veriden geliyor.'
                  : 'Every figure here comes from a query.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[calendar]} />
      </header>

      {/* Three figures before any prose, so the screen opens with the state
          of the project (T10-08). Measured, the first screenful on a phone
          carried two numbers, both at 12px. */}
      <FirstLook entries={calendar.data} />

      {/* Above everything else, for everybody: the only part of the portal
          that asks somebody for something instead of describing a state
          (M12-02). */}
      <AgendaPanel limit={6} compact />

      {wide.map((name) => {
        const Panel = PANELS[name];
        return <Panel key={name} />;
      })}

      {narrow.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {narrow.map((name) => {
            const Panel = PANELS[name];
            return <Panel key={name} />;
          })}
        </div>
      )}

      {/* The assistant is deliberately not here.
          It takes its context as a raw JSON blob with no notion of
          confidentiality, which is precisely what M13 exists to fix: an
          assistant that summarises restricted material for somebody without
          the clearance is the fastest route a leak has. Re-adding it to a
          screen being rewritten would be knowingly shipping the thing the
          next module is for. It returns when it can say where an answer came
          from and refuse what the reader may not see. */}
    </div>
  );
};
