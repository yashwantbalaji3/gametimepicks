/**
 * THE DISPLAYED PROP PRICE COMES FROM ONE NAMED BOOK (founder decision, 2026-09-24, as amended).
 *
 * The founder's rule has two halves and they pull in opposite directions, which is why each needs
 * its own guard:
 *
 *   COVERAGE    an empty row helps nobody, so DraftKings → FanDuel → the deterministic
 *               most-complete book. A fallback is allowed.
 *   ATTRIBUTION whichever book is chosen is the book NAMED on the row. A fallback is never silent.
 *
 * The failure this exists to prevent is the two halves coming apart: another book's number under
 * DraftKings' name. Everything below is EXECUTED against constructed evidence, because the guard
 * this replaces was a regex over the capture script's source and could only ever have caught a
 * rename — never a mis-attribution, a cross-book pair or a price-ranked ladder.
 *
 * Run: npx tsx --test src/lib/sports/odds/prop-display-selection.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REFERENCE_BOOK, FALLBACK_ORDER, rankBooks, selectPropPrices } from "./prop-display-selection.mjs";

const EVENT = "nfl-401872948";
const PLAYER = "nfl-athlete-4430807";
const AT = "2026-09-24T21:36:24Z";

/** A complete two-sided row as the capture emits them: one book, one point, BOTH sides. */
const line = (bookmaker, over, under, extra = {}) => ({
  canonicalEventId: EVENT, playerId: PLAYER, name: "Bijan Robinson", market: "player_rush_yds",
  bookmaker, line: 78.5, overPrice: over, underPrice: under, capturedAt: AT, sourceAsOf: AT, ...extra,
});
const atd = (bookmaker, price, extra = {}) => ({
  canonicalEventId: EVENT, playerId: PLAYER, name: "Bijan Robinson",
  bookmaker, price, capturedAt: AT, sourceAsOf: AT, ...extra,
});
const probe = ({ lines = [], tds = [] }) => ({ lineProps: { rows: lines, quarantined: [] }, anytimeTd: { rows: tds, quarantined: [] } });

test("DraftKings is the reference book and the head of the ladder", () => {
  assert.equal(REFERENCE_BOOK, "draftkings", "the founder named DraftKings as the reference sportsbook");
  assert.equal(FALLBACK_ORDER[0], REFERENCE_BOOK, "the ladder must start at the reference book, not merely contain it");
  assert.equal(FALLBACK_ORDER[1], "fanduel", "FanDuel is the founder's named second rung");
});

