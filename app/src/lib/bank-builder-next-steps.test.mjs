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

test("June-25 settlement is DURABLY recorded in the ladder (Lane A Step-1 WON → advanced, Lane B Step-1 LOST → stopped) — survives the daily slate roll", () => {
  // The June-25 settlement lives in the LADDER (the permanent record), not the daily-portfolio (which rolls
  // to the next slate). Assert the durable fact so this test survives every daily roll-forward.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  const aStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  const bStep1 = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(aStep1 && aStep1.status === "settled" && aStep1.result === "won", "Lane A Step-1 settled WON (June-25)");
  assert.ok(Math.abs((aStep1.payout ?? 0) - 201.08) < 0.5, "Lane A Step-1 rolled $100 → $201.08");
  assert.equal(run.laneA.laneStatus, "advanced", "Lane A advanced after the won Step-1");
  assert.ok(bStep1 && bStep1.status === "settled" && bStep1.result === "lost", "Lane B Step-1 settled LOST (June-25)");
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped after the lost Step-1");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
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
