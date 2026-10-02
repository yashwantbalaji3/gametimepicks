/**
 * SESSION 5 · PHASE B — WHAT daily-products MAY DO WITH TODAY'S MLB INPUT.
 *
 * The pool gate (pool-gate.mjs) answers "is the priced MLB slate usable?" and the workflow used to treat any
 * refusal as fatal for the WHOLE job. On 2026-09-28 — the first MLB off day after the regular season — the
 * gate said INPUT_MISSING and nothing ran: no Bank Builder / Moonshot receipt, no ProductEligibleLeg universe
 * (NFL included), no projection or Ask refresh. From the MLB offseason that recurs every day.
 *
 * MLB keeps failing closed; it just stops taking everything else down with it. Three verdicts:
 *
 *   READY              the gate accepted the file (a priced slate, or the producer's valid empty slate) —
 *                      the existing MLB product path runs exactly as before
 *   NO_EVENTS          the file is missing BUT the free StatsAPI schedule, captured ON this ET day, says the
 *                      date holds 0 games — established, so the existing empty-slate path runs
 *   INPUT_UNAVAILABLE  anything else: missing without that evidence, malformed, stale, wrong date. MLB money
 *                      products are NOT generated and the receipt says INPUTS_MISSING with the gate's reason
 *
 * ⚠ "0 games" is never inferred from an old capture. A schedule captured days earlier cannot know about a
 * postseason game added since (2026-10-02's file, captured 09-26, says 0), and timestamp-only refreshes are
 * not committed, so an unchanged file keeps its first capture time. Uncertain ⇒ INPUT_UNAVAILABLE.
 *
 * Pure: the gate result, the schedule document and the clock are arguments.
 */
import { GATE } from "./pool-gate.mjs";

export const MLB_INPUT = Object.freeze({ READY: "READY", NO_EVENTS: "NO_EVENTS", INPUT_UNAVAILABLE: "INPUT_UNAVAILABLE" });

const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * @param gate      checkTeamMarketPool(...) result ({ verdict, detail })
 * @param schedule  app/public/data/mlb/statsapi-schedule/<date>.json, or null
 * @param date      the product date (ET), YYYY-MM-DD
 * @param nowIso    the run's clock
 * @returns {{ verdict, reason, gate: string }}
 */
export function classifyMlbInput({ gate, schedule, date, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("classifyMlbInput: nowIso required");
  const g = gate?.verdict ?? "UNKNOWN";
  if (g === GATE.OK || g === GATE.INPUT_EMPTY) return { verdict: MLB_INPUT.READY, gate: g, reason: gate.detail ?? g };

  if (g === GATE.INPUT_MISSING) {
    const at = Date.parse(schedule?.capturedAt ?? "");
    const established = schedule?.date === date
      && schedule?.gameCount === 0
      && Number.isFinite(at) && at <= now
      && etDay(schedule.capturedAt) === date;
    if (established) {
      return { verdict: MLB_INPUT.NO_EVENTS, gate: g, reason: `MLB StatsAPI schedule captured ${schedule.capturedAt} lists 0 games for ${date}` };
    }
    const why = !schedule ? "no StatsAPI schedule capture exists for the date"
      : schedule.date !== date ? `the StatsAPI capture is for ${schedule.date}`
        : schedule.gameCount !== 0 ? `the StatsAPI schedule lists ${schedule.gameCount} game(s) — the priced slate is missing`
          : `the StatsAPI capture saying 0 games is from ${schedule.capturedAt ?? "an unknown time"}, not from ${date} itself`;
    return { verdict: MLB_INPUT.INPUT_UNAVAILABLE, gate: g, reason: `${gate.detail}; ${why} — no-game status cannot be established` };
  }
  return { verdict: MLB_INPUT.INPUT_UNAVAILABLE, gate: g, reason: gate?.detail ?? `pool gate verdict ${g}` };
}
