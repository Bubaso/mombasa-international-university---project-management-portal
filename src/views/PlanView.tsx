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
 */
import React from 'react';
import { GanttChartSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GanttPanel } from '../components/plan/GanttPanel';
import { MilestonePanel } from '../components/plan/MilestonePanel';
import { PhasePanel } from '../components/plan/PhasePanel';
import { ChainPanel } from '../components/plan/ChainPanel';
import { BaselinePanel } from '../components/plan/BaselinePanel';
import { ChronologyPanel } from '../components/plan/ChronologyPanel';
import { DataFreshness } from '../components/DataFreshness';
import { usePlanMilestones } from '../api/planHooks';

export const PlanView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

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
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Planın omurgası, ama buradaki hiçbir şey elle işaretlenmiyor: bir taş kasaya belge düştüğünde başarılmış sayılır, bir faz bitiş tarihini geçmiş açık blokları varsa süresini aşmış sayılır. Plan kayıtları okur.'
                : 'The backbone of the plan, though nothing on it is ticked by hand: a milestone counts as achieved when its document reaches the vault, a phase as overrun when work is still open past its end date. The plan reads the registers.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[milestones]} />
      </header>

      {/* The overview, above the table that details it — and the table is
          also the relief the dataviz rules require for a chart whose fills sit
          under 3:1 against the surface. */}
      <GanttPanel />

      <MilestonePanel />
      <PhasePanel />
      <ChainPanel />
      <BaselinePanel />
      <ChronologyPanel />
    </div>
  );
};
