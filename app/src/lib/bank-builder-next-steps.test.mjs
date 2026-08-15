import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLaneRungs, selectSafestTargetFitCard } from "./daily-portfolio/bank-builder-generation.ts";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";
import { loadWorldCupModelPicks } from "./world-cup/model-qualified-picks.ts";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

/**
 * Build a temp `root` mirroring public/data with an UNSETTLED approved BB step, so the ACTIVE/$100 seed path
 * stays covered after the real July-7 approved card settled. Copies the data tree, then marks the approved
 * lane's matching ladder step as NOT settled (pending) — `approvedBankBuilderLanes` then renders it
 * active/$100 (the general future-day mechanism). Caller must rmSync the returned dir. No real artifact touched.
 */
function makeUnsettledApprovedRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-bb-unsettled-"));
  const dataRoot = path.join(tmp, "data");
  fs.cpSync(root, dataRoot, { recursive: true });
  const ladderPath = path.join(dataRoot, "methodology", "launch", "dual-bank-builder-active.json");
  const ladder = JSON.parse(fs.readFileSync(ladderPath, "utf8"));
  const laneA = ladder.run.laneA;
  laneA.laneStatus = "active";
  const step2 = (laneA.steps ?? []).find((s) => s.step === 2);
  if (step2) { step2.status = "pending"; delete step2.result; delete step2.payout; } // un-settle the approved Step-2
  fs.writeFileSync(ladderPath, JSON.stringify(ladder, null, 1));
  return { tmp, dataRoot };
}

