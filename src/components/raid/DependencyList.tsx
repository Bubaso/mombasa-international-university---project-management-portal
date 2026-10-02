/**
 * The dependency register (M6-07).
 *
 * "Y cannot start without X." On this project that chain is a court ruling,
 * then the construction, then accreditation — and the third of those has no
 * module in the portal, so a dependency may name something the system does
 * not hold. A register that could not mention accreditation would be
 * describing a different project.
 *
 * The settled column has three states, not two. Null means the portal cannot
 * say: a court case being open tells you nothing about whether the particular
 * ruling the work is waiting for has come, and answering "no" there would be
 * making something up.
 */
import React, { useState } from 'react';
import { CircleHelp, GitBranch, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as raid from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, TextInput, WriteError } from '../ui/Controls';

export const DependencyList: React.FC<{ canKeep: boolean }> = ({ canKeep }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const dependencies = raid.useDependencies();
  const create = raid.useCreateDependency();
  const remove = raid.useDeleteDependency();

  const [adding, setAdding] = useState(false);
  const [blocker, setBlocker] = useState('');
  const [dependent, setDependent] = useState('');
  const [note, setNote] = useState('');

  const rows = dependencies.data ?? [];

  const describe = (label: string | null, ids: (string | null)[], kinds: string[]): string => {
    if (label) return label;
    const index = ids.findIndex((id) => id != null);
    return index >= 0 ? kinds[index]! : '—';
  };

  return (
    <Section
      icon={GitBranch}
      title={tr ? 'Bağımlılıklar' : 'Dependencies'}
      subtitle={
        tr
          ? '"X olmadan Y başlayamaz." Bu projede zincir şu: mahkeme kararı → inşaat → akreditasyon.'
          : '“Y cannot start without X.” On this project the chain is a ruling, then the construction, then accreditation.'
      }
      whoMayUse={tr ? 'Kurum içi.' : 'Inside the organisation.'}
      canUse={canKeep}
    >
      <QueryStatus queries={[dependencies]} />

      {canKeep && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(
                  { blockerLabel: blocker, dependentLabel: dependent, noteEn: note.trim() || null },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field
                  label={tr ? 'Bu olmadan…' : 'Without this…'}
                  className="min-w-[160px] flex-1"
                >
                  <TextInput
                    required
                    value={blocker}
                    onChange={(e) => setBlocker(e.target.value)}
                  />
                </Field>
                <Field
                  label={tr ? '…bu başlayamaz' : '…this cannot start'}
                  className="min-w-[160px] flex-1"
                >
                  <TextInput
                    required
                    value={dependent}
                    onChange={(e) => setDependent(e.target.value)}
                  />
                </Field>
              </div>
              <Field label={tr ? 'Not' : 'Note'}>
                <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="primary" disabled={create.isPending}>
                  {tr ? 'Ekle' : 'Add'}
                </ActionButton>
                <ActionButton type="button" onClick={() => setAdding(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
              </div>
              <WriteError error={create.error} />
            </form>
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Bağımlılık ekle' : 'Add a dependency'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={tr ? 'Bağımlılık kaydedilmemiş' : 'No dependencies recorded'}
          description={
            tr
              ? 'Neyin neyi beklediği yazılı değil. Bu zincir yazılmadığında, gecikmenin nereden geldiği her seferinde yeniden tartışılır.'
              : 'Nothing records what is waiting on what. Unwritten, the chain gets re-argued every time something is late.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((dependency) => (
            <li
              key={dependency.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-900">
                    {describe(
                      dependency.blockerLabel,
                      [
                        dependency.blockerLegalCaseId,
                        dependency.blockerSiteTaskId,
                        dependency.blockerObligationId,
                        dependency.blockerRiskId,
                      ],
                      [
                        tr ? 'bir dava' : 'a court case',
                        tr ? 'bir saha görevi' : 'a site task',
                        tr ? 'bir yükümlülük' : 'an obligation',
                        tr ? 'bir risk' : 'a risk',
                      ],
                    )}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-700">
                    {describe(
                      dependency.dependentLabel,
                      [
                        dependency.dependentSiteTaskId,
                        dependency.dependentObligationId,
                        dependency.dependentLegalCaseId,
                      ],
                      [
                        tr ? 'bir saha görevi' : 'a site task',
                        tr ? 'bir yükümlülük' : 'an obligation',
                        tr ? 'bir dava' : 'a court case',
                      ],
                    )}
                  </span>
                  {/* Three states, because the honest answer is sometimes
                      "this system cannot tell you". */}
                  {dependency.blockerSettled === true && (
                    <Pill className="border-emerald-200 bg-emerald-100 text-emerald-800">
                      {tr ? 'engel kalktı' : 'cleared'}
                    </Pill>
                  )}
                  {dependency.blockerSettled === false && (
                    <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                      {tr ? 'hâlâ bekliyor' : 'still waiting'}
                    </Pill>
                  )}
                  {dependency.blockerSettled === null && (
                    <Pill className="border-slate-200 bg-slate-100 text-slate-600">
                      <span className="flex items-center gap-1">
                        <CircleHelp className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'portal bilemiyor' : 'the portal cannot say'}
                      </span>
                    </Pill>
                  )}
                </div>
                {dependency.noteEn && <p className="mt-0.5 text-slate-500">{dependency.noteEn}</p>}
              </div>
              {canKeep && (
                <ActionButton
                  tone="danger"
                  onClick={() => remove.mutate(dependency.id)}
                  disabled={remove.isPending}
                  aria-label={tr ? 'Sil' : 'Remove'}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <WriteError error={remove.error} />
    </Section>
  );
};
