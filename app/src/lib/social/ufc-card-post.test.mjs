import assert from "node:assert/strict";
import test from "node:test";

import { socialPackageViolations } from "./social-package.mjs";
import { foldName, matchBout, pickQuote, ufcBouts, ufcCaption, ufcClose, ufcPages } from "./ufc-card-post.mjs";

const q = (k, a, b, x, y) => ({ key: k, markets: [{ key: "h2h", last_update: "2026-10-31T15:15:47Z", outcomes: [{ name: a, price: x }, { name: b, price: y }] }] });
const ev = (id, home, away, t, books) => ({ id, home_team: home, away_team: away, commence_time: t, bookmakers: books });
const bout = (id, red, blue, pick, start) => ({ boutId: id, weightClass: "Flyweight", scheduledRounds: 3, startUtc: start, red: { name: red }, blue: { name: blue }, prediction: pick ? { basis: "BOTH_FIGHTERS", winner: { name: pick, probability: 0.6 } } : null, unmodelledReason: pick ? null : "thin" });
const card = { generatedAt: "x", event: { providerEventId: "600", slateDate: "2026-10-31" }, model: { id: "m" }, bouts: [bout("1", "Ode' Osbourne", "Cody Durden", "Ode' Osbourne", "2026-11-01T00:00Z"), bout("2", "Mickey Gall", "Zach Reese", "Zach Reese", "2026-10-31T21:00Z"), bout("3", "Julian Erosa", "JeongYeong Lee", "JeongYeong Lee", "2026-10-31T21:00Z"), bout("4", "Joe K", "Nick K", null, "2026-10-31T21:00Z")] };
const odds = { fetchedAt: "2026-10-31T15:16:05Z", events: [
  ev("a", "Cody Durden", "Ode Osbourne", "2026-11-01T00:15:00Z", [q("betonlineag", "Cody Durden", "Ode Osbourne", -999, 500), q("fanduel", "Cody Durden", "Ode Osbourne", -130, 110), q("draftkings", "Cody Durden", "Ode Osbourne", -118, -102)]),
  ev("b", "Mickey Gall", "Zachary Reese", "2026-10-31T22:25:00Z", [q("draftkings", "Mickey Gall", "Zachary Reese", 340, -440)]),
  ev("c", "Jeongyoung Lee", "Julian Erosa", "2026-10-31T22:50:00Z", [q("draftkings", "Jeongyoung Lee", "Julian Erosa", -150, 130)]),
] };
const aliasJoins = [{ boutId: "2", providerKey: "mickey gall|zachary reese" }];
const rows = () => ufcBouts({ card, odds, asOf: "2026-10-31T15:20:00Z", aliasJoins });

test("DraftKings first, by both names; the pick's own price; alias only as recorded", () => {
  const [o, r, l, n] = rows();
  assert.deepEqual([o.price, o.book, o.matchMethod], [-102, "draftkings", "NAMES"]);
  assert.deepEqual([r.price, r.matchMethod, r.segment], [-440, "RECORDED_ALIAS", "Prelims"]);
  assert.deepEqual([l.price, l.book, l.quotedAt, l.noPriceReason], [null, null, null, "NO_PROVIDER_EVENT"]);
  assert.deepEqual([n.pick, n.probability, n.price, n.noPriceReason], [null, null, null, "NO_FORECAST"]);
  assert.equal(o.segment, "Main card");
});

test("one fighter alone never matches; a quote from after the start is refused", () => {
  assert.equal(matchBout({ boutId: "9", red: { name: "Cody Durden" }, blue: { name: "Somebody Else" } }, odds.events, { date: "2026-10-31" }).event, null);
  assert.equal(pickQuote(odds.events[0], "Cody Durden", { fetchedAt: "2026-11-01T01:00:00Z", startMs: Date.parse("2026-11-01T00:00:00Z"), asOf: "2026-11-01T02:00:00Z" }), null);
  assert.equal(foldName("Lucia Szabová"), "lucia szabova");
});

test("the window closes at the earliest of start, provider start of a priced bout, quote age", () => {
  const b = { startUtc: "2026-11-01T00:00Z", price: -102, providerCommenceUtc: "2026-10-31T21:00:00Z", quotedAt: "2026-10-31T15:15:47Z" };
  assert.equal(new Date(ufcClose([b])).toISOString(), "2026-10-31T21:00:00.000Z");
  assert.equal(new Date(ufcClose([{ ...b, providerCommenceUtc: "2026-11-01T00:15:00Z" }])).toISOString(), "2026-10-31T21:15:47.000Z");
});

test("pages stay within four images; the main event stands alone; UFC is a valid sport", () => {
  const b = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(ufcPages(b(5), "UFC_MAIN_CARD").map((p) => p.length), [1, 4]);
  assert.deepEqual(ufcPages(b(7), "UFC_PRELIMS").map((p) => p.length), [4, 3]);
  assert.throws(() => ufcPages(b(17), "UFC_PRELIMS"));
  assert.ok(!socialPackageViolations({ sport: "ufc", contentType: "UFC_PRELIMS" }).some((v) => /^(sport|contentType)/.test(v)));
  const c = ufcCaption({ type: "UFC_MAIN_CARD", headline: "Moicano vs Nolan", bouts: 5, modelled: 4, startText: "8 PM ET" });
  assert.match(c, /#UFC/); assert.match(c, /4 of 5/); assert.doesNotMatch(c, /%/);
});
