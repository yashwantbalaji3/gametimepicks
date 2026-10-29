/* Sport-agnostic prop-line view (founder P0 2026-10-29) through the NBA adapter, on SYNTHETIC fixtures only.
   Run: npx tsx --test src/lib/odds/prop-line-view.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPropLineView, buildPropLineViews, propLineLegend, signedDifference, americanPrice, quoteTimeEt, sideOf, SIDE, SIDE_BY_DIRECTION, SIDE_TOKEN, PROP_LINE_STATE,
  fmt1, lineText, coverageText, stateCopy, DISPLAY_ROUNDING_POLICY,
} from "./prop-line-view.mjs";
import { NBA_PROP_LINE_ADAPTER, nbaPropLineInputs, NBA_MARKET_LABEL, NBA_STATE_OF_REASON } from "../sports/nba/prop-line-adapter.mjs";
import { USER_SIDE, LINE_MAX_AGE_HOURS, MARKET_KEYS, UNAVAILABLE_REASON } from "../sports/nba/line-comparison.mjs";
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
  for (const k of ["stale", "afterTip", "unmatched", "noLine", "unsupported", "mismatch", "suspended", "wrongDay"]) assert.equal(v(k).color, "var(--vault-text-mute)", k);
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

test("difference: projection − line, signed, one decimal; unsigned 0.0 ONLY when the projection equals the line", () => {
  assert.equal(v("under").difference.text, "−2.3");
  assert.match(v("under").spoken, /Under, model 7\.2 vs line 9\.5, minus 2\.3/);
  assert.equal(v("neutral").difference.text, "0.0");
  assert.deepEqual(signedDifference(0), { text: "0.0", spoken: "difference 0.0", value: 0 });
  assert.equal(signedDifference(1.25).text, "+1.3", "half away from zero");
  assert.equal(signedDifference(-1.25).text, "−1.3", "symmetric: −x prints the same magnitude as +x");
  assert.equal(signedDifference(-0.06).text, "−0.1");
  assert.equal(signedDifference(-2.3000000000000007).text, "−2.3", "binary noise never changes a printed digit");
  assert.equal(signedDifference(null).text, "—");
});

test("ROUNDING POLICY: direction from full precision; a non-zero difference that rounds to 0.0 prints +0.0 / −0.0 with its true direction", () => {
  assert.deepEqual(signedDifference(0.04), { text: "+0.0", spoken: "plus 0.0", value: 0 });
  assert.deepEqual(signedDifference(-0.04), { text: "−0.0", spoken: "minus 0.0", value: -0 });
  assert.equal(signedDifference(1e-9).text, "+0.0");
  const o = v("tinyOver"), u = v("tinyUnder");
  assert.deepEqual([o.state, o.side, o.difference.text, o.color], ["COMPARED", "OVER", "+0.0", "var(--vault-success)"], "12.54 vs 12.5 stays OVER — never flipped or neutralized by rounding");
  assert.ok(Math.abs(o.difference.exact - 0.04) < 1e-9, "the view keeps the full-precision difference");
  assert.deepEqual([u.state, u.side, u.difference.text, u.color], ["COMPARED", "UNDER", "−0.0", "var(--vault-danger)"]);
  assert.match(o.spoken, /Over, model 12\.5 vs line 12\.5, plus 0\.0/);
  // display rounds the model to one decimal; the line prints as provided
  assert.deepEqual([o.projection.text, o.line.text], ["12.5", "12.5"]);
  assert.deepEqual([fmt1(12.54), fmt1(12.55), fmt1(0.05), fmt1(null)], ["12.5", "12.6", "0.1", "—"]);
  assert.deepEqual([lineText(29.5), lineText(30), lineText(29.25), lineText(0.5), lineText(null)], ["29.5", "30.0", "29.25", "0.5", "—"], "lines are never rounded");
  assert.match(DISPLAY_ROUNDING_POLICY.difference, /\+0\.0 \/ −0\.0 with its true direction/);
  // for every compared fixture the printed sign agrees with the side
  for (const k of Object.keys(S)) {
    const r = v(k);
    if (r.state !== "COMPARED") continue;
    const t = r.difference.text;
    assert.equal(r.side === "OVER" ? t.startsWith("+") : r.side === "UNDER" ? t.startsWith("−") : t === "0.0", true, `${k}: ${r.side} ${t}`);
  }
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

test(`stale (older than ${LINE_MAX_AGE_HOURS} h) and captured after cutoff: separate states, no direction, no colour, no difference; the quote is shown as not compared`, () => {
  const st = v("stale"), at = v("afterTip");
  assert.deepEqual([st.state, at.state], [PROP_LINE_STATE.STALE, PROP_LINE_STATE.AFTER_CUTOFF]);
  for (const r of [st, at]) assert.deepEqual([r.side, r.difference, r.tone, r.glyph], [null, null, "MUTED", null]);
  assert.deepEqual([st.line.text, st.book.label, st.statusText, st.reason], ["1.5", "Fixturebook", "Line stale", "STALE"]);
  assert.equal(st.reasonText, `This sportsbook line is more than ${LINE_MAX_AGE_HOURS} hours old, so it is not compared.`);
  assert.match(st.spoken, /Line stale: .* not compared\./);
  assert.deepEqual([at.statusText, at.reason], ["Captured after cutoff", "CAPTURED_AFTER_TIP"]);
  assert.match(at.reasonText, /captured after the game started/);
});

test("unsupported market (the model does not project it, or the line measures another stat) → UNSUPPORTED, no line shown", () => {
  for (const k of ["unsupported", "mismatch"]) {
    const r = v(k);
    assert.equal(r.state, PROP_LINE_STATE.UNSUPPORTED, k);
    assert.deepEqual([r.line, r.book, r.side, r.overPrice, r.statusText], [null, null, null, null, "Market not supported"], k);
    assert.match(r.reasonText, /measures something our model does not project/, k);
  }
  assert.equal(v("unsupported").market.label, "stl");
  assert.deepEqual([v("unsupported").reason, v("mismatch").reason], ["UNSUPPORTED_MARKET", "MARKET_MISMATCH"], "the engineering code stays in `reason`");
});

test("player/event mismatch → MISMATCH ('Line could not be matched to this player and game'); no line → UNAVAILABLE; never a guessed line", () => {
  for (const k of ["unmatched", "wrongDay"]) {
    const u = v(k);
    assert.deepEqual([u.state, u.line, u.book, u.side, u.statusText], ["MISMATCH", null, null, null, "Line not matched"], k);
    assert.equal(u.reasonText, "Line could not be matched to this player and game.");
  }
  assert.deepEqual([v("unmatched").reason, v("wrongDay").reason], ["UNMATCHED", "WRONG_DAY"]);
  const n = v("noLine");
  assert.deepEqual([n.state, n.reason, n.statusText], ["UNAVAILABLE", "NO_LINE", "Line unavailable"]);
  assert.equal(n.projection.text, "21.4", "the projection is still printed");
});

test("suspended / ineligible market → SUSPENDED, no line, no direction", () => {
  const r = v("suspended");
  assert.deepEqual([r.state, r.reason, r.side, r.line, r.book, r.statusText], ["SUSPENDED", "SUSPENDED", null, null, null, "Market suspended"]);
  const inel = buildPropLineView({ ...S.over, offer: { ...S.over.offer, eligible: false } }, NBA_PROP_LINE_ADAPTER);
  assert.deepEqual([inel.state, inel.reason], ["SUSPENDED", "INELIGIBLE"]);
  const bad = buildPropLineView({ ...S.over, offer: { ...S.over.offer, line: Number.NaN } }, NBA_PROP_LINE_ADAPTER);
  assert.deepEqual([bad.state, bad.reason], ["SUSPENDED", "INVALID_LINE"]);
});

test("every refusal reason of the NBA rule maps to a state; public copy carries no reason code or jargon", () => {
  for (const reason of Object.keys(UNAVAILABLE_REASON)) assert.ok(NBA_STATE_OF_REASON[reason], reason);
  const copy = stateCopy(LINE_MAX_AGE_HOURS);
  for (const [state, c] of Object.entries(copy)) {
    assert.ok(PROP_LINE_STATE[state], state);
    assert.doesNotMatch(`${c.label} ${c.text}`, /[A-Z]{3,}_|UNMATCHED|STALE|SUSPENDED|MISMATCH/, `${state}: no reason code`);
    assert.doesNotMatch(`${c.label} ${c.text}`, /median|\bedge\b|\block\b|best bet|\bvalue\b/i, `${state}: no jargon`);
  }
});

test("coverage: 'N of M projections have a qualified sportsbook line' over the TRUE denominator; none without one", () => {
  assert.equal(coverageText(3, 28), "3 of 28 projections have a qualified sportsbook line");
  assert.equal(coverageText(1, 1), "1 of 1 projection has a qualified sportsbook line");
  assert.equal(coverageText(0, 12), "0 of 12 projections have a qualified sportsbook line");
  assert.equal(coverageText(2, null), null, "no denominator, no sentence — never a guessed M");
  assert.equal(buildPropLineViews([S.over], NBA_PROP_LINE_ADAPTER).coverage, null);
});

test("reader-facing text never says ABOVE / BELOW or EQUAL as a direction", () => {
  for (const k of Object.keys(S)) {
    const r = v(k);
    assert.doesNotMatch(`${r.statusText} ${r.spoken}`, /\bABOVE\b|\bBELOW\b|\bEQUAL\b/, k);
  }
});

test("legend: plain words — OVER/UNDER/NEUTRAL, the difference and its ±0.0, every state, prices, and 'a comparison, not a bet recommendation or a probability'", () => {
  const L = propLineLegend(LINE_MAX_AGE_HOURS);
  assert.equal(L.over, "OVER means our model's projection is above the sportsbook's line.");
  assert.equal(L.under, "UNDER means our model's projection is below the sportsbook's line.");
  assert.match(L.neutral, /^NEUTRAL means .*same as the sportsbook's line/);
  assert.match(L.difference, /36\.0 against 29\.5 is \+6\.5/);
  assert.match(L.difference, /\+0\.0 or −0\.0 and keeps its direction/);
  assert.match(L.states, /older than 6 hours, taken after the game started, not matched .* suspended/);
  assert.match(L.prices, /never a zero/);
  assert.match(L.caveat, /^It is a comparison, not a bet recommendation or a probability/);
  assert.doesNotMatch(Object.values(L).join(" "), /\bedge\b|\block\b|best bet|\bvalue\b|median/i);
});

test("NBA adapter: every official family has a label; the board's own pairing feeds it (synthetic records)", () => {
  assert.deepEqual(Object.keys(NBA_MARKET_LABEL).sort(), Object.keys(MARKET_KEYS).sort());
  assert.equal(NBA_PROP_LINE_ADAPTER.bookLabel("draftkings"), "DraftKings");
  const { inputs, withoutLine, total } = nbaPropLineInputs({ lane: FIXTURE_LANE, priceRecords: FIXTURE_PRICE_RECORDS, asOf: FIXTURE_AS_OF });
  assert.equal(total, 4 * 7);
  assert.equal(inputs.length, 5, "only player × family pairs with an offer are listed");
  assert.equal(withoutLine, 28 - 5);
  const { projections } = nbaPropLineInputs({ lane: FIXTURE_LANE, priceRecords: FIXTURE_PRICE_RECORDS, asOf: FIXTURE_AS_OF });
  assert.equal(projections, 28, "the coverage denominator counts every published projection, with or without a line");
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { projections });
  assert.deepEqual(view.counts, { compared: 3, stale: 1, afterCutoff: 0, mismatch: 0, unavailable: 0, unsupported: 1, suspended: 0, notPublished: 0, yesNo: 0 });
  assert.deepEqual(view.sides, { OVER: 1, UNDER: 1, NEUTRAL: 1 });
  assert.equal(view.coverage.text, "3 of 28 projections have a qualified sportsbook line");
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
