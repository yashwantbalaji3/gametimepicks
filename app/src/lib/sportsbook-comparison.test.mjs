/**
 * Tests for `sportsbook-comparison.ts`.
 *
 * Lock the honesty rules:
 *   - Never invent a book.
 *   - Never invent a price.
 *   - Drop legs with missing / zero / non-finite prices.
 *   - Tag every row at the top American-odds value as best (ties OK).
 *   - Sort best-for-user first (highest American odds first).
 *   - Empty input → empty result.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookmakerLabel,
  buildBookOddsComparison,
} from "./sportsbook-comparison.ts";

test("bookmakerLabel: known keys → display labels", () => {
  assert.equal(bookmakerLabel("draftkings"), "DraftKings");
  assert.equal(bookmakerLabel("FanDuel"), "FanDuel");
  assert.equal(bookmakerLabel("betmgm"), "BetMGM");
  assert.equal(bookmakerLabel("caesars"), "Caesars");
  assert.equal(bookmakerLabel("espnbet"), "ESPN BET");
});

test("bookmakerLabel: unknown key falls back to title-cased input", () => {
  assert.equal(bookmakerLabel("pinnacle"), "Pinnacle");
});

test("bookmakerLabel: null / empty → em-dash", () => {
  assert.equal(bookmakerLabel(null), "—");
  assert.equal(bookmakerLabel(""), "—");
  assert.equal(bookmakerLabel(undefined), "—");
});

test("buildBookOddsComparison: empty input → empty array", () => {
  assert.deepEqual(buildBookOddsComparison({ side: "Over", leans: [] }), []);
});

test("buildBookOddsComparison: side must be Over or Under", () => {
  const leans = [
    { bookmaker: "draftkings", oddsOver: -110, oddsUnder: -110 },
  ];
  assert.deepEqual(buildBookOddsComparison({ side: "Pass", leans }), []);
  assert.deepEqual(buildBookOddsComparison({ side: "", leans }), []);
});

test("buildBookOddsComparison: drops leans with missing book", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "", oddsOver: -110 },
      { bookmaker: null, oddsOver: -120 },
      { bookmaker: "draftkings", oddsOver: -100 },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].bookmaker, "draftkings");
});

test("buildBookOddsComparison: drops leans with missing price", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "draftkings", oddsOver: null },
      { bookmaker: "fanduel", oddsOver: 0 },
      { bookmaker: "betmgm", oddsOver: NaN },
      { bookmaker: "caesars", oddsOver: -110 },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].bookmaker, "caesars");
});

test("buildBookOddsComparison: best-for-user sort (highest American odds first)", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "draftkings", oddsOver: -120 },
      { bookmaker: "fanduel", oddsOver: -110 },
      { bookmaker: "betmgm", oddsOver: +100 },
    ],
  });
  assert.equal(out.map((r) => r.bookmaker).join(","), "betmgm,fanduel,draftkings");
  assert.equal(out[0].isBest, true);
  assert.equal(out[1].isBest, false);
});

test("buildBookOddsComparison: ties at the top → both tagged best", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "draftkings", oddsOver: -110 },
      { bookmaker: "fanduel", oddsOver: -110 },
      { bookmaker: "betmgm", oddsOver: -120 },
    ],
  });
  assert.equal(out.length, 3);
  assert.equal(out.filter((r) => r.isBest).length, 2);
  assert.equal(out[2].isBest, false);
});

test("buildBookOddsComparison: dedupes the same book taking the higher price", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "draftkings", oddsOver: -120 },
      { bookmaker: "DraftKings", oddsOver: -110 },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].americanOdds, -110);
  assert.equal(out[0].isBest, true);
});

test("buildBookOddsComparison: Under reads oddsUnder", () => {
  const out = buildBookOddsComparison({
    side: "Under",
    leans: [
      { bookmaker: "draftkings", oddsOver: -300, oddsUnder: +250 },
      { bookmaker: "fanduel", oddsOver: -300, oddsUnder: +220 },
    ],
  });
  assert.equal(out[0].bookmaker, "draftkings");
  assert.equal(out[0].americanOdds, 250);
  assert.equal(out[0].isBest, true);
});

test("buildBookOddsComparison: surfaces only books that actually offer the side", () => {
  const out = buildBookOddsComparison({
    side: "Over",
    leans: [
      { bookmaker: "draftkings", oddsOver: null, oddsUnder: -110 },
      { bookmaker: "fanduel", oddsOver: +110, oddsUnder: -130 },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].bookmaker, "fanduel");
});
