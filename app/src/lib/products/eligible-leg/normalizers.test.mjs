/**
 * Normalizer probes — synthetic artifacts, never the live ones (a live artifact is not a fixture).
 * Each sport's normalizer must (1) carry the owner's side verbatim, (2) leave a missing thing null,
 * (3) name its receipt, and (4) produce candidates the contract refuses for the right reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mlbCandidates } from "./normalize-mlb.mjs";
import { nflCandidates } from "./normalize-nfl.mjs";
import { ufcCandidates } from "./normalize-ufc.mjs";
import { eplCandidates } from "./normalize-epl.mjs";
import { evaluateLeg, REASON } from "./contract.mjs";

const AS_OF = "2026-09-20T10:04:00Z";

const teamMarkets = {
  generatedAt: "2026-09-20T09:57:29.368Z", bookmaker: "draftkings", games: {
    a: { gameId: "a", homeTeam: "New York Mets", awayTeam: "Philadelphia Phillies", commenceTime: "2026-09-20T17:11:00Z", bookmaker: "draftkings", capturedAt: "2026-09-20T09:57:29.368Z",
      moneyline: { home: { odds: 141, noVigProb: 0.3967 }, away: { odds: -171, noVigProb: 0.6033 } },
      runLine: { line: 1.5, home: { line: 1.5, odds: -122, coverNoVigProb: 0.5248 }, away: { line: -1.5, odds: 101, coverNoVigProb: 0.4752 } },
      total: { line: 8, over: { odds: -107, noVigProb: 0.4935 }, under: { odds: -113, noVigProb: 0.5065 } } },
    b: { gameId: "b", homeTeam: "Unknown Club", awayTeam: "Nobody", commenceTime: "2026-09-20T20:00:00Z", capturedAt: "2026-09-20T09:57:29.368Z", moneyline: { home: { odds: -120, noVigProb: 0.52 }, away: { odds: 100, noVigProb: 0.48 } }, runLine: null, total: { line: null } },
  },
};
const schedule = { games: [{ gamePk: 823570, gameDate: "2026-09-20T17:10:00Z", home: { id: 121, name: "New York Mets" }, away: { id: 143, name: "Philadelphia Phillies" } }] };

test("MLB: six legs per priced game, gamePk from the schedule bridge, sides verbatim, market-priced class", () => {
  const { candidates, rawForecastCount } = mlbCandidates({ teamMarkets, schedule, date: "2026-09-20" });
  assert.equal(rawForecastCount, 2);
  const mets = candidates.filter((c) => c.eventId === "823570");
  assert.equal(mets.length, 6);
  const ml = mets.find((c) => c.marketKey === "mlb_moneyline" && c.side === "away");
  assert.equal(ml.oddsForSide.american, -171); assert.equal(ml.marketImpliedProbability, 0.6033);
  assert.equal(ml.probability, null); assert.equal(ml.forecastClass, "MARKET_IMPLIED_NO_FORECAST");
  assert.deepEqual(ml.entityIds, ["mlb-team-143", "mlb-team-121"]);
  const rl = mets.find((c) => c.marketKey === "mlb_run_line" && c.side === "away"); assert.equal(rl.line, -1.5);
  const ev = evaluateLeg(ml, { asOf: AS_OF });
  assert.equal(ev.productEligible, true); assert.deepEqual(ev.eligibilityReasonCodes, [REASON.MARKET_PRICED_NO_FORECAST]);
  // the unbridged game has no gamePk and no total line: identity refused, no total legs
  const unb = candidates.filter((c) => c.displayMatchup === "Nobody @ Unknown Club");
  assert.equal(unb.length, 2); assert.equal(unb[0].eventId, null);
  assert.ok(evaluateLeg(unb[0], { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.MISSING_IDENTITY));
});

test("MLB: a price captured after the as-of instant is refused (the intra-day rewrite defect)", () => {
  const tm = JSON.parse(JSON.stringify(teamMarkets)); tm.games.a.capturedAt = "2026-09-20T12:30:00Z";
  const { candidates } = mlbCandidates({ teamMarkets: tm, schedule, date: "2026-09-20" });
  const ev = evaluateLeg(candidates.find((c) => c.eventId === "823570"), { asOf: AS_OF });
  assert.equal(ev.productEligible, false); assert.ok(ev.eligibilityReasonCodes.includes(REASON.PRICE_CAPTURED_AFTER_AS_OF));
});

test("NFL: experimental class carries no probability into the contract and is refused by the registry; book preference honoured", () => {
  const forecasts = { generatedAt: "2026-09-19T22:41:00Z", forecasts: [{ canonicalEventId: "nfl-1", matchup: "NYG @ LAR", home: { abbr: "LAR", name: "Los Angeles Rams" }, away: { abbr: "NYG", name: "New York Giants" }, kickoffUtc: "2026-09-22T00:15Z", state: "PUBLIC_EXPERIMENTAL", model: { id: "nfl-regular-season-public-v1", version: 2 }, forecastSummary: { winProbability: { home: 0.696, away: 0.2785 } } }] };
  const markets = { capturedAt: "2026-09-19T23:50:00Z", rows: [{ canonicalEventId: "nfl-1", books: [{ book: "betmgm", moneyline: { home: -300, away: 250 }, noVigWinProb: { home: 0.72, away: 0.28 }, spread: { line: -6.5, prices: { home: -112, away: -105 } }, total: { line: 41, prices: { over: -110, under: -120 } } }, { book: "draftkings", moneyline: { home: -280, away: 230 }, noVigWinProb: { home: 0.71, away: 0.29 }, spread: { line: -6.5, prices: { home: -110, away: -110 } }, total: { line: 41.5, prices: { over: -110, under: -110 } } }] }] };
  const { candidates } = nflCandidates({ forecasts, markets });
  assert.equal(candidates.length, 6);
  const home = candidates.find((c) => c.marketKey === "nfl_moneyline" && c.side === "home");
  assert.equal(home.oddsForSide.bookmaker, "draftkings"); assert.equal(home.oddsForSide.american, -280);
  assert.equal(home.probability, 0.696, "the normalizer passes the owner's number; the contract decides whether to carry it");
  const ev = evaluateLeg(home, { asOf: "2026-09-21T10:57:00Z" });
  assert.equal(ev.productEligible, false); assert.equal(ev.probability, null);
  assert.ok(ev.eligibilityReasonCodes.includes(REASON.SPORT_NOT_ELIGIBLE)); assert.ok(ev.eligibilityReasonCodes.includes(REASON.FORECAST_EXPERIMENTAL));
  const awaySpread = candidates.find((c) => c.marketKey === "nfl_spread" && c.side === "away"); assert.equal(awaySpread.line, 6.5);
  // no market row → no price, never a fabricated one
  const { candidates: unpriced } = nflCandidates({ forecasts, markets: { rows: [] } });
  assert.equal(unpriced.length, 2); assert.equal(unpriced[0].oddsForSide, null);
});

test("UFC: built from odds only, refused as SCAFFOLD_ONLY, no per-bout start → identity refused", () => {
  const odds = { generatedAt: "2026-09-17T15:22:34Z", event: { slateDate: "2026-09-19" }, bouts: [{ boutId: "401903509", sides: [{ name: "A", american: 113, books: 7 }, { name: "B", american: -135, books: 7 }] }] };
  const { candidates, publicForecastCount } = ufcCandidates({ odds });
  assert.equal(publicForecastCount, 0); assert.equal(candidates.length, 2);
  assert.equal(candidates[0].side, "A"); assert.equal(candidates[0].eventStartUtc, null); assert.equal(candidates[0].forecastClass, "MARKET_IMPLIED_NO_FORECAST");
  const ev = evaluateLeg(candidates[0], { asOf: "2026-09-19T10:00:00Z" });
  assert.ok(ev.eligibilityReasonCodes.includes(REASON.SPORT_NOT_ELIGIBLE)); assert.ok(ev.eligibilityReasonCodes.includes(REASON.MISSING_IDENTITY));
});

test("EPL: 1X2 + totals joined by eventId; experimental class; a fixture without odds has null prices", () => {
  const forecasts = { public: true, generatedAt: "2026-09-21T06:00:00Z", validation: "VALIDATED_OUT_OF_SAMPLE_HISTORY", rows: [{ eventId: "soccer:epl:arsenal-v-leeds:20261003t1400", matchup: "Arsenal v Leeds United", homeClub: "Arsenal", awayClub: "Leeds United", kickoffUtc: "2026-10-03T14:00:00Z", modelId: "p304-elo-poisson", probs: { home: 0.7368, draw: 0.174, away: 0.0892 }, totals: { ladder: [{ line: 2.5, over: 0.53, under: 0.47 }] } }, { eventId: "soccer:epl:x-v-y:20261003t1400", homeClub: "X", awayClub: "Y", kickoffUtc: "2026-10-03T14:00:00Z", probs: { home: 0.4, draw: 0.3, away: 0.3 }, totals: { ladder: [] } }] };
  const odds = { capturedAt: "2026-09-21T05:00:00Z", rows: [{ eventId: "soccer:epl:arsenal-v-leeds:20261003t1400", matchResult: [{ outcome: "Arsenal", american: -300, noVig: 0.72, books: 5 }, { outcome: "Draw", american: 400, noVig: 0.17, books: 5 }, { outcome: "Leeds United", american: 750, noVig: 0.11, books: 5 }], totalGoals: [{ line: 2.5, outcomes: [{ outcome: "Over", american: -120, noVig: 0.53 }, { outcome: "Under", american: 100, noVig: 0.47 }] }] }] };
  const { candidates } = eplCandidates({ forecasts, odds, date: "2026-09-21" });
  const ars = candidates.filter((c) => c.eventId.includes("arsenal")); assert.equal(ars.length, 5);
  const home = ars.find((c) => c.side === "home"); assert.equal(home.oddsForSide.american, -300); assert.equal(home.probability, 0.7368); assert.equal(home.forecastClass, "EXPERIMENTAL_MODEL");
  const over = ars.find((c) => c.marketKey === "epl_total_goals" && c.side === "over"); assert.equal(over.line, 2.5); assert.equal(over.probability, 0.53);
  const xy = candidates.filter((c) => c.eventId.includes("x-v-y")); assert.equal(xy.length, 3); assert.equal(xy[0].oddsForSide, null);
  const ev = evaluateLeg(home, { asOf: "2026-10-03T08:00:00Z" });
  assert.equal(ev.productEligible, false); assert.equal(ev.probability, null); assert.ok(ev.eligibilityReasonCodes.includes(REASON.SPORT_NOT_ELIGIBLE));
});
