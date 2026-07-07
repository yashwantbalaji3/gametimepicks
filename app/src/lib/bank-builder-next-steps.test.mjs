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

test("rung math (post-July-6 settlement): Lane A WON Step-1 → advanced to a Step-2 forward rung (rolled $174.23); Lane B is a no-play (no forward rung)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JULY-6 SETTLEMENT: the operator-approved cycle-8 Lane A Step-1 card WON, so the lane ADVANCED — its
  // forward rung is now Step 2 with 1 cleared step and the WON Step-1 payout ($174.23) rolled forward. Lane B is
  // a deliberate no-play (no forward rung). The July-5 stopped cycle and the earlier July cycles are preserved in
  // each lane's priorLane chain.
  assert.ok(laneA, "Lane A has a forward rung (cycle-8 advanced to Step 2)");
  assert.equal(laneA.nextStep, 2, "Lane A forward rung is Step 2 (Step-1 WON, advanced)");
  assert.equal(laneA.clearedSteps, 1, "Lane A has 1 cleared step (the WON Step-1) on the advanced cycle");
  assert.equal(laneA.rolledStake, 174.23, "Lane A rolled the WON Step-1 payout ($174.23) into the Step-2 stake");
  assert.ok(!laneB, "Lane B has NO forward rung — deliberate July-6 no-play (stays stopped)");
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

test("settlement history is DURABLY recorded in the ladder priorLane chain (Lane A won July-1/July-2 then lost, both lanes lost July-5) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. POST JULY-6
  // SETTLEMENT: Lane A (cycle 8) WON its Step-1 → advanced (Step-1 settled-WON at the top) and Lane B is a
  // no-play, so the July-5 loss now sits one level down in the priorLane chain (Lane A) or the top of the
  // stopped lane (Lane B). Lane A: priorLane (cycle 7) is the July-5 LOST Step-1; two levels down (cycle 6) holds
  // WON Step-1 (July-1) + WON Step-2 (July-2) + LOST Step-3 (July-3); the deeper chain holds the earlier LOST
  // cycles and a cycle-3 WON Step-1 ($201.08) + LOST Step-2. Lane B (stopped, cycle 7 July-5 loss at top): cycle
  // 6 holds the July-3 LOST Step-1; the deeper chain holds more LOST Step-1s, then a cycle-3 WON Step-1
  // ($206.25) + LOST Step-2.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  // Lane A live cycle 8: Step-1 settled-WON → advanced; the July-5 loss is one level down (priorLane, cycle 7).
  assert.equal(run.laneA.laneStatus, "advanced", "Lane A advanced — cycle-8 Step-1 WON July-6");
  const aTopStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  assert.ok(aTopStep1 && aTopStep1.status === "settled" && aTopStep1.result === "won", "Lane A cycle-8 Step-1 settled WON (July-6)");
  const aPrior = run.laneA.priorLane;
  assert.equal(aPrior?.laneStatus, "stopped", "Lane A priorLane (cycle 7) stopped — Step-1 settled-LOST July-5");
  const aPriorStep1 = (aPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "lost", "Lane A cycle-7 Step-1 settled LOST (July-5)");
  // Two levels down (cycle 6) is the July-1/July-2/July-3 cycle: WON Step-1, WON Step-2, LOST Step-3.
  const aJulyCycle = aPrior?.priorLane;
  assert.equal(aJulyCycle?.laneStatus, "stopped", "Lane A cycle 6 stopped — Step-3 settled-LOST July-3");
  const aJStep1 = (aJulyCycle?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aJStep1 && aJStep1.status === "settled" && aJStep1.result === "won", "Lane A cycle-6 Step-1 settled WON (July-1)");
  const aJStep3 = (aJulyCycle?.steps ?? []).find((s) => s.step === 3);
  assert.ok(aJStep3 && aJStep3.status === "settled" && aJStep3.result === "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  // The durable cycle-3 WON $201.08 step lives deeper still (five levels down from the active lane).
  const aWonCycle = run.laneA.priorLane?.priorLane?.priorLane?.priorLane?.priorLane;
  const aWCStep1 = (aWonCycle?.steps ?? []).find((s) => s.step === 1);
  const aWCStep2 = (aWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aWCStep1 && aWCStep1.result === "won", "Lane A earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((aWCStep1.payout ?? 0) - 201.08) < 0.5, "Lane A earlier cycle Step-1 rolled $100 → $201.08");
  assert.ok(aWCStep2 && aWCStep2.result === "lost", "Lane A earlier cycle Step-2 settled LOST (archived)");
  // Lane B is a no-play: it stays STOPPED with its July-5 LOST Step-1 at the top; the July-3 LOST Step-1 is one
  // level down (cycle 6), the earlier LOST Step-1s below that.
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped — July-6 no-play (July-5 Step-1 LOST at top)");
  const bTopStep1 = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(bTopStep1 && bTopStep1.status === "settled" && bTopStep1.result === "lost", "Lane B top Step-1 settled LOST (July-5)");
  const bPrior = run.laneB.priorLane;
  assert.equal(bPrior?.laneStatus, "stopped", "Lane B priorLane (cycle 6) stopped — Step-1 settled LOST July-3");
  const bCurStep1 = (bPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bCurStep1 && bCurStep1.status === "settled" && bCurStep1.result === "lost", "Lane B cycle-6 Step-1 settled LOST (July-3)");
  // The durable cycle-3 WON $206.25 step + LOST Step-2 live four levels down from the stopped Lane B top.
  const bWonCycle = run.laneB.priorLane?.priorLane?.priorLane?.priorLane;
  const bWCStep1 = (bWonCycle?.steps ?? []).find((s) => s.step === 1);
  const bWCStep2 = (bWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(bWCStep1 && bWCStep1.result === "won", "Lane B earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((bWCStep1.payout ?? 0) - 206.25) < 0.5, "Lane B earlier cycle Step-1 rolled $100 → $206.25");
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

test("BB seed-model invariant: each active lane risks exactly its $100 seed; generation never touches canonical money", () => {
  // POST JULY-6 ACTIVATION: only Lane A RESTARTED (cycle 8) and serves a forward Step-1 card; Lane B is a
  // no-play. The per-lane seed model holds: each active forward lane risks EXACTLY its $100 seed (never the
  // rolled ladder value), BB exposure = $100 × active lanes = $100, and generation leaves the canonical
  // bankroll/crown untouched (only an official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, "2026-07-06T12:00:00Z", "2026-07-06", "2026-07-06T12:00:00Z", true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 1, "one forward BB lane (Lane A cycle-8 restart, fresh Step 1; Lane B no-play)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 100, "BB exposure = one $100 seed");
  assert.equal(dp.activeBankroll, 19065.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
