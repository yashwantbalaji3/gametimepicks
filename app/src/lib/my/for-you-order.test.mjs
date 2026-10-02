/**
 * Session 8 · G — For You reorders official items by explicit choices and never touches the items.
 * The two-user acceptance (§68): an NFL follower and an MLB follower get different orders over the same
 * official items, and every item is byte-identical afterwards.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { forYouOrder } from "./for-you-order.mjs";

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
const OFFICIAL = deepFreeze([
  { receiptId: "mlb:1:moneyline:NYY", kind: "leg", sport: "mlb", product: "bank-builder", family: "team_result", riskBand: "low", legClass: "TEAM", teamIds: ["mlb-team-147"], eventIds: ["mlb-849848"], probability: 0.58, price: -138 },
  { receiptId: "nfl:401:anytime_td:4242335", kind: "leg", sport: "nfl", product: "suggested-parlays", family: "anytime_td", riskBand: "medium", legClass: "PLAYER", teamIds: ["nfl-team-11"], playerIds: ["nfl-athlete-4242335"], probability: 0.51, price: 120 },
  { receiptId: "card:longshot:2026-10-04", kind: "card", sport: "mlb", product: "suggested-parlays", riskBand: "longshot", teamIds: [], probability: 0.08, price: 1100 },
  { receiptId: "nfl:402:team_result:KC", kind: "leg", sport: "nfl", product: "bank-builder", family: "team_result", riskBand: "low", legClass: "TEAM", teamIds: ["nfl-team-12"], probability: 0.66, price: -190 },
]);
const snapshot = JSON.stringify(OFFICIAL);

test("two users, same official items: an NFL follower and an MLB follower get different orders", () => {
  const u1 = forYouOrder(OFFICIAL, { follows: [{ sport: "nfl", entityType: "team", id: "nfl-team-11" }], prefs: { favoriteSports: ["nfl"] } });
  const u2 = forYouOrder(OFFICIAL, { follows: [{ sport: "mlb", entityType: "team", id: "mlb-team-147" }], prefs: { favoriteSports: ["mlb"] } });
  assert.equal(u1.items[0].item.sport, "nfl");
  assert.equal(u2.items[0].item.sport, "mlb");
  assert.notDeepEqual(u1.items.map((x) => x.cites), u2.items.map((x) => x.cites));
});

test("the official items are untouched: same objects, same bytes, same probabilities and prices", () => {
  const r = forYouOrder(OFFICIAL, { prefs: { favoriteSports: ["nfl"], riskBands: ["low", "medium"] } });
  for (const x of r.items) {
    assert.ok(OFFICIAL.includes(x.item), "an item must be the official object itself, not a copy");
    assert.equal(x.cites, x.item.receiptId, "each result cites the official receipt");
  }
  assert.equal(JSON.stringify(OFFICIAL), snapshot);
});

test("risk bands only filter what the reader chose; empty means no filter, never more", () => {
  const all = forYouOrder(OFFICIAL, {});
  assert.equal(all.items.length, OFFICIAL.length);
  const noLongshot = forYouOrder(OFFICIAL, { prefs: { riskBands: ["low", "medium", "high"] } });
  assert.ok(!noLongshot.items.some((x) => x.item.riskBand === "longshot"));
  assert.equal(noLongshot.hidden, 1);
  assert.throws(() => forYouOrder(OFFICIAL, { prefs: { riskBands: ["yolo"] } }), /not a published risk level/);
});

test("hide a sport, hide player props", () => {
  assert.ok(!forYouOrder(OFFICIAL, { prefs: { hiddenSports: ["nfl"] } }).items.some((x) => x.item.sport === "nfl"));
  assert.ok(!forYouOrder(OFFICIAL, { prefs: { hidePlayerProps: true } }).items.some((x) => x.item.legClass === "PLAYER"));
});

test("loss-chasing is not expressible: results, P/L and bankroll are refused as inputs", () => {
  for (const k of ["recentLosses", "netPnl", "bankroll", "lastResult", "riskTolerance"]) {
    assert.throws(() => forYouOrder(OFFICIAL, { prefs: { [k]: 1 } }), /only explicit reader choices/);
  }
  // and an unknown top-level option has no effect on the order
  const base = forYouOrder(OFFICIAL, { prefs: { favoriteSports: ["mlb"] } }).items.map((x) => x.cites);
  const withLosses = forYouOrder(OFFICIAL, { prefs: { favoriteSports: ["mlb"] }, userBets: [{ status: "lost", stake: 300 }] }).items.map((x) => x.cites);
  assert.deepEqual(withLosses, base);
});

test("equal relevance keeps the official order (stable)", () => {
  assert.deepEqual(forYouOrder(OFFICIAL, {}).items.map((x) => x.cites), OFFICIAL.map((x) => x.receiptId));
});
