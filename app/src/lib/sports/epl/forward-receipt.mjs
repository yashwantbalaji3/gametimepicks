/**
 * EPL BLIND FORWARD RECEIPT (P304 adoption) — the new match model against the one it replaced, match by match.
 *
 * Every graded row of a forecast made by the adopted model carries the previous model's probabilities for the same
 * match (the control). The receipt compares their log losses paired, with the event bootstrap the model-health
 * scorecard uses, so a noisy week cannot demote the model and a real shortfall cannot hide:
 *
 *   ACCUMULATING       fewer paired matches than the registered minimum
 *   FORWARD_HOLDING    not significantly worse than the previous model (WATCH when worse on the point estimate)
 *   FORWARD_BREACHED   significantly worse: the whole 95% interval of (new − previous) above zero —
 *                      match-model.mjs then publishes the previous model on the next build
 * Pure.
 */
import { comparePairedLoss } from "../../ops/model-health.mjs";

export function buildEplForwardReceipt({ gradedRows, modelId, frozen, nowIso }) {
  const rows = (gradedRows ?? []).filter((r) => r?.modelId === modelId && Number.isFinite(r?.scores?.logLoss) && Number.isFinite(r?.control?.logLoss)
    && Date.parse(r.forecastGeneratedAt ?? "") >= Date.parse(frozen.adoptedAt));
  const judgement = comparePairedLoss(rows.map((r) => r.scores.logLoss - r.control.logLoss), { minN: frozen.minimumN, resamples: frozen.bootstrap.resamples, seed: frozen.bootstrap.seed });
  const mean = (f) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : null);
  const state = judgement.state === "INSUFFICIENT_SAMPLE" ? "ACCUMULATING" : judgement.state === "BREACHED" ? "FORWARD_BREACHED" : "FORWARD_HOLDING";
  return {
    schemaVersion: 1,
    artifact: "epl-forward-receipt",
    dataClass: "PRIVATE_RESEARCH",
    program: "304",
    updatedAt: nowIso,
    modelId,
    controlModelIds: [...new Set(rows.map((r) => r.control.modelId))],
    state,
    watch: judgement.state === "WATCH",
    n: rows.length,
    needed: frozen.minimumN,
    modelLogLoss: mean((r) => r.scores.logLoss),
    controlLogLoss: mean((r) => r.control.logLoss),
    meanDifference: judgement.meanDiff,
    lo95: judgement.lo95,
    hi95: judgement.hi95,
    rule: "Paired per-match log loss, new model minus the model it replaced, forecasts generated on or after adoptedAt. FORWARD_BREACHED when the whole 95% event-bootstrap interval is above zero; the previous model then publishes again.",
  };
}
