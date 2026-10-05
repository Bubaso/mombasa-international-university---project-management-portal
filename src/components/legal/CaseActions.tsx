import React from 'react';
import { ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCaseActions } from '../../api/meetingHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill } from '../ui/Controls';
import { isOverdue } from '../../lib/meetings';
import { isSettled, splitBySettled } from '../../lib/registerStates';
import { SettledSection } from '../ui/SettledSection';
import type { ActionItem } from '../../types';

/**
 * Bir davadan doğan aksiyonlar (0053).
 *
 * Bu listenin yerinde "Kenya Ziyareti Eylem Planı" adlı 91 satırlık, numaralı
 * bir strateji metni duruyordu. Her adımı aslında bir aksiyondu — ama
 * aksiyonun kütüğü sorumlu ile tarihi **zorunlu** tutuyor (M3-02) ve gömülü
 * plan ikisini de taşımıyordu. Yani ekranda takip ediliyormuş gibi duran bir
 * şey vardı, takip edeni olmadan; uydurulmuş bir tarih, tarihi olmayan bir
 * aksiyondan kötüdür.
 *
 * Buradan aksiyon eklenmiyor ve bu kasıtlı: bir aksiyon ya bir toplantıdan ya
 * bir karardan doğar ve sahibi orada atanır. İkinci bir ekleme yolu, aynı
 * kuralın ikinci bir kopyası olurdu (CLAUDE.md §4).
 */
export const CaseActions: React.FC<{ legalCaseId: string }> = ({ legalCaseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const actions = useCaseActions(legalCaseId);
  const rows = actions.data ?? [];

  // Bitmiş aksiyon kimseden iş istemiyor; hangi değerin son olduğu
  // `lib/registerStates`'te, bir kez.
  const { open, settled } = splitBySettled(rows, 'action_status', (a) => a.status);
  const late = open.filter((a) => isOverdue(a.dueDate) && !isSettled('action_status', a.status));

  const row = (action: ActionItem) => {
    const overdue = isOverdue(action.dueDate) && !isSettled('action_status', action.status);
    return (
      <article
        key={action.id}
        className={`rounded-lg border px-3 py-2 ${
          overdue ? 'border-rose-300 bg-rose-50/70' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 flex-1 text-sm text-slate-900">
            {(tr ? action.textTr || action.textEn : action.textEn) ?? ''}
          </span>
          <span className={`font-mono text-xs ${overdue ? 'text-rose-700' : 'text-slate-500'}`}>
            {action.dueDate}
          </span>
        </div>
        {action.name && <div className="text-xs text-slate-500">{action.name}</div>}
      </article>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ListChecks className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Bu dosyadan doğan aksiyonlar' : 'Actions from this file'}
          <Pill>{open.length}</Pill>
          {late.length > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-800">
              {tr ? `${late.length} süresi geçti` : `${late.length} past their date`}
            </Pill>
          )}
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[actions]} />
        {actions.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title={tr ? 'Bu dosyaya bağlı aksiyon yok' : 'No action is linked to this file'}
            description={
              tr
                ? 'Aksiyon bir toplantıda ya da bir kararda doğar ve sorumlusu orada atanır; dosyaya bağlananlar burada görünür.'
                : 'An action arises in a meeting or a decision, where its owner is set; those linked to this file appear here.'
            }
          />
        )}

        {open.map(row)}

        {open.length === 0 && settled.length > 0 && (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Bekleyen aksiyon yok; kayıtlı olanların hepsi bitti ya da iptal edildi.'
              : 'Nothing is waiting; every action linked here is done or cancelled.'}
          </p>
        )}

        <SettledSection rows={settled} label={{ tr: 'Sonuçlanan', en: 'Concluded' }}>
          {(shown) => <div className="space-y-2">{shown.map(row)}</div>}
        </SettledSection>
      </div>
    </section>
  );
};
