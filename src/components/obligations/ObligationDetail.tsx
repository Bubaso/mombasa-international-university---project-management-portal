import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { X, Plus, FileCheck2, FileX2, ShieldAlert, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import * as register from '../../api/obligationHooks';
import { todayIso } from '../../lib/date';
import { bilingual } from '../../lib/meetings';
import { clearanceLabel, clearanceStyle } from '../../lib/authority';
import {
  OBLIGATION_STATES,
  SOURCE_STYLES,
  STATE_STYLES,
  sourceLabel,
  stateLabel,
} from '../../lib/obligations';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import type { Obligation, ObligationState } from '../../types';

/**
 * One obligation, and the two things the database will not let the interface
 * lie about.
 *
 * `verified` is generated from whether a source document is attached, so it is
 * shown as a fact rather than offered as a control. And moving to `fulfilled`
 * is refused until evidence exists, so the control is offered and the refusal
 * shown verbatim — it says exactly what is missing, which is more use than a
 * disabled button.
 */
export const ObligationDetail: React.FC<{
  obligation: Obligation;
  canKeep: boolean;
  onClose: () => void;
}> = ({ obligation, canKeep, onClose }) => {
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';

  const evidence = register.useEvidence(obligation.id);
  const setState = register.useSetObligationState();

  const rows = evidence.data ?? [];

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">
            <Bilingual
              table="obligations"
              id={obligation.id}
              base="title"
              en={obligation.titleEn}
              tr={obligation.titleTr}
            />
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill className={SOURCE_STYLES[obligation.source]}>
              {sourceLabel(obligation.source, language)}
            </Pill>
            <Pill className={STATE_STYLES[obligation.state]}>
              {stateLabel(obligation.state, language)}
            </Pill>
            <Pill className={clearanceStyle(obligation.confidentiality)}>
              {clearanceLabel(obligation.confidentiality, language)}
            </Pill>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr ? 'Kapat' : 'Close'}
          className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 p-4">
        {bilingual(obligation.detailEn, obligation.detailTr, language) && (
          <p className="text-sm leading-relaxed text-slate-700">
            {bilingual(obligation.detailEn, obligation.detailTr, language)}
          </p>
        )}

        {obligation.prohibits && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-rose-900">
              {tr
                ? 'Bu bir yasak. Çakışan bir iş yapılacaksa portal engellemez — ama kimin, hangi gerekçeyle devam ettiğini kalıcı olarak kaydeder.'
                : 'This forbids something. The portal will not stop work that conflicts with it — but it records, permanently, who went ahead and why.'}
            </p>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <Row label={tr ? 'Yükümlü' : 'Owed by'} value={obligation.obligorName} />
          <Row label={tr ? 'Lehtar' : 'Owed to'} value={obligation.beneficiaryName} />
          <Row label={tr ? 'Son tarih' : 'Due by'} value={obligation.dueOn} />
        </dl>

        {/* --- verified is a fact, not a control ------------------------- */}
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
            obligation.verified
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          {obligation.verified ? (
            <FileCheck2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
          ) : (
            <FileX2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
          )}
          <p
            className={`text-sm leading-relaxed ${
              obligation.verified ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            {obligation.verified
              ? tr
                ? 'Kaynak belgesi bağlı — bu yüzden doğrulanmış sayılıyor.'
                : 'A source document is attached, which is what verified means here.'
              : tr
                ? 'Kaynak belgesi yok. Bu işaret bir kanaat değil, hesaplanmış bir gerçek: belge bağlandığında kendiliğinden düşer, elle kaldırılamaz.'
                : 'No source document. This mark is not an opinion but a computed fact: it clears itself when one is attached, and cannot be cleared by hand.'}
          </p>
        </div>

        {(obligation.sourceMeetingId || obligation.sourceLegalOrderId) && (
          <button
            type="button"
            onClick={() =>
              obligation.sourceMeetingId && navigate(`/meetings/${obligation.sourceMeetingId}`)
            }
            disabled={!obligation.sourceMeetingId}
            className={`flex items-center gap-1.5 text-xs font-medium ${
              obligation.sourceMeetingId
                ? 'cursor-pointer text-amber-700 hover:text-amber-900'
                : 'cursor-default text-slate-500'
            }`}
          >
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {obligation.sourceMeetingId
              ? tr
                ? 'Söz verildiği toplantıya git'
                : 'Go to the meeting it was promised in'
              : tr
                ? 'Bir mahkeme kararından doğdu'
                : 'Created by a court order'}
          </button>
        )}

        {/* --- evidence -------------------------------------------------- */}
        <section>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-700">
              {tr ? 'Uyum kanıtı' : 'Evidence'}
            </h3>
            <span className="text-xs text-slate-500">
              {rows.length === 0
                ? tr
                  ? 'kanıtsız kapatılamaz'
                  : 'cannot be closed without it'
                : `${rows.length}`}
            </span>
          </div>

          <EvidenceForm obligationId={obligation.id} />

          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {tr
                ? 'Henüz kanıt yok. Delilsiz "yapıldı", bir kayıt değil bir iddiadır.'
                : '"Done" without evidence is a claim, not a record.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {rows.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <p className="text-sm text-slate-800">{item.description}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[item.observedOn, item.addedByName].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- the state, and the refusal when it is wrong ---------------- */}
        {canKeep && (
          <div>
            <Field label={tr ? 'Durum' : 'State'}>
              <Select
                value={obligation.state}
                disabled={setState.isPending}
                onChange={(e) => {
                  setState.reset();
                  setState.mutate({
                    id: obligation.id,
                    state: e.target.value as ObligationState,
                  });
                }}
              >
                {OBLIGATION_STATES.map((s) => (
                  <option key={s} value={s}>
                    {stateLabel(s, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <WriteError error={setState.error} />
          </div>
        )}
      </div>
    </aside>
  );
};

const Row: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className="flex items-baseline gap-1.5">
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className="min-w-0 truncate font-medium text-slate-800">{value ?? '—'}</dd>
  </div>
);

/**
 * Open to whoever owes the obligation as well as to the team. Showing that you
 * did a thing is the part that matters to the person who did it, and it is
 * the only write an external obligor has here — declaring it done stays with
 * the project.
 */
const EvidenceForm: React.FC<{ obligationId: string }> = ({ obligationId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const add = register.useAddEvidence();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [observedOn, setObservedOn] = useState(todayIso);

  if (!open) {
    return (
      <ActionButton onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        <span>{tr ? 'Kanıt ekle' : 'Attach evidence'}</span>
      </ActionButton>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!description.trim()) return;
        add.mutate(
          { obligationId, description: description.trim(), observedOn: observedOn || null },
          {
            onSuccess: () => {
              setDescription('');
              setOpen(false);
            },
          },
        );
      }}
    >
      <Field label={tr ? 'Kanıt' : 'What shows it was done'}>
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            tr ? 'Fotoğraf, makbuz, mahkeme şerhi…' : 'A photograph, a receipt, a stamp…'
          }
          required
        />
      </Field>
      <Field label={tr ? 'Tarih' : 'When'}>
        <TextInput type="date" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} />
      </Field>
      <WriteError error={add.error} />
      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={() => setOpen(false)} disabled={add.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={add.isPending}>
          {tr ? 'Ekle' : 'Attach'}
        </ActionButton>
      </div>
    </form>
  );
};
