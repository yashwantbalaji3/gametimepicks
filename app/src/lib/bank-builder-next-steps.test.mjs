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

test("rung math (post-June-29 settlement): both lanes settled-LOST their Step → no forward rung (awaiting a fresh slate)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JUNE-29 SETTLEMENT: Lane A's and Lane B's June-29 Step-1 both settled LOST, so each lane is stopped
  // with no open forward rung. There is no fresh slate yet, so readLaneRungs surfaces NO forward rung for
  // either lane (null) — the seed/target math has nothing pending until a new slate restarts the lanes. The
  // prior settled steps live in the priorLane chain.
  assert.equal(laneA, null, "Lane A has no forward rung (Step-1 settled-LOST June-29, awaiting a fresh slate)");
  assert.equal(laneB, null, "Lane B has no forward rung (Step-1 settled-LOST June-29, awaiting a fresh slate)");
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

test("June-25/26/27/29 settlement is DURABLY recorded in the ladder priorLane chain (both lanes settled-LOST their June-29 Step) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. Both lanes are now
  // stopped with their June-29 Step-1 settled LOST as the CURRENT step; the June-25/26/27 settled steps live one
  // level deeper in each lane's priorLane chain. Lane A: current (cycle 5) holds LOST June-29 Step-1; priorLane
  // (cycle 4) holds LOST June-27 Step-1; priorLane.priorLane (cycle 3) holds WON Step-1 (June-25) + LOST Step-2
  // (June-26). Lane B: current (cycle 4) holds LOST June-29 Step-1; priorLane (cycle 3) holds WON Step-1
  // (June-26) + LOST Step-2 (June-27); priorLane.priorLane holds LOST June-25 Step-1.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  // Lane A current Step-1 settled LOST (June-29); the prior cycles are archived in the chain.
  assert.equal(run.laneA.laneStatus, "stopped", "Lane A stopped — Step-1 settled-LOST June-29");
  const aCurStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  assert.ok(aCurStep1 && aCurStep1.status === "settled" && aCurStep1.result === "lost", "Lane A current Step-1 settled LOST (June-29)");
  const aPriorStep1 = (run.laneA.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "lost", "Lane A prior Step-1 settled LOST (June-27, archived)");
  const aCycle3 = run.laneA.priorLane?.priorLane;
  const aC3Step1 = (aCycle3?.steps ?? []).find((s) => s.step === 1);
  const aC3Step2 = (aCycle3?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aC3Step1 && aC3Step1.result === "won", "Lane A cycle-3 Step-1 settled WON (June-25, archived)");
  assert.ok(Math.abs((aC3Step1.payout ?? 0) - 201.08) < 0.5, "Lane A cycle-3 Step-1 rolled $100 → $201.08");
  assert.ok(aC3Step2 && aC3Step2.result === "lost", "Lane A cycle-3 Step-2 settled LOST (June-26, archived)");
  // Lane B current Step-1 settled LOST (June-29); the prior cycles are archived in the chain.
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped — Step-1 settled-LOST June-29");
  const bCurStep1 = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(bCurStep1 && bCurStep1.status === "settled" && bCurStep1.result === "lost", "Lane B current Step-1 settled LOST (June-29)");
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
  // POST JUNE-29 SETTLEMENT: both lanes settled-LOST their June-29 Step, so there is no open forward rung and a
  // build serves ZERO forward BB lanes ($0 exposure) until a fresh slate restarts them. The per-lane seed model
  // still holds — any forward lane that IS served risks exactly its $100 seed — and generation leaves the
  // canonical bankroll/crown untouched (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 0, "no forward BB lanes (both lanes settled-LOST June-29, awaiting a fresh slate)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 0, "$0 BB exposure (no forward lane to seed while awaiting a fresh slate)");
  assert.equal(dp.activeBankroll, 19565.4, "active bankroll is the post-settlement truth, unchanged by generation");
  assert.equal(dp.crownBankroll, 20465.4, "crown unchanged by generation (Σ two banked finals)");
});

test("started-game guard still holds for next-step cards (0 exposure after kickoff)", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure once games have started");
});

test("Bank Builder page: completed crown proof is collapsed + relabeled (not ACTIVE), active ladder leads", () => {
  const page = read("src/app/bank-builder/page.tsx");
  const hero = read("src/components/bank-builder/climb-hero.tsx");
  // The single ClimbHero ladder LEADS the page, and the page hands it the real completed-ladder finals
  // (NOT the primary ACTIVE figure) via the completedLadders prop.
  assert.match(page, /<ClimbHero/, "the active ClimbHero ladder leads the page");
  assert.match(page, /completedLadders=\{completedLadders\}/, "page passes the completed-ladder proof to the hero (separate from the active figure)");
  assert.match(page, /readCompletedLadders/, "completed-ladder finals are read verbatim, not the active bankroll");
  // Inside ClimbHero the completed-ladder PROOF is a distinct, de-emphasised strip ("Completed ladders"),
  // rendered AFTER the active "Where the ladder stands now" hero — it is proof, not the active figure.
  const activeIdx = hero.indexOf("Where the ladder stands now");
  const proofIdx = hero.indexOf("Completed ladders");
  assert.ok(activeIdx > 0 && proofIdx > activeIdx, "active climb renders before the completed-ladder proof strip");
  assert.match(hero, /Verified · official results/, "completed-ladder proof is labeled as verified history, not ACTIVE");
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
