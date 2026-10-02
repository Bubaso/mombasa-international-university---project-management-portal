import React, { useState } from 'react';
import { CircleAlert, Plus, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMachineMarks } from '../../api/translateHooks';
import { MachineBadge } from '../ui/MachineBadge';
import { useAuth } from '../../context/AuthContext';
import * as meetings from '../../api/meetingHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import {
  ACTION_STATUS_STYLES,
  ACTION_STATUS_VALUES,
  PRIORITY_STYLES,
  PRIORITY_VALUES,
  actionStatusLabel,
  bilingual,
  bilingualFrom,
  daysUntil,
  isOverdue,
  priorityLabel,
} from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { NO_PARTY, PartyPicker, type PartyValue } from './PartyPicker';
import type { ActionItem, ActionStatus, Confidentiality, PriorityLevel } from '../../types';

/**
 * Actions: exactly one owner and one date, both required by the table (M3-05).
 *
 * Shared ownership is how a task ends up belonging to nobody, and an action
 * with no date can never be late, so it is never chased. The owner may be
 * somebody outside the organisation — a minister who undertakes to make a
 * call is the ordinary case here, not an edge one.
 */
export const ActionList: React.FC<{
  meetingId: string;
  canKeep: boolean;
  confidentiality: Confidentiality;
}> = ({ meetingId, canKeep, confidentiality }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const actions = meetings.useActions(meetingId);
  const notes = meetings.useNotes(meetingId);
  const [adding, setAdding] = useState(false);

  const rows = actions.data ?? [];
  // One query for the screenful. The row component takes a boolean rather than
  // calling the hook itself, which would be one request per action.
  const marks = useMachineMarks(
    'action_items',
    rows.map((a) => a.id),
  );

  // Imported meetings carry their action text under the "actions" heading of
  // the note, because Notion holds no owner and no date as fields and the
  // importer will not invent either. A meeting with that text and no actions
  // is the state that needs a person, so it says so rather than looking done.
  const actionText = (notes.data ?? []).find((n) => n.section === 'actions');
  const needsTriage = rows.length === 0 && actionText != null && actionText.body.trim() !== '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Aksiyonlar' : 'Actions'}
          <Pill>{rows.filter((a) => a.status !== 'done' && a.status !== 'cancelled').length}</Pill>
        </h2>
        {canKeep && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Aksiyon ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && (
          <NewActionForm
            meetingId={meetingId}
            confidentiality={confidentiality}
            onDone={() => setAdding(false)}
          />
        )}

        {needsTriage && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-900">
              {tr
                ? 'Bu toplantının aksiyonları metin olarak duruyor'
                : 'This meeting’s actions are still only text'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
              {tr
                ? 'Tutanağın “Aksiyonlar” başlığında yazılılar, ama hiçbiri sorumlusu ve tarihi olan bir kayda dönüşmemiş — dolayısıyla hiçbiri gündeme düşmüyor ve hiçbiri gecikemiyor. Her biri için bir sorumlu ve bir tarih verin.'
                : 'They are written under the “Actions” heading, but none has become a record with an owner and a date — so none reaches the agenda and none can be late. Each needs one of each.'}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-amber-950">{actionText.body}</p>
          </div>
        )}

        {rows.length === 0 && !adding && !needsTriage ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Bu toplantıdan aksiyon çıkmamış. Çıkması gerekiyorsa şimdi eklemek, sonra hatırlamaktan kolaydır.'
              : 'Nothing came out of this meeting. If something should have, adding it now beats remembering later.'}
          </p>
        ) : (
          rows.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              canKeep={canKeep}
              machineWritten={marks.is(
                action.id,
                'text',
                bilingualFrom(action.textEn, action.textTr, language).side,
              )}
            />
          ))
        )}
      </div>
    </section>
  );
};

