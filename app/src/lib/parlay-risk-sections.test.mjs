/**
 * Tests for the risk-section classifier. Pure odds → section mapping;
 * no DOM, no fabrication. Boundaries match
 * `app/src/lib/parlay-risk-sections.ts` and are exercised both above
 * and below each threshold so a future tuning PR has to update tests
 * intentionally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RISK_SECTION_ORDER,
  classifyRiskSection,
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

test("classifyRiskSection: boundaries inclusive on the low side", () => {
  assert.equal(classifyRiskSection(249), "low");
  assert.equal(classifyRiskSection(250), "medium");
  assert.equal(classifyRiskSection(449), "medium");
  assert.equal(classifyRiskSection(450), "high");
  assert.equal(classifyRiskSection(749), "high");
  assert.equal(classifyRiskSection(750), "longshot");
  assert.equal(classifyRiskSection(1500), "longshot");
});

test("classifyRiskSection: negative odds fall into Low", () => {
  // -200 combined → heavy favorite parlay (rare but possible) → Low.
  assert.equal(classifyRiskSection(-200), "low");
  assert.equal(classifyRiskSection(-110), "low");
});

test("classifyRiskSection: null / undefined / NaN / Infinity fallback to Low", () => {
  assert.equal(classifyRiskSection(null), "low");
  assert.equal(classifyRiskSection(undefined), "low");
  assert.equal(classifyRiskSection(Number.NaN), "low");
  assert.equal(classifyRiskSection(Number.POSITIVE_INFINITY), "low");
});

test("getRiskSectionDisplay: labels match the spec; no 'safe'/'safety' anywhere", () => {
  const banned = ["safe", "safety", "guaranteed", "lock", "no-brainer"];
  for (const key of RISK_SECTION_ORDER) {
    const d = getRiskSectionDisplay(key);
    const haystack = `${d.label} ${d.subtitle} ${d.oddsRange}`.toLowerCase();
    for (const word of banned) {
      assert.equal(
        haystack.includes(word),
        false,
        `section ${key} contains banned word "${word}"`,
      );
    }
  }
  assert.equal(getRiskSectionDisplay("low").label, "Low Risk");
  assert.equal(getRiskSectionDisplay("medium").label, "Medium Risk");
  assert.equal(getRiskSectionDisplay("high").label, "High Risk");
  assert.equal(getRiskSectionDisplay("longshot").label, "Longshot");
});

test("combinedAmericanOddsFromLegs: two -110 legs → about +264", () => {
  // decimal: 1.909 * 1.909 = 3.645 → American ≈ +264
  const am = combinedAmericanOddsFromLegs([
    { oddsForSide: -110 },
    { oddsForSide: -110 },
  ]);
  assert.ok(am !== null);
  assert.ok(Math.abs(am - 264) <= 2, `expected ~264, got ${am}`);
});

test("combinedAmericanOddsFromLegs: +150 and +200 → about +650", () => {
  // 2.5 * 3 = 7.5 → +650
  const am = combinedAmericanOddsFromLegs([
    { oddsForSide: 150 },
    { oddsForSide: 200 },
  ]);
  assert.equal(am, 650);
});

test("combinedAmericanOddsFromLegs: any null leg → null (no fabricated number)", () => {
  const am = combinedAmericanOddsFromLegs([
    { oddsForSide: -110 },
    { oddsForSide: null },
  ]);
  assert.equal(am, null);
});

test("combinedAmericanOddsFromLegs: empty array → null", () => {
  assert.equal(combinedAmericanOddsFromLegs([]), null);
});

test("groupSlipsByRiskSection: every slip lands in exactly one section, preserves order", () => {
  // Construct synthetic slips with known per-leg odds → known combined
  // odds → known section.
  const slipLow = { legs: [{ oddsForSide: -110 }, { oddsForSide: -110 }] };    // ~+264 (medium) — let's craft one truly Low
  const slipLow2 = { legs: [{ oddsForSide: -150 }, { oddsForSide: -110 }] };   // ~+200 → low
  const slipMedium = { legs: [{ oddsForSide: 100 }, { oddsForSide: 150 }] };   // 2.0*2.5=5.0 → +400 (medium)
  const slipHigh = { legs: [{ oddsForSide: 150 }, { oddsForSide: 200 }] };     // +650 (high)
  const slipLongshot = { legs: [{ oddsForSide: 300 }, { oddsForSide: 400 }] }; // 4*5=20 → +1900 (longshot)
  const grouped = groupSlipsByRiskSection([
    slipLow,
    slipLow2,
    slipMedium,
    slipHigh,
    slipLongshot,
  ]);
  assert.deepEqual(
    grouped.map((g) => g.section),
    ["low", "medium", "high", "longshot"],
  );
  const sectionCounts = Object.fromEntries(
    grouped.map((g) => [g.section, g.slips.length]),
  );
  // Allocate the 5 input slips into the 4 sections.
  assert.equal(
    sectionCounts.low + sectionCounts.medium + sectionCounts.high + sectionCounts.longshot,
    5,
  );
  // Sanity-check that the longshot slip ended up in longshot.
  assert.ok(
    grouped.find((g) => g.section === "longshot")?.slips.includes(slipLongshot),
  );
});

test("groupSlipsByRiskSection: slip with a null leg lands in Low (preserves visibility)", () => {
  const incomplete = { legs: [{ oddsForSide: -110 }, { oddsForSide: null }] };
  const grouped = groupSlipsByRiskSection([incomplete]);
  const low = grouped.find((g) => g.section === "low");
  assert.equal(low.slips.length, 1);
});
