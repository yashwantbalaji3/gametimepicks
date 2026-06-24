import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs } from "./daily-portfolio/bank-builder-generation.ts";
import { selectCrossLaneBankBuilder } from "./daily-portfolio/bank-builder-correlation-review.ts";
import { loadWorldCupModelPicks } from "./world-cup/model-qualified-picks.ts";
import { loadWorldCupTeamLegs } from "./daily-portfolio/wc-team-legs.ts";
import { loadMlbModelPicks } from "./daily-portfolio/mlb-model-picks.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const TEAM = new Set(["team", "total_btts"]);
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

test("cross-lane selector: Lane A and Lane B share NO game (independent lanes)", () => {
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const { laneA, laneB } = readLaneRungs(root);
  const { laneA: a, laneB: b } = selectCrossLaneBankBuilder(pool, laneA, laneB);
  const gamesA = new Set(a.legs.map((l) => l.gameId));
  const gamesB = new Set(b.legs.map((l) => l.gameId));
  const overlap = [...gamesA].filter((g) => gamesB.has(g));
  assert.equal(overlap.length, 0, "no shared game across Lane A and Lane B");
  assert.equal(a.legs.length, 2); assert.equal(b.legs.length, 2);
  assert.equal(new Set(a.legs.map((l) => l.gameId)).size, 2, "Lane A: max 1 leg per game");
  assert.equal(new Set(b.legs.map((l) => l.gameId)).size, 2, "Lane B: max 1 leg per game");
});

test("cross-lane selector: both lanes reach their rung target (probability-fit) and stay independent, reconcile", () => {
  // Live cross-sport pool (soccer-first WC team legs + MLB fill) — the actual Bank Builder pool, which has
  // enough independent games for both lanes to reach their targets without sharing a game.
  const D = "2026-06-24", N = "2026-06-24T08:00:00Z";
  const pool = [...loadWorldCupTeamLegs(root, N, D), ...loadMlbModelPicks(root, N, D)];
  const laneA = { lane: "A", nextStep: 5, clearedSteps: 4, rolledStake: 3502.57, targetReturn: 10000, targetMultiplier: 10000 / 3502.57 };
  const laneB = { lane: "B", nextStep: 3, clearedSteps: 2, rolledStake: 702.45, targetReturn: 1400, targetMultiplier: 1400 / 702.45 };
  const { laneA: a, laneB: b } = selectCrossLaneBankBuilder(pool, laneA, laneB);
  const aGames = new Set(a.legs.map((l) => l.gameId));
  for (const [g, rung] of [[a, laneA], [b, laneB]]) {
    assert.ok(g.fitsTarget, `lane reaches the Step ${rung.nextStep} target`);
    assert.ok(g.potentialReturn >= rung.targetReturn, `$${g.potentialReturn} ≥ $${rung.targetReturn}`);
    assert.ok(g.estimatedHitProbability > 0 && g.estimatedHitProbability <= 1, "card carries a valid hit probability");
    const d = g.legs.reduce((p, l) => p * dec(l.odds), 1);
    assert.ok(Math.abs(g.combinedDecimal - d) < 0.01, "combined decimal reconciles from legs");
    assert.match(g.correlationNote, /no shared game/i, "discloses cross-lane independence");
  }
  // Cross-lane independence: Lane B shares no game with Lane A.
  for (const l of b.legs) assert.ok(!aGames.has(l.gameId), `Lane B leg ${l.selection} is in a different game from Lane A`);
});

test("persisted daily portfolio: Bank Builder lanes are cross-lane independent (no shared game)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const gamesA = new Set((bb.find((l) => l.lane === "A")?.legs ?? []).map((l) => l.matchup));
  const gamesB = new Set((bb.find((l) => l.lane === "B")?.legs ?? []).map((l) => l.matchup));
  const overlap = [...gamesA].filter((g) => gamesB.has(g));
  assert.equal(overlap.length, 0, "persisted lanes share no game");
});

test("Bank Builder page is a SINGLE ladder (DualLadderBoard), not the duplicate ProductLanesLadder section", () => {
  const page = read("src/app/bank-builder/page.tsx");
  assert.match(page, /DualLadderBoard/, "uses the single Dual Bank Builder ladder");
  assert.ok(!/ProductLanesLadder/.test(page), "duplicate ProductLanesLadder section removed from Bank Builder");
});

test("DualLadderBoard injects the current step's daily legs into an open drawer (with portraits/flags)", () => {
  const board = read("src/components/bank-builder/dual-ladder-board.tsx");
  assert.match(board, /daily-portfolio\.json/, "reads the daily portfolio for the current step legs");
  assert.match(board, /PlayerAvatar/, "player props render a portrait");
  assert.match(board, /FlagBadge/, "team legs render a flag/logo");
  assert.match(board, /open/, "current step drawer can open by default");
});

test("exposure/bankroll/crown unchanged by the cross-lane upgrade", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  // The daily-portfolio view never touches CANONICAL money and stays internally consistent regardless of
  // whether the day's lanes are active (cards placed) or awaiting — assert the invariants, not a fixed value.
  assert.equal(dp.activeBankroll, 10176.17); assert.equal(dp.crownBankroll, 10376.17);
  const sumExposure = (dp.lanes ?? []).filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(dp.openExposure, sumExposure, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 10176.17); assert.equal(p.crownBankroll, 10376.17);
  assert.equal(p.openExposure, 0, "CANONICAL dual-ladder exposure stays $0 (separate from the daily view)");
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
});
