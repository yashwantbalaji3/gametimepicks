/**
 * Cross-lane correlation engine + World Cup Specials ledger.
 *
 * The correlation engine must catch any shared game/player/team across the two Bank Builder lanes; the
 * live lanes must score as independent. The Specials ledger must aggregate the archived history honestly
 * (records only from settled cards; pending = open exposure). Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { scoreCrossLaneCorrelation } from "./daily-portfolio/cross-lane-correlation.ts";
import { buildSpecialsLedger, SPECIALS_STAKE_PER_CARD, SPECIALS_DAILY_ALLOCATION } from "./world-cup/specials-ledger.ts";
import { readLaneRungs } from "./daily-portfolio/bank-builder-generation.ts";
import { selectCrossLaneBankBuilder } from "./daily-portfolio/bank-builder-correlation-review.ts";
import { loadWorldCupTeamLegs } from "./daily-portfolio/wc-team-legs.ts";
import { loadMlbModelPicks } from "./daily-portfolio/mlb-model-picks.ts";

/** A clean Step-1 rung for any lane whose live ladder has completed (e.g. Lane A finished its $10k ladder
 *  on June 24). The cross-lane selector needs a non-null rung per lane; a completed lane restarts at $100. */
const freshRung = (lane) => ({ lane, nextStep: 1, clearedSteps: 0, rolledStake: 100, targetReturn: 200, targetMultiplier: 2 });

/** The cross-lane SELECTOR output (the independence guarantee), independent of any operator card lock.
 *  After June 24, Lane A COMPLETED the ladder so its live rung is null; we feed the selector a fresh Step-1
 *  rung for any completed lane so it still produces a real card and we can assert the independence guarantee. */
function selectorLanes(rootDir) {
  const D = "2026-06-24", N = "2026-06-24T08:00:00Z";
  const pool = [...loadWorldCupTeamLegs(rootDir, N, D), ...loadMlbModelPicks(rootDir, N, D)];
  const rungs = readLaneRungs(rootDir);
  const rungA = rungs.laneA ?? freshRung("A");
  const rungB = rungs.laneB ?? freshRung("B");
  const { laneA, laneB } = selectCrossLaneBankBuilder(pool, rungA, rungB);
  const map = (legs) => legs.map((l) => ({ matchup: l.matchup, market: l.marketLabel, selection: l.selection, player: l.player ?? null }));
  return { A: map(laneA.legs), B: map(laneB.legs) };
}

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";

// ── Correlation engine ────────────────────────────────────────────────────────────────────────────
test("correlation: fully independent lanes (disjoint games) score 0 and read independent", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "England vs Ghana", market: "Both Teams To Score", selection: "No", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.score, 0);
  assert.equal(c.independent, true);
  assert.equal(c.warnings.length, 0);
  assert.match(c.summary, /independent/i);
});

test("correlation: a shared GAME is caught and scored (not independent)", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "Panama vs Croatia", market: "Total Goals", selection: "Over 2.5", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.ok(c.score >= 0.5, "shared game scores at least the game weight");
  assert.equal(c.independent, false);
  assert.equal(c.overlaps.sameGame.length, 1);
  assert.ok(c.warnings.some((w) => /same game/i.test(w)));
});

test("correlation: a shared PLAYER is caught", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Assists", selection: "Over 0.5", player: "Ivan Perisic" }];
  const b = [{ matchup: "France vs Iraq", market: "Shots", selection: "Over 1.5", player: "Ivan Perisic" }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.independent, false);
  assert.equal(c.overlaps.samePlayer.length, 1);
});

test("correlation: the cross-lane SELECTOR output is independent (no shared game/player/team)", () => {
  // Independence is the SELECTOR's guarantee. The live persisted lanes can be correlated only via an
  // operator-approved card lock (manual override) — the June-24 lock (Lane A Brazil Over + Lane B Brazil ML)
  // has since SETTLED and been consumed, so it no longer pins those legs. The selector itself still produces
  // fully independent lanes from the live pool, which is what this test guards.
  const { A, B } = selectorLanes(path.join(process.cwd(), "public", "data"));
  const c = scoreCrossLaneCorrelation(A, B);
  assert.equal(c.independent, true, "selector lanes share no game/player/team");
  assert.equal(c.score, 0);
});

