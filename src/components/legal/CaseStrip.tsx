import React from 'react';
import { Scale, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useObligations } from '../../api/obligationHooks';
import { clearanceStyle, clearanceLabel } from '../../lib/authority';
import { PRIORITY_STYLES, priorityLabel } from '../../lib/meetings';
import { Pill } from '../ui/Controls';
import type { LegalCase, PriorityLevel } from '../../types';

/**
 * The case selector (M5-01).
 *
 * The application showed one file, with its identifier written into the
 * source. There are at least five, new applications keep being filed, and the
 * orders on one of them bind work that another is silent about — so which
 * file you are looking at has to be a choice.
 */
export const CaseStrip: React.FC<{
  cases: (LegalCase & { riskLevel?: PriorityLevel })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ cases, selectedId, onSelect }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const obligations = useObligations();

  if (cases.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Scale className="h-3.5 w-3.5" aria-hidden="true" />
          {tr ? `Dosyalar (${cases.length})` : `Case files (${cases.length})`}
        </h2>
        {cases.length === 1 && (
          <span className="text-[10px] text-slate-400">
            {tr
              ? 'Tek dosya kayıtlı — diğerlerini eklemek portala bakan herkesin aynı tabloyu görmesini sağlar'
              : 'Only one file recorded — adding the others is what makes everyone see the same picture'}
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {cases.map((legalCase) => {
          const active = legalCase.id === selectedId;
          // Prohibitions traced to this file are the reason the selector shows
          // more than a name: which file you are on changes what is forbidden.
          const prohibitions = (obligations.data ?? []).filter(
            (o) => o.prohibits && ['open', 'in_progress', 'at_risk'].includes(o.state),
          ).length;

          return (
            <button
              key={legalCase.id}
              type="button"
              onClick={() => onSelect(legalCase.id)}
              className={`shrink-0 cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-amber-500 bg-amber-50 shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-mono text-[11px] font-bold ${
                    active ? 'text-amber-900' : 'text-slate-700'
                  }`}
                >
                  {legalCase.caseNumber}
                </span>
                {legalCase.riskLevel && legalCase.riskLevel !== 'normal' && (
                  <Pill className={PRIORITY_STYLES[legalCase.riskLevel]}>
                    {priorityLabel(legalCase.riskLevel, language)}
                  </Pill>
                )}
              </div>
              <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-700">
                {legalCase.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                <span>{legalCase.court}</span>
                {active && prohibitions > 0 && (
                  <span className="flex items-center gap-0.5 text-rose-600">
                    <TriangleAlert className="h-2.5 w-2.5" aria-hidden="true" />
                    {tr ? `${prohibitions} yasak` : `${prohibitions} prohibitions`}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Kept beside the strip so the confidentiality of a file is never implicit. */
export const CaseTier: React.FC<{ legalCase: LegalCase }> = ({ legalCase }) => {
  const { language } = useApp();
  const tier = (legalCase as LegalCase & { confidentiality?: 'internal' }).confidentiality;
  if (!tier) return null;
  return <Pill className={clearanceStyle(tier)}>{clearanceLabel(tier, language)}</Pill>;
};
