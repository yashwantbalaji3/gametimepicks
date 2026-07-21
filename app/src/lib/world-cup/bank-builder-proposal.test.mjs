/**
 * Fresh daily Bank Builder proposal — a safe, display-only restart built from REAL team markets. Synthetic
 * board fixtures (never written anywhere) exercise the survival/value selection + safety rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBankBuilderProposalFromGames } from "./bank-builder-proposal.ts";

const ml = (pick, side, h, d, a, odds) => ({ pick, side, americanOdds: odds, modelProbability: side === "home" ? h : a, home: h, draw: d, away: a });
const game = (home, away, picks) => ({
  eventId: home, home, away, kickoffUtc: "2026-07-01T18:00:00Z", kickoffEt: "x", matchDate: "2026-07-01",
  homeCode: null, awayCode: null, gameSlug: `${home}-vs-${away}-2026-07-01`, status: "live_odds", confidence: "Solid", note: null,
  picks: { bookmaker: "x", ...picks },
});

const eng = game("England", "DR Congo", {
  moneyline: ml("England", "home", 0.76, 0.16, 0.08, -400),
  drawNoBet: { pick: "England (DNB)", americanOdds: -2500, modelProbability: 0.89 },
  doubleChance: { pick: "England or Draw", americanOdds: -10000, modelProbability: 0.93 },
  total: { pick: "Over 2.5", line: 2.5, americanOdds: -130, modelProbability: 0.53 },
  btts: { pick: "BTTS No", americanOdds: -205, modelProbability: 0.62 },
});
const bel = game("Belgium", "Senegal", {
  moneyline: ml("Belgium", "home", 0.44, 0.30, 0.26, 116),
  drawNoBet: { pick: "Belgium (DNB)", americanOdds: -215, modelProbability: 0.63 },
  doubleChance: { pick: "Belgium or Draw", americanOdds: -385, modelProbability: 0.74 },
  total: { pick: "Under 2.5", line: 2.5, americanOdds: -152, modelProbability: 0.57 },
  btts: { pick: "BTTS Yes", americanOdds: -121, modelProbability: 0.51 },
});
const usa = game("USA", "Bosnia", {
  moneyline: ml("USA", "home", 0.71, 0.19, 0.11, -290),
  doubleChance: { pick: "USA or Draw", americanOdds: -1500, modelProbability: 0.89 },
  btts: { pick: "BTTS No", americanOdds: -152, modelProbability: 0.57 },
});

test("builds a survival lane (A) + value lane (B), 2 team-market legs each, from different games", () => {
  const p = buildBankBuilderProposalFromGames([eng, bel, usa], "2026-07-01");
  assert.equal(p.available, true);
  const a = p.lanes.find((l) => l.kind === "survival");
  const b = p.lanes.find((l) => l.kind === "value");
  assert.ok(a && b, "both lanes present");
  assert.equal(a.legs.length, 2);
  assert.equal(b.legs.length, 2);
  // Each lane's two legs come from DISTINCT games.
  assert.notEqual(a.legs[0].gameSlug, a.legs[1].gameSlug);
  assert.notEqual(b.legs[0].gameSlug, b.legs[1].gameSlug);
});

// ── MARKET-RELIABILITY WEIGHTING (July-4 model review) — the survival lane must not walk into the
// knockout totals/BTTS traps that killed Lane A on July-3 (Over 2.5 died on a 1-1 90' draw). From the
// CANONICAL settled ledger: DC 8-0, DNB strong, totals 63% with every recent knockout loss a draw-trap,
// BTTS 1-3 (25%). Survival penalizes totals in draw-risky games (90' draw ≥ 26%) and always demotes BTTS.
test("survival lane demotes TOTALS in a draw-risky game (the July-3 Over-2.5 trap) — prefers DNB", () => {
  // DC is juiced out (-10000); the total has the HIGHER raw model prob (0.66 vs DNB 0.60) so the OLD
  // selector would take Over 2.5. Draw = 30% ⇒ draw-risky ⇒ totals penalized ⇒ DNB must win the slot.
  const trap = game("Argentina", "CapeVerde", {
    moneyline: ml("Argentina", "home", 0.55, 0.30, 0.15, -175),
    drawNoBet: { pick: "Argentina (DNB)", americanOdds: -215, modelProbability: 0.60 },
    doubleChance: { pick: "Argentina or Draw", americanOdds: -10000, modelProbability: 0.85 },
    total: { pick: "Over 2.5", line: 2.5, americanOdds: -130, modelProbability: 0.66 },
    btts: { pick: "BTTS Yes", americanOdds: -121, modelProbability: 0.56 },
  });
  const p = buildBankBuilderProposalFromGames([trap, usa], "2026-07-05");
  const a = p.lanes.find((l) => l.kind === "survival");
  const trapLeg = a.legs.find((l) => l.gameSlug.startsWith("Argentina"));
  assert.ok(trapLeg, "the draw-risky game still contributes a survival leg");
  assert.equal(trapLeg.market, "draw_no_bet", `draw-risky game must prefer DNB over the higher-prob total, got ${trapLeg.market}`);
});

test("survival lane keeps TOTALS in a low-draw-risk game (no over-nerfing) and always demotes BTTS", () => {
  // Draw = 16% ⇒ NOT draw-risky ⇒ the higher-prob total legitimately wins the slot over DNB.
  const open = game("Brazil", "Norway", {
    moneyline: ml("Brazil", "home", 0.58, 0.16, 0.26, -140),
    drawNoBet: { pick: "Brazil (DNB)", americanOdds: -300, modelProbability: 0.60 },
    total: { pick: "Over 2.5", line: 2.5, americanOdds: -130, modelProbability: 0.66 },
    btts: { pick: "BTTS Yes", americanOdds: -110, modelProbability: 0.70 }, // highest prob — must STILL lose to the total (0.25 penalty)
  });
  const p = buildBankBuilderProposalFromGames([open, bel], "2026-07-05");
  const a = p.lanes.find((l) => l.kind === "survival");
  const legB = a.legs.find((l) => l.gameSlug.startsWith("Brazil"));
  assert.ok(legB, "low-risk game contributes a leg");
  assert.equal(legB.market, "match_total_goals", `low-draw-risk game keeps the total, got ${legB.market}`);
  assert.ok(a.legs.every((l) => l.market !== "btts"), "BTTS (1-3 settled) never leads a survival slot");
});

test("survival lane excludes ultra-juiced legs (<= -600) — no -10000 double chance", () => {
  const p = buildBankBuilderProposalFromGames([eng, bel, usa], "2026-07-01");
  const a = p.lanes.find((l) => l.kind === "survival");
  assert.ok(a.legs.every((l) => l.americanOdds >= -600), `survival legs must be payable, got ${a.legs.map((l) => l.americanOdds)}`);
  assert.ok(a.legs.every((l) => l.modelProbability >= 0.55), "survival legs are high-probability");
});

test("value lane legs stay inside a payable band (-200..+300)", () => {
  const p = buildBankBuilderProposalFromGames([eng, bel, usa], "2026-07-01");
  const b = p.lanes.find((l) => l.kind === "value");
  assert.ok(b.legs.every((l) => l.americanOdds >= -200 && l.americanOdds <= 300), `value legs must be payable, got ${b.legs.map((l) => l.americanOdds)}`);
});

test("team markets ONLY — no player props, real combined price + $100 paper seed", () => {
  const p = buildBankBuilderProposalFromGames([eng, bel, usa], "2026-07-01");
  for (const l of p.lanes) {
    assert.ok(l.legs.every((leg) => ["moneyline_90", "draw_no_bet", "double_chance", "match_total_goals", "btts"].includes(leg.market)));
    assert.equal(l.stake, 100);
    assert.ok(l.potentialReturn > l.stake, "a winning lane returns more than the seed");
  }
});

test("thin slate (1 game) → not buildable, honest note, never forced", () => {
  const p = buildBankBuilderProposalFromGames([eng], "2026-07-01");
  assert.equal(p.available, false);
  assert.match(p.note, /holding|not enough|not buildable/i);
});

// ── The operator-APPROVED July-5 dual lanes are PINNED — future generation must never silently swap them. ──
import { loadApprovedBankBuilder } from "./bank-builder-proposal.ts";
import path from "node:path";
import fs from "node:fs";
import { makeSettledApprovedRoot } from "../__testsupport__/settled-ladder-root.mjs";
test("approved July-7 Bank Builder is pinned to the exact operator-approved legs — Lane A only, Lane B no-play (no drift)", () => {
  // July-7 Lane A Step-2 is SETTLED WON, so the approved snapshot overlays the OFFICIAL result (legs hit / lane
  // won) regardless of the passed clock. The leg PINS must not drift. Validated against a reconstructed settled
  // root — the July-21 review restart moved that settled cycle into priorLane; the leg pins live in approved.json.
  const { tmp, dataRoot } = makeSettledApprovedRoot(path.join(process.cwd(), "public", "data"));
  let ap;
  try {
    ap = loadApprovedBankBuilder(dataRoot, "2026-07-07", Date.UTC(2026, 6, 8, 3, 0));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.ok(ap && ap.approved === true, "the approved snapshot loads and is flagged approved");
  // July-7 is a Lane-A-only card: Lane B is a deliberate no-play, absent from the approved lanes.
  assert.equal(ap.lanes.length, 1, "only Lane A is approved for July-7 (Lane B no-play)");
  const a = ap.lanes[0];
  assert.equal(a.lane, "A", "the approved lane is Lane A");
  // Lane A · Survival (cycle-8 Step 2) = the USER-APPROVED pair Colombia or Draw DC -345 + Argentina to win ML -278.
  assert.equal(a.legs[0].market, "double_chance"); assert.equal(a.legs[0].americanOdds, -345); assert.match(a.legs[0].selection, /Colombia or Draw/);
  assert.equal(a.legs[1].market, "moneyline_90"); assert.equal(a.legs[1].americanOdds, -278); assert.match(a.legs[1].selection, /Argentina to win/); assert.match(a.legs[1].matchup, /Argentina/);
  assert.equal(a.legs.length, 2, "Lane A is the approved 2-leg card");
  // Lane A is a cycle-8 Step-2 card ($100 seed; the WON Step-1 payout rolled forward).
  assert.equal(a.step, 2);
  // Team-market only — every leg has no player prop.
  assert.ok(ap.lanes.every((ln) => ln.legs.every((l) => l.player == null)));
  // SETTLED overlay: the ladder marks Lane A Step-2 WON → laneStatus "won", both legs "hit". This is read
  // from the official settled ladder (NOT fabricated from scores) — a genuinely unsettled step falls back to
  // the kickoff-derived lifecycle (see the unsettled-fixture test below).
  assert.equal(a.laneStatus, "won", "settled Step-2 renders WON from the ladder, not a stale awaiting-settlement");
  assert.ok(a.legs.every((l) => l.legStatus === "hit"), "both officially-settled legs read hit");
});
