import React, { useState } from 'react';
import { FileText, Plus, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { todayIso } from '../../lib/date';
import { daysUntil, isOverdue } from '../../lib/meetings';
import { isSettled, splitBySettled } from '../../lib/registerStates';
import {
  FILING_KIND_VALUES,
  FILING_STATE_STYLES,
  FILING_STATE_VALUES,
  filingKindLabel,
  filingStateLabel,
} from '../../lib/legal';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { SettledSection } from '../ui/SettledSection';
import { EmptyState } from '../EmptyState';
import type { Filing, FilingKind, FilingState } from '../../types';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Filings (M5-04).
 *
 * Missing a procedural deadline is a live risk on this project rather than a
 * theoretical one, so the date a filing is due is kept apart from the date it
 * was made and the gap between them is the thing on screen.
 *
 * The table refuses "filed" without a date, which means this form asks for
 * one in the same breath rather than letting somebody record a deadline as
 * met with nothing behind it.
 */

/**
 * Süresi geçmiş olan.
 *
 * Ölçüm, 3 Ekim 2026: bu soru `['planned', 'drafting'].includes(state)` ile
 * soruluyordu ve `late` durumunu — yani süresinin kaçtığı **kaydedilmiş**
 * layihayı — saymıyordu. Başlıktaki "süresi geçti" rozeti, süresinin geçtiği
 * açıkça yazılmış olanı atlıyor, satırı da kırmızıya boyamıyordu.
 *
 * Soru artık durum listesine değil kaydedilmiş olguya bakıyor: sunum tarihi
 * yoksa evrak gitmemiştir (tablo `filed` durumunu tarihsiz kabul etmiyor), işi
 * bitmemişse hâlâ birinin işidir, ve `late` cevabın kendisi. Böylece enum
 * büyüdüğünde burada güncellenmesi gereken bir liste de kalmıyor.
 */
const isLate = (f: Filing) =>
  f.state === 'late' ||
  (f.filedOn === null && !isSettled('filing_state', f.state) && isOverdue(f.dueOn));

/** Evrak henüz gitmedi mi? Tarih farkını yazmak yalnız o zaman anlamlı. */
const notYetFiled = (f: Filing) => f.filedOn === null && !isSettled('filing_state', f.state);
export const FilingList: React.FC<{ caseId: string; canWrite: boolean }> = ({
  caseId,
  canWrite,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const filings = legal.useFilings(caseId);
  const update = legal.useUpdateFiling();
  const [adding, setAdding] = useState(false);

  const rows = filings.data ?? [];
  // Tebliğ edilmiş ya da geri çekilmiş layiha kimseden iş istemiyor; hangi
  // değerin son olduğu `lib/registerStates`'te, bir kez (CLAUDE.md §4).
  const { open: waiting, settled } = splitBySettled(rows, 'filing_state', (f) => f.state);
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.id));
  const late = waiting.filter(isLate).length;

  /** Bir satır; iki yerde çiziliyor (bekleyen ve sonuçlanmış). */
  const row = (filing: Filing) => {
    const overdue = isLate(filing);
    const days = daysUntil(filing.dueOn);
    return (
      <article
        key={filing.id}
        className={`rounded-lg border px-3 py-2 ${
          overdue ? 'border-rose-300 bg-rose-50/70' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {overdue && (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
              )}
              <span className="text-sm font-medium text-slate-900">{filing.title}</span>
              <Pill>{filingKindLabel(filing.kind, language)}</Pill>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              {filing.dueOn && (
                <span className={overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}>
                  {tr ? 'son tarih ' : 'due '}
                  <span className="font-mono">{filing.dueOn}</span>
                  {notYetFiled(filing) &&
                    days != null &&
                    (days < 0
                      ? tr
                        ? ` · ${Math.abs(days)} gün geçti`
                        : ` · ${Math.abs(days)} days ago`
                      : tr
                        ? ` · ${days} gün`
                        : ` · in ${days} days`)}
                </span>
              )}
              {filing.filedOn && (
                <span className="text-emerald-700">
                  {tr ? 'sunuldu ' : 'filed '}
                  <span className="font-mono">{filing.filedOn}</span>
                </span>
              )}
              {filing.filedByName && <span className="text-slate-500">{filing.filedByName}</span>}
            </div>
          </div>
          <Pill className={FILING_STATE_STYLES[filing.state]}>
            {filingStateLabel(filing.state, language)}
          </Pill>
        </div>

        <RecordOrigin origin={origins.of(filing.id)} />
        {canWrite && (
          <StateControl
            id={filing.id}
            state={filing.state}
            filedOn={filing.filedOn}
            onSubmit={(input) => update.mutate(input)}
            pending={update.isPending}
          />
        )}
      </article>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Layiha ve süreler' : 'Filings & deadlines'}
          <Pill>{waiting.length}</Pill>
          {late > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-800">
              {tr ? `${late} süresi geçti` : `${late} past their date`}
            </Pill>
          )}
        </h2>
        {canWrite && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Layiha ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && <NewFilingForm caseId={caseId} onDone={() => setAdding(false)} />}

        {rows.length === 0 && !adding ? (
          <EmptyState
            icon={FileText}
            title={tr ? 'Layiha kaydı yok' : 'Nothing recorded'}
            description={
              tr
                ? 'Sunulması gereken her evrakı son tarihiyle birlikte girin. Süre geçtiğinde takvimde ve burada kırmızı görünür.'
                : 'Record what has to be filed and by when. Anything past its date shows red here and on the calendar.'
            }
          />
        ) : (
          <>
            {waiting.map(row)}

            {/* Bekleyen kalmadıysa bunu söylemek gerekiyor: boş bir alan,
                sonuçlanmışların altında "hepsi bitti" ile "hiç yoktu"yu
                birbirine karıştırır. */}
            {waiting.length === 0 && settled.length > 0 && (
              <p className="text-xs text-slate-500">
                {tr
                  ? 'Bekleyen layiha yok; kayıtlı olanların hepsi tebliğ edilmiş ya da geri çekilmiş.'
                  : 'Nothing is waiting; every filing recorded here was served or withdrawn.'}
              </p>
            )}

            <SettledSection rows={settled} label={{ tr: 'Sonuçlanan', en: 'Concluded' }}>
              {(shown) => <div className="space-y-2">{shown.map(row)}</div>}
            </SettledSection>
          </>
        )}
        <WriteError error={update.error} />
      </div>
    </section>
  );
};

/**
 * Changing to filed or served asks for the date in the same step, because the
 * table will refuse the state without one — and rightly: a filing that says it
 * was made with no date is the kind of record that makes people believe a
 * deadline was met.
 */
const StateControl: React.FC<{
  id: string;
  state: FilingState;
  filedOn: string | null;
  onSubmit: (input: { id: string; state: FilingState; filedOn: string | null }) => void;
  pending: boolean;
}> = ({ id, state, filedOn, onSubmit, pending }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [next, setNext] = useState<FilingState>(state);
  const [date, setDate] = useState(filedOn ?? todayIso());

  const needsDate = next === 'filed' || next === 'served';
  const changed = next !== state || (needsDate && date !== filedOn);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <Field label={tr ? 'Durum' : 'State'}>
        <Select
          value={next}
          onChange={(e) => setNext(e.target.value as FilingState)}
          className="w-auto"
        >
          {FILING_STATE_VALUES.map((s) => (
            <option key={s} value={s}>
              {filingStateLabel(s, language)}
            </option>
          ))}
        </Select>
      </Field>
      {needsDate && (
        <Field label={tr ? 'Sunum tarihi' : 'Filed on'}>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
        </Field>
      )}
      <ActionButton
        disabled={pending || !changed}
        onClick={() => onSubmit({ id, state: next, filedOn: needsDate ? date : null })}
      >
        {tr ? 'Kaydet' : 'Save'}
      </ActionButton>
    </div>
  );
};

const NewFilingForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = legal.useCreateFiling();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<FilingKind>('pleading');
  const [dueOn, setDueOn] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        create.mutate(
          { legalCaseId: caseId, kind, title: title.trim(), dueOn: dueOn || null },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Ne sunulacak' : 'What has to be filed'} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Tür' : 'Kind'}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as FilingKind)}>
            {FILING_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {filingKindLabel(k, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Son tarih' : 'Due by'}>
          <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
      </div>

      <WriteError error={create.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Ekle' : 'Add'}
        </ActionButton>
      </div>
    </form>
  );
};
