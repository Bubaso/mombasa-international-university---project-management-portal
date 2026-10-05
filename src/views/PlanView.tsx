/**
 * The project plan (M15).
 *
 * The requirement calls this the backbone — "proje planı, zaman çizelgesi,
 * kilometre taşları" — and it is the last module because everything it draws
 * belongs to somebody else. A milestone is achieved when a document lands in
 * the vault, a phase overran when its blocks are still open past its end
 * date, a link in the chain clears when a court rules. None of that is typed
 * in here; the plan reads the registers.
 *
 * The order of the panels is the order the questions get asked in a trustee
 * meeting: where are we against the dates, what is in each phase, what is
 * waiting on what, what did we say six months ago, and how did we get here.
 *
 * ---
 *
 * Sekmeler, 5 Ekim 2026 (T14-04). Altı panel alt alta duruyordu ve ekran
 * **3.460 piksel** boyundaydı. Sekme sırası yukarıdaki soru sırasını AYNEN
 * koruyor — toplantıda sorulma sırası, ve o sıra bir tasarım kararıydı.
 *
 * Gantt sekmeye alınmadı: bu dosyanın kendi yorumu onu "the overview, above
 * the table that details it" diye tanımlıyor, yani ekranın özeti. Özet
 * görünür kalır (`RiskMatrix`, `ReadinessBoard` ile aynı karar).
 */
import React, { useState } from 'react';
import { Explain } from '../components/ui/Explain';
import { Flag, GanttChartSquare, GitBranch, History, Layers, Ruler } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GanttPanel } from '../components/plan/GanttPanel';
import { MilestonePanel } from '../components/plan/MilestonePanel';
import { PhasePanel } from '../components/plan/PhasePanel';
import { ChainPanel } from '../components/plan/ChainPanel';
import { BaselinePanel } from '../components/plan/BaselinePanel';
import { ChronologyPanel } from '../components/plan/ChronologyPanel';
import { DataFreshness } from '../components/DataFreshness';
import { usePlanMilestones } from '../api/planHooks';

type Tab = 'milestones' | 'phases' | 'chain' | 'baseline' | 'chronology';

export const PlanView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = useState<Tab>('milestones');

  // Freshness is measured on the milestones, because they are the part of
  // this screen whose staleness actually misleads somebody.
  const milestones = usePlanMilestones();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <GanttChartSquare
            className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600"
            aria-hidden="true"
          />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Proje planı ve kilometre taşları' : 'Project plan and milestones'}
            </h1>
            <Explain id="plan.overview">
              {tr
                ? 'Kilometre taşları elle işaretlenmez, hesaplanır.'
                : 'Milestones are not ticked by hand, but computed.'}
            </Explain>
          </div>
        </div>
        <DataFreshness queries={[milestones]} />
      </header>

      {/* The overview, above the table that details it — and the table is
          also the relief the dataviz rules require for a chart whose fills sit
          under 3:1 against the surface. */}
      <GanttPanel />

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'milestones', icon: Flag, label: tr ? 'Kilometre taşları' : 'Milestones' },
            { key: 'phases', icon: Layers, label: tr ? 'Fazlar' : 'Phases' },
            { key: 'chain', icon: GitBranch, label: tr ? 'Zincir' : 'Chain' },
            { key: 'baseline', icon: Ruler, label: tr ? 'Taban plan' : 'Baseline' },
            { key: 'chronology', icon: History, label: tr ? 'Kronoloji' : 'Chronology' },
          ] as { key: Tab; icon: React.ElementType; label: string }[]
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'milestones' && <MilestonePanel />}
      {tab === 'phases' && <PhasePanel />}
      {tab === 'chain' && <ChainPanel />}
      {tab === 'baseline' && <BaselinePanel />}
      {tab === 'chronology' && <ChronologyPanel />}
    </div>
  );
};
