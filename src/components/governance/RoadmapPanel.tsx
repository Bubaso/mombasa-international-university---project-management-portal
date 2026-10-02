/**
 * The charter road map (M10-07).
 *
 * The requirement is explicit that the stages, their dependencies and their
 * target dates are data and not a paragraph, and the dependency is what makes
 * it a road map rather than a list of dates: a stage waiting on one that has
 * not finished is blocked, and saying so is more useful than saying "not
 * started".
 *
 * Blocked is computed in the view, never stored. A stored flag goes stale the
 * moment the stage before it finishes, and a road map that reads as blocked
 * when it is not is a road map people stop reading.
 */
import React from 'react';
import { Bilingual } from '../ui/Bilingual';
import { ArrowDown, Flag, Lock, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useRoadmap } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { STAGE_TONE, stageLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';

export const RoadmapPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const roadmap = useRoadmap();
  const rows = roadmap.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Flag className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {tr ? 'Berat yol haritası' : 'Charter road map'}
          </h2>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Aşamalar, bağımlılıkları ve hedef tarihleri. “Tıkandı” hesaplanıyor, saklanmıyor: öncesi bitince kendiliğinden açılıyor.'
              : 'The stages, their dependencies and their targets. “Blocked” is computed rather than stored, so it clears itself the moment the stage before it finishes.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[roadmap]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Yol haritası boş. Aşamalar girilene kadar beratın ne kadar yakın olduğu söylenemez.'
            : 'The road map is empty. Until the stages are entered, nothing can be said about how close the charter is.'}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((stage, i) => (
            <li key={stage.id}>
              {i > 0 && (
                <ArrowDown className="mx-auto mb-1 h-3 w-3 text-slate-500" aria-hidden="true" />
              )}
              <div
                className={`rounded-lg border p-3 ${
                  stage.blockedByPredecessor
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-500">{stage.sequence}</span>
                      <span className="text-sm font-medium text-slate-900">
                        <Bilingual
                          table="charter_stages"
                          id={stage.id}
                          base="title"
                          en={stage.titleEn}
                          tr={stage.titleTr}
                        />
                      </span>
                      <Pill className={STAGE_TONE[stage.state]}>
                        {stageLabel(stage.state, language)}
                      </Pill>
                      {stage.blockedByPredecessor && (
                        <Pill className="border-rose-300 bg-rose-100 text-rose-900">
                          <Lock className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {tr ? 'önceki bitmedi' : 'waiting on the one before'}
                        </Pill>
                      )}
                      {stage.overdue && (
                        <Pill className="border-rose-300 bg-rose-100 text-rose-900">
                          <TriangleAlert className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {tr ? 'hedef geçti' : 'past its target'}
                        </Pill>
                      )}
                    </div>
                    {(tr ? stage.detailTr : stage.detailEn) && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        {tr ? stage.detailTr : stage.detailEn}
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {stage.targetOn && (
                        <span>
                          {tr ? 'hedef ' : 'target '}
                          {formatDate(stage.targetOn, language)}
                        </span>
                      )}
                      {stage.completedOn && (
                        <span className="text-emerald-800">
                          {tr ? 'tamamlandı ' : 'completed '}
                          {formatDate(stage.completedOn, language)}
                        </span>
                      )}
                      {stage.responsibleName && <span>{stage.responsibleName}</span>}
                      {stage.dependsOnStageId && (
                        <span>
                          {tr ? 'önce: ' : 'after: '}
                          {(tr ? stage.dependsOnTitleTr : stage.dependsOnTitleEn) ??
                            stage.dependsOnTitleEn}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
