/**
 * Who was reached, and who is in the room (M11-08, M11-04).
 *
 * The reach table answers a governance question — "was the board told?" — and
 * not a social one. It exists only for announcements, only for whoever may
 * make them, and its denominator is the people who could see the announcement
 * at all. "3 of 9" means three of the nine who can read it, not three of
 * everybody with an account; a percentage of the wrong denominator is how a
 * half-read notice comes to look like a well-read one.
 *
 * Underneath it, channel membership. Membership widens the default that comes
 * from somebody's role — it never narrows it — so this list is short by
 * design: it holds the exceptions, the people who need to be in a
 * conversation their role would not have put them in.
 */
import React, { useState } from 'react';
import { Eye, UserPlus, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAddChannelMember, useAnnouncementReach, useChannelMembers } from '../../api/commsHooks';
import { useProfiles } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { CHANNELS, channelName } from '../../lib/comms';
import { formatDate } from '../../lib/site';
import type { CommChannel } from '../../types';
import { MoreRows } from '../ui/MoreRows';

export const ReachPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 20;
  const [limit, setLimit] = React.useState(20);
  const reach = useAnnouncementReach(limit);
  const members = useChannelMembers();
  const people = useProfiles();
  const addMember = useAddChannelMember();

  const [adding, setAdding] = useState(false);
  const [channel, setChannel] = useState<CommChannel>('trustee');
  const [profileId, setProfileId] = useState('');
  const [note, setNote] = useState('');

  const announcements = reach.data?.rows ?? [];
  const rows = members.data ?? [];

  // The reach view is visible only to those who may announce, so an empty
  // result here means either "you do not announce" or "nothing urgent has
  // been announced" — and the panel does not pretend to tell them apart.
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {tr ? 'Duyuru ulaştı mı, kim nerede' : 'Reach and membership'}
          </h2>
          <p className="max-w-2xl text-xs text-slate-500">
            {tr
              ? 'Payda, duyuruyu görebilecek kişiler — hesabı olan herkes değil.'
              : 'The denominator is who could see the announcement — not everyone with an account.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[reach, members]} />

      {announcements.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {announcements.map((a) => {
            const share = a.couldSee > 0 ? Math.round((100 * a.seen) / a.couldSee) : null;
            return (
              <li key={a.threadId} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {a.title}
                  </span>
                  {a.urgent && (
                    <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                      {tr ? 'acil' : 'urgent'}
                    </Pill>
                  )}
                  <Pill
                    className={
                      share != null && share >= 80
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }
                  >
                    {a.seen}/{a.couldSee}
                    {share != null && ` · ${share}%`}
                  </Pill>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{channelName(a.channel, tr)}</span>
                  <span className="font-mono">{formatDate(a.createdAt, language)}</span>
                </div>
                {a.seenBy.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    {tr ? 'gören: ' : 'seen by: '}
                    {a.seenBy.join(', ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {tr ? 'Adıyla eklenenler' : 'Added by name'}
        </h3>
        {!adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Kanala kişi ekle' : 'Add somebody to a channel'}
          </ActionButton>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!profileId) return;
            addMember.mutate(
              { channel, profileId, note },
              {
                onSuccess: () => {
                  setAdding(false);
                  setProfileId('');
                  setNote('');
                },
              },
            );
          }}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <Field label={tr ? 'Kanal' : 'Channel'}>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as CommChannel)}>
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {tr ? c.tr : c.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Kişi' : 'Person'}>
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)} required>
              <option value="">{tr ? 'seçin…' : 'choose…'}</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Neden' : 'Why'}>
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr ? 'Teklifleri ölçüyor' : 'Measuring the fee proposals'}
            />
          </Field>
          <ActionButton type="submit" disabled={addMember.isPending}>
            {tr ? 'Ekle' : 'Add'}
          </ActionButton>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="cursor-pointer pb-1 text-xs text-slate-500 underline"
          >
            {tr ? 'vazgeç' : 'cancel'}
          </button>
          <div className="w-full">
            <WriteError error={addMember.error} />
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {tr
            ? 'Kimse adıyla eklenmemiş — herkes kanallarda rolü üzerinden duruyor, ki olağan olan budur.'
            : 'Nobody has been added by name; everybody is in their channels by role, which is the ordinary case.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((m) => (
            <li
              key={`${m.channel}-${m.profileId}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <Pill className="border-indigo-300 bg-indigo-50 text-indigo-900">
                {channelName(m.channel, tr)}
              </Pill>
              <span className="text-sm text-slate-900">
                {m.fullName ?? m.profileId.slice(0, 8)}
              </span>
              {m.note && <span className="text-xs text-slate-500">{m.note}</span>}
              <span className="ml-auto font-mono text-xs text-slate-500">
                {formatDate(m.addedAt, language)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <MoreRows
        shown={(reach.data?.rows ?? []).length}
        total={reach.data?.total ?? 0}
        onMore={() => setLimit(limit + PAGE)}
        busy={reach.isFetching}
      />
    </section>
  );
};
