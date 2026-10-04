/**
 * The three organs, and whether their sittings were competent (M10-02).
 *
 * The quorum column is the reason this panel exists. A quorum rule that lives
 * in somebody's memory of the trust deed is a rule that gets remembered
 * conveniently; one held as data can be tested against the attendance, which
 * is what the three numbers on each sitting are.
 *
 * Where no rule has been recorded the verdict is "cannot tell", in as many
 * words. Printing "short" there would send somebody looking for absentees
 * when the gap is in the transcription of the deed.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Plus, Scale, Trash2, UserMinus, Users2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useEndSeat,
  useMemberships,
  useOrgans,
  useRemoveSeat,
  useSeatOnOrgan,
  useSetQuorumRule,
  useSittings,
  useTrusteeRegister,
} from '../../api/governanceHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { GOVERNANCE_KEEPERS, actsAs } from '../../lib/authority';
import { todayIso } from '../../lib/date';
import { cadenceLabel, organLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';
import { MoreRows } from '../ui/MoreRows';

export const OrganPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const organs = useOrgans();
  const PAGE = 12;
  const [sittingLimit, setSittingLimit] = useState(PAGE);
  const sittings = useSittings(sittingLimit);
  const [open, setOpen] = useState<string | null>(null);
  const members = useMemberships(open);
  const register = useTrusteeRegister();
  const authority = useAuthority();
  const seat = useSeatOnOrgan();
  const endSeat = useEndSeat();
  const removeSeat = useRemoveSeat();
  const setQuorum = useSetQuorumRule();

  const mayKeep = actsAs(authority.data, ...GOVERNANCE_KEEPERS);
  const [seating, setSeating] = useState(false);
  const [seatForm, setSeatForm] = useState({
    trusteeId: '',
    label: '',
    voting: 'yes',
    startedOn: todayIso(),
  });
  const [ending, setEnding] = useState<string | null>(null);
  const [endOn, setEndOn] = useState(todayIso());
  const [ruleFor, setRuleFor] = useState<string | null>(null);
  const [rule, setRule] = useState({ members: '', fraction: '' });

  /** Only trustees still serving can take a new seat. */
  const serving = (register.data ?? []).filter((t) => t.active);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {tr ? 'Organlar ve nisap' : 'The organs and their quorum'}
          </h2>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Nisap kuralı veri olarak tutuluyor, böylece oturumun karar almaya yetkili olup olmadığı yoklamaya bakılarak söylenebiliyor.'
              : 'The quorum rule is held as data, so whether a sitting was competent to decide can be read off the attendance.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[organs]} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(organs.data ?? []).map((organ) => {
          const selected = open === organ.id;
          return (
            <button
              key={organ.id}
              type="button"
              onClick={() => setOpen(selected ? null : organ.id)}
              aria-pressed={selected}
              className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">
                {tr ? organ.nameTr : organ.nameEn}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {organ.memberCount} {tr ? 'üye' : organ.memberCount === 1 ? 'member' : 'members'}
                {organ.cadence ? ` · ${cadenceLabel(organ.cadence, language)}` : ''}
              </p>
              <p className="mt-1 text-xs">
                {organ.quorumMembers == null && organ.quorumFraction == null ? (
                  <span className="text-amber-800">
                    {tr ? 'nisap kuralı kayıtlı değil' : 'no quorum rule recorded'}
                  </span>
                ) : (
                  <span className="font-mono text-slate-600">
                    {tr ? 'nisap: ' : 'quorum: '}
                    {[
                      organ.quorumMembers != null ? `${organ.quorumMembers}` : null,
                      organ.quorumFraction != null
                        ? `${Math.round(organ.quorumFraction * 100)}%`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(tr ? ' veya ' : ' or ')}
                  </span>
                )}
              </p>
              {organ.charterClause && (
                <p className="mt-1 text-xs text-slate-500">
                  {tr ? 'senet md. ' : 'deed cl. '}
                  {organ.charterClause}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Recording the rule. governance_organs has had its update policy since
          0021 and nothing called it, so every organ's quorum stayed null and
          every sitting read "cannot tell" — the panel was reporting the absence
          of a rule nobody had a way to enter. */}
      {mayKeep && open && (
        <div className="mt-2">
          {ruleFor === open ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQuorum.mutate(
                  {
                    organId: open,
                    quorumMembers: rule.members === '' ? null : Number(rule.members),
                    quorumFraction: rule.fraction === '' ? null : Number(rule.fraction) / 100,
                  },
                  { onSuccess: () => setRuleFor(null) },
                );
              }}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
            >
              {/* Either alone, or both: a deed may say "five members", "half
                  the seats", or both. Left empty they stay null, which is
                  "nobody has transcribed the rule" and not "no quorum". */}
              <Field label={tr ? 'En az üye sayısı' : 'Minimum members'}>
                <TextInput
                  type="number"
                  min="1"
                  value={rule.members}
                  onChange={(e) => setRule({ ...rule, members: e.target.value })}
                  placeholder={tr ? 'boş = kayıtlı değil' : 'empty = not recorded'}
                />
              </Field>
              <Field label={tr ? 'Koltukların yüzdesi' : 'Share of the seats (%)'}>
                <TextInput
                  type="number"
                  min="1"
                  max="100"
                  value={rule.fraction}
                  onChange={(e) => setRule({ ...rule, fraction: e.target.value })}
                  placeholder={tr ? 'boş = kayıtlı değil' : 'empty = not recorded'}
                />
              </Field>
              <ActionButton type="submit" disabled={setQuorum.isPending}>
                {tr ? 'Nisap kuralını kaydet' : 'Record the quorum rule'}
              </ActionButton>
              <button
                type="button"
                onClick={() => setRuleFor(null)}
                className="cursor-pointer pb-1 text-xs text-slate-500 underline"
              >
                {tr ? 'vazgeç' : 'cancel'}
              </button>
              <div className="w-full">
                <WriteError error={setQuorum.error} />
              </div>
            </form>
          ) : (
            <ActionButton
              onClick={() => {
                const organ = (organs.data ?? []).find((o) => o.id === open);
                setRule({
                  members: organ?.quorumMembers != null ? String(organ.quorumMembers) : '',
                  fraction:
                    organ?.quorumFraction != null
                      ? String(Math.round(organ.quorumFraction * 100))
                      : '',
                });
                setRuleFor(open);
              }}
            >
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Nisap kuralını kaydet' : 'Record the quorum rule'}
            </ActionButton>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
              {tr ? 'Koltuklar' : 'Seats'}
            </p>
          </div>
          <QueryStatus queries={[members]} />
          {(members.data ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">
              {tr
                ? 'Bu organa henüz kimse atanmamış — nisap da bu yüzden hesaplanamıyor.'
                : 'Nobody is seated on this organ yet, which is also why no quorum can be computed for it.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {(members.data ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-sm text-slate-900">
                    {row.name ?? (tr ? '(isim yok)' : '(unnamed)')}
                  </span>
                  {row.seat && <Pill>{row.seat}</Pill>}
                  {!row.voting && (
                    <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                      {tr ? 'oy yok' : 'non-voting'}
                    </Pill>
                  )}
                  <span className="font-mono text-xs text-slate-500">
                    {formatDate(row.startedOn, language)}
                    {row.endedOn ? ` → ${formatDate(row.endedOn, language)}` : ''}
                  </span>

                  {/* Ending a seat is a date, not a deletion: the quorum for a
                      sitting held in March is computed from who held a seat in
                      March, so a seat that simply disappears rewrites it. */}
                  {mayKeep && row.endedOn == null && ending !== row.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEnding(row.id);
                        setEndOn(todayIso());
                      }}
                      className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-rose-700"
                    >
                      <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'koltuğu bitir' : 'end the seat'}
                    </button>
                  )}

                  {ending === row.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        endSeat.mutate(
                          { id: row.id, on: endOn },
                          { onSuccess: () => setEnding(null) },
                        );
                      }}
                      className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2"
                    >
                      <Field label={tr ? 'Bitiş tarihi' : 'Ended on'}>
                        <TextInput
                          type="date"
                          value={endOn}
                          onChange={(e) => setEndOn(e.target.value)}
                          required
                        />
                      </Field>
                      <ActionButton type="submit" disabled={endSeat.isPending}>
                        {tr ? 'Kaydet' : 'Record it'}
                      </ActionButton>
                      {/* A seat recorded by mistake, as against one that ended.
                          An administrator's, because it is the only act here
                          that changes what a past sitting was measured
                          against. */}
                      <button
                        type="button"
                        onClick={() =>
                          removeSeat.mutate(row.id, { onSuccess: () => setEnding(null) })
                        }
                        disabled={removeSeat.isPending}
                        className="flex cursor-pointer items-center gap-1 pb-1 text-xs text-rose-700 underline"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'yanlış girildi, kaydı sil' : 'entered by mistake, delete it'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnding(null)}
                        className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                      >
                        {tr ? 'vazgeç' : 'cancel'}
                      </button>
                      <div className="w-full">
                        <WriteError error={endSeat.error || removeSeat.error} />
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Seating somebody. organ_memberships has had its insert policy
              since 0021 and nothing in the portal ever called it, so a trustee
              could be entered in the register and never seated anywhere —
              which is why the quorum rule had nothing to be tested against. */}
          {mayKeep && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              {seating ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!seatForm.trusteeId) return;
                    seat.mutate(
                      {
                        organId: open,
                        trusteeId: seatForm.trusteeId,
                        seat: seatForm.label,
                        voting: seatForm.voting === 'yes',
                        startedOn: seatForm.startedOn,
                      },
                      {
                        onSuccess: () => {
                          setSeatForm({
                            trusteeId: '',
                            label: '',
                            voting: 'yes',
                            startedOn: todayIso(),
                          });
                          setSeating(false);
                        },
                      },
                    );
                  }}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <Field label={tr ? 'Mütevelli' : 'Trustee'}>
                    <Select
                      value={seatForm.trusteeId}
                      onChange={(e) => setSeatForm({ ...seatForm, trusteeId: e.target.value })}
                      required
                    >
                      <option value="">{tr ? 'seçin…' : 'choose…'}</option>
                      {serving.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={tr ? 'Koltuk' : 'Seat'}>
                    <TextInput
                      value={seatForm.label}
                      onChange={(e) => setSeatForm({ ...seatForm, label: e.target.value })}
                      placeholder={tr ? 'Başkan, üye…' : 'Chair, member…'}
                    />
                  </Field>
                  {/* Asked rather than assumed: a secretary who attends but
                      does not vote counts as present and does not count
                      towards the quorum, and conflating the two is how a
                      sitting gets minuted as competent when it was not. */}
                  <Field label={tr ? 'Oy hakkı' : 'Voting'}>
                    <Select
                      value={seatForm.voting}
                      onChange={(e) => setSeatForm({ ...seatForm, voting: e.target.value })}
                    >
                      <option value="yes">{tr ? 'var' : 'yes'}</option>
                      <option value="no">{tr ? 'yok' : 'no'}</option>
                    </Select>
                  </Field>
                  <Field label={tr ? 'Başlangıç' : 'Started on'}>
                    <TextInput
                      type="date"
                      value={seatForm.startedOn}
                      onChange={(e) => setSeatForm({ ...seatForm, startedOn: e.target.value })}
                      required
                    />
                  </Field>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <ActionButton type="submit" disabled={seat.isPending}>
                      {tr ? 'Koltuğa oturt' : 'Seat them'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setSeating(false)}
                      className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                  </div>
                  <div className="sm:col-span-2">
                    <WriteError error={seat.error} />
                  </div>
                </form>
              ) : serving.length === 0 ? (
                <p className="text-xs text-amber-900">
                  {tr
                    ? 'Kütükte görevde olan mütevelli yok, o yüzden oturtulacak kimse de yok. Önce Mütevelli kütüğüne ekleyin.'
                    : 'No serving trustee is on the register, so there is nobody to seat. Add one to the trustee register first.'}
                </p>
              ) : (
                <ActionButton onClick={() => setSeating(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {tr ? 'Koltuğa birini oturt' : 'Seat somebody'}
                </ActionButton>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
            {tr ? 'Oturumlar' : 'Sittings'}
          </p>
        </div>
        <QueryStatus queries={[sittings]} />
        {(sittings.data?.rows ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Henüz bir organ oturumu kaydedilmemiş. Bir toplantıyı organa bağlayınca burada nisabıyla görünür.'
              : 'No organ sitting is recorded yet. Attach a meeting to an organ and it appears here with its quorum.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(sittings.data?.rows ?? []).map((sitting) => (
              <li key={sitting.meetingId}>
                <button
                  type="button"
                  onClick={() => navigate(`/meetings/${sitting.meetingId}`)}
                  className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{sitting.title}</p>
                    <p className="text-xs text-slate-500">
                      {organLabel(sitting.organKind, language)} ·{' '}
                      {formatDate(sitting.heldAt, language)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-slate-600">
                      {sitting.votingPresent}/{sitting.seatsHeld}
                      {sitting.quorumMet != null ? ` · ≥${sitting.quorumRequired}` : ''}
                    </span>
                    {sitting.quorumMet == null ? (
                      <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                        {tr ? 'söylenemiyor' : 'cannot tell'}
                      </Pill>
                    ) : sitting.quorumMet ? (
                      <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                        {tr ? 'nisap var' : 'quorate'}
                      </Pill>
                    ) : (
                      <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                        {tr ? 'nisap yok' : 'short'}
                      </Pill>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <MoreRows
          shown={(sittings.data?.rows ?? []).length}
          total={sittings.data?.total ?? 0}
          onMore={() => setSittingLimit(sittingLimit + PAGE)}
          busy={sittings.isFetching}
        />
      </div>
    </section>
  );
};
