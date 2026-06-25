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

test("rung math (post-banking + fresh cycle-2): Lane A BANKED + a fresh dual cycle started → BOTH lanes back on Step 1", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST-BANKING + FRESH CYCLE-2: the operator BANKED Lane A's completed $100→$10k ladder (Ladder #2) and
  // started a fresh dual cycle. Both lanes are now a FRESH active Step-1 ($100 seed → $200 target), so each
  // lane yields a clean Step-1 forward rung again (clearedSteps 0, target 200, 2×).
  for (const [lane, rung] of [["A", laneA], ["B", laneB]]) {
    assert.ok(rung, `Lane ${lane} has a fresh forward rung (cycle 2)`);
    assert.equal(rung.lane, lane);
    assert.equal(rung.nextStep, 1, `Lane ${lane} is back on Step 1`);
    assert.equal(rung.clearedSteps, 0, `Lane ${lane} cleared 0 rungs (fresh cycle)`);
    assert.equal(rung.rolledStake, 100, `Lane ${lane} rides a fresh $100 seed`);
    assert.equal(rung.targetReturn, 200, `Lane ${lane} Step-1 target is $200`);
    assert.equal(rung.targetMultiplier, 2, `Lane ${lane} Step-1 is a 2× rung`);
  }
});

test("safest target-fit selector still serves a forward rung + holds its invariants (synthetic rung)", () => {
  // Both LIVE lanes are terminal (Lane A completed, Lane B stopped), so the selector has no live lane to
  // serve right now. Verify the selector's invariants against a synthetic forward rung so coverage holds.
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const rung = { lane: "B", nextStep: 3, clearedSteps: 2, rolledStake: 702.45, targetReturn: 1400, targetMultiplier: 1400 / 702.45 };
  const b = selectSafestTargetFitCard(pool, rung, new Set());
  assert.equal(b.legs.length, 2, "exactly 2 legs");
  assert.equal(new Set(b.legs.map((l) => l.gameId)).size, b.legs.length, "max 1 leg per game (or correlation noted)");
  for (const l of b.legs) assert.ok(l.odds >= -500 && l.odds <= 400, `${l.selection} within window`);
  const d = b.legs.reduce((p, l) => p * dec(l.odds), 1);
  assert.ok(Math.abs(decToAmerican(d) - b.combinedOdds) <= 2, "combined odds reconcile");
  assert.ok(b.potentialReturn >= rung.targetReturn, `reaches the rung target ($${b.potentialReturn} ≥ $${rung.targetReturn})`);
  assert.equal(b.fitsTarget, true, "card fits the rung target");
});

test("persisted daily portfolio (post-banking + fresh cycle-2): both BB lanes fresh active Step-1 → 2 BB cards, $200 BB exposure, money is the banked truth", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  // POST-BANKING + FRESH CYCLE-2: Lane A banked (Ladder #2) and a fresh dual cycle started, so BOTH lanes are
  // a fresh active Step-1 ($100 seed → ~$200, 2 legs each). Daily BB exposure is the two $100 seeds.
  assert.equal(bb.length, 2, "two forward BB lanes — both fresh active Step-1 (cycle 2)");
  for (const l of bb) {
    assert.equal(l.status, "active", `Lane ${l.lane} is active`);
    assert.equal(l.step, 1, `Lane ${l.lane} is on a fresh Step 1`);
    assert.equal(l.stake, 100, `Lane ${l.lane} rides a $100 seed`);
    assert.equal(l.exposure, 100, `Lane ${l.lane} risks its $100 seed`);
    assert.equal(l.legCount, 2, `Lane ${l.lane} Step-1 card has 2 legs`);
  }
  assert.equal(dp.products.bankBuilder.exposure, 200, "BB exposure is $200 — two fresh active Step-1 cards");
  assert.equal(dp.openExposure, 200, "daily open exposure is the two $100 BB seeds");
  // Canonical money is the post-banking truth (crown = Σ two banked-ladder finals); the daily view never moves it.
  assert.equal(dp.activeBankroll, 20165.4); assert.equal(dp.crownBankroll, 20465.4);
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: a fresh Step-1 lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST-BANKING + FRESH CYCLE-2: both lanes are a fresh active Step-1, so a fresh build places exactly the
  // two $100 seeds ($200) and leaves the canonical bankroll/crown — the post-banking truth — untouched
  // (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 2, "two forward BB lanes (both fresh active Step-1)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 Step-1 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 200, "only the two $100 seeds are at risk");
  assert.equal(dp.activeBankroll, 20165.4, "active bankroll unchanged by generation (banked truth)");
  assert.equal(dp.crownBankroll, 20465.4, "crown unchanged by generation (Σ two banked finals)");
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