const ActionRow: React.FC<{
  action: ActionItem;
  canKeep: boolean;
  /** Whether the sentence shown is a machine's and nobody has approved it. */
  machineWritten: boolean;
}> = ({ action, canKeep, machineWritten }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const report = meetings.useReportOnAction();
  const reschedule = meetings.useRescheduleAction();
  const stakeholders = useStakeholders();

  const mine =
    action.profileId === user?.id ||
    (action.stakeholderId != null &&
      (stakeholders.data ?? []).some(
        (s) => s.id === action.stakeholderId && s.profileId === user?.id,
      ));
  const late =
    action.status !== 'done' && action.status !== 'cancelled' && isOverdue(action.dueDate);
  const days = daysUntil(action.dueDate);

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        late ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-900">
          {bilingual(action.textEn, action.textTr, language)}
          {machineWritten && <MachineBadge className="ml-1.5" />}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {action.priority !== 'normal' && (
            <Pill className={PRIORITY_STYLES[action.priority]}>
              {priorityLabel(action.priority, language)}
            </Pill>
          )}
          <Pill className={ACTION_STATUS_STYLES[action.status]}>
            {actionStatusLabel(action.status, language)}
          </Pill>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          {tr ? 'sorumlu: ' : 'owner: '}
          <span className="font-medium text-slate-700">
            {action.name ?? (tr ? 'bilinmiyor' : 'unknown')}
          </span>
          {mine && <span className="ml-1 text-amber-700">({tr ? 'siz' : 'you'})</span>}
        </span>
        <span className={late ? 'font-medium text-rose-700' : ''}>
          {tr ? 'tarih: ' : 'due: '}
          {action.dueDate}
          {action.status !== 'done' &&
            days != null &&
            (late
              ? tr
                ? ` · ${Math.abs(days)} gün gecikti`
                : ` · ${Math.abs(days)} days late`
              : tr
                ? ` · ${days} gün`
                : ` · in ${days} days`)}
        </span>
        {action.completedAt && (
          <span className="text-emerald-700">
            {tr ? 'kapandı: ' : 'closed: '}
            {action.completedAt.slice(0, 10)}
          </span>
        )}
      </div>

      {action.completionNote && (
        <p className="mt-1 text-xs italic text-slate-600">{action.completionNote}</p>
      )}

      {/* The owner reports; whoever keeps the record can also move the date.
          That split is enforced by a trigger, not by hiding a button. */}
      {(mine || canKeep) && action.status !== 'cancelled' && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label={tr ? 'Durum' : 'Status'}>
            <Select
              value={action.status}
              disabled={report.isPending}
              onChange={(e) =>
                report.mutate({
                  id: action.id,
                  status: e.target.value as ActionStatus,
                  completionNote: action.completionNote,
                })
              }
              className="w-auto"
            >
              {ACTION_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {actionStatusLabel(s, language)}
                </option>
              ))}
            </Select>
          </Field>
          {canKeep && (
            <Field label={tr ? 'Son tarih' : 'Due'}>
              <TextInput
                type="date"
                value={action.dueDate}
                disabled={reschedule.isPending}
                onChange={(e) => reschedule.mutate({ id: action.id, dueDate: e.target.value })}
                className="w-auto"
              />
            </Field>
          )}
          {mine && !canKeep && (
            <p className="pb-1.5 text-xs text-slate-500">
              {tr
                ? 'Tarihi ve tanımı yalnızca toplantıyı tutan değiştirebilir.'
                : 'Only whoever keeps the record can change the date or the wording.'}
            </p>
          )}
        </div>
      )}

      <WriteError error={report.error ?? reschedule.error} />
    </div>
  );
};

const NewActionForm: React.FC<{
  meetingId: string;
  confidentiality: Confidentiality;
  onDone: () => void;
}> = ({ meetingId, confidentiality, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = meetings.useCreateAction();

  const [text, setText] = useState('');
  const [owner, setOwner] = useState<PartyValue>(NO_PARTY);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('normal');

  const ready = text.trim() && dueDate && (owner.profileId || owner.stakeholderId);

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(
          {
            meetingId,
            decisionId: null,
            textEn: language === 'en' ? text.trim() : null,
            textTr: language === 'tr' ? text.trim() : null,
            dueDate,
            priority,
            ownerProfileId: owner.profileId,
            ownerStakeholderId: owner.stakeholderId,
            confidentiality,
          },
          {
            onSuccess: () => {
              setText('');
              setOwner(NO_PARTY);
              setDueDate('');
              onDone();
            },
          },
        );
      }}
    >
      <Field label={tr ? 'Ne yapılacak' : 'What has to happen'}>
        <TextInput value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Tek sorumlu' : 'The one owner'}>
          <PartyPicker value={owner} onChange={setOwner} required />
        </Field>
        <Field label={tr ? 'Son tarih' : 'Due by'}>
          <TextInput
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Öncelik' : 'Priority'}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as PriorityLevel)}>
            {PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p, language)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Sorumlu ve tarih zorunludur. Paylaşılan sorumluluk, işin kimseye ait olmamasının yoludur; tarihi olmayan bir iş de hiçbir zaman gecikmez, dolayısıyla hiç sorulmaz.'
          : 'Both are required. Shared ownership is how a task ends up belonging to nobody, and an action with no date can never be late, so it is never chased.'}
      </p>

      <WriteError error={create.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending || !ready}>
          <Check className="h-3 w-3" aria-hidden="true" />
          <span>{tr ? 'Ekle' : 'Add'}</span>
        </ActionButton>
      </div>
    </form>
  );
};
