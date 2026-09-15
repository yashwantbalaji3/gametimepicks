/**
 * LIVE-RECORD GATE (founder-approved 2026-09-14) — a published call whose live record is significantly worse
 * than its floor stops showing its probability until the record recovers.
 *
 * The model-health scorecard (scripts/ops/build-model-health.mjs → public/data/admin/model-health.json) judges
 * each family's graded record against a coin flip with an event-bootstrap interval. BREACHED means the whole 95%
 * interval sits on the wrong side. For those families the reader-facing surfaces show the call as paused,
 * while generation and grading continue underneath, so the next nightly scorecard can lift the pause by itself.
 *
 * Pure: callers read the scorecard file and pass it in. A missing or stale scorecard pauses nothing (the gate
 * never invents a verdict it did not measure).
 *
 * Wired: MLB game total (over/under), moneyline (winner call) and run line. Each pause mirrors the first one —
 * the CALL and its probability go, the simulation's evidence (projected score, simulated runs) stays. A paused
 * moneyline also withdraws `predictedWinner`, which every surface derives the winner headline from; otherwise the
 * paused call would keep publishing in prose.
 */

export const MLB_TOTAL_FAMILY = "mlb_total";
export const MLB_MONEYLINE_FAMILY = "mlb_moneyline";
export const MLB_RUN_LINE_FAMILY = "mlb_run_line";
export const PAUSED_TOTAL_SHORT = "Paused · its live record is below a coin flip";
export const PAUSED_MONEYLINE_SHORT = PAUSED_TOTAL_SHORT;
export const PAUSED_RUN_LINE_SHORT = PAUSED_TOTAL_SHORT;
const pausedReason = (call) =>
  `Paused: over its graded record, this ${call} has done worse than a coin flip. It is still made and graded every day and comes back here when its record recovers.`;
export const PAUSED_TOTAL_REASON = pausedReason("over/under call");
export const PAUSED_MONEYLINE_REASON = pausedReason("winner call");
export const PAUSED_RUN_LINE_REASON = pausedReason("run-line call");

/** Family ids the scorecard currently marks BREACHED — empty when the scorecard is absent or older than maxAgeHours. */
export function pausedFamiliesFrom(scorecard, nowMs, { maxAgeHours = 72 } = {}) {
  const at = Date.parse(scorecard?.generatedAt ?? "");
  if (!Number.isFinite(at) || !Number.isFinite(nowMs) || nowMs - at > maxAgeHours * 3600e3 || at - nowMs > 3600e3) return new Set();
  return new Set((scorecard.families ?? []).filter((f) => f?.state === "BREACHED" && typeof f.id === "string").map((f) => f.id));
}

/**
 * An MLB game decision with its total paused: no pick, no probabilities, the reason on the record. Every surface
 * already renders an UNAVAILABLE total without a probability, so the pause needs no new display path to be safe.
 * @template T
 * @param {T} decision
 * @param {Set<string>} paused
 * @returns {T}
 */
export function pauseMlbTotal(decision, paused) {
  if (!decision?.total || !paused?.has(MLB_TOTAL_FAMILY) || decision.total.pick === "UNAVAILABLE") return decision;
  return {
    ...decision,
    total: { ...decision.total, pick: "UNAVAILABLE", overProbability: null, underProbability: null, pushProbability: null, strengthLabel: null, unavailableReason: PAUSED_TOTAL_SHORT, pausedReason: PAUSED_TOTAL_REASON },
  };
}

/**
 * The winner call paused: no moneyline, no predicted winner (the headline every surface derives from it), the
 * reason on `pausedReasons.moneyline`. The projected score and the simulated win frequencies in the artifact are
 * evidence and stay where the surfaces already show them as such.
 * @template T
 * @param {T} decision
 * @param {Set<string>} paused
 * @returns {T}
 */
export function pauseMlbMoneyline(decision, paused) {
  if (!decision?.moneyline || !paused?.has(MLB_MONEYLINE_FAMILY)) return decision;
  return {
    ...decision,
    moneyline: null,
    predictedWinner: null,
    pausedReasons: { ...(decision.pausedReasons ?? {}), moneyline: PAUSED_MONEYLINE_REASON },
    unavailableReasons: [...(decision.unavailableReasons ?? []), `Moneyline: ${PAUSED_MONEYLINE_SHORT}.`],
  };
}

/**
 * The run-line call paused: no run line, the reason on `pausedReasons.runLine`.
 * @template T
 * @param {T} decision
 * @param {Set<string>} paused
 * @returns {T}
 */
export function pauseMlbRunLine(decision, paused) {
  if (!decision?.runLine || !paused?.has(MLB_RUN_LINE_FAMILY)) return decision;
  return {
    ...decision,
    runLine: null,
    pausedReasons: { ...(decision.pausedReasons ?? {}), runLine: PAUSED_RUN_LINE_REASON },
    unavailableReasons: [...(decision.unavailableReasons ?? []), `Run line: ${PAUSED_RUN_LINE_SHORT}.`],
  };
}

/** Every MLB game-market pause in one call — the ONE place the decision is gated (game-detail.ts). */
export function pauseMlbMarkets(decision, paused) {
  return pauseMlbRunLine(pauseMlbMoneyline(pauseMlbTotal(decision, paused), paused), paused);
}
