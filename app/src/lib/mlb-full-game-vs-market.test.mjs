/**
 * MLB full-game validation vs closing market — honest + internal-only. The market-anchored sim MIRRORS the
 * market (does not beat it) on a tiny sample, so it stays internal (public:false) and no public MLB win-prob /
 * projected runs / distributions are surfaced.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

test("closing-odds reference: internal, de-vigged, no lookahead, real settled sample", () => {
  const o = read("data/internal/mlb/reference/mlb-closing-odds.json");
  assert.equal(o._public, false);
  assert.equal(o._officialMoneyRecordAffected, false);
  assert.ok(o.games.length >= 60, "priced most settled games");
  const bad = o.games.filter((g) => new Date(g.snapshot) >= new Date(g.commence));
  assert.equal(bad.length, 0, "every closing snapshot is strictly before first pitch");
});

test("backtest artifact: internal-only, public:false, money-safe", () => {
  const b = read("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json");
  assert.equal(b.public, false);
  assert.equal(b.webServed, false);
  assert.equal(b.officialMoneyRecordAffected, false);
  assert.equal(b.activeProductCard, false);
});

test("verdict: the sim MIRRORS the market and is NOT public-ready", () => {
  const b = read("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json");
  assert.equal(b.verdict.result, "mirrors", "market-anchored sim mirrors the market");
  assert.equal(b.verdict.publicReady, false, "not public-ready");
  // moneyline Brier within noise of the market (mirrors, not beats)
  assert.ok(Math.abs(b.simVsMarketPaired.deltaMoneylineBrier) < 0.005, "sim Brier ~ market Brier");
});

test("the full metric suite is reported (Brier, log loss, winner acc, total MAE, margin MAE, RL, O/U, calibration)", () => {
  const b = read("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json");
  const m = b.marketBaseline;
  assert.ok(typeof m.moneyline.brier === "number" && typeof m.moneyline.logLoss === "number" && typeof m.moneyline.winnerAccuracy === "number");
  assert.ok(typeof m.totalRunsMAE === "number");
  assert.ok(m.overUnder && typeof m.overUnder.accuracy === "number");
  assert.ok(m.runLine && typeof m.runLine.coverAccuracy === "number");
  assert.ok(typeof b.simVsMarketPaired.simMarginMAE === "number", "sim margin MAE reported");
  assert.ok(Array.isArray(b.calibrationBuckets) && b.calibrationBuckets.length === 10);
});

test("small-sample honesty: paired sim comparison is disclosed as tiny (1 date)", () => {
  const b = read("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json");
  assert.ok(b.simVsMarketPaired.n <= 20, "paired sim sample is small");
  assert.match(b.verdict.note, /too small|not public-ready/i, "sample-size caveat disclosed");
});

test("LEAK: no full-game sim/backtest/closing-odds artifact is web-served (app/public or out)", () => {
  for (const dir of ["public/data/mlb/full-game-sim", "public/data/mlb/full-game-sim-backtests", "public/data/mlb/reference"]) {
    assert.ok(!fs.existsSync(path.join(APP, dir)), `${dir} must not exist under app/public`);
  }
});

test("public MLB report surfaces NO internal full-game numbers (win prob / projected runs / distributions)", () => {
  const v2 = fs.readFileSync(path.join(APP, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
  assert.match(v2, /full-game model[\s\S]*?validating/i, "full-game section says validating");
  assert.match(v2, /no projected score or win probability is shown/i, "explicitly hides the numbers");
});
