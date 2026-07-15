/**
 * MLB bullpen-fatigue feature #2 — leakage + bounded + product-safety + honest-verdict tests. The rating uses
 * ONLY strictly-earlier box scores (no target-game box/line/final), the engine adjustment is bounded, the
 * experiment is internal-only, and it did NOT beat the market so it is NOT adopted.
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

test("LEAKAGE: bullpen fatigue uses strictly-earlier box scores, excludes the target game", () => {
  const src = read("scripts/fetch-mlb-bullpen-usage.mjs");
  assert.match(src, /addDays\(targetDate, -k\)/, "aggregates only games in the prior calendar days");
  assert.match(src, /gamesStarted \|\| 0\) > 0.*continue|relievers only/i, "relievers only (gamesStarted=0)");
  // missing coverage → neutral (no adjustment): handled by usableBullpen requiring coverage !== "missing".
  const ref = readJson("data/internal/mlb/reference/mlb-bullpen-usage-2026-07-04-2026-07-09.json");
  assert.equal(ref._public, false);
  assert.equal(ref._internalOnly, true);
  assert.match(ref._leakageNote, /strictly before the target date|prior 3 calendar days/i);
});

test("engine bullpen adjustment is BOUNDED (±0.35 total / ±0.20 margin) and neutral when coverage missing", () => {
  const base = { gameId: "t", gamePk: 1, date: "2026-07-09", teams: { away: { name: "A" }, home: { name: "H" } }, market: { total: 9, homeWinProb: 0.5, awayWinProb: 0.5, runLine: { line: 1.5, favorite: "home" } } };
  const extreme = buildFullGameSimArtifact({ ...base, independent: { bullpenFatigue: { homeFatigueIndex: 999, awayFatigueIndex: 999, homeCoverage: "full", awayCoverage: "full" } } }, DEFAULT_SIM_OPTIONS);
  assert.ok(Math.abs(extreme.model.adjustments.bullpenTotalNudge) <= 0.35 + 1e-9, "total capped ±0.35");
  assert.ok(Math.abs(extreme.model.adjustments.bullpenMarginNudge) <= 0.2 + 1e-9, "margin capped ±0.20");
  // missing coverage → no bullpen adjustment
  const missing = buildFullGameSimArtifact({ ...base, independent: { bullpenFatigue: { homeFatigueIndex: 10, awayFatigueIndex: 10, homeCoverage: "missing", awayCoverage: "full" } } }, DEFAULT_SIM_OPTIONS);
  assert.equal(missing.model.adjustments.bullpenTotalNudge ?? 0, 0, "missing coverage → neutral");
});

test("bullpen-v1 artifacts are internal-only, public:false, notForProducts, correctly labelled", () => {
  for (const d of ["2026-07-04", "2026-07-07", "2026-07-09"]) {
    const j = readJson(`data/internal/mlb/full-game-sim-bullpen-v1/${d}.json`);
    assert.equal(j.public, false);
    assert.equal(j.internalOnly, true);
    assert.equal(j.notForProducts, true);
    assert.equal(j.officialMoneyRecordAffected, false);
    assert.equal(j.modelMode, "internal_mlb_bullpen_fatigue_v1");
    assert.ok(j.featureSet.includes("bullpen_fatigue_v1"));
  }
});

test("HONEST VERDICT: bullpen-v1 does not beat market on Brier+logLoss → not adopted (both features failed)", () => {
  const b = readJson("data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json").bullpenFatigueV1;
  assert.ok(b.n >= 60, `real sample (got ${b.n})`);
  assert.equal(b.beatsMarketOnBrierAndLogLoss, false, "does not beat market on both");
  assert.equal(b.adopted, false);
  assert.equal(b.publicReady, false);
  assert.match(b.note, /PAUSE MLB|NOT adopted/i, "recommends pausing after both features failed");
});

test("PRODUCT-SAFETY: no product / Mr-Dub builder imports the bullpen engine or its artifacts", () => {
  const dirs = ["src/lib/parlays", "src/lib/mr-dub"];
  const files = [];
  const walk = (d) => { const abs = path.join(APP, d); if (!fs.existsSync(abs)) return; for (const e of fs.readdirSync(abs, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else if (/\.(ts|mjs)$/.test(e.name) && !e.name.includes(".test.")) files.push(path.join(d, e.name)); } };
  dirs.forEach(walk);
  for (const e of fs.readdirSync(path.join(APP, "src/lib"))) if (/^(bank-builder|moonshot|product).*\.(ts|mjs)$/.test(e) && !e.includes(".test.")) files.push(path.join("src/lib", e));
  const offenders = files.filter((f) => /full-game-sim|bullpen-fatigue|bullpen-v1|bullpenFatigue|bullpen-usage/.test(read(f)));
  assert.deepEqual(offenders, [], `products must not import the bullpen engine; found: ${offenders.join(", ")}`);
});

test("LEAK: bullpen-v1 artifacts + bullpen-usage reference are NOT web-served", () => {
  for (const dir of ["public/data/mlb/full-game-sim-bullpen-v1", "public/data/mlb/reference"]) {
    assert.ok(!fs.existsSync(path.join(APP, dir)), `${dir} must not exist under app/public`);
  }
});
