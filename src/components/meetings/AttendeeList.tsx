import React, { useState } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as meetings from '../../api/meetingHooks';
import { ATTENDANCE_ROLE_VALUES, attendanceRoleLabel } from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, WriteError } from '../ui/Controls';
import { NO_PARTY, PartyPicker, type PartyValue } from './PartyPicker';
import type { AttendanceRole } from '../../types';

/**
 * Who was in the room (M3-02).
 *
 * Attendees are records, not names typed into a box, and that has a
 * consequence beyond tidiness: being on this list is what lets somebody
 * outside the organisation read the meeting at all. It narrows scope — it
 * does not raise a clearance, so putting an advocate on a confidential
 * meeting still leaves it closed to them.
 */
export const AttendeeList: React.FC<{ meetingId: string; canKeep: boolean }> = ({
  meetingId,
  canKeep,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const attendees = meetings.useAttendees(meetingId);
  const add = meetings.useAddAttendee();
  const remove = meetings.useRemoveAttendee();

  const [adding, setAdding] = useState(false);
  const [party, setParty] = useState<PartyValue>(NO_PARTY);
  const [role, setRole] = useState<AttendanceRole>('participant');

  const rows = attendees.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Users className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Katılımcılar' : 'Who was there'}
          <Pill>{rows.length}</Pill>
        </h2>
        {canKeep && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="p-4">
        {adding && (
          <form
            className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!party.profileId && !party.stakeholderId) return;
              add.mutate(
                {
                  meetingId,
                  profileId: party.profileId,
                  stakeholderId: party.stakeholderId,
                  roleAtMeeting: role,
                },
                {
                  onSuccess: () => {
                    setParty(NO_PARTY);
                    setAdding(false);
                  },
                },
              );
            }}
          >
            <Field label={tr ? 'Kişi' : 'Person'} className="min-w-[180px] flex-1">
              <PartyPicker value={party} onChange={setParty} required />
            </Field>
            <Field label={tr ? 'Sıfat' : 'Role'}>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as AttendanceRole)}
                className="w-auto"
              >
                {ATTENDANCE_ROLE_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {attendanceRoleLabel(r, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <ActionButton type="submit" tone="primary" disabled={add.isPending}>
              {tr ? 'Ekle' : 'Add'}
            </ActionButton>
            <ActionButton type="button" onClick={() => setAdding(false)} disabled={add.isPending}>
              {tr ? 'Vazgeç' : 'Cancel'}
            </ActionButton>
            <WriteError error={add.error} />
          </form>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Katılımcı kaydedilmemiş.' : 'Nobody recorded.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {rows.map((attendee) => (
              <li
                key={attendee.id}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1"
              >
                <span className="text-xs text-slate-800">
                  {attendee.name ?? (tr ? 'bilinmiyor' : 'unknown')}
                </span>
                <span className="text-xs text-slate-400">
                  {attendanceRoleLabel(attendee.roleAtMeeting, language)}
                </span>
                {attendee.stakeholderId && (
                  <span className="text-xs text-teal-700">{tr ? 'dış' : 'external'}</span>
                )}
                {canKeep && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(attendee.id)}
                    disabled={remove.isPending}
                    aria-label={tr ? 'Çıkar' : 'Remove'}
                    className="cursor-pointer rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <WriteError error={remove.error} />
      </div>
    </section>
  );
};
