/**
 * NBA research-vertical guards (Program 152 · Release A).
 *
 * Run: npx tsx --test src/lib/sports/research/nba-research.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validateResearchArtifact } from "./artifact-modes.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nba");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

test("corpus: three seasons at exactly 1,230 regular finals, 30 franchises, no ties possible, exhibitions quarantined", () => {
  const c = read("corpus-v1.json");
  assert.equal(c.dataClass, "PRIVATE_RESEARCH");
  assert.equal(c.totalFinals, 4179);
  for (const s of ["2024", "2025", "2026"]) {
    assert.equal(c.seasons[s].regular, 1230, `${s} regular season must be complete`);
    assert.equal(c.seasons[s]["cup-final"], 1, `${s}: the NBA Cup final is its own phase, not a standings game`);
    assert.equal(c.seasons[s]["play-in"], 6, `${s}: play-in membership`);
  }
  assert.ok(c.quarantined.some((q) => /All-Star exhibition/.test(q.reason)), "both All-Star formats must be visibly excluded");
  const franchises = new Set(c.rows.filter((r) => r.phase === 2).flatMap((r) => [r.home, r.away]));
  assert.equal(franchises.size, 30);
  let prev = "";
  for (const r of c.rows) {
    assert.ok(r.dateUtc >= prev, "chronological order is the walk-forward substrate");
    prev = r.dateUtc;
    assert.notEqual(r.ftHome, r.ftAway, "basketball has no drawn finals — the builder refuses them upstream");
  }
});

test("evaluation: coin anchors at ln(2), Elo beats the references, preseason policy stated, market comparison honest", () => {
  const r = read("reports", "baseline-evaluation-v1.json");
  assert.ok(Math.abs(r.winner.coin.overall.logLoss - Math.log(2)) < 0.001);
  assert.ok(r.winner.elo.overall.logLoss < r.winner.homerate.overall.logLoss);
  assert.ok(r.winner.elo.overall.n >= 2500, "two full evaluated seasons");
  assert.match(r.corpus.preseasonPolicy, /never fit, never evaluated/);
  assert.match(r.marketComparison, /unavailable/);
  assert.ok(r.winner.elo.byPhase.playoffs.n >= 150, "phase buckets are populated");
  assert.ok(r.winner.elo.calibration.some((b) => b.n > 0));
});

test("replay: shared-harness artifact validates; frozen-state conservatism is stated; actuals mandatory", () => {
  const a = read("replays", "replay-2026-postseason.json");
  assert.equal(validateResearchArtifact(a).ok, true);
  assert.equal(a.mode, "HISTORICAL_REPLAY");
  assert.equal(a.evaluationEligible, true);
  assert.equal(a.predictions.length, 91, "6 play-in + 85 playoff games");
  assert.equal(a.quarantinedCount, 0);
  for (const p of a.predictions) assert.ok(p.dateUtc.slice(0, 10) >= a.sourceCutoffIso.slice(0, 10), "THE LEAKAGE RULE");
  assert.match(a.predictions[0].frozenStateNote ?? "", /no intra-postseason updates/);
  for (const v of a.validation) assert.ok(v.actualScore && typeof v.modelProbOfActualResult === "number");
});

test("DETERMINISM · re-running the replay reproduces the artifact byte-for-byte", () => {
  const file = path.join(ROOT, "replays", "replay-2026-postseason.json");
  const before = fs.readFileSync(file);
  const gen = read("replays", "replay-2026-postseason.json").generatedAt;
  execFileSync("node", [path.join(APP, "scripts", "nba", "replay-nba-postseason.mjs"), "--season", "2026", "--now", gen], { cwd: APP });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test("manifest counts every request and records the leap-day lesson; model card states activation OFF", () => {
  const m = read("raw", "CAPTURE_MANIFEST.json");
  assert.equal(m.source.requestCount, 28);
  assert.match(m.source.windows, /leap day/, "the missed 2024-02-29 is recorded where the data lives");
  assert.match(m.completenessClaim, /retrieval only/);
  const card = read("model-card-v1.json");
  assert.equal(card.publicActivation, "OFF — founder decision; research readiness is not product activation");
  assert.ok(card.metrics.elo.logLoss && card.metrics.elo.n, "a card without metrics+denominator is a contradiction");
  assert.match(card.limitations.join(" "), /frozen|cold start|injur/i, "limitations are named, not implied");
});
