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

// ── The operator-APPROVED July-1 lanes are PINNED — future generation must never silently swap them. ──
import { loadApprovedBankBuilder } from "./bank-builder-proposal.ts";
import path from "node:path";
test("approved July-1 Bank Builder is pinned to the exact operator-approved legs (no drift)", () => {
  const ap = loadApprovedBankBuilder(path.join(process.cwd(), "public", "data"), "2026-07-01", Date.UTC(2026, 6, 1, 18, 30));
  assert.ok(ap && ap.approved === true, "the approved snapshot loads and is flagged approved");
  const [a, b] = ap.lanes;
  // Lane A · Survival = England ML -400 + Belgium DC -385
  assert.equal(a.legs[0].market, "moneyline_90"); assert.equal(a.legs[0].americanOdds, -400); assert.match(a.legs[0].matchup, /England/);
  assert.equal(a.legs[1].market, "double_chance"); assert.equal(a.legs[1].americanOdds, -385); assert.match(a.legs[1].matchup, /Belgium/);
  // Lane B · Value = USA BTTS No -152 + Belgium Under 2.5 -152
  assert.equal(b.legs[0].market, "btts"); assert.equal(b.legs[0].americanOdds, -152); assert.match(b.legs[0].matchup, /USA/);
  assert.equal(b.legs[1].market, "match_total_goals"); assert.equal(b.legs[1].americanOdds, -152); assert.match(b.legs[1].matchup, /Belgium/);
  // Honest live status at 2026-07-01 18:30 UTC: England (16:00) done → awaiting settlement; the rest pregame.
  assert.equal(a.legs[0].legStatus, "awaiting_settlement", "England leg is not shown as a fresh pregame pick");
  assert.equal(a.legs[1].legStatus, "pregame");
  assert.equal(b.legs.every((l) => l.legStatus === "pregame"), true);
  // Never a fabricated hit/miss without official data.
  assert.ok(ap.lanes.every((ln) => ln.legs.every((l) => l.legStatus !== "hit" && l.legStatus !== "missed")));
});
