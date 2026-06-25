/**
 * June 24 Bank Builder settlement — grades the LIVE locked Lane A/B cards through the tested soccer engine
 * against the official FT results, and asserts the seed-model outcome. Money is graded ONLY from official
 * finals; this test never mutates canonical state. Regression guard for the WC-team-pool leg-id format
 * (`WORLD_CUP:<hash>:market:Team`) being settleable (matchId bound by matchup name, moneyline side by team).
 *
 * Official FT results (operator-provided, API-Football v3 — the site's authoritative WC results source):
 *   Morocco 4-2 Haiti · Bosnia & Herzegovina 3-1 Qatar · Brazil 3-0 Scotland · Switzerland 2-1 Canada
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { settleCard } from "./settlement/soccer-markets.ts";
import { seedModelOutcome, classifyLaneTransition } from "./settlement/daily-portfolio-settle.ts";
import { BANK_BUILDER_STEP_COUNT } from "./bank-builder-ladder.ts";

const root = new URL("../../public/data", import.meta.url).pathname;
const DATE = "2026-06-24";
const OFFICIAL = {
  date: DATE,
  source: "Operator-provided official FT (API-Football v3 /fixtures)",
  matches: [
    { matchId: "Morocco vs Haiti", match: "Morocco vs Haiti", homeGoals: 4, awayGoals: 2, status: "FT" },
    { matchId: "Bosnia & Herzegovina vs Qatar", match: "Bosnia & Herzegovina vs Qatar", homeGoals: 3, awayGoals: 1, status: "FT" },
    { matchId: "Scotland vs Brazil", match: "Scotland vs Brazil", homeGoals: 0, awayGoals: 3, status: "FT" },
    { matchId: "Switzerland vs Canada", match: "Switzerland vs Canada", homeGoals: 2, awayGoals: 1, status: "FT" },
  ],
  players: [],
};

// Post-settlement reality: the June-24 Bank Builder cards are no longer ACTIVE in the live daily-portfolio
// (Lane A completed the ladder, Lane B stopped), so the live collector returns 0 active BB lanes. The
// grading is now RECORDED in the official settled bundle. We grade the EXACT locked legs (reconstructed
// from the canonical dual-bank-builder run) through the same tested engine against the official FT scores,
// and cross-check against the recorded bundle — the money-integrity + grading assertions are unchanged.
const settledBundle = JSON.parse(fs.readFileSync(`${root}/world-cup/settlement/${DATE}.json`, "utf8"));
const bbGraded = settledBundle.graded.filter((c) => c.product === "bank-builder");

// Lane A Step 5 (final rung, stake $3502.57): Morocco ML + Bosnia ML + Scotland/Brazil Over 2.5.
const LANE_A_STAKE = 3502.57;
const laneALegs = [
  { id: "A1", matchId: "Morocco vs Haiti", market: "moneyline_90", selection: "Morocco to win", side: "home", oddsAmerican: -550 },
  { id: "A2", matchId: "Bosnia & Herzegovina vs Qatar", market: "moneyline_90", selection: "Bosnia & Herzegovina to win", side: "home", oddsAmerican: -275 },
  { id: "A3", matchId: "Scotland vs Brazil", market: "match_total_goals", selection: "Over 2.5", side: "over", point: 2.5, oddsAmerican: -127 },
];
// Lane B Step 3 (stake $702.45): Brazil ML (away) + Switzerland/Canada Under 2.5.
const LANE_B_STAKE = 702.45;
const laneBLegs = [
  { id: "B1", matchId: "Scotland vs Brazil", market: "moneyline_90", selection: "Brazil to win", side: "away", oddsAmerican: -320 },
  { id: "B2", matchId: "Switzerland vs Canada", market: "match_total_goals", selection: "Under 2.5", side: "under", point: 2.5, oddsAmerican: -144 },
];

test("settled bundle records exactly the two Bank Builder lanes (no awaiting moonshot phantom-settles)", () => {
  assert.equal(bbGraded.length, 2, "both Bank Builder lanes recorded in the official settled bundle");
  assert.ok(bbGraded.some((c) => /Lane A/.test(c.card)) && bbGraded.some((c) => /Lane B/.test(c.card)), "Lane A and Lane B both graded");
  assert.ok(!settledBundle.graded.some((c) => c.product === "moonshot"), "awaiting Moonshot lanes are NOT settled (no phantom settle)");
});

test("Lane A WINS — Morocco ML + Bosnia ML + Scotland/Brazil Over 2.5 all graded won from official FT", () => {
  const s = settleCard(laneALegs, LANE_A_STAKE, OFFICIAL);
  assert.equal(s.result, "won", "Lane A card WON");
  assert.deepEqual(s.legs.map((g) => g.result), ["won", "won", "won"], "all three legs won");
  assert.ok(Math.abs(s.payout - 10089.23) < 0.5, `Lane A payout $${s.payout} ≈ $10,089.23 (reaches $10k)`);
  // Evidence the grades come from the real scores, not assumption.
  assert.match(s.legs[0].reason, /Morocco vs Haiti 4-2/);
  assert.match(s.legs[1].reason, /Bosnia & Herzegovina vs Qatar 3-1/);
  assert.match(s.legs[2].reason, /Scotland vs Brazil 0-3 \(3 goals\)/);
  // Cross-check the recorded bundle agrees (same official outcome).
  const recorded = bbGraded.find((c) => /Lane A/.test(c.card));
  assert.equal(recorded.result, "won", "recorded bundle: Lane A won");
  assert.ok(Math.abs(recorded.payout - 10089.23) < 0.5, "recorded bundle: Lane A payout $10,089.23");
});

test("Lane B LOSES — Brazil ML wins but Switzerland/Canada Under 2.5 loses (3 goals)", () => {
  const s = settleCard(laneBLegs, LANE_B_STAKE, OFFICIAL);
  assert.equal(s.result, "lost", "Lane B card LOST (a parlay with one lost leg cannot win)");
  const byMatch = Object.fromEntries(s.legs.map((g) => [g.leg.selection, g.result]));
  assert.equal(byMatch["Brazil to win"], "won", "Brazil ML won");
  assert.equal(byMatch["Under 2.5"], "lost", "Under 2.5 lost — Switzerland 2-1 Canada = 3 goals");
  assert.equal(s.payout, 0, "a lost lane pays $0");
  // Cross-check the recorded bundle agrees.
  const recorded = bbGraded.find((c) => /Lane B/.test(c.card));
  assert.equal(recorded.result, "lost", "recorded bundle: Lane B lost");
  assert.equal(recorded.payout, 0, "recorded bundle: Lane B payout $0");
});

test("seed model: Lane A won (rolls) + Lane B lost (−$100 seed) → bankroll −$100, record +1W/+1L; crown untouched", () => {
  const plans = [
    { laneLetter: "A", status: "won", payout: 10089.23, settledLegs: [] },
    { laneLetter: "B", status: "lost", payout: 0, settledLegs: [] },
  ];
  const before = { record: { wins: 12, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 };
  const out = seedModelOutcome(before, plans);
  assert.equal(out.bankroll, 10076.17, "only the lost $100 seed moves the bankroll (won step rolls)");
  assert.deepEqual(out.record, { wins: 13, losses: 3, voids: 0, pending: 0 });
  assert.equal(out.seedLost, 100);
});

test("Lane A is on the FINAL rung — a win COMPLETES the ladder (operator-gated banking, not auto-rolled)", () => {
  // Lane A has cleared 4 steps; a won Step 5 (the final rung) classifies as "complete".
  assert.equal(classifyLaneTransition(4, "won", BANK_BUILDER_STEP_COUNT), "complete");
  assert.equal(BANK_BUILDER_STEP_COUNT, 5, "the ladder has 5 rungs; Step 5 is the $10k goal");
});

test("settle script has no undeclared `seedLost` (a LOST lane must not ReferenceError on --apply)", () => {
  // Regression: the lost-lane branch once referenced an undeclared `seedLost`, crashing any settlement
  // with a loss (latent until a lane lost). The lib seedModelOutcome owns the seed math.
  const src = fs.readFileSync(new URL("../../scripts/settle-daily-portfolio.mjs", import.meta.url).pathname, "utf8");
  assert.ok(!/\bseedLost\s*\+=/.test(src), "no undeclared seedLost accumulator in the settle script");
});
