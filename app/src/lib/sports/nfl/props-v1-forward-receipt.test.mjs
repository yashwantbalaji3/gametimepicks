import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readPropsV1PromotionBars, readShareLevelForwardBars, pOverFromQuantiles, thresholdEce, pointMetrics,
  judgePropsV1, judgeShareLevel, clusteredIntervals, stableJson,
} from "./props-v1-forward-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const EVALUATOR = "app/scripts/nfl/evaluate-nfl-player-props.mjs";
const EVALUATION = "data/internal/research/nfl/reports/player-props-v1-evaluation.json";
const PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const OUT = "data/internal/research/nfl/replay/props-v1-reception-yds-forward";
const SCRIPT = "scripts/research/nfl/forward-props-v1-reception-yds.mjs";

const v1Bars = () => readPropsV1PromotionBars({ evaluatorSource: rd(EVALUATOR), evaluationReceipt: JSON.parse(rd(EVALUATION)) });
const slBars = () => readShareLevelForwardBars(JSON.parse(rd(PREREG)));

test("N8 · props-v1 promotion bars are READ from the evaluator code and agree with the committed receipt's policy", () => {
  const b = v1Bars();
  const policy = JSON.parse(rd(EVALUATION)).promotionPolicy[0];
  assert.ok(policy.includes(`[${b.coverageBand[0]},${b.coverageBand[1]}]`) && policy.includes(`ECE ≤ ${b.eceMax}`) && policy.includes(`n ≥ ${b.minimumN}`));
  assert.equal(b.maePoint, "mean");
  assert.ok(b.eceMinBinN > 0 && b.eceBins > 0 && b.lineProxyGames > 0);
  // A bar edited in code but not in the receipt (or the reverse) is refused, never silently used.
  const relaxed = rd(EVALUATOR).replace(/thresholdCalibration\.ece <= ([0-9.]+);/, "thresholdCalibration.ece <= 0.09;");
  assert.throws(() => readPropsV1PromotionBars({ evaluatorSource: relaxed, evaluationReceipt: JSON.parse(rd(EVALUATION)) }), /disagrees/);
  assert.throws(() => readPropsV1PromotionBars({ evaluatorSource: "", evaluationReceipt: JSON.parse(rd(EVALUATION)) }), /could not read/);
});

test("N8 · share-level forward bars are the preregistration's frozen.bars, verbatim", () => {
  const F = JSON.parse(rd(PREREG)).frozen.bars;
  const b = slBars();
  assert.deepEqual([b.coverageBand, b.eceMax, b.levelBand, b.eceBins, b.minimumN], [F.coverageBand, F.eceMax, F.levelBand, F.eceBins, F.minimumN]);
  assert.equal(b.maePoint, "median");
});

test("N8 · P(over) from served quantiles: monotone, bounded, and bracketed by its step bounds", () => {
  const d = { p10: 2, p25: 10, median: 25, p75: 45, p90: 70 };
  let prev = 1;
  for (let line = 0; line <= 120; line += 2.5) {
    const r = pOverFromQuantiles(d, line);
    assert.ok(r.p >= 0 && r.p <= 1 && r.p <= prev + 1e-12);
    assert.ok(r.lo <= r.p + 1e-12 && r.p <= r.hi + 1e-12, `line ${line}`);
    prev = r.p;
  }
  assert.equal(pOverFromQuantiles(d, 25).p, 0.5);
  assert.equal(pOverFromQuantiles({ p10: 0, p25: 0, median: 8, p75: 20, p90: 35 }, 0).p, 0.75, "a point mass at zero: P(Y > 0) = 1 − 0.25");
  assert.equal(pOverFromQuantiles({ p10: 1 }, 3), null);
});

/* Synthetic, deterministic population: 40 games × 10 players. */
function fixture({ overconfident = false, biasLow = false } = {}) {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = [];
  for (let g = 0; g < 40; g += 1) {
    for (let k = 0; k < 10; k += 1) {
      const mu = 20 + 4 * k;
      const actual = Math.max(0, Math.round(mu + (rnd() - 0.5) * 2 * mu));
      const spread = overconfident ? 0.05 : 0.8;
      const m = biasLow ? mu * 0.7 : mu;
      const q = { p10: m * (1 - spread), p25: m * (1 - spread / 2), median: m, p75: m * (1 + spread / 2), p90: m * (1 + spread) };
      const line = mu * (0.6 + 0.8 * rnd());
      pts.push({ gameId: `g${String(g).padStart(2, "0")}`, week: 2 + (g % 8), actual, mean: m, ...q, rolling4: mu * 1.6, shareVol: mu * 1.5, line, pOver: pOverFromQuantiles(q, line), stateAtTeam: true });
    }
  }
  return pts;
}

