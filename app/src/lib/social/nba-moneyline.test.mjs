/**
 * Observed game prices: join by names, December events ignored, one book by order, nothing inferred.
 * Run: cd app && npx tsx --test src/lib/social/nba-moneyline.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { americanText, matchMoneylineEvents, observedPrice } from "./nba-moneyline.mjs";
import { anomalyPackageList } from "./nba-anomaly-check.mjs";

const Q = "2026-10-30T19:42:56Z";
const book = (key, a, h, last_update = Q) => ({ key, markets: [{ key: "h2h", last_update, outcomes: [{ name: "Los Angeles Clippers", price: a }, { name: "Minnesota Timberwolves", price: h }] }] });
const ev = (over = {}) => ({ id: "x", commence_time: "2026-10-31T00:10:00Z", away_team: "Los Angeles Clippers", home_team: "Minnesota Timberwolves", bookmakers: [book("fanduel", 200, -240), book("draftkings", 215, -265)], ...over });
const G = { eventId: "1", awayName: "LA Clippers", homeName: "Minnesota Timberwolves", tipUtc: "2026-10-31T00:00Z" };
const O = { awayName: G.awayName, homeName: G.homeName, sideName: G.homeName, fetchedAt: "2026-10-30T19:44:11Z", tipUtc: G.tipUtc, asOf: "2026-10-30T20:00:00Z" };

test("join: exact names, the one alias, start confirms, a later date is ignored", () => {
  const r = matchMoneylineEvents({ games: [G], events: [ev(), ev({ id: "dec", commence_time: "2026-12-26T01:10:00Z" })], date: "2026-10-30" });
  assert.equal(r.matched.get("1").startDeltaMinutes, 10);
  assert.deepEqual(r.ignored.map((e) => e.id), ["dec"]);
  assert.deepEqual(r.unused, []);
});
test("join refuses swapped teams, a far start, and a double", () => {
  const events = (e) => matchMoneylineEvents({ games: [G], events: e, date: "2026-10-30" }).unmatched[0].reason;
  assert.equal(events([ev({ away_team: "Minnesota Timberwolves", home_team: "Los Angeles Clippers" })]), "NO_PROVIDER_EVENT");
  assert.equal(events([ev({ commence_time: "2026-10-31T01:00:00Z" })]), "START_DIFFERS_60_MINUTES");
  assert.equal(events([ev(), ev()]), "MORE_THAN_ONE_PROVIDER_EVENT");
});
test("book: REFERENCE_BOOK_ORDER regardless of file order, next book when one is unclean", () => {
  assert.deepEqual(observedPrice(ev(), O), { book: "draftkings", price: -265, quotedAt: Q });
  assert.equal(observedPrice(ev({ bookmakers: [book("fanduel", 200, -240), book("draftkings", 215, null)] }), O).book, "fanduel");
});
test("no price is inferred", () => {
  assert.equal(observedPrice(ev({ bookmakers: [] }), O), null);
  assert.equal(observedPrice(ev({ bookmakers: [book("unlisted", 215, -265)] }), O), null);
  assert.equal(observedPrice(ev({ bookmakers: [book("draftkings", 215, -50)] }), O), null);
  assert.equal(observedPrice(ev({ bookmakers: [book("draftkings", 215, -265, undefined)].map((b) => ({ ...b, markets: [{ ...b.markets[0], last_update: undefined }] })) }), O), null);
  assert.equal(observedPrice(ev(), { ...O, asOf: "2026-10-31T02:00:00Z" }), null, "older than the line age limit");
  assert.equal(observedPrice(ev(), { ...O, asOf: "2026-10-30T19:00:00Z" }), null, "capture after asOf");
});
test("American text", () => { assert.equal(americanText(215), "+215"); assert.equal(americanText(-265), "-265"); });
test("anomaly list drops the detail", () => {
  const [a] = anomalyPackageList([{ dedupeId: "d", contentType: "NBA_BOXSCORE", variant: "1", containsMarketData: true, anomalyCheck: "REVIEW", anomalies: [{ playerId: "9", market: "pts", verdict: "MODEL_DEFECT", detail: "A B pts: Model above the compared line." }, { playerId: "9", market: "ast", verdict: "BAD_JOIN", detail: "A compared line has no row." }] }, { dedupeId: "e", contentType: "NBA_TONIGHT" }]);
  assert.equal(a.playersAffected, 1); assert.equal(a.playerMarketsFlagged, 2);
  assert.equal(a.flagged[0].player, "A B"); assert.equal(a.flagged[1].player, "9");
  assert.ok(!/detail|compared/.test(JSON.stringify(a)));
});
