/**
 * The three curves (M12-11), and the honest reason each one is empty.
 *
 * Measured on the live database: 0 milestones, 0 budget lines, 0 ledger
 * entries, and 4 risk score changes all stamped the same day — the day the
 * archive was loaded. Not one of the three is a curve yet.
 *
 * Which makes this the clearest case for the rule the whole portal is built
 * on. A chart over no data is the "API Live" badge in chart form: axes, a
 * legend, a plot area — all the furniture of a measurement, measuring nothing.
 * Worse than useless, because a reader takes a flat line for "nothing is
 * happening" when it means "nothing has been recorded".
 *
 * So each chart draws when it can and otherwise states the count that is zero
 * and what would fill it. The empty state is the useful output today: it is a
 * list of what the project has not yet written down.
 *
 * One distinction the counts exist for: a series whose rows all share ONE date
 * is a snapshot, not a history. The four risk scores were written in a single
 * import, and a line through them would show a trend that no time produced.
 */
import React from 'react';
import { CATEGORICAL, GRID, INK } from '../../lib/palette';
import { ChartLine, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCurves } from '../../api/reportsHooks';
import { QueryStatus } from '../QueryStatus';
import type { Curve, Point } from '../../api/curves';

// Categorical slots 1 and 2, in fixed order, from lib/palette.ts. The ΔE 24.7
// this file used to claim in a comment is now measured by tests/palette.mjs.
const PLANNED = CATEGORICAL[0];
const DONE = CATEGORICAL[1];

const W = 420;
const H = 120;
const PAD = { top: 10, right: 44, bottom: 20, left: 38 };

interface Series {
  points: Point[];
  colour: string;
  label: string;
}

/**
 * A step chart, because every series here is a count or a running total that
 * changes on a date and holds until the next one. A smoothed line between two
 * recorded points would draw values on days nobody measured.
 */
