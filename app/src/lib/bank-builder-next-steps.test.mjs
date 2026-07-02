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

test("rung math (post-July-1 settlement): Lane A won → forward rung; Lane B lost → no forward rung (awaiting a fresh slate)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JULY-1 SETTLEMENT: Lane A's July-1 Step-1 settled WON, so it advanced and surfaces a forward rung
  // (Step 2, rolled stake from the WON Step-1). Lane B's July-1 Step-1 settled LOST, so it is stopped with no
  // open forward rung until a new slate restarts it. The prior settled steps live in the priorLane chain.
  assert.ok(laneA, "Lane A has a forward rung (Step-1 settled-WON July-1, advanced)");
  assert.equal(laneA.nextStep, 2, "Lane A forward rung is Step 2 (Step-1 cleared)");
  assert.equal(laneB, null, "Lane B has no forward rung (Step-1 settled-LOST July-1, awaiting a fresh slate)");
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

test("settlement history is DURABLY recorded in the ladder priorLane chain (Lane A won July-1, Lane B lost July-1) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. After July-1: Lane A
  // WON its Step-1 (advanced, cycle 6) and Lane B LOST its Step-1 (stopped, cycle 5); the older settled steps
  // live deeper in each lane's priorLane chain. Lane A: current (cycle 6) holds WON Step-1; deeper chain holds
  // the earlier LOST steps and a cycle-3 WON Step-1 ($201.08) + LOST Step-2. Lane B: current (cycle 5) holds
  // LOST Step-1; deeper chain holds a cycle-3 WON Step-1 ($206.25) + LOST Step-2, then a LOST Step-1.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  // Lane A current Step-1 settled WON (July-1 → advanced); the prior cycles are archived in the chain.
  assert.equal(run.laneA.laneStatus, "advanced", "Lane A advanced — Step-1 settled-WON July-1");
  const aCurStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  assert.ok(aCurStep1 && aCurStep1.status === "settled" && aCurStep1.result === "won", "Lane A current Step-1 settled WON (July-1)");
  const aPriorStep1 = (run.laneA.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "lost", "Lane A prior Step-1 settled LOST (archived)");
  // The durable cycle-3 WON $201.08 step now lives one level deeper (a fresh cycle was layered on top).
  const aWonCycle = run.laneA.priorLane?.priorLane?.priorLane;
  const aWCStep1 = (aWonCycle?.steps ?? []).find((s) => s.step === 1);
  const aWCStep2 = (aWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aWCStep1 && aWCStep1.result === "won", "Lane A earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((aWCStep1.payout ?? 0) - 201.08) < 0.5, "Lane A earlier cycle Step-1 rolled $100 → $201.08");
  assert.ok(aWCStep2 && aWCStep2.result === "lost", "Lane A earlier cycle Step-2 settled LOST (archived)");
  // Lane B current Step-1 settled LOST (July-1 → stopped); the prior cycles are archived in the chain.
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped — Step-1 settled-LOST July-1");
  const bCurStep1 = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(bCurStep1 && bCurStep1.status === "settled" && bCurStep1.result === "lost", "Lane B current Step-1 settled LOST (July-1)");
  // The durable cycle-3 WON $206.25 step + LOST Step-2 now live one level deeper in the chain.
  const bWonCycle = run.laneB.priorLane?.priorLane;
  const bWCStep1 = (bWonCycle?.steps ?? []).find((s) => s.step === 1);
  const bWCStep2 = (bWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(bWCStep1 && bWCStep1.result === "won", "Lane B earlier cycle Step-1 settled WON (archived)");
  assert.ok(bWCStep2 && bWCStep2.result === "lost", "Lane B earlier cycle Step-2 settled LOST (archived)");
  const bC2Step1 = (bWonCycle?.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bC2Step1 && bC2Step1.result === "lost", "Lane B earliest Step-1 settled LOST (archived)");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: each forward lane places exactly its $100 seed; generation never touches canonical money", () => {
  // POST JULY-1 SETTLEMENT: Lane A WON its July-1 Step (advanced → served as a forward lane), Lane B LOST
  // (stopped, not served). So a build serves exactly ONE forward BB lane (Lane A, $100 seed). The per-lane
  // seed model still holds — any forward lane that IS served risks exactly its $100 seed — and generation
  // leaves the canonical bankroll/crown untouched (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 1, "one forward BB lane (Lane A advanced, won July-1; Lane B stopped)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 100, "$100 BB exposure (Lane A's $100 seed)");
  assert.equal(dp.activeBankroll, 19465.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
