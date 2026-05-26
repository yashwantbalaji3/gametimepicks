/**
 * Tests for the MarketTicker content generator.
 *
 * Run: npx tsx --test app/src/lib/market-ticker.test.mjs
 *
 * Honesty contract is locked here — generated items must never
 * contain banned betting copy, must never invent a hit rate when
 * nothing is decisive, and must always emit the pre-toss caveat
 * for cricket boards lacking moneyline data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BANNED_TICKER_PHRASES,
  buildMarketTickerItems,
  dedupeTickerItems,
  hasBannedTickerCopy,
  normalizeTickerLabel,
} from "./market-ticker.ts";

// ---------------------------------------------------------------------------
// Banned-copy guard
// ---------------------------------------------------------------------------

test("hasBannedTickerCopy catches every banned phrase from the contract list", () => {
  const banned = [
    "Tonight's lock",
    "guaranteed win",
    "Free money parlay",
    "can't miss",
    "Cant miss",
    "risk-free play",
    "risk free play",
    "sharp money on RCB",
    "Easy win tonight",
    "easy money",
    "Sure thing",
    "no-brainer",
    "no brainer",
  ];
  for (const phrase of banned) {
    assert.equal(hasBannedTickerCopy(phrase), true,
      `should flag banned phrase: ${phrase}`);
  }
});

test("hasBannedTickerCopy does NOT false-positive on harmless substrings", () => {
  // "lock" must not match "block", "blocked", "padlock", etc.
  assert.equal(hasBannedTickerCopy("Blocked from board"), false);
  assert.equal(hasBannedTickerCopy("Padlock icon"), false);
  // "sure thing" must not match "ensures"/"insures" alone.
  assert.equal(hasBannedTickerCopy("ensures honest output"), false);
});

test("BANNED_TICKER_PHRASES is non-empty and lowercase", () => {
  assert.ok(BANNED_TICKER_PHRASES.length >= 6);
  for (const p of BANNED_TICKER_PHRASES) {
    assert.equal(p, p.toLowerCase());
  }
});

test("normalizeTickerLabel trims + collapses whitespace", () => {
  assert.equal(normalizeTickerLabel("  hello   world  "), "hello world");
  assert.equal(normalizeTickerLabel("a\tb\nc"), "a b c");
});

// ---------------------------------------------------------------------------
// Empty / no-data path
// ---------------------------------------------------------------------------

test("empty input returns empty items for projections surface", () => {
  const out = buildMarketTickerItems({ surface: "projections" });
  assert.deepEqual(out, []);
});

test("home surface with summary loaded but zero decisive shows honest tracking note", () => {
  // When the page passes a summary payload that has nothing
  // decisive yet, we surface the honest "tracked publicly" note
  // instead of fabricating a hit rate.
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: { wins: 0, losses: 0, pushes: 0, pending: 5, decisive: 0, hitRate: null },
    },
  });
  const ids = out.map((i) => i.id);
  assert.ok(ids.includes("results-tracked"),
    "should emit honest tracking note when summary has zero decisive");
});

test("home surface with NO summary loaded still emits the safety notes (no data needed)", () => {
  // Safety notes are surface-only (not data-driven), so the
  // ticker always carries them on home + parlay_lab.
  const out = buildMarketTickerItems({ surface: "home" });
  const ids = out.map((i) => i.id);
  assert.ok(ids.includes("safety-conservative"));
  assert.ok(ids.includes("safety-longshot-hidden"));
  // But NO results-tracked / results-hitrate when no summary input.
  assert.ok(!ids.includes("results-tracked"));
  assert.ok(!ids.includes("results-hitrate"));
});

// ---------------------------------------------------------------------------
// Projection-count items
// ---------------------------------------------------------------------------

test("NBA projection count renders when leans have projections", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    nba: { leans: [{ projection: 12 }, { projection: 14 }, { projection: 8 }] },
  });
  const it = out.find((i) => i.id === "nba-projections-count");
  assert.ok(it);
  assert.equal(it.label, "3 NBA projections live");
  assert.equal(it.icon, "🏀");
});

test("NBA projection item omitted when no scored leans", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    nba: { leans: [{ projection: null }, {}] },
  });
  assert.equal(out.find((i) => i.id === "nba-projections-count"), undefined);
});

test("MLB board count renders when games present", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    mlb: { games: [{}, {}, {}, {}] },
  });
  const it = out.find((i) => i.id === "mlb-board-active");
  assert.ok(it);
  assert.equal(it.label, "MLB board active · 4 games");
});

// ---------------------------------------------------------------------------
// Cricket — pre-toss vs moneyline
// ---------------------------------------------------------------------------

test("cricket moneyline item renders when projection + consensus present", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    cricket: {
      matches: [{
        shortName: "RCB v GT",
        status: null,
        home: { name: "RCB", abbr: "RCB" },
        away: { name: "GT", abbr: "GT" },
        markets: {
          moneyline: {
            projection: "home",
            confidence: "High",
            consensus: {
              home: -125,
              away: 100,
              homeImpliedProb: 0.5314,
              awayImpliedProb: 0.4686,
            },
          },
        },
      }],
    },
  });
  const it = out.find((i) => i.id.startsWith("cricket-ml-"));
  assert.ok(it, "should emit cricket moneyline item");
  assert.ok(it.label.includes("RCB"));
  assert.ok(it.label.includes("-125"));
  assert.equal(it.value, "53.1% consensus");
});

test("cricket pre-toss caveat renders when moneyline data is missing", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    cricket: {
      matches: [{
        shortName: "RCB v GT",
        status: null,
        markets: { moneyline: null },
      }],
    },
  });
  const it = out.find((i) => i.id.startsWith("cricket-pre-toss-"));
  assert.ok(it);
  assert.ok(it.label.toLowerCase().includes("pre-toss"));
});

// ---------------------------------------------------------------------------
// Result summary
// ---------------------------------------------------------------------------

test("settlement item renders decisive hit rate only when decisive > 0", () => {
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: {
        wins: 6, losses: 54, pushes: 0, pending: 10,
        decisive: 60, hitRate: 0.1,
      },
    },
  });
  const it = out.find((i) => i.id === "results-hitrate");
  assert.ok(it);
  assert.equal(it.value, "10.0%");
});

test("hit rate NOT emitted when decisive === 0 (no fake 0%)", () => {
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: {
        wins: 0, losses: 0, pushes: 0, pending: 70,
        decisive: 0, hitRate: null,
      },
    },
  });
  assert.equal(out.find((i) => i.id === "results-hitrate"), undefined);
  // But the honest "tracked publicly" note should still appear.
  assert.ok(out.find((i) => i.id === "results-tracked"));
});

// ---------------------------------------------------------------------------
// Safety notes
// ---------------------------------------------------------------------------

test("home surface includes the lane-safety notes", () => {
  const out = buildMarketTickerItems({ surface: "home" });
  const ids = out.map((i) => i.id);
  assert.ok(ids.includes("safety-conservative"));
  assert.ok(ids.includes("safety-longshot-hidden"));
});

test("parlay_lab surface includes the custom-builder caveat", () => {
  const out = buildMarketTickerItems({ surface: "parlay_lab" });
  const ids = out.map((i) => i.id);
  assert.ok(ids.includes("lab-custom-not-tracked"));
});

// ---------------------------------------------------------------------------
// Universal honesty check
// ---------------------------------------------------------------------------

test("no surface ever produces banned ticker copy", () => {
  const fixtures = [
    {
      surface: "home",
      optimizerSummary: {
        lifetime: { wins: 6, losses: 54, pushes: 0, pending: 10, decisive: 60, hitRate: 0.1 },
        byDate: [
          { date: "2026-05-25", wins: 6, losses: 54, pushes: 0, pending: 10, decisive: 60, hitRate: 0.1 },
        ],
      },
      nba: { leans: [{ projection: 5 }] },
      mlb: { games: [{}] },
      cricket: {
        matches: [{
          shortName: "RCB v GT",
          markets: { moneyline: { projection: "home", consensus: { home: -125, away: 100, homeImpliedProb: 0.5314, awayImpliedProb: 0.4686 } } },
        }],
      },
    },
    { surface: "projections", nba: { leans: [{ projection: 1 }] } },
    { surface: "parlay_lab" },
  ];
  for (const fx of fixtures) {
    const items = buildMarketTickerItems(fx);
    for (const it of items) {
      assert.equal(hasBannedTickerCopy(it.label), false,
        `banned copy in label for ${fx.surface}: ${it.label}`);
      if (it.value) {
        assert.equal(hasBannedTickerCopy(it.value), false,
          `banned copy in value for ${fx.surface}: ${it.value}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Dedupe + href preservation
// ---------------------------------------------------------------------------

test("dedupeTickerItems removes duplicate ids, preserves order", () => {
  const items = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "a", label: "A2" },
    { id: "c", label: "C" },
  ];
  const out = dedupeTickerItems(items);
  assert.deepEqual(out.map((i) => i.id), ["a", "b", "c"]);
  assert.equal(out[0].label, "A", "should keep the first occurrence");
});

test("items preserve href when supplied", () => {
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: { wins: 6, losses: 54, pushes: 0, pending: 0, decisive: 60, hitRate: 0.1 },
    },
  });
  const it = out.find((i) => i.id === "results-hitrate");
  assert.ok(it);
  assert.equal(it.href, "/results");
});

test("buildMarketTickerItems dedupes by id within a single build", () => {
  // Two cricket matches with identical shortName would collide.
  const out = buildMarketTickerItems({
    surface: "projections",
    cricket: {
      matches: [
        { shortName: "X v Y", markets: { moneyline: null } },
        { shortName: "X v Y", markets: { moneyline: null } },
      ],
    },
  });
  const cricketHits = out.filter((i) => i.id.startsWith("cricket-pre-toss-"));
  assert.equal(cricketHits.length, 1,
    "dedupe should collapse identical-id cricket items");
});
