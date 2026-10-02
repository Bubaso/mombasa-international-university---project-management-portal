import React, { useState } from 'react';
import { HelpCircle, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMachineMarks } from '../../api/translateHooks';
import { MachineBadge } from '../ui/MachineBadge';
import * as meetings from '../../api/meetingHooks';
import {
  QUESTION_STATUS_VALUES,
  bilingual,
  bilingualFrom,
  isOverdue,
  questionStatusLabel,
} from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { NO_PARTY, PartyPicker, type PartyValue } from './PartyPicker';
import type { Confidentiality, QuestionStatus } from '../../types';

const STATUS_STYLES: Record<QuestionStatus, string> = {
  open: 'border-amber-300 bg-amber-50 text-amber-800',
  answered: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  escalated: 'border-rose-300 bg-rose-50 text-rose-800',
  dropped: 'border-slate-300 bg-white text-slate-500',
};

/**
 * Open questions and disagreements (M3-09).
 *
 * Where the trustees disagree, or where nobody yet knows, the disagreement
 * itself is the record. Today those differences live in people's heads and in
 * the gaps between meeting notes — unresolved assessments among the trustees
 * are a live example — and they resurface months later as if new.
 *
 * A question here has an owner and a date by which it should have an answer,
 * so it cannot quietly stop being asked.
 */
export const QuestionList: React.FC<{
  meetingId: string;
  canKeep: boolean;
  confidentiality: Confidentiality;
}> = ({ meetingId, canKeep, confidentiality }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const questions = meetings.useQuestions(meetingId);
  const answer = meetings.useAnswerQuestion();
  const [adding, setAdding] = useState(false);

  const rows = questions.data ?? [];
  const marks = useMachineMarks(
    'open_questions',
    rows.map((q) => q.id),
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Açık sorular' : 'Open questions'}
          <Pill>{rows.filter((q) => q.status === 'open' || q.status === 'escalated').length}</Pill>
        </h2>
        {canKeep && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Soru ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && (
          <NewQuestionForm
            meetingId={meetingId}
            confidentiality={confidentiality}
            onDone={() => setAdding(false)}
          />
        )}

        {rows.length === 0 && !adding ? (
          <p className="text-xs leading-relaxed text-slate-500">
            {tr
              ? 'Cevapsız kalan bir konu yok. Bir görüş ayrılığı kapanmadan kaybolmasın diye burası var.'
              : 'Nothing is waiting for an answer. This is where a disagreement lives so it does not vanish unresolved.'}
          </p>
        ) : (
          rows.map((question) => {
            const late = question.status === 'open' && isOverdue(question.targetResolutionDate);
            return (
              <article
                key={question.id}
                className={`rounded-lg border px-3 py-2 ${
                  late ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-slate-900">
                    {bilingual(question.questionEn, question.questionTr, language)}
                    {marks.is(
                      question.id,
                      'question',
                      bilingualFrom(question.questionEn, question.questionTr, language).side,
                    ) && <MachineBadge className="ml-1.5" />}
                  </p>
                  <Pill className={STATUS_STYLES[question.status]}>
                    {questionStatusLabel(question.status, language)}
                  </Pill>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {question.name && (
                    <span>
                      {tr ? 'sorumlu: ' : 'owner: '}
                      <span className="font-medium text-slate-700">{question.name}</span>
                    </span>
                  )}
                  {question.targetResolutionDate && (
                    <span className={late ? 'font-medium text-rose-700' : ''}>
                      {tr ? 'hedef: ' : 'target: '}
                      {question.targetResolutionDate}
                    </span>
                  )}
                </div>

                {question.answerEn && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    <span className="font-medium">{tr ? 'Cevap: ' : 'Answer: '}</span>
                    {question.answerEn}
                  </p>
                )}

                {canKeep && (
                  <AnswerForm
                    id={question.id}
                    status={question.status}
                    existingAnswer={question.answerEn}
                    onSubmit={(input) => answer.mutate(input)}
                    pending={answer.isPending}
                  />
                )}
              </article>
            );
          })
        )}
        <WriteError error={answer.error} />
      </div>
    </section>
  );
};

const AnswerForm: React.FC<{
  id: string;
  status: QuestionStatus;
  existingAnswer: string | null;
  onSubmit: (input: { id: string; status: QuestionStatus; answerEn: string | null }) => void;
  pending: boolean;
}> = ({ id, status, existingAnswer, onSubmit, pending }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [draft, setDraft] = useState(existingAnswer ?? '');

  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ id, status: 'answered', answerEn: draft.trim() || null });
      }}
    >
      <Field label={tr ? 'Cevap' : 'Answer'} className="min-w-[160px] flex-1">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={tr ? 'Nasıl çözüldü?' : 'How was it resolved?'}
        />
      </Field>
      <Field label={tr ? 'Durum' : 'Status'}>
        <Select
          value={status}
          disabled={pending}
          onChange={(e) =>
            onSubmit({
              id,
              status: e.target.value as QuestionStatus,
              answerEn: draft.trim() || null,
            })
          }
          className="w-auto"
        >
          {QUESTION_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {questionStatusLabel(s, language)}
            </option>
          ))}
        </Select>
      </Field>
      <ActionButton type="submit" disabled={pending || !draft.trim()}>
        {tr ? 'Cevapla' : 'Answer'}
      </ActionButton>
    </form>
  );
};

const NewQuestionForm: React.FC<{
  meetingId: string;
  confidentiality: Confidentiality;
  onDone: () => void;
}> = ({ meetingId, confidentiality, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = meetings.useCreateQuestion();

  const [text, setText] = useState('');
  const [owner, setOwner] = useState<PartyValue>(NO_PARTY);
  const [target, setTarget] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            meetingId,
            questionEn: language === 'en' ? text.trim() : null,
            questionTr: language === 'tr' ? text.trim() : null,
            targetResolutionDate: target || null,
            ownerProfileId: owner.profileId,
            ownerStakeholderId: owner.stakeholderId,
            confidentiality,
          },
          {
            onSuccess: () => {
              setText('');
              setOwner(NO_PARTY);
              setTarget('');
              onDone();
            },
          },
        );
      }}
    >
      <Field label={tr ? 'Cevaplanmamış olan ne' : 'What is unanswered'}>
        <TextInput value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label={tr ? 'Kimin takip edeceği' : 'Who chases it'}>
          <PartyPicker
            value={owner}
            onChange={setOwner}
            emptyLabel={tr ? 'Henüz belli değil' : 'Not decided yet'}
          />
        </Field>
        <Field label={tr ? 'Hedef çözüm tarihi' : 'Wanted by'}>
          <TextInput type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
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
