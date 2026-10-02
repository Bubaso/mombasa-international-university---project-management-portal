/**
 * Compliance and academic readiness (M10-05 … M10-10, M10-12).
 *
 * The requirement's reasoning for this screen is the sentence the portal had
 * no answer to: "Akademik hazırlık bugün portalda hiç yok. Oysa projenin
 * amacı bir üniversite; inşaat sadece aracı." Everything the project has
 * built so far is the means. This is the end — whether there will be a
 * university to put in the buildings, and by when.
 *
 * The board goes first, because it is the one view that puts the strands next
 * to each other, and then each strand's own register underneath it. Outreach
 * is missing from the board and that is deliberate: nothing records it, and a
 * bar drawn at zero would read as "nothing done" when the truth is "nothing
 * tracked".
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, GraduationCap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { ReadinessBoard } from '../components/governance/ReadinessBoard';
import { CompliancePanel } from '../components/governance/CompliancePanel';
import { AccreditationPanel } from '../components/governance/AccreditationPanel';
import { RoadmapPanel } from '../components/governance/RoadmapPanel';
import { ProgrammePanel } from '../components/governance/ProgrammePanel';
import { TargetPanel } from '../components/governance/TargetPanel';
import { DataFreshness } from '../components/DataFreshness';
import { fetchReadiness } from '../api/governance';

export const ReadinessView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const readiness = useQuery({ queryKey: ['readiness'], queryFn: fetchReadiness });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Uyum ve akademik hazırlık' : 'Compliance and academic readiness'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Projenin amacı bir üniversite; inşaat aracı. Burada o amacın nerede olduğu duruyor: mevzuat takvimi, CUE şartları, berat yol haritası, programlar ve kira sözleşmesinden doğan sayılı taahhütler.'
                : 'The point of the project is a university; the construction is the means. This is where the end stands: the statutory calendar, the CUE standards, the charter road map, the programmes, and the counted undertakings the lease imposes.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[readiness]} />
      </header>

      <ReadinessBoard />
      <CompliancePanel />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AccreditationPanel />
        <RoadmapPanel />
      </div>

      <ProgrammePanel />
      <TargetPanel />

      <Link
        to="/governance"
        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
      >
        <div>
          <p className="text-base font-semibold text-slate-900">
            {tr ? 'Yönetişim' : 'Governance'}
          </p>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Üç organ ve nisapları, mütevelli kütüğü, resmî karar kütüğü, çıkar beyanları.'
              : 'The three organs and their quorum, the trustee register, the formal resolutions, the declarations.'}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </Link>
    </div>
  );
};
