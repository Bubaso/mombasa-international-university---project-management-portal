/**
 * The first-intake board (M10-12).
 *
 * Four strands, each counted from a register that actually exists. The
 * requirement lists five; outreach is absent because nothing in this portal
 * records it, and a strand with no register would read as "nothing done" when
 * the truth is "nothing tracked". Those are different problems and the second
 * one is fixed by building a register, not by drawing a bar at zero.
 *
 * The countdown is to the first intake, which is the date the whole project
 * is measured against — and it is read from the programmes' own target year
 * rather than typed in here.
 */
import React from 'react';
import { CalendarClock, GraduationCap, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProgrammes, useReadiness } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { strandLabel } from '../../lib/governance';

export const ReadinessBoard: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const readiness = useReadiness();
  const programmes = useProgrammes();

  const strands = readiness.data ?? [];

  // The target year comes from the programmes themselves. If nobody has set
  // one, the board says so rather than counting down to a date this component
  // picked.
  const years = (programmes.data ?? [])
    .map((p) => p.targetIntakeYear)
    .filter((y): y is number => y != null);
  const intakeYear = years.length > 0 ? Math.min(...years) : null;
  const daysToIntake =
    intakeYear == null
      ? null
      : Math.ceil((new Date(`${intakeYear}-09-01`).getTime() - Date.now()) / 86400000);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'İlk öğrenci alımı hazırlığı' : 'First intake readiness'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Her şerit gerçek bir kütükten sayılıyor. Tanıtım şeridi yok, çünkü onu tutan bir kütük yok — sıfır çizmek “yapılmadı” diye okunur, oysa doğrusu “takip edilmiyor”.'
                : 'Each strand is counted from a real register. Outreach is missing because no register holds it — drawing a zero would read as “not done”, when the truth is “not tracked”.'}
            </p>
          </div>
        </div>
        {daysToIntake != null ? (
          <div className="text-right">
            <p className="font-mono text-lg font-bold text-indigo-900">{daysToIntake}</p>
            <p className="text-xs text-slate-500">
              {tr ? `gün — ${intakeYear} alımına` : `days to the ${intakeYear} intake`}
            </p>
          </div>
        ) : (
          <Pill className="border-amber-300 bg-amber-50 text-amber-900">
            <CalendarClock className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {tr ? 'hedef alım yılı girilmemiş' : 'no target intake year set'}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[readiness, programmes]} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {strands.map((strand) => {
          // Null, not zero, where nothing is on the register: a percentage of
          // nothing is a number the portal has no business printing.
          const share = strand.total > 0 ? Math.round((100 * strand.ready) / strand.total) : null;
          return (
            <div key={strand.strand} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                {strandLabel(strand.strand, language)}
              </p>
              {strand.total === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  {tr ? 'kütükte kayıt yok' : 'nothing on the register'}
                </p>
              ) : (
                <>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900">
                    {strand.ready}
                    <span className="text-slate-500">/{strand.total}</span>
                    {share != null && (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">{share}%</span>
                    )}
                  </p>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
                    role="img"
                    aria-label={
                      tr
                        ? `${strandLabel(strand.strand, language)}: ${strand.ready} / ${strand.total}`
                        : `${strandLabel(strand.strand, language)}: ${strand.ready} of ${strand.total}`
                    }
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${share ?? 0}%` }}
                    />
                  </div>
                </>
              )}
              {strand.impeded > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-amber-800">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  {tr ? `${strand.impeded} engelli` : `${strand.impeded} impeded`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
