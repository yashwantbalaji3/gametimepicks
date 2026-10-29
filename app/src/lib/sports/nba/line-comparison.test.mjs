/* NBA model-versus-line comparison (nba-line-comparison@1): every refusal, the founder's worked example, colour rules. */
import test from "node:test";
import assert from "node:assert/strict";
import { compareToLine, comparisonTone, chooseOffer, DIRECTION, MARKET_KEYS, UNAVAILABLE_REASON, COMPARISON_LEGEND } from "./line-comparison.mjs";

const CTX = { eventId: "401909881", athleteId: "4278053", slateDate: "2026-10-28", tipUtc: "2026-10-28T23:00:00Z", asOf: "2026-10-28T20:00:00Z" };
const LINE = (o = {}) => ({ marketKey: "player_points", line: 22.5, overPrice: -115, underPrice: -105, book: "draftkings", capturedAt: "2026-10-28T18:00:00Z", eventId: CTX.eventId, athleteId: CTX.athleteId, slateDate: CTX.slateDate, ...o });

test("founder example: 24.8 vs 22.5 → +2.3, ABOVE, green", () => {
  const c = compareToLine({ family: "pts", median: 24.8 }, LINE(), CTX);
  assert.deepEqual([c.direction, c.difference, c.line, c.book, c.overPrice], ["ABOVE", 2.3, 22.5, "draftkings", -115]);
  assert.equal(comparisonTone(c), "above");
  assert.equal(comparisonTone(compareToLine({ family: "pts", median: 20 }, LINE(), CTX)), "below");
  const eq = compareToLine({ family: "pts", median: 22.5 }, LINE(), CTX);
  assert.deepEqual([eq.direction, eq.difference, comparisonTone(eq)], ["EQUAL", 0, "neutral"]);
});

test("every refusal is UNAVAILABLE with its reason and is never coloured", () => {
  const cases = [
    [{ family: "pts", median: null }, LINE(), CTX, "NO_PROJECTION"],
    [{ family: "pts", median: 20 }, null, CTX, "NO_LINE"],
    [{ family: "pts", median: 20 }, LINE({ athleteId: "999" }), CTX, "UNMATCHED"],
    [{ family: "pts", median: 20 }, LINE({ eventId: "1" }), CTX, "UNMATCHED"],
    [{ family: "reb", median: 8 }, LINE(), CTX, "MARKET_MISMATCH"],
    [{ family: "pra", median: 30 }, LINE({ marketKey: "player_points" }), CTX, "MARKET_MISMATCH"],
    [{ family: "pts", median: 20 }, LINE({ slateDate: "2026-10-27" }), CTX, "WRONG_DAY"],
    [{ family: "pts", median: 20 }, LINE({ line: Number.NaN }), CTX, "INVALID_LINE"],
    [{ family: "pts", median: 20 }, LINE({ capturedAt: "2026-10-28T23:05:00Z" }), CTX, "CAPTURED_AFTER_TIP"],
    [{ family: "pts", median: 20 }, LINE({ capturedAt: "2026-10-28T12:00:00Z" }), CTX, "STALE"],
  ];
  for (const [p, l, ctx, reason] of cases) {
    const c = compareToLine(p, l, ctx);
    assert.equal(c.direction, DIRECTION.UNAVAILABLE, reason);
    assert.equal(c.reason, reason);
    assert.ok(UNAVAILABLE_REASON[reason]);
    assert.equal(c.difference, undefined, `${reason}: no difference is invented`);
    assert.equal(comparisonTone(c), "neutral");
  }
});

test("after tip the comparison is the pregame one, frozen as of tip (asOf never moves past tip)", () => {
  const late = { ...CTX, asOf: "2026-10-29T03:00:00Z" };
  assert.equal(compareToLine({ family: "pts", median: 24.8 }, LINE({ capturedAt: "2026-10-28T20:00:00Z" }), late).direction, "ABOVE", "captured 3 h before tip: still valid at tip");
});

test("market keys cover all seven official families, one key each", () => {
  assert.deepEqual(Object.keys(MARKET_KEYS).sort(), ["ast", "pra", "pts", "ptsAst", "ptsReb", "reb", "threePm"]);
  assert.equal(new Set(Object.values(MARKET_KEYS)).size, 7);
});

test("several books: the most recent pre-tip capture, ties by book — never an average", () => {
  const offers = [
    { book: "fanduel", capturedAt: "2026-10-28T18:00:00Z", line: 22.5 },
    { book: "draftkings", capturedAt: "2026-10-28T19:00:00Z", line: 23.5 },
    { book: "betmgm", capturedAt: "2026-10-28T19:00:00Z", line: 21.5 },
    { book: "late", capturedAt: "2026-10-28T23:30:00Z", line: 30.5 },
  ];
  assert.deepEqual(chooseOffer(offers, CTX.tipUtc), offers[2], "betmgm wins the 19:00 tie alphabetically; the after-tip offer is ignored");
  assert.equal(chooseOffer([], CTX.tipUtc), null);
});

test("the legend says what colours are and are not", () => {
  assert.match(COMPARISON_LEGEND.caveat, /not a probability, a pick or a betting recommendation/);
});

test("rounding policy: the direction comes from the FULL-precision difference (24.54 vs 24.5 is ABOVE, never EQUAL)", () => {
  const up = compareToLine({ family: "pts", median: 22.54 }, LINE(), CTX);
  assert.deepEqual([up.direction, up.side, up.difference], ["ABOVE", "OVER", 0], "`difference` stays the one-decimal published figure");
  assert.ok(Math.abs(up.differenceExact - 0.04) < 1e-9, "full precision is kept");
  assert.equal(comparisonTone(up), "above");
  const down = compareToLine({ family: "pts", median: 22.46 }, LINE(), CTX);
  assert.deepEqual([down.direction, down.side], ["BELOW", "UNDER"]);
  assert.ok(down.differenceExact < 0);
  const eq = compareToLine({ family: "pts", median: 22.5 }, LINE(), CTX);
  assert.deepEqual([eq.direction, eq.differenceExact], ["EQUAL", 0], "EQUAL only when the projection equals the line");
});
