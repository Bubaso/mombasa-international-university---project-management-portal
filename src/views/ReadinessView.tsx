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
 *
 * ---
 *
 * Sekmeler, 5 Ekim 2026 (T14-04). Altı panel alt alta duruyordu ve ekran
 * **3.561 piksel** boyundaydı. Pano SEKMEYE ALINMADI ve sebebi bu dosyanın
 * kendi cümlesi: şeritleri yan yana koyan tek görünüm o, yani ekranın özeti.
 * `RiskMatrix` ile aynı karar — özet görünür kalır, kütükler bir tık arkaya
 * geçer. Beş kütüğün beşi de duruyor, yeri değişti.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  Route,
  Target,
} from 'lucide-react';
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

type Tab = 'compliance' | 'accreditation' | 'roadmap' | 'programmes' | 'targets';

export const ReadinessView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = useState<Tab>('compliance');
  const readiness = useQuery({ queryKey: ['readiness'], queryFn: fetchReadiness });

  const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
    { key: 'compliance', icon: CalendarCheck, label: tr ? 'Mevzuat' : 'Compliance' },
    { key: 'accreditation', icon: BadgeCheck, label: tr ? 'CUE şartları' : 'CUE' },
    { key: 'roadmap', icon: Route, label: tr ? 'Berat yolu' : 'Charter' },
    { key: 'programmes', icon: BookOpen, label: tr ? 'Programlar' : 'Programmes' },
    { key: 'targets', icon: Target, label: tr ? 'Taahhütler' : 'Undertakings' },
  ];

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
                ? 'Mevzuat takvimi, CUE şartları, berat yolu ve programlar.'
                : 'Regulatory calendar, CUE requirements, charter, programmes.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[readiness]} />
      </header>

      {/* Pano sekmenin dışında: ekranın özeti o, ve bir özeti sekmeye koymak
          onu rapor hâline getirir (`RiskMatrix` ile aynı karar). */}
      <ReadinessBoard />

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon, label }) => (
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

      {tab === 'compliance' && <CompliancePanel />}
      {tab === 'accreditation' && <AccreditationPanel />}
      {tab === 'roadmap' && <RoadmapPanel />}
      {tab === 'programmes' && <ProgrammePanel />}
      {tab === 'targets' && <TargetPanel />}

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
