/**
 * MLB pitcher-strength feature #1 — leakage + product-safety + honest-verdict tests. The rating uses ONLY
 * strictly-earlier starts (no final scores / linescores), the engine adjustment is bounded, the experiment is
 * internal-only (public:false, out of every product), and it did NOT beat the market so it is NOT adopted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS } from "./full-game-sim/mlb/index.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

test("LEAKAGE: pitcher ratings use strictly-earlier starts and NO settled scores / linescores", () => {
  const fetchSrc = read("scripts/fetch-mlb-pitcher-stats.mjs");
  assert.match(fetchSrc, /r\.date < beforeDate/, "aggregates only starts before the game date (strictly-earlier)");
  // Ratings come from the pitcher's own game-log stats (s.stat.*), NOT the predicted game's outcome.
  assert.match(fetchSrc, /s\.stat\.earnedRuns/, "rating uses the pitcher's own prior-start stats");
  // Must NOT read the settled-score / linescore artifacts for feature construction.
  assert.doesNotMatch(fetchSrc, /\/linescores\/|full-game-sim-backtests|market-vs-sim/, "does not read settled scores / linescores");
  const ref = readJson("data/internal/mlb/reference/mlb-pitcher-strength.json");
  assert.equal(ref._public, false);
  assert.equal(ref._officialMoneyRecordAffected, false);
  assert.match(ref._leakageNote, /strictly-earlier|date < the game date/i, "leakage discipline disclosed");
});

test("the engine pitcher adjustment is BOUNDED (±0.5 total / ±0.3 margin) — cannot dominate the market", () => {
  const base = { gameId: "t", gamePk: 1, date: "2026-07-09", teams: { away: { name: "A" }, home: { name: "H" } }, market: { total: 9, homeWinProb: 0.5, awayWinProb: 0.5, runLine: { line: 1.5, favorite: "home" } } };
  // extreme (beyond-real) ratings must still be capped
  const extreme = buildFullGameSimArtifact({ ...base, independent: { homeStarterRunsSaved9: 5, awayStarterRunsSaved9: -5, starterSampleGames: { home: 20, away: 20 } } }, DEFAULT_SIM_OPTIONS);
  const adj = extreme.model.adjustments;
  assert.ok(Math.abs(adj.pitcherTotalNudge) <= 0.5 + 1e-9, "total nudge capped at ±0.5");
  assert.ok(Math.abs(adj.pitcherMarginNudge) <= 0.3 + 1e-9, "margin nudge capped at ±0.3");
  assert.equal(extreme.model.inputCoverage.pitcherStrength, true, "pitcher coverage flagged when rated");
});

test("pitcher-v1 sim artifacts are internal-only, public:false, correctly labelled", () => {
  for (const d of ["2026-07-04", "2026-07-06", "2026-07-09"]) {
    const j = readJson(`data/internal/mlb/full-game-sim-pitcher-v1/${d}.json`);
    assert.equal(j.public, false, `${d} public:false`);
    assert.equal(j.internalOnly, true);
    assert.equal(j.officialMoneyRecordAffected, false);
    assert.equal(j.modelMode, "internal_mlb_pitcher_strength_v1");
    assert.ok(Array.isArray(j.featureSet) && j.featureSet.some((f) => /pitcher|starter|fip/i.test(f)), "featureSet lists pitcher strength");
  }
});

test("HONEST VERDICT: pitcher-v1 does not beat the market on Brier+logLoss → mirrors, NOT adopted", () => {
  const b = readJson("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json");
  const p = b.pitcherStrengthV1;
  assert.ok(p.n >= 60, `real sample (got ${p.n})`);
  assert.equal(p.beatsMarketOnBrierAndLogLoss, false, "does not beat market on both metrics");
  assert.equal(p.adopted, false, "not adopted");
  assert.match(p.passBar, /BOTH Brier AND log loss/i, "pass bar is Brier AND log loss, not winner accuracy");
  // winner accuracy went UP but that's not the bar — the proper scores mirror.
  assert.ok(Math.abs(p.deltaVsMarket.brier) < 0.005 && Math.abs(p.deltaVsMarket.logLoss) < 0.005, "Brier + logLoss within noise of market");
});

test("PRODUCT-SAFETY: no product / Mr-Dub builder imports the pitcher engine or its artifacts", () => {
  const dirs = ["src/lib/parlays", "src/lib/mr-dub"];
  const files = [];
  const walk = (d) => { const abs = path.join(APP, d); if (!fs.existsSync(abs)) return; for (const e of fs.readdirSync(abs, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else if (/\.(ts|mjs)$/.test(e.name) && !e.name.includes(".test.")) files.push(path.join(d, e.name)); } };
  dirs.forEach(walk);
  for (const e of fs.readdirSync(path.join(APP, "src/lib"))) if (/^(bank-builder|moonshot|product).*\.(ts|mjs)$/.test(e) && !e.includes(".test.")) files.push(path.join("src/lib", e));
  const offenders = files.filter((f) => /full-game-sim|pitcher-strength|pitcher-v1|StarterRunsSaved/.test(read(f)));
  assert.deepEqual(offenders, [], `products must not import the pitcher engine; found: ${offenders.join(", ")}`);
});

test("LEAK: pitcher-v1 artifacts + pitcher-strength reference are NOT web-served", () => {
  for (const dir of ["public/data/mlb/full-game-sim-pitcher-v1", "public/data/mlb/reference"]) {
    assert.ok(!fs.existsSync(path.join(APP, dir)), `${dir} must not exist under app/public`);
  }
});
