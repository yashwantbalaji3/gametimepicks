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

test("rung math (post-July-5 activation): both lanes restarted → fresh $100 Step-1 forward rung in each lane", () => {
  const { laneA, laneB } = readLaneRungs(root);
  // POST JULY-5 ACTIVATION: the operator approved a fresh cycle-7 restart, so BOTH lanes surface a forward rung —
  // a fresh $100 Step-1 with 0 cleared steps. The July-3 stopped cycle (Lane A won July-1/July-2 then lost
  // July-3; Lane B lost July-3) is preserved in each lane's priorLane chain.
  assert.ok(laneA, "Lane A has a forward rung (cycle-7 restart)");
  assert.equal(laneA.nextStep, 1, "Lane A forward rung is a fresh Step 1");
  assert.equal(laneA.clearedSteps, 0, "Lane A has 0 cleared steps on the fresh cycle");
  assert.equal(laneA.rolledStake, 100, "Lane A stakes the fresh $100 seed");
  assert.ok(laneB, "Lane B has a forward rung (cycle-7 restart)");
  assert.equal(laneB.nextStep, 1, "Lane B forward rung is a fresh Step 1");
  assert.equal(laneB.clearedSteps, 0, "Lane B has 0 cleared steps on the fresh cycle");
  assert.equal(laneB.rolledStake, 100, "Lane B stakes the fresh $100 seed");
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

test("settlement history is DURABLY recorded in the ladder priorLane chain (Lane A won July-1/July-2 then lost July-3, Lane B lost July-3) — survives the daily slate roll", () => {
  // The settlements live in the LADDER (the permanent record), not the daily-portfolio (which rolls to the
  // next slate). Assert the durable facts so this test survives every daily roll-forward. POST JULY-5
  // ACTIVATION: both lanes RESTARTED (cycle 7, fresh active Step-1), which layered ONE MORE priorLane level on
  // top of the settled history. Lane A: priorLane (cycle 6) holds WON Step-1 (July-1) + WON Step-2 (July-2) +
  // LOST Step-3 (July-3); deeper chain holds the earlier LOST cycles and a cycle-3 WON Step-1 ($201.08) + LOST
  // Step-2. Lane B: priorLane (cycle 6) holds the July-3 LOST Step-1; cycle 5 holds the earlier LOST Step-1;
  // deeper chain holds a cycle-3 WON Step-1 ($206.25) + LOST Step-2, then a LOST Step-1.
  const run = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json")).run;
  // Lane A live cycle 7: fresh active Step-1; the settled July cycle is one level down (priorLane, cycle 6).
  assert.equal(run.laneA.laneStatus, "active", "Lane A active — cycle-7 restart (fresh Step 1)");
  const aPrior = run.laneA.priorLane;
  assert.equal(aPrior?.laneStatus, "stopped", "Lane A priorLane (cycle 6) stopped — Step-3 settled-LOST July-3");
  const aCurStep1 = (aPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aCurStep1 && aCurStep1.status === "settled" && aCurStep1.result === "won", "Lane A cycle-6 Step-1 settled WON (July-1)");
  const aCurStep3 = (aPrior?.steps ?? []).find((s) => s.step === 3);
  assert.ok(aCurStep3 && aCurStep3.status === "settled" && aCurStep3.result === "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  const aPriorStep1 = (aPrior?.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "lost", "Lane A earlier Step-1 settled LOST (archived)");
  // The durable cycle-3 WON $201.08 step now lives one MORE level deeper (the restart layered a cycle on top).
  const aWonCycle = run.laneA.priorLane?.priorLane?.priorLane?.priorLane;
  const aWCStep1 = (aWonCycle?.steps ?? []).find((s) => s.step === 1);
  const aWCStep2 = (aWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aWCStep1 && aWCStep1.result === "won", "Lane A earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((aWCStep1.payout ?? 0) - 201.08) < 0.5, "Lane A earlier cycle Step-1 rolled $100 → $201.08");
  assert.ok(aWCStep2 && aWCStep2.result === "lost", "Lane A earlier cycle Step-2 settled LOST (archived)");
  // Lane B live cycle 7: fresh active Step-1; the July-3 LOST Step-1 is one level down (cycle 6), the earlier
  // LOST Step-1 one below that (cycle 5).
  assert.equal(run.laneB.laneStatus, "active", "Lane B active — cycle-7 restart (fresh Step 1)");
  const bPrior = run.laneB.priorLane;
  assert.equal(bPrior?.laneStatus, "stopped", "Lane B priorLane (cycle 6) stopped — Step-1 settled LOST July-3");
  const bCurStep1 = (bPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bCurStep1 && bCurStep1.status === "settled" && bCurStep1.result === "lost", "Lane B cycle-6 Step-1 settled LOST (July-3)");
  const bPriorStep1 = (bPrior?.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bPriorStep1 && bPriorStep1.status === "settled" && bPriorStep1.result === "lost", "Lane B earlier Step-1 settled LOST (archived one level deeper)");
  // The durable cycle-3 WON $206.25 step + LOST Step-2 now live one MORE level deeper (restart layered a cycle on top).
  const bWonCycle = run.laneB.priorLane?.priorLane?.priorLane?.priorLane;
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

test("BB seed-model invariant: each active lane risks exactly its $100 seed; generation never touches canonical money", () => {
  // POST JULY-5 ACTIVATION: both lanes RESTARTED (cycle 7), so each serves a forward Step-1 card. The per-lane
  // seed model holds: each active forward lane risks EXACTLY its $100 seed (never the rolled ladder value), BB
  // exposure = $100 × active lanes = $200, and generation leaves the canonical bankroll/crown untouched (only an
  // official settlement moves them; generation never does).
  const dp = buildPersistedDailyPortfolio(root, "2026-07-05T12:00:00Z", "2026-07-05", "2026-07-05T12:00:00Z", true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(bb.length, 2, "two forward BB lanes (cycle-7 restart, fresh Step 1 each)");
  for (const l of bb) assert.equal(l.exposure, 100, `Lane ${l.lane} risks exactly its $100 seed`);
  assert.equal(dp.products.bankBuilder.exposure, 200, "BB exposure = two $100 seeds");
  assert.equal(dp.activeBankroll, 19265.4, "active bankroll is the post-settlement truth, unchanged by generation");
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
