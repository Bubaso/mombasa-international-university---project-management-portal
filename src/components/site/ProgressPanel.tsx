/**
 * Tasks on a block, and the only way a percentage gets recorded (M7-03).
 *
 * The form asks for the document first and the number second, which is the
 * order the rule works in: there is no column to put a figure in without one.
 * The document picker lists the vault rather than taking a file, because a
 * photograph that is evidence belongs in the vault with a digest against it,
 * not attached loosely to a progress row.
 *
 * What the old module did here instead: a dialog with a percentage slider,
 * writing straight onto the block.
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { CalendarClock, Camera, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as site from '../../api/siteHooks';
import { useDocumentOptions } from '../../api/documentHooks';
import { EmptyState } from '../EmptyState';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import {
  WORK_STATE_VALUES,
  captureGapDays,
  formatDate,
  progressLabel,
  workKindLabel,
  workStateLabel,
  workStateStyle,
} from '../../lib/site';
import type { SiteTask, WorkKind, WorkState } from '../../types';

interface Props {
  blockId: string;
  canReport: boolean;
  canPlan: boolean;
}

export const ProgressPanel: React.FC<Props> = ({ blockId, canReport, canPlan }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const packages = site.useWorkPackages(blockId);
  const tasks = site.useTasks(blockId);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = tasks.data ?? [];
  const construction = rows.filter((t) => t.kind === 'construction');
  const preservation = rows.filter((t) => t.kind === 'preservation');

  return (
    <Section
      icon={CalendarClock}
      title={tr ? 'İş paketleri ve görevler' : 'Work packages and tasks'}
      subtitle={
        tr
          ? 'İlerleme kanıta bağlı: bir yüzde ancak dayandığı belgeyle birlikte kaydedilir.'
          : 'Progress is evidence-bound: a percentage is only recorded together with what it rests on.'
      }
      whoMayUse={
        tr
          ? 'Sahadaki ekip ve bloğa atanmış firma raporlar.'
          : 'The site team and the firm assigned to the block report.'
      }
      canUse={canReport}
    >
      <QueryStatus queries={[packages, tasks]} />

      {canPlan && (
        <div className="mb-3">
          {adding ? (
            <NewTaskForm
              blockId={blockId}
              packages={(packages.data ?? []).map((p) => ({ id: p.id, title: p.titleEn }))}
              onDone={() => setAdding(false)}
            />
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Görev ekle' : 'Add a task'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tr ? 'Bu blokta görev yok' : 'No tasks on this block'}
          description={
            (packages.data ?? []).length === 0
              ? tr
                ? 'Önce bir iş paketi açın. Görevler pakete, paket bloğa, blok faza bağlanır.'
                : 'Open a work package first. Tasks belong to a package, a package to a block, a block to a phase.'
              : tr
                ? 'Paketler var ama içlerinde görev yok.'
                : 'There are packages, but nothing in them yet.'
          }
        />
      ) : (
        <div className="space-y-4">
          <TaskGroup
            heading={tr ? 'İnşaat' : 'Construction'}
            tasks={construction}
            openTask={openTask}
            onToggle={(id) => setOpenTask(openTask === id ? null : id)}
            canReport={canReport}
          />
          {preservation.length > 0 && (
            <TaskGroup
              heading={tr ? 'Koruma' : 'Preservation'}
              note={
                tr
                  ? 'Ayrı sayılır: açıkta kalan yapıyı ayakta tutmak, projenin ilerlemesi değildir.'
                  : 'Counted apart: keeping an open structure standing is not the project advancing.'
              }
              tasks={preservation}
              openTask={openTask}
              onToggle={(id) => setOpenTask(openTask === id ? null : id)}
              canReport={canReport}
            />
          )}
        </div>
      )}
    </Section>
  );
};

const TaskGroup: React.FC<{
  heading: string;
  note?: string;
  tasks: SiteTask[];
  openTask: string | null;
  onToggle: (id: string) => void;
  canReport: boolean;
}> = ({ heading, note, tasks, openTask, onToggle, canReport }) => {
  const { language } = useApp();
  if (tasks.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{heading}</h3>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onToggle(task.id)}
              className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">
                    <Bilingual
                      table="site_tasks"
                      id={task.id}
                      base="title"
                      en={task.titleEn}
                      tr={task.titleTr}
                    />
                  </span>
                  <Pill className={workStateStyle(task.state)}>
                    {workStateLabel(task.state, language)}
                  </Pill>
                  {task.kind === 'preservation' && (
                    <Pill>{workKindLabel(task.kind, language)}</Pill>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  {task.workPackageTitle && <span>{task.workPackageTitle}</span>}
                  {task.plannedEnd && <span>{formatDate(task.plannedEnd, language)}</span>}
                  {task.ownerName && <span>{task.ownerName}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`font-mono text-sm ${
                    task.percentComplete == null ? 'text-amber-700' : 'text-slate-800'
                  }`}
                >
                  {progressLabel(task.percentComplete, language)}
                </span>
                {openTask === task.id ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                )}
              </div>
            </button>
            {openTask === task.id && <TaskDetail task={task} canReport={canReport} />}
          </li>
        ))}
      </ul>
    </div>
  );
};

const TaskDetail: React.FC<{ task: SiteTask; canReport: boolean }> = ({ task, canReport }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const reports = site.useProgress(task.id);
  const setState = site.useSetTaskState();
  const [reporting, setReporting] = useState(false);

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
      {task.kind === 'preservation' && (task.legalBasisEn ?? task.legalBasisTr) && (
        <p className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs leading-relaxed text-orange-900">
          <span className="font-semibold">{tr ? 'Hukukî dayanak: ' : 'Legal basis: '}</span>
          {tr ? (task.legalBasisTr ?? task.legalBasisEn) : task.legalBasisEn}
        </p>
      )}

      <QueryStatus queries={[reports]} />

      {(reports.data ?? []).length === 0 ? (
        <p className="text-xs text-amber-800">
          {tr
            ? 'Hiç rapor yok. Bu görev hakkında kimse bir şey söylememiş — sıfırda olduğu söylenmemiş.'
            : 'No reports. Nobody has said anything about this task — not that it is at nought.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(reports.data ?? []).map((report) => {
            const gap = captureGapDays(report.capturedAt, report.reportedAt);
            return (
              <li
                key={report.id}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-2.5">
                  <span className="font-mono font-semibold text-slate-900">
                    {report.percentComplete}%
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <Camera className="h-3 w-3" aria-hidden="true" />
                    {report.documentTitle ?? (tr ? 'belge' : 'document')}
                  </span>
                  <span className="text-slate-500">{report.reportedByName ?? '—'}</span>
                  <span className="text-slate-500">{formatDate(report.reportedAt, language)}</span>
                  {/* The gap between taking the picture and filing it is the
                      thing a reader needs, and the thing nobody volunteers. */}
                  {gap != null && (
                    <span className="text-amber-700">
                      {tr ? `${gap} gün önce çekilmiş` : `captured ${gap} days earlier`}
                    </span>
                  )}
                </div>
                {report.note && <p className="mt-0.5 text-slate-600">{report.note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canReport && (
        <div className="space-y-2">
          {reporting ? (
            <ReportForm taskId={task.id} onDone={() => setReporting(false)} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton tone="primary" onClick={() => setReporting(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr ? 'İlerleme bildir' : 'Report progress'}</span>
              </ActionButton>
              <Select
                value={task.state}
                onChange={(e) =>
                  setState.mutate({ id: task.id, state: e.target.value as WorkState })
                }
                className="w-auto"
              >
                {WORK_STATE_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {workStateLabel(s, language)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <WriteError error={setState.error} />
        </div>
      )}
    </div>
  );
};

const ReportForm: React.FC<{ taskId: string; onDone: () => void }> = ({ taskId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const documents = useDocumentOptions();
  const report = site.useReportProgress();

  const [documentId, setDocumentId] = useState('');
  const [percent, setPercent] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [note, setNote] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    report.mutate(
      {
        siteTaskId: taskId,
        percentComplete: Number(percent),
        documentId,
        capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        note: note.trim() || null,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
      {/* The document comes first because the rule does. */}
      <Field label={tr ? 'Kanıt belgesi (zorunlu)' : 'Evidence document (required)'}>
        <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)} required>
          <option value="">{tr ? 'Kasadan seçin…' : 'Choose from the vault…'}</option>
          {(documents.data ?? []).map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </Select>
      </Field>

      {(documents.data ?? []).length === 0 && (
        <p className="text-xs text-amber-800">
          {tr
            ? 'Kasada belge yok. Fotoğrafı veya raporu önce Belge Kasası’na yükleyin — kanıt oraya, özetiyle birlikte konur.'
            : 'The vault is empty. Upload the photograph or the report there first — evidence belongs in the vault, with a digest against it.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Field label={tr ? 'Yüzde' : 'Percent'} className="w-24">
          <TextInput
            type="number"
            min={0}
            max={100}
            required
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>
        <Field label={tr ? 'Çekildiği tarih' : 'Captured on'} className="w-44">
          <TextInput
            type="date"
            value={capturedAt}
            onChange={(e) => setCapturedAt(e.target.value)}
          />
        </Field>
        <Field label={tr ? 'Not' : 'Note'} className="min-w-[160px] flex-1">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="flex gap-2">
        <ActionButton type="submit" tone="primary" disabled={report.isPending}>
          {tr ? 'Kaydet' : 'Record'}
        </ActionButton>
        <ActionButton type="button" onClick={onDone}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
      <WriteError error={report.error} />
    </form>
  );
};

const NewTaskForm: React.FC<{
  blockId: string;
  packages: { id: string; title: string }[];
  onDone: () => void;
}> = ({ blockId, packages, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const createTask = site.useCreateTask();
  const createPackage = site.useCreateWorkPackage();

  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<WorkKind>('construction');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [packageCode, setPackageCode] = useState('');
  const [packageTitle, setPackageTitle] = useState('');

  if (packages.length === 0) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createPackage.mutate(
            {
              constructionBlockId: blockId,
              code: packageCode,
              titleEn: packageTitle,
              contractorId: null,
            },
            { onSuccess: onDone },
          );
        }}
        className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
      >
        <p className="text-xs text-slate-600">
          {tr
            ? 'Bu blokta iş paketi yok; önce bir tane açın.'
            : 'This block has no work package yet; open one first.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Field label={tr ? 'Kod' : 'Code'} className="w-28">
            <TextInput
              required
              value={packageCode}
              onChange={(e) => setPackageCode(e.target.value)}
            />
          </Field>
          <Field label={tr ? 'Başlık' : 'Title'} className="min-w-[160px] flex-1">
            <TextInput
              required
              value={packageTitle}
              onChange={(e) => setPackageTitle(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <ActionButton type="submit" tone="primary" disabled={createPackage.isPending}>
            {tr ? 'Paket aç' : 'Open package'}
          </ActionButton>
          <ActionButton type="button" onClick={onDone}>
            {tr ? 'Vazgeç' : 'Cancel'}
          </ActionButton>
        </div>
        <WriteError error={createPackage.error} />
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createTask.mutate(
          {
            workPackageId: packageId,
            titleEn: title,
            kind,
            plannedEnd: plannedEnd || null,
            legalBasisEn: kind === 'preservation' ? legalBasis.trim() || null : null,
          },
          { onSuccess: onDone },
        );
      }}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
    >
      <div className="flex flex-wrap gap-2">
        <Field label={tr ? 'İş paketi' : 'Work package'} className="min-w-[140px]">
          <Select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Görev' : 'Task'} className="min-w-[180px] flex-1">
          <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={tr ? 'Tür' : 'Kind'} className="w-36">
          <Select value={kind} onChange={(e) => setKind(e.target.value as WorkKind)}>
            <option value="construction">{workKindLabel('construction', language)}</option>
            <option value="preservation">{workKindLabel('preservation', language)}</option>
          </Select>
        </Field>
        <Field label={tr ? 'Hedef tarih' : 'Target date'} className="w-44">
          <TextInput
            type="date"
            value={plannedEnd}
            onChange={(e) => setPlannedEnd(e.target.value)}
          />
        </Field>
      </div>

      {/* The database refuses preservation work with no reason behind it, so
          the field appears exactly when that rule applies rather than being
          explained after the refusal. */}
      {kind === 'preservation' && (
        <Field label={tr ? 'Hukukî dayanak (zorunlu)' : 'Legal basis (required)'}>
          <TextInput
            required
            value={legalBasis}
            onChange={(e) => setLegalBasis(e.target.value)}
            placeholder={
              tr
                ? 'Hangi karar veya durum bu işi gerektiriyor?'
                : 'Which order or condition makes this work necessary?'
            }
          />
        </Field>
      )}

      <div className="flex gap-2">
        <ActionButton type="submit" tone="primary" disabled={createTask.isPending}>
          {tr ? 'Ekle' : 'Add'}
        </ActionButton>
        <ActionButton type="button" onClick={onDone}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
      <WriteError error={createTask.error} />
    </form>
  );
};
