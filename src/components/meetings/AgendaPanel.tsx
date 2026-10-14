import React from 'react';
import { ListChecks, CircleAlert, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useAgenda } from '../../api/meetingHooks';
import { useProfiles } from '../../api/adminHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import {
  PRIORITY_STYLES,
  bilingual,
  bilingualFrom,
  daysUntil,
  priorityLabel,
} from '../../lib/meetings';
import { useMachineMarks } from '../../api/translateHooks';
import { MachineBadge } from '../ui/MachineBadge';
import { Pill } from '../ui/Controls';
import { EmptyState } from '../EmptyState';

/**
 * Everything still open, which is where the next meeting starts (M3-07).
 *
 * The team's meeting notes are already written with discipline; what does not
 * happen is the next step. An action with no owner and no date cannot be late,
 * so it is never chased, and by the following meeting it has quietly stopped
 * existing. This list is the answer: the only way off it is to finish the
 * thing or to say out loud that it is cancelled.
 */
export const AgendaPanel: React.FC<{ limit?: number; compact?: boolean }> = ({
  limit,
  compact = false,
}) => {
  const { language } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tr = language === 'tr';

  const agenda = useAgenda();
  const profiles = useProfiles();
  const stakeholders = useStakeholders();

  const ownerName = (profileId: string | null, stakeholderId: string | null): string | null => {
    if (profileId && profileId === user?.id) return tr ? 'siz' : 'you';
    if (profileId) return (profiles.data ?? []).find((p) => p.id === profileId)?.fullName ?? null;
    if (stakeholderId) {
      return (stakeholders.data ?? []).find((s) => s.id === stakeholderId)?.fullName ?? null;
    }
    return null;
  };

  const all = agenda.data ?? [];
  const sorted = [...all].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
  });
  const shown = limit ? sorted.slice(0, limit) : sorted;

  // The agenda mixes two registers, so it takes two queries. Both are asked
  // for the screenful at once, and `item_kind` decides which answer applies.
  const actionMarks = useMachineMarks(
    'action_items',
    shown.filter((i) => i.itemKind === 'action').map((i) => i.id),
  );
  const questionMarks = useMachineMarks(
    'open_questions',
    shown.filter((i) => i.itemKind === 'question').map((i) => i.id),
  );
  const machineWritten = (item: (typeof shown)[number]): boolean => {
    const side = bilingualFrom(item.textEn, item.textTr, language).side;
    return item.itemKind === 'action'
      ? actionMarks.is(item.id, 'text', side)
      : questionMarks.is(item.id, 'question', side);
  };
  const overdue = all.filter((i) => i.overdue).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {tr ? 'Bir sonraki gündem' : 'The next agenda'}
            </h2>
            {!compact && (
              <p className="text-sm text-slate-500">
                {tr
                  ? 'Kapanmamış her aksiyon ve cevaplanmamış her soru.'
                  : 'Every action still open and every question still unanswered.'}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {overdue > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-800">
              {tr ? `${overdue} gecikmiş` : `${overdue} overdue`}
            </Pill>
          )}
          <Pill>{tr ? `${all.length} açık` : `${all.length} open`}</Pill>
        </div>
      </header>

      <div className="p-4">
        {shown.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={tr ? 'Açık iş yok' : 'Nothing open'}
            description={
              tr
                ? 'Her aksiyon kapanmış ve cevapsız soru kalmamış. Yeni toplantı kaydı açıldıkça buraya düşerler.'
                : 'Every action is closed and no question is waiting. New ones land here as meetings are recorded.'
            }
          />
        ) : (
          <ul className="space-y-1.5">
            {shown.map((item) => {
              const days = daysUntil(item.dueOn);
              const who = ownerName(item.ownerProfileId, item.ownerStakeholderId);
              const Icon = item.itemKind === 'question' ? HelpCircle : CircleAlert;
              return (
                <li key={`${item.itemKind}-${item.id}`}>
                  <button
                    type="button"
                    disabled={!item.raisedAtMeetingId}
                    onClick={() =>
                      item.raisedAtMeetingId && navigate(`/meetings/${item.raisedAtMeetingId}`)
                    }
                    className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left ${
                      item.overdue
                        ? 'border-rose-200 bg-rose-50/60'
                        : 'border-slate-200 hover:bg-slate-50'
                    } ${item.raisedAtMeetingId ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <Icon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        item.overdue ? 'text-rose-600' : 'text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-900">
                        {bilingual(item.textEn, item.textTr, language)}
                        {machineWritten(item) && <MachineBadge className="ml-1.5" />}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        {who && (
                          <span>
                            {tr ? 'sorumlu: ' : 'owner: '}
                            <span className="font-medium text-slate-700">{who}</span>
                          </span>
                        )}
                        {item.dueOn && (
                          <span className={item.overdue ? 'font-medium text-rose-700' : ''}>
                            {/*
                              Kelime SAYININ İŞARETİNE bağlı, `overdue`
                              bayrağına değil. İkisi ayrı kaynaktan geliyor —
                              `overdue` sunucudan, `days` burada
                              `daysUntil`'den — ve ayrışabiliyorlar: tarihi
                              geçmiş ama bayrağı düşmemiş bir kayıt ekrana
                              "−236 gün kaldı" yazıyordu. Mütevelli
                              kütüğündeki kusurun aynısı (TrusteeRegister):
                              işaretli bir sayı yanlış okunur ve **zaman
                              varmış gibi** görünür. Bayrak rengi seçer,
                              aritmetik kelimeyi seçer.
                            */}
                            {(days ?? 0) < 0
                              ? tr
                                ? `${Math.abs(days ?? 0)} gün gecikti`
                                : `${Math.abs(days ?? 0)} days late`
                              : tr
                                ? `${days} gün kaldı`
                                : `${days} days left`}
                          </span>
                        )}
                        {item.itemKind === 'question' && (
                          <span className="italic">{tr ? 'açık soru' : 'open question'}</span>
                        )}
                      </span>
                    </span>
                    {item.priority !== 'normal' && (
                      <Pill className={PRIORITY_STYLES[item.priority]}>
                        {priorityLabel(item.priority, language)}
                      </Pill>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {limit && all.length > limit && (
          <button
            type="button"
            onClick={() => navigate('/meetings')}
            className="mt-2 cursor-pointer text-xs font-semibold text-amber-700 hover:text-amber-900"
          >
            {tr ? `Kalan ${all.length - limit} maddeyi gör` : `See the other ${all.length - limit}`}
          </button>
        )}
      </div>
    </section>
  );
};
