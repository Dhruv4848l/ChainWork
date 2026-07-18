/*
  Working-days calendar (spec 13.6). Verification windows count BUSINESS days only:
  weekends are skipped, plus a configurable regional holiday set (YYYY-MM-DD strings).
  This is the single source of truth both the UI countdown and the escrow timer use.
  Pure + deterministic so it's easy to test.
*/

/** Local YYYY-MM-DD for a date (holiday keys are date-only, local). */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isBusinessDay(d: Date, holidays: Set<string> = new Set()): boolean {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  return !holidays.has(ymd(d));
}

/**
 * Advance `from` by `days` business days (skipping weekends + holidays), preserving
 * the time-of-day. e.g. a Friday delivery + 2 business days → the following Tuesday.
 */
export function addBusinessDays(from: Date, days: number, holidays: Set<string> = new Set()): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d, holidays)) added++;
  }
  return d;
}

/** Count business days strictly between `a` and `b` (exclusive of `a`, inclusive of `b`). */
export function businessDaysBetween(a: Date, b: Date, holidays: Set<string> = new Set()): number {
  if (b <= a) return 0;
  const d = new Date(a);
  let count = 0;
  while (d < b) {
    d.setDate(d.getDate() + 1);
    if (d <= b && isBusinessDay(d, holidays)) count++;
  }
  return count;
}
