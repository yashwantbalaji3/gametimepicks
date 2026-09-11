import test from "node:test";
import assert from "node:assert/strict";
import { summarise, byLegCount, byPriceBand, repeatedLegs, riskMix, weeklyTrend, findings, bandOf, MIN_DECIDED } from "./bet-insights.mjs";

const slip = (o = {}) => ({ stake: 10, price_american: 150, legs: [{ player: "A", market: "Hits", side: "Over", line: 0.5 }], status: "lost", returned: 0, settled_at: "2026-09-10T02:00:00Z", placed_at: "2026-09-09T22:00:00Z", book: "BookOne", ...o });
const many = (n, o) => Array.from({ length: n }, (_, i) => slip({ ...o, placed_at: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T22:00:00Z` }));

test("a push returns the stake; a pending slip is neither a loss nor invisible", () => {
  const s = summarise([slip({ status: "won", returned: 25 }), slip({ status: "lost" }), slip({ status: "push" }), slip({ status: "pending", returned: null })]);
  assert.equal(s.slips, 4);
  assert.equal(s.pending, 1);
  assert.equal(s.decided, 3, "pending is not decided");
  assert.equal(s.wins, 1); assert.equal(s.losses, 1); assert.equal(s.pushes, 1);
  assert.equal(s.staked, 30); assert.equal(s.returned, 35);
  assert.equal(s.net, 5);
  assert.ok(Math.abs(s.roi - 5 / 30) < 1e-9);
});

test("a win with no recorded return falls back to its own price, never to zero", () => {
  const s = summarise([slip({ status: "won", returned: null, price_american: 100, stake: 10 })]);
  assert.equal(s.returned, 20);
});

test("below the sample floor every slice says so instead of reading as a verdict", () => {
  assert.equal(summarise(many(MIN_DECIDED - 1)).state, "NEEDS_MORE");
  assert.equal(summarise(many(MIN_DECIDED)).state, "OBSERVED");
  assert.equal(summarise([]).decided, 0);
  assert.equal(summarise([]).roi, null, "no stake, no return figure");
});

test("slices split by leg count, price band and book", () => {
  const rows = [slip(), slip({ legs: [{ player: "A" }, { player: "B" }] }), slip({ price_american: 900 }), slip({ book: "BookTwo" })];
  assert.deepEqual(byLegCount(rows).map((s) => s.key).sort(), [1, 2]);
  assert.ok(byPriceBand(rows).some((s) => s.key === "longshot"));
  assert.equal(bandOf(-250), null, "shorter than -200 is outside the published bands");
  assert.equal(bandOf(150), "medium");
});

test("repeated selections surface with their own record", () => {
  const legA = { player: "Aaron Judge", market: "Hits", side: "Over", line: 0.5 };
  const rows = [slip({ legs: [legA] }), slip({ legs: [legA], status: "won", returned: 25 }), slip({ legs: [legA] }), slip({ legs: [{ player: "Other" }] })];
  const rep = repeatedLegs(rows);
  assert.equal(rep.length, 1, "a selection seen once is not a pattern");
  assert.equal(rep[0].appearances, 3);
  assert.equal(rep[0].wins, 1);
  assert.match(rep[0].leg, /Aaron Judge/);
});

test("the risk mix is a share of money, and it sums to the whole", () => {
  const mix = riskMix([slip({ price_american: 100, stake: 30 }), slip({ price_american: 900, stake: 10 })]);
  assert.equal(mix[0].band, "low");
  assert.ok(Math.abs(mix.reduce((n, m) => n + m.share, 0) - 1) < 1e-9);
  assert.deepEqual(riskMix([]), []);
});

test("the trend keeps quiet weeks as zeroes rather than closing the gap", () => {
  const t = weeklyTrend([slip({ settled_at: "2026-09-10T02:00:00Z" })], { weeks: 4, now: new Date("2026-09-11T12:00:00Z") });
  assert.equal(t.length, 4);
  assert.equal(t.at(-1).decided, 1, "the newest week holds the settled slip");
  assert.equal(t[0].decided, 0);
  assert.ok(t[0].weekEnding < t.at(-1).weekEnding, "oldest first");
});

test("findings state what happened, with a sample, and never instruct", () => {
  const rows = [...many(21, { status: "lost" }), slip({ status: "won", returned: 25 })];
  const f = findings(rows);
  assert.ok(f.length >= 2);
  assert.equal(f[0].id, "overall");
  assert.ok(f.every((x) => typeof x.sample === "number" && ["OBSERVED", "NEEDS_MORE"].includes(x.state)));
  const text = f.map((x) => x.text).join(" ");
  for (const advice of [/you should/i, /we recommend/i, /stop betting/i, /bet more/i, /\bbest bet\b/i]) assert.doesNotMatch(text, advice);
  assert.match(findings([]).find((x) => x.id === "overall").text, /Nothing has settled yet/);
});
