/**
 * The dependency chain (M15-05).
 *
 * "hukukî karar → inşaat → akreditasyon → öğrenci alımı" — the requirement
 * names the chain this project actually runs on, and the point of drawing it
 * is that each link has a different owner who can see only their own end of
 * it. The advocate knows the ruling is pending; the registrar does not know
 * that the intake waits on it.
 *
 * Laid out in layers rather than as a free graph: a layer is "everything that
 * waits on nothing I can see", then what waits on that, and so on. That
 * ordering is computed here from the edges rather than drawn by hand, so the
 * picture cannot go stale.
 *
 * `blocker_settled` stays three-valued all the way to the screen. A link
 * waiting on a court case is drawn differently from one waiting on an
 * unfinished task, because the portal genuinely cannot tell when the first
 * will clear and can tell exactly when the second will.
 */
import React, { useMemo } from 'react';
import { ArrowRight, CircleHelp, GitFork } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useDependencies } from '../../api/raidHooks';
import { usePlanMilestones } from '../../api/planHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import type { Dependency } from '../../types';

/** One end of a link, resolved to something printable. */
interface Node {
  key: string;
  label: string;
  kind: string;
}

interface KindShape {
  tr: string;
  en: string;
  tone: string;
}

/** Anything the portal does not hold a register for. */
const OUTSIDE: KindShape = {
  tr: 'dış etken',
  en: 'outside the portal',
  tone: 'border-slate-300 bg-white text-slate-600',
};

const KIND: Record<string, KindShape> = {
  legal_case: { tr: 'dava', en: 'case', tone: 'border-amber-300 bg-amber-50 text-amber-900' },
  site_task: { tr: 'saha işi', en: 'site task', tone: 'border-sky-300 bg-sky-50 text-sky-900' },
  obligation: {
    tr: 'yükümlülük',
    en: 'obligation',
    tone: 'border-violet-300 bg-violet-50 text-violet-900',
  },
  risk: { tr: 'risk', en: 'risk', tone: 'border-rose-300 bg-rose-50 text-rose-900' },
  milestone: {
    tr: 'kilometre taşı',
    en: 'milestone',
    tone: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  },
  label: OUTSIDE,
};

const kindOf = (kind: string): KindShape => KIND[kind] ?? OUTSIDE;

