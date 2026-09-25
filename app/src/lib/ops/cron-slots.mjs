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
import { attributeRuns, attributionHorizonMs, effectiveHorizonMs, PUNCTUALITY_BANDS } from "./cron-punctuality.mjs";

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
 * ⚠ THIS USED TO ASK "IS THERE A RUN WITHIN ±2h OF THIS SLOT", AND THAT IS THREE BUGS (2026-09-25).
 *
 * MEASURED: nfl-event-window's scheduled delivery over 14 days was min 1h40m, median 2h52m, max
 * 4h55m late — n=40, and NOT ONE RUN WAS PUNCTUAL. Against a ±2h window the median delivery falls
 * OUTSIDE the tolerance, so the watchdog reported 26 "missed" slots across five sports, and every
 * UFC one I checked had a successful run behind it (11:00Z slot → 15:31Z run, called MISSED). The
 * response had been to leave the watchdog on `report-only; not paging yet` — which silenced the
 * miscalibration instead of fixing it, and meant a genuine miss would be invisible among the false
 * ones.
 *
 * The three defects, all fixed by using ONE pairing rule:
 *   1. the tolerance was narrower than the delay it was meant to absorb;
 *   2. membership was INDEPENDENT, so a single run could satisfy several slots at once — a
 *      workflow that fired once for three slots read as fully served;
 *   3. the window was symmetric, so a run BEFORE a slot could claim it. A scheduled run fires at
 *      or after its slot, never before, and an earlier unrelated run is not evidence.
 *
 * So this now delegates to `attributeRuns` in cron-punctuality.mjs, which already got this right in
 * P253: greedy in slot order, one run consumes one slot, runs before their slot rejected, horizon
 * capped by the schedule's own gap and by MAX_ATTRIBUTION_MS (8h — clear of the worst drift seen).
 * The two modules still answer different questions — this one "did it run", that one "was it on
 * time" — but they now answer them from the SAME pairing, so they can never disagree about which
 * run served which slot.
 */
export function missedSlots(slots, runStartMs, { nowMs, horizonMs } = {}) {
  return slotAttribution(slots, runStartMs, { nowMs, horizonMs }).missed;
}

/**
 * The full pairing: which slots were served, which were missed, and whether we may claim either.
 *
 * ⚠ `attributable: false` IS A REFUSAL, NOT A ZERO. A schedule whose own slots are closer together
 * than the drift we must tolerate cannot distinguish a late run from an absent one — a run at 18:40
 * could be the 14:30 slot four hours late or the 15:00 slot equally late, and nothing in the run
 * list separates them. Such a workflow reports `missed: []` with `attributable: false`, and a caller
 * that renders that as "no misses" is making a claim the data does not support. `coverageRatio` is
 * the honest window-level answer available at that cadence: runs observed ÷ slots owed.
 */
export function slotAttribution(slots, runStartMs, { nowMs, horizonMs } = {}) {
  const sorted = [...(slots ?? [])].sort((a, b) => a - b);
  const runs = [...(runStartMs ?? [])];
  const gap = attributionHorizonMs(sorted);
  const attributable = !Number.isFinite(gap) || gap / 60_000 > PUNCTUALITY_BANDS.DEGRADED_MAX_MIN;
  const horizon = Number.isFinite(horizonMs) ? horizonMs : effectiveHorizonMs(sorted);
  const pairs = attributeRuns(sorted, runs, { nowMs, horizonMs: horizon });
  const judged = pairs.length;
  const served = pairs.filter((p) => p.runMs !== null);
  return {
    attributable,
    judgedSlots: judged,
    servedSlots: attributable ? served.length : null,
    missed: attributable ? pairs.filter((p) => p.runMs === null).map((p) => p.slotMs) : [],
    coverageRatio: judged > 0 ? Math.min(1, runs.length / judged) : null,
    pairs,
  };
}

/**
 * The earliest instant a workflow could possibly have run: its own creation.
 *
 * WHY THIS IS NOT OPTIONAL. Without it the watchdog reported five missed slots across UFC and EPL on
 * its first run, and ALL FIVE predated the workflow files existing — a 100% false-positive rate, on
 * the exact cry-wolf failure the run-not-output design was chosen to avoid. A slot before the job
 * existed is not a slot anyone missed.
 *
 * A null/unknown creation time falls back to the requested window rather than to zero: if we cannot
 * date the workflow we do not get to invent an earlier floor for it.
 */
export function windowFloor(fromMs, createdMs) {
  return Number.isFinite(createdMs) ? Math.max(fromMs, createdMs) : fromMs;
}

/**
 * How many of the most recent COMPLETED runs failed, counting back from the newest until one did not.
 *
 * This lives beside the slot arithmetic because it answers the other half of the same question. A
 * slot can be missed (nothing fired) or served-and-broken (something fired and crashed), and a
 * watchdog that only knows the first will report `OK` through an outage — which is exactly what
 * happened to nfl-event-window on 2026-08-21: three slots fired, three runs failed, state OK, and
 * the public hub spent a day anchored to a stale index.
 *
 * `cancelled` and `skipped` BREAK the streak rather than extending it. Neither is evidence the
 * workflow is broken, and counting an operator's cancellation as a failure would alert on a human
 * doing something deliberate.
 *
 * Expects newest-first. Entries without a `conclusion` (still running) must be filtered out by the
 * caller — an unfinished run is neither a success nor a failure and must not end the streak either.
 */
export function failureStreak(outcomes) {
  let n = 0;
  for (const o of outcomes ?? []) {
    if (o?.conclusion === "failure" || o?.conclusion === "timed_out") n += 1;
    else break;
  }
  return n;
}
