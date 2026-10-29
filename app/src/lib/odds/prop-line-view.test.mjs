/* Sport-agnostic prop-line view (founder P0 2026-10-29) through the NBA adapter, on SYNTHETIC fixtures only.
   Run: npx tsx --test src/lib/odds/prop-line-view.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPropLineView, buildPropLineViews, propLineLegend, signedDifference, americanPrice, quoteTimeEt, sideOf, SIDE, SIDE_BY_DIRECTION, SIDE_TOKEN, PROP_LINE_STATE,
} from "./prop-line-view.mjs";
import { NBA_PROP_LINE_ADAPTER, nbaPropLineInputs, NBA_MARKET_LABEL } from "../sports/nba/prop-line-adapter.mjs";
import { USER_SIDE, LINE_MAX_AGE_HOURS, MARKET_KEYS } from "../sports/nba/line-comparison.mjs";
import { FIXTURE_STATE_INPUTS as S, FIXTURE_LANE, FIXTURE_PRICE_RECORDS, FIXTURE_AS_OF } from "./__fixtures__/prop-line-synthetic.mjs";

const v = (k) => buildPropLineView(S[k], NBA_PROP_LINE_ADAPTER);

test("OVER / UNDER / NEUTRAL: the reader's words, mapped from the comparator's ABOVE / BELOW / EQUAL; one mapping everywhere", () => {
  assert.deepEqual(SIDE_BY_DIRECTION, { ABOVE: "OVER", BELOW: "UNDER", EQUAL: "NEUTRAL" });
  assert.deepEqual({ ...USER_SIDE }, { ...SIDE_BY_DIRECTION }, "the NBA rule's `side` and the view agree");
  assert.equal(sideOf("UNAVAILABLE"), null);
  assert.deepEqual([v("over").side, v("under").side, v("neutral").side], [SIDE.OVER, SIDE.UNDER, SIDE.NEUTRAL]);
  for (const k of ["over", "under", "neutral"]) assert.equal(v(k).state, PROP_LINE_STATE.COMPARED);
});

test("colours: OVER success, UNDER danger, NEUTRAL and every non-compared state text-mute — tokens only, no fallback inside var()", () => {
  assert.equal(v("over").color, "var(--vault-success)");
  assert.equal(v("under").color, "var(--vault-danger)");
  assert.equal(v("neutral").color, "var(--vault-text-mute)");
  for (const k of ["stale", "afterTip", "unmatched", "noLine", "unsupported", "mismatch"]) assert.equal(v(k).color, "var(--vault-text-mute)", k);
  for (const t of Object.values(SIDE_TOKEN)) assert.match(t, /^var\(--[a-z-]+\)$/);
});

test("the founder's worked example shape: model 36.0 vs line 29.5 → OVER +6.5, with book, both prices and ET quote time", () => {
  const r = v("over");
  assert.deepEqual([r.projection.text, r.line.text, r.difference.text, r.difference.value], ["36.0", "29.5", "+6.5", 6.5]);
  assert.equal(r.book.label, "Fixturebook");
  assert.deepEqual([r.overPrice.text, r.underPrice.text], ["−115", "−105"]);
  assert.equal(r.quotedAt.text, "Jan 15, 4:30 PM ET");
  assert.match(r.spoken, /Over, model 36\.0 vs line 29\.5, plus 6\.5\./);
});

test("difference: projection − line, signed, one decimal; zero is 0.0", () => {
  assert.equal(v("under").difference.text, "−2.3");
  assert.match(v("under").spoken, /Under, model 7\.2 vs line 9\.5, minus 2\.3/);
  assert.equal(v("neutral").difference.text, "0.0");
  assert.deepEqual(signedDifference(0.04), { text: "0.0", spoken: "difference 0.0" });
  assert.equal(signedDifference(1.25).text, "+1.3");
  assert.equal(signedDifference(-0.06).text, "−0.1");
  assert.equal(signedDifference(null).text, "—");
});

test("prices: a missing or illegitimate price is '—' (screen reader: price unavailable), never 0", () => {
  const r = v("under");
  assert.deepEqual([r.overPrice.text, r.underPrice.text, r.underPrice.value], ["+120", "—", null]);
  assert.match(r.spoken, /Under price unavailable/);
  const z = v("zeroPrice");
  assert.deepEqual([z.overPrice.text, z.underPrice.text], ["—", "—"], "a 0 price is not a price");
  for (const bad of [0, 50, -99, 110.5, NaN, undefined, "−110"]) assert.equal(americanPrice(bad).text, "—", String(bad));
  assert.equal(americanPrice(-110).text, "−110");
  assert.doesNotMatch(JSON.stringify([r, z]), /"text":"0"/);
});

test(`stale: older than ${LINE_MAX_AGE_HOURS} h, or captured after tip → STALE, no direction, no colour, no difference; the quote is shown as not compared`, () => {
  for (const k of ["stale", "afterTip"]) {
    const r = v(k);
    assert.equal(r.state, PROP_LINE_STATE.STALE, k);
    assert.deepEqual([r.side, r.difference, r.tone], [null, null, "MUTED"], k);
  }
  const r = v("stale");
  assert.deepEqual([r.line.text, r.book.label, r.statusText], ["1.5", "Fixturebook", "Line stale"]);
  assert.match(r.spoken, /Line stale: The captured line is too old to compare\. .* not compared\./);
  assert.match(v("afterTip").reasonText, /after tip-off/);
});

test("unsupported market (the model does not project it, or the line measures another stat) → UNSUPPORTED, no line shown", () => {
  for (const k of ["unsupported", "mismatch"]) {
    const r = v(k);
    assert.equal(r.state, PROP_LINE_STATE.UNSUPPORTED, k);
    assert.deepEqual([r.line, r.book, r.side, r.overPrice], [null, null, null, null], k);
  }
  assert.equal(v("unsupported").market.label, "stl");
  assert.match(v("unsupported").reasonText, /does not project/);
  assert.match(v("mismatch").reasonText, /different statistic/);
});

test("unmatched player or no line → UNAVAILABLE with the reason; never a guessed line", () => {
  const u = v("unmatched");
  assert.deepEqual([u.state, u.reason, u.line, u.book], ["UNAVAILABLE", "UNMATCHED", null, null]);
  assert.match(u.reasonText, /could not be matched/);
  const n = v("noLine");
  assert.deepEqual([n.state, n.reason], ["UNAVAILABLE", "NO_LINE"]);
  assert.equal(n.projection.text, "21.4", "the projection is still printed");
});

test("reader-facing text never says ABOVE / BELOW or EQUAL as a direction", () => {
  for (const k of Object.keys(S)) {
    const r = v(k);
    assert.doesNotMatch(`${r.statusText} ${r.spoken}`, /\bABOVE\b|\bBELOW\b|\bEQUAL\b/, k);
  }
});

test("legend: every state explained, the freshness rule quoted, and the caveat (not a probability, pick or recommendation)", () => {
  const L = propLineLegend(LINE_MAX_AGE_HOURS);
  assert.match(L.over, /^OVER \(green\): .*above/);
  assert.match(L.under, /^UNDER \(red\): .*below/);
  assert.match(L.neutral, /^NEUTRAL \(grey\): .*equals/);
  assert.match(L.difference, /36\.0 vs 29\.5 is \+6\.5/);
  assert.match(L.stale, /more than 6 hours old, or was taken after the start/);
  assert.match(L.prices, /never a zero/);
  assert.match(L.caveat, /not a probability, a pick or a betting recommendation/);
  assert.doesNotMatch(Object.values(L).join(" "), /\bedge\b|\block\b|best bet|\bvalue\b/i);
});

test("NBA adapter: every official family has a label; the board's own pairing feeds it (synthetic records)", () => {
  assert.deepEqual(Object.keys(NBA_MARKET_LABEL).sort(), Object.keys(MARKET_KEYS).sort());
  assert.equal(NBA_PROP_LINE_ADAPTER.bookLabel("draftkings"), "DraftKings");
  const { inputs, withoutLine, total } = nbaPropLineInputs({ lane: FIXTURE_LANE, priceRecords: FIXTURE_PRICE_RECORDS, asOf: FIXTURE_AS_OF });
  assert.equal(total, 4 * 7);
  assert.equal(inputs.length, 5, "only player × family pairs with an offer are listed");
  assert.equal(withoutLine, 28 - 5);
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER);
  assert.deepEqual(view.counts, { compared: 3, stale: 1, unavailable: 0, unsupported: 1 });
  assert.deepEqual(view.rows.filter((r) => r.state === "COMPARED").map((r) => [r.player.name, r.market.label, r.side, r.difference.text]), [
    ["Fixture Player One", "Points", "OVER", "+6.5"],
    ["Fixture Player Two", "Rebounds", "UNDER", "−2.3"],
    ["Fixture Player Three", "Assists", "NEUTRAL", "0.0"],
  ]);
  const one = nbaPropLineInputs({ lane: FIXTURE_LANE, priceRecords: FIXTURE_PRICE_RECORDS, asOf: FIXTURE_AS_OF, eventId: "OTHER" });
  assert.equal(one.inputs.length, 0, "another game's page lists none of this game's lines");
});

test("quote time: Eastern Time, '—' for an unreadable instant", () => {
  assert.equal(quoteTimeEt("2099-07-01T20:00:00Z"), "Jul 1, 4:00 PM ET");
  assert.equal(quoteTimeEt("nope"), "—");
});
