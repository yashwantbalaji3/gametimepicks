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
  countDisplaySlips,
  getDisplaySectionBuckets,
  getRiskSectionDisplay,
  getRiskSectionDisplaySummary,
  getEmptySectionReason,
  groupSlipsByRiskSection,
} from "./parlay-risk-sections.ts";

/** Build a slip with `legCount` legs each priced at `odds` (American). */
function mkSlip(slipId, legCount, odds) {
  return {
    slipId,
    legs: Array.from({ length: legCount }, () => ({ oddsForSide: odds })),
  };
}

/*
 * P241 · A13 — THE SECTION BANDS ARE THE CANONICAL PARLAY_ODDS_BANDS NOW. This suite used to pin
 * a private fourth band table (low <+300, medium 300-599, …) plus a leg-count gate that silently
 * dropped real cards. The same +206 two-leg card read "Low Risk" here and Medium on the risk
 * ladder beside it. The pins below assert the canonical bounds (low -200..+100, medium ..+300,
 * high ..+600, longshot 600+), odds-only classification, and legs as description, never a gate.
 */
test("RISK_SECTION_ORDER: Low → Medium → High → Longshot", () => {
  assert.deepEqual(
    [...RISK_SECTION_ORDER],
    ["low", "medium", "high", "longshot"],
  );
});

test("classifyOddsSection: canonical-band boundaries (no double-counting)", () => {
  assert.equal(classifyOddsSection(-200), "low");
  assert.equal(classifyOddsSection(100), "low");
  assert.equal(classifyOddsSection(101), "medium");
  assert.equal(classifyOddsSection(300), "medium");
  assert.equal(classifyOddsSection(301), "high");
  assert.equal(classifyOddsSection(600), "high");
  assert.equal(classifyOddsSection(601), "longshot");
  assert.equal(classifyOddsSection(5000), "longshot");
});

test("classifyOddsSection: missing odds → null", () => {
  assert.equal(classifyOddsSection(null), null);
  assert.equal(classifyOddsSection(undefined), null);
  assert.equal(classifyOddsSection(Number.NaN), null);
  assert.equal(classifyOddsSection(Number.POSITIVE_INFINITY), null);
});

test("classifySlipBySection: +299 with 2 legs → Medium (the canonical band, matching the ladder)", () => {
  assert.equal(classifySlipBySection(299, 2), "medium");
});

test("classifySlipBySection: legs never exclude a priced slip — description, not a gate", () => {
  assert.equal(classifySlipBySection(299, 4), "medium");
});

test("classifySlipBySection: +300 with 3 legs → Medium", () => {
  assert.equal(classifySlipBySection(300, 3), "medium");
});

test("classifySlipBySection: +599 with 4 legs → High (canonical band)", () => {
  assert.equal(classifySlipBySection(599, 4), "high");
});

test("classifySlipBySection: +600 with 4 legs → High (inclusive upper bound)", () => {
  assert.equal(classifySlipBySection(600, 4), "high");
});

test("classifySlipBySection: +999 with 5 legs → Longshot (canonical band)", () => {
  assert.equal(classifySlipBySection(999, 5), "longshot");
});

test("classifySlipBySection: +1000 with 5 legs → Longshot", () => {
  assert.equal(classifySlipBySection(1000, 5), "longshot");
});

test("classifySlipBySection: +1000 with 4 legs → Longshot (legs are descriptive)", () => {
  assert.equal(classifySlipBySection(1000, 4), "longshot");
});

test("classifySlipBySection: +500 with 2 legs → High (never silently dropped)", () => {
  assert.equal(classifySlipBySection(500, 2), "high");
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
  assert.equal(getRiskSectionDisplay("low").oddsRange, "-200 to +100");
  assert.match(getRiskSectionDisplay("low").legRange, /^typically /);
  assert.match(getRiskSectionDisplay("medium").legRange, /^typically /);
  assert.match(getRiskSectionDisplay("high").legRange, /^typically /);
  assert.match(getRiskSectionDisplay("longshot").legRange, /^typically /);
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
  // Canonical bands, odds-only (P241 · A13): ~+200 → medium; ~+545 → high; both -110×4 (+1234)
  // and -110×5 (+2448) → longshot regardless of leg count. Only the null-odds slip is excluded —
  // legs never silently drop a priced card any more.
  assert.equal(sectionCounts.low ?? 0, 0);
  assert.equal(sectionCounts.medium, 1, "expected 1 Medium slip (~+200)");
  assert.equal(sectionCounts.high, 1, "expected 1 High slip (~+545)");
  assert.equal(sectionCounts.longshot, 2, "both longshot-priced slips stay visible");
  assert.equal(excluded.length, 1, "only the null-odds slip is excluded");
});

