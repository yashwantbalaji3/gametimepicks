/**
 * SYNTHETIC TEST FIXTURE — every value here is FAKE (players, teams, book, lines, prices, times; the slate is in 2099).
 * Tests and the offline evidence renderer only. Nothing under src/ that ships may import this file
 * (prop-line-client-graph.test.mjs walks every page / client graph for it), and it is never under public/ or data/.
 */
export const FIXTURE_SLATE = "2099-01-15";
export const FIXTURE_EVENT = "FIXTURE-EVT-1";
export const FIXTURE_TIP = "2099-01-16T00:30:00.000Z"; // 7:30 PM ET on the fixture slate
export const FIXTURE_AS_OF = "2099-01-15T22:30:00.000Z"; // two hours before tip
export const FIXTURE_BOOK = "fixturebook";
const hBefore = (h) => new Date(Date.parse(FIXTURE_TIP) - h * 3600_000).toISOString();

const player = (id, name, medians, comboMedians = {}) => ({ providerAthleteId: id, name, medians, comboMedians });
export const FIXTURE_LANE = Object.freeze({
  date: FIXTURE_SLATE,
  games: [{
    providerEventId: FIXTURE_EVENT, tipUtc: FIXTURE_TIP,
    away: { abbr: "AWY", name: "Fixture Away" }, home: { abbr: "HME", name: "Fixture Home" },
    players: {
      away: [
        player("FX-1", "Fixture Player One", { pts: 36.0, reb: 4.1, ast: 3.0, threePm: 2.2 }, { pra: 43.1, ptsReb: 40.1, ptsAst: 39.0 }),
        player("FX-2", "Fixture Player Two", { pts: 12.4, reb: 7.2, ast: 1.8, threePm: 0.6 }, { pra: 21.4, ptsReb: 19.6, ptsAst: 14.2 }),
      ],
      home: [
        player("FX-3", "Fixture Player Three", { pts: 15.0, reb: 3.3, ast: 5.5, threePm: 1.4 }, { pra: 23.8, ptsReb: 18.3, ptsAst: 20.5 }),
        player("FX-4", "Fixture Player Four", { pts: 9.8, reb: 2.1, ast: 1.1, threePm: 1.7 }, { pra: 13.0, ptsReb: 11.9, ptsAst: 10.9 }),
      ],
    },
  }],
});

const rec = (athlete, family, marketKey, line, over, under, capturedAt) => ({
  schema: "gtp.nba.prop-price@1", eventId: FIXTURE_EVENT, providerAthleteId: athlete, family, providerMarketKey: marketKey,
  line, book: FIXTURE_BOOK, overAmerican: over, underAmerican: under, capturedAt,
});
/** Adapter-shaped price records (fake). */
export const FIXTURE_PRICE_RECORDS = Object.freeze([
  rec("FX-1", "pts", "player_points", 29.5, -115, -105, hBefore(3)), // OVER  +6.5
  rec("FX-2", "reb", "player_rebounds", 9.5, 120, null, hBefore(2.5)), // UNDER −2.3, Under price not posted
  rec("FX-3", "ast", "player_assists", 5.5, -110, -110, hBefore(4)), // NEUTRAL 0.0
  rec("FX-4", "threePm", "player_threes", 1.5, 140, -175, hBefore(9)), // STALE: 9 h before tip, 7 h before asOf
  rec("FX-1", "reb", "player_points", 4.5, -110, -110, hBefore(3)), // MARKET_MISMATCH → unsupported
]);

const input = (key, athlete, name, team, marketKey, projection, offer) => ({
  key, eventId: FIXTURE_EVENT, slateDate: FIXTURE_SLATE, tip: FIXTURE_TIP, asOf: FIXTURE_AS_OF,
  player: { id: athlete, name, team }, marketKey, projection, offer,
});
const offer = (athlete, marketKey, line, over, under, capturedAt, extra = {}) => ({
  marketKey, line, overPrice: over, underPrice: under, book: FIXTURE_BOOK, capturedAt, eventId: FIXTURE_EVENT, athleteId: athlete, slateDate: FIXTURE_SLATE, ...extra,
});
/** One adapter input per state (for the evidence page and the state tests). */
export const FIXTURE_STATE_INPUTS = Object.freeze({
  over: input("over", "FX-1", "Fixture Player One", "AWY", "pts", 36.0, offer("FX-1", "player_points", 29.5, -115, -105, hBefore(3))),
  under: input("under", "FX-2", "Fixture Player Two", "AWY", "reb", 7.2, offer("FX-2", "player_rebounds", 9.5, 120, null, hBefore(2.5))),
  neutral: input("neutral", "FX-3", "Fixture Player Three", "HME", "ast", 5.5, offer("FX-3", "player_assists", 5.5, -110, -110, hBefore(4))),
  stale: input("stale", "FX-4", "Fixture Player Four", "HME", "threePm", 1.7, offer("FX-4", "player_threes", 1.5, 140, -175, hBefore(9))),
  afterTip: input("afterTip", "FX-4", "Fixture Player Four", "HME", "pts", 9.8, offer("FX-4", "player_points", 8.5, -110, -110, "2099-01-16T00:45:00.000Z")),
  unmatched: input("unmatched", "FX-3", "Fixture Player Three", "HME", "pts", 15.0, offer("FX-999", "player_points", 14.5, -110, -110, hBefore(3))),
  noLine: input("noLine", "FX-2", "Fixture Player Two", "AWY", "pra", 21.4, null),
  unsupported: input("unsupported", "FX-1", "Fixture Player One", "AWY", "stl", 1.2, offer("FX-1", "player_steals", 0.5, -110, -110, hBefore(3))),
  mismatch: input("mismatch", "FX-1", "Fixture Player One", "AWY", "reb", 4.1, offer("FX-1", "player_points", 4.5, -110, -110, hBefore(3))),
  zeroPrice: input("zeroPrice", "FX-3", "Fixture Player Three", "HME", "pts", 15.0, offer("FX-3", "player_points", 16.5, 0, null, hBefore(3))),
});
