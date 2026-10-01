/**
 * The CUE accreditation checklist (M10-06).
 *
 * Requirement → position → evidence → owner → target date, which is what the
 * requirement asks for. The rule that makes it worth keeping is in the
 * database: nothing reaches "met" without a document in the vault behind it.
 * A checklist whose boxes can be ticked on somebody's word is a list of
 * hopes, and this project already has one of those.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, FileCheck2, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAccreditation } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { ACCREDITATION_TONE, accreditationLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';

export const AccreditationPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const checklist = useAccreditation();

  const rows = checklist.data ?? [];
  const inScope = rows.filter((r) => r.state !== 'not_applicable');
  const met = inScope.filter((r) => r.state === 'met').length;
  const overdue = inScope.filter(
    (r) => r.state !== 'met' && r.targetOn != null && new Date(r.targetOn) < new Date(),
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'CUE akreditasyon kontrol listesi' : 'CUE accreditation checklist'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {tr
                ? 'Hiçbir şart, arkasında kasada bir belge olmadan “karşılandı” olamıyor — bu kuralı veritabanı uyguluyor, ekran değil.'
                : 'No requirement reaches “met” without a document in the vault behind it — the database enforces that, not this screen.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>
            {met}/{inScope.length} {tr ? 'karşılandı' : 'met'}
          </Pill>
          {overdue > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-900">
              {tr ? `${overdue} gecikmiş` : `${overdue} overdue`}
            </Pill>
          )}
        </div>
      </header>

      <QueryStatus queries={[checklist]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Kontrol listesi boş. CUE şartları girilmeden akreditasyon hazırlığının nerede olduğu söylenemez — bu ekranın hiçbir şey uydurmaması da bu yüzden.'
            : 'The checklist is empty. Until the CUE standards are entered, nothing can be said about where accreditation stands — which is why this screen says nothing instead.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const late =
              row.state !== 'met' && row.targetOn != null && new Date(row.targetOn) < new Date();
            return (
              <li key={row.id} className="flex flex-wrap items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.code && (
                      <span className="font-mono text-[11px] text-slate-500">{row.code}</span>
                    )}
                    <span className="text-xs font-medium text-slate-900">
                      {(tr ? row.titleTr : row.titleEn) ?? row.titleEn}
                    </span>
                    <Pill className={ACCREDITATION_TONE[row.state]}>
                      {accreditationLabel(row.state, language)}
                    </Pill>
                  </div>
                  {/* "mevcut durum": what is true today, in words, which the
                      state machine above cannot carry. */}
                  {(tr ? row.positionTr : row.positionEn) && (
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {tr ? row.positionTr : row.positionEn}
                    </p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    {row.responsibleName && <span>{row.responsibleName}</span>}
                    {row.targetOn && (
                      <span className={late ? 'font-semibold text-rose-700' : undefined}>
                        {tr ? 'hedef ' : 'target '}
                        {formatDate(row.targetOn, language)}
                      </span>
                    )}
                    {row.metOn && (
                      <span className="text-emerald-800">
                        {tr ? 'karşılandı ' : 'met '}
                        {formatDate(row.metOn, language)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {row.evidenceDocumentId ? (
                    <button
                      type="button"
                      onClick={() => navigate('/documents')}
                      className="flex cursor-pointer items-center gap-1 text-[11px] text-indigo-700 hover:underline"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'kanıt' : 'evidence'}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-amber-800">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'kanıt yok' : 'no evidence'}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
