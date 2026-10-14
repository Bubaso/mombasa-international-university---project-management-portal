/**
 * Today as an ISO calendar date (YYYY-MM-DD).
 *
 * `toISOString().split('T')[0]` was used in several places; under
 * noUncheckedIndexedAccess that reads as `string | undefined`, which is both
 * noisy and misleading — the format is fixed, so a slice is exact.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whole days from today to an ISO calendar date: negative in the past, 0
 * today, positive ahead. Null when there is no date, because "no date" and
 * "today" are different things and a 0 would merge them.
 *
 * Both sides are pinned to UTC midnight. Subtracting local timestamps makes
 * the answer depend on the hour the page was opened, which turns "due
 * tomorrow" into "due today" after 00:00 in one timezone and not another.
 */
export function daysUntil(dueOn: string | null): number | null {
  if (!dueOn) return null;
  const today = todayIso();
  return Math.round(
    (new Date(`${dueOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}
