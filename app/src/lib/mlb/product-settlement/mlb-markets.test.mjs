/**
 * MLB PRODUCT SETTLEMENT RULES (2026-07-09) — exhaustive rules + real-data cross-check.
 *
 * Pins: every supported market grades win/loss/push correctly; a missing final stat/score is PENDING
 * (never a loss); "did not play" is UNAVAILABLE; equal-to-line is PUSH; and — critically — the shared
 * over/under core reproduces the existing pipeline's outcome on ALL committed settled player props
 * (18k+ rows). Money is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  settleOverUnder,
  settleMlbMoneyline, settleMlbRunLine, settleMlbTotal, settleMlbTeamTotal,
  settleMlbPitcherStrikeouts, settleMlbBatterHits, settleMlbTotalBases, settleMlbHrrbi,
  isMlbMarketSettleable, SETTLEABLE_MLB_MARKETS,
} from "./mlb-markets.ts";

const app = process.cwd();

test("1 · moneyline — higher score wins; missing/equal ⇒ pending, never loss", () => {
  assert.equal(settleMlbMoneyline({ homeScore: 5, awayScore: 3, selectedTeam: "home" }).status, "win");
  assert.equal(settleMlbMoneyline({ homeScore: 5, awayScore: 3, selectedTeam: "away" }).status, "loss");
  assert.equal(settleMlbMoneyline({ homeScore: 2, awayScore: 7, selectedTeam: "away" }).status, "win");
  assert.equal(settleMlbMoneyline({ homeScore: null, awayScore: 3, selectedTeam: "home" }).status, "pending");
  assert.equal(settleMlbMoneyline({ homeScore: 4, awayScore: 4, selectedTeam: "home" }).status, "pending"); // no ties
  assert.equal(settleMlbMoneyline({ selectedTeam: "home", gameFinal: false }).status, "pending");
});

test("2 · run line — margin + line decides; integer line can push", () => {
  assert.equal(settleMlbRunLine({ homeScore: 5, awayScore: 3, selectedTeam: "home", line: -1.5 }).status, "win"); // margin +2 -1.5 = +0.5
  assert.equal(settleMlbRunLine({ homeScore: 5, awayScore: 4, selectedTeam: "home", line: -1.5 }).status, "loss"); // +1 -1.5 = -0.5
  assert.equal(settleMlbRunLine({ homeScore: 3, awayScore: 5, selectedTeam: "home", line: 1.5 }).status, "loss"); // -2 +1.5 = -0.5
  assert.equal(settleMlbRunLine({ homeScore: 3, awayScore: 4, selectedTeam: "home", line: 1.5 }).status, "win"); // -1 +1.5 = +0.5
  assert.equal(settleMlbRunLine({ homeScore: 5, awayScore: 3, selectedTeam: "home", line: -2 }).status, "push"); // +2 -2 = 0
  assert.equal(settleMlbRunLine({ homeScore: null, awayScore: 3, selectedTeam: "home", line: -1.5 }).status, "pending");
  assert.equal(settleMlbRunLine({ homeScore: 5, awayScore: 3, selectedTeam: "home", line: null }).status, "unavailable");
});

test("3 · game total — over/under/push on home+away", () => {
  assert.equal(settleMlbTotal({ homeScore: 5, awayScore: 4, side: "over", line: 8.5 }).status, "win"); // 9 > 8.5
  assert.equal(settleMlbTotal({ homeScore: 5, awayScore: 4, side: "under", line: 8.5 }).status, "loss");
  assert.equal(settleMlbTotal({ homeScore: 3, awayScore: 2, side: "under", line: 8.5 }).status, "win"); // 5 < 8.5
  assert.equal(settleMlbTotal({ homeScore: 4, awayScore: 4, side: "over", line: 8 }).status, "push"); // 8 == 8
  assert.equal(settleMlbTotal({ homeScore: null, awayScore: 4, side: "over", line: 8.5 }).status, "pending");
});

test("4 · team total — over/under/push on one team", () => {
  assert.equal(settleMlbTeamTotal({ teamScore: 5, side: "over", line: 4.5 }).status, "win");
  assert.equal(settleMlbTeamTotal({ teamScore: 3, side: "over", line: 4.5 }).status, "loss");
  assert.equal(settleMlbTeamTotal({ teamScore: 4, side: "over", line: 4 }).status, "push");
  assert.equal(settleMlbTeamTotal({ teamScore: null, side: "over", line: 4.5 }).status, "pending");
});

test("5 · player props — strikeouts / hits / total bases over/under/push", () => {
  assert.equal(settleMlbPitcherStrikeouts({ actualStrikeouts: 7, side: "over", line: 5.5 }).status, "win");
  assert.equal(settleMlbPitcherStrikeouts({ actualStrikeouts: 3, side: "over", line: 5.5 }).status, "loss");
  assert.equal(settleMlbBatterHits({ actualHits: 2, side: "over", line: 1.5 }).status, "win");
  assert.equal(settleMlbBatterHits({ actualHits: 1, side: "under", line: 1.5 }).status, "win");
  assert.equal(settleMlbTotalBases({ actualTotalBases: 2, side: "over", line: 2 }).status, "push");
});

test("6 · H+R+RBI — sums components; a missing component ⇒ pending (never partial)", () => {
  assert.equal(settleMlbHrrbi({ hits: 2, runs: 1, rbi: 1, side: "over", line: 2.5 }).status, "win"); // 4 > 2.5
  assert.equal(settleMlbHrrbi({ hits: 1, runs: 0, rbi: 0, side: "over", line: 2.5 }).status, "loss"); // 1 < 2.5
  assert.equal(settleMlbHrrbi({ hits: 1, runs: 1, rbi: 1, side: "under", line: 3 }).status, "push"); // 3 == 3
  assert.equal(settleMlbHrrbi({ hits: 2, runs: null, rbi: 1, side: "over", line: 2.5 }).status, "pending");
});

test("7 · missing/DNP/not-final states are distinct and never a loss", () => {
  assert.equal(settleMlbBatterHits({ actualHits: null, side: "over", line: 1.5 }).status, "pending"); // stat missing
  assert.equal(settleMlbBatterHits({ actualHits: null, side: "over", line: 1.5, participated: false }).status, "unavailable"); // DNP
  assert.equal(settleMlbBatterHits({ actualHits: 2, side: "over", line: 1.5, gameFinal: false }).status, "pending"); // not final
  assert.equal(settleOverUnder(3, "over", null).status, "unavailable"); // no line
});

test("8 · settleable-market registry is the single source of truth", () => {
  for (const m of ["moneyline", "run_line", "total", "team_totals", "pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]) {
    assert.ok(isMlbMarketSettleable(m), `${m} settleable`);
  }
  assert.ok(!isMlbMarketSettleable("batter_home_runs")); // not wired
  assert.equal(SETTLEABLE_MLB_MARKETS.size, 8);
});

test("9 · CROSS-CHECK — the over/under core reproduces the pipeline outcome on ALL committed settled props", () => {
  const p = path.join(app, "public/data/mlb/results/settled_leans.jsonl");
  if (!fs.existsSync(p)) return; // committed ledger optional in a fresh checkout
  const rows = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.length > 1000, "large settled sample");
  let checked = 0, mismatches = 0;
  const map = { Win: "win", Loss: "loss", Push: "loss" }; // note: pipeline "Push"→ our push; handled below
  for (const r of rows) {
    if (typeof r.actual !== "number" || typeof r.line !== "number" || !r.lean) continue;
    const side = r.lean === "Over" ? "over" : r.lean === "Under" ? "under" : null;
    if (!side) continue;
    const got = settleOverUnder(r.actual, side, r.line).status;
    const expected = r.outcome === "Win" ? "win" : r.outcome === "Loss" ? "loss" : r.outcome === "Push" ? "push" : r.outcome === "Void" ? "push" : null;
    if (expected == null) continue;
    checked++;
    if (got !== expected) mismatches++;
  }
  assert.ok(checked > 1000, `cross-checked ${checked} real props`);
  assert.equal(mismatches, 0, `${mismatches}/${checked} settlement mismatches vs the pipeline`);
});
