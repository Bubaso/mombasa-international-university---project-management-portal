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