test("N8 · a breach is DETECTED: overconfident ranges fail coverage and calibration on both bar sets", () => {
  const pts = fixture({ overconfident: true });
  const v1 = judgePropsV1(pointMetrics(pts, v1Bars()), v1Bars());
  const sl = judgeShareLevel(pointMetrics(pts, slBars()), slBars());
  assert.equal(v1.state, "FORWARD_BREACHED");
  assert.equal(v1.bars.coverOk, false);
  assert.equal(v1.bars.calOk, false);
  assert.equal(sl.state, "FORWARD_BREACHED");
  assert.equal(sl.bars.coverage80, false);
});

test("N8 · a model that runs low breaches the share-level level band while props-v1 bars (no level clause) are judged separately", () => {
  const sl = judgeShareLevel(pointMetrics(fixture({ biasLow: true }), slBars()), slBars());
  assert.equal(sl.state, "FORWARD_BREACHED");
  assert.equal(sl.bars.level, false);
});

test("N8 · below the minimum n there is NO verdict (ACCUMULATING)", () => {
  const few = fixture().slice(0, 120);
  assert.equal(judgePropsV1(pointMetrics(few, v1Bars()), v1Bars()).state, "ACCUMULATING");
  assert.equal(judgeShareLevel(pointMetrics(few, slBars()), slBars()).state, "ACCUMULATING");
  assert.equal(judgePropsV1(null, v1Bars()).state, "ACCUMULATING");
});

test("N8 · props-v1 ECE ignores bins under its minimum; the share-level ECE uses every bin", () => {
  const pairs = [...Array.from({ length: 60 }, (_, i) => ({ p: 0.55, hit: i < 33 ? 1 : 0 })), { p: 0.95, hit: 0 }];
  assert.equal(thresholdEce(pairs, { bins: 10, minBinN: 50 }).binsUsed, 1);
  assert.equal(thresholdEce(pairs, { bins: 10, minBinN: 0 }).binsUsed, 2);
});

test("N8 · metrics, verdicts and clustered intervals are deterministic (same points → identical bytes)", () => {
  const build = () => {
    const pts = fixture();
    return stableJson({ v1: judgePropsV1(pointMetrics(pts, v1Bars()), v1Bars()), iv: clusteredIntervals(pts, v1Bars(), { B: 200 }) });
  };
  assert.equal(build(), build());
});

/*
 * delete → regenerate → byte-identical, against the COMMITTED receipt at the commit it records. Needs the historical
 * board blobs locally: on a blob-less partial clone (CI's filter: blob:none) git would lazy-fetch ~100 blobs, so the
 * test skips there and says why — it never passes by asserting nothing.
 */
test("N8 · the committed receipt regenerates byte-for-byte from the commit it records", { timeout: 600_000 }, (t) => {
  const receipt = JSON.parse(rd(`${OUT}/receipt.json`));
  const env = { ...process.env, GIT_NO_LAZY_FETCH: "1" };
  const probe = receipt.events.ledger[0];
  const has = spawnSync("git", ["cat-file", "-e", `${probe.revision}:app/public/data/nfl/player-board/${probe.eventId}.json`], { cwd: ROOT, env });
  if (has.status !== 0) { t.skip("historical board blobs are not local (partial clone) — regeneration not attempted"); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "n8-regen-"));
  try {
    execFileSync(process.execPath, [path.join(ROOT, SCRIPT), "--rev", receipt.builtFromCommit, "--out-dir", dir], { cwd: ROOT, env, stdio: "pipe" });
    for (const f of ["receipt.json", "graded.json"]) assert.equal(fs.readFileSync(path.join(dir, f), "utf8"), rd(`${OUT}/${f}`), `${f} differs on regeneration`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
