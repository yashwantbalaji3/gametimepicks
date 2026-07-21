/**
 * Bank Builder REVIEW CARD reader guards. The reader must surface a lane's ACTIVE review-mode step legs
 * LOSSLESSLY (model prob, market prob, line, game) so /bank-builder can render leg-level clarity — while
 * NEVER surfacing priorLane (stopped) history and NEVER treating a non-review lane as a review card.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLaneReviewCard } from "./review-card.ts";

/** Write a crafted dual-bank-builder-active.json into a throwaway data root and return that root. */
function fixtureRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-review-card-"));
  const dir = path.join(root, "methodology", "launch");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "dual-bank-builder-active.json"), JSON.stringify({ run }));
  return root;
}

const REVIEW_LEG = {
  label: "Justin Wrobleski · Over 5.5 Strikeouts", participantName: "Justin Wrobleski",
  marketType: "pitcher_strikeouts", marketLabel: "Strikeouts", side: "over", line: 5.5, odds: 112,
  modelProbability: 0.6022, marketImpliedProbability: 0.4717, modelEdgePct: 13.05,
  matchup: "Los Angeles Dodgers @ Philadelphia Phillies", reviewMode: true,
};
const PRIOR_LEG = { label: "Someone · Anytime Goalscorer", participantName: "Someone", marketType: "player_goal_scorer", marketLabel: "Anytime Goalscorer", odds: 250 };

test("reads an ACTIVE review-mode step's legs losslessly (model prob, market prob, line, game)", () => {
  const root = fixtureRoot({
    laneA: {
      steps: [{ step: 1, status: "active", reviewMode: true, combinedOdds: 268, reviewNote: "Review Mode · paper · $0", legs: [REVIEW_LEG] }],
      priorLane: { steps: [{ step: 3, status: "settled", legs: [PRIOR_LEG] }] },
    },
  });
  const card = readLaneReviewCard(root, "laneA");
  assert.ok(card, "review card returned");
  assert.equal(card.step, 1);
  assert.equal(card.combinedOdds, 268);
  assert.equal(card.legs.length, 1);
  const leg = card.legs[0];
  assert.equal(leg.odds, 112);
  assert.equal(leg.line, 5.5);
  assert.equal(leg.side, "over");
  assert.equal(leg.modelProb, 0.6022, "model probability preserved (ui-loader would drop this)");
  assert.equal(leg.marketProb, 0.4717, "MARKET probability preserved (ui-loader hardcodes null)");
  assert.match(leg.game, /Dodgers @ Philadelphia/, "matchup preserved (ui-loader drops it)");
  assert.equal(leg.player, "Justin Wrobleski");
  fs.rmSync(root, { recursive: true, force: true });
});

test("NEVER surfaces priorLane (stopped) history as an active review card", () => {
  const root = fixtureRoot({
    // Active step has NO legs (awaiting) — the only legs live in priorLane. The reader must return null,
    // never reaching into priorLane to fabricate an active card.
    laneB: {
      steps: [{ step: 1, status: "active", reviewMode: true, legs: [] }],
      priorLane: { steps: [{ step: 2, status: "settled", legs: [PRIOR_LEG] }] },
    },
  });
  const card = readLaneReviewCard(root, "laneB");
  assert.equal(card, null, "awaiting lane → null; priorLane goalscorer never surfaced");
  fs.rmSync(root, { recursive: true, force: true });
});

test("a NON-review active step is not treated as a review card", () => {
  const root = fixtureRoot({
    laneA: { steps: [{ step: 1, status: "active", reviewMode: false, legs: [{ ...REVIEW_LEG, reviewMode: false }] }] },
  });
  assert.equal(readLaneReviewCard(root, "laneA"), null, "reviewMode:false → not a review card");
  fs.rmSync(root, { recursive: true, force: true });
});

test("fail-closed: missing artifact / missing lane → null (never throws)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-review-card-empty-"));
  assert.equal(readLaneReviewCard(root, "laneA"), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("live artifact contract: any active review card is well-formed + carries no goalscorer (priorLane) market", () => {
  const realRoot = path.join(process.cwd(), "public", "data");
  for (const laneKey of ["laneA", "laneB"]) {
    const card = readLaneReviewCard(realRoot, laneKey);
    if (!card) continue; // awaiting lane — legitimately null
    assert.ok(Array.isArray(card.legs) && card.legs.length > 0, `${laneKey} review card has legs`);
    for (const leg of card.legs) {
      assert.ok(String(leg.selection ?? "").length > 0, "leg has a selection");
      assert.ok(Number.isFinite(leg.odds), "leg has real odds");
      if (leg.modelProb != null) assert.ok(leg.modelProb >= 0 && leg.modelProb <= 1, "model prob in [0,1]");
      if (leg.marketProb != null) assert.ok(leg.marketProb >= 0 && leg.marketProb <= 1, "market prob in [0,1]");
      // Review cards are settlement-supported markets only — never a WC goalscorer (that would be priorLane leakage).
      assert.ok(!/goal ?scorer|goal_scorer/i.test(`${leg.market} ${leg.selection}`), "no goalscorer market in an active review card");
    }
  }
});
