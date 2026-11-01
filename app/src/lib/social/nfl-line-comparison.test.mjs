import assert from "node:assert/strict";
import test from "node:test";

import { americanText } from "./nba-moneyline.mjs";
import { COMPARISON_NOTE, comparisonCell, comparisonCounts, nflPropComparison } from "./nfl-line-comparison.mjs";
import { nflPropOfferStatus } from "../../../scripts/social/nfl-line-capture.mjs";
import { nflPropRows } from "../../../scripts/social/render-social-pack.mjs";

const expected = { eventId: "1", playerId: "a", market: "player_pass_yds" };
const quote = { canonicalEventId: "nfl-1", playerId: "a", market: "player_pass_yds", book: "draftkings", line: 210.5, overPrice: -112, underPrice: 104, capturedAt: "2026-11-01T14:00:00Z" };
const cmp = (projection, q = quote, o = {}) => nflPropComparison({ projection, quote: q, expected, ...o });

test("above the line: green OVER with the over price", () => {
  const c = cmp(230);
  assert.deepEqual([c.state, c.colour, c.glyph, c.price, c.comparisonIsNotEdge], ["OVER", "green", "▲", -112, true]);
  assert.match(comparisonCell(c, String).text, /^▲ OVER -112$/);
});

test("below the line: red UNDER with the under price, never the over price", () => {
  const c = cmp(190);
  assert.deepEqual([c.state, c.colour, c.glyph, c.price], ["UNDER", "red", "▼", 104]);
  assert.equal(comparisonCell(c, String).cls, "vs under");
});

test("equal: neutral, no price", () => {
  const c = cmp(210.5);
  assert.deepEqual([c.state, c.colour, c.price, c.side], ["EQUAL", "neutral", null, null]);
  assert.equal(comparisonCell(c, String).cls, "vs none");
});

test("missing: neutral with an explicit reason", () => {
  assert.equal(cmp(null).reason, "NO_PROJECTION");
  assert.equal(cmp(200, null).reason, "NO_LINE");
  assert.equal(cmp(200, null, { reason: "INELIGIBLE_BOOK" }).reason, "INELIGIBLE_BOOK");
});

test("mismatched: another player, market or game is never compared", () => {
  for (const q of [{ ...quote, playerId: "b" }, { ...quote, market: "player_rush_yds" }, { ...quote, canonicalEventId: "nfl-2" }]) {
    const c = cmp(230, q);
    assert.deepEqual([c.state, c.reason, c.price], ["NEUTRAL", "UNMATCHED", null]);
  }
});

test("invalid line, invalid odds on the shown side, stale quote: neutral with a reason", () => {
  assert.equal(cmp(230, { ...quote, line: null }).reason, "INVALID_LINE");
  assert.equal(cmp(230, { ...quote, overPrice: 50 }).reason, "INVALID_ODDS");
  assert.equal(cmp(230, { ...quote, overPrice: null }).reason, "INVALID_ODDS");
  assert.equal(cmp(190, { ...quote, overPrice: null }).state, "UNDER", "only the shown side's price matters");
  assert.equal(cmp(190, { ...quote, underPrice: 1.9 }).reason, "INVALID_ODDS");
  assert.equal(cmp(230, quote, { stale: true }).reason, "STALE_LINE");
});

test("offer status names why a quote is unusable", () => {
  const args = { eventId: "1", playerId: "a", market: "player_pass_yds", kickoffUtc: "2026-11-01T18:00Z", asOf: "2026-11-01T17:00:00Z" };
  assert.equal(nflPropOfferStatus([], args).reason, "NO_LINE");
  assert.equal(nflPropOfferStatus([{ ...quote, book: "not-a-book" }], args).reason, "INELIGIBLE_BOOK");
  assert.equal(nflPropOfferStatus([quote, { ...quote, line: 215.5 }], args).reason, "AMBIGUOUS_LINE");
  assert.equal(nflPropOfferStatus([quote], args).quote.quotedAt, quote.capturedAt);
});

test("an ESTIMATE family is compared and keeps its label; rows carry the note and counts", () => {
  const players = [{ playerId: "a", name: "a", team: "X", markets: { player_pass_yds: { median: 230 } } }];
  const board = { families: { player_pass_yds: { state: "ESTIMATE" } } };
  const [r] = nflPropRows({ players, board, eventId: "1", kickoffUtc: "2026-11-01T18:00Z", offers: [quote], asOf: "2026-11-01T15:00:00Z" });
  assert.equal(r.comparison.state, "OVER");
  assert.ok(!r.projection.includes("est") && r.estimate === true);
  assert.equal(r.vs.text, `▲ OVER ${americanText(-112)}`);
  const [none] = nflPropRows({ players, board, eventId: "1", kickoffUtc: "2026-11-01T18:00Z", offers: [], asOf: "2026-11-01T15:00:00Z" });
  assert.deepEqual([none.comparison.reason, none.vs.text], ["NO_LINE", "No line"]);
  assert.deepEqual(comparisonCounts([r.comparison, none.comparison]), { over: 1, under: 0, equal: 0, neutral: 1, reasons: { NO_LINE: 1 } });
  assert.equal(COMPARISON_NOTE.comparisonIsNotEdge, true);
});
