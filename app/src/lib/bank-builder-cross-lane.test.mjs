import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs } from "./daily-portfolio/bank-builder-generation.ts";
import { selectCrossLaneBankBuilder } from "./daily-portfolio/bank-builder-correlation-review.ts";
import { loadWorldCupModelPicks } from "./world-cup/model-qualified-picks.ts";

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

test("cross-lane selector: both lanes reach their rung target with team/game markets, reconcile", () => {
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  // Pin the rungs to the Step 4 / Step 2 scenario this selector test was written for, so it stays a
  // deterministic check of TEAM-market cross-lane selection at a reachable target — independent of the
  // live ladder (now advanced past June 23 to Step 5 / Step 3, whose harder $10k target can pull in a
  // player prop). The advanced-rung path is exercised separately in bank-builder-next-steps.
  const laneA = { lane: "A", nextStep: 4, clearedSteps: 3, rolledStake: 1464.71, targetReturn: 3500, targetMultiplier: 3500 / 1464.71 };
  const laneB = { lane: "B", nextStep: 2, clearedSteps: 1, rolledStake: 277.11, targetReturn: 700, targetMultiplier: 700 / 277.11 };
  const { laneA: a, laneB: b } = selectCrossLaneBankBuilder(pool, laneA, laneB);
  for (const [g, rung] of [[a, laneA], [b, laneB]]) {
    assert.ok(g.fitsTarget, `lane reaches the Step ${rung.nextStep} target`);
    assert.ok(g.potentialReturn >= rung.targetReturn, `$${g.potentialReturn} ≥ $${rung.targetReturn}`);
    for (const l of g.legs) assert.ok(TEAM.has(l.category), `${l.selection} is a team/game market`);
    const d = g.legs.reduce((p, l) => p * dec(l.odds), 1);
    assert.ok(Math.abs(g.combinedDecimal - d) < 0.01, "combined decimal reconciles from legs");
    assert.match(g.correlationNote, /no shared game/i, "discloses cross-lane independence");
  }
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
  // June 24 (post June-23 settlement): both lanes advanced + awaiting their next qualified card → $0 open exposure.
  assert.equal(dp.openExposure, 0); assert.equal(dp.availableBankroll, 10176.17);
  assert.equal(dp.activeBankroll, 10176.17); assert.equal(dp.crownBankroll, 10376.17);
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 10176.17); assert.equal(p.crownBankroll, 10376.17);
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
});
