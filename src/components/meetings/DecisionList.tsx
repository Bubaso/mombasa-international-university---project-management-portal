import React, { useState } from 'react';
import { Gavel, Plus, UserMinus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as meetings from '../../api/meetingHooks';
import { todayIso } from '../../lib/date';
import {
  DECISION_STATUS_STYLES,
  DECISION_STATUS_VALUES,
  VOTE_OUTCOME_VALUES,
  bilingual,
  decisionStatusLabel,
  voteOutcomeLabel,
} from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import type { Confidentiality, DecisionStatus, VoteOutcome } from '../../types';

/**
 * Decisions, as records rather than as a paragraph in the minutes (M3-04).
 *
 * A decision has a state that outlives the meeting: it is in force until it
 * is implemented, rescinded or suspended, and somebody has to be able to ask
 * what is in force today without reading a year of notes.
 *
 * Dissent is shown because it is the part that gets left out and the part
 * that matters later. Recording a decision is narrower than minuting a
 * meeting — the field team may take the notes, but a board decision is the
 * board's.
 */
export const DecisionList: React.FC<{
  meetingId: string;
  canDecide: boolean;
  confidentiality: Confidentiality;
}> = ({ meetingId, canDecide, confidentiality }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const decisions = meetings.useDecisions(meetingId);
  const updateStatus = meetings.useUpdateDecisionStatus();
  const [adding, setAdding] = useState(false);

  const rows = decisions.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Gavel className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Kararlar' : 'Decisions'}
          <Pill>{rows.length}</Pill>
        </h2>
        {canDecide && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Karar ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && (
          <NewDecisionForm
            meetingId={meetingId}
            confidentiality={confidentiality}
            onDone={() => setAdding(false)}
          />
        )}

        {rows.length === 0 && !adding ? (
          <p className="text-[11px] text-slate-500">
            {tr ? 'Bu toplantıda karar alınmamış.' : 'No decision was taken here.'}
          </p>
        ) : (
          rows.map((decision) => (
            <article key={decision.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {decision.referenceNo && (
                    <span className="mr-1.5 font-mono text-[10px] text-slate-400">
                      {decision.referenceNo}
                    </span>
                  )}
                  <span className="text-xs text-slate-900">
                    {bilingual(decision.textEn, decision.textTr, language)}
                  </span>
                </div>
                <Pill className={DECISION_STATUS_STYLES[decision.status]}>
                  {decisionStatusLabel(decision.status, language)}
                </Pill>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {decision.organ && <span>{decision.organ}</span>}
                {decision.vote && <span>{voteOutcomeLabel(decision.vote, language)}</span>}
                <span className="font-mono">{decision.decidedOn}</span>
              </div>

              {bilingual(decision.rationaleEn, decision.rationaleTr, language) && (
                <p className="mt-1 text-[11px] italic leading-relaxed text-slate-600">
                  {bilingual(decision.rationaleEn, decision.rationaleTr, language)}
                </p>
              )}

              {decision.dissenters.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-rose-800">
                  <UserMinus className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{tr ? 'Karşı oy:' : 'Against:'}</span>
                  <span>{decision.dissenters.map((d) => d.name ?? '—').join(', ')}</span>
                </p>
              )}

              {canDecide && (
                <div className="mt-2">
                  <Field label={tr ? 'Durum' : 'Status'}>
                    <Select
                      value={decision.status}
                      disabled={updateStatus.isPending}
                      onChange={(e) =>
                        updateStatus.mutate({
                          id: decision.id,
                          status: e.target.value as DecisionStatus,
                        })
                      }
                      className="w-auto"
                    >
                      {DECISION_STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {decisionStatusLabel(s, language)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </article>
          ))
        )}
        <WriteError error={updateStatus.error} />
      </div>
    </section>
  );
};

const NewDecisionForm: React.FC<{
  meetingId: string;
  confidentiality: Confidentiality;
  onDone: () => void;
}> = ({ meetingId, confidentiality, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = meetings.useCreateDecision();

  const [text, setText] = useState('');
  const [rationale, setRationale] = useState('');
  const [reference, setReference] = useState('');
  const [organ, setOrgan] = useState('');
  const [vote, setVote] = useState<VoteOutcome | ''>('');
  const [decidedOn, setDecidedOn] = useState(todayIso);

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            meetingId,
            referenceNo: reference.trim() || null,
            textEn: language === 'en' ? text.trim() : null,
            textTr: language === 'tr' ? text.trim() : null,
            rationaleEn: rationale.trim() || null,
            organ: organ.trim() || null,
            vote: vote || null,
            decidedOn,
            status: 'in_force',
            confidentiality,
          },
          {
            onSuccess: () => {
              setText('');
              setRationale('');
              setReference('');
              onDone();
            },
          },
        );
      }}
    >
      <Field label={tr ? 'Karar' : 'The decision'}>
        <TextInput value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
      <Field label={tr ? 'Gerekçe' : 'Why'} className="mt-2.5">
        <TextInput value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </Field>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Field label={tr ? 'Karar no' : 'Reference'}>
          <TextInput
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="D-2026-01"
          />
        </Field>
        <Field label={tr ? 'Alan organ' : 'Taken by'}>
          <TextInput
            value={organ}
            onChange={(e) => setOrgan(e.target.value)}
            placeholder={tr ? 'Mütevelli Heyeti' : 'Board of Trustees'}
          />
        </Field>
        <Field label={tr ? 'Oylama' : 'Vote'}>
          <Select value={vote} onChange={(e) => setVote(e.target.value as VoteOutcome | '')}>
            <option value="">{tr ? 'Kaydedilmedi' : 'Not recorded'}</option>
            {VOTE_OUTCOME_VALUES.map((v) => (
              <option key={v} value={v}>
                {voteOutcomeLabel(v, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Tarih' : 'Date'}>
          <TextInput
            type="date"
            value={decidedOn}
            onChange={(e) => setDecidedOn(e.target.value)}
            required
          />
        </Field>
      </div>

      <WriteError error={create.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Kaydet' : 'Record'}
        </ActionButton>
      </div>
    </form>
  );
};
