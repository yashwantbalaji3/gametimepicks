/**
 * Card-population guards (Program 197 · Release A1) — the counts that would have caught the
 * 7-of-13 truncated card the week it happened.
 *
 * Run: npx tsx --test src/lib/sports/ufc/card-population.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileCardPopulation } from "./card-population.mjs";

const authority = (bouts) => ({ providerEventId: "600060620", name: "Fixture Night", bouts });
const cardOf = (bouts, skipped = []) => ({ event: { providerEventId: "600060620", name: "Fixture Night", slateDate: "2026-08-29" }, bouts, skippedForCoverage: skipped });
const bout = (red, blue, over = {}) => ({ boutId: `2026-08-29:${red}|${blue}`.toLowerCase(), red: { name: red }, blue: { name: blue }, prediction: { winner: red }, ...over });

test("a bout the provider lists and the card lacks is MISSING — the truncated-card class, counted", () => {
  const out = reconcileCardPopulation({
    authoritative: authority([
      { providerBoutId: "1", red: "A One", blue: "B Two" },
      { providerBoutId: "2", red: "C Three", blue: "D Four" },
    ]),
    card: cardOf([bout("A One", "B Two")]),
  });
  assert.equal(out.counts.expected, 2);
  assert.equal(out.counts.missing, 1);
  assert.match(out.missing[0].pair, /C Three/);
  assert.equal(out.populationExact, false);
});

test("a bout on the card the provider does not list is PHANTOM — an invented bout is worse than a missing one", () => {
  const out = reconcileCardPopulation({
    authoritative: authority([{ providerBoutId: "1", red: "A One", blue: "B Two" }]),
    card: cardOf([bout("A One", "B Two"), bout("X Nine", "Y Ten")]),
  });
  assert.equal(out.counts.phantom, 1);
  assert.equal(out.populationExact, false);
});

test("the fighter-pair join is order-insensitive — the provider flips red/blue freely", () => {
  const out = reconcileCardPopulation({
    authoritative: authority([{ providerBoutId: "1", red: "B Two", blue: "A One" }]),
    card: cardOf([bout("A One", "B Two")]),
  });
  assert.equal(out.counts.missing, 0);
  assert.equal(out.counts.phantom, 0);
  assert.equal(out.populationExact, true);
});

test("a cross-event comparison refuses rather than reconciling the wrong card", () => {
  assert.throws(() => reconcileCardPopulation({
    authoritative: { providerEventId: "111", bouts: [] },
    card: cardOf([]),
  }), /cross-event/);
});

test("the input matrix types every absence — SPARSE history and a missing price are states, never zeros", () => {
  const out = reconcileCardPopulation({
    authoritative: authority([
      { providerBoutId: "1", red: "A One", blue: "B Two" },
      { providerBoutId: "2", red: "C Three", blue: "D Four" },
    ]),
    card: cardOf([
      bout("A One", "B Two"),
      bout("C Three", "D Four", { prediction: null, unmodelledReason: "SPARSE: fewer than N UFC bouts of history" }),
    ]),
    snapshot: { rows: [{ providerBoutId: "1" }] },
  });
  const [read, unmodelled] = out.inputMatrix;
  assert.equal(read.inputs.fighterHistory, "AVAILABLE");
  assert.equal(read.inputs.marketPrice, "AVAILABLE");
  assert.equal(unmodelled.inputs.fighterHistory, "SPARSE");
  assert.equal(unmodelled.inputs.marketPrice, "MISSING");
  assert.equal(unmodelled.read, "UNMODELLED");
  assert.equal(read.inputs.weighIns, "UNSUPPORTED", "an unlicensed input is typed as UNSUPPORTED, never guessed");
  assert.equal(out.counts.priced, 1);
});
