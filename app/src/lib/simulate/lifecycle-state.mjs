/**
 * /simulate · WHAT A STARTED EVENT MAY BE CALLED (#808).
 *
 * The day view had one post-start state, SETTLED, and reached it from the clock or the date: an NFL game
 * that had merely kicked off (lifecycle STARTED) was labelled "Settled" — on 2026-09-28 PHI @ CHI, in the
 * second quarter. Settlement is a claim about the canonical record, not about time. So after the start:
 *
 *   settled (the sport's canonical settlement record says so) → SETTLED              "Settled"
 *   final known, not yet settled                              → AWAITING_SETTLEMENT  "Final · grading pending"
 *   started, no final known                                   → STARTED              "Kicked off"
 *   not started, or a start that cannot be read               → null (the caller's pregame readiness states)
 *
 * Each sport supplies the three facts from its own owners (day-view.ts); this function only decides the
 * words, so the rule is the same for every sport and cannot drift per route.
 */

/** @returns {"SETTLED"|"AWAITING_SETTLEMENT"|"STARTED"|null} */
export function postStartState({ started, final, settled }) {
  if (settled === true) return "SETTLED";
  if (started !== true) return null;
  if (final === true) return "AWAITING_SETTLEMENT";
  return "STARTED";
}

/** True when `startUtc` is a readable instant at or before `nowMs`. An unreadable start never counts. */
export function startedAt(startUtc, nowMs) {
  const t = Date.parse(String(startUtc ?? ""));
  return Number.isFinite(t) && Number.isFinite(nowMs) && t <= nowMs;
}

export const POST_START_REASON = Object.freeze({
  SETTLED: "Settled — the graded outcome is on Results; the report shows the frozen forecast beside it.",
  AWAITING_SETTLEMENT: "Final — grading against the official result is pending. The report shows the frozen pregame forecast.",
  STARTED: "Kicked off — no final is recorded yet. The report shows the frozen pregame forecast; the result arrives when it is graded.",
});
