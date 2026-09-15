/**
 * EPL TOTALS SHADOW RECEIPT (P305-F) — the shadow candidate against live P304, match by match, on totals.
 *
 * Every graded row of a P304 forecast that carried a shadow block is scored twice on the same match: P304's own total
 * distribution and the shadow's. The receipt compares their total-goals log losses PAIRED with the event bootstrap the
 * model-health scorecard uses, and reads the protocol's bars on the shadow's over lines, level and 1X2 guard:
 *
 *   ACCUMULATING          fewer paired matches than the registered minimum
 *   SHADOW_BETTER         the whole 95% interval of (shadow − P304) total log loss is below zero AND every bar passes
 *   SHADOW_WORSE          the whole interval is above zero
 *   SHADOW_INCONCLUSIVE   anything else (including better on the point estimate with a failed bar — the bar is named)
 *
 * Nothing here publishes or demotes. SHADOW_BETTER is evidence for a founder adoption decision, never an adoption.
 * Pure.
 */
import { comparePairedLoss } from "../../ops/model-health.mjs";

const LINES = [["over15", 1], ["over25", 2], ["over35", 3]];
function ece10(pairs) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const [p, o] of pairs) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.o += o; }
  const n = pairs.length;
  return n ? bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0) : null;
}
const r5 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(5)));

export function buildEplTotalsShadowReceipt({ gradedRows, frozen, nowIso }) {
  const rows = (gradedRows ?? []).filter((r) => r?.modelId === frozen.liveModelId && r?.shadowTotals?.shadow && r?.shadowTotals?.control
    && Number.isFinite(r.shadowTotals.shadow.totalLogLoss) && Number.isFinite(r.shadowTotals.control.totalLogLoss)
    && r.shadowTotals.modelId === frozen.shadowModelId
    && Date.parse(r.forecastGeneratedAt ?? "") >= Date.parse(frozen.startedAt));
  const diffs = rows.map((r) => r.shadowTotals.shadow.totalLogLoss - r.shadowTotals.control.totalLogLoss);
  const judgement = comparePairedLoss(diffs, { minN: frozen.minimumN, resamples: frozen.bootstrap.resamples, seed: frozen.bootstrap.seed });
  const mean = (f) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : null);
  const side = (k) => ({
    totalLogLoss: r5(mean((r) => r.shadowTotals[k].totalLogLoss)),
    over15Brier: r5(mean((r) => r.shadowTotals[k].over15.brier)),
    over25Brier: r5(mean((r) => r.shadowTotals[k].over25.brier)),
    over35Brier: r5(mean((r) => r.shadowTotals[k].over35.brier)),
    over15Ece: r5(ece10(rows.map((r) => [r.shadowTotals[k].over15.prob, r.shadowTotals[k].over15.observed ? 1 : 0]))),
    over25Ece: r5(ece10(rows.map((r) => [r.shadowTotals[k].over25.prob, r.shadowTotals[k].over25.observed ? 1 : 0]))),
    over35Ece: r5(ece10(rows.map((r) => [r.shadowTotals[k].over35.prob, r.shadowTotals[k].over35.observed ? 1 : 0]))),
    level: rows.length ? r5(mean((r) => r.shadowTotals[k].expectedTotal) / mean((r) => r.actual.totalGoals)) : null,
    oneXTwoLogLoss: r5(mean((r) => r.shadowTotals[k].oneXTwoLogLoss)),
    oneXTwoEce: r5(ece10(rows.flatMap((r) => ["home", "draw", "away"].map((o) => [r.shadowTotals[k].probs[o], r.actual.outcome === (o === "home" ? "H" : o === "draw" ? "D" : "A") ? 1 : 0])))),
  });
  const shadow = side("shadow");
  const control = side("control");
  const B = frozen.bars;
  const bars = rows.length >= frozen.minimumN
    ? {
        overLinesCalibrated: { pass: ["over15Ece", "over25Ece", "over35Ece"].every((k) => shadow[k] <= B.overEceMax), required: `over 1.5 / 2.5 / 3.5 reliability ECE each <= ${B.overEceMax}`, observed: { over15Ece: shadow.over15Ece, over25Ece: shadow.over25Ece, over35Ece: shadow.over35Ece } },
        level: { pass: shadow.level >= B.levelBand[0] && shadow.level <= B.levelBand[1], required: `mean predicted total / mean actual within [${B.levelBand}]`, observed: shadow.level },
        oneXTwoNotWorse: { pass: shadow.oneXTwoLogLoss - control.oneXTwoLogLoss <= B.oneXTwoTolerance && shadow.oneXTwoEce <= control.oneXTwoEce + B.oneXTwoEceTolerance, required: `1X2 log loss at most ${B.oneXTwoTolerance} above P304 and 1X2 ECE at most ${B.oneXTwoEceTolerance} above P304's, on the same matches`, observed: { logLoss: [shadow.oneXTwoLogLoss, control.oneXTwoLogLoss], ece: [shadow.oneXTwoEce, control.oneXTwoEce] } },
      }
    : null;
  const barsPass = bars ? Object.values(bars).every((b) => b.pass) : false;
  const state = judgement.state === "INSUFFICIENT_SAMPLE" ? "ACCUMULATING"
    : judgement.lo95 > 0 ? "SHADOW_WORSE"
      : judgement.hi95 < 0 && barsPass ? "SHADOW_BETTER"
        : "SHADOW_INCONCLUSIVE";
  return {
    schemaVersion: 1,
    artifact: "epl-totals-shadow-receipt",
    dataClass: "PRIVATE_RESEARCH",
    program: "305-F",
    updatedAt: nowIso,
    shadowModelId: frozen.shadowModelId,
    liveModelId: frozen.liveModelId,
    state,
    n: rows.length,
    needed: frozen.minimumN,
    pairedTotalLogLoss: { meanDifference: judgement.meanDiff, lo95: judgement.lo95, hi95: judgement.hi95 },
    shadow,
    control,
    bars,
    failedBars: bars ? Object.entries(bars).filter(([, b]) => !b.pass).map(([k]) => k) : null,
    rule: "Paired per-match total-goals log loss, shadow minus live P304, over graded P304 forecasts that carried the shadow block, made on or after startedAt. SHADOW_BETTER needs the whole 95% event-bootstrap interval below zero and every bar; SHADOW_WORSE the whole interval above zero. Nothing publishes from this receipt; public adoption is a founder decision.",
  };
}
