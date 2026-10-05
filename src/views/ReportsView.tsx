/**
 * Compiled reports (M12-06 … M12-09).
 *
 * The requirement's measure for this module is a duration: a board pack
 * should take under ten minutes where it takes hours today. Hours, because
 * somebody reads six registers and retypes the numbers — and every retyped
 * number is one that can be wrong, which is what the second measure says:
 * no material figure without its source.
 *
 * So this screen does not have an editor. A report is compiled in SQL, under
 * the reader's own visibility, and arrives with the register each figure came
 * from printed beside it. What the screen adds is the part a database cannot:
 * somebody reads it, approves it, and only then does it leave the trust.
 *
 * Two honest limits are on the screen rather than in a comment. There is no
 * PDF generator here: the print button opens the browser's own dialogue,
 * which really does produce a PDF. And the download is Markdown, which Word
 * opens — not a .docx, because this project has nothing that writes one.
 */
import React, { useMemo, useState } from 'react';
import { ClipboardList, Download, FileCheck2, Printer, Send, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  useApproveReport,
  useOpenReport,
  usePublishReport,
  useReportRuns,
  useWithdrawReport,
} from '../api/reportsHooks';
import { useMeetings } from '../api/meetingHooks';
import { useStakeholders } from '../api/stakeholderHooks';
import { useAuthority } from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { CurvePanel } from '../components/reports/CurvePanel';
import { DataFreshness } from '../components/DataFreshness';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../components/ui/Controls';
import { actsAs } from '../lib/authority';
import {
  KINDS,
  STATE_LABEL,
  formatValue,
  kindName,
  sectionName,
  sectionsOf,
  toMarkdown,
} from '../lib/reports';
import { formatDate } from '../lib/site';
import { todayIso } from '../lib/date';
import type { ReportKind, UserRole } from '../types';
import { toneFor, wordFor } from '../lib/labels';
import { MoreRows } from '../components/ui/MoreRows';

