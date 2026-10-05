import React, { useMemo, useState } from 'react';
import { UserCheck, Plus, FileSignature, MessageSquareQuote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import { todayIso } from '../../lib/date';
import { COUNSEL_STATE_VALUES, counselStateLabel } from '../../lib/legal';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { EmptyState } from '../EmptyState';
import type { CounselState } from '../../types';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

const STATE_STYLES: Record<CounselState, string> = {
  proposed: 'border-slate-300 bg-slate-100 text-slate-700',
  instructed: 'border-amber-300 bg-amber-50 text-amber-800',
  on_record: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  withdrawn: 'border-slate-300 bg-white text-slate-500',
};

/**
 * Who is acting, and what they have advised (M5-08, M5-10).
 *
 * Two things here that get lost otherwise. Whether the power of attorney has
 * actually been filed is tracked separately from whether somebody has been
 * instructed — being told to act and being able to act are not the same, and
 * the gap between them is where a deadline goes missing.
 *
 * And opinions are grouped by the question they answer, because four
 * candidate advisers were assessed in parallel here and their views are
 * scattered across meeting notes. Read side by side, they are a comparison;
 * read one at a time, they are just correspondence.
 */
export const CounselPanel: React.FC<{ caseId: string; canManage: boolean }> = ({
  caseId,
  canManage,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const counsel = legal.useCounsel(caseId);
  const opinions = legal.useOpinions(caseId);
  const update = legal.useUpdateCounsel();
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState(false);

  const rows = counsel.data ?? [];
  // Görüşlerin kökeni, tek okumada: asistanın hedefi görüşler, vekâletler
  // değil (M13-21).
  const origins = useRecordOrigins((opinions.data ?? []).map((o) => o.id));

  // Grouped by question, trimmed and lowercased so the same question asked
  // twice does not read as two.
  const byQuestion = useMemo(() => {
    const map = new Map<string, { question: string; rows: typeof opinions.data }>();
    for (const opinion of opinions.data ?? []) {
      const key = opinion.question.trim().toLowerCase();
      const existing = map.get(key) ?? { question: opinion.question, rows: [] };
      existing.rows = [...(existing.rows ?? []), opinion];
      map.set(key, existing);
    }
    return [...map.values()];
  }, [opinions.data]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <UserCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {tr ? 'Avukat portföyü' : 'Counsel'}
            <Pill>{rows.length}</Pill>
          </h2>
          {canManage && !adding && (
            <ActionButton onClick={() => setAdding(true)}>
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>{tr ? 'Avukat ata' : 'Add'}</span>
            </ActionButton>
          )}
        </header>

        <div className="space-y-2 p-4">
          {adding && <AssignForm caseId={caseId} onDone={() => setAdding(false)} />}

          {rows.length === 0 && !adding ? (
            <EmptyState
              icon={UserCheck}
              title={tr ? 'Bu dosyada avukat kaydı yok' : 'Nobody is on this file'}
              description={
                tr
                  ? 'Kim hangi dosyada, vekâletname sunuldu mu. Dış avukatın erişimi Erişim ve Yönetim’den verilir.'
                  : 'Who is on which file, and whether a power of attorney is filed. Grant an advocate access under Access & Administration.'
              }
            />
          ) : (
            rows.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-900">
                      {entry.counselName ?? entry.stakeholderId}
                    </span>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {entry.instructedOn && (
                        <span>
                          {tr ? 'vekâlet ' : 'instructed '}
                          <span className="font-mono">{entry.instructedOn}</span>
                        </span>
                      )}
                      {entry.feeModel && <span>{entry.feeModel}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill
                      className={
                        entry.powerOfAttorneyFiled
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-rose-300 bg-rose-50 text-rose-800'
                      }
                    >
                      <span className="flex items-center gap-1">
                        <FileSignature className="h-2.5 w-2.5" aria-hidden="true" />
                        {entry.powerOfAttorneyFiled
                          ? tr
                            ? 'vekâletname sunuldu'
                            : 'authority filed'
                          : tr
                            ? 'vekâletname yok'
                            : 'no authority on file'}
                      </span>
                    </Pill>
                    <Pill className={STATE_STYLES[entry.state]}>
                      {counselStateLabel(entry.state, language)}
                    </Pill>
                  </div>
                </div>

                {canManage && (
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <Field label={tr ? 'Durum' : 'State'}>
                      <Select
                        value={entry.state}
                        disabled={update.isPending}
                        onChange={(e) =>
                          update.mutate({ id: entry.id, state: e.target.value as CounselState })
                        }
                        className="w-auto"
                      >
                        {COUNSEL_STATE_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {counselStateLabel(s, language)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={entry.powerOfAttorneyFiled}
                        disabled={update.isPending}
                        onChange={(e) =>
                          update.mutate({ id: entry.id, powerOfAttorneyFiled: e.target.checked })
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-amber-600"
                      />
                      {tr ? 'Vekâletname dosyaya sunuldu' : 'Power of attorney is on the file'}
                    </label>
                  </div>
                )}
              </article>
            ))
          )}
          <WriteError error={update.error} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <MessageSquareQuote className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {tr ? 'Hukukî görüşler' : 'Opinions'}
            <Pill>{(opinions.data ?? []).length}</Pill>
          </h2>
          {canManage && !recording && (
            <ActionButton onClick={() => setRecording(true)}>
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>{tr ? 'Görüş kaydet' : 'Record one'}</span>
            </ActionButton>
          )}
        </header>

        <div className="space-y-3 p-4">
          {recording && <OpinionForm caseId={caseId} onDone={() => setRecording(false)} />}

          {byQuestion.length === 0 && !recording ? (
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Aynı soruya birden fazla avukattan alınan görüşler burada yan yana okunur. Tek tek okununca yazışma, yan yana okununca karşılaştırmadır.'
                : 'Opinions from different advisers on the same question are read side by side here. One at a time they are correspondence; together they are a comparison.'}
            </p>
          ) : (
            byQuestion.map((group) => (
              <article
                key={group.question}
                className="rounded-lg border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">{group.question}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {(group.rows ?? []).map((opinion) => (
                    <li key={opinion.id} className="border-l-2 border-slate-200 pl-2.5">
                      <p className="text-xs font-medium text-slate-700">
                        {opinion.givenByName ?? (tr ? 'kim olduğu kayıtlı değil' : 'unattributed')}
                        {opinion.givenOn && (
                          <span className="ml-1.5 font-mono text-xs text-slate-500">
                            {opinion.givenOn}
                          </span>
                        )}
                      </p>
                      {opinion.conclusion && (
                        <p className="text-xs leading-relaxed text-slate-600">
                          {opinion.conclusion}
                        </p>
                      )}
                      <RecordOrigin origin={origins.of(opinion.id)} />
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

const AssignForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const assign = legal.useAssignCounsel();
  const stakeholders = useStakeholders();
  const [stakeholderId, setStakeholderId] = useState('');
  const [state, setState] = useState<CounselState>('proposed');

  // The register is where advocates live; a name typed here would be a name
  // nobody could then assign a case to.
  const advocates = (stakeholders.data ?? []).filter((s) => s.category === 'legal');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!stakeholderId) return;
        assign.mutate({ legalCaseId: caseId, stakeholderId, state }, { onSuccess: onDone });
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label={tr ? 'Avukat' : 'Advocate'}>
          <Select value={stakeholderId} onChange={(e) => setStakeholderId(e.target.value)} required>
            <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
            {advocates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
                {s.organizationName ? ` — ${s.organizationName}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Durum' : 'State'}>
          <Select value={state} onChange={(e) => setState(e.target.value as CounselState)}>
            {COUNSEL_STATE_VALUES.map((s) => (
              <option key={s} value={s}>
                {counselStateLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {advocates.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {tr
            ? 'Paydaş kütüğünde "Hukuk" kategorisinde kimse yok. Avukatı önce kütüğe ekleyin.'
            : 'Nobody in the register is categorised as legal. Add the advocate there first.'}
        </p>
      )}

      <WriteError error={assign.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={assign.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={assign.isPending}>
          {tr ? 'Ata' : 'Assign'}
        </ActionButton>
      </div>
    </form>
  );
};

const OpinionForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const record = legal.useRecordOpinion();
  const stakeholders = useStakeholders();

  const [question, setQuestion] = useState('');
  const [givenBy, setGivenBy] = useState('');
  const [givenByName, setGivenByName] = useState('');
  const [givenOn, setGivenOn] = useState(todayIso);
  const [conclusion, setConclusion] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!question.trim()) return;
        record.mutate(
          {
            legalCaseId: caseId,
            question: question.trim(),
            givenByStakeholderId: givenBy || null,
            givenByName: givenBy ? null : givenByName.trim() || null,
            givenOn: givenOn || null,
            conclusion: conclusion.trim() || null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <Field label={tr ? 'Hangi soruya' : 'The question it answers'}>
        <TextInput value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </Field>
      <p className="mt-1 text-xs text-slate-500">
        {tr
          ? 'Aynı soruyu aynı sözlerle yazın: görüşler soruya göre gruplanıyor, farklı yazılan soru ayrı bir soru sayılır.'
          : 'Word the same question the same way: opinions are grouped by it, so a different wording reads as a different question.'}
      </p>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Kimden (kütükten)' : 'From (in the register)'}>
          <Select value={givenBy} onChange={(e) => setGivenBy(e.target.value)}>
            <option value="">{tr ? 'Kütükte değil' : 'Not in the register'}</option>
            {(stakeholders.data ?? [])
              .filter((s) => s.category === 'legal')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
          </Select>
        </Field>
        {!givenBy && (
          <Field label={tr ? 'Kimden (isim)' : 'From (name)'}>
            <TextInput value={givenByName} onChange={(e) => setGivenByName(e.target.value)} />
          </Field>
        )}
        <Field label={tr ? 'Tarih' : 'Given on'}>
          <TextInput type="date" value={givenOn} onChange={(e) => setGivenOn(e.target.value)} />
        </Field>
      </div>
      <Field label={tr ? 'Sonuç' : 'What they concluded'} className="mt-2.5">
        <TextInput value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
      </Field>

      <WriteError error={record.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={record.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={record.isPending}>
          {tr ? 'Kaydet' : 'Record'}
        </ActionButton>
      </div>
    </form>
  );
};
