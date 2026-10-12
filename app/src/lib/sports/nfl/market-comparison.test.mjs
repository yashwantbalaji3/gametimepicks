import { test } from "node:test";
import assert from "node:assert/strict";

import { impliedFromAmerican, compareModelToMarket, capturedLabel, signed, displayedModelValue, MARKET_ABSENT_SHORT } from "./market-comparison.mjs";

test("implied probability from an American price, margin included; never from a non-price", () => {
  assert.equal(Math.round(impliedFromAmerican(-120) * 10000) / 10000, 0.5455);
  assert.equal(impliedFromAmerican(150), 0.4);
  assert.equal(impliedFromAmerican(100), 0.5);
  for (const bad of [null, undefined, 0, 50, -99, NaN, "-120"]) assert.equal(impliedFromAmerican(bad), null, String(bad));
});

test("a yardage row compares the DISPLAYED value with the posted line, in the row's unit", () => {
  // James Cook III, rushing yards, BUF @ LAR: World Model V2 median 81, DraftKings 75.5 (captured 2026-10-10T17:32:23Z)
  assert.deepEqual(compareModelToMarket("yards", 81, { line: 75.5, overOdds: -112, underOdds: -112 }), { type: "LINE", model: 81, line: 75.5, diff: 5.5 });
  assert.equal(compareModelToMarket("count", 1.72, { line: 1.5 }).diff, 0.2);
  assert.equal(compareModelToMarket("yards", 24, { line: 37.5 }).diff, -13.5);
});

test("anytime TD compares probabilities, never a yardage-style line", () => {
  const c = compareModelToMarket("probability", 0.682, { yesOdds: -120 });
  assert.equal(c.type, "PRICE");
  assert.equal(c.diffPts, 13.7); // 68.2% − 54.5%
  assert.equal(compareModelToMarket("probability", 0.682, { line: 0.5 }), null, "a TD row with no price has nothing to compare");
});

test("nothing is invented: no market, no line, no price or a bad number → no comparison", () => {
  assert.equal(compareModelToMarket("yards", 81, null), null);
  assert.equal(compareModelToMarket("yards", 81, { yesOdds: -120 }), null, "a yardage row needs a line, not a price");
  assert.equal(compareModelToMarket("yards", NaN, { line: 75.5 }), null);
  assert.equal(compareModelToMarket("probability", 1.4, { yesOdds: -120 }), null);
  assert.equal(compareModelToMarket("probability", 0.5, { yesOdds: 0 }), null);
});

test("the capture label always carries the date (a weekday alone reads as this week's, or as live)", () => {
  assert.equal(capturedLabel("2026-10-10T17:32:23Z"), "Sat, Oct 10, 1:32 PM ET");
  assert.equal(capturedLabel("not a time"), "not a time");
  assert.equal(capturedLabel(null), null);
});

test("signed differences use a real minus and keep the unit; a near-zero difference is 0", () => {
  assert.equal(signed(5.5, "yds"), "+5.5 yds");
  assert.equal(signed(-13.5, "yds"), "−13.5 yds");
  assert.equal(signed(0.01, "rec"), "0 rec");
});

test("absence wording is distinct per state and never names a book we did not ask", () => {
  const texts = Object.values(MARKET_ABSENT_SHORT);
  assert.equal(new Set(texts).size, texts.length, "states must not collapse into one phrase");
  for (const t of texts) assert.ok(!/draftkings|fanduel/i.test(t), t);
});

test("the gap is taken from the number the row displays, so a reader's subtraction checks out", () => {
  // Matthew Stafford, passing yards: World Model V2 median 270.9 displays as 271; DraftKings 279.5.
  assert.equal(compareModelToMarket("yards", displayedModelValue("yards", 270.9), { line: 279.5 }).diff, -8.5);
  assert.equal(displayedModelValue("count", 1.7213), 1.7);
  assert.equal(displayedModelValue("probability", 0.68194), 0.682);
  assert.ok(Number.isNaN(displayedModelValue("yards", null)));
});