/** Mirrors app.can_approve_report(). */
const APPROVERS: UserRole[] = ['admin', 'project_director', 'trustee', 'board_director'];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export const ReportsView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 20;
  const [limit, setLimit] = React.useState(20);
  const runs = useReportRuns(limit);
  const meetings = useMeetings();
  const people = useStakeholders();
  const authority = useAuthority();

  const open = useOpenReport();
  const approve = useApproveReport();
  const publish = usePublishReport();
  const withdraw = useWithdrawReport();

  const mayApprove = actsAs(authority.data, ...APPROVERS);
  const list = runs.data?.rows ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const active = list.find((r) => r.id === chosen) ?? list[0] ?? null;

  const [kind, setKind] = useState<ReportKind>('board_pack');
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(monthsAgo(3));
  const [to, setTo] = useState(todayIso());
  const [meetingId, setMeetingId] = useState('');
  const [donorId, setDonorId] = useState('');
  const [reason, setReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const shape = KINDS.find((k) => k.key === kind);
  const donors = useMemo(
    () => (people.data ?? []).filter((s) => s.category === 'donor'),
    [people.data],
  );

  const download = () => {
    if (!active) return;
    const blob = new Blob([toMarkdown(active, tr)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex items-start gap-2.5">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Derlenen raporlar' : 'Compiled reports'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Rapor yazılmaz, derlenir. Onay rakamları dondurur.'
                : 'A report is compiled, not written. Approval freezes the figures.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[runs]} />
      </header>

      {/* --- compile ------------------------------------------------------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            open.mutate(
              {
                kind,
                title,
                from: kind === 'board_pack' ? null : from,
                to: kind === 'board_pack' ? null : to,
                meetingId: kind === 'board_pack' ? meetingId : null,
                stakeholderId: kind === 'donor_report' ? donorId : null,
              },
              {
                onSuccess: (id) => {
                  setChosen(id);
                  setTitle('');
                },
              },
            );
          }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-4"
        >
          <Field label={tr ? 'Rapor türü' : 'Report'}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {tr ? k.tr : k.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Adı' : 'Name it'} className="sm:col-span-2">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr ? 'Nisan mütevelli dosyası' : 'April board pack'}
              required
            />
          </Field>

          {kind === 'board_pack' ? (
            <Field label={tr ? 'Hangi toplantı' : 'Which meeting'}>
              <Select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} required>
                <option value="">{tr ? 'seçin…' : 'choose…'}</option>
                {(meetings.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.heldAt.slice(0, 10)} · {(tr ? m.titleTr : m.title) ?? m.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : kind === 'donor_report' ? (
            <Field label={tr ? 'Hangi bağışçı' : 'Which donor'}>
              <Select value={donorId} onChange={(e) => setDonorId(e.target.value)} required>
                <option value="">{tr ? 'seçin…' : 'choose…'}</option>
                {donors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={tr ? 'Başlangıç' : 'From'}>
              <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
          )}

          {kind !== 'board_pack' && (
            <Field label={tr ? 'Bitiş' : 'To'}>
              <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          )}
          {kind === 'donor_report' && (
            <Field label={tr ? 'Başlangıç' : 'From'}>
              <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
          )}

          <div className="flex items-end gap-2 sm:col-span-4">
            <ActionButton type="submit" disabled={open.isPending}>
              {tr ? 'Derle' : 'Compile it'}
            </ActionButton>
            {shape && (
              <p className="flex-1 text-xs text-slate-500">{tr ? shape.why.tr : shape.why.en}</p>
            )}
          </div>
          <div className="sm:col-span-4">
            <WriteError error={open.error} />
          </div>
        </form>
      </section>

      <QueryStatus queries={[runs]} />

      {/* M12-11. Print-visible: a curve is one of the few things worth
          putting on paper, and the empty states are a list of what the
          project has not yet written down. */}
      <CurvePanel />

      {list.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 print:hidden">
          {tr
            ? 'Henüz derlenmiş rapor yok. Mütevelli dosyasının hazırlanması bugün saatler sürüyor; bu ekranın ölçütü on dakikanın altı.'
            : 'Nothing compiled yet. Preparing a board pack takes hours today; the measure for this screen is under ten minutes.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,19rem)_1fr]">
          <ul className="space-y-1 print:hidden">
            {list.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setChosen(run.id)}
                  className={`w-full cursor-pointer rounded-lg border p-2 text-left ${
                    active?.id === run.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {run.title}
                    </span>
                    <Pill className={toneFor(STATE_LABEL, run.state)}>
                      {wordFor(STATE_LABEL, run.state, tr ? 'tr' : 'en')}
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {kindName(run.kind, tr)} · {formatDate(run.preparedAt, language)} ·{' '}
                    {run.rows.length} {tr ? 'satır' : 'rows'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <MoreRows
            shown={list.length}
            total={runs.data?.total ?? 0}
            onMore={() => setLimit(limit + PAGE)}
            busy={runs.isFetching}
          />

          {active && (
            <article className="rounded-xl border border-slate-200 bg-white p-4 print:border-0 print:p-0">
              <header className="mb-3 border-b border-slate-200 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">{active.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {kindName(active.kind, tr)}
                      {active.periodFrom && active.periodTo && (
                        <>
                          {' · '}
                          {formatDate(active.periodFrom, language)} —{' '}
                          {formatDate(active.periodTo, language)}
                        </>
                      )}
                      {active.meetingTitle && ` · ${active.meetingTitle}`}
                      {active.stakeholderName && ` · ${active.stakeholderName}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {tr ? 'Derleyen: ' : 'Compiled by '}
                      {active.preparedByName ?? '—'} · {formatDate(active.preparedAt, language)}
                      {active.approvedByName && (
                        <>
                          {tr ? ' · Onaylayan: ' : ' · approved by '}
                          {active.approvedByName}
                          {active.approvedAt && ` · ${formatDate(active.approvedAt, language)}`}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <Pill className={toneFor(STATE_LABEL, active.state)}>
                      {wordFor(STATE_LABEL, active.state, tr ? 'tr' : 'en')}
                    </Pill>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex cursor-pointer items-center gap-1 text-xs text-slate-600 underline"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'Yazdır / PDF' : 'Print / PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={download}
                      className="flex cursor-pointer items-center gap-1 text-xs text-slate-600 underline"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'Markdown indir' : 'Download Markdown'}
                    </button>
                  </div>
                </div>

                {/* The two limits, said rather than implied. */}
                <p className="mt-2 text-xs text-slate-500 print:hidden">
                  {tr
                    ? 'PDF tarayıcının yazdırma penceresinden çıkar — portalda PDF üreten bir şey yok. İndirme Markdown’dır; Word onu açar, ama bu bir .docx değil.'
                    : 'The PDF comes from the browser’s print dialogue — nothing here generates one. The download is Markdown, which Word opens; it is not a .docx.'}
                </p>

                {active.state === 'draft' && mayApprove && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
                    <ActionButton
                      onClick={() => approve.mutate(active.id)}
                      disabled={approve.isPending}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'Onayla' : 'Approve'}
                    </ActionButton>
                    <span className="text-xs text-slate-500">
                      {tr
                        ? 'Onaydan sonra rakamlar değiştirilemez — yeniden derlemek gerekir.'
                        : 'After approval the figures cannot be changed; it has to be recompiled.'}
                    </span>
                  </div>
                )}
                {active.state === 'approved' && mayApprove && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
                    <ActionButton
                      onClick={() => publish.mutate(active.id)}
                      disabled={publish.isPending}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'Yayımla' : 'Publish'}
                    </ActionButton>
                    {active.kind === 'donor_report' && (
                      <span className="text-xs text-amber-800">
                        {tr
                          ? 'Yayımlamak bu raporu bağışçının okuyabileceği hâle getirir — gizlilik seviyesi “public”e düşer.'
                          : 'Publishing makes this readable by the donor: its tier drops to public.'}
                      </span>
                    )}
                  </div>
                )}
                {(active.state === 'approved' || active.state === 'published') && mayApprove && (
                  <div className="mt-2 print:hidden">
                    {withdrawing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          withdraw.mutate(
                            { id: active.id, reason },
                            {
                              onSuccess: () => {
                                setWithdrawing(false);
                                setReason('');
                              },
                            },
                          );
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <Field label={tr ? 'Neden geri çekiliyor' : 'Why it is withdrawn'}>
                          <TextInput
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                          />
                        </Field>
                        <ActionButton type="submit" disabled={withdraw.isPending}>
                          {tr ? 'Geri çek' : 'Withdraw'}
                        </ActionButton>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWithdrawing(true)}
                        className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 underline"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'geri çek' : 'withdraw it'}
                      </button>
                    )}
                    <WriteError error={withdraw.error} />
                  </div>
                )}
                <WriteError error={approve.error} />
                <WriteError error={publish.error} />
                {active.withdrawnReason && (
                  <p className="mt-2 text-xs text-rose-800">
                    {tr ? 'Geri çekildi: ' : 'Withdrawn: '}
                    {active.withdrawnReason}
                  </p>
                )}
              </header>

              {sectionsOf(active.rows).map((section) => (
                <section key={section} className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    {sectionName(section, tr)}
                  </h3>
                  <TableFrame
                    head={
                      <tr>
                        <Th>{tr ? 'Kalem' : 'Item'}</Th>
                        <Th>{tr ? 'Değer' : 'Value'}</Th>
                        <Th>{tr ? 'Kaynak' : 'Source'}</Th>
                      </tr>
                    }
                  >
                    {active.rows
                      .filter((row) => row.section === section)
                      .map((row, i) => (
                        <tr key={`${section}-${i}`}>
                          <Td>
                            <span className="text-sm text-slate-900">
                              {(tr ? row.labelTr : row.labelEn) ?? row.labelEn ?? '—'}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-mono text-xs text-slate-700">
                              {formatValue(row, tr) || '—'}
                            </span>
                          </Td>
                          <Td>
                            {/* The measure: no material figure without its
                                source. It travels with the row, including
                                into the print and the download. */}
                            <span className="font-mono text-xs text-slate-500">
                              {row.sourceNote ?? '—'}
                            </span>
                          </Td>
                        </tr>
                      ))}
                  </TableFrame>
                </section>
              ))}
            </article>
          )}
        </div>
      )}
    </div>
  );
};
