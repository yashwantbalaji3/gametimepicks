import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs, selectSafestTargetFitCard } from "./daily-portfolio/bank-builder-generation.ts";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";
import { loadWorldCupModelPicks } from "./world-cup/model-qualified-picks.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

test("rung math from the active ladder artifact: Lane A → Step 4 ($1,464.71 → $3,500), Lane B → Step 2 ($277.11 → $700)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  assert.ok(laneA && laneB, "both rungs resolved");
  assert.equal(laneA.nextStep, 4); assert.equal(laneA.clearedSteps, 3);
  assert.equal(laneA.rolledStake, 1464.71); assert.equal(laneA.targetReturn, 3500);
  assert.equal(laneB.nextStep, 2); assert.equal(laneB.clearedSteps, 1);
  assert.equal(laneB.rolledStake, 277.11); assert.equal(laneB.targetReturn, 700);
});

test("Lane A Step 4 + Lane B Step 2: safest 2-leg cards that reach the rung target, max 1/game, reconcile", () => {
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const { laneA, laneB } = readLaneRungs(root);
  const used = new Set();
  const a = selectSafestTargetFitCard(pool, laneA, used);
  a.legs.forEach((l) => used.add(l.id));
  const b = selectSafestTargetFitCard(pool, laneB, used);
  for (const [g, rung] of [[a, laneA], [b, laneB]]) {
    assert.equal(g.legs.length, 2, "exactly 2 legs");
    assert.equal(new Set(g.legs.map((l) => l.gameId)).size, g.legs.length, "max 1 leg per game (or correlation noted)");
    for (const l of g.legs) assert.ok(l.odds >= -500 && l.odds <= 400, `${l.selection} within window`);
    const d = g.legs.reduce((p, l) => p * dec(l.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - g.combinedOdds) <= 2, "combined odds reconcile");
    assert.ok(g.potentialReturn >= rung.targetReturn, `Step ${rung.nextStep} reaches the rung target ($${g.potentialReturn} ≥ $${rung.targetReturn})`);
    assert.equal(g.fitsTarget, true, "card fits the rung target");
  }
  assert.equal(new Set([...a.legs, ...b.legs].map((l) => l.id)).size, 4, "Lane A + Lane B legs are distinct");
});

test("persisted daily portfolio: Lane A active Step 4, Lane B active Step 2, BB exposure $200, available $9,926.17", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const a = bb.find((l) => l.lane === "A"), b = bb.find((l) => l.lane === "B");
  assert.equal(a.step, 4); assert.equal(a.clearedSteps, 3); assert.equal(a.status, "active"); assert.equal(a.exposure, 100);
  assert.equal(b.step, 2); assert.equal(b.clearedSteps, 1); assert.equal(b.status, "active"); assert.equal(b.exposure, 100);
  assert.equal(dp.products.bankBuilder.exposure, 200, "BB exposure $200 (2 × $100 seed, not the rolled balance)");
  assert.equal(dp.openExposure, 250); assert.equal(dp.availableBankroll, 9926.17);
  assert.equal(dp.activeBankroll, 10176.17); assert.equal(dp.crownBankroll, 10376.17);
});

test("BB exposure is the $100 seed, not the rolled balance (active bankroll unchanged)", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const a = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
  assert.ok(a.stake > 1000, "card displays the rolled balance riding (Lane A ~$1,464.71)");
  assert.equal(a.exposure, 100, "but the at-risk exposure is the $100 seed");
  assert.equal(dp.activeBankroll, 10176.17, "active bankroll unchanged at activation");
});

test("started-game guard still holds for next-step cards (0 exposure after kickoff)", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure once games have started");
});

test("Bank Builder page: completed crown proof is collapsed + relabeled (not ACTIVE), active ladder leads", () => {
  const page = read("src/app/bank-builder/page.tsx");
  assert.match(page, /Completed crown proof · CROWN REACHED · historical/, "crown proof collapsed + relabeled");
  assert.match(page, /open=\{!completed\}/, "crown proof collapsed by default when completed");
  // Bank Builder consolidated to the single "Today's Dual Bank Builder" ladder (DualLadderBoard);
  // the completed crown proof renders AFTER it.
  const ladderIdx = page.indexOf("DualLadderBoard");
  const proofIdx = page.indexOf("Completed crown proof");
  assert.ok(ladderIdx > 0 && proofIdx > ladderIdx, "active dual ladder renders before the completed crown proof");
});

test("Bank Builder + Moonshot share the dynamic step rail (cleared/current/future)", () => {
  const ladder = read("src/components/ladders/product-lanes-ladder.tsx");
  assert.match(ladder, /currentStep/, "rail is driven by currentStep");
  assert.match(ladder, /cleared/, "rail renders cleared rungs");
  assert.match(ladder, /TOTAL_STEPS/, "per-product total steps");
});

test("game detail no longer promotes a raw < -500 prop as the top model pick", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /qualifiedPlayerProps/, "top player pick filters to model-qualified props");
  assert.match(page, /americanOdds >= -500 && p\.americanOdds <= 400/, "excludes legs shorter than -500 (e.g. -5000)");
  assert.match(page, /No model-qualified pick/, "empty state says No model-qualified pick");
});
