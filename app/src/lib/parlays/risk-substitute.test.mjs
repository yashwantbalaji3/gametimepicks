/**
 * Risk-substitute rule guards (Program 196 · Release B2) — the ONE owner both surfaces call.
 *
 * Run: npx tsx --test src/lib/parlays/risk-substitute.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { calmestAvailableBand, substituteDirection, directionSentence, substituteOffer } from "./risk-substitute.mjs";
import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";

const ORDER = RISK_ORDER;

test("the substitute is the CALMEST available band, never the next rung up", () => {
  assert.equal(calmestAvailableBand(ORDER, ["high", "medium", "longshot"]), "medium");
  assert.equal(calmestAvailableBand(ORDER, []), null);
});

test("direction derives from the order — never asserted", () => {
  assert.equal(substituteDirection(ORDER, "low", "medium"), "RISKIER");
  assert.equal(substituteDirection(ORDER, "high", "medium"), "CALMER");
  assert.equal(substituteDirection(ORDER, "medium", "medium"), "SAME");
  assert.equal(substituteDirection(ORDER, "nope", "medium"), null);
  assert.match(directionSentence("RISKIER"), /more risk/);
  assert.match(directionSentence("CALMER"), /less risk/);
});

test("rule 1: a band that has a card is never offered a substitute", () => {
  assert.equal(substituteOffer({ riskOrder: ORDER, availableBands: ["low", "medium"], emptyBand: "low" }), null);
});

test("an empty board offers nothing — there is nothing to point at", () => {
  assert.equal(substituteOffer({ riskOrder: ORDER, availableBands: [], emptyBand: "low" }), null);
});

test("the measured cause travels with the offer when supplied, and the note derives its direction", () => {
  const withCause = substituteOffer({
    riskOrder: ORDER, availableBands: ["medium", "high"], emptyBand: "low",
    measuredCause: "no combination of today's prices lands in this band — 2 legs → +110 (medium)",
  });
  assert.equal(withCause.offered, "medium");
  assert.equal(withCause.direction, "RISKIER");
  assert.match(withCause.note, /2 legs → \+110/, "the ladder's own measurement is quoted, not summarised away");
  assert.match(withCause.note, /more risk/, "direction is stated in the reader's terms");

  const calmer = substituteOffer({ riskOrder: ORDER, availableBands: ["low"], emptyBand: "high" });
  assert.equal(calmer.direction, "CALMER");
  assert.match(calmer.note, /less risk/, "a calmer swap must not claim to be riskier — the hardcoded wording this owner replaced");
});

test("PREFIX-SCOPE INVARIANT: for a tier whose scope is a prefix of the order, an empty scope's substitute is always riskier", () => {
  // The /build grid's old hardcoded wording depended on this without stating it. Stated and proven:
  // if a scope [0..k] has no cards, every available band sits beyond k, so the calmest available is
  // beyond the scope's own calmest band.
  for (let k = 0; k < ORDER.length - 1; k += 1) {
    const scope = ORDER.slice(0, k + 1);
    const available = ORDER.slice(k + 1); // scope empty ⇒ cards only beyond it
    const offered = calmestAvailableBand(ORDER, available);
    assert.equal(substituteDirection(ORDER, scope[0], offered), "RISKIER", `scope=[${scope}] offered=${offered}`);
  }
});