const read = (p) => fs.readFileSync(p, "utf8");
const root = pinnedLaneRoot();
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
test("rung math (advanced cycle-8): Lane A WON Steps 1 & 2 → advanced to a Step-3 forward rung (rolled $305.57); Lane B is a no-play (no forward rung)", () => {
  // The advanced cycle-8 Lane A (Step-1 WON July-6 + Step-2 WON July-7) is validated against a reconstructed settled
  // root — the July-21 REVIEW RESTART moved that cycle into priorLane. Its forward rung is Step 3 with 2 cleared
  // steps and the WON Step-2 payout ($305.57) rolled forward; Lane B is a deliberate no-play (no forward rung).
  const { tmp, dataRoot } = makeSettledApprovedRoot(root);
  try {
    const { laneA, laneB } = readLaneRungs(dataRoot);
    assert.ok(laneA, "Lane A has a forward rung (cycle-8 advanced to Step 3)");
    assert.equal(laneA.nextStep, 3, "Lane A forward rung is Step 3 (Steps 1 & 2 WON, advanced)");
    assert.equal(laneA.clearedSteps, 2, "Lane A has 2 cleared steps (the WON Step-1 + Step-2) on the advanced cycle");
    assert.equal(laneA.rolledStake, 305.57, "Lane A rolled the WON Step-2 payout ($305.57) into the Step-3 stake");
    assert.ok(!laneB, "Lane B has NO forward rung — deliberate no-play (stays stopped)");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
  const run = JSON.parse(read(path.join(pinnedLaneRoot(), "methodology/launch/dual-bank-builder-active.json"))).run;
  // JULY-21 REVIEW RESTART: both lanes' live top level is a fresh Step-1 review (paper, $0). The whole settled
  // history shifted down ONE level in each priorLane chain and is DURABLY preserved.
  assert.equal(run.laneA.laneStatus, "active", "Lane A restarted — fresh Step-1 review at the top (cycle 9)");
  const aTopStep1 = (run.laneA.steps ?? []).find((s) => s.step === 1);
  assert.ok(aTopStep1 && aTopStep1.status === "active" && (aTopStep1.result ?? null) === null, "Lane A top Step-1 is the fresh review (unsettled)");
  // One level down (cycle 8) is the advanced July-6/July-7 cycle: Step-1 WON (July-6) + Step-2 WON (July-7).
  const aPrior = run.laneA.priorLane;
  assert.equal(aPrior?.laneStatus, "advanced", "Lane A priorLane (cycle 8) advanced — Steps 1 & 2 settled WON");
  const aPriorStep1 = (aPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aPriorStep1 && aPriorStep1.status === "settled" && aPriorStep1.result === "won", "Lane A cycle-8 Step-1 settled WON (July-6)");
  const aPriorStep2 = (aPrior?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aPriorStep2 && aPriorStep2.status === "settled" && aPriorStep2.result === "won", "Lane A cycle-8 Step-2 settled WON (July-7)");
  // Two levels down (cycle 7) is the July-5 LOST Step-1 (stopped).
  const aCycle7 = aPrior?.priorLane;
  assert.equal(aCycle7?.laneStatus, "stopped", "Lane A cycle 7 stopped — Step-1 settled-LOST July-5");
  const aC7Step1 = (aCycle7?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aC7Step1 && aC7Step1.status === "settled" && aC7Step1.result === "lost", "Lane A cycle-7 Step-1 settled LOST (July-5)");
  // Three levels down (cycle 6) is the July-1/July-2/July-3 cycle: WON Step-1, WON Step-2, LOST Step-3.
  const aJulyCycle = aCycle7?.priorLane;
  assert.equal(aJulyCycle?.laneStatus, "stopped", "Lane A cycle 6 stopped — Step-3 settled-LOST July-3");
  const aJStep1 = (aJulyCycle?.steps ?? []).find((s) => s.step === 1);
  assert.ok(aJStep1 && aJStep1.status === "settled" && aJStep1.result === "won", "Lane A cycle-6 Step-1 settled WON (July-1)");
  const aJStep3 = (aJulyCycle?.steps ?? []).find((s) => s.step === 3);
  assert.ok(aJStep3 && aJStep3.status === "settled" && aJStep3.result === "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  // The durable cycle-3 WON $201.08 step lives deeper still (six levels down from the fresh-review top).
  const aWonCycle = run.laneA.priorLane?.priorLane?.priorLane?.priorLane?.priorLane?.priorLane;
  const aWCStep1 = (aWonCycle?.steps ?? []).find((s) => s.step === 1);
  const aWCStep2 = (aWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(aWCStep1 && aWCStep1.result === "won", "Lane A earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((aWCStep1.payout ?? 0) - 201.08) < 0.5, "Lane A earlier cycle Step-1 rolled $100 → $201.08");
  assert.ok(aWCStep2 && aWCStep2.result === "lost", "Lane A earlier cycle Step-2 settled LOST (archived)");
  // Lane B restarted to a fresh Step-1 review; its July-5 LOSS (cycle 7) is one level down, the July-3 LOSS (cycle 6)
  // two levels down, the earlier LOST Step-1s below that.
  assert.equal(run.laneB.laneStatus, "active", "Lane B restarted — fresh Step-1 review at the top (cycle 8)");
  const bTopStep1 = (run.laneB.steps ?? []).find((s) => s.step === 1);
  assert.ok(bTopStep1 && bTopStep1.status === "active" && (bTopStep1.result ?? null) === null, "Lane B top Step-1 is the fresh review (unsettled)");
  const bPrior = run.laneB.priorLane;
  assert.equal(bPrior?.laneStatus, "stopped", "Lane B priorLane (cycle 7) stopped — Step-1 settled LOST July-5");
  const bCurStep1 = (bPrior?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bCurStep1 && bCurStep1.status === "settled" && bCurStep1.result === "lost", "Lane B cycle-7 Step-1 settled LOST (July-5)");
  // The durable cycle-3 WON $206.25 step + LOST Step-2 live five levels down from the fresh-review Lane B top.
  const bWonCycle = run.laneB.priorLane?.priorLane?.priorLane?.priorLane?.priorLane;
  const bWCStep1 = (bWonCycle?.steps ?? []).find((s) => s.step === 1);
  const bWCStep2 = (bWonCycle?.steps ?? []).find((s) => s.step === 2);
  assert.ok(bWCStep1 && bWCStep1.result === "won", "Lane B earlier cycle Step-1 settled WON (archived)");
  assert.ok(Math.abs((bWCStep1.payout ?? 0) - 206.25) < 0.5, "Lane B earlier cycle Step-1 rolled $100 → $206.25");
  assert.ok(bWCStep2 && bWCStep2.result === "lost", "Lane B earlier cycle Step-2 settled LOST (archived)");
  const bC2Step1 = (bWonCycle?.priorLane?.steps ?? []).find((s) => s.step === 1);
  assert.ok(bC2Step1 && bC2Step1.result === "lost", "Lane B earliest Step-1 settled LOST (archived)");
  // The daily-portfolio (whatever slate it now holds) must always reconcile to the canonical bankroll.
  const dp = JSON.parse(read(path.join(pinnedLaneRoot(), "mr-dub/daily-portfolio.json")));
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(dp.activeBankroll, port.currentBankroll, "daily view reconciles to canonical bankroll");
  assert.equal(dp.crownBankroll, port.crownBankroll, "daily view reconciles to canonical crown");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
});

test("BB seed-model invariant: an ACTIVE approved lane risks exactly its $100 seed (distinct from the rolled stake); generation never touches canonical money", () => {
  // GENERAL ACTIVE-PATH MECHANISM (founder req 7 — future-day approval intact): an approved lane whose ladder
  // step is NOT yet settled renders ACTIVE and risks EXACTLY its $100 seed — NEVER the $174.23 rolled ladder
  // value. The real July-7 Lane A Step-2 card has since SETTLED (asserted separately below), so its seed is no
  // longer at risk; to keep the active/$100 invariant covered we build a temp root with that same approved
  // Step-2 card but its ladder step left UNSETTLED (pending). Generation leaves canonical money untouched.
  const { tmp, dataRoot } = makeUnsettledApprovedRoot();
  try {
    const dp = buildPersistedDailyPortfolio(dataRoot, "2026-07-07T12:00:00Z", "2026-07-07", "2026-07-07T12:00:00Z", true);
    const bb = dp.lanes.filter((l) => l.product === "bank-builder");
    assert.equal(bb.length, 1, "one forward BB lane (approved Lane A; Lane B no-play)");
    const a = bb.find((l) => l.lane === "A");
    assert.equal(a.status, "active", "unsettled approved Step-2 renders ACTIVE (future-day mechanism preserved)");
    assert.equal(a.exposure, 100, "Lane A risks exactly its $100 seed");
    assert.equal(a.stake, 174.23, "Lane A carries the WON Step-1 payout rolled into the Step-2 stake ($174.23)");
    assert.notEqual(a.exposure, a.stake, "exposure (the $100 seed at risk) is distinct from the rolled stake");
    assert.equal(dp.products.bankBuilder.exposure, 100, "BB exposure = one active $100 seed");
    // Generation reads canonical money read-only — the temp root's copy still carries the canonical figures.
    assert.equal(dp.activeBankroll, 19065.4, "active bankroll is the post-settlement truth, unchanged by generation");
    assert.equal(dp.crownBankroll, 20465.4, "crown unchanged by generation (Σ two banked finals)");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("BB same-day settlement: the settled July-7 Lane A Step-2 card renders WON → $0 exposure, not active", () => {
  // The approved Lane A Step-2 card (Colombia or Draw + Argentina to win) settled WON on July-7, so it must render
  // WON with $0 exposure — the seed is no longer at risk. Validated against a reconstructed settled root (the
  // July-21 review restart moved that settled cycle into priorLane). Counterpart to the unsettled-fixture invariant.
  const { tmp, dataRoot } = makeSettledApprovedRoot(root);
  try {
    const dp = buildPersistedDailyPortfolio(dataRoot, "2026-07-07T12:00:00Z", "2026-07-07", "2026-07-07T12:00:00Z", true);
    const a = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
    assert.ok(a, "Lane A present as history");
    assert.equal(a.status, "won", "settled WON, not active");
    assert.equal(a.exposure, 0, "settled seed is $0 exposure");
    assert.equal(a.clearedSteps, 2, "Step 2 counts as a cleared rung");
    assert.equal(dp.products.bankBuilder.exposure, 0, "BB open exposure is $0 after the same-day settlement");
    assert.equal(dp.activeBankroll, 19065.4, "active bankroll unchanged by generation");
    assert.equal(dp.crownBankroll, 20465.4, "crown unchanged by generation");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