test("correlation: the badge is rendered on /bank-builder", () => {
  const page = read("src/app/bank-builder/page.tsx");
  assert.match(page, /CrossLaneCorrelationBadge/, "bank-builder renders the correlation badge");
});

// ── Correlation V2: A–F grade + game-script diversification ─────────────────────────────────────────
test("V2: balanced independent lanes grade A", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "England vs Ghana", market: "Match Total", selection: "Over 2.5", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.grade, "A");
  assert.equal(c.diversification.styleConcentrated, false);
});

test("V2: outcome-independent but style-concentrated lanes are downgraded to B", () => {
  const a = [
    { matchup: "Panama vs Croatia", market: "Total Goals", selection: "Under 2.5", player: null },
    { matchup: "France vs Iraq", market: "Total Goals", selection: "Under 3.5", player: null },
  ];
  const b = [
    { matchup: "Portugal vs Uzbekistan", market: "Both Teams To Score", selection: "Both teams to score: No", player: null },
    { matchup: "England vs Ghana", market: "Both Teams To Score", selection: "Both teams to score: No", player: null },
  ];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.independent, true, "still outcome-independent (no shared game/player/team)");
  assert.equal(c.score, 0, "independent games → 0 outcome correlation");
  assert.equal(c.diversification.styleConcentrated, true, "all low-scoring → concentrated");
  assert.equal(c.grade, "B", "concentration downgrades A→B");
});

test("V2: a shared game grades C or worse and is not independent", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "Panama vs Croatia", market: "Total Goals", selection: "Over 2.5", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.independent, false);
  assert.ok(["C", "D", "F"].includes(c.grade), `shared game grades ${c.grade} (C/D/F)`);
  assert.ok(c.dependencies.length >= 1, "reports same-game outcome dependence");
});

test("V2: the cross-lane SELECTOR output is outcome-independent and graded A or B", () => {
  const { A, B } = selectorLanes(path.join(process.cwd(), "public", "data"));
  const c = scoreCrossLaneCorrelation(A, B);
  assert.equal(c.independent, true);
  assert.equal(c.score, 0);
  assert.ok(["A", "B"].includes(c.grade), "independent lanes grade A or B");
});

// ── World Cup Specials ledger ─────────────────────────────────────────────────────────────────────
test("specials ledger: constants + shape ($20 × 5 = $100/day)", () => {
  assert.equal(SPECIALS_STAKE_PER_CARD, 20);
  assert.equal(SPECIALS_DAILY_ALLOCATION, 100);
  const l = buildSpecialsLedger(root, DATE);
  assert.equal(l.stakePerCard, 20);
  assert.equal(l.dailyAllocation, 100);
  assert.ok(Array.isArray(l.days), "per-slate archive present");
});

test("specials ledger: HONEST — record only from settled cards; pending = open exposure, not P&L", () => {
  const l = buildSpecialsLedger(root, DATE);
  const settled = l.record.wins + l.record.losses + l.record.pushes;
  assert.equal(settled, l.settledCards, "record reconciles to settled count");
  if (settled === 0) {
    assert.equal(l.pnl, 0, "no P&L without settled cards");
    assert.equal(l.roi, null, "ROI null until something settles");
    assert.equal(l.winRate, null, "win rate null until something settles");
  }
  // Every archived slate carries non-negative counts that reconcile.
  for (const d of l.days) {
    assert.equal(d.settled + d.pending, d.cards, `${d.date}: settled + pending = cards`);
    assert.ok(d.openExposure === d.pending * SPECIALS_STAKE_PER_CARD, "open exposure = pending × stake");
  }
});

test("specials ledger: archives every slate forever (history is not truncated)", () => {
  const l = buildSpecialsLedger(root, DATE);
  assert.ok(l.totalSlates >= 1, "at least one archived slate");
  assert.equal(l.totalSlates, l.days.length, "totalSlates = archived days");
});

test("specials ledger: rendered on /world-cup-specials as a permanent product", () => {
  const page = read("src/app/world-cup-specials/page.tsx");
  assert.match(page, /SpecialsLedgerSection/, "page renders the ledger");
  assert.match(page, /permanent paper product/i, "positioned as a permanent product");
});
