/**
 * CRON-SLOT WATCHDOG CORE — did each scheduled run actually fire?
 *
 * WHY THIS WATCHES THE CRON AND NOT THE OUTPUT. MLB plays daily, so "no board today" is an
 * unambiguous alarm. UFC, NFL and EPL have quiet weeks: no card, a bye, an international break. A
 * watchdog that fired whenever one of them produced nothing would cry wolf on every quiet week and
 * teach everyone to ignore it — the same alarm-fatigue failure this repo just removed from the
 * settlement checker, except sitting on the alerting path.
 *
 * So the signal is the RUN, not the artifact. A scheduled run that produced nothing is healthy:
 * ufc-fight-week auto-advances past a finished card and nfl-event-window exits clean on NO_EVENTS.
 * Those are correct no-ops. A cron slot with no run AT ALL is the real failure, and it is one this
 * repo has already hit — GitHub crons are best-effort and a morning cron was once silently skipped.
 * That check needs no schedule oracle and no per-sport special-casing.
 *
 * Pure and clock-injected: every function takes its time bounds, so the tests do not depend on when
 * they run.
 */

/** Match one cron field against a value. Supports `*`, n, a-b, a,b,c and any of those with /step. */
function fieldMatches(field, value, min, max) {
  for (const part of String(field).split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) return false;
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) { const [a, b] = range.split("-").map(Number); lo = a; hi = b; }
    else { lo = hi = Number(range); }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
    if (value < lo || value > hi) continue;
    if ((value - lo) % step === 0) return true;
  }
  return false;
}

/** True when `date` (UTC — GitHub schedules are UTC) satisfies a 5-field cron expression. */
export function cronMatches(expr, date) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron-slots: expected 5 fields, got ${f.length} in "${expr}"`);
  const [min, hour, dom, mon, dow] = f;
  return fieldMatches(min, date.getUTCMinutes(), 0, 59)
    && fieldMatches(hour, date.getUTCHours(), 0, 23)
    && fieldMatches(dom, date.getUTCDate(), 1, 31)
    && fieldMatches(mon, date.getUTCMonth() + 1, 1, 12)
    // GitHub accepts 0 and 7 for Sunday; normalise so "0 7 * * 0" and "* * * * 7" both mean Sunday.
    && (fieldMatches(dow, date.getUTCDay(), 0, 6) || (date.getUTCDay() === 0 && fieldMatches(dow, 7, 0, 7)));
}

/**
 * Every time the given crons should have fired in [fromMs, toMs], as epoch ms, ascending.
 * Minute resolution — a cron cannot fire more often than that.
 */
export function expectedSlots(exprs, fromMs, toMs) {
  const out = [];
  const start = Math.ceil(fromMs / 60000) * 60000;
  for (let t = start; t <= toMs; t += 60000) {
    const d = new Date(t);
    if (exprs.some((e) => cronMatches(e, d))) out.push(t);
  }
  return out;
}

/**
 * Slots with no run attributable to them.
 *
 * `toleranceMs` is generous ON PURPOSE: GitHub's scheduler is best-effort and has been observed here
 * drifting an hour or more, so a tight window would report lateness as absence and make the watchdog
 * the thing that cries wolf.
 *
 * Slots newer than `toleranceMs` before `nowMs` are EXCLUDED — a run that has not fired yet is not a
 * run that was missed, and alarming on it would fire every single time the watchdog ran.
 */
export function missedSlots(slots, runStartMs, { nowMs, toleranceMs = 2 * 3600_000 } = {}) {
  const runs = [...runStartMs].sort((a, b) => a - b);
  return slots
    .filter((s) => s <= nowMs - toleranceMs)
    .filter((s) => !runs.some((r) => r >= s - toleranceMs && r <= s + toleranceMs));
}
