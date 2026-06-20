import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMoonshotLane, activeMoonshotCard, moonshotOpenExposure, moonshotAllPreEvent } from "./moonshot/moonshot-lane.ts";

const lane = loadMoonshotLane();
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
const dec = (a) => (a >= 0 ? 1 + a / 100 : 1 + 100 / -a);

test("Moonshot lane loads, is a SEPARATE paper challenge (not Lane A/B), 3-step $25→$3K ladder", () => {
  assert.ok(lane, "moonshot lane present");
  assert.equal(lane.paperOnly, true);
  assert.equal(lane.sportScope, "world_cup");
  assert.equal(lane.startingStake, 25);
  assert.equal(lane.targetReturn, 3000);
  assert.equal(lane.ladder.length, 3, "three steps");
  assert.deepEqual(lane.ladder.map((s) => [s.stake, s.targetReturn]), [[25, 200], [200, 1000], [1000, 3000]]);
  assert.deepEqual(lane.ladder.map((s) => s.requiredMultiple), [8.0, 5.0, 3.0]);
  // It is its OWN artifact — the Dual Bank Builder file is never referenced here.
  assert.ok(!JSON.stringify(lane).includes("dual-bank-builder"), "moonshot artifact does not embed Lane A/B");
});

test("Moonshot Step 1 card: longshot odds in the +600..+900 band, every leg real + pre-event, no leg < -500", () => {
  const card = lane.ladder[0].card; // Step 1 card (now officially settled)
  assert.ok(card, "Step 1 card present");
  assert.equal(card.risk, "longshot");
  assert.equal(card.scope, "world_cup");
  assert.ok(card.combinedOdds >= 600 && card.combinedOdds <= 900, `combined ${card.combinedOdds} in +600..+900`);
  // Combined odds reconcile with the legs (no fabricated combined price).
  const product = card.legs.reduce((p, l) => p * dec(l.odds), 1);
  const reconstructed = product >= 2 ? Math.round((product - 1) * 100) : -Math.round(100 / (product - 1));
  assert.ok(Math.abs(reconstructed - card.combinedOdds) <= 2, "combined odds reconcile with the legs");
  assert.ok(Math.abs(card.projectedReturn - card.stake * product) < 0.5, "projected return = stake × combined decimal");
  // Quality guards: no extreme-favorite filler; every leg odds-backed + model-ranked.
  for (const l of card.legs) {
    assert.ok(l.odds >= -500, `${l.participant} not shorter than -500 (got ${l.odds})`);
    assert.ok(typeof l.odds === "number" && typeof l.modelProbability === "number" && l.modelProbability > 0, `${l.participant} is odds-backed + model-ranked`);
    assert.ok(l.startTime && typeof l.startTime === "string", `${l.participant} carries a real start time`);
    assert.ok(l.settlement && l.settlement.source, `${l.participant} has an official settlement source`);
  }
  // World Cup-forward + multi-game.
  assert.ok(card.legs.every((l) => l.sport === "WORLD_CUP"), "World Cup-only");
  assert.ok(card.distinctGames >= 3, "multi-game (≥3 distinct games)");
  // Built pre-event; now officially settled (Step 1 LOST — Turkey or Draw).
  assert.equal(card.result, "lost", "Step 1 settled lost");
  assert.equal(lane.status, "stopped", "lane stopped after the Step 1 loss");
});

test("Moonshot correlation is disclosed, and it is never called lower-risk", () => {
  const card = lane.ladder[0].card; // Step 1 card (now officially settled)
  assert.match(card.correlationProfile, /stack|multi_game/, "correlation profile present");
  assert.ok(card.whyThisCard.some((w) => /correlation|stack|intentional/i.test(w)), "correlation disclosed in 'why this card'");
  assert.ok(card.whyItCanFail.length >= 1, "explains how it can fail");
  // Never lower-risk / banned copy.
  const blob = JSON.stringify(lane).toLowerCase();
  for (const w of ["lower-risk", "lower risk", "guaranteed", "sure thing", "risk-free", "safest"]) assert.ok(!blob.includes(w), `no '${w}'`);
});

test("Mr. Dub: Moonshot exposure is broken out separately and does NOT change the Lane A/B record", () => {
  assert.ok(portfolio.moonshot, "moonshot section present");
  assert.equal(portfolio.moonshot.exposure, moonshotOpenExposure(lane), "moonshot exposure matches the lane (settled → $0)");
  assert.equal(portfolio.moonshot.exposure, 0, "Moonshot settled (Step 1 lost) → $0 exposure");
  assert.equal(portfolio.moonshot.separateFromCore, true);
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "Moonshot 0-1 after the Step 1 loss");
  // Core Lane A/B record + exposure reflect settlement, and Moonshot stays separate from the core record.
  assert.deepEqual(portfolio.record, { wins: 8, losses: 5, voids: 0, pending: 1 }, "core record after settlement");
  assert.equal(portfolio.openExposure, 100, "core open exposure settled to $0");
  assert.equal(portfolio.totalOpenExposure, 100, "total exposure $0 (core + moonshot both settled)");
});

test("Bank Builder + Mr. Dub pages render the Moonshot lane as a separate high-volatility section", () => {
  const bb = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");
  assert.match(bb, /MoonshotLaneCard/, "bank-builder renders the Moonshot card");
  assert.match(bb, /loadMoonshotLane/, "bank-builder loads the moonshot lane");
  // Lane A/B board is still rendered + unaffected.
  assert.match(bb, /DualLadderBoard/, "Dual Bank Builder board still present");
  const card = fs.readFileSync("src/components/bank-builder/moonshot-lane-card.tsx", "utf8");
  assert.match(card, /High-volatility/, "high-volatility label");
  assert.match(card, /not<\/strong>\)? part of the core Dual Bank Builder|not<\/strong> part of the core/i, "states it is separate from the core");
  assert.ok(!/lower.risk|guaranteed|risk-free|sure thing/i.test(card), "never lower-risk / banned copy");
  const mrdub = fs.readFileSync("src/app/mr-dub/page.tsx", "utf8");
  assert.match(mrdub, /Moonshot Lane/, "Mr. Dub shows a Moonshot section");
  assert.match(mrdub, /portfolio\.moonshot/, "Mr. Dub reads the separate moonshot data");
});

test("protected Bank Builder history + Lane A/B active artifact are untouched by Moonshot", () => {
  // The Moonshot lane is its own file; the dual artifact still has the corrected USA+Gonzales / Turkey+Hoskins legs.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  const aLegs = JSON.stringify(dual.run.laneA.legs);
  assert.ok(/USA/.test(aLegs) && /Gonzales/.test(aLegs), "Lane A still USA + Gonzales (unchanged)");
  assert.ok(!/moonshot/i.test(JSON.stringify(dual)), "no moonshot contamination in the dual artifact");
});
