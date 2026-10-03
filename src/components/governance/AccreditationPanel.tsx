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
import { Bilingual } from '../ui/Bilingual';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, FileCheck2, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAccreditation } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { ACCREDITATION_TONE, accreditationLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';
import { isSettled, splitBySettled } from '../../lib/registerStates';
import { SettledSection } from '../ui/SettledSection';
import type { AccreditationRequirement } from '../../types';

export const AccreditationPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const checklist = useAccreditation();

  const rows = checklist.data ?? [];
  const inScope = rows.filter((r) => r.state !== 'not_applicable');
  const met = inScope.filter((r) => r.state === 'met').length;
  const overdue = inScope.filter(
    (r) =>
      !isSettled('accreditation_state', r.state) &&
      r.targetOn != null &&
      new Date(r.targetOn) < new Date(),
  ).length;
  // Bu liste bir kuyruk: ekranın kendi işi eksik olanı göstermek (M10-06).
  // Karşılanmış ve kapsam dışı şartlar geri çekiliyor, sayıları başlıkta
  // kalıyor. Hüküm `lib/registerStates`'te, bir kez (CLAUDE.md §4).
  const { open: waiting, settled } = splitBySettled(rows, 'accreditation_state', (r) => r.state);

  /** Bir satır; iki yerde çiziliyor (bekleyen ve karşılanmış). */
  const row = (item: AccreditationRequirement) => {
    const late =
      !isSettled('accreditation_state', item.state) &&
      item.targetOn != null &&
      new Date(item.targetOn) < new Date();
    return (
      <li key={item.id} className="flex flex-wrap items-start gap-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.code && <span className="font-mono text-xs text-slate-500">{item.code}</span>}
            <span className="text-sm font-medium text-slate-900">
              <Bilingual
                table="accreditation_requirements"
                id={item.id}
                base="title"
                en={item.titleEn}
                tr={item.titleTr}
              />
            </span>
            <Pill className={ACCREDITATION_TONE[item.state]}>
              {accreditationLabel(item.state, language)}
            </Pill>
          </div>
          {/* "mevcut durum": what is true today, in words, which the
                    state machine above cannot carry. */}
          {(tr ? item.positionTr : item.positionEn) && (
            <p className="mt-0.5 text-xs text-slate-600">
              {tr ? item.positionTr : item.positionEn}
            </p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {item.responsibleName && <span>{item.responsibleName}</span>}
            {item.targetOn && (
              <span className={late ? 'font-semibold text-rose-700' : undefined}>
                {tr ? 'hedef ' : 'target '}
                {formatDate(item.targetOn, language)}
              </span>
            )}
            {item.metOn && (
              <span className="text-emerald-800">
                {tr ? 'karşılandı ' : 'met '}
                {formatDate(item.metOn, language)}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.evidenceDocumentId ? (
            <button
              type="button"
              onClick={() => navigate('/documents')}
              className="flex cursor-pointer items-center gap-1 text-xs text-indigo-700 hover:underline"
            >
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'kanıt' : 'evidence'}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-800">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'kanıt yok' : 'no evidence'}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'CUE akreditasyon kontrol listesi' : 'CUE accreditation checklist'}
            </h2>
            <p className="text-xs text-slate-500">
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
          {waiting.length > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${waiting.length} kaldı` : `${waiting.length} left`}
            </Pill>
          )}
          {overdue > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-900">
              {tr ? `${overdue} gecikmiş` : `${overdue} overdue`}
            </Pill>
          )}
        </div>
      </header>

      <QueryStatus queries={[checklist]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Kontrol listesi boş. CUE şartları girilmeden akreditasyon hazırlığının nerede olduğu söylenemez — bu ekranın hiçbir şey uydurmaması da bu yüzden.'
            : 'The checklist is empty. Until the CUE standards are entered, nothing can be said about where accreditation stands — which is why this screen says nothing instead.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">{waiting.map(row)}</ul>

          {/* Bekleyen kalmadıysa bunu söylemek gerekiyor: boş bir alan,
              karşılananların altında "hepsi tamam" ile "liste boş"u birbirine
              karıştırır. */}
          {waiting.length === 0 && settled.length > 0 && (
            <p className="text-xs text-slate-500">
              {tr
                ? 'Bekleyen şart yok; listedeki her şart karşılanmış ya da kapsam dışı.'
                : 'No requirement is waiting; every one on the list is met or out of scope.'}
            </p>
          )}

          <SettledSection
            rows={settled}
            label={{ tr: 'Karşılanan ve kapsam dışı', en: 'Met or out of scope' }}
          >
            {(shown) => <ul className="divide-y divide-slate-100">{shown.map(row)}</ul>}
          </SettledSection>
        </>
      )}
    </section>
  );
};
