/**
 * The plan on one timeline (M15-08).
 *
 * The honest difficulty of a Gantt here is that A MILESTONE IS A POINT, NOT A
 * SPAN. The register records a target date and, when it happened, an achieved
 * date; it records nothing about how long the work took. Every Gantt tool in
 * the world would draw each one as a bar of some default width, and that bar
 * would be a duration nobody ever stated. So:
 *
 *   PHASES are bars, because a phase has a start and an end on the record.
 *   MILESTONES are marks at their target date, with a connector to the
 *     achieved date where there is one — and that connector IS the slip,
 *     measured rather than drawn to look right.
 *
 * And a record with no date is not drawn at all. A phase missing either end,
 * or a milestone with no target, is listed underneath with the reason, because
 * placing it at today, or at the project's first date, would be an assertion
 * about the plan that the plan does not make.
 *
 * Colour: the state is carried by SHAPE and TEXT, with colour only reinforcing.
 * The dataviz validator measured the reason — the status palette's red and
 * green sit ΔE 4.1 apart under deuteranopia, so a reader with the commonest
 * colour blindness could not tell "achieved" from "missed" by hue. A circle is
 * something that happened; a diamond is something still owed; the days are
 * written next to both.
 */
import React, { useMemo, useState } from 'react';
import { GanttChartSquare, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePhases, usePlanMilestones } from '../../api/planHooks';
import type { Milestone, PhasePosition } from '../../types';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate } from '../../lib/site';

/** Sequential blue: the plan itself, one hue. */
const PLAN_FILL = '#9ec5f4';
const PLAN_EDGE = '#2a78d6';
/** Status, reserved and never reused as a series colour. */
const GOOD = '#0ca30c';
const CRITICAL = '#d03b3b';
const SERIOUS = '#ec835a';
const INK = '#586e75';
const GRID = '#e2ddd0';

const DAY = 86_400_000;
const ROW = 26;
const BAR = 14;
const LEFT = 148;
const RIGHT = 16;
const WIDTH = 760;

function day(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
}

