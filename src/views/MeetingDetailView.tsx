import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Link2, Lock, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as meetings from '../api/meetingHooks';
import { useAuthority } from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { AttendeeList } from '../components/meetings/AttendeeList';
import { NoteEditor } from '../components/meetings/NoteEditor';
import { DecisionList } from '../components/meetings/DecisionList';
import { ActionList } from '../components/meetings/ActionList';
import { QuestionList } from '../components/meetings/QuestionList';
import {
  ASSESSORS,
  MINUTE_KEEPERS,
  actsAs,
  clearanceLabel,
  clearanceStyle,
} from '../lib/authority';
import {
  MEETING_STATUS_VALUES,
  MINUTES_STATUS_STYLES,
  MINUTES_STATUS_VALUES,
  meetingKindLabel,
  meetingStatusLabel,
  minutesStatusLabel,
} from '../lib/meetings';
import { ActionButton, Field, Pill, Select, WriteError } from '../components/ui/Controls';
import type { MeetingStatus, MinutesStatus } from '../types';

/**
 * One meeting, and everything that came out of it.
 *
 * The note is kept above the records drawn from it, because the note is what
 * was written at the time and the records are what can be chased. Both are
 * needed: a system that keeps only the note cannot follow anything up, and one
 * that keeps only the records loses what was actually said.
 */
export const MeetingDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';

  const meetingQuery = meetings.useMeeting(id);
  const authority = useAuthority();
  const update = meetings.useUpdateMeeting();

  const canKeep = actsAs(authority.data, ...MINUTE_KEEPERS);
  const canDecide = actsAs(authority.data, ...ASSESSORS);
  const meeting = meetingQuery.data;

  const [confirmingFinal, setConfirmingFinal] = useState(false);

  if (meetingQuery.isPending) return <QueryStatus queries={[meetingQuery]} />;

  if (!meeting) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/meetings')} />
        <EmptyState
          icon={CalendarDays}
          title={tr ? 'Bu toplantı görünmüyor' : 'This meeting is not visible'}
          description={
            tr
              ? 'Kayıt silinmiş olabilir, ya da bu toplantıyı görmeye yetkiniz yok. Kurum dışındaysanız yalnızca katıldığınız toplantıları görürsünüz.'
              : 'It may have been deleted, or it may not be yours to see. From outside the organisation you read only the meetings you were in.'
          }
        />
      </div>
    );
  }

  const locked = meeting.minutesStatus === 'final';

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate('/meetings')} />

      <header className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900">{meeting.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span className="font-mono">{meeting.heldAt.slice(0, 16).replace('T', ' ')}</span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {meeting.location}
                </span>
              )}
              {meeting.preparedByName && (
                <span>
                  {tr ? 'hazırlayan: ' : 'prepared by: '}
                  {meeting.preparedByName}
                </span>
              )}
              {meeting.continuesMeetingId && (
                <button
                  type="button"
                  onClick={() => navigate(`/meetings/${meeting.continuesMeetingId}`)}
                  className="flex cursor-pointer items-center gap-1 font-medium text-amber-700 hover:text-amber-900"
                >
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  {tr ? 'devamı olduğu toplantı' : 'continues from'}
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Pill>{meetingKindLabel(meeting.kind, language)}</Pill>
            <Pill className={MINUTES_STATUS_STYLES[meeting.minutesStatus]}>
              {minutesStatusLabel(meeting.minutesStatus, language)}
            </Pill>
            <Pill className={clearanceStyle(meeting.confidentiality)}>
              {clearanceLabel(meeting.confidentiality, language)}
            </Pill>
          </div>
        </div>

        {canKeep && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <Field label={tr ? 'Toplantı durumu' : 'Meeting status'}>
              <Select
                value={meeting.status}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({
                    id: meeting.id,
                    changes: { status: e.target.value as MeetingStatus },
                  })
                }
                className="w-auto"
              >
                {MEETING_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {meetingStatusLabel(s, language)}
                  </option>
                ))}
              </Select>
            </Field>

            {locked ? (
              <p className="flex items-center gap-1.5 pb-1.5 text-[11px] text-slate-500">
                <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                {tr
                  ? 'Tutanak kesinleşti. Düzeltme, yeni bir zeyilnamedir; bu kayıt artık değişmez.'
                  : 'The minutes are final. A correction is an addendum; this record no longer changes.'}
              </p>
            ) : confirmingFinal ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                <p className="text-[11px] text-amber-900">
                  {tr
                    ? 'Kesinleştirince tutanak bir daha düzenlenemez ve taslağa geri alınamaz.'
                    : 'Once final, the minutes cannot be edited or put back into draft.'}
                </p>
                <ActionButton onClick={() => setConfirmingFinal(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
                <ActionButton
                  tone="primary"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { id: meeting.id, changes: { minutesStatus: 'final' } },
                      { onSuccess: () => setConfirmingFinal(false) },
                    )
                  }
                >
                  {tr ? 'Kesinleştir' : 'Make it final'}
                </ActionButton>
              </div>
            ) : (
              <>
                <Field label={tr ? 'Tutanak' : 'Minutes'}>
                  <Select
                    value={meeting.minutesStatus}
                    disabled={update.isPending}
                    onChange={(e) => {
                      const next = e.target.value as MinutesStatus;
                      if (next === 'final') return setConfirmingFinal(true);
                      update.mutate({ id: meeting.id, changes: { minutesStatus: next } });
                    }}
                    className="w-auto"
                  >
                    {MINUTES_STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>
                        {minutesStatusLabel(s, language)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
        )}
        <WriteError error={update.error} />
      </header>

      <AttendeeList meetingId={meeting.id} canKeep={canKeep} />

      <NoteEditor meetingId={meeting.id} minutesStatus={meeting.minutesStatus} canEdit={canKeep} />

      <DecisionList
        meetingId={meeting.id}
        canDecide={canDecide}
        confidentiality={meeting.confidentiality}
      />

      <ActionList
        meetingId={meeting.id}
        canKeep={canKeep}
        confidentiality={meeting.confidentiality}
      />

      <QuestionList
        meetingId={meeting.id}
        canKeep={canKeep}
        confidentiality={meeting.confidentiality}
      />
    </div>
  );
};

const BackLink: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { language } = useApp();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {language === 'tr' ? 'Toplantılar' : 'All meetings'}
    </button>
  );
};
