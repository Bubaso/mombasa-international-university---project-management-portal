/**
 * The action triage queue (M3-05, M3-07, G-04).
 *
 * 103 lines of action text came out of the Notion minutes. Three of them name
 * both a person and a date; eighty-five name neither. An action in this
 * portal has one owner and one date and the database enforces both, so the
 * migration could not turn these into actions and would not invent the two
 * fields — an action with a made-up date is worse than no action at all,
 * because it looks tracked.
 *
 * This is where the queue goes down. Each line keeps the sentence somebody
 * actually wrote and the minute it came from; adopting it asks for the two
 * things that make it an action, and dropping it asks for a reason, because
 * a line that disappears without one is the silent loss M3-07 exists to
 * prevent.
 *
 * The number at the top is the point. It is not a count of actions — these
 * are not actions — it is a count of sentences still waiting for a decision.
 */
import React, { useMemo, useState } from 'react';
import { CircleCheck, CircleSlash, Inbox, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useActionCandidates,
  useCandidateCounts,
  useAdoptCandidate,
  useDismissCandidate,
} from '../../api/candidateHooks';
import { useProfiles } from '../../api/adminHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import type { ActionCandidate } from '../../types';
import { MoreRows } from '../ui/MoreRows';

/** The owner picker: one list, two kinds of owner, exactly one choice. */
const OWNER_SPLIT = '::';

