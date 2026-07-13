/**
 * MLB 2026 season-calendar facts — DATES ONLY, public record.
 *
 * Used so the site can honestly explain a 0-MLB-board day. Crucially, it does
 * NOT claim "All-Star break" on a day that merely lacks a committed board — the
 * break note fires ONLY inside the real published break window. Outside it, the
 * generic "no board for today · most recent slate" framing (see `slate-liveness`)
 * is the honest statement. Never drives money, products, or settlement.
 */

/**
 * MLB 2026 All-Star break: the regular season pauses for the Midsummer Classic.
 * Public schedule — All-Star Game Jul 14, 2026; no regular-season games Jul 13–16;
 * second half resumes Jul 17. (Dates are the published calendar, not a projection.)
 */
export const MLB_ALL_STAR_BREAK_2026 = {
  /** First day with no regular-season games. */
  start: "2026-07-13",
  /** Last day of the break. */
  end: "2026-07-16",
  /** First day the second half resumes. */
  resume: "2026-07-17",
} as const;

/** True when `today` (ET, YYYY-MM-DD) falls inside the All-Star break. */
export function isMlbAllStarBreak(today: string): boolean {
  return today >= MLB_ALL_STAR_BREAK_2026.start && today <= MLB_ALL_STAR_BREAK_2026.end;
}

/**
 * Honest one-line MLB note for a given day, or null when nothing calendar-specific
 * applies (in which case the generic no-board framing carries the message).
 *   - inside the break  → "MLB — All-Star break; second half resumes Jul 17."
 *   - otherwise         → null (do NOT assert a break we can't confirm).
 */
export function mlbBreakNote(today: string): string | null {
  if (isMlbAllStarBreak(today)) {
    return "MLB — All-Star break; second half resumes Jul 17.";
  }
  return null;
}