export const GanttPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const phases = usePhases();
  const milestones = usePlanMilestones();
  const [hover, setHover] = useState<string | null>(null);

  const plan = useMemo(() => {
    const allPhases: PhasePosition[] = phases.data ?? [];
    const allMilestones: Milestone[] = milestones.data ?? [];

    // Drawable means dated. Everything else is reported, not placed.
    const bars = allPhases.filter((p) => p.startsOn && p.endsOn);
    const undatedPhases = allPhases.filter((p) => !p.startsOn || !p.endsOn);
    const marks = allMilestones.filter((m) => m.targetOn);
    const undatedMilestones = allMilestones.filter((m) => !m.targetOn);

    const stamps = [
      ...bars.flatMap((p) => [day(p.startsOn as string), day(p.endsOn as string)]),
      ...marks.flatMap((m) =>
        m.achievedOn ? [day(m.targetOn as string), day(m.achievedOn)] : [day(m.targetOn as string)],
      ),
      Date.now(),
    ];
    const from = Math.min(...stamps);
    const to = Math.max(...stamps);
    const span = Math.max(to - from, DAY);

    return { bars, marks, undatedPhases, undatedMilestones, from, to, span };
  }, [phases.data, milestones.data]);

  const { bars, marks, undatedPhases, undatedMilestones, from, span } = plan;
  const drawable = bars.length > 0 || marks.length > 0;
  const inner = WIDTH - LEFT - RIGHT;
  const x = (stamp: number) => LEFT + ((stamp - from) / span) * inner;

  // One row per phase, then one row for the milestones of that phase, then a
  // row for milestones belonging to no phase.
  const rows = useMemo(() => {
    const out: { kind: 'phase' | 'marks'; phaseId: string | null; label: string }[] = [];
    for (const phase of bars) {
      out.push({
        kind: 'phase',
        phaseId: phase.phaseId,
        label: (tr ? phase.nameTr : phase.nameEn) ?? phase.nameEn,
      });
      if (marks.some((m) => m.phaseId === phase.phaseId)) {
        out.push({ kind: 'marks', phaseId: phase.phaseId, label: '' });
      }
    }
    if (marks.some((m) => !m.phaseId || !bars.some((b) => b.phaseId === m.phaseId))) {
      out.push({
        kind: 'marks',
        phaseId: null,
        label: tr ? 'faza bağlı değil' : 'no phase',
      });
    }
    return out;
  }, [bars, marks, tr]);

  const height = Math.max(rows.length * ROW + 44, 80);
  const today = x(Date.now());

  const yearTicks = useMemo(() => {
    const ticks: { stamp: number; label: string }[] = [];
    const first = new Date(from).getUTCFullYear();
    const last = new Date(from + span).getUTCFullYear();
    for (let year = first; year <= last; year += 1) {
      const stamp = Date.UTC(year, 0, 1);
      if (stamp >= from && stamp <= from + span) ticks.push({ stamp, label: String(year) });
    }
    return ticks;
  }, [from, span]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <GanttChartSquare
            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Zaman çizgisi' : 'The plan on one timeline'}
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              {tr
                ? 'Fazlar çubuk, çünkü bir fazın başlangıcı ve bitişi kayıtlı. Kilometre taşları hedef tarihine konmuş birer işaret — bir kilometre taşı bir nokta, bir süre değil, ve kayıtta süresi yok. Ulaşılmış olanın hedefiyle arasındaki çizgi gecikmenin kendisi; ölçülmüş, göze hoş gelsin diye çizilmemiş.'
                : 'Phases are bars, because a phase has a start and an end on the record. A milestone is a mark at its target date — it is a point, not a span, and the register holds no duration for it. The line to an achieved date is the slip itself, measured rather than drawn to look right.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Shape is the identity channel; the swatch only reinforces it. */}
          <Pill className="border-slate-300 bg-white text-slate-700">
            <svg width="9" height="9" className="mr-1 inline" aria-hidden="true">
              <circle cx="4.5" cy="4.5" r="4" fill={GOOD} />
            </svg>
            {tr ? 'daire: oldu' : 'circle: happened'}
          </Pill>
          <Pill className="border-slate-300 bg-white text-slate-700">
            <svg width="11" height="11" className="mr-1 inline" aria-hidden="true">
              <rect
                x="1.5"
                y="1.5"
                width="7"
                height="7"
                transform="rotate(45 5.5 5.5)"
                fill="none"
                stroke={CRITICAL}
                strokeWidth="1.5"
              />
            </svg>
            {tr ? 'baklava: hâlâ borçlu' : 'diamond: still owed'}
          </Pill>
        </div>
      </header>

      <QueryStatus queries={[phases, milestones]} />

      {!drawable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Çizilecek bir şey yok: hiçbir fazın başlangıç ve bitişi, hiçbir kilometre taşının hedef tarihi kayıtlı değil. Zaman çizgisi tarih ister; tarihi olmayan bir planı çizmek, planın söylemediği bir şeyi söylemek olur.'
            : 'There is nothing to draw: no phase has both a start and an end, and no milestone has a target date. A timeline needs dates, and drawing a plan that has none would say something the plan does not.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            className="w-full"
            style={{ minWidth: 560 }}
            role="img"
            aria-label={tr ? 'Proje zaman çizgisi' : 'Project timeline'}
          >
            {/* Hairline, solid, one step off the surface. */}
            {yearTicks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={x(tick.stamp)}
                  x2={x(tick.stamp)}
                  y1={16}
                  y2={height - 24}
                  stroke={GRID}
                  strokeWidth="1"
                />
                <text x={x(tick.stamp) + 3} y={12} fontSize="9" fill={INK} opacity="0.7">
                  {tick.label}
                </text>
              </g>
            ))}

            <line
              x1={today}
              x2={today}
              y1={16}
              y2={height - 24}
              stroke={INK}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x={today + 3} y={height - 14} fontSize="9" fill={INK}>
              {tr ? 'bugün' : 'today'}
            </text>

            {rows.map((row, index) => {
              const y = 22 + index * ROW;
              if (row.kind === 'phase') {
                const phase = bars.find((p) => p.phaseId === row.phaseId);
                if (!phase) return null;
                const start = x(day(phase.startsOn as string));
                const end = x(day(phase.endsOn as string));
                return (
                  <g key={`phase-${row.phaseId}`}>
                    <text x={0} y={y + BAR / 2 + 3} fontSize="10" fill={INK}>
                      {row.label.length > 24 ? `${row.label.slice(0, 23)}…` : row.label}
                    </text>
                    <rect
                      x={start}
                      y={y}
                      width={Math.max(end - start, 3)}
                      height={BAR}
                      rx="4"
                      fill={PLAN_FILL}
                      stroke={phase.overran ? CRITICAL : PLAN_EDGE}
                      strokeWidth={phase.overran ? 2 : 1}
                    />
                    {phase.overran && (
                      <text x={end + 5} y={y + BAR / 2 + 3} fontSize="9" fill={CRITICAL}>
                        {tr ? 'süresi aştı' : 'overran'}
                      </text>
                    )}
                  </g>
                );
              }

              const mine = marks.filter((m) =>
                row.phaseId
                  ? m.phaseId === row.phaseId
                  : !m.phaseId || !bars.some((b) => b.phaseId === m.phaseId),
              );
              return (
                <g key={`marks-${row.phaseId ?? 'none'}`}>
                  {row.label && (
                    <text x={0} y={y + 10} fontSize="9" fill={INK} opacity="0.7">
                      {row.label}
                    </text>
                  )}
                  {mine.map((m) => {
                    const target = x(day(m.targetOn as string));
                    const achieved = m.achievedOn ? x(day(m.achievedOn)) : null;
                    const late = (m.slipDays ?? 0) > 0;
                    const missed = !m.achievedOn && day(m.targetOn as string) < Date.now();
                    const tone = m.achievedOn ? (late ? SERIOUS : GOOD) : missed ? CRITICAL : INK;
                    const title = `${(tr ? m.titleTr : m.titleEn) ?? m.titleEn} · ${
                      tr ? 'hedef ' : 'target '
                    }${formatDate(m.targetOn as string, language)}${
                      m.achievedOn
                        ? ` · ${tr ? 'oldu ' : 'achieved '}${formatDate(m.achievedOn, language)}`
                        : ''
                    }${
                      m.slipDays == null
                        ? ''
                        : ` · ${m.slipDays > 0 ? `+${m.slipDays}` : m.slipDays} ${tr ? 'gün' : 'd'}`
                    }`;
                    return (
                      <g
                        key={m.id}
                        onMouseEnter={() => setHover(m.id)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <title>{title}</title>
                        {/* The connector IS the slip. */}
                        {achieved != null && Math.abs(achieved - target) > 1 && (
                          <line
                            x1={target}
                            x2={achieved}
                            y1={y + 9}
                            y2={y + 9}
                            stroke={tone}
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        )}
                        {/* A diamond is still owed; a circle happened. The
                            ring in the surface colour keeps marks legible
                            where they overlap. */}
                        {m.achievedOn ? (
                          <circle
                            cx={achieved ?? target}
                            cy={y + 9}
                            r="4.5"
                            fill={tone}
                            stroke="#fff"
                            strokeWidth="2"
                          />
                        ) : (
                          <rect
                            x={target - 4}
                            y={y + 5}
                            width="8"
                            height="8"
                            transform={`rotate(45 ${target} ${y + 9})`}
                            fill="#fff"
                            stroke={tone}
                            strokeWidth="2"
                          />
                        )}
                        {m.critical && (
                          <text x={target} y={y - 1} fontSize="8" fill={INK} textAnchor="middle">
                            ★
                          </text>
                        )}
                        {/* Selectively labelled: the slipped ones, which are
                            the ones the chart is about. */}
                        {(hover === m.id || late || missed) && (
                          <text x={(achieved ?? target) + 7} y={y + 12} fontSize="9" fill={tone}>
                            {missed
                              ? tr
                                ? 'geçti'
                                : 'passed'
                              : `+${m.slipDays ?? 0}${tr ? 'g' : 'd'}`}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* What could not be drawn, and why. */}
      {(undatedPhases.length > 0 || undatedMilestones.length > 0) && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-xs text-amber-900">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {tr
              ? 'Çizilemeyenler. Bunlara bir tarih atamak, planın söylemediği bir şeyi söylemek olurdu.'
              : 'Not drawn. Giving these a date would say something the plan does not.'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {undatedPhases.map((p) => (
              <li key={p.phaseId} className="text-xs text-amber-900">
                {(tr ? p.nameTr : p.nameEn) ?? p.nameEn}
                {' — '}
                {!p.startsOn && !p.endsOn
                  ? tr
                    ? 'başlangıcı ve bitişi yok'
                    : 'no start and no end'
                  : !p.startsOn
                    ? tr
                      ? 'başlangıcı yok'
                      : 'no start'
                    : tr
                      ? 'bitişi yok'
                      : 'no end'}
              </li>
            ))}
            {undatedMilestones.map((m) => (
              <li key={m.id} className="text-xs text-amber-900">
                {(tr ? m.titleTr : m.titleEn) ?? m.titleEn}
                {' — '}
                {tr ? 'hedef tarihi yok' : 'no target date'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
