/**
 * Milestones, with the plan and the outcome side by side (M15-01).
 *
 * The column that makes this worth building is `slip`. A portal that keeps
 * one date per milestone and a status beside it cannot tell you that the
 * roof was ninety days late, because the date it holds is the date it was
 * eventually done. Two columns and a subtraction can.
 *
 * Three of the states are refusals the database enforces, and the forms here
 * ask for exactly what those refusals need rather than letting somebody
 * discover them as a constraint name:
 *
 *   achieved  → a date AND a document in the vault
 *   missed    → a target that existed to be missed
 *   abandoned → a reason
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { CalendarClock, CircleCheck, CircleX, Flag, Plus, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useAchieveMilestone,
  useAddMilestone,
  useMarkMissed,
  useMoveTarget,
  usePhases,
  usePlanMilestones,
} from '../../api/planHooks';
import { useDocuments } from '../../api/documentHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { actsAs } from '../../lib/authority';
import { formatDate } from '../../lib/site';
import { todayIso } from '../../lib/date';
import type { MilestoneProgress, UserRole } from '../../types';

/** Mirrors app.can_keep_plan(). */
const PLAN_KEEPERS: UserRole[] = [
  'admin',
  'project_director',
  'trustee',
  'board_director',
  'field_team',
];

const STATE: Record<MilestoneProgress, { tr: string; en: string; tone: string }> = {
  planned: { tr: 'planlandı', en: 'planned', tone: 'border-slate-300 bg-slate-100 text-slate-700' },
  in_progress: {
    tr: 'sürüyor',
    en: 'in progress',
    tone: 'border-sky-300 bg-sky-50 text-sky-900',
  },
  achieved: {
    tr: 'ulaşıldı',
    en: 'achieved',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  missed: { tr: 'kaçırıldı', en: 'missed', tone: 'border-rose-300 bg-rose-50 text-rose-900' },
  abandoned: {
    tr: 'bırakıldı',
    en: 'abandoned',
    tone: 'border-slate-300 bg-white text-slate-500',
  },
};

/** How a slip reads. The sign matters and the null matters more. */
function slipText(slip: number | null, tr: boolean): { text: string; tone: string } | null {
  if (slip == null) return null;
  if (slip === 0) return { text: tr ? 'gününde' : 'on the day', tone: 'text-emerald-700' };
  if (slip < 0)
    return {
      text: tr ? `${-slip} gün erken` : `${-slip}d early`,
      tone: 'text-emerald-700',
    };
  return {
    text: tr ? `${slip} gün gecikmeli` : `${slip}d late`,
    tone: slip > 60 ? 'font-semibold text-rose-700' : 'text-amber-800',
  };
}

export const MilestonePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const milestones = usePlanMilestones();
  const phases = usePhases();
  const documents = useDocuments();
  const authority = useAuthority();

  const add = useAddMilestone();
  const move = useMoveTarget();
  const achieve = useAchieveMilestone();
  const miss = useMarkMissed();

  const mayKeep = actsAs(authority.data, ...PLAN_KEEPERS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    code: '',
    titleEn: '',
    phaseId: '',
    targetOn: '',
    critical: false,
  });

  const [closing, setClosing] = useState<{ id: string; how: 'achieved' | 'missed' } | null>(null);
  const [achievedOn, setAchievedOn] = useState(todayIso());
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState('');

  const rows = milestones.data ?? [];
  const overdue = rows.filter(
    (m) =>
      m.targetOn != null &&
      new Date(m.targetOn) < new Date() &&
      (m.state === 'planned' || m.state === 'in_progress'),
  ).length;
  const slipped = rows.filter((m) => (m.slipDays ?? 0) > 0);
  const worstSlip = slipped.reduce((worst, m) => Math.max(worst, m.slipDays ?? 0), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Kilometre taşları' : 'Milestones'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Hedef tarih ve gerçekleşen tarih iki ayrı kolon; gecikme ikisinin çıkarması. Tek tarih tutan bir sistem, çatının doksan gün geciktiğini söyleyemez.'
                : 'The target and the outcome are two columns, and the slip is the subtraction. A system that keeps one date cannot tell you the roof was ninety days late.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {overdue > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-900">
              <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {tr ? `${overdue} tarihi geçmiş` : `${overdue} past their target`}
            </Pill>
          )}
          {worstSlip > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `en büyük gecikme ${worstSlip} gün` : `worst slip ${worstSlip}d`}
            </Pill>
          )}
          {mayKeep && !adding && (
            <ActionButton onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Kilometre taşı ekle' : 'Add a milestone'}
            </ActionButton>
          )}
        </div>
      </header>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.titleEn.trim()) return;
            add.mutate(
              {
                titleEn: form.titleEn,
                code: form.code,
                phaseId: form.phaseId || null,
                targetOn: form.targetOn || null,
                critical: form.critical,
              },
              {
                onSuccess: () => {
                  setForm({ code: '', titleEn: '', phaseId: '', targetOn: '', critical: false });
                  setAdding(false);
                },
              },
            );
          }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
        >
          <Field label={tr ? 'Kod' : 'Code'}>
            <TextInput
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="MS-01"
            />
          </Field>
          <Field label={tr ? 'Hedef tarih' : 'Target date'}>
            <TextInput
              type="date"
              value={form.targetOn}
              onChange={(e) => setForm({ ...form, targetOn: e.target.value })}
            />
          </Field>
          <Field label={tr ? 'Kilometre taşı' : 'Milestone'} className="sm:col-span-2">
            <TextInput
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Faz' : 'Phase'}>
            <Select
              value={form.phaseId}
              onChange={(e) => setForm({ ...form, phaseId: e.target.value })}
            >
              <option value="">{tr ? '(faza bağlı değil)' : '(not in a phase)'}</option>
              {(phases.data ?? []).map((p) => (
                <option key={p.phaseId} value={p.phaseId}>
                  {(tr ? p.nameTr : p.nameEn) ?? p.nameEn}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Kritik mi' : 'Critical'}>
            <label className="flex items-center gap-2 pt-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.critical}
                onChange={(e) => setForm({ ...form, critical: e.target.checked })}
              />
              {/* Marking everything critical is the same as marking nothing,
                  so the label says what the flag costs. */}
              {tr
                ? 'Her ekranın üstündeki şeride çıksın'
                : 'Put it on the strip at the top of every screen'}
            </label>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <ActionButton type="submit" disabled={add.isPending}>
              {tr ? 'Plana ekle' : 'Add to the plan'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
            <div className="flex-1">
              <WriteError error={add.error} />
            </div>
          </div>
        </form>
      )}

      <QueryStatus queries={[milestones]} />
      <WriteError error={move.error} />
      <WriteError error={achieve.error} />
      <WriteError error={miss.error} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {tr
            ? 'Planda kilometre taşı yok. Portalda on beş modül var ama onları birbirine bağlayan zaman ekseni burada başlıyor — bir taş girilmeden ne geri sayım ne sapma hesaplanabilir.'
            : 'The plan has no milestones. The portal has fifteen registers and this is where the time axis joining them starts: without one, neither a countdown nor a variance can be computed.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((m) => {
            const slip = slipText(m.slipDays, tr);
            const past =
              m.targetOn != null &&
              new Date(m.targetOn) < new Date() &&
              (m.state === 'planned' || m.state === 'in_progress');
            const open = closing?.id === m.id;
            return (
              <li key={m.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.code && <span className="font-mono text-xs text-slate-500">{m.code}</span>}
                      <span className="text-sm font-medium text-slate-900">
                        <Bilingual
                          table="milestones"
                          id={m.id}
                          base="title"
                          en={m.titleEn}
                          tr={m.titleTr}
                        />
                      </span>
                      <Pill className={STATE[m.state].tone}>
                        {tr ? STATE[m.state].tr : STATE[m.state].en}
                      </Pill>
                      {m.critical && (
                        <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                          {tr ? 'kritik' : 'critical'}
                        </Pill>
                      )}
                      {past && (
                        <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                          {tr ? 'tarihi geçti' : 'past its target'}
                        </Pill>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {m.phaseName && <span>{m.phaseName}</span>}
                      {m.ownerName && <span>{m.ownerName}</span>}
                      <span className="font-mono">
                        {tr ? 'hedef ' : 'target '}
                        {m.targetOn ? formatDate(m.targetOn, language) : tr ? 'yok' : 'none'}
                      </span>
                      {m.achievedOn && (
                        <span className="font-mono">
                          {tr ? 'gerçekleşen ' : 'achieved '}
                          {formatDate(m.achievedOn, language)}
                        </span>
                      )}
                      {/* The subtraction, which is the number anybody wanted. */}
                      {slip ? (
                        <span className={slip.tone}>{slip.text}</span>
                      ) : (
                        m.state !== 'achieved' && (
                          <span className="text-slate-400">
                            {tr ? 'gecikme henüz bilinmiyor' : 'slip not known yet'}
                          </span>
                        )
                      )}
                    </div>
                    {m.note && <p className="mt-0.5 text-xs text-slate-600">{m.note}</p>}
                  </div>

                  {mayKeep && !open && m.state !== 'achieved' && m.state !== 'abandoned' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setClosing({ id: m.id, how: 'achieved' });
                          setAchievedOn(todayIso());
                          setEvidence('');
                        }}
                        className="flex cursor-pointer items-center gap-1 text-xs text-emerald-800 hover:underline"
                      >
                        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'ulaşıldı' : 'achieved'}
                      </button>
                      {m.targetOn && (
                        <button
                          type="button"
                          onClick={() => {
                            setClosing({ id: m.id, how: 'missed' });
                            setReason('');
                          }}
                          className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:underline"
                        >
                          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
                          {tr ? 'kaçırıldı' : 'missed'}
                        </button>
                      )}
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">
                          {tr ? 'Hedef tarihi değiştir' : 'Move the target date'}
                        </span>
                        <input
                          type="date"
                          value={m.targetOn ?? ''}
                          onChange={(e) =>
                            move.mutate({ id: m.id, targetOn: e.target.value || null })
                          }
                          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {open && closing.how === 'achieved' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!evidence) return;
                      achieve.mutate(
                        { id: m.id, achievedOn, evidenceDocumentId: evidence },
                        { onSuccess: () => setClosing(null) },
                      );
                    }}
                    className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2"
                  >
                    <Field label={tr ? 'Gerçekleşme tarihi' : 'Achieved on'}>
                      <TextInput
                        type="date"
                        value={achievedOn}
                        onChange={(e) => setAchievedOn(e.target.value)}
                        required
                      />
                    </Field>
                    {/* Required by the database, so it is asked for here
                        rather than discovered as a constraint name. */}
                    <Field label={tr ? 'Kanıt belgesi' : 'Evidence document'}>
                      <Select
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        required
                      >
                        <option value="">{tr ? 'kasadan seçin…' : 'choose from the vault…'}</option>
                        {(documents.data ?? []).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <ActionButton type="submit" disabled={achieve.isPending}>
                      {tr ? 'Kaydet' : 'Record it'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setClosing(null)}
                      className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                  </form>
                )}

                {open && closing.how === 'missed' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!reason.trim()) return;
                      miss.mutate(
                        { id: m.id, note: reason },
                        { onSuccess: () => setClosing(null) },
                      );
                    }}
                    className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2"
                  >
                    <Field label={tr ? 'Neden kaçırıldı' : 'Why it was missed'}>
                      <TextInput
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        autoFocus
                      />
                    </Field>
                    <ActionButton type="submit" disabled={miss.isPending}>
                      {tr ? 'Kaydet' : 'Record it'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setClosing(null)}
                      className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
