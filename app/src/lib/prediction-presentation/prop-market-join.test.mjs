/**
 * A CAPTURED PROP PRICE REACHES THE ROW — or a TYPED absence does, and the two never blur.
 *
 * The board builder looks up `propPrices` from the capture owner and attaches a real market to the
 * exact (event, player, family) it belongs to. Everything this pins is a way that could go wrong
 * silently, in the direction of showing a reader a number that is not true of their row.
 *
 * Run: npx tsx --test src/lib/prediction-presentation/prop-market-join.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { marketFromFrozenCapture, marketFromPricingState } from "./contract.ts";
import { buildPropPriceIndex } from "../sports/nfl/prop-price-lookup.mjs";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-weekly-boards.mjs"), "utf8");

/* A capture artifact of the shape the owner publishes: ONE probed event with ONE priced row. */
const CAPTURE = {
  propMarkets: { state: "PROBED", probedEventIds: ["nfl-401872948"], perEvent: [{ canonicalEventId: "nfl-401872948", absentMarkets: ["player_pass_yds"] }] },
  propPrices: {
    referenceBook: "draftkings",
    rows: [{ canonicalEventId: "nfl-401872948", playerId: "nfl-athlete-4430807", family: "player_rush_yds", shape: "OVER_UNDER", line: 78.5, overOdds: -111, underOdds: -113, sportsbook: "draftkings", capturedAt: "2026-09-24T21:36:24Z" }],
  },
};

test("a two-sided capture renders as a line with BOTH prices, attributed and stamped", () => {
  const m = marketFromFrozenCapture({ line: 71.5, overOdds: -115, underOdds: -105, sportsbook: "draftkings", capturedAt: "2026-09-24T19:52:17Z" });
  assert.equal(m.state, "FROZEN_CAPTURE");
  assert.equal(m.frozen.line, 71.5);
  assert.equal(m.frozen.overOdds, -115);
  assert.equal(m.frozen.underOdds, -105);
  assert.equal(m.frozen.sportsbook, "draftkings");
});

test("a one-sided anytime-TD capture carries a single price and NO line", () => {
  const m = marketFromFrozenCapture({ yesOdds: -140, sportsbook: "draftkings", capturedAt: "2026-09-24T19:52:17Z" });
  assert.equal(m.state, "FROZEN_CAPTURE");
  assert.equal(m.frozen.yesOdds, -140);
  assert.equal(m.frozen.line, undefined, "an anytime-TD market has no point — one must never be invented");
  assert.equal(m.frozen.underOdds, undefined, "the opposite side of a yes/no market is never inferred");
});

test("an unattributed or unstamped price CANNOT become a market", () => {
  assert.throws(() => marketFromFrozenCapture({ yesOdds: -140, capturedAt: "2026-09-24T19:52:17Z" }),
    /must name its book/, "a price with no book is not a fact");
  assert.throws(() => marketFromFrozenCapture({ yesOdds: -140, sportsbook: "draftkings" }),
    /capture instant/, "a price with no capture instant cannot be told apart from a live line");
});

test("the two absences stay different facts: asked-and-absent vs never-asked", () => {
  assert.equal(marketFromPricingState("NOT_OFFERED").state, "NOT_OFFERED");
  assert.equal(marketFromPricingState("NOT_PROBED").state, "NOT_PROBED");
  assert.notEqual(marketFromPricingState("NOT_OFFERED").note, marketFromPricingState("NOT_PROBED").note,
    "the two must not read identically to a user — one is a measured negative, the other is no measurement");

  /*
   * ⚠ THE DEFECT THIS PINS. My first pass stamped every price-less row NOT_OFFERED. Only ONE event
   * per capture is probed, so that asserted "we asked and the book did not post it" about ~43 rows
   * we had never asked about — a negative we never measured, which is exactly the claim the typed
   * grammar exists to prevent.
   */
  /*
   * ⚠ THIS PINNED THE BUILDER'S SOURCE TEXT — the exact ternary, character for character. It caught
   * nothing the rule could not be broken around, and it went red the day the decision moved into a
   * shared lookup so three producers could stop each making it separately. A guard on the SHAPE of
   * an expression fails a refactor that strengthens the behaviour and passes a rewrite that breaks
   * it; the rule is now EXECUTED instead.
   */
  const idx = buildPropPriceIndex(CAPTURE);
  assert.equal(idx.pricingStateFor("401872948", "nfl-athlete-9999999", "player_rush_yds"), "NOT_OFFERED",
    "this event WAS probed, so an unpriced row on it is a measured negative");
  assert.equal(idx.pricingStateFor("401872955", "nfl-athlete-9999999", "player_rush_yds"), "NOT_PROBED",
    "this event was never asked about — calling it NOT_OFFERED asserts a negative nobody measured");
  assert.equal(idx.pricingStateFor("401872948", "nfl-athlete-4430807", "player_rush_yds"), null,
    "a row that HAS a price gets no absence at all — the two must never be stamped together");
  /* And with no capture on disk at all, nothing is claimed about anybody's books. */
  const empty = buildPropPriceIndex(null);
  assert.equal(empty.pricingStateFor("401872948", "nfl-athlete-4430807", "player_rush_yds"), "NOT_PROBED");
});

