/**
 * What to look at next, and why (M13-12).
 *
 * Every "related items" box ever shipped has the same defect: it cannot be
 * dismissed. A ranked list under the heading "ilgili kayıtlar" is read as a
 * finding, and the reader has no way to tell the row that matters from the
 * one that shares the word "Mombasa" with everything else in the archive.
 *
 * So this component renders two lists and never one. A recorded link is a
 * fact somebody entered and says what the link is. A shared-term suggestion
 * is a guess, is labelled a guess, and carries the words it matched on — at
 * which point a reader can dismiss it in a second, which is the only thing
 * that makes the rest of the list worth reading.
 */
import React from 'react';
import { Link2, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useSimilarRecords } from '../../api/searchHooks';
import { bilingual } from '../../lib/meetings';
import type { SearchKind, SimilarRecord } from '../../types';

const KIND_WORDS: Record<string, { tr: string; en: string }> = {
  legal_case: { tr: 'dava', en: 'case' },
  legal_order: { tr: 'karar/emir', en: 'order' },
  legal_opinion: { tr: 'hukukî görüş', en: 'legal opinion' },
  hearing: { tr: 'duruşma', en: 'hearing' },
  filing: { tr: 'dosyalama', en: 'filing' },
  document: { tr: 'belge', en: 'document' },
  stakeholder: { tr: 'paydaş', en: 'stakeholder' },
  meeting: { tr: 'toplantı', en: 'meeting' },
  meeting_note: { tr: 'tutanak bölümü', en: 'minute section' },
  decision: { tr: 'karar', en: 'decision' },
  action_item: { tr: 'aksiyon', en: 'action' },
  open_question: { tr: 'açık soru', en: 'open question' },
  obligation: { tr: 'yükümlülük', en: 'obligation' },
  transaction: { tr: 'kasa kaydı', en: 'ledger entry' },
  risk: { tr: 'risk', en: 'risk' },
  issue: { tr: 'sorun', en: 'issue' },
  assumption: { tr: 'varsayım', en: 'assumption' },
  block: { tr: 'blok', en: 'block' },
  site_task: { tr: 'saha görevi', en: 'site task' },
};

const RELATION_WORDS: Record<string, { tr: string; en: string }> = {
  'this record hangs off it': { tr: 'bu kayıt buna bağlı', en: 'this record hangs off it' },
  'it hangs off this record': { tr: 'bu kayda bağlı', en: 'it hangs off this record' },
  'both hang off the same record': {
    tr: 'ikisi de aynı kayda bağlı',
    en: 'both hang off the same record',
  },
};

function kindWords(kind: string, tr: boolean): string {
  return tr ? (KIND_WORDS[kind]?.tr ?? kind) : (KIND_WORDS[kind]?.en ?? kind);
}

function Row({ row, tr }: { row: SimilarRecord; tr: boolean }): React.ReactElement {
  const title = bilingual(row.titleEn, row.titleTr, tr ? 'tr' : 'en');
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-xs">
      <span className="text-slate-900">{title || '—'}</span>
      <span className="text-slate-500">({kindWords(row.kind, tr)})</span>
      {row.basis === 'recorded_link' ? (
        <span className="text-slate-500">
          · {tr ? (RELATION_WORDS[row.relation]?.tr ?? row.relation) : row.relation}
        </span>
      ) : (
        <span className="text-slate-500">
          ·{' '}
          {tr
            ? `${row.termsInCommon} ortak terim: ${row.sharedTerms.join(', ')}`
            : `${row.termsInCommon} shared terms: ${row.sharedTerms.join(', ')}`}
        </span>
      )}
    </li>
  );
}

export const SimilarRecords: React.FC<{ kind: SearchKind; id: string }> = ({ kind, id }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const similar = useSimilarRecords(kind, id);

  const rows = similar.data ?? [];
  const linked = rows.filter((row) => row.basis === 'recorded_link');
  const guessed = rows.filter((row) => row.basis === 'shared_terms');

  if (similar.isPending) return <></>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-900">
        {tr ? 'Bundan sonra bakılacaklar' : 'What to look at next'}
      </h3>

      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {tr
            ? 'Kayıtlı bir bağ yok. İlgisiz olduğu anlamına gelmez — kontrol edilebilir bir bağ bulunamadı.'
            : 'No recorded link. That does not mean unrelated — it means no checkable link was found.'}
        </p>
      ) : (
        <div className="mt-1.5 space-y-2">
          {linked.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Link2 className="h-3 w-3 shrink-0 text-indigo-600" aria-hidden="true" />
                {tr ? 'Kayıtlı bağ' : 'Recorded link'}
              </p>
              <ul
                className="divide-y divide-slate-100"
                aria-label={tr ? 'Kayıtlı bağ' : 'Recorded link'}
              >
                {linked.map((row) => (
                  <Row key={`${row.kind}-${row.id}-${row.relation}`} row={row} tr={tr} />
                ))}
              </ul>
            </div>
          )}

          {guessed.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Sparkles className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                {tr ? 'Tahmin — paylaşılan terime dayanıyor' : 'A guess — based on shared terms'}
              </p>
              <p className="text-xs text-slate-500">
                {tr
                  ? 'Bunlar bir bulgu değil. Hangi terimlere dayandığı yazılı, böylece bir bakışta eleyebilirsiniz. Arşivin onda birinden fazlasında geçen terimler hiç sayılmaz.'
                  : 'These are not a finding. The terms each rests on are written out so you can dismiss it at a glance. A term in more than a tenth of the archive is not counted at all.'}
              </p>
              <ul
                className="divide-y divide-slate-100"
                aria-label={
                  tr ? 'Paylaşılan terime dayanan tahmin' : 'A guess based on shared terms'
                }
              >
                {guessed.map((row) => (
                  <Row key={`${row.kind}-${row.id}-terms`} row={row} tr={tr} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
