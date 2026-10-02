/**
 * Phases, with what is actually in them (M15-02).
 *
 * The scope is prose, because a phase boundary is a judgement. The contents
 * are counted from the registers, because that is not. Putting the two next
 * to each other is the useful part: a phase whose scope says "blocks A1 and
 * B2" and whose count says one block is a phase somebody has stopped
 * maintaining.
 *
 * `overran` is computed in SQL from the end date and the outstanding work, so
 * a phase that ran past its date says so without anybody remembering to
 * change a status.
 */
import React from 'react';
import { Layers, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePhases } from '../../api/planHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate, money } from '../../lib/site';

export const PhasePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const phases = usePhases();
  const rows = phases.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">{tr ? 'Faz yapısı' : 'Phases'}</h2>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Kapsam yazıyla, içerik sayımla. Kapsamı “A1 ve B2 blokları” diyen ama tek blok sayan bir faz, artık güncellenmeyen bir fazdır.'
              : 'The scope in prose, the contents by count. A phase whose scope says “blocks A1 and B2” and whose count says one is a phase nobody is maintaining.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[phases]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Faz girilmemiş. Bloklar ve bütçe satırları faza bağlanabiliyor ama bağlanacak bir faz yok.'
            : 'No phase is recorded. Blocks and budget lines can belong to one, but there is none to belong to.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((phase) => {
            const blockShare =
              phase.blocks > 0 ? Math.round((100 * phase.blocksComplete) / phase.blocks) : null;
            return (
              <li
                key={phase.phaseId}
                className={`rounded-lg border p-3 ${
                  phase.overran ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-400">{phase.sequence}</span>
                      {phase.code && (
                        <span className="font-mono text-xs font-semibold text-indigo-800">
                          {phase.code}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900">
                        {(tr ? phase.nameTr : phase.nameEn) ?? phase.nameEn}
                      </span>
                      {phase.overran && (
                        <Pill className="border-rose-300 bg-rose-100 text-rose-900">
                          <TriangleAlert className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {tr ? 'süresini aştı' : 'overran'}
                        </Pill>
                      )}
                    </div>
                    {(tr ? phase.scopeTr : phase.scopeEn) ? (
                      <p className="mt-0.5 text-xs text-slate-700">
                        {tr ? phase.scopeTr : phase.scopeEn}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-amber-800">
                        {tr
                          ? 'Kapsam yazılmamış — bu fazın neyi kapsadığı kayıtlı değil.'
                          : 'No scope recorded — what this phase covers is not written down.'}
                      </p>
                    )}
                    {(tr ? phase.objectiveTr : phase.objectiveEn) && (
                      <p className="mt-0.5 text-xs text-slate-500 italic">
                        {tr ? phase.objectiveTr : phase.objectiveEn}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {phase.startsOn && phase.endsOn && (
                        <span className="font-mono">
                          {formatDate(phase.startsOn, language)} →{' '}
                          {formatDate(phase.endsOn, language)}
                        </span>
                      )}
                      {phase.nextTarget && (
                        <span>
                          {tr ? 'sıradaki hedef ' : 'next target '}
                          {formatDate(phase.nextTarget, language)}
                        </span>
                      )}
                      {phase.budgetKes != null && phase.budgetKes > 0 && (
                        <span className="font-mono">{money(phase.budgetKes, 'KES')}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 space-y-1 text-right">
                    <p className="text-xs text-slate-500">
                      {tr ? 'bloklar' : 'blocks'}{' '}
                      <span className="font-mono text-slate-800">
                        {phase.blocksComplete}/{phase.blocks}
                        {blockShare != null && ` · ${blockShare}%`}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {tr ? 'taşlar' : 'milestones'}{' '}
                      <span className="font-mono text-slate-800">
                        {phase.milestonesAchieved}/{phase.milestones}
                      </span>
                    </p>
                    {phase.milestonesMissed > 0 && (
                      <p className="text-xs font-semibold text-rose-700">
                        {tr
                          ? `${phase.milestonesMissed} kaçırıldı`
                          : `${phase.milestonesMissed} missed`}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
