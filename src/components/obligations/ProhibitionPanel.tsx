import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { ShieldAlert, ChevronDown, ChevronUp, Pen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as register from '../../api/obligationHooks';
import { useConstructionBlocks } from '../../api/hooks';
import { ActionButton, Field, Select, TextInput, WriteError } from '../ui/Controls';
import type { Obligation } from '../../types';

/**
 * What is currently forbidden, and what was done anyway (M2-06).
 *
 * The requirement is explicit that the system warns and asks, and does not
 * block — and that is right. This project decided, unanimously, to keep
 * building while an order was in force. A portal that refused to record that
 * would not have stopped it; it would only have meant the decision left no
 * trace, which is the worse outcome by a distance.
 *
 * So the record is the feature. It cannot be edited or deleted by anyone, and
 * it carries the name of whoever took the decision.
 */
export const ProhibitionPanel: React.FC<{ canRecord: boolean }> = ({ canRecord }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const obligations = register.useObligations();
  const overrides = register.useOverrides();
  const [expanded, setExpanded] = useState(false);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);

  const live = (obligations.data ?? []).filter(
    (o) => o.prohibits && ['open', 'in_progress', 'at_risk'].includes(o.state),
  );
  const recorded = overrides.data ?? [];

  if (live.length === 0 && recorded.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-300 bg-rose-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
          <div className="min-w-0 text-sm text-rose-900">
            <span className="font-semibold">
              {tr ? `${live.length} yürürlükte yasak` : `${live.length} live prohibitions`}
            </span>
            {recorded.length > 0 && (
              <span className="ml-2 text-rose-900/70">
                {tr
                  ? `${recorded.length} kayıtlı devam kararı`
                  : `${recorded.length} recorded decisions to proceed anyway`}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-rose-200 px-4 py-3">
          <p className="text-sm leading-relaxed text-rose-900/80">
            {tr
              ? 'Portal çakışan bir işi engellemez. Bilinçli olarak devam edilecekse, kararı ve gerekçesini buraya yazın — bu kayıt sonradan düzeltilemez ve silinemez.'
              : 'The portal does not block work that conflicts with these. If the decision is to proceed anyway, record it and why — the entry cannot be edited or deleted afterwards.'}
          </p>

          <ul className="space-y-2">
            {live.map((o) => (
              <li key={o.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                    <Bilingual
                      table="obligations"
                      id={o.id}
                      base="title"
                      en={o.titleEn}
                      tr={o.titleTr}
                    />
                  </p>
                  {canRecord && recordingFor !== o.id && (
                    <ActionButton tone="danger" onClick={() => setRecordingFor(o.id)}>
                      <Pen className="h-3 w-3" aria-hidden="true" />
                      <span>{tr ? 'Yine de devam et' : 'Proceed anyway'}</span>
                    </ActionButton>
                  )}
                </div>

                {recordingFor === o.id && (
                  <OverrideForm obligation={o} onDone={() => setRecordingFor(null)} />
                )}

                {recorded
                  .filter((r) => r.obligationId === o.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <p className="text-sm font-medium text-slate-800">{r.noteOfWhat}</p>
                      <p className="text-sm leading-relaxed text-slate-600">{r.reason}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {r.acknowledgedByName ?? '—'} · {r.acknowledgedAt.slice(0, 10)}
                      </p>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const OverrideForm: React.FC<{ obligation: Obligation; onDone: () => void }> = ({
  obligation,
  onDone,
}) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const record = register.useRecordOverride();
  const blocks = useConstructionBlocks();

  const [noteOfWhat, setNoteOfWhat] = useState('');
  const [reason, setReason] = useState('');
  const [blockId, setBlockId] = useState('');

  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!user || !noteOfWhat.trim() || !reason.trim()) return;
        record.mutate(
          {
            obligationId: obligation.id,
            noteOfWhat: noteOfWhat.trim(),
            reason: reason.trim(),
            acknowledgedBy: user.id,
            constructionBlockId: blockId || null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <Field label={tr ? 'Ne yapılıyor' : 'What is being done'}>
        <TextInput value={noteOfWhat} onChange={(e) => setNoteOfWhat(e.target.value)} required />
      </Field>
      <Field label={tr ? 'Gerekçe' : 'Why'}>
        <TextInput
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            tr ? 'Hangi karara dayanarak devam ediliyor?' : 'On what basis is this going ahead?'
          }
          required
        />
      </Field>
      <Field label={tr ? 'İlgili blok' : 'Which block, if any'}>
        <Select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
          <option value="">{tr ? 'Yok' : 'None'}</option>
          {(blocks.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </Select>
      </Field>

      <p className="text-sm leading-relaxed text-rose-900/80">
        {tr
          ? 'Bu kayıt adınızla ve tarihiyle kalıcıdır. Düzeltilemez, silinemez — bilinçli alınmış bir riskin sonradan silinebilmesi, hiç kaydedilmemiş olmasıyla aynı şeydir.'
          : 'This is recorded permanently, with your name and the date. It cannot be edited or deleted — a deliberate risk that can be erased later was never recorded at all.'}
      </p>

      <WriteError error={record.error} />

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={record.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="danger" disabled={record.isPending}>
          {tr ? 'Kararı kaydet' : 'Record the decision'}
        </ActionButton>
      </div>
    </form>
  );
};
