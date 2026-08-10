/**
 * NFL research-vertical guards (Program 151 · Release A).
 *
 * Pins the properties the analysis depends on: complete phase-exact corpus, preserved ties,
 * excluded exhibitions, sane chronological metrics, and a byte-deterministic replay through the
 * shared harness. Private artifacts, guarded like public ones — a poisoned corpus poisons every
 * later conclusion.
 *
 * Run: npx tsx --test src/lib/sports/research/nfl-research.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validateResearchArtifact } from "./artifact-modes.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nfl");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

test("corpus: three seasons, regular season exactly 272 each, 32 teams, ties preserved, Pro Bowls quarantined", () => {
  const c = read("corpus-v1.json");
  assert.equal(c.dataClass, "PRIVATE_RESEARCH");
  assert.equal(c.totalGames, 1001);
  for (const s of ["2023", "2024", "2025"]) assert.equal(c.seasons[s]["2"], 272, `${s} regular season must be complete`);
  assert.ok(c.ties >= 1, "NFL ties exist and must be preserved, never flattened");
  assert.ok(c.quarantined.some((q) => /Pro Bowl/.test(q.reason)), "the exhibition exclusion must be visible, not silent");
  const teams = new Set(c.rows.flatMap((r) => [r.home, r.away]));
  assert.equal(teams.size, 32);
  let prev = "";
  for (const r of c.rows) {
    assert.ok(r.dateUtc >= prev, "chronological order is the walk-forward substrate");
    prev = r.dateUtc;
    const expect = r.ftHome > r.ftAway ? "H" : r.ftHome < r.ftAway ? "A" : "T";
    assert.equal(r.result, expect);
  }
});

test("evaluation: coin anchors at ln(2), Elo beats the strength-blind references, denominators visible", () => {
  const r = read("reports", "baseline-evaluation-v1.json");
  assert.ok(Math.abs(r.winner.coin.overall.logLoss - Math.log(2)) < 0.001, "always-0.5 must score exactly ln 2");
  assert.ok(r.winner.elo.overall.logLoss < r.winner.homerate.overall.logLoss, "Elo must beat home-rate");
  assert.ok(r.winner.elo.overall.n >= 500, "two evaluated seasons of decisive games");
  assert.ok(r.corpus.tiesExcludedFromWinnerMetrics >= 0 && typeof r.corpus.tiesExcludedFromWinnerMetrics === "number",
    "the tie exclusion count is part of the report — the denominator is never hidden");
  assert.match(r.corpus.preseasonPolicy, /never fit, never evaluated/);
  assert.match(r.marketComparison, /unavailable/, "no odds capture exists; the report says so instead of implying one ran");
  assert.ok(r.winner.elo.calibration.some((b) => b.n > 0), "calibration bins are populated");
});

test("replay: shared-harness artifact validates, cutoff precedes the slate, actuals mandatory", () => {
  const a = read("replays", "replay-2025-postseason.json");
  assert.equal(validateResearchArtifact(a).ok, true);
  assert.equal(a.mode, "HISTORICAL_REPLAY");
  assert.equal(a.evaluationEligible, true);
  assert.equal(a.predictions.length, 13, "a full NFL postseason is 13 games");
  assert.equal(a.quarantinedCount, 0);
  for (const p of a.predictions) assert.ok(p.dateUtc.slice(0, 10) >= a.sourceCutoffIso.slice(0, 10));
  for (const v of a.validation) assert.ok(v.actualScore && typeof v.modelProbOfActualResult === "number", "misses are visible by construction");
  assert.match(a.predictions[0].tieNote ?? "", /not modeled/, "the binary-probs limitation is stated on the artifact");
});

test("DETERMINISM · re-running the replay with the same --now reproduces the artifact byte-for-byte", () => {
  const file = path.join(ROOT, "replays", "replay-2025-postseason.json");
  const before = fs.readFileSync(file);
  const gen = read("replays", "replay-2025-postseason.json").generatedAt;
  execFileSync("node", [path.join(APP, "scripts", "nfl", "replay-nfl-postseason.mjs"), "--season", "2025", "--now", gen], { cwd: APP });
  assert.ok(before.equals(fs.readFileSync(file)), "replay regeneration drifted");
});

test("the capture manifest claims retrieval only — corpus completeness is the builder's separate claim", () => {
  const m = read("raw", "CAPTURE_MANIFEST.json");
  assert.equal(m.source.requestCount, 21, "every request counted");
  assert.match(m.source.rights, /no key, no credits/);
  assert.match(m.completenessClaim, /claims retrieval only/);
});
