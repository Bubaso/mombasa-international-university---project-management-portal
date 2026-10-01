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
import { Landmark, Scale, Users2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMemberships, useOrgans, useSittings } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { cadenceLabel, organLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';

export const OrganPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const organs = useOrgans();
  const sittings = useSittings(12);
  const [open, setOpen] = useState<string | null>(null);
  const members = useMemberships(open);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {tr ? 'Organlar ve nisap' : 'The organs and their quorum'}
          </h2>
          <p className="text-[11px] text-slate-500">
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
              <p className="text-xs font-semibold text-slate-900">
                {tr ? organ.nameTr : organ.nameEn}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {organ.memberCount} {tr ? 'üye' : organ.memberCount === 1 ? 'member' : 'members'}
                {organ.cadence ? ` · ${cadenceLabel(organ.cadence, language)}` : ''}
              </p>
              <p className="mt-1 text-[11px]">
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
                <p className="mt-1 text-[11px] text-slate-400">
                  {tr ? 'senet md. ' : 'deed cl. '}
                  {organ.charterClause}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <p className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
              {tr ? 'Koltuklar' : 'Seats'}
            </p>
          </div>
          <QueryStatus queries={[members]} />
          {(members.data ?? []).length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {tr
                ? 'Bu organa henüz kimse atanmamış — nisap da bu yüzden hesaplanamıyor.'
                : 'Nobody is seated on this organ yet, which is also why no quorum can be computed for it.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {(members.data ?? []).map((seat) => (
                <li key={seat.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-900">
                    {seat.name ?? (tr ? '(isim yok)' : '(unnamed)')}
                  </span>
                  {seat.seat && <Pill>{seat.seat}</Pill>}
                  {!seat.voting && (
                    <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                      {tr ? 'oy yok' : 'non-voting'}
                    </Pill>
                  )}
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatDate(seat.startedOn, language)}
                    {seat.endedOn ? ` → ${formatDate(seat.endedOn, language)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <p className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
            {tr ? 'Oturumlar' : 'Sittings'}
          </p>
        </div>
        <QueryStatus queries={[sittings]} />
        {(sittings.data ?? []).length === 0 ? (
          <p className="text-[11px] text-slate-500">
            {tr
              ? 'Henüz bir organ oturumu kaydedilmemiş. Bir toplantıyı organa bağlayınca burada nisabıyla görünür.'
              : 'No organ sitting is recorded yet. Attach a meeting to an organ and it appears here with its quorum.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(sittings.data ?? []).map((sitting) => (
              <li key={sitting.meetingId}>
                <button
                  type="button"
                  onClick={() => navigate(`/meetings/${sitting.meetingId}`)}
                  className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900">{sitting.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {organLabel(sitting.organKind, language)} ·{' '}
                      {formatDate(sitting.heldAt, language)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-600">
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
      </div>
    </section>
  );
};
