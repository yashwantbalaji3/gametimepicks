/**
 * EPL research-corpus guards (Program 148 · Release C).
 *
 * The corpus and its derived reports are PRIVATE research artifacts, but private does not mean
 * unguarded — a leaked future, a silently short season, or a drifting regeneration would poison
 * every conclusion drawn later. These guards pin the properties the analysis depends on.
 *
 * Run: npx tsx --test src/lib/soccer/epl-research.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "epl");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

test("corpus: four complete seasons of exactly 380, zero quarantined, private-research class", () => {
  const c = read("corpus-v1.json");
  assert.equal(c.dataClass, "PRIVATE_RESEARCH");
  assert.equal(c.totalMatches, 1520);
  assert.equal(c.quarantinedCount, 0, `quarantined: ${JSON.stringify(c.quarantined?.slice(0, 3))}`);
  assert.deepEqual(Object.keys(c.seasons).sort(), ["2022-23", "2023-24", "2024-25", "2025-26"]);
  for (const [s, n] of Object.entries(c.seasons)) assert.equal(n, 380, `${s} must be complete — a silent gap biases every baseline`);
});

test("corpus rows: chronologically sorted, results consistent with goals, canonical clubs only", () => {
  const c = read("corpus-v1.json");
  let prev = "";
  const clubs = new Set();
  for (const r of c.rows) {
    assert.ok(r.dateUtc >= prev, "rows must be chronologically ordered — walk-forward depends on it");
    prev = r.dateUtc;
    const expect = r.ftHome > r.ftAway ? "H" : r.ftHome < r.ftAway ? "A" : "D";
    assert.equal(r.result, expect, `${r.home} v ${r.away}: result must derive from goals`);
    clubs.add(r.home); clubs.add(r.away);
  }
  // 4 seasons of a 20-club league with promotion/relegation churn: bounded, never 20, never huge.
  assert.ok(clubs.size >= 24 && clubs.size <= 32, `club universe ${clubs.size} outside plausible bounds`);
  for (const club of clubs) assert.ok(!/\bFC\b|\bAFC\b/.test(club), `"${club}" looks raw, not canonical`);
});

test("evaluation: warm-up excluded, uniform reference is exactly ln(3), baselines beat it", () => {
  const r = read("reports", "baseline-evaluation-v1.json");
  assert.equal(r.dataClass, "PRIVATE_RESEARCH");
  assert.equal(r.corpus.evaluated, 1140, "1520 minus the 380 warm-up matches — every prediction accounted for");
  assert.ok(Math.abs(r.models.uniform.overall.logLoss - Math.log(3)) < 0.001, "uniform log loss must equal ln(3) — the arithmetic sanity anchor");
  const ll = (k) => r.models[k].overall.logLoss;
  assert.ok(ll("empirical") < ll("uniform"), "empirical must beat uniform");
  assert.ok(ll("elo") < ll("empirical") && ll("poisson") < ll("empirical"), "strength-aware baselines must beat the strength-blind one");
  // The claim-discipline line: these are BASELINES. Nothing here asserts market superiority,
  // and the report itself must say the no-vig comparison is absent, not imply it happened.
  const md = fs.readFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.md"), "utf8");
  assert.match(md, /No market\/no-vig comparison ships in v1/);
});

test("scoreline artifact: fit cutoff precedes every fixture, actuals shown with the model's own miss probabilities", () => {
  const s = read("simulations", "scoreline-sim-2025-26-md38.json");
  assert.equal(s.dataClass, "PRIVATE_RESEARCH");
  assert.equal(s.fixtures.length, 10);
  for (const f of s.fixtures) {
    assert.ok(f.fitCutoffDate <= f.dateUtc.slice(0, 10), "THE LEAKAGE RULE: fit strictly precedes the slate");
    const sum = f.threeWay.H + f.threeWay.D + f.threeWay.A;
    assert.ok(Math.abs(sum - 1) < 0.001, "three-way probabilities must sum to 1");
    assert.ok(f.actual?.score && typeof f.actual.modelProbOfActualResult === "number",
      "a validation artifact that hides its misses is marketing — actuals are mandatory");
  }
});

test("DETERMINISM · re-running the scoreline script with the same --now reproduces the artifact byte-for-byte", () => {
  const file = path.join(ROOT, "simulations", "scoreline-sim-2025-26-md38.json");
  const before = fs.readFileSync(file);
  const gen = read("simulations", "scoreline-sim-2025-26-md38.json").generatedAt;
  execFileSync("node", [path.join(APP, "scripts", "epl", "simulate-epl-scorelines.mjs"), "--now", gen], { cwd: APP });
  const after = fs.readFileSync(file);
  assert.ok(before.equals(after), "regeneration drifted — the simulation is supposed to be closed-form deterministic");
});

test("the capture manifest records rights + the current-season quarantine receipt", () => {
  const m = read("raw", "CAPTURE_MANIFEST.json");
  assert.ok(m.files.length >= 6);
  for (const f of m.files) assert.ok(f.license && f.source, `${f.file} must record source + license`);
  const forward = m.files.find((f) => f.file.includes("2026-27"));
  assert.match(forward.note, /Coventry City|membership/, "the 2026-27 display quarantine must be recorded where the data lives");
});
