/**
 * Smart Betslip · compare sportsbook odds for the exact same legs (TEST FIXTURES). Run from app/:
 *   npx tsx --test src/lib/slip/odds-comparison.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { compareSlipOdds, slipSummaryText, legIdentity, stripLinks, MISSING, COMBINED_BLOCK, OPERATOR_STATUS } from "./odds-comparison.mjs";
import { HANDOFF } from "./handoff-capability.mjs";
import { parseNbaPropResponses } from "../sports/odds/nba-props/parse.mjs";
import { SCHEDULE, rosterFor, EVENT_1, ok } from "../sports/odds/nba-props/__fixtures__/event-odds.fixture.mjs";
import { americanToDecimal } from "../odds-math.ts";

const NOW_MS = Date.parse("2026-10-22T22:05:00.000Z");
const MIN = 60_000;

// A second game with clean prices at both books (TEST FIXTURE).
const EVENT_2_CLEAN = {
  id: "fx-clean-2", sport_key: "basketball_nba", sport_title: "NBA", commence_time: "2026-10-23T02:00:00Z",
  home_team: "Los Angeles Lakers", away_team: "Golden State Warriors",
  bookmakers: [
    { key: "draftkings", title: "DraftKings", markets: [{ key: "player_points", last_update: "2026-10-22T21:40:00Z", outcomes: [
      { name: "Over", description: "Fixture Laker One", price: 120, point: 22.5 }, { name: "Under", description: "Fixture Laker One", price: -150, point: 22.5 }] }] },
    { key: "fanduel", title: "FanDuel", markets: [{ key: "player_points", last_update: "2026-10-22T21:41:00Z", outcomes: [
      { name: "Over", description: "Fixture Laker One", price: 115, point: 22.5 }, { name: "Under", description: "Fixture Laker One", price: -145, point: 22.5 }] }] },
  ],
};
const { records } = parseNbaPropResponses([ok(EVENT_1), ok(EVENT_2_CLEAN)], { schedule: SCHEDULE, rosterFor });

const leg = (o) => ({ sport: "nba", family: "pts", side: "over", ...o });
const GUARD = leg({ eventId: "900000001", playerId: "9100001", line: 24.5, game: "BOS @ NYK", player: "Fixture Guard One", marketLabel: "Points" });
const LAKER = leg({ eventId: "900000002", playerId: "9200001", line: 22.5, side: "under", game: "GSW @ LAL", player: "Fixture Laker One", marketLabel: "Points" });
const BIG = leg({ eventId: "900000001", playerId: "9100003", line: 18.5, game: "BOS @ NYK", player: "Fixture Big Three" });
const op = (c, book) => c.operators.find((o) => o.book === book);

test("all legs matched at two books: per-book combined decimal = product of that book's recorded prices", () => {
  const c = compareSlipOdds({ legs: [GUARD, LAKER], priceRecords: records, nowMs: NOW_MS });
  assert.deepEqual(c.operators.map((o) => [o.book, o.status]), [["draftkings", "ALL_MATCHED"], ["fanduel", "ALL_MATCHED"]]);
  const dk = op(c, "draftkings");
  assert.deepEqual(dk.matched.map((m) => m.price), [-115, -150], "Over for GUARD, Under for LAKER");
  assert.equal(dk.combined.available, true);
  assert.ok(Math.abs(dk.combined.decimal - americanToDecimal(-115) * americanToDecimal(-150)) < 1e-6);
  assert.ok(Math.abs(op(c, "fanduel").combined.decimal - americanToDecimal(-112) * americanToDecimal(-145)) < 1e-6);
  assert.match(dk.combined.label, /not its parlay price/);
  assert.equal(dk.handoff.capability, HANDOFF.MANUAL_ENTRY);
  assert.equal(dk.oldestCapturedAt, "2026-10-22T21:40:00.000Z");
});

test("partial: a different line at one book is LINE_DIFFERS (with the book's line), and there is no combined price there", () => {
  const c = compareSlipOdds({ legs: [BIG, LAKER], priceRecords: records, nowMs: NOW_MS });
  const fd = op(c, "fanduel");
  assert.equal(fd.status, OPERATOR_STATUS.PARTIAL);
  assert.deepEqual(fd.missing.map((m) => [m.legIndex, m.reason, m.bookLines]), [[0, MISSING.LINE_DIFFERS, [19.5]]]);
  assert.equal(fd.combined.available, false);
  assert.equal(fd.combined.blockedBy, COMBINED_BLOCK.NOT_ALL_LEGS);
  assert.equal(op(c, "draftkings").status, OPERATOR_STATUS.ALL_MATCHED);
  assert.equal(c.operators[0].book, "draftkings", "fully matched books list first");
});

test("missing: a player with no record at a book, and an operator passed in with no records at all", () => {
  const accent = leg({ eventId: "900000001", playerId: "9100006", line: 12.5 });
  const c = compareSlipOdds({ legs: [accent, LAKER], priceRecords: records, nowMs: NOW_MS, operators: ["betmgm"] });
  assert.equal(op(c, "fanduel").missing[0].reason, MISSING.NO_PRICE_RECORDED);
  const mgm = op(c, "betmgm");
  assert.equal(mgm.status, OPERATOR_STATUS.NONE);
  assert.ok(mgm.missing.every((m) => m.reason === MISSING.NO_PRICE_RECORDED));
});

test("correlated: two legs from one game, or one player twice, never get a combined price even when every leg matches", () => {
  const sameGame = compareSlipOdds({ legs: [GUARD, leg({ eventId: "900000001", playerId: "9100006", line: 12.5 })], priceRecords: records, nowMs: NOW_MS });
  const dk = op(sameGame, "draftkings");
  assert.equal(dk.status, OPERATOR_STATUS.ALL_MATCHED);
  assert.equal(dk.combined.available, false);
  assert.equal(dk.combined.blockedBy, COMBINED_BLOCK.SAME_GAME);
  assert.equal(sameGame.correlation.blockedBy, COMBINED_BLOCK.SAME_GAME);

  // Same player in two legs from two "events" (synthetic: the second record is the same athlete id elsewhere).
  const twin = records.filter((r) => r.providerAthleteId === "9200001").map((r) => ({ ...r, providerAthleteId: "9100001" }));
  const c = compareSlipOdds({ legs: [GUARD, { ...LAKER, playerId: "9100001" }], priceRecords: [...records, ...twin], nowMs: NOW_MS });
  assert.equal(op(c, "draftkings").combined.blockedBy, COMBINED_BLOCK.SAME_PLAYER);
});

test("stale: a price past the slip's 6 h band is PRICE_STALE (missing), and an AGING price still matches", () => {
  const late = compareSlipOdds({ legs: [GUARD, LAKER], priceRecords: records, nowMs: NOW_MS + 7 * 60 * MIN });
  assert.ok(late.operators.every((o) => o.status === OPERATOR_STATUS.NONE && o.missing.every((m) => m.reason === MISSING.PRICE_STALE)));
  const aging = compareSlipOdds({ legs: [GUARD, LAKER], priceRecords: records, nowMs: NOW_MS + 2 * 60 * MIN });
  assert.equal(op(aging, "draftkings").matched[0].freshness, "AGING");
  assert.equal(op(aging, "draftkings").combined.available, true);
});

test("ineligible books never appear, even when their records are handed in", () => {
  const offshore = records.map((r) => ({ ...r, book: "bovada", bookTitle: "Bovada" }));
  const c = compareSlipOdds({ legs: [GUARD, LAKER], priceRecords: [...records, ...offshore], nowMs: NOW_MS, operators: ["betonlineag"] });
  assert.deepEqual(c.operators.map((o) => o.book), ["draftkings", "fanduel"]);
  assert.doesNotMatch(JSON.stringify(c), /bovada|betonline/i);
});

test("a leg without the comparable ids reads LEG_IDENTITY_INCOMPLETE (the contract for card producers)", () => {
  assert.equal(legIdentity({ sport: "nba", eventId: "1", market: "player_points", selection: "X Over", line: 20.5 }).complete, false, "no playerId");
  const viaMarket = legIdentity({ sport: "nba", eventId: "1", playerId: "2", market: "player_points", selection: "X Over", line: 20.5 });
  assert.deepEqual([viaMarket.family, viaMarket.side, viaMarket.complete], ["pts", "over", true]);
  const c = compareSlipOdds({ legs: [{ sport: "mlb", eventId: "1", market: "pitcher_outs", selection: "P Over", line: 15.5 }, GUARD], priceRecords: records, nowMs: NOW_MS });
  assert.equal(op(c, "draftkings").missing[0].reason, MISSING.LEG_IDENTITY_INCOMPLETE);
});

test("copy-slip text: event, player, market, side + line, price, book, capture time per leg — and no link", () => {
  const c = compareSlipOdds({ legs: [GUARD, LAKER], priceRecords: records, nowMs: NOW_MS });
  const text = slipSummaryText(c, "draftkings");
  const rows = text.split("\n");
  assert.equal(rows[0], "Compare slip · DraftKings · prices as recorded, not live");
  assert.equal(rows[1], "1. BOS @ NYK · Fixture Guard One · Points · Over 24.5 · −115 · DraftKings · recorded 2026-10-22 21:55 UTC");
  assert.equal(rows[2], "2. GSW @ LAL · Fixture Laker One · Points · Under 22.5 · −150 · DraftKings · recorded 2026-10-22 21:40 UTC");
  assert.match(rows[3], /^Combined \(product of recorded leg prices\): \+/);
  assert.match(rows[4], /^Enter these legs yourself at the sportsbook\. .*Paper-only.*Sportsbook availability varies by state\.$/);
  assert.doesNotMatch(text, /https?:|www\.|\.com\b|href/i);

  const partial = slipSummaryText(compareSlipOdds({ legs: [BIG, LAKER], priceRecords: records, nowMs: NOW_MS }), "fanduel");
  assert.match(partial, /This sportsbook's line is different · FanDuel · book line 19\.5/);
  assert.match(partial, /Combined: Combined price unavailable\. Not every leg is priced here/);
  assert.equal(slipSummaryText(compareSlipOdds({ legs: [GUARD], priceRecords: records, nowMs: NOW_MS }), "nope"), "");
});

test("provider strings cannot smuggle a link into the copy text", () => {
  assert.equal(stripLinks("Fixture https://evil.example/x Name"), "Fixture Name");
  assert.equal(stripLinks("Book www.example.com"), "Book");
  assert.equal(stripLinks("sportsbook.example.com/addToBetslip?x=1 Guard"), "Guard");
  assert.equal(stripLinks("P.J. Fixture Jr."), "P.J. Fixture Jr.");
  const hostile = { ...LAKER, player: "Fixture Laker One https://example.com/betslip?leg=1" };
  const text = slipSummaryText(compareSlipOdds({ legs: [GUARD, hostile], priceRecords: records, nowMs: NOW_MS }), "fanduel");
  assert.doesNotMatch(text, /https?:|example\.com/);
});