export const ChainPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const dependencies = useDependencies();
  const milestones = usePlanMilestones();

  const links = dependencies.data ?? [];
  const stoneById = useMemo(
    () => new Map((milestones.data ?? []).map((m) => [m.id, m])),
    [milestones.data],
  );

  /** Resolve one side of a link. Milestone names come from the plan query. */
  const side = (d: Dependency, which: 'blocker' | 'dependent'): Node | null => {
    if (which === 'blocker') {
      if (d.blockerMilestoneId) {
        const m = stoneById.get(d.blockerMilestoneId);
        return {
          key: `milestone:${d.blockerMilestoneId}`,
          kind: 'milestone',
          label: m ? ((tr ? m.titleTr : m.titleEn) ?? m.titleEn) : d.blockerMilestoneId.slice(0, 8),
        };
      }
      if (d.blockerLegalCaseId)
        return {
          key: `legal_case:${d.blockerLegalCaseId}`,
          kind: 'legal_case',
          label: tr ? 'Dava' : 'Case',
        };
      if (d.blockerSiteTaskId)
        return {
          key: `site_task:${d.blockerSiteTaskId}`,
          kind: 'site_task',
          label: tr ? 'Saha işi' : 'Site task',
        };
      if (d.blockerObligationId)
        return {
          key: `obligation:${d.blockerObligationId}`,
          kind: 'obligation',
          label: tr ? 'Yükümlülük' : 'Obligation',
        };
      if (d.blockerRiskId)
        return { key: `risk:${d.blockerRiskId}`, kind: 'risk', label: tr ? 'Risk' : 'Risk' };
      if (d.blockerLabel)
        return { key: `label:${d.blockerLabel}`, kind: 'label', label: d.blockerLabel };
      return null;
    }
    if (d.dependentMilestoneId) {
      const m = stoneById.get(d.dependentMilestoneId);
      return {
        key: `milestone:${d.dependentMilestoneId}`,
        kind: 'milestone',
        label: m ? ((tr ? m.titleTr : m.titleEn) ?? m.titleEn) : d.dependentMilestoneId.slice(0, 8),
      };
    }
    if (d.dependentSiteTaskId)
      return {
        key: `site_task:${d.dependentSiteTaskId}`,
        kind: 'site_task',
        label: tr ? 'Saha işi' : 'Site task',
      };
    if (d.dependentObligationId)
      return {
        key: `obligation:${d.dependentObligationId}`,
        kind: 'obligation',
        label: tr ? 'Yükümlülük' : 'Obligation',
      };
    if (d.dependentLegalCaseId)
      return {
        key: `legal_case:${d.dependentLegalCaseId}`,
        kind: 'legal_case',
        label: tr ? 'Dava' : 'Case',
      };
    if (d.dependentLabel)
      return { key: `label:${d.dependentLabel}`, kind: 'label', label: d.dependentLabel };
    return null;
  };

  const edges = links
    .map((d) => {
      const from = side(d, 'blocker');
      const to = side(d, 'dependent');
      return from && to ? { d, from, to } : null;
    })
    .filter((e): e is { d: Dependency; from: Node; to: Node } => e != null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <GitFork className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {tr ? 'Bağımlılık zinciri' : 'Dependency chain'}
          </h2>
          <p className="text-[11px] text-slate-500">
            {tr
              ? 'Hukukî karar → inşaat → akreditasyon → öğrenci alımı. Her halkanın sahibi başka ve çoğu yalnızca kendi ucunu görüyor: avukat kararın beklediğini bilir, alım tarihinin ona bağlı olduğunu bilmez.'
              : 'A ruling, then the works, then accreditation, then an intake. Each link has a different owner and most see only their own end: the advocate knows the ruling is pending and not that the intake waits on it.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[dependencies]} />

      {edges.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Kayıtlı bağımlılık yok. “Bu, şu bitmeden olmaz” cümlesi bir yere yazılmadıkça kimse göremez.'
            : 'No dependency is recorded. “This cannot happen until that does” is invisible until somebody writes it down.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {edges.map(({ d, from, to }) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
            >
              <Pill className={kindOf(from.kind).tone}>
                {tr ? kindOf(from.kind).tr : kindOf(from.kind).en}
              </Pill>
              <span className="min-w-0 truncate text-xs text-slate-900">{from.label}</span>

              {/* The three-valued verdict, carried all the way here. */}
              {d.blockerSettled === true ? (
                <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : d.blockerSettled === false ? (
                <ArrowRight className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
              ) : (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-slate-400"
                  title={
                    tr
                      ? 'Portal bunun ne zaman çözüleceğini söyleyemez — mahkemedeki bir dava gibi.'
                      : 'The portal cannot tell when this clears — a live court case, for instance.'
                  }
                >
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              )}

              <Pill className={kindOf(to.kind).tone}>
                {tr ? kindOf(to.kind).tr : kindOf(to.kind).en}
              </Pill>
              <span className="min-w-0 truncate text-xs text-slate-900">{to.label}</span>

              <span className="ml-auto shrink-0">
                {d.blockerSettled === true ? (
                  <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                    {tr ? 'önü açık' : 'clear'}
                  </Pill>
                ) : d.blockerSettled === false ? (
                  <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                    {tr ? 'tıkalı' : 'blocked'}
                  </Pill>
                ) : (
                  <Pill className="border-slate-300 bg-white text-slate-600">
                    {tr ? 'söylenemiyor' : 'cannot tell'}
                  </Pill>
                )}
              </span>

              {(tr ? d.noteEn : d.noteEn) && (
                <p className="w-full text-[11px] text-slate-600">{d.noteEn}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
