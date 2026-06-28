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

test("rung math (post-June-27 restarts): both lanes lost their Step → fresh Step-1 forward rungs ($100 seed, target $200)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-27 RESTARTS: Lane A's June-27 Step-1 LOST and Lane B's June-27 Step-2 LOST; both lanes were
  // operator-RESTARTED fresh (Lane A cycle 5, Lane B cycle 4). Each lane now surfaces a clean forward Step-1
  // rung: a $100 seed rolling toward the $200 Step-1 goal (clearedSteps 0). The prior lost steps live in the
  // priorLane chain, not the forward rung.
  assert.ok(laneA, "Lane A has a forward rung (fresh Step-1 restart after the June-27 loss)");
  assert.equal(laneA.lane, "A");
  assert.equal(laneA.nextStep, 1, "Lane A is back on a fresh Step 1");
  assert.equal(laneA.clearedSteps, 0, "Lane A cleared 0 rungs (fresh restart)");
  assert.equal(laneA.rolledStake, 100, "Lane A places a fresh $100 seed");
  assert.equal(laneA.targetReturn, 200, "Lane A Step-1 target is $200");
  assert.ok(laneB, "Lane B has a forward rung (fresh Step-1 restart after the June-27 loss)");
  assert.equal(laneB.lane, "B");
  assert.equal(laneB.nextStep, 1, "Lane B is back on a fresh Step 1");
  assert.equal(laneB.clearedSteps, 0, "Lane B cleared 0 rungs (fresh restart)");
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

test("June-25/26/27 settlement is DURABLY recorded in the ladder priorLane chain (both lanes restarted fresh after a June-27 Step loss) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. Both lanes are now a
  // fresh active Step-1; the June-25/26/27 settled steps moved into each lane's priorLane chain when the lanes
  // restarted. Lane A: priorLane (cycle 4) holds its LOST June-27 Step-1; priorLane.priorLane (cycle 3) holds
  // its WON Step-1 (June-25) + LOST Step-2 (June-26). Lane B: priorLane (cycle 3) holds its WON Step-1 (June-26)
  // + LOST Step-2 (June-27); priorLane.priorLane holds its LOST June-25 Step-1.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  // Lane A live forward rung is a fresh active Step-1; the prior cycles are archived.
  assert.equal(run.laneA.laneStatus, "active", "Lane A active — fresh Step-1 restart");
  const aPriorStep1 = (run.laneA.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "lost", "Lane A prior Step-1 settled LOST (June-27, archived)");
  const aCycle3 = run.laneA.priorLane?.priorLane;
  const aC3Step1 = (aCycle3?.steps ?? []).find((s) => s.step === 1);
  const aC3Step2 = (aCycle3?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aC3Step1 && aC3Step1.result === "won", "Lane A cycle-3 Step-1 settled WON (June-25, archived)");
  assert.ok(Math.abs((aC3Step1.payout ?? 0) - 201.08) < 0.5, "Lane A cycle-3 Step-1 rolled $100 → $201.08");
  assert.ok(aC3Step2 && aC3Step2.result === "lost", "Lane A cycle-3 Step-2 settled LOST (June-26, archived)");
  // Lane B live forward rung is a fresh active Step-1; the prior cycle is archived.
  assert.equal(run.laneB.laneStatus, "active", "Lane B active — fresh Step-1 restart");
  const bPriorStep1 = (run.laneB.priorLane?.steps ?? []).find((s) => s.step === 1);
  const bPriorStep2 = (run.laneB.priorLane?.steps ?? []).find((s) => s.step === 2);
  assert.ok(bPriorStep1 && bPriorStep1.result === "won", "Lane B prior Step-1 settled WON (June-26, archived)");
  assert.ok(bPriorStep2 && bPriorStep2.result === "lost", "Lane B prior Step-2 settled LOST (June-27, archived)");
  const bC2Step1 = (run.laneB.priorLane?.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bC2Step1 && bC2Step1.result === "lost", "Lane B earlier Step-1 settled LOST (June-25, archived)");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: each forward lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST JUNE-27 RESTARTS: both lanes LOST their June-27 Step and were restarted fresh, so a build serves TWO
  // forward BB lanes (Lane A + Lane B), each on a fresh Step-1. Each forward lane places exactly its $100 seed
  // at risk — and leaves the canonical bankroll/crown untouched (only an official settlement moves them;
  // generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 2, "two forward BB lanes (both fresh Step-1 restarts after the June-27 losses)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 200, "$100 per active lane × 2 (both lanes find an eligible forward card on this synthetic slate)");
  assert.equal(dp.activeBankroll, 19765.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
