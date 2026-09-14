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
 * Wired today: MLB game total (over/under). Moneyline and run line are scored and alarmed on /ops, but a pause for
 * them is not wired because their published shapes carry a required probability.
 */

export const MLB_TOTAL_FAMILY = "mlb_total";
export const PAUSED_TOTAL_SHORT = "Paused · its live record is below a coin flip";
export const PAUSED_TOTAL_REASON =
  "Paused: over its graded record, this over/under call has done worse than a coin flip. It is still made and graded every day and comes back here when its record recovers.";

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