test("classifyRiskSection (back-compat shim): odds-only classification", () => {
  // Used by the per-card chip (lane label). +700 always reads "High"
  // even when leg count would block strict section assignment.
  assert.equal(classifyRiskSection(150), "medium");
  assert.equal(classifyRiskSection(400), "high");
  assert.equal(classifyRiskSection(700), "longshot");
  assert.equal(classifyRiskSection(1500), "longshot");
  assert.equal(classifyRiskSection(null), "low");
});

// ---------------------------------------------------------------------------
// Display buckets + count (powers the "Showing N parlays" summary line).
// The summary MUST derive from the same source the cards render from, so
// these lock that the count never disagrees with the rendered sections.
// ---------------------------------------------------------------------------

test("getDisplaySectionBuckets: server `sections` win and fill missing keys", () => {
  const a = mkSlip("a", 2, -150);
  const b = mkSlip("b", 3, -200);
  const buckets = getDisplaySectionBuckets({
    sections: { low: [a], medium: [b] },
    // `slips` must be IGNORED when sections are present:
    slips: [mkSlip("z", 6, 1200)],
  });
  assert.deepEqual(buckets.low.map((s) => s.slipId), ["a"]);
  assert.deepEqual(buckets.medium.map((s) => s.slipId), ["b"]);
  assert.deepEqual(buckets.high, []);
  assert.deepEqual(buckets.longshot, []);
});

test("countDisplaySlips: server sections → sum of section lengths", () => {
  const n = countDisplaySlips({
    sections: {
      low: [mkSlip("a", 2, -150)],
      medium: [mkSlip("b", 3, -200), mkSlip("c", 3, -200)],
    },
    slips: [mkSlip("z", 6, 1200), mkSlip("y", 6, 1300)], // ignored
  });
  assert.equal(n, 3);
});

test("countDisplaySlips: no sections → client bucketing counts every priced slip", () => {
  // Canonical bands, odds-only (P241 · A13): +125 → medium, +237 → medium, +77 → low.
  // Legs are descriptive; a priced slip is never silently dropped from the count.
  const n = countDisplaySlips({
    slips: [mkSlip("a", 2, -200), mkSlip("b", 3, -200), mkSlip("long", 6, -1000)],
  });
  assert.equal(n, 3);
});

test("countDisplaySlips: empty / absent inputs → 0", () => {
  assert.equal(countDisplaySlips({}), 0);
  assert.equal(countDisplaySlips({ slips: [] }), 0);
  assert.equal(countDisplaySlips({ sections: {} }), 0);
});

// --- empty-section clarity (PR 2) ------------------------------------------
test("getRiskSectionDisplaySummary counts cards + sections with/without cards", () => {
  // Low 3, Medium 2, High 0, Longshot 0 — the June-2 MLB-only shape.
  const buckets = {
    low: [1, 2, 3],
    medium: [1, 2],
    high: [],
    longshot: [],
  };
  const s = getRiskSectionDisplaySummary(buckets);
  assert.deepEqual(s, {
    displayedCards: 5,
    sectionsWithCards: 2,
    emptySections: 2,
    totalSections: 4,
  });
});

test("getRiskSectionDisplaySummary: all empty → 0 cards, 4 empty (no padding implied)", () => {
  const s = getRiskSectionDisplaySummary({ low: [], medium: [], high: [], longshot: [] });
  assert.equal(s.displayedCards, 0);
  assert.equal(s.sectionsWithCards, 0);
  assert.equal(s.emptySections, 4);
});

test("getRiskSectionDisplaySummary: all full → 4 sections, 0 empty", () => {
  const s = getRiskSectionDisplaySummary({ low: [1], medium: [1], high: [1], longshot: [1] });
  assert.equal(s.sectionsWithCards, 4);
  assert.equal(s.emptySections, 0);
});

test("getEmptySectionReason names the quality gates + filters, states no padding, never claims a win edge", () => {
  const r = getEmptySectionReason("high");
  assert.match(r, /quality gates/i);
  assert.match(r, /market reliability/i);
  assert.match(r, /variety, and volume/);
  assert.match(r, /rather than padding/i);
  // No banned betting copy and no win-likelihood claim.
  for (const banned of ["lock", "guaranteed", "sure thing", "likelier to win", "more likely to win"]) {
    assert.ok(!r.toLowerCase().includes(banned), `must not contain "${banned}"`);
  }
});

test("getEmptySectionReason adds a clear-filter hint when a filter is active", () => {
  assert.match(getEmptySectionReason("longshot", true), /Clearing the active filter/);
  assert.ok(!getEmptySectionReason("longshot", false).includes("Clearing"));
});
