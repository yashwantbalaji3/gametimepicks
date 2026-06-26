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

test("rung math (post-June-25 settlement, cycle 3): Lane A WON Step 1 → forward Step 2; Lane B LOST Step 1 → stopped (no rung)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-25 SETTLEMENT (cycle 3): Lane A's Step 1 settled WON ($100 → $201.08), so the lane rolls its
  // $201.08 forward onto Step 2 (clearedSteps 1, target $700). Lane B's Step 1 settled LOST, so the lane is
  // stopped and yields NO forward rung.
  assert.ok(laneA, "Lane A has a forward rung (rolled onto Step 2 after the WON Step 1)");
  assert.equal(laneA.lane, "A");
  assert.equal(laneA.nextStep, 2, "Lane A advanced to Step 2");
  assert.equal(laneA.clearedSteps, 1, "Lane A cleared 1 rung (Step 1 WON)");
  assert.equal(laneA.rolledStake, 201.08, "Lane A rolls its $201.08 Step-1 payout forward");
  assert.equal(laneA.targetReturn, 700, "Lane A Step-2 target is $700");
  assert.equal(laneB, null, "Lane B is stopped (Step 1 LOST) — no forward rung");
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

test("persisted daily portfolio (post June-25 settlement): the two June-25 BB Step-1 cards are SETTLED (Lane A won, Lane B lost), $0 open exposure, money is the settled truth", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  // POST JUNE-25 SETTLEMENT (cycle 3): the day's two BB Step-1 cards have been officially graded — Lane A WON
  // ($100→$201.08, advanced), Lane B LOST (-$100, stopped). Nothing is at risk, so daily BB exposure is $0.
  assert.equal(bb.length, 2, "the day's two graded BB cards (Lane A + Lane B)");
  const laneA = bb.find((l) => l.lane === "A"), laneB = bb.find((l) => l.lane === "B");
  assert.equal(laneA.status, "won", "Lane A Step-1 settled WON");
  assert.equal(laneB.status, "lost", "Lane B Step-1 settled LOST");
  for (const l of bb) {
    assert.equal(l.step, 1, `Lane ${l.lane} graded Step 1`);
    assert.equal(l.stake, 100, `Lane ${l.lane} rode a $100 seed`);
    assert.equal(l.exposure, 0, `Lane ${l.lane} is settled — $0 at risk`);
    assert.equal(l.legCount, 2, `Lane ${l.lane} Step-1 card has 2 legs`);
  }
  assert.equal(dp.products.bankBuilder.exposure, 0, "BB exposure is $0 — both Step-1 cards settled");
  assert.equal(dp.openExposure, 0, "daily open exposure $0 (June-25 slate fully settled)");
  // Canonical money is the post-settlement truth: crown = Σ two banked finals (20465.40); active bankroll =
  // crown − $400 realized dual-lane losses = 20065.40. The daily view reconciles to it.
  assert.equal(dp.activeBankroll, 20065.4); assert.equal(dp.crownBankroll, 20465.4);
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: a forward lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST JUNE-25 SETTLEMENT (cycle 3): Lane A advanced to a forward Step-2 card (Lane B is stopped), so a fresh
  // build serves the single forward Lane A card and places exactly its $100 seed at risk — and leaves the
  // canonical bankroll/crown untouched (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 1, "one forward BB lane (Lane A advanced; Lane B stopped)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 100, "only the single $100 seed is at risk");
  assert.equal(dp.activeBankroll, 20065.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
