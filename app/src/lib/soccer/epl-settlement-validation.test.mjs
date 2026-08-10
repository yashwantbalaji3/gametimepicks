/**
 * EPL settlement contract vs REAL prior-season shapes + the deterministic result join
 * (Program 151 · Release B).
 *
 * The P146 contract test proved the rules on synthetic fixtures; this file proves them against a
 * full real season (2025-26, 380 matches from the research corpus) and pins the identity-join
 * discipline the results side will use:
 *   - provider ids join FIRST (api-football fixture ids from the 2023-24 season raw capture);
 *   - kickoff-based canonical ids separate reverse fixtures (same clubs, different kickoff);
 *   - a fuzzy name+date join does not exist here — ambiguity REFUSES.
 *
 * Everything reads committed research artifacts; no network, all private.
 *
 * Run: npx tsx --test src/lib/soccer/epl-settlement-validation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gradeEplLeg, settleEplSlate } from "../sports/epl/settlement-contract.mjs";
import { identityFromFixture } from "./epl-identity.ts";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "epl");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const season = corpus.rows.filter((r) => r.season === "2025-26");

test("REAL SEASON SHAPES · all 380 2025-26 results grade through the contract with zero voids", () => {
  assert.equal(season.length, 380);
  const results = Object.fromEntries(season.map((m, i) => [`fx-${i}`, { status: "FULL_TIME", homeGoalsFT: m.ftHome, awayGoalsFT: m.ftAway }]));
  // One leg per match, taking the ACTUAL outcome — every leg must WIN and reconcile.
  const winning = season.map((m, i) => ({ fixtureId: `fx-${i}`, market: "match_result", side: m.result === "H" ? "home" : m.result === "A" ? "away" : "draw" }));
  const w = settleEplSlate(winning, results);
  assert.equal(w.summary.wins, 380);
  assert.equal(w.summary.voids, 0, "a complete real season produces zero quarantines");
  assert.equal(w.summary.reconciles, true);
  // And the mirrored slate (deliberately wrong side) must lose everywhere draws don't interfere.
  const losing = season.map((m, i) => ({ fixtureId: `fx-${i}`, market: "match_result", side: m.result === "H" ? "away" : "home" }));
  const l = settleEplSlate(losing, results);
  assert.equal(l.summary.wins, 0);
  assert.equal(l.summary.decisive, l.summary.wins + l.summary.losses, "decisive = W+L exactly");
  assert.equal(l.summary.reconciles, true);
});

test("REAL SEASON SHAPES · draws are explicit outcomes, never flattened into losses for both sides", () => {
  const draws = season.filter((m) => m.result === "D");
  assert.ok(draws.length >= 60, `a Premier League season has many draws (found ${draws.length})`);
  for (const m of draws.slice(0, 20)) {
    const res = { status: "FULL_TIME", homeGoalsFT: m.ftHome, awayGoalsFT: m.ftAway };
    assert.equal(gradeEplLeg({ market: "match_result", side: "draw" }, res).outcome, "WIN");
    assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, res).outcome, "LOSS");
  }
});

test("THE JOIN · provider ids join a full real season deterministically; kickoffs separate reverse fixtures", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "raw", "api-football-fixtures-2023.json"), "utf8"));
  const byProviderId = new Map();
  const canonical = new Map();
  let joined = 0;
  for (const r of raw.response) {
    const pid = String(r.fixture.id);
    assert.ok(!byProviderId.has(pid), `provider id ${pid} must be unique`);
    byProviderId.set(pid, r);
    const out = identityFromFixture({ homeClub: r.teams.home.name, awayClub: r.teams.away.name, kickoffIso: r.fixture.date }, "2026-08-10T03:20:00Z");
    assert.ok("identity" in out, `${r.teams.home.name} v ${r.teams.away.name}: identity must resolve, never fuzz`);
    const id = out.identity.eventId;
    assert.ok(!canonical.has(id), `canonical id ${id} collided — kickoff truncation failed`);
    canonical.set(id, pid);
    joined += 1;
  }
  assert.equal(joined, 380, "every 2023-24 fixture joins by provider id + resolves canonically");
  // Reverse fixtures: same clubs, two different canonical ids across the season.
  const arsChe = [...canonical.keys()].filter((k) => k.includes("arsenal") && k.includes("chelsea"));
  assert.equal(arsChe.length, 2, "home and away meetings are distinct events");
});

test("SYNTHETIC TERMINALS · postponed/abandoned/missing/corrected shapes void or quarantine, never guess", () => {
  for (const status of ["POSTPONED", "ABANDONED", "SUSPENDED", "IN_PLAY", "NOT_STARTED"]) {
    const g = gradeEplLeg({ market: "match_result", side: "home" }, { status, homeGoalsFT: 2, awayGoalsFT: 0 });
    assert.equal(g.outcome, "VOID_PENDING_REVIEW", `${status} must not grade`);
  }
  assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, undefined).outcome, "VOID_PENDING_REVIEW", "a missing result voids mid-slate instead of throwing");
  assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, { status: "FULL_TIME", homeGoalsFT: null, awayGoalsFT: 2 }).outcome, "VOID_PENDING_REVIEW", "the StatsAPI lesson holds");
});
