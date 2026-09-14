import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEplForwardReceipt } from "./forward-receipt.mjs";
import { eplAdoptionDecision } from "./match-model.mjs";

const frozen = { adoptedAt: "2026-09-14T17:00:00Z", minimumN: 60, bootstrap: { resamples: 500, seed: 7 } };
const row = (i, newLl, oldLl, over = {}) => ({ modelId: "epl-model-v2-elo-poisson", forecastGeneratedAt: "2026-09-20T10:00:00Z", scores: { logLoss: newLl }, control: { modelId: "epl-model-v1-split-poisson", logLoss: oldLl }, eventId: `e${i}`, ...over });

test("below the minimum the receipt accumulates, whatever the numbers say", () => {
  const r = buildEplForwardReceipt({ gradedRows: Array.from({ length: 20 }, (_, i) => row(i, 2, 0.5)), modelId: "epl-model-v2-elo-poisson", frozen, nowIso: "2026-10-01T00:00:00Z" });
  assert.equal(r.state, "ACCUMULATING");
  assert.equal(r.n, 20);
});

test("a sustained shortfall against the replaced model breaches; parity holds", () => {
  const worse = Array.from({ length: 120 }, (_, i) => row(i, 1.1 + (i % 2 ? 0.3 : -0.3), 1.0 + (i % 2 ? 0.3 : -0.3)));
  assert.equal(buildEplForwardReceipt({ gradedRows: worse, modelId: "epl-model-v2-elo-poisson", frozen, nowIso: "x" }).state, "FORWARD_BREACHED");
  const even = Array.from({ length: 120 }, (_, i) => row(i, 1.0 + (i % 2 ? 0.02 : -0.02), 1.0));
  assert.equal(buildEplForwardReceipt({ gradedRows: even, modelId: "epl-model-v2-elo-poisson", frozen, nowIso: "x" }).state, "FORWARD_HOLDING");
});

test("only the adopted model's forecasts made on or after adoption, with a scored control, count", () => {
  const rows = [
    ...Array.from({ length: 70 }, (_, i) => row(i, 1, 1)),
    row(900, 9, 1, { modelId: "epl-model-v1-split-poisson" }),
    row(901, 9, 1, { forecastGeneratedAt: "2026-09-01T00:00:00Z" }),
    { ...row(902, 9, 1), control: undefined },
  ];
  assert.equal(buildEplForwardReceipt({ gradedRows: rows, modelId: "epl-model-v2-elo-poisson", frozen, nowIso: "x" }).n, 70);
});

test("adoption decision: ELIGIBLE replay, no breach, history present", () => {
  const ok = { evaluation: { verdict: "ELIGIBLE" }, forwardReceipt: null, historyRows: [{}] };
  assert.equal(eplAdoptionDecision(ok).adopted, true);
  assert.equal(eplAdoptionDecision({ ...ok, evaluation: { verdict: "REJECTED" } }).adopted, false);
  assert.equal(eplAdoptionDecision({ ...ok, forwardReceipt: { state: "FORWARD_BREACHED" } }).adopted, false);
  assert.equal(eplAdoptionDecision({ ...ok, historyRows: [] }).adopted, false);
});

test("SOURCE PIN · team forecasts and player projections share one model selection; the workflow rebuilds the receipt first and commits it", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("scripts/epl/build-epl-forecasts.mjs"), /selectEplMatchModel\(\{ repoRoot: REPO, nowIso: NOW, seasonClubs \}\)/);
  assert.match(src("scripts/epl/build-epl-player-projections.mjs"), /selectEplMatchModel\(\{ repoRoot: REPO, nowIso: NOW \}\)\.state/);
  const wf = src("../.github/workflows/epl-matchweek.yml");
  assert.ok(wf.indexOf("build-epl-forward-receipt.mjs") < wf.indexOf("build-epl-forecasts.mjs"), "a breach demotes in the same run");
  assert.ok(wf.indexOf("capture-openfootball.mjs --leagues epl") < wf.indexOf("build-epl-forecasts.mjs"));
  const commit = wf.slice(wf.indexOf("- name: Commit if anything changed"));
  assert.match(commit, /data\/internal\/research\/epl\/forward/);
  assert.match(commit, /data\/internal\/research\/soccer\/epl/);
});