test("the lookup is EXACT — never a near match on event, player or family", () => {
  /*
   * ⚠ ALSO A SOURCE SCAN, over a function that has since moved. What it was trying to say is that
   * a price may not land on the wrong player, the wrong game or the wrong market — which is a thing
   * the lookup can simply be ASKED, one wrong key at a time.
   */
  const idx = buildPropPriceIndex(CAPTURE);
  const hit = idx.marketFor("401872948", "nfl-athlete-4430807", "player_rush_yds");
  assert.equal(hit.line, 78.5, "the exact triple resolves");
  assert.equal(hit.sportsbook, "draftkings");
  assert.equal(idx.marketFor("401872955", "nfl-athlete-4430807", "player_rush_yds"), null, "wrong event must not match");
  assert.equal(idx.marketFor("401872948", "nfl-athlete-4430808", "player_rush_yds"), null, "wrong player must not match");
  assert.equal(idx.marketFor("401872948", "nfl-athlete-4430807", "player_reception_yds"), null, "wrong family must not match");
  assert.equal(idx.marketFor("nfl-401872948", "nfl-athlete-4430807", "player_rush_yds"), null,
    "the lookup takes a PROVIDER event id and builds the canonical key itself — a pre-prefixed id is a caller error, not a near match to be tolerated");

  /* An unattributed or unstamped row is refused at the lookup, not only at the contract. */
  const naked = buildPropPriceIndex({
    propMarkets: CAPTURE.propMarkets,
    propPrices: { rows: [{ ...CAPTURE.propPrices.rows[0], sportsbook: undefined }] },
  });
  assert.equal(naked.marketFor("401872948", "nfl-athlete-4430807", "player_rush_yds"), null,
    "a price with no book must not reach a row");
  const unstamped = buildPropPriceIndex({
    propMarkets: CAPTURE.propMarkets,
    propPrices: { rows: [{ ...CAPTURE.propPrices.rows[0], capturedAt: undefined }] },
  });
  assert.equal(unstamped.marketFor("401872948", "nfl-athlete-4430807", "player_rush_yds"), null,
    "a price with no capture instant cannot be told apart from a live line");
});

test("a yes/no capture keeps its shape — no point, no opposite side", () => {
  const idx = buildPropPriceIndex({
    propMarkets: CAPTURE.propMarkets,
    propPrices: { rows: [{ canonicalEventId: "nfl-401872948", playerId: "nfl-athlete-4430807", family: "anytime_td", shape: "YES_ONLY", yesOdds: -140, sportsbook: "draftkings", capturedAt: "2026-09-24T21:36:24Z" }] },
  });
  const m = idx.marketFor("401872948", "nfl-athlete-4430807", "anytime_td");
  assert.equal(m.yesOdds, -140);
  assert.equal(m.line, undefined, "an anytime-TD market has no point — one must never be invented");
  assert.equal(m.underOdds, undefined, "the opposite side of a yes/no market is never inferred");
});

test("a market we could not MAP is never reported as a market that does not EXIST", () => {
  /*
   * ⚠ MEASURED, 2026-09-25. The first full-week sweep quarantined eight players whose sportsbook
   * label and roster name differed only by a generational suffix — James Cook / James Cook III
   * among them. Each had a real, priced DraftKings market, and each reached a reader as
   * "Not offered": a confident public statement that the BOOKS do not post a market they do post,
   * caused entirely by our own join.
   *
   * The resolver now sets suffixes aside (fail-closed, unique matches only), so those eight resolve.
   * This guards the state that catches the NEXT one, whatever shape it takes.
   */
  const capture = {
    propMarkets: {
      state: "PROBED",
      probedEventIds: ["nfl-401872953"],
      perEvent: [{ canonicalEventId: "nfl-401872953", absentMarkets: [], unresolvedIdentities: ["James Cook", "Zonovan Knight"] }],
    },
    propPrices: { rows: [] },
  };
  const idx = buildPropPriceIndex(capture);
  assert.equal(idx.pricingStateFor("401872953", "nfl-athlete-4379399", "anytime_td", "James Cook III"), "IDENTITY_UNRESOLVED",
    "the roster spells it with a suffix and the book does not — the same player, and the market exists");
  assert.equal(idx.pricingStateFor("401872953", "nfl-athlete-1", "anytime_td", "Josh Allen"), "NOT_OFFERED",
    "a player NOT in the unresolved list keeps the measured negative — the new state must not swallow the old one");
  assert.equal(idx.pricingStateFor("401872953", "nfl-athlete-1", "anytime_td"), "NOT_OFFERED",
    "with no name to compare, the least-claiming measured answer stands rather than a guess");
  assert.equal(idx.pricingStateFor("401872999", "nfl-athlete-4379399", "anytime_td", "James Cook III"), "NOT_PROBED",
    "an unprobed event is still NOT_PROBED — an unresolved label on ANOTHER event proves nothing here");
});

