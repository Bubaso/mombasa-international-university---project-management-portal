/**
 * The three curves M12-11 names, and the counts that say whether they can be
 * drawn at all.
 *
 * Measured on the live database when this was written: 0 milestones, 0 budget
 * lines, 0 ledger entries, and 4 risk score changes all stamped the same day —
 * the day the archive was loaded. So not one of the three is a curve yet.
 *
 * That measurement is the reason this file returns the counts beside the
 * series. A chart drawn over no data is the "API Live" badge in chart form: it
 * has axes, a legend and a plot area, all the furniture of a measurement, and
 * measures nothing. The screen needs to know the difference between "nothing
 * happened" and "nothing has been recorded", and only the counts can tell it.
 */
import { supabase } from '../lib/supabase';

export interface Point {
  /** ISO date. */
  on: string;
  value: number;
}

export interface Curve {
  /** Cumulative, oldest first. Empty when there is nothing to plot. */
  points: Point[];
  /** How many source rows existed at all, drawn or not. */
  rows: number;
  /** Distinct dates in the source. One date is a snapshot, not a history. */
  dates: number;
}

export interface Curves {
  /** Milestones due, cumulative, against milestones achieved. */
  targets: Curve;
  achieved: Curve;
  /** Ledger payments, cumulative in KES, against the budget as a line. */
  spend: Curve;
  budgetKes: number;
  /** How many risks sat at or above the escalation band, over time. */
  escalated: Curve;
}

function cumulative(rows: { on: string; add: number }[]): Point[] {
  const byDate = new Map<string, number>();
  for (const row of rows) byDate.set(row.on, (byDate.get(row.on) ?? 0) + row.add);
  const dates = [...byDate.keys()].sort();
  let running = 0;
  return dates.map((on) => {
    running += byDate.get(on) ?? 0;
    return { on, value: running };
  });
}

const curve = (rows: { on: string; add: number }[]): Curve => ({
  points: cumulative(rows),
  rows: rows.length,
  dates: new Set(rows.map((r) => r.on)).size,
});

export async function fetchCurves(): Promise<Curves> {
  const [milestones, ledger, budget, scores] = await Promise.all([
    supabase.from('milestones').select('target_on, achieved_on'),
    supabase.from('financial_transactions').select('date, amount_kes'),
    supabase.from('budget_lines').select('amount_kes'),
    supabase.from('risk_score_changes').select('changed_at, to_score, risk_id'),
  ]);

  for (const result of [milestones, ledger, budget, scores]) {
    if (result.error) throw new Error(result.error.message);
  }

  const ms = (milestones.data ?? []) as { target_on: string | null; achieved_on: string | null }[];
  const tx = (ledger.data ?? []) as { date: string | null; amount_kes: number | null }[];
  const lines = (budget.data ?? []) as { amount_kes: number | null }[];
  const sc = (scores.data ?? []) as {
    changed_at: string;
    to_score: number | null;
    risk_id: string;
  }[];

  // The escalation band, replayed: each change moves one risk in or out of it,
  // so the series is the count at or above 20 after each recorded change.
  const above = new Map<string, boolean>();
  const steps: { on: string; add: number }[] = [];
  for (const change of [...sc].sort((a, b) => a.changed_at.localeCompare(b.changed_at))) {
    const now = (change.to_score ?? 0) >= 20;
    const was = above.get(change.risk_id) ?? false;
    if (now !== was) {
      above.set(change.risk_id, now);
      steps.push({ on: change.changed_at.slice(0, 10), add: now ? 1 : -1 });
    }
  }

  return {
    targets: curve(
      ms.filter((m) => m.target_on).map((m) => ({ on: m.target_on as string, add: 1 })),
    ),
    achieved: curve(
      ms.filter((m) => m.achieved_on).map((m) => ({ on: m.achieved_on as string, add: 1 })),
    ),
    spend: curve(
      tx
        .filter((t) => t.date)
        .map((t) => ({ on: t.date as string, add: Number(t.amount_kes ?? 0) })),
    ),
    budgetKes: lines.reduce((sum, l) => sum + Number(l.amount_kes ?? 0), 0),
    escalated: curve(steps),
  };
}
