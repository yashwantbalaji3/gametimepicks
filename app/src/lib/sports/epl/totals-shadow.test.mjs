/**
 * P305-F — the EPL totals SHADOW: the P305 goalRatios candidate beside live P304, private, graded paired.
 * It must reproduce the replay's arithmetic, never reach a public row, never run without its protocol and receipt,
 * and its receipt must judge exactly what the protocol registered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fitEloPoissonState } from "./elo-poisson.mjs";
import { fitGoalRatiosState, shadowScoreMatrix, shadowTotalsRow, EPL_TOTALS_SHADOW_MODEL_ID } from "./totals-shadow.mjs";
import { eplTotalsShadowDecision } from "./match-model.mjs";
import { buildEplTotalsShadowReceipt } from "./totals-shadow-receipt.mjs";

const REPO = path.resolve(process.cwd(), "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const p304 = readJson("data/internal/research/epl/reports/epl-history-replay-preregistration.json");
const p305 = readJson("data/internal/research/epl/reports/epl-totals-replay-preregistration.json");
const protocol = readJson("data/internal/research/epl/reports/epl-totals-shadow-forward-protocol.json");
const evaluation = readJson("data/internal/research/epl/reports/epl-totals-replay-evaluation.json");
const history = readJson("data/internal/research/soccer/epl/history-openfootball-v1.json");

test("the protocol names the receipt's better candidate and reads its constants from the P305 registration, unchanged", () => {
  const better = ["goalRatios", "tempo"].sort((a, b) => evaluation.results[a].blind.overall.totalLogLoss - evaluation.results[b].blind.overall.totalLogLoss)[0];
  assert.equal(protocol.candidate.replayName, better);
  assert.deepEqual(protocol.frozen.p305Registration.totals, p305.frozen.totals.goalRatios, "the protocol restates no constant of its own");
  assert.equal(protocol.frozen.shadowModelId, EPL_TOTALS_SHADOW_MODEL_ID);
  assert.equal(evaluation.verdicts.goalRatios.blind.verdict, "REJECTED", "the historical blind verdict stands — the shadow does not reinterpret it");
});

test("LIVE parity: dev season 2023-24 re-scored day by day reproduces the replay's total log loss for goalRatios", () => {
  const season = history.rows.filter((r) => r.season === "2023-24");
  const days = [...new Set(season.map((r) => r.dateUtc.slice(0, 10)))].sort();
  let ll = 0, n = 0, sdSum = 0;
  for (const day of days) {
    const cutoffIso = `${day}T00:00:00Z`;
    const live = fitEloPoissonState({ rows: history.rows, cutoffIso, frozen: p304.frozen });
    const ratios = fitGoalRatiosState({ rows: history.rows, cutoffIso, frozen: p305.frozen });
    for (const m of season.filter((r) => r.dateUtc.slice(0, 10) === day)) {
      const dist = shadowScoreMatrix(live, ratios, m.home, m.away, p305.frozen).totals.distribution;
      const total = m.ftHome + m.ftAway;
      ll -= Math.log(Math.max(1e-12, dist[Math.min(total, dist.length - 1)]));
      n += 1;
    }
  }
  assert.equal(n, 380);
  // reports/epl-totals-replay-dev-grid.txt, final --validate: 2023-24 goalRatios total LL 1.91256 (constant 1.92143)
  assert.ok(Math.abs(ll / n - 1.91256) < 5e-4, `module total log loss ${(ll / n).toFixed(5)} vs the replay's 1.91256`);
  assert.ok(ll / n < 1.92143 - 2e-3, "and it beats the constant total there, as the replay recorded");
});

test("a fixture's shadow differs from P304 only by the club multiplier; an unknown club is at ratio 1", () => {
  const cutoffIso = "2026-09-14T00:00:00Z";
  const live = fitEloPoissonState({ rows: history.rows, cutoffIso, frozen: p304.frozen });
  const ratios = fitGoalRatiosState({ rows: history.rows, cutoffIso, frozen: p305.frozen });
  const m = shadowScoreMatrix(live, ratios, "Arsenal", "Chelsea", p305.frozen);
  const base = live.lambdasFor("Arsenal", "Chelsea");
  assert.ok(Math.abs((m.lambdas.home + m.lambdas.away) - live.totalGoals * m.multiplier) < 2e-3, "total = league rate × multiplier");
  assert.ok(Math.abs((m.lambdas.home - m.lambdas.away) - (base.lamHome - base.lamAway)) < 2e-3, "supremacy is P304's");
  assert.deepEqual(ratios.ratiosFor("Nowhere Town"), { attack: 1, defence: 1, weight: 0 });
  assert.equal(ratios.multiplierFor("Nowhere Town", "Elsewhere United"), 1);
  const row = shadowTotalsRow(m, "protocol@x");
  assert.equal(row.modelId, EPL_TOTALS_SHADOW_MODEL_ID);
  assert.equal(row.totals.distribution.length, 21);
  assert.ok(Math.abs(row.totals.distribution.reduce((a, b) => a + b, 0) - 1) < 1e-4);
});

test("the shadow runs only beside adopted P304 with its protocol, registration and scored receipt present", () => {
  const ok = { selection: { adopted: true, modelId: "epl-model-v2-elo-poisson" }, protocol, registration: p305, evaluation };
  assert.equal(eplTotalsShadowDecision(ok).run, true);
  assert.equal(eplTotalsShadowDecision({ ...ok, selection: { adopted: false } }).run, false, "the previous model publishing = no shadow");
  assert.equal(eplTotalsShadowDecision({ ...ok, protocol: null }).run, false);
  assert.equal(eplTotalsShadowDecision({ ...ok, evaluation: null }).run, false, "an unscored candidate never runs");
  assert.equal(eplTotalsShadowDecision({ ...ok, registration: { frozen: {} } }).run, false);
});

const graded = (i, shadowLl, controlLl, over = {}) => ({
  modelId: "epl-model-v2-elo-poisson", forecastGeneratedAt: "2026-09-20T10:00:00Z", eventId: `e${i}`,
  actual: { totalGoals: 3, outcome: "H" },
  shadowTotals: {
    modelId: EPL_TOTALS_SHADOW_MODEL_ID,
    shadow: { totalLogLoss: shadowLl, expectedTotal: 2.9, over15: { prob: 0.8, observed: true, brier: 0.04 }, over25: { prob: 0.55, observed: true, brier: 0.2 }, over35: { prob: 0.3, observed: false, brier: 0.09 }, probs: { home: 0.5, draw: 0.25, away: 0.25 }, oneXTwoLogLoss: 0.693 },
    control: { totalLogLoss: controlLl, expectedTotal: 2.85, over15: { prob: 0.78, observed: true, brier: 0.05 }, over25: { prob: 0.52, observed: true, brier: 0.23 }, over35: { prob: 0.28, observed: false, brier: 0.08 }, probs: { home: 0.5, draw: 0.25, away: 0.25 }, oneXTwoLogLoss: 0.693 },
  },
  ...over,
});

test("the shadow receipt accumulates below the minimum, then judges paired totals with the registered bars", () => {
  const frozen = { ...protocol.frozen, minimumN: 60, bootstrap: { resamples: 500, seed: 7 } };
  const few = buildEplTotalsShadowReceipt({ gradedRows: Array.from({ length: 20 }, (_, i) => graded(i, 1, 2)), frozen, nowIso: "x" });
  assert.equal(few.state, "ACCUMULATING");
  assert.equal(few.bars, null, "no bar is read below the minimum");
  const better = buildEplTotalsShadowReceipt({ gradedRows: Array.from({ length: 120 }, (_, i) => graded(i, 1.8 + (i % 2 ? 0.2 : -0.2), 1.9 + (i % 2 ? 0.2 : -0.2))), frozen, nowIso: "x" });
  assert.ok(better.pairedTotalLogLoss.hi95 < 0);
  // every row says over 1.5/2.5 hit and over 3.5 missed at those probabilities: the reliability gap fails the ECE bar
  assert.equal(better.state, "SHADOW_INCONCLUSIVE", "better on log loss but a failed bar is not SHADOW_BETTER");
  assert.ok(better.failedBars.includes("overLinesCalibrated"));
  const worse = buildEplTotalsShadowReceipt({ gradedRows: Array.from({ length: 120 }, (_, i) => graded(i, 2.0 + (i % 2 ? 0.2 : -0.2), 1.8 + (i % 2 ? 0.2 : -0.2))), frozen, nowIso: "x" });
  assert.equal(worse.state, "SHADOW_WORSE");
});

test("only P304 forecasts made on or after startedAt with the registered shadow model count", () => {
  const frozen = { ...protocol.frozen, minimumN: 60, bootstrap: { resamples: 200, seed: 7 } };
  const rows = [
    ...Array.from({ length: 70 }, (_, i) => graded(i, 1, 1)),
    graded(900, 9, 1, { modelId: "epl-model-v1-split-poisson" }),
    graded(901, 9, 1, { forecastGeneratedAt: "2026-09-01T00:00:00Z" }),
    { ...graded(902, 9, 1), shadowTotals: { ...graded(902, 9, 1).shadowTotals, modelId: "some-other-shadow" } },
    { ...graded(903, 9, 1), shadowTotals: undefined },
  ];
  assert.equal(buildEplTotalsShadowReceipt({ gradedRows: rows, frozen, nowIso: "x" }).n, 70);
});

test("SOURCE PIN · the shadow rides the PRIVATE row only; the grader scores it; the workflow receipts and commits it", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const builder = src("scripts/epl/build-epl-forecasts.mjs");
  assert.match(builder, /shadowTotals: shadow\.state && \(out\.state === "CURRENT_PRE_EVENT" \|\| out\.state === "READY_EXCEPT_ODDS"\)/);
  const publicBlock = builder.slice(builder.indexOf("const publicRows = rows.map"), builder.indexOf("}));", builder.indexOf("const publicRows = rows.map")));
  assert.doesNotMatch(publicBlock, /shadowTotals|shadow\./, "publicRows never copies the shadow");
  /* v1.7 F2 repair: the scoring moved into scoreShadowTotalsBlock so the workflow's grader script can spread the
     SAME block — it never wrote one before, so no graded row carried a shadow and this receipt could not accumulate. */
  assert.match(src("src/lib/sports/epl/grade-forecasts.mjs"), /shadowTotals: \{ modelId: row\.shadowTotals\.modelId/);
  assert.match(src("src/lib/sports/epl/grade-forecasts.mjs"), /\.\.\.scoreShadowTotalsBlock\(fc\.row, actual, total\)/);
  assert.match(src("scripts/epl/grade-epl-forecasts.mjs"), /\.\.\.scoreShadowTotalsBlock\(fc\.row, actual, total\)/, "the grader the workflows run must score the shadow too");
  const wf = src("../.github/workflows/epl-matchweek.yml");
  assert.ok(wf.indexOf("build-epl-totals-shadow-receipt.mjs") < wf.indexOf("build-epl-forecasts.mjs"), "the receipt is rebuilt from the graded ledger before the forecasts");
  const commit = wf.slice(wf.indexOf("- name: Commit if anything changed"));
  assert.match(commit, /data\/internal\/research\/epl\/forward-totals/);
  assert.match(commit, /GENERATED_PATHS="[^"]*data\/internal\/research\/epl\/forward-totals/);
  assert.match(src("scripts/ops/build-model-health.mjs"), /epl_shadow_totals/, "the /ops scorecard shows the shadow, labelled as research");
});

test("LIVE · no public EPL forecast artifact carries a shadow block", () => {
  const dir = path.join(process.cwd(), "public/data/soccer/epl/forecasts");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), "utf8"), /shadowTotals/, `${f} leaks the shadow`);
  }
});