const StepChart: React.FC<{ series: Series[]; unit?: string }> = ({ series, unit }) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const stamps = all.map((p) => new Date(`${p.on}T00:00:00Z`).getTime());
  const from = Math.min(...stamps);
  const to = Math.max(...stamps);
  const span = Math.max(to - from, 86_400_000);
  const top = Math.max(...all.map((p) => p.value), 1);

  const x = (on: string) =>
    PAD.left + ((new Date(`${on}T00:00:00Z`).getTime() - from) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => H - PAD.bottom - (value / top) * (H - PAD.top - PAD.bottom);

  const path = (points: Point[]): string => {
    if (points.length === 0) return '';
    const parts: string[] = [`M ${x(points[0]!.on)} ${y(points[0]!.value)}`];
    for (let i = 1; i < points.length; i += 1) {
      // Step: hold the old value across to the new date, then rise.
      parts.push(`L ${x(points[i]!.on)} ${y(points[i - 1]!.value)}`);
      parts.push(`L ${x(points[i]!.on)} ${y(points[i]!.value)}`);
    }
    return parts.join(' ');
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {/* Hairline, solid, recessive. */}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke={GRID} strokeWidth="1" />
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={y(top)}
        y2={y(top)}
        stroke={GRID}
        strokeWidth="1"
      />
      <text x={PAD.left - 4} y={y(top) + 3} fontSize="8" fill={INK} textAnchor="end" opacity="0.7">
        {top.toLocaleString('tr-TR')}
      </text>
      <text x={PAD.left - 4} y={y(0) + 3} fontSize="8" fill={INK} textAnchor="end" opacity="0.7">
        0
      </text>
      <text x={PAD.left} y={H - 6} fontSize="8" fill={INK} opacity="0.7">
        {new Date(from).toISOString().slice(0, 10)}
      </text>
      {to !== from && (
        <text x={W - PAD.right} y={H - 6} fontSize="8" fill={INK} textAnchor="end" opacity="0.7">
          {new Date(to).toISOString().slice(0, 10)}
        </text>
      )}

      {series.map((s) => {
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.label}>
            <path
              d={path(s.points)}
              fill="none"
              stroke={s.colour}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p) => (
              <circle
                key={`${s.label}-${p.on}`}
                cx={x(p.on)}
                cy={y(p.value)}
                r="4"
                fill={s.colour}
                stroke="#fff"
                strokeWidth="2"
              >
                <title>{`${s.label} · ${p.on} · ${p.value.toLocaleString('tr-TR')}${unit ? ` ${unit}` : ''}`}</title>
              </circle>
            ))}
            {/* The endpoint, directly labelled — never a number on every point. */}
            {last && (
              <text x={x(last.on) + 7} y={y(last.value) + 3} fontSize="9" fill={s.colour}>
                {last.value.toLocaleString('tr-TR')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** What a series is waiting for, said as a count rather than as "no data". */
const Waiting: React.FC<{ lines: string[] }> = ({ lines }) => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-900">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </p>
  </div>
);

/** Two points on two different days is the least that is a line. */
const plottable = (...curves: Curve[]): boolean =>
  curves.some((c) => c.points.length >= 2) &&
  new Set(curves.flatMap((c) => c.points.map((p) => p.on))).size >= 2;

export const CurvePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const curves = useCurves();
  const data = curves.data;

  const legend = (items: Series[]) => (
    <div className="mb-1 flex flex-wrap items-center gap-3">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1 text-xs text-slate-600">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" fill={s.colour} />
          </svg>
          {s.label}
        </span>
      ))}
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <ChartLine className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">{tr ? 'Eğriler' : 'The curves'}</h2>
          <p className="max-w-2xl text-xs text-slate-500">
            {tr
              ? 'İlerleme, harcama ve risk seyri. Çizilemiyorsa hangi sayının eksik olduğunu söyler.'
              : 'Progress, spend and risk over time. Where a curve cannot be drawn, it names the missing figure.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[curves]} />

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* --- progress --- */}
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {tr ? 'Kilometre taşı ilerlemesi' : 'Milestone progress'}
            </h3>
            {plottable(data.targets, data.achieved) ? (
              <>
                {legend([
                  {
                    points: data.targets.points,
                    colour: PLANNED,
                    label: tr ? 'vadesi gelen' : 'due',
                  },
                  {
                    points: data.achieved.points,
                    colour: DONE,
                    label: tr ? 'ulaşılan' : 'achieved',
                  },
                ])}
                <StepChart
                  series={[
                    {
                      points: data.targets.points,
                      colour: PLANNED,
                      label: tr ? 'vadesi gelen' : 'due',
                    },
                    {
                      points: data.achieved.points,
                      colour: DONE,
                      label: tr ? 'ulaşılan' : 'achieved',
                    },
                  ]}
                />
              </>
            ) : (
              <Waiting
                lines={
                  tr
                    ? [
                        `Planda hedef tarihi olan ${data.targets.rows} kilometre taşı var, ${data.achieved.rows} tanesine ulaşılmış.`,
                        'İlerleme eğrisi için en az iki ayrı tarihte kayıt gerekiyor. Kilometre taşı girilmeden ne ilerleme ne sapma çizilebilir.',
                      ]
                    : [
                        `${data.targets.rows} milestones carry a target date and ${data.achieved.rows} have been achieved.`,
                        'A progress curve needs records on at least two different dates. Until milestones are entered there is neither progress nor slip to draw.',
                      ]
                }
              />
            )}
          </div>

          {/* --- spend --- */}
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {tr ? 'Harcama' : 'Spend'}
            </h3>
            {plottable(data.spend) ? (
              <>
                {legend([
                  {
                    points: data.spend.points,
                    colour: PLANNED,
                    label: tr ? 'ödenen (KES)' : 'paid (KES)',
                  },
                ])}
                <StepChart
                  series={[
                    { points: data.spend.points, colour: PLANNED, label: tr ? 'ödenen' : 'paid' },
                  ]}
                  unit="KES"
                />
              </>
            ) : (
              <Waiting
                lines={
                  tr
                    ? [
                        `Defterde ${data.spend.rows} hareket var; bütçe kalemlerinin toplamı ${data.budgetKes.toLocaleString('tr-TR')} KES.`,
                        'Harcama eğrisi muhasebe kayıtlarından çiziliyor. Hareket girilmeden harcama eğrisi değil, boş bir eksen olur.',
                      ]
                    : [
                        `The ledger holds ${data.spend.rows} entries; the budget lines total ${data.budgetKes.toLocaleString('en-GB')} KES.`,
                        'The spend curve is drawn from the ledger. Without entries it would be an empty axis rather than a curve.',
                      ]
                }
              />
            )}
          </div>

          {/* --- risk --- */}
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {tr ? 'Risk seyri' : 'Risk over time'}
            </h3>
            {plottable(data.escalated) ? (
              <>
                {legend([
                  {
                    points: data.escalated.points,
                    colour: DONE,
                    label: tr ? 'tırmandırma bandında' : 'in the escalation band',
                  },
                ])}
                <StepChart
                  series={[
                    {
                      points: data.escalated.points,
                      colour: DONE,
                      label: tr ? 'tırmandırma bandında' : 'in the escalation band',
                    },
                  ]}
                />
              </>
            ) : (
              <Waiting
                lines={
                  tr
                    ? [
                        `${data.escalated.rows} puan değişimi kayıtlı, hepsi ${data.escalated.dates} ayrı günde.`,
                        data.escalated.dates <= 1
                          ? 'Tek güne ait kayıt bir seyir değil, bir anlık görüntüdür — bu puanlar arşiv yüklenirken bir seferde yazıldı. Seyir, puanların zaman içinde değişmesiyle doğar.'
                          : 'Seyir için en az iki ayrı tarihte değişiklik gerekiyor.',
                      ]
                    : [
                        `${data.escalated.rows} score changes are recorded, across ${data.escalated.dates} distinct ${data.escalated.dates === 1 ? 'day' : 'days'}.`,
                        data.escalated.dates <= 1
                          ? 'Rows sharing one date are a snapshot, not a history — these were written in a single import. A trend appears when scores change over time.'
                          : 'A trend needs changes on at least two different dates.',
                      ]
                }
              />
            )}
          </div>
        </div>
      )}

      {data && (
        <p className="mt-3 text-xs text-slate-500">
          {tr
            ? 'Her nokta kayıttan gelen bir tarihtir; aradaki çizgi basamak şeklinde, çünkü iki ölçüm arasını eğri geçirmek kimsenin ölçmediği günlere değer yazmak olur.'
            : 'Every point is a date from the record, and the line between two of them is a step: smoothing it would write values on days nobody measured.'}
        </p>
      )}
    </section>
  );
};
