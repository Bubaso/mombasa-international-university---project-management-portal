import React from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill } from '../ui/Controls';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * İçtihat ve mevzuat kütüphanesi (M5-13).
 *
 * Gereksinim dört şey istiyor ve dördü de burada: atıf, kullanım amacı,
 * lehimize/aleyhimize, ilke özeti.
 *
 * Aleyhe olan içtihat ayrı bir rozetle ve kasıtlı olarak aynı listede:
 * yalnızca lehe olanları tutan bir kütüphane, duruşmada karşı tarafın
 * çıkardığı kararı ilk kez orada gösterir. Hazırlık, aleyhe olanı önce
 * görmektir.
 */
export const AuthorityLibrary: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const authorities = legal.useLegalAuthorities(caseId);
  const rows = authorities.data ?? [];
  const origins = useRecordOrigins(rows.map((r) => r.id));
  const against = rows.filter((r) => r.favours === 'theirs').length;

  const text = (en: string | null, trText: string | null) => (tr ? trText || en : en) ?? '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <BookOpen className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'İçtihat ve kararlar' : 'Authorities'}
          <Pill>{rows.length}</Pill>
          {against > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-800">
              {tr ? `${against} aleyhe` : `${against} against us`}
            </Pill>
          )}
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[authorities]} />
        {authorities.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={tr ? 'İçtihat kaydı yok' : 'No authority recorded'}
            description={
              tr
                ? 'Atıf, dayandığı ilke ve lehimize mi aleyhimize mi olduğu birlikte girilir.'
                : 'Record the citation, the principle it establishes, and whether it runs for or against us.'
            }
          />
        )}

        {rows.map((authority) => (
          <article
            key={authority.id}
            className={`rounded-lg border px-3 py-2 ${
              authority.favours === 'theirs' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-sm font-medium text-slate-900">
                  {authority.citation}
                </span>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {text(authority.principleEn, authority.principleTr)}
                </p>
                {text(authority.useNoteEn, authority.useNoteTr) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {tr ? 'kullanımı: ' : 'used for: '}
                    {text(authority.useNoteEn, authority.useNoteTr)}
                  </p>
                )}
              </div>
              <Pill
                className={
                  authority.favours === 'ours'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-rose-300 bg-rose-50 text-rose-800'
                }
              >
                {authority.favours === 'ours'
                  ? tr
                    ? 'lehimize'
                    : 'for us'
                  : tr
                    ? 'aleyhimize'
                    : 'against us'}
              </Pill>
            </div>
            <RecordOrigin origin={origins.of(authority.id)} />
          </article>
        ))}
      </div>
    </section>
  );
};
