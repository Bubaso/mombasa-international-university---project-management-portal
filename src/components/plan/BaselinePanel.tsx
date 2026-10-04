/**
 * Baseline and variance (M15-06).
 *
 * "6 ay önce ne demiştik, şimdi neredeyiz?" is only answerable if somebody
 * wrote down what was said six months ago, so a baseline freezes every
 * milestone's target and is then append-only. A baseline that can be edited
 * is the current plan wearing an old date.
 *
 * The panel keeps two numbers apart, and that separation is the whole value:
 *
 *   how far the DATE was moved     — the plan slipping
 *   how late the THING actually was — delivery slipping
 *
 * A project that moves its target four times and then reports everything
 * delivered on time is exploiting the fact that most systems only keep the
 * second. This one keeps both and shows them in adjacent columns.
 */
import React, { useState } from 'react';
import { Explain } from '../ui/Explain';
import { Bilingual } from '../ui/Bilingual';
import { CameraOff, History, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useBaselines, useTakeBaseline, useVariance } from '../../api/planHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
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
} from '../ui/Controls';
import { actsAs } from '../../lib/authority';
import { formatDate } from '../../lib/site';
import type { UserRole } from '../../types';

const PLAN_KEEPERS: UserRole[] = [
  'admin',
  'project_director',
  'trustee',
  'board_director',
  'field_team',
];

/** Days a date was moved, said in words rather than as a signed integer. */
function movedText(days: number | null, tr: boolean): { text: string; tone: string } {
  if (days == null)
    return { text: tr ? 'karşılaştırılamaz' : 'nothing to compare', tone: 'text-slate-500' };
  if (days === 0) return { text: tr ? 'değişmedi' : 'unmoved', tone: 'text-slate-500' };
  if (days < 0)
    return {
      text: tr ? `${-days} gün öne alındı` : `pulled in ${-days}d`,
      tone: 'text-emerald-700',
    };
  return {
    text: tr ? `${days} gün ertelendi` : `pushed out ${days}d`,
    tone: days > 90 ? 'font-semibold text-rose-700' : 'text-amber-800',
  };
}

