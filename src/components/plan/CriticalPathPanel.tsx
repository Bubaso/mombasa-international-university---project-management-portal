import React from 'react';
import { GitBranch } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as plan from '../../api/planHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill, Section } from '../ui/Controls';
import { criticalPath, type Unused } from '../../lib/criticalPath';

/**
 * Kritik yol (M7-16).
 *
 * Hesap `lib/criticalPath.ts`'te ve orada sınanıyor; bu dosya onun cevabını
 * gösteriyor. Ekranın işi burada **neyin hesaba girmediğini söylemek**:
 * `dependencies` kütükler arası bir tablo ve bir bağımlılığın tarafı dava,
 * yükümlülük, risk ya da çıplak bir etiket olabiliyor. Bunların süresi yok,
 * yani yola girmiyorlar — ve girmeyeni sessizce atmak, eksik bir zinciri tam
 * bir zincir gibi göstermek olurdu (CLAUDE.md §2).
 *
 * "Kritik" kelimesi bu projede iki şey demek ve ikisini karıştırmıyorum.
 * `milestones.critical` ELLE konan bir bayrak — geri sayım şeridinde
 * görünsün mü (M15-04). Buradaki kritik yol HESAPLANAN bir şey: tarihlerden
 * ve bağımlılıklardan çıkan en uzun zincir. Panel bunu adıyla söylüyor.
 *
 * Bolluk (float) hesaplanmıyor ve sebebi dosyanın başındaki yorumda: bolluk
 * planın bağımlılıklarla tutarlı olmasını ister, buradaki tarihler elle
 * girilmiş. Onun yerine tutarsızlıklar bildiriliyor.
 */

const UNUSED_WORDS: Record<Unused['reason'], { tr: string; en: string }> = {
  task_without_dates: {
    tr: 'iş, iki tarihi kayıtlı olmadığı için',
    en: 'task, for want of both dates',
  },
  milestone_without_a_target: {
    tr: 'kilometre taşı, hedef tarihi olmadığı için',
    en: 'milestone, for want of a target date',
  },
  dependency_outside_the_network: {
    tr: 'bağımlılık, bir tarafı süreli bir faaliyet olmadığı için',
    en: 'dependency, because one side is not a timed activity',
  },
  dependency_to_itself: {
    tr: 'bağımlılık, kendine işaret ettiği için',
    en: 'dependency, because it points at itself',
  },
};

export const CriticalPathPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const network = plan.usePlanNetwork();
  const data = network.data;

  const result = data ? criticalPath(data.nodes, data.edges) : null;
  const titleOf = (id: string) => data?.nodes.find((n) => n.id === id)?.title ?? id;

  // Okumanın saydığı iki eksik, hesabın saydıklarıyla aynı listede. İkisi de
  // "hesaba girmedi" ve okuyan için tek bir soru.
  const unused: Unused[] = [
    ...(result?.unused ?? []),
    ...(data && data.tasksWithoutDates > 0
      ? [{ reason: 'task_without_dates' as const, count: data.tasksWithoutDates }]
      : []),
    ...(data && data.milestonesWithoutATarget > 0
      ? [{ reason: 'milestone_without_a_target' as const, count: data.milestonesWithoutATarget }]
      : []),
  ];

  return (
    <Section
      icon={GitBranch}
      title={tr ? 'Kritik yol' : 'The critical path'}
      subtitle={
        tr
          ? 'Tarihlerden ve bağımlılıklardan hesaplanan en uzun zincir: üstündeki bir gecikme projenin sonunu kaydırır.'
          : 'The longest chain the dates and dependencies make: a slip anywhere on it moves the end.'
      }
      whoMayUse={
        tr
          ? 'Hesap, kayıtlı tarihlerden çıkıyor; kimsenin girdiği bir sayı değil.'
          : 'The figure comes from the recorded dates; nobody typed it in.'
      }
      canUse
      waiting={result?.chain?.nodes.length}
    >
      <QueryStatus queries={[network]} />

      {network.isSuccess && result?.cycle && (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {tr
            ? `Bağımlılıklarda bir döngü var (${result.cycle.length} kayıt), yani kritik yol tanımsız — "zincir yok" değil, "hesaplanamaz": `
            : `There is a cycle in the dependencies (${result.cycle.length} records), so the critical path is undefined — not "no chain" but "cannot be computed": `}
          {result.cycle.map(titleOf).join(' · ')}
        </p>
      )}

      {network.isSuccess && !result?.cycle && !result?.chain && (
        <EmptyState
          icon={GitBranch}
          title={tr ? 'Hesaplanacak bir zincir yok' : 'There is no chain to compute'}
          description={
            tr
              ? 'İki tarihi de kayıtlı işler ve aralarındaki bağımlılıklar gerekiyor.'
              : 'It needs tasks with both dates and the dependencies between them.'
          }
        />
      )}

      {result?.chain && (
        <>
          <p className="mb-2 text-sm text-slate-700">
            {tr ? 'Zincir ' : 'The chain runs '}
            <span className="font-semibold text-slate-900">
              {result.chain.days} {tr ? 'gün' : 'days'}
            </span>
            {tr
              ? ` sürüyor ve ${result.chain.nodes.length} kayıttan geçiyor.`
              : ` and passes through ${result.chain.nodes.length} records.`}
          </p>
          <ol className="space-y-1">
            {result.chain.nodes.map((id, i) => {
              const node = data?.nodes.find((n) => n.id === id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="font-mono text-sm text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {node?.title ?? id}
                  </span>
                  {node?.kind === 'milestone' && (
                    <Pill className="border-slate-300 bg-slate-100 text-slate-700">
                      {tr ? 'kilometre taşı · 0 gün' : 'milestone · 0 days'}
                    </Pill>
                  )}
                  {node?.kind === 'task' && (
                    <span className="text-sm text-slate-500">
                      {node.days} {tr ? 'gün' : 'days'}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {result && result.conflicts.length > 0 && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {tr
            ? `${result.conflicts.length} bağımlılıkta plan kendisiyle çelişiyor: bağımlı iş, beklediği iş bitmeden başlıyor.`
            : `In ${result.conflicts.length} dependencies the plan contradicts itself: the dependent work starts before the work it waits on ends.`}
        </p>
      )}

      {unused.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-sm font-semibold text-slate-700">
            {tr ? 'Hesaba girmeyenler' : 'What the computation could not use'}
          </p>
          <ul className="mt-0.5 space-y-0.5 text-sm text-slate-600">
            {unused.map((u) => (
              <li key={u.reason}>
                <span className="font-semibold text-slate-900">{u.count}</span>{' '}
                {tr ? UNUSED_WORDS[u.reason].tr : UNUSED_WORDS[u.reason].en}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
};
