import React, { useState } from 'react';
import { FolderOpen, Plus, ArrowRightLeft, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { todayIso } from '../../lib/date';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { EmptyState } from '../EmptyState';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Exhibits and the chain of custody (M5-06).
 *
 * The chain is not administration here, it is the subject matter: a document
 * whose handling cannot be accounted for is a document the other side gets to
 * question. So each handover is a row that can be added and never edited or
 * deleted — by anybody, including whoever wrote it. A chain that can be
 * tidied afterwards proves nothing, which is the only reason to keep one.
 */
export const EvidenceList: React.FC<{ caseId: string; canWrite: boolean }> = ({
  caseId,
  canWrite,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const exhibits = legal.useExhibits(caseId);
  const custody = legal.useCustody(caseId);
  const [adding, setAdding] = useState(false);
  const [handingOver, setHandingOver] = useState<string | null>(null);

  const rows = exhibits.data ?? [];
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((e) => e.id));
  const chainFor = (exhibitId: string) =>
    (custody.data ?? []).filter((c) => c.exhibitId === exhibitId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FolderOpen className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Deliller ve zincir' : 'Evidence & custody'}
          <Pill>{rows.length}</Pill>
        </h2>
        {canWrite && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Delil ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && <NewExhibitForm caseId={caseId} onDone={() => setAdding(false)} />}

        {rows.length === 0 && !adding ? (
          <EmptyState
            icon={FolderOpen}
            title={tr ? 'Delil kaydı yok' : 'No exhibits recorded'}
            description={
              tr
                ? 'Her delili işaretiyle, kaynağıyla ve neyi ispat ettiğiyle girin. Teslim zinciri eklendikten sonra düzeltilemez.'
                : 'Record each exhibit with its mark, its source and what it proves. A handover cannot be corrected once entered.'
            }
          />
        ) : (
          rows.map((exhibit) => {
            const chain = chainFor(exhibit.id);
            return (
              <article key={exhibit.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill className="border-slate-400 bg-slate-800 font-mono text-white">
                        {exhibit.mark}
                      </Pill>
                      <span className="text-sm font-medium text-slate-900">
                        {exhibit.description}
                      </span>
                    </div>
                    <RecordOrigin origin={origins.of(exhibit.id)} />
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {exhibit.source && (
                        <span>
                          {tr ? 'kaynak: ' : 'from: '}
                          {exhibit.source}
                        </span>
                      )}
                      {exhibit.relevance && (
                        <span>
                          {tr ? 'ispat ettiği: ' : 'proves: '}
                          {exhibit.relevance}
                        </span>
                      )}
                    </div>
                  </div>
                  {canWrite && handingOver !== exhibit.id && (
                    <ActionButton onClick={() => setHandingOver(exhibit.id)}>
                      <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                      <span>{tr ? 'Teslim kaydet' : 'Record a handover'}</span>
                    </ActionButton>
                  )}
                </div>

                {handingOver === exhibit.id && (
                  <HandoverForm
                    exhibitId={exhibit.id}
                    lastHolder={chain[chain.length - 1]?.toParty ?? ''}
                    onDone={() => setHandingOver(null)}
                  />
                )}

                {chain.length > 0 && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <p className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      {tr ? 'Teslim zinciri' : 'Chain of custody'}
                    </p>
                    <ol className="mt-1 space-y-0.5">
                      {chain.map((link) => (
                        <li key={link.id} className="text-sm text-slate-700">
                          <span className="font-mono text-slate-500">
                            {link.handedOverAt.slice(0, 10)}
                          </span>{' '}
                          {link.fromParty} → <span className="font-medium">{link.toParty}</span>
                          {link.note && <span className="text-slate-500"> · {link.note}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};

const HandoverForm: React.FC<{
  exhibitId: string;
  lastHolder: string;
  onDone: () => void;
}> = ({ exhibitId, lastHolder, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const record = legal.useRecordHandover();
  const [fromParty, setFromParty] = useState(lastHolder);
  const [toParty, setToParty] = useState('');
  const [handedOverAt, setHandedOverAt] = useState(todayIso);
  const [note, setNote] = useState('');

  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!fromParty.trim() || !toParty.trim()) return;
        record.mutate(
          {
            exhibitId,
            fromParty: fromParty.trim(),
            toParty: toParty.trim(),
            handedOverAt: new Date(`${handedOverAt}T12:00:00`).toISOString(),
            note: note.trim() || null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Kimden' : 'From'}>
          <TextInput value={fromParty} onChange={(e) => setFromParty(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Kime' : 'To'}>
          <TextInput value={toParty} onChange={(e) => setToParty(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Tarih' : 'When'}>
          <TextInput
            type="date"
            value={handedOverAt}
            onChange={(e) => setHandedOverAt(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field label={tr ? 'Not' : 'Note'}>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <p className="text-sm leading-relaxed text-slate-500">
        {tr
          ? 'Bu kayıt eklendikten sonra düzeltilemez ve silinemez — ne sizin ne de bir başkasının. Sonradan düzeltilebilen bir zincir hiçbir şey kanıtlamaz.'
          : 'Once entered this cannot be corrected or deleted, by you or anyone else. A chain that can be tidied afterwards proves nothing.'}
      </p>

      <WriteError error={record.error} />

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={record.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={record.isPending}>
          {tr ? 'Zincire ekle' : 'Add to the chain'}
        </ActionButton>
      </div>
    </form>
  );
};

const NewExhibitForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = legal.useCreateExhibit();
  const [mark, setMark] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [relevance, setRelevance] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mark.trim() || !description.trim()) return;
        create.mutate(
          {
            legalCaseId: caseId,
            mark: mark.trim(),
            description: description.trim(),
            source: source.trim() || null,
            relevance: relevance.trim() || null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
        <Field label={tr ? 'Ek işareti' : 'Mark'}>
          <TextInput
            value={mark}
            onChange={(e) => setMark(e.target.value)}
            placeholder="AUTK-1"
            required
          />
        </Field>
        <Field label={tr ? 'Tanım' : 'What it is'} className="sm:col-span-3">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Kaynak' : 'Where it came from'} className="sm:col-span-2">
          <TextInput value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <Field
          label={tr ? 'Neyi ispat ediyor' : 'What it is offered to prove'}
          className="sm:col-span-2"
        >
          <TextInput value={relevance} onChange={(e) => setRelevance(e.target.value)} />
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
