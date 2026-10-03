/**
 * Construction and the site (M7).
 *
 * What this replaces is worth stating, because the design is a reaction to
 * it. The old screen was a list of blocks with a percentage on each; the
 * percentage was a number somebody typed into a dialog, and the bill of
 * quantities beside it lived in component state and was gone on reload. The
 * figure that told the trustees how far along the project was had exactly the
 * same standing as the figure that told them the weather.
 *
 * So the number on every block here comes from `block_progress`, which
 * averages the latest evidenced report on each task, and a block nobody has
 * reported on says *not reported* rather than 0%. There is no control on this
 * screen that sets a percentage, because there is no column to set.
 *
 * The other thing the old screen could not say: that a task is suspended by a
 * court rather than merely late, and that work continuing under an order is a
 * recorded decision rather than an oversight. Both are here, at the top,
 * before the progress.
 */
import React, { useMemo, useState } from 'react';
import { Building2, HardHat, Layers, Ruler } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthority } from '../api/adminHooks';
import * as site from '../api/siteHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { Pill } from '../components/ui/Controls';
import { clearanceLabel, clearanceStyle } from '../lib/authority';
import { formatDate, progressLabel, workStateLabel, workStateStyle } from '../lib/site';
import { ProgressPanel } from '../components/site/ProgressPanel';
import { ConflictPanel } from '../components/site/ConflictPanel';
import { WatchPanel } from '../components/site/WatchPanel';
import { InspectionList } from '../components/site/InspectionList';
import { CommercialPanel } from '../components/site/CommercialPanel';
import type { BlockProgress } from '../types';

type Tab = 'works' | 'inspections' | 'commercial';

const acts = (roles: string[] | undefined, ...wanted: string[]) =>
  roles != null && wanted.some((role) => roles.includes(role));

