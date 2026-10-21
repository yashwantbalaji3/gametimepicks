/**
 * Regressions for four confirmed Smart Betslip / Parlay Lab V2 pricing defects (TEST FIXTURES only).
 * Run: npx tsx --test src/lib/slip/slip-pricing-defects.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { compareSlipOdds, stripLinks, MISSING, OPERATOR_STATUS } from "./odds-comparison.mjs";
import { slipView, legView } from "./smart-slip.mjs";
import { combinedPrice, isAmericanPrice } from "../parlays/v2/pricing.mjs";
import { legReasons, recommendCtx } from "../parlays/v2/recommend.mjs";
import { parseNbaPropResponses } from "../sports/odds/nba-props/parse.mjs";
import { SCHEDULE, rosterFor, EVENT_1, ok } from "../sports/odds/nba-props/__fixtures__/event-odds.fixture.mjs";

const NOW_MS = Date.parse("2026-10-22T22:05:00.000Z");
const { records } = parseNbaPropResponses([ok(EVENT_1)], { schedule: SCHEDULE, rosterFor });
const GUARD = { sport: "nba", family: "pts", side: "over", eventId: "900000001", playerId: "9100001", line: 24.5, game: "BOS @ NYK", player: "Fixture Guard One" };

test("1 · a book that moved its line is LINE_DIFFERS at its NEWEST line, never priced from an older record", () => {
  const base = records.filter((r) => r.book === "fanduel" && String(r.providerAthleteId) === GUARD.playerId && r.family === "pts" && r.line === GUARD.line);
  assert.equal(base.length, 1, "fixture: FanDuel prices Guard One at 24.5");
  const old = { ...base[0], capturedAt: "2026-10-22T19:05:00.000Z", recordId: "old" };
  const moved = { ...base[0], line: 25.5, capturedAt: "2026-10-22T22:03:00.000Z", recordId: "moved" };
  const c = compareSlipOdds({ legs: [GUARD], priceRecords: [old, moved], nowMs: NOW_MS });
  const fd = c.operators.find((o) => o.book === "fanduel");
  assert.equal(fd.status, OPERATOR_STATUS.NONE);
  assert.equal(fd.missing[0].reason, MISSING.LINE_DIFFERS);
  assert.deepEqual(fd.missing[0].bookLines, [25.5], "the book's current line is shown");
  // Same instant at two lines: the leg's line is matched.
  const twin = { ...base[0], line: 25.5, recordId: "twin" };
  assert.equal(compareSlipOdds({ legs: [GUARD], priceRecords: [base[0], twin], nowMs: NOW_MS }).operators.find((o) => o.book === "fanduel").matched.length, 1);
});

test("2 · an American price between −100 and +100 is not a price: never combined, never shown, never a card leg", () => {
  assert.equal(isAmericanPrice(-50), false);
  assert.equal(isAmericanPrice(99), false);
  assert.equal(isAmericanPrice(100), true);
  assert.equal(isAmericanPrice(-100), true);
  assert.equal(isAmericanPrice("150"), false);
  const c = combinedPrice([{ price: 100, eventId: "a" }, { price: -50, eventId: "b" }]);
  assert.equal(c.available, false, "−50 would otherwise read as decimal 3.0 (+200)");
  assert.equal(combinedPrice([{ price: 100, eventId: "a" }, { price: -110, eventId: "b" }]).available, true);
  const v = legView({ key: "k", sport: "nba", book: "fanduel", price: -50, capturedAt: new Date(NOW_MS).toISOString() }, { nowMs: NOW_MS, isVerifiedOperator: () => true });
  assert.equal(v.priceVisible, false);
  assert.equal(v.hiddenBecause, "price");
  const r = legReasons({ sport: "mlb", eventId: "1", market: "hits", selection: "x", line: 0.5, price: -50 }, recommendCtx({ nowMs: NOW_MS }));
  assert.ok(r.includes("PRICE_OUT_OF_RANGE"));
});

test("3 · the copy text strips app deep links, shorteners and bare hosts; names and labels survive", () => {
  for (const s of ["draftkings://sportsbook/gateway?x=1", "fanduelsportsbook://launch", "bit.ly/abc123", "t.co/xyz", "caesars.ca/promo", "betmgm.co", "DraftKings.com", "https://x.y/z", "www.fanduel.com"]) {
    assert.equal(stripLinks(`a ${s} b`), "a b", s);
  }
  for (const s of ["Points + Rebounds", "Pts.Reb", "P.J. Washington", "Jaren Jackson Jr.", "BOS @ DET", "Over 20.5", "FanDuel", "DraftKings Sportsbook"]) {
    assert.equal(stripLinks(s), s, s);
  }
});

test("4 · a slip leg with no game identifier withholds the combined price and says why", () => {
  const t = new Date(NOW_MS).toISOString();
  const legs = [
    { key: "a", sport: "nba", eventId: "1", book: "fanduel", price: -110, capturedAt: t },
    { key: "b", sport: "nba", eventId: null, book: "fanduel", price: -110, capturedAt: t },
  ];
  const v = slipView({ legs, pricingSnapshotId: null }, { nowMs: NOW_MS, isVerifiedOperator: () => true });
  assert.equal(v.sameGame, true);
  assert.match(v.sameGameNote, /no game identifier/);
});
