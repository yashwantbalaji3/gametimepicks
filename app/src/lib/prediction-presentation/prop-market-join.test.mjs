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

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-weekly-boards.mjs"), "utf8");

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
  assert.match(SRC, /probedEventIds\.has\(`nfl-\$\{b\.providerEventId\}`\) \? "NOT_OFFERED" : "NOT_PROBED"/,
    "the builder must decide the absence from whether THIS event was probed");
});

test("the lookup is EXACT — never a near match on event, player or family", () => {
  const fn = /function capturedMarketFor\([\s\S]*?\n\}/.exec(SRC)?.[0];
  assert.ok(fn, "capturedMarketFor is no longer identifiable — this guard would scan nothing");
  assert.match(fn, /`nfl-\$\{providerEventId\}\|\$\{playerId\}\|\$\{family\}`/,
    "the key must be all three, so a price cannot land on the wrong player, game or market");
  assert.match(fn, /if \(!r\.sportsbook \|\| !r\.capturedAt\) return null/,
    "an unattributed row must be refused at the lookup too, not only at the contract");
});

test("the builder never fetches, blends or substitutes — it only looks up", () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const banned of ["fetch(", "https://", "medianOf", "twoWayConsensus"]) {
    assert.ok(!code.includes(banned), `${banned} must not appear in the ranking owner — it reads committed artifacts only`);
  }
});
