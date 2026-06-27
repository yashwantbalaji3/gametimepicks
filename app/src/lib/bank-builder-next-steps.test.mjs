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

test("rung math (post-June-26 settlement): Lane A STOPPED (lost Step 2) → no forward rung; Lane B WON its restart Step 1 → forward Step 2 rung", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-25/26 SETTLEMENT: Lane A WON Step 1 (June-25) then LOST Step 2 (June-26), so the lane STOPPED —
  // it no longer surfaces a forward rung (readLaneRungs.laneA is null). Lane B LOST its June-25 Step 1 (now
  // archived in laneB.priorLane), was operator-RESTARTED June-26, and WON that fresh Step 1 ($100 → $206.25),
  // so it rolls its $206.25 forward onto Step 2 (clearedSteps 1, target $700).
  assert.ok(!laneA, "Lane A has no forward rung (stopped after losing Step 2, June-26)");
  assert.ok(laneB, "Lane B has a forward rung (rolled onto Step 2 after winning its restart Step 1)");
  assert.equal(laneB.lane, "B");
  assert.equal(laneB.nextStep, 2, "Lane B advanced to Step 2");
  assert.equal(laneB.clearedSteps, 1, "Lane B cleared 1 rung (restart Step 1 WON, June-26)");
  assert.equal(laneB.rolledStake, 206.25, "Lane B rolls its $206.25 Step-1 payout forward");
  assert.equal(laneB.targetReturn, 700, "Lane B Step-2 target is $700");
});

test("safest target-fit selector still serves a forward rung + holds its invariants (synthetic rung)", () => {
  // Verify the selector's invariants against a synthetic forward rung so coverage holds regardless of which
  // live lanes are active on a given slate.
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

test("June-25/26 settlement is DURABLY recorded in the ladder (Lane A Step-1 WON then Step-2 LOST → stopped; Lane B Step-1 LOST → archived in priorLane, restart Step-1 WON → advanced) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. Lane A's WON Step-1
  // (June-25) and LOST Step-2 (June-26) both stay in laneA.steps. On the June-26 operator restart, Lane B's
  // LOST June-25 Step-1 MOVED into laneB.priorLane.steps; Lane B's restarted Step-1 then WON June-26 and lives
  // in laneB.steps.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  const aStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  const aStep2 = (run.laneA.steps ?? []).find((s) => s.step === 2);
  const bStep1 = (run.laneB.priorLane?.steps ?? []).find((s) => s.step === 1);
  const bRestart = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(aStep1 && aStep1.status === "settled" && aStep1.result === "won", "Lane A Step-1 settled WON (June-25)");
  assert.ok(Math.abs((aStep1.payout ?? 0) - 201.08) < 0.5, "Lane A Step-1 rolled $100 → $201.08");
  assert.ok(aStep2 && aStep2.status === "settled" && aStep2.result === "lost", "Lane A Step-2 settled LOST (June-26)");
  assert.equal(run.laneA.laneStatus, "stopped", "Lane A stopped after the lost Step-2");
  assert.ok(bStep1 && bStep1.status === "settled" && bStep1.result === "lost", "Lane B Step-1 settled LOST (June-25, archived in priorLane)");
  assert.ok(bRestart && bRestart.status === "settled" && bRestart.result === "won", "Lane B restart Step-1 settled WON (June-26)");
  assert.equal(run.laneB.laneStatus, "advanced", "Lane B advanced after winning its restart Step-1 (June-26)");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: each forward lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST JUNE-25/26 SETTLEMENT: Lane A WON Step-1 then LOST Step-2 → STOPPED (no forward card). Lane B lost its
  // June-25 Step-1, was restarted June-26, and WON that fresh Step-1 → advanced to a forward Step-2 card, so a
  // build serves ONE forward BB lane (Lane B). The forward lane places exactly its $100 seed at risk — and
  // leaves the canonical bankroll/crown untouched (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 1, "one forward BB lane (Lane B advanced to Step-2; Lane A stopped)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 100, "$100 per active lane (Lane B finds an eligible forward card on this synthetic slate)");
  assert.equal(dp.activeBankroll, 19965.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
