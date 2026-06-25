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

test("rung math from the active ladder artifact (post June-24 settlement): Lane A COMPLETED the $10k ladder (no rung), Lane B → Step 3 ($702.45 → $1,400)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-24: Lane A cleared all 5 rungs (Step 5 won → $10,089.23) so it has no next rung; Lane B
  // stopped at Step 3 (cleared 2) and is the only lane with a forward rung.
  assert.equal(laneA, null, "Lane A has no next rung — the $10k ladder is COMPLETE");
  assert.ok(laneB, "Lane B rung resolved");
  assert.equal(laneB.nextStep, 3); assert.equal(laneB.clearedSteps, 2);
  assert.equal(laneB.rolledStake, 702.45); assert.equal(laneB.targetReturn, 1400);
});

test("Lane B Step 3: safest 2-leg card that reaches the rung target, max 1/game, reconcile (Lane A is COMPLETED — no forward card)", () => {
  // POST JUNE-24: Lane A completed the ladder (readLaneRungs.laneA is null), so the only forward lane the
  // safest-card selector serves is Lane B (Step 3, $702.45 → $1,400). Same safest-card invariants apply.
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const { laneA, laneB } = readLaneRungs(root);
  assert.equal(laneA, null, "Lane A is COMPLETED — no forward card to select");
  const b = selectSafestTargetFitCard(pool, laneB, new Set());
  assert.equal(b.legs.length, 2, "exactly 2 legs");
  assert.equal(new Set(b.legs.map((l) => l.gameId)).size, b.legs.length, "max 1 leg per game (or correlation noted)");
  for (const l of b.legs) assert.ok(l.odds >= -500 && l.odds <= 400, `${l.selection} within window`);
  const d = b.legs.reduce((p, l) => p * dec(l.odds), 1);
  assert.ok(Math.abs(decToAmerican(d) - b.combinedOdds) <= 2, "combined odds reconcile");
  assert.ok(b.potentialReturn >= laneB.targetReturn, `Step ${laneB.nextStep} reaches the rung target ($${b.potentialReturn} ≥ $${laneB.targetReturn})`);
  assert.equal(b.fitsTarget, true, "card fits the rung target");
});

test("persisted daily portfolio (June 24, post-settlement): Lane A COMPLETED (absent), Lane B on Step 3; BB exposure = $100 seed × active BB lanes ($0, June-24 lanes settled)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const a = bb.find((l) => l.lane === "A"), b = bb.find((l) => l.lane === "B");
  // POST JUNE-24: Lane A completed the ladder and no longer appears as a forward BB lane; Lane B holds its
  // Step-3 rung but is AWAITING (June-24 cards already settled), so no BB seed is at risk in the daily view.
  assert.equal(a, undefined, "completed Lane A is no longer a forward BB lane");
  assert.ok(b, "Lane B still present"); assert.equal(b.step, 3); assert.equal(b.clearedSteps, 2);
  const activeBB = bb.filter((l) => l.status === "active");
  assert.equal(activeBB.length, 0, "no BB lane is active — June-24 cards are settled");
  assert.equal(dp.products.bankBuilder.exposure, 100 * activeBB.length, "BB exposure = $100 seed × active BB lanes (= $0 post-settlement, never the rolled balance)");
  assert.equal(dp.products.bankBuilder.exposure, 0, "BB exposure is $0 since June-24 lanes settled");
  assert.equal(dp.activeBankroll, 10076.17); assert.equal(dp.crownBankroll, 10376.17);
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB exposure is the $100 seed, not the rolled balance (active bankroll unchanged)", () => {
  // POST JUNE-24: Lane A completed, so the live forward BB lane is Lane B (Step 3) — it RIDES the rolled
  // $702.45 balance but the at-risk exposure is still the $100 seed.
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const a = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
  assert.equal(a, undefined, "completed Lane A no longer rides a forward card");
  const b = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "B");
  assert.ok(b.stake > 700, "card displays the rolled balance riding (Lane B ~$702.45)");
  assert.equal(b.exposure, 100, "but the at-risk exposure is the $100 seed");
  assert.equal(dp.activeBankroll, 10076.17, "active bankroll unchanged at activation");
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