export const TriagePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 25;
  const [limit, setLimit] = React.useState(25);
  const [filter, setFilter] = useState<'pending' | 'settled'>('pending');
  const candidates = useActionCandidates(filter, limit);
  const counts = useCandidateCounts();
  const profiles = useProfiles();
  const stakeholders = useStakeholders();
  const adopt = useAdoptCandidate();
  const dismiss = useDismissCandidate();

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'adopt' | 'dismiss'>('adopt');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [reason, setReason] = useState('');

  // Çekilen dilim zaten seçilen sekmenin dilimi: süzgeç sunucuda. Sekme
  // sayıları da dilimden değil kütükten geliyor, yoksa "2 karar bekliyor"
  // yazarken yirmi tane bekliyor olabilirdi.
  const shown = candidates.data?.rows ?? [];
  const pendingCount = counts.data?.pending ?? 0;
  const settledCount = counts.data?.settled ?? 0;

  // "Hazır" olanlar: bir kişi ve bir tarih adıyla gelmiş adaylar. Bu sayı
  // gösterilen dilim hakkında ve öyle yazılıyor — kütüğün tamamı için
  // `action_triage` iki alanı birden süzen bir sayım istiyor ve o henüz yok.
  const readyShown = shown.filter((c) => c.namesAnOwner && c.namesADate).length;

  // Grouped by the meeting they came out of, because that is the context a
  // person needs to decide who owns one.
  const byMeeting = useMemo(() => {
    const groups = new Map<string, { title: string; heldAt: string; rows: ActionCandidate[] }>();
    for (const c of shown) {
      const key = c.meetingId;
      const title = (tr ? c.meetingTitleTr : c.meetingTitle) ?? c.meetingTitle;
      const found = groups.get(key);
      if (found) found.rows.push(c);
      else groups.set(key, { title, heldAt: c.heldAt, rows: [c] });
    }
    return [...groups.values()];
  }, [shown, tr]);

  const start = (c: ActionCandidate, how: 'adopt' | 'dismiss') => {
    setOpenId(c.id);
    setMode(how);
    setOwner(
      c.suggestedOwnerStakeholderId ? `s${OWNER_SPLIT}${c.suggestedOwnerStakeholderId}` : '',
    );
    setDue(c.suggestedDueOn ?? '');
    setPriority('normal');
    setReason('');
  };

  const submit = (c: ActionCandidate) => {
    const [kind, id] = owner.split(OWNER_SPLIT);
    adopt.mutate(
      {
        id: c.id,
        dueDate: due,
        ownerProfileId: kind === 'p' ? id : null,
        ownerStakeholderId: kind === 's' ? id : null,
        priority,
      },
      { onSuccess: () => setOpenId(null) },
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Aksiyon adayları' : 'Action candidates'}
            </h2>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Tutanaklardan gelen aksiyon cümleleri. Sorumlusu ve tarihi yazılmadan aksiyon sayılmıyor.'
                : 'Action sentences from the minutes. Nothing counts as an action until it has an owner and a date.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill
            className={
              pendingCount > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
            }
          >
            {tr ? `${pendingCount} karar bekliyor` : `${pendingCount} awaiting a decision`}
          </Pill>
          {readyShown > 0 && (
            <Pill className="border-sky-300 bg-sky-50 text-sky-900">
              {tr
                ? `gösterilenlerden ${readyShown} tanesi hazır`
                : `${readyShown} of those shown arrive ready`}
            </Pill>
          )}
          <button
            type="button"
            onClick={() => setFilter(filter === 'pending' ? 'settled' : 'pending')}
            className="cursor-pointer text-xs text-slate-500 underline"
          >
            {filter === 'pending'
              ? tr
                ? `karara bağlananlar (${settledCount})`
                : `settled (${settledCount})`
              : tr
                ? `bekleyenler (${pendingCount})`
                : `pending (${pendingCount})`}
          </button>
        </div>
      </header>

      <QueryStatus queries={[candidates]} />

      {shown.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {filter === 'pending'
            ? tr
              ? 'Kuyruk boş — tutanaklardaki her aksiyon cümlesi ya bir aksiyona dönüştü ya da gerekçesiyle elendi.'
              : 'The queue is empty: every action sentence in the minutes has become an action or been dropped with a reason.'
            : tr
              ? 'Henüz karara bağlanan aday yok.'
              : 'Nothing has been settled yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {byMeeting.map((group) => (
            <div key={group.title + group.heldAt}>
              <h3 className="mb-1 flex items-baseline gap-2 text-xs font-semibold text-slate-700">
                {group.title}
                <span className="font-mono font-normal text-slate-500">
                  {formatDate(group.heldAt, language)}
                </span>
                <span className="font-normal text-slate-500">
                  {group.rows.length} {tr ? 'satır' : 'lines'}
                </span>
              </h3>
              <ul className="space-y-1">
                {group.rows.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="font-mono text-xs text-slate-500">{c.sequence}</span>
                      <p className="min-w-0 flex-1 text-sm text-slate-900">
                        {(tr ? c.textTr : c.textEn) ?? c.textEn}
                      </p>
                      {c.state === 'pending' ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {/* What the sentence itself came with, which is
                              what decides how much work this one is. */}
                          {c.namesAnOwner && c.namesADate ? (
                            <Pill className="border-sky-300 bg-sky-50 text-sky-900">
                              {tr ? 'hazır' : 'ready'}
                            </Pill>
                          ) : (
                            <Pill className="border-slate-300 bg-white text-slate-500">
                              <TriangleAlert className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                              {c.namesAnOwner
                                ? tr
                                  ? 'tarih yok'
                                  : 'no date'
                                : c.namesADate
                                  ? tr
                                    ? 'sorumlu yok'
                                    : 'no owner'
                                  : tr
                                    ? 'ikisi de yok'
                                    : 'neither'}
                            </Pill>
                          )}
                          <button
                            type="button"
                            onClick={() => start(c, 'adopt')}
                            className="flex cursor-pointer items-center gap-1 text-xs text-emerald-800 hover:underline"
                          >
                            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {tr ? 'aksiyona çevir' : 'make it an action'}
                          </button>
                          <button
                            type="button"
                            onClick={() => start(c, 'dismiss')}
                            className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:underline"
                          >
                            <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
                            {tr ? 'ele' : 'drop it'}
                          </button>
                        </div>
                      ) : c.state === 'adopted' ? (
                        <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                          {tr ? 'aksiyon oldu' : 'became an action'}
                        </Pill>
                      ) : (
                        <Pill className="border-slate-300 bg-white text-slate-600">
                          {tr ? 'elendi' : 'dropped'}
                        </Pill>
                      )}
                    </div>

                    {c.dismissedReason && (
                      <p className="mt-1 text-sm text-slate-600">
                        {tr ? 'Gerekçe: ' : 'Reason: '}
                        {c.dismissedReason}
                      </p>
                    )}

                    {openId === c.id && mode === 'adopt' && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submit(c);
                        }}
                        className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2"
                      >
                        <Field label={tr ? 'Sorumlu' : 'Owner'}>
                          <Select value={owner} onChange={(e) => setOwner(e.target.value)} required>
                            <option value="">{tr ? 'seçin…' : 'choose…'}</option>
                            <optgroup label={tr ? 'Portal kullanıcıları' : 'Portal users'}>
                              {(profiles.data ?? []).map((p) => (
                                <option key={p.id} value={`p${OWNER_SPLIT}${p.id}`}>
                                  {p.fullName}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={tr ? 'Paydaş kütüğü' : 'Stakeholder register'}>
                              {(stakeholders.data ?? []).map((s) => (
                                <option key={s.id} value={`s${OWNER_SPLIT}${s.id}`}>
                                  {s.fullName}
                                </option>
                              ))}
                            </optgroup>
                          </Select>
                        </Field>
                        <Field label={tr ? 'Son tarih' : 'Due date'}>
                          <TextInput
                            type="date"
                            value={due}
                            onChange={(e) => setDue(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label={tr ? 'Öncelik' : 'Priority'}>
                          <Select
                            value={priority}
                            onChange={(e) =>
                              setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')
                            }
                          >
                            <option value="low">{tr ? 'düşük' : 'low'}</option>
                            <option value="normal">{tr ? 'normal' : 'normal'}</option>
                            <option value="high">{tr ? 'yüksek' : 'high'}</option>
                            <option value="urgent">{tr ? 'acil' : 'urgent'}</option>
                          </Select>
                        </Field>
                        <ActionButton type="submit" disabled={adopt.isPending}>
                          {tr ? 'Aksiyon olarak aç' : 'Open it as an action'}
                        </ActionButton>
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                        >
                          {tr ? 'vazgeç' : 'cancel'}
                        </button>
                        {!c.namesADate && (
                          <p className="w-full text-sm text-amber-800">
                            {tr
                              ? 'Tutanakta tarih yok. Tarihi siz koyuyorsunuz — bu bir alan doldurmak değil, bir karar vermek.'
                              : 'The minute gives no date. You are setting one, which is a decision rather than a field.'}
                          </p>
                        )}
                        <div className="w-full">
                          <WriteError error={adopt.error} />
                        </div>
                      </form>
                    )}

                    {openId === c.id && mode === 'dismiss' && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          dismiss.mutate(
                            { id: c.id, reason },
                            { onSuccess: () => setOpenId(null) },
                          );
                        }}
                        className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-300 bg-white p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <Field label={tr ? 'Neden eleniyor' : 'Why it is being dropped'}>
                            <TextInput
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={
                                tr
                                  ? '16 Nisan’da Büyükelçi ile kararlaştırılan diplomatik hat bunun yerini aldı.'
                                  : 'Superseded by the diplomatic track agreed with the Ambassador on 16 April.'
                              }
                              required
                            />
                          </Field>
                        </div>
                        <ActionButton type="submit" disabled={dismiss.isPending}>
                          {tr ? 'Ele' : 'Drop it'}
                        </ActionButton>
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                        >
                          {tr ? 'vazgeç' : 'cancel'}
                        </button>
                        <div className="w-full">
                          <WriteError error={dismiss.error} />
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <MoreRows
                shown={(candidates.data?.rows ?? []).length}
                total={candidates.data?.total ?? 0}
                onMore={() => setLimit(limit + PAGE)}
                busy={candidates.isFetching}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
