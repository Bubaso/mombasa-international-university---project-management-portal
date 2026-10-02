/**
 * The RAID register (M6).
 *
 * This module has no predecessor to be a reaction to: the evaluation listed
 * risk management as missing outright, and what stood in for it was people
 * remembering. So the design question was not what to remove but what makes
 * a register get used rather than filled in once and abandoned.
 *
 * Three answers, all of them visible on this screen:
 *
 *   - the matrix opens it, because a table of risks sorted by score is a list
 *     and a five-by-five grid is a shape, and people argue with shapes;
 *   - every risk shows whether anybody has said what would tell them it is
 *     happening, since a risk with no trigger cannot be watched and is
 *     therefore not being managed;
 *   - assumptions sit beside risks rather than in an appendix, because the
 *     ones that matter here — the lease holding, the partner continuing —
 *     are load-bearing, and the database raises a risk by itself when one
 *     of them breaks.
 */
import React, { useState } from 'react';
import { Explain } from '../components/ui/Explain';
import {
  AlertTriangle,
  GitBranch,
  HelpCircle,
  Layers,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthority } from '../api/adminHooks';
import { RiskMatrix } from '../components/raid/RiskMatrix';
import { RiskList } from '../components/raid/RiskList';
import { IssueList } from '../components/raid/IssueList';
import { AssumptionList } from '../components/raid/AssumptionList';
import { DependencyList } from '../components/raid/DependencyList';
import { ScenarioList } from '../components/raid/ScenarioList';

type Tab = 'risks' | 'issues' | 'assumptions' | 'dependencies' | 'scenarios';

const acts = (roles: string[] | undefined, ...wanted: string[]) =>
  roles != null && wanted.some((role) => roles.includes(role));

export const RisksView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const authority = useAuthority();
  const [tab, setTab] = useState<Tab>('risks');

  const roles = authority.data?.roles;
  const canKeep = acts(
    roles,
    'admin',
    'project_director',
    'trustee',
    'board_director',
    'field_team',
  );
  const canAcknowledge = acts(roles, 'admin', 'trustee', 'board_director');

  const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
    { key: 'risks', icon: ShieldAlert, label: tr ? 'Riskler' : 'Risks' },
    { key: 'issues', icon: AlertTriangle, label: tr ? 'Sorunlar' : 'Issues' },
    { key: 'assumptions', icon: HelpCircle, label: tr ? 'Varsayımlar' : 'Assumptions' },
    { key: 'dependencies', icon: GitBranch, label: tr ? 'Bağımlılıklar' : 'Dependencies' },
    { key: 'scenarios', icon: Layers, label: tr ? 'Senaryolar' : 'Scenarios' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {tr ? 'Risk, Sorun, Varsayım, Bağımlılık' : 'Risk, Issue, Assumption, Dependency'}
          </h1>
          <Explain id="risks.overview">
            {tr
              ? 'Kafadaki risk, yönetilen risk değildir. Skor iki sayıdan hesaplanır, her hareketi kayda geçer, ve eşiği geçtiğinde bu bir olay olarak yazılır.'
              : 'A risk in somebody’s head is not a managed risk. The score is computed from two numbers, every movement is recorded, and crossing the line is written down as an event.'}
          </Explain>
        </div>
      </header>

      {/* The matrix is the thing people argue with, so it is not behind a tab:
          that would make it a report. On a desktop it keeps its place above
          the registers. On a phone it goes below them — measured, it put the
          first risk at 872px, just past an 844px screen, so the register a
          reader came for was never on the first screenful. Where there is
          room the matrix leads; where there is not, the records do. */}
      <div className="order-last md:order-none">
        <RiskMatrix />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'risks' && <RiskList canKeep={canKeep} canAcknowledge={canAcknowledge} />}
      {tab === 'issues' && <IssueList canKeep={canKeep} />}
      {tab === 'assumptions' && <AssumptionList canKeep={canKeep} />}
      {tab === 'dependencies' && <DependencyList canKeep={canKeep} />}
      {tab === 'scenarios' && <ScenarioList canKeep={canKeep} />}
    </div>
  );
};
