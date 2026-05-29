/**
 * Tests for the strict (odds + legs both must match) risk-section
 * classifier introduced in PR `fix/public-risk-range-leg-counts`.
 *
 * Lock the user-specified boundaries:
 *   Low      <  +300 · 2–3 legs
 *   Medium   +300 – +599 · 3–4 legs
 *   High     +600 – +999 · 4–5 legs
 *   Longshot ≥ +1000 · 5–6 legs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RISK_SECTION_ORDER,
  classifyOddsSection,
  classifyRiskSection,
  classifySlipBySection,
  combinedAmericanOddsFromLegs,
  getRiskSectionDisplay,
  groupSlipsByRiskSection,
} from "./parlay-risk-sections.ts";

test("RISK_SECTION_ORDER: Low → Medium → High → Longshot", () => {
  assert.deepEqual(
    [...RISK_SECTION_ORDER],
    ["low", "medium", "high", "longshot"],
  );
});

test("classifyOddsSection: half-open boundaries (no double-counting)", () => {
  assert.equal(classifyOddsSection(-200), "low");
  assert.equal(classifyOddsSection(299), "low");
  assert.equal(classifyOddsSection(300), "medium");
  assert.equal(classifyOddsSection(599), "medium");
  assert.equal(classifyOddsSection(600), "high");
  assert.equal(classifyOddsSection(999), "high");
  assert.equal(classifyOddsSection(1000), "longshot");
  assert.equal(classifyOddsSection(5000), "longshot");
});

test("classifyOddsSection: missing odds → null", () => {
  assert.equal(classifyOddsSection(null), null);
  assert.equal(classifyOddsSection(undefined), null);
  assert.equal(classifyOddsSection(Number.NaN), null);
  assert.equal(classifyOddsSection(Number.POSITIVE_INFINITY), null);
});

test("classifySlipBySection: +299 with 2 legs → Low", () => {
  assert.equal(classifySlipBySection(299, 2), "low");
});

test("classifySlipBySection: +299 with 4 legs → null (leg count out of Low range)", () => {
  assert.equal(classifySlipBySection(299, 4), null);
});

test("classifySlipBySection: +300 with 3 legs → Medium", () => {
  assert.equal(classifySlipBySection(300, 3), "medium");
});

test("classifySlipBySection: +599 with 4 legs → Medium", () => {
  assert.equal(classifySlipBySection(599, 4), "medium");
});

test("classifySlipBySection: +600 with 4 legs → High", () => {
  assert.equal(classifySlipBySection(600, 4), "high");
});

test("classifySlipBySection: +999 with 5 legs → High", () => {
  assert.equal(classifySlipBySection(999, 5), "high");
});

test("classifySlipBySection: +1000 with 5 legs → Longshot", () => {
  assert.equal(classifySlipBySection(1000, 5), "longshot");
});

test("classifySlipBySection: +1000 with 4 legs → null (4 is below Longshot's 5-leg floor)", () => {
  assert.equal(classifySlipBySection(1000, 4), null);
});

test("classifySlipBySection: +500 with 2 legs → null (2 below Medium's 3-leg floor)", () => {
  assert.equal(classifySlipBySection(500, 2), null);
});

test("classifySlipBySection: negative odds with 2 legs → Low", () => {
  assert.equal(classifySlipBySection(-150, 2), "low");
});

test("classifySlipBySection: null odds → null (no fabricated section)", () => {
  assert.equal(classifySlipBySection(null, 3), null);
});

test("classifySlipBySection: non-integer / negative leg count → null", () => {
  assert.equal(classifySlipBySection(500, 0), null);
  assert.equal(classifySlipBySection(500, -1), null);
  assert.equal(classifySlipBySection(500, 2.5), null);
});

test("getRiskSectionDisplay: labels match the user spec; no 'safe'/'safety'", () => {
  const banned = ["safe", "safety", "guaranteed", "lock", "no-brainer"];
  for (const key of RISK_SECTION_ORDER) {
    const d = getRiskSectionDisplay(key);
    const haystack = `${d.label} ${d.subtitle} ${d.oddsRange} ${d.legRange}`.toLowerCase();
    for (const word of banned) {
      assert.equal(
        haystack.includes(word),
        false,
        `section ${key} contains banned word "${word}"`,
      );
    }
  }
  assert.equal(getRiskSectionDisplay("low").label, "Low Risk");
  assert.equal(getRiskSectionDisplay("low").oddsRange, "under +300");
  assert.equal(getRiskSectionDisplay("low").legRange, "2–3 legs");
  assert.equal(getRiskSectionDisplay("medium").legRange, "3–4 legs");
  assert.equal(getRiskSectionDisplay("high").legRange, "4–5 legs");
  assert.equal(getRiskSectionDisplay("longshot").legRange, "5–6 legs");
});

test("combinedAmericanOddsFromLegs: any null leg → null", () => {
  assert.equal(
    combinedAmericanOddsFromLegs([
      { oddsForSide: -110 },
      { oddsForSide: null },
    ]),
    null,
  );
});

test("groupSlipsByRiskSection: strict alignment + excluded bucket", () => {
  const slips = [
    // -150 + -110 → ~+200 combined, 2 legs → Low aligned
    { legs: [{ oddsForSide: -150 }, { oddsForSide: -110 }] },
    // +300 with 4 legs at +50ish each? Actually craft a 3-leg Medium: -110 × -110 × -110 = ~+545
    { legs: [{ oddsForSide: -110 }, { oddsForSide: -110 }, { oddsForSide: -110 }] },
    // 4 legs at -110 → 1.91^4 = 13.34 → +1234 (Longshot range), but only 4 legs → excluded (Longshot needs ≥5)
    { legs: [{ oddsForSide: -110 }, { oddsForSide: -110 }, { oddsForSide: -110 }, { oddsForSide: -110 }] },
    // 5-leg longshot: 5 × -110 → 1.91^5 = 25.48 → +2448, aligned to Longshot
    {
      legs: [
        { oddsForSide: -110 },
        { oddsForSide: -110 },
        { oddsForSide: -110 },
        { oddsForSide: -110 },
        { oddsForSide: -110 },
      ],
    },
    // 2-leg with one null leg → odds null → excluded
    { legs: [{ oddsForSide: -110 }, { oddsForSide: null }] },
  ];
  const { sections, excluded } = groupSlipsByRiskSection(slips);
  const sectionCounts = Object.fromEntries(
    sections.map((s) => [s.section, s.slips.length]),
  );
  assert.equal(sectionCounts.low, 1, "expected 1 aligned Low slip");
  assert.equal(sectionCounts.medium, 1, "expected 1 aligned Medium slip");
  assert.equal(sectionCounts.high, 0);
  assert.equal(sectionCounts.longshot, 1, "expected 1 aligned Longshot");
  // 4-leg @ +1234 (Longshot odds but only 4 legs) → excluded.
  // Null-odds slip → excluded.
  assert.equal(excluded.length, 2);
});

test("classifyRiskSection (back-compat shim): odds-only classification", () => {
  // Used by the per-card chip (lane label). +700 always reads "High"
  // even when leg count would block strict section assignment.
  assert.equal(classifyRiskSection(150), "low");
  assert.equal(classifyRiskSection(400), "medium");
  assert.equal(classifyRiskSection(700), "high");
  assert.equal(classifyRiskSection(1500), "longshot");
  assert.equal(classifyRiskSection(null), "low");
});