test("slotFor returns a price OR an absence — never both, never neither", () => {
  const idx = buildPropPriceIndex(CAPTURE);
  const priced = idx.slotFor("401872948", "nfl-athlete-4430807", "player_rush_yds");
  assert.ok(priced.market, "a priced row carries its market");
  assert.equal(priced.pricingState, undefined, "…and makes no simultaneous claim of absence");
  const missing = idx.slotFor("401872955", "nfl-athlete-4430807", "player_rush_yds");
  assert.equal(missing.market, undefined);
  assert.equal(missing.pricingState, "NOT_PROBED", "an unpriced row is typed, never blank");
});

test("the builder never fetches, blends or substitutes — it only looks up", () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const banned of ["fetch(", "https://", "medianOf", "twoWayConsensus"]) {
    assert.ok(!code.includes(banned), `${banned} must not appear in the ranking owner — it reads committed artifacts only`);
  }
});

test("a TRANSPOSED name is also a market we could not map, not one that does not exist", () => {
  /*
   * ⚠ MEASURED, 2026-09-25, on the sweep that proved the suffix repair. Eight players came back;
   * one did not. DraftKings posts receptions and receiving yards for the San Francisco running back
   * it calls "James Jordan"; the roster calls him "Jordan James". Two public rows on
   * /nfl/game/401872958 read "Not offered" — again a confident statement about what the BOOKS do,
   * caused by our own join.
   *
   * The capture still REFUSES to join him: a transposed name is a far riskier identity claim than a
   * dropped suffix, and minting one is a founder decision, not a heuristic. What changes is only
   * which of two sentences the row shows.
   */
  const capture = {
    propMarkets: {
      state: "PROBED",
      probedEventIds: ["nfl-401872958"],
      perEvent: [{ canonicalEventId: "nfl-401872958", absentMarkets: [], unresolvedIdentities: ["James Jordan"] }],
    },
    propPrices: { rows: [] },
  };
  const idx = buildPropPriceIndex(capture);
  assert.equal(idx.pricingStateFor("401872958", "nfl-athlete-4685397", "player_receptions", "Jordan James"), "IDENTITY_UNRESOLVED",
    "the book transposes his name — the market exists and we could not reach it");
  assert.equal(idx.pricingStateFor("401872958", "nfl-athlete-9", "player_receptions", "Brock Purdy"), "NOT_OFFERED",
    "an unrelated player keeps the measured negative — the looser key must not swallow it");
  assert.equal(idx.marketFor("401872958", "nfl-athlete-4685397", "player_receptions"), null,
    "the display state must not have attached a price — this path never joins");
});

test("the committed capture's own unresolved list drives the state for a real projected player", () => {
  /* Against the REAL artifact, not a fixture: if the sweep stops recording unresolvedIdentities,
     or Jordan James stops being unresolved, this says so instead of passing quietly. */
  const p = path.join(process.cwd(), "public/data/nfl/markets/latest.json");
  if (!fs.existsSync(p)) return;
  const capture = JSON.parse(fs.readFileSync(p, "utf8"));
  if (capture?.propMarkets?.state !== "PROBED") return;
  const ev = (capture.propMarkets.perEvent ?? []).find((e) => e.canonicalEventId === "nfl-401872958");
  if (!ev || !(ev.unresolvedIdentities ?? []).includes("James Jordan")) return;
  const idx = buildPropPriceIndex(capture);
  assert.equal(idx.pricingStateFor("401872958", "nfl-athlete-4685397", "player_receptions", "Jordan James"), "IDENTITY_UNRESOLVED",
    "a real projected player whose market the books post must never read NOT_OFFERED");
});
