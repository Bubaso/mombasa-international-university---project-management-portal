/**
 * Open work that a live prohibition reaches (M7-06, M2-06).
 *
 * It warns; it does not stop anything. That is deliberate and it is the whole
 * design: the project did once resolve unanimously to keep building under an
 * order, and a portal that refused to record that would only have removed the
 * trace. What it will not do is let the work proceed *silently* — an
 * unacknowledged conflict sits at the top of the block in red until somebody
 * puts their name to a reason.
 */
import React, { useState } from 'react';
import { Gavel, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as site from '../../api/siteHooks';
import { ActionButton, Field, TextInput, WriteError } from '../ui/Controls';
import type { TaskConflict } from '../../types';

export const ConflictPanel: React.FC<{ blockId: string | null; canAcknowledge: boolean }> = ({
  blockId,
  canAcknowledge,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const conflicts = site.useConflicts(blockId);

  const rows = conflicts.data ?? [];
  if (rows.length === 0) return null;

  const unacknowledged = rows.filter((c) => !c.acknowledged);
  const acknowledged = rows.filter((c) => c.acknowledged);

  return (
    <div className="space-y-2">
      {unacknowledged.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold text-rose-900">
                {tr
                  ? `Bu blokta ${unacknowledged.length} açık iş, yürürlükteki bir yasağın kapsamında`
                  : `${unacknowledged.length} open task(s) on this block fall under a live prohibition`}
              </p>
              <p className="text-xs leading-relaxed text-rose-900/80">
                {tr
                  ? 'Portal işi durdurmaz. Ama devam ediliyorsa, bunu kimin hangi gerekçeyle üstlendiği kayda geçer — sonradan silinemez.'
                  : 'The portal does not stop the work. But if it proceeds, who decided that and on what grounds is recorded, and cannot be removed later.'}
              </p>
              <ul className="space-y-1.5">
                {unacknowledged.map((conflict) => (
                  <ConflictRow
                    key={`${conflict.siteTaskId}-${conflict.obligationId}`}
                    conflict={conflict}
                    canAcknowledge={canAcknowledge}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {acknowledged.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs text-amber-900">
            <Gavel className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tr
              ? `${acknowledged.length} iş, yasağa rağmen bilerek sürdürülüyor ve bu kayıtlı.`
              : `${acknowledged.length} task(s) proceed in spite of a prohibition, and that is on the record.`}
          </p>
        </div>
      )}
    </div>
  );
};

const ConflictRow: React.FC<{ conflict: TaskConflict; canAcknowledge: boolean }> = ({
  conflict,
  canAcknowledge,
}) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const acknowledge = site.useAcknowledgeConflict();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const taskTitle = tr ? (conflict.taskTitleTr ?? conflict.taskTitleEn) : conflict.taskTitleEn;
  const obligationTitle = tr
    ? (conflict.obligationTitleTr ?? conflict.obligationTitleEn)
    : conflict.obligationTitleEn;

  return (
    <li className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs">
      <div className="font-medium text-slate-900">{taskTitle}</div>
      <div className="text-rose-800">
        {tr ? 'Yasak: ' : 'Prohibited by: '}
        {obligationTitle}
      </div>

      {canAcknowledge && user && (
        <div className="mt-1.5">
          {open ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                acknowledge.mutate(
                  {
                    obligationId: conflict.obligationId,
                    siteTaskId: conflict.siteTaskId,
                    noteOfWhat: taskTitle,
                    reason,
                    profileId: user.id,
                  },
                  { onSuccess: () => setOpen(false) },
                );
              }}
              className="space-y-1.5"
            >
              <Field label={tr ? 'Gerekçe' : 'Reason'}>
                <TextInput
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    tr ? 'Hangi karar, hangi gerekçeyle?' : 'Which decision, and on what grounds?'
                  }
                />
              </Field>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="danger" disabled={acknowledge.isPending}>
                  {tr ? 'Kayda geçir ve devam et' : 'Record it and proceed'}
                </ActionButton>
                <ActionButton type="button" onClick={() => setOpen(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
              </div>
              <WriteError error={acknowledge.error} />
            </form>
          ) : (
            <ActionButton onClick={() => setOpen(true)}>
              {tr ? 'Gerekçeyi kaydet' : 'Record the reason'}
            </ActionButton>
          )}
        </div>
      )}
    </li>
  );
};
