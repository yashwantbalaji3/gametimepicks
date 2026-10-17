/**
 * P303 — model health judges live results against a baseline with an interval, so small samples cannot raise a
 * false alarm and a real, sustained shortfall cannot hide behind a lucky week.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { comparePairedLoss, judgeCoverage, judgeLevel, worstHealth, logLossOf } from "./model-health.mjs";

test("paired loss: below the minimum there is no verdict in either direction", () => {
  const r = comparePairedLoss([0.5, 0.5, 0.5], { minN: 30 });
  assert.equal(r.state, "INSUFFICIENT_SAMPLE");
  assert.equal(r.meanDiff, 0.5);
});

test("paired loss: a small point shortfall with a wide interval is WATCH, not BREACHED", () => {
  // 31 fights, a model slightly worse than a coin flip on average, with the per-fight noise real fights have.
  const diffs = Array.from({ length: 31 }, (_, i) => (i % 2 ? 0.45 : -0.41));
  const r = comparePairedLoss(diffs, { minN: 30 });
  assert.ok(r.meanDiff > 0);
  assert.ok(r.lo95 < 0, "the interval includes no difference");
  assert.equal(r.state, "WATCH");
});

test("paired loss: a sustained shortfall is BREACHED; a model beating its baseline is HOLDING", () => {
  const worse = Array.from({ length: 400 }, (_, i) => 0.05 + (i % 2 ? 0.3 : -0.3));
  assert.equal(comparePairedLoss(worse, { minN: 100 }).state, "BREACHED");
  const better = worse.map((d) => -d);
  assert.equal(comparePairedLoss(better, { minN: 100 }).state, "HOLDING");
});

test("paired loss is deterministic for the same ledger", () => {
  const diffs = Array.from({ length: 120 }, (_, i) => Math.sin(i) * 0.4 + 0.01);
  assert.deepEqual(comparePairedLoss(diffs, { minN: 50 }), comparePairedLoss(diffs, { minN: 50 }));
});

test("coverage: 80% ranges judged two-sided, with the direction named", () => {
  assert.equal(judgeCoverage({ hits: 80, n: 100, target: 0.8, minN: 50 }).state, "HOLDING");
  const narrow = judgeCoverage({ hits: 60, n: 100, target: 0.8, minN: 50 });
  assert.equal(narrow.state, "BREACHED");
  assert.equal(narrow.direction, "ranges too narrow");
  assert.equal(judgeCoverage({ hits: 73, n: 100, target: 0.8, minN: 50 }).state, "HOLDING", "z = -1.75 is inside the band");
  assert.equal(judgeCoverage({ hits: 72, n: 100, target: 0.8, minN: 50 }).state, "WATCH");
  assert.equal(judgeCoverage({ hits: 40, n: 45, target: 0.8, minN: 50 }).state, "INSUFFICIENT_SAMPLE");
});

test("level: one week's touchdown gap (37.6 expected, 47 scored over 168) is not yet an alarm; the same gap sustained is", () => {
  const week = (k) => ({ probabilities: Array.from({ length: 168 * k }, () => 37.6 / 168), outcomes: Array.from({ length: 168 * k }, (_, i) => (i % 168 < 47 ? 1 : 0)) });
  const one = judgeLevel({ ...week(1), minN: 150 });
  assert.ok(one.z > 1.5 && one.z < 1.96, `z ${one.z}`);
  assert.equal(one.state, "HOLDING", "a single week's shortfall sits inside the band");
  const four = judgeLevel({ ...week(4), minN: 150 });
  assert.equal(four.state, "BREACHED");
  assert.equal(four.direction, "probabilities run low");
});

test("worst state and a finite log loss for a failed certainty", () => {
  assert.equal(worstHealth(["HOLDING", "WATCH", "INSUFFICIENT_SAMPLE"]), "WATCH");
  assert.equal(worstHealth([]), "INSUFFICIENT_SAMPLE");
  assert.ok(Number.isFinite(logLossOf(0)));
});

test("SOURCE PIN · the nightly settle job builds model health AND commits what it builds", () => {
  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/nightly-settle.yml"), "utf8");
  assert.match(wf, /scripts\/ops\/build-model-health\.mjs/, "the builder runs");
  assert.match(wf, /git add app\/public\/data\/admin\/(?:model-health\.json)?\s/, "an artifact built and never committed is the 62-hour-outage shape");
});

test("SOURCE PIN · the scorecard builder reads both blind forward receipts, so a breach is visible on /ops", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ops/build-model-health.mjs"), "utf8");
  assert.match(src, /player-props-share-level-forward\/receipt\.json/, "NFL share-level forward receipt");
  assert.match(src, /epl\/forward\/receipt\.json/, "EPL match-model forward receipt");
  assert.match(src, /FORWARD_BREACHED/, "its BREACHED state is mapped, not dropped");
});

test("G1 · the EPL live record is judged on the LIVE model's rows only, never the pooled ledger (2026-10-17)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ops/build-model-health.mjs"), "utf8");
  assert.match(src, /const liveModelId = readJson\(path\.join\(ROOT, "app\/public\/data\/soccer\/epl\/forecasts\/latest\.json"\)\)\?\.gradedRecord\?\.modelId \?\? null;/);
  assert.match(src, /const live = liveModelId \? rows\.filter\(\(r\) => r\.modelId === liveModelId\) : \[\];/, "no live model id ⇒ nothing attributable ⇒ nothing judged");
  assert.match(src, /const losses = live\.map\(/, "the judgement reads the live rows, not the ledger");
  // Consistency on committed data: the health gate's live rows are exactly what /epl prints as "graded under this model".
  const fc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/soccer/epl/forecasts/latest.json"), "utf8"));
  const ledger = fs.readFileSync(path.join(process.cwd(), "public/data/soccer/epl/results/graded-forecasts.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const live = ledger.filter((r) => r.modelId === fc.gradedRecord?.modelId);
  assert.ok(fc.gradedRecord?.modelId, "the forecast builder publishes the live model id");
  assert.equal(live.length, fc.gradedRecord.gradedUnderThisModel, "health and /epl count the same live rows");
  assert.equal(ledger.length - live.length, (fc.gradedRecord.priorModels ?? []).reduce((s, p) => s + p.graded, 0) + (fc.gradedRecord.unattributed ?? 0));
});
