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

test("rung math (post-June-25 settlement → June-26 restart): Lane A WON Step 1 → forward Step 2; Lane B RESTARTED → fresh Step 1 rung", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-25 SETTLEMENT: Lane A's Step 1 settled WON ($100 → $201.08), so the lane rolls its $201.08
  // forward onto Step 2 (clearedSteps 1, target $700). Lane B LOST its June-25 Step 1 (now archived in
  // laneB.priorLane) and was operator-RESTARTED for June-26 → a FRESH Step-1 rung ($100 seed, target $200).
  assert.ok(laneA, "Lane A has a forward rung (rolled onto Step 2 after the WON Step 1)");
  assert.equal(laneA.lane, "A");
  assert.equal(laneA.nextStep, 2, "Lane A advanced to Step 2");
  assert.equal(laneA.clearedSteps, 1, "Lane A cleared 1 rung (Step 1 WON)");
  assert.equal(laneA.rolledStake, 201.08, "Lane A rolls its $201.08 Step-1 payout forward");
  assert.equal(laneA.targetReturn, 700, "Lane A Step-2 target is $700");
  assert.ok(laneB, "Lane B is RESTARTED — a fresh forward rung (no longer stopped/null)");
  assert.equal(laneB.lane, "B");
  assert.equal(laneB.nextStep, 1, "Lane B leads with a fresh Step 1");
  assert.equal(laneB.clearedSteps, 0, "Lane B cleared 0 rungs (fresh restart; June-25 loss lives in priorLane)");
  assert.equal(laneB.rolledStake, 100, "Lane B places a fresh $100 seed");
  assert.equal(laneB.targetReturn, 200, "Lane B Step-1 target is $200");
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

test("June-25 settlement is DURABLY recorded in the ladder (Lane A Step-1 WON → advanced, Lane B Step-1 LOST → archived in priorLane on June-26 restart) — survives the daily slate roll", () => {
  // The June-25 settlement lives in the LADDER (the permanent record), not the daily-portfolio (which rolls
  // to the next slate). Assert the durable fact so this test survives every daily roll-forward. On the
  // June-26 operator restart, Lane B's LOST June-25 Step-1 MOVED into laneB.priorLane.steps (laneB.steps is
  // now empty for the fresh active cycle); Lane A's WON Step-1 stays in laneA.steps.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  const aStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  const bStep1 = (run.laneB.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aStep1 && aStep1.status === "settled" && aStep1.result === "won", "Lane A Step-1 settled WON (June-25)");
  assert.ok(Math.abs((aStep1.payout ?? 0) - 201.08) < 0.5, "Lane A Step-1 rolled $100 → $201.08");
  assert.equal(run.laneA.laneStatus, "advanced", "Lane A advanced after the won Step-1");
  assert.ok(bStep1 && bStep1.status === "settled" && bStep1.result === "lost", "Lane B Step-1 settled LOST (June-25, archived in priorLane)");
  assert.equal(run.laneB.laneStatus, "active", "Lane B RESTARTED June-26 (active fresh Step-1; June-25 loss in priorLane)");
  assert.equal((run.laneB.steps ?? []).length, 0, "Lane B's live steps are empty on the fresh restart");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: each forward lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST JUNE-25 SETTLEMENT → JUNE-26 RESTART: Lane A advanced to a forward Step-2 card and Lane B was
  // restarted to a fresh Step-1 card, so a build serves BOTH forward BB lanes. Each forward lane places
  // exactly its $100 seed at risk — and leaves the canonical bankroll/crown untouched (only an official
  // settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 2, "two forward BB lanes (Lane A advanced to Step-2; Lane B restarted to a fresh Step-1)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 100, "$100 per active lane (only Lane A finds an eligible card on this synthetic slate)");
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