export const BaselinePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const baselines = useBaselines();
  const authority = useAuthority();
  const take = useTakeBaseline();

  const mayKeep = actsAs(authority.data, ...PLAN_KEEPERS);
  const list = baselines.data ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const active = chosen ?? list[0]?.id ?? null;
  const variance = useVariance(active);
  // Which baseline the numbers below are measured against. With one on
  // record there is nothing to choose between, but the columns still have to
  // say what they are compared with — a variance against an unnamed baseline
  // is a number with no referent.
  const against = list.find((b) => b.id === active) ?? null;

  const [taking, setTaking] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const rows = variance.data ?? [];
  const pushed = rows.filter((r) => (r.targetMovedDays ?? 0) > 0);
  const totalPush = pushed.reduce((sum, r) => sum + (r.targetMovedDays ?? 0), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Temel plan ve sapma' : 'Baseline and variance'}
            </h2>
            <Explain id="plan.baseline">
              {tr
                ? '“Altı ay önce ne demiştik?” — tarihin ne kadar ertelendiği ile işin ne kadar geciktiği iki ayrı kolon. Hedefini dört kez erteleyip “zamanında” diyen bir proje tam olarak bu ikisinin karıştırılmasından yararlanıyor.'
                : '“What did we say six months ago?” How far the date was pushed and how late the thing was are separate columns. A project that moves its target four times and reports on time is exploiting the conflation of the two.'}
            </Explain>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {list.length === 1 && against && (
            <span className="text-xs text-slate-600">
              {tr ? 'karşılaştırılan: ' : 'measured against '}
              <span className="font-semibold text-slate-800">{against.name}</span>
              {' · '}
              <span className="font-mono">{formatDate(against.takenOn, language)}</span>
            </span>
          )}
          {list.length > 1 && (
            <Select
              value={active ?? ''}
              onChange={(e) => setChosen(e.target.value)}
              aria-label={tr ? 'Temel plan' : 'Baseline'}
            >
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {formatDate(b.takenOn, language)}
                </option>
              ))}
            </Select>
          )}
          {mayKeep && !taking && (
            <ActionButton onClick={() => setTaking(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Temel plan al' : 'Take a baseline'}
            </ActionButton>
          )}
        </div>
      </header>

      {taking && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            take.mutate(
              { name, note },
              {
                onSuccess: () => {
                  setName('');
                  setNote('');
                  setTaking(false);
                  setChosen(null);
                },
              },
            );
          }}
          className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <Field label={tr ? 'Adı' : 'Name it'}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr ? 'Şubat mütevelli planı' : 'February board plan'}
              required
            />
          </Field>
          <Field label={tr ? 'Not' : 'Note'}>
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ActionButton type="submit" disabled={take.isPending}>
            {tr ? 'Planı dondur' : 'Freeze the plan'}
          </ActionButton>
          <button
            type="button"
            onClick={() => setTaking(false)}
            className="cursor-pointer pb-1 text-xs text-slate-500 underline"
          >
            {tr ? 'vazgeç' : 'cancel'}
          </button>
          <p className="flex w-full items-center gap-1 text-xs text-amber-800">
            <CameraOff className="h-3 w-3" aria-hidden="true" />
            {tr
              ? 'Alındıktan sonra değiştirilemez — düzeltilebilen bir temel plan, eski tarih takmış güncel plandır.'
              : 'Once taken it cannot be edited — a baseline that can be changed is the current plan wearing an old date.'}
          </p>
          <div className="w-full">
            <WriteError error={take.error} />
          </div>
        </form>
      )}

      <QueryStatus queries={[baselines, variance]} />

      {list.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Henüz temel plan alınmamış. “Altı ay önce ne demiştik” sorusunun cevabı, altı ay önce birinin bunu kaydetmiş olmasına bağlı — bugün alınan bir plan, altı ay sonra o cevabı verir.'
            : 'No baseline has been taken. The answer to “what did we say six months ago” depends on somebody having written it down six months ago — one taken today answers it six months from now.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          {tr ? 'Bu temel planda kayıt yok.' : 'This baseline holds no milestones.'}
        </p>
      ) : (
        <>
          {totalPush > 0 && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {tr
                ? `Bu temel plandan bu yana ${pushed.length} tarih toplam ${totalPush} gün ertelendi.`
                : `Since this baseline, ${pushed.length} ${pushed.length === 1 ? 'date has' : 'dates have'} been pushed out by ${totalPush} days in total.`}
            </p>
          )}
          <TableFrame
            head={
              <tr>
                <Th>{tr ? 'Kilometre taşı' : 'Milestone'}</Th>
                <Th>{tr ? 'O günkü hedef' : 'Target then'}</Th>
                <Th>{tr ? 'Bugünkü hedef' : 'Target now'}</Th>
                <Th>{tr ? 'Tarih ne kadar oynadı' : 'How far the date moved'}</Th>
                <Th>{tr ? 'Teslim gecikmesi' : 'Delivery slip'}</Th>
              </tr>
            }
          >
            {rows.map((row) => {
              const moved = movedText(row.targetMovedDays, tr);
              return (
                <tr key={row.milestoneId} className="hover:bg-slate-50">
                  <Td>
                    {row.code && (
                      <span className="mr-1.5 font-mono text-xs text-slate-500">{row.code}</span>
                    )}
                    <span className="text-sm text-slate-900">
                      <Bilingual
                        table="milestones"
                        id={row.milestoneId}
                        base="title"
                        en={row.titleEn}
                        tr={row.titleTr}
                      />
                    </span>
                    {row.baselineState !== row.currentState && (
                      <Pill className="ml-1.5 border-sky-300 bg-sky-50 text-sky-900">
                        {row.baselineState} → {row.currentState}
                      </Pill>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-600">
                      {row.baselineTarget ? formatDate(row.baselineTarget, language) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-600">
                      {row.currentTarget ? formatDate(row.currentTarget, language) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className={`text-xs ${moved.tone}`}>{moved.text}</span>
                  </Td>
                  <Td>
                    {/* The second number, and null is not nought: a milestone
                        that has not been delivered has no delivery slip. */}
                    <span className="text-xs text-slate-600">
                      {row.deliverySlipDays == null
                        ? tr
                          ? 'teslim edilmedi'
                          : 'not delivered'
                        : row.deliverySlipDays > 0
                          ? tr
                            ? `${row.deliverySlipDays} gün gecikmeli`
                            : `${row.deliverySlipDays}d late`
                          : row.deliverySlipDays < 0
                            ? tr
                              ? `${-row.deliverySlipDays} gün erken`
                              : `${-row.deliverySlipDays}d early`
                            : tr
                              ? 'gününde'
                              : 'on the day'}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </TableFrame>
        </>
      )}
    </section>
  );
};