export const ConstructionView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const blocks = site.useBlocks();
  const progress = site.useBlockProgress();
  const authority = useAuthority();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('works');

  const roles = authority.data?.roles;
  // The site team and the firm on the block report; planning the work is
  // internal. Pricing is the surveyor's, approving is the director's — and
  // the database holds the same lines, so nothing here is the real gate.
  const canReport = acts(
    roles,
    'admin',
    'project_director',
    'field_team',
    'contractor',
    'quantity_surveyor',
  );
  const canPlan = acts(roles, 'admin', 'project_director', 'field_team');
  const canInspect = acts(
    roles,
    'admin',
    'project_director',
    'field_team',
    'quantity_surveyor',
    'external_auditor',
  );
  const canPrice = acts(roles, 'admin', 'project_director', 'quantity_surveyor');
  const canApprove = acts(roles, 'admin', 'project_director');

  const byBlock = useMemo(() => {
    const map = new Map<string, BlockProgress>();
    for (const row of progress.data ?? []) map.set(row.constructionBlockId, row);
    return map;
  }, [progress.data]);

  const rows = blocks.data ?? [];
  const selected = rows.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {tr ? 'İnşaat ve Saha' : 'Construction and Site'}
          </h1>
          <p className="max-w-2xl text-sm text-slate-500">
            {tr
              ? 'İlerleme, dayandığı kanıttan hesaplanır. Hiç rapor edilmemiş bir blok "raporlanmadı" der — sıfır demez, çünkü ikisi aynı şey değil.'
              : 'Progress is computed from the evidence behind it. A block nobody has reported on says "not reported" — not zero, because those are not the same thing.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[blocks, progress]} />

      {/* Before the blocks, not inside one. Work that a live order reaches is
          not a footnote to the progress, and finding out about it should not
          require having already guessed which block to open. Once a block is
          selected this narrows to that block. */}
      <ConflictPanel blockId={selectedId} canAcknowledge={canApprove} />

      {/* The watch book sits beside the works rather than inside a block: the
          gate and the perimeter belong to no block, and an incident is read
          by people who were never going to guess which block to open first
          (M7-18, M7-12, M6-11). */}
      <WatchPanel canKeep={canPlan} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={tr ? 'Blok yok' : 'No blocks'}
          description={
            tr
              ? 'Henüz blok tanımlanmamış, ya da bu blokları görme yetkiniz yok. Dış firmalar yalnızca kendilerine atanan blokları görür.'
              : 'No blocks are defined, or none are yours to see. An outside firm sees only the blocks it is assigned to.'
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((block) => {
              const stats = byBlock.get(block.id);
              const percent = stats?.percentComplete ?? null;
              return (
                <li key={block.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id === selectedId ? null : block.id)}
                    className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                      block.id === selectedId
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {block.code}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{block.name}</span>
                      <Pill className={workStateStyle(block.state)}>
                        {workStateLabel(block.state, language)}
                      </Pill>
                      {block.confidentiality !== 'internal' && (
                        <Pill className={clearanceStyle(block.confidentiality)}>
                          {clearanceLabel(block.confidentiality, language)}
                        </Pill>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{tr ? 'İlerleme' : 'Progress'}</span>
                      <span
                        className={`font-mono font-semibold ${
                          percent == null ? 'text-amber-700' : 'text-slate-800'
                        }`}
                      >
                        {progressLabel(percent, language)}
                      </span>
                    </div>
                    {/* No bar when there is no number. A bar at zero width
                        reads as "nothing done" rather than "nobody looked". */}
                    {percent != null && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {stats && (
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" aria-hidden="true" />
                          {tr
                            ? `${stats.tasksWithEvidence}/${stats.constructionTasks} görev kanıtlı`
                            : `${stats.tasksWithEvidence}/${stats.constructionTasks} tasks evidenced`}
                        </span>
                      )}
                      {stats != null && stats.preservationTasks > 0 && (
                        <span className="text-orange-700">
                          {tr
                            ? `${stats.preservationTasks} koruma işi`
                            : `${stats.preservationTasks} preservation`}
                        </span>
                      )}
                      {block.targetCompletion && (
                        <span>{formatDate(block.targetCompletion, language)}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selected.code} · {selected.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      selected.phaseName,
                      selected.contractorName,
                      selected.leadEngineerName,
                      selected.floors != null
                        ? tr
                          ? `${selected.floors} kat`
                          : `${selected.floors} floors`
                        : null,
                      selected.totalAreaSqm != null ? `${selected.totalAreaSqm} m²` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || (tr ? 'Ayrıntı girilmemiş' : 'No details recorded')}
                  </p>
                  {(selected.purposeEn ?? selected.purposeTr) && (
                    <p className="mt-1 max-w-2xl text-xs text-slate-600">
                      {tr ? (selected.purposeTr ?? selected.purposeEn) : selected.purposeEn}
                    </p>
                  )}
                </div>
                <div role="tablist" className="flex gap-1.5">
                  <TabButton
                    icon={HardHat}
                    label={tr ? 'İşler' : 'Works'}
                    active={tab === 'works'}
                    onClick={() => setTab('works')}
                  />
                  <TabButton
                    icon={Building2}
                    label={tr ? 'Denetim' : 'Inspection'}
                    active={tab === 'inspections'}
                    onClick={() => setTab('inspections')}
                  />
                  <TabButton
                    icon={Ruler}
                    label={tr ? 'Metraj ve hakediş' : 'Quantities and valuations'}
                    active={tab === 'commercial'}
                    onClick={() => setTab('commercial')}
                  />
                </div>
              </header>

              {tab === 'works' && (
                <ProgressPanel blockId={selected.id} canReport={canReport} canPlan={canPlan} />
              )}
              {tab === 'inspections' && (
                <InspectionList blockId={selected.id} canInspect={canInspect} />
              )}
              {tab === 'commercial' && (
                <CommercialPanel
                  blockId={selected.id}
                  canPrice={canPrice}
                  canApprove={canApprove}
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

const TabButton: React.FC<{
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`}
  >
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    <span>{label}</span>
  </button>
);