test("DraftKings wins whenever it has the market, whatever the others are paying", () => {
  // every rival pays BETTER on both sides. A price-ranked ladder would take one of them.
  const rows = selectPropPrices(probe({ lines: [line("fanduel", 100, 100), line("betmgm", 120, 120), line("draftkings", -111, -113)] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sportsbook, "draftkings");
  assert.equal(rows[0].overOdds, -111);
  assert.equal(rows[0].underOdds, -113);
});

test("FanDuel is second — and the row says FanDuel, which is the whole point", () => {
  const rows = selectPropPrices(probe({ lines: [line("betmgm", -105, -115), line("fanduel", -111, -113)] }));
  assert.equal(rows[0].sportsbook, "fanduel", "DraftKings did not post, so the ladder falls to FanDuel");
  assert.notEqual(rows[0].sportsbook, REFERENCE_BOOK, "a fallback must NEVER be attributed to the reference book");
});

test("neither rung available ⇒ a deterministic third book, named, and never the best price", () => {
  // `williamhill_us` pays far better than `betmgm`; the ladder must still take betmgm (stable key).
  const rows = selectPropPrices(probe({ lines: [line("williamhill_us", 250, 250), line("betmgm", -130, -130)] }));
  assert.equal(rows[0].sportsbook, "betmgm", "ties break by provider key ascending, never by price");
  assert.equal(rows[0].overOdds, -130, "…and the row carries THAT book's number");

  // and the choice is stable however the provider happened to order the response
  const reversed = selectPropPrices(probe({ lines: [line("betmgm", -130, -130), line("williamhill_us", 250, 250)] }));
  assert.equal(reversed[0].sportsbook, rows[0].sportsbook, "selection must not depend on response order");
});

test("a two-sided row is taken whole from ONE book — an Over and an Under never cross", () => {
  const rows = selectPropPrices(probe({ lines: [line("draftkings", -111, -113), line("fanduel", +100, -140)] }));
  assert.equal(rows.length, 1, "one row per (event, player, family) — never one per book");
  const [row] = rows;
  // the emitted pair must exist, intact, on the book that was named
  const source = [line("draftkings", -111, -113), line("fanduel", +100, -140)].find((c) => c.bookmaker === row.sportsbook);
  assert.equal(row.overOdds, source.overPrice, "the Over comes from the named book");
  assert.equal(row.underOdds, source.underPrice, "…and so does the Under");
  assert.equal(row.line, source.line, "…and so does the point");
});

test("anytime TD stays one-sided: a price, a book, and no invented opposite", () => {
  const rows = selectPropPrices(probe({ tds: [atd("fanduel", 150), atd("draftkings", -140)] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shape, "YES_ONLY");
  assert.equal(rows[0].sportsbook, "draftkings");
  assert.equal(rows[0].yesOdds, -140);
  for (const forbidden of ["underOdds", "overOdds", "noOdds", "line"]) {
    assert.equal(rows[0][forbidden], undefined, `a one-sided market must not grow a ${forbidden}`);
  }
});

test("each family is chosen on its own — DraftKings for one does not drag the other", () => {
  const rows = selectPropPrices(probe({
    lines: [line("fanduel", -111, -113)],   // DK absent here
    tds: [atd("draftkings", -140), atd("fanduel", 150)], // DK present here
  }));
  const byFamily = Object.fromEntries(rows.map((r) => [r.family, r.sportsbook]));
  assert.equal(byFamily.player_rush_yds, "fanduel");
  assert.equal(byFamily.anytime_td, "draftkings");
});

test("two events are two rows — a sweep never lets one event's id stand in for another's", () => {
  const other = { ...line("draftkings", -105, -115), canonicalEventId: "nfl-401872955" };
  const rows = selectPropPrices(probe({ lines: [line("draftkings", -111, -113), other] }));
  assert.deepEqual(rows.map((r) => r.canonicalEventId).sort(), ["nfl-401872948", "nfl-401872955"]);
});

test("one book, two points: the choice is total, reproducible and COUNTED", () => {
  const low = { ...line("draftkings", -111, -113), line: 71.5 };
  const high = { ...line("draftkings", -105, -115), line: 78.5 };
  const rows = selectPropPrices(probe({ lines: [high, low] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].line, 71.5, "lowest point first — a rule, not the provider's ordering");
  assert.equal(rows[0].overOdds, -111, "the prices travel with the point that was chosen");
  assert.equal(rows[0].linesOffered, 2, "a row where the choice MATTERED must say so, or it is a silent decision");
  assert.equal(selectPropPrices(probe({ lines: [low, high] }))[0].line, 71.5, "…and it does not depend on input order");
});

test("nothing complete ⇒ no row at all; an absent price is a state, never a gap to fill", () => {
  assert.deepEqual(selectPropPrices(probe({})), []);
  assert.deepEqual(selectPropPrices({ lineProps: null, anytimeTd: null }), []);
});

test("rankBooks orders by coverage then key, and never looks at a price", () => {
  const rows = [line("zzz_book", 999, 999), line("betmgm", -110, -110), { ...line("betmgm", -110, -110), line: 71.5 }];
  assert.deepEqual(rankBooks(rows), ["betmgm", "zzz_book"], "two rows beat one; the 999 pays best and is still last");
});

/*
 * THE SOURCE-LEVEL BANS THAT SURVIVE, because they are about what must NEVER be written rather
 * than about what the function returns. They are scanned over the MODULE now, not the script.
 */
test("no blending, and no -110 anywhere in the selection code", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/odds/prop-display-selection.mjs"), "utf8");
  for (const banned of ["medianOf", "twoWayConsensus", "average", "consensusPrice"]) {
    assert.ok(!src.includes(banned), `${banned} must not build a DISPLAYED prop price — a blended number has no book to attribute it to`);
  }
  /* ⚠ Scan CODE, not prose: the comments promise not to default to -110, so a naive search for the
     literal matches the sentence making the promise. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/-110/.test(code), "a missing side must never be defaulted to -110 in code");
  assert.ok(!/\bprice\b[^\n]*[<>]|[<>][^\n]*\bprice\b/.test(code.replace(/overPrice|underPrice/g, "x")),
    "nothing in the ladder may COMPARE prices — that is line shopping, and it is not the agreed policy");
});

test("the capture still uses this module rather than a private copy", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  assert.match(script, /from "\.\.\/\.\.\/src\/lib\/sports\/odds\/prop-display-selection\.mjs"/,
    "the canonical capture must import the policy, not re-declare one beside it");
  assert.ok(!/function selectPropPrices\(/.test(script), "a second copy of the selector is a second policy");
});
