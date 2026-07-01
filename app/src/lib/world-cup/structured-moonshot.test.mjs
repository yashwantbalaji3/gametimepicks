/**
 * Structured Moonshot — per-game result + total(/BTTS) pairs from REAL team markets, grouped by game,
 * game-script-aligned. Synthetic board fixtures (never written anywhere) exercise the structure + rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredMoonshotFromGames } from "./structured-moonshot.ts";

const ml = (pick, side, h, d, a, odds = -200) => ({ pick, side, americanOdds: odds, modelProbability: side === "home" ? h : a, home: h, draw: d, away: a });
const game = (home, away, picks) => ({
  eventId: home, home, away, kickoffUtc: "2026-07-01T18:00:00Z", kickoffEt: "x", matchDate: "2026-07-01",
  homeCode: null, awayCode: null, gameSlug: `${home}-vs-${away}-2026-07-01`, status: "live_odds", confidence: "Solid", note: null,
  picks: { bookmaker: "x", ...picks },
});

const strongFav = game("England", "DR Congo", {
  moneyline: ml("England", "home", 0.76, 0.16, 0.08, -400),
  total: { pick: "Over 2.5", line: 2.5, americanOdds: -130, modelProbability: 0.53 },
  btts: { pick: "BTTS No", americanOdds: -205, modelProbability: 0.62 },
});
const drawLeaner = game("Belgium", "Senegal", {
  moneyline: ml("Belgium", "home", 0.44, 0.30, 0.26, 116),
  total: { pick: "Under 2.5", line: 2.5, americanOdds: -152, modelProbability: 0.57 },
  btts: { pick: "BTTS Yes", americanOdds: -121, modelProbability: 0.51 },
  drawNoBet: { pick: "Belgium (DNB)", americanOdds: -215, modelProbability: 0.63 },
});
const noTotals = game("USA", "Bosnia", {
  moneyline: ml("USA", "home", 0.71, 0.19, 0.11, -290),
  btts: { pick: "BTTS No", americanOdds: -152, modelProbability: 0.57 },
});

test("structured ticket = result + total leg per game, grouped by game, team markets only", () => {
  const m = buildStructuredMoonshotFromGames([strongFav, drawLeaner, noTotals], "2026-07-01");
  const s = m.tickets.find((t) => t.tier === "structured");
  assert.equal(s.available, true);
  assert.equal(s.pairs.length, 3, "one pair per game");
  assert.equal(s.legCount, 6, "two legs per game");
  // No player-prop legs anywhere.
  assert.ok(s.pairs.every((p) => p.legs.every((l) => ["result", "total", "btts"].includes(l.kind))));
  // Each pair has a result leg first.
  assert.ok(s.pairs.every((p) => p.legs[0].kind === "result"));
});

test("draw-leaning game uses draw-protected result (DNB), not a raw moneyline-win leg", () => {
  const m = buildStructuredMoonshotFromGames([drawLeaner], "2026-07-01");
  const pair = m.tickets[0].pairs[0];
  assert.equal(pair.legs[0].market, "draw_no_bet", "draw-leaner should use DNB, not straight ML");
});

test("no totals market → BTTS fallback (coherent), never a fabricated total line", () => {
  const m = buildStructuredMoonshotFromGames([noTotals], "2026-07-01");
  const pair = m.tickets.find((t) => t.tier === "structured").pairs[0];
  const second = pair.legs[1];
  assert.equal(second.market, "btts");
  assert.equal(pair.legs.some((l) => l.market === "match_total_goals"), false, "no invented total");
});

test("combined odds are computed from real leg prices (clears the moonshot longshot floor)", () => {
  const m = buildStructuredMoonshotFromGames([strongFav, drawLeaner, noTotals], "2026-07-01");
  const s = m.tickets.find((t) => t.tier === "structured");
  assert.ok(s.combinedOdds >= 700, `structured 6-leg team ticket should be a longshot, got +${s.combinedOdds}`);
  assert.ok(s.payout > 0);
  assert.match(s.correlationNote, /MODEL ESTIMATE/);
});

test("aggressive tier adds a distinct BTTS leg on top of the structured pairs", () => {
  const m = buildStructuredMoonshotFromGames([strongFav, drawLeaner, noTotals], "2026-07-01");
  const s = m.tickets.find((t) => t.tier === "structured");
  const a = m.tickets.find((t) => t.tier === "aggressive");
  assert.ok(a.legCount > s.legCount, "aggressive has more legs");
  assert.ok(a.combinedOdds > s.combinedOdds, "aggressive is a longer price");
});

test("empty slate → tickets marked unavailable, never padded/fabricated", () => {
  const m = buildStructuredMoonshotFromGames([], "2026-07-01");
  assert.ok(m.tickets.every((t) => !t.available));
  assert.ok(m.tickets.every((t) => t.reason));
});
