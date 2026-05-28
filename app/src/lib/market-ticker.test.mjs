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
  assert.ok(ids.includes("lane-variance-anchor-core"));
  assert.ok(ids.includes("lane-swing-hidden"));
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

// PR #113: cricket is unwired from every visible surface. The
// builder must NEVER emit cricket items, even when a caller passes
// cricket data. These tests lock that contract so a future
// re-enable can't silently leak cricket back into the ticker.
test("PR #113: cricket moneyline input does NOT emit a ticker item", () => {
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
  assert.equal(
    out.find((i) => i.id.startsWith("cricket-")),
    undefined,
    "no cricket item should appear in the ticker output",
  );
  // The output text must not mention IPL / RCB / GT.
  const combined = out.map((i) => i.label + " " + (i.value ?? "")).join(" ");
  assert.equal(/RCB|GT|IPL|cricket/i.test(combined), false);
});

test("PR #113: cricket pre-toss input also produces no ticker item", () => {
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
  assert.equal(
    out.find((i) => i.id.startsWith("cricket-")),
    undefined,
    "no cricket pre-toss item should appear in the ticker output",
  );
});

// ---------------------------------------------------------------------------
// Result summary
// ---------------------------------------------------------------------------

test("settlement item renders decisive hit rate only when decisive > 0", () => {
  // Post-era byDate row drives the lifetime recompute. The supplied
  // `lifetime` field is ignored — the ticker rebuilds lifetime from
  // byDate filtered to the public era so pre-era numbers can never
  // leak in even when a caller passes the raw summary JSON.
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: {
        wins: 6, losses: 54, pushes: 0, pending: 10,
        decisive: 60, hitRate: 0.1,
      },
      byDate: [
        { date: "2026-05-27", wins: 6, losses: 54, pushes: 0, pending: 10, decisive: 60, hitRate: 0.1 },
      ],
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
  assert.ok(ids.includes("lane-variance-anchor-core"));
  assert.ok(ids.includes("lane-swing-hidden"));
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
      // PR #113: no cricket items can survive build, even when
      // cricket fixtures are passed in.
      assert.equal(/^cricket-/.test(it.id), false,
        `cricket item leaked into ${fx.surface}: ${it.id}`);
      assert.equal(/RCB|GT|IPL|cricket/i.test(it.label), false,
        `cricket text leaked into ${fx.surface} label: ${it.label}`);
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
      byDate: [
        { date: "2026-05-27", wins: 6, losses: 54, pushes: 0, pending: 0, decisive: 60, hitRate: 0.1 },
      ],
    },
  });
  const it = out.find((i) => i.id === "results-hitrate");
  assert.ok(it);
  assert.equal(it.href, "/results");
});

test("buildMarketTickerItems dedupes by id within a single build", () => {
  // The dedupe behavior is also exercised by dedupeTickerItems
  // directly. Here we just confirm the helper returns each unique
  // id once when assembling a real surface — even if upstream
  // generators ever produce duplicates, the build step strips them.
  const out = buildMarketTickerItems({ surface: "parlay_lab" });
  const ids = out.map((i) => i.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size,
    "buildMarketTickerItems output must contain unique ids only");
});

// ---------------------------------------------------------------------------
// Public parlay era filter (PR: fix/parlay-public-era-reset)
//
// On 2026-05-27 we reset public parlay tracking. Pre-era rows must
// NEVER leak into the ticker, even when the caller passes the raw
// pipeline JSON with old dates still in `byDate`.
// ---------------------------------------------------------------------------

test("era: pre-era-only byDate yields fresh-era note instead of hit rate", () => {
  // The whole byDate is pre-era — ticker must filter them all out
  // and emit the fresh-era tracking note instead of any hit rate.
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: { wins: 8, losses: 42, pushes: 0, pending: 12, decisive: 50, hitRate: 0.16 },
      byDate: [
        { date: "2026-05-25", wins: 8, losses: 42, pushes: 0, pending: 12, decisive: 50, hitRate: 0.16 },
        { date: "2026-05-26", wins: 0, losses: 0, pushes: 0, pending: 0, decisive: 0, hitRate: null },
      ],
    },
  });
  const ids = out.map((i) => i.id);
  assert.equal(out.find((i) => i.id === "results-hitrate"), undefined,
    "pre-era hit rate must not appear in ticker");
  assert.equal(out.find((i) => /^results-date-2026-05-2[56]$/.test(i.id)), undefined,
    "pre-era recent-date item must not appear in ticker");
  assert.ok(ids.includes("results-tracked"),
    "fresh-era tracking note must appear when only pre-era rows are present");
  const note = out.find((i) => i.id === "results-tracked");
  assert.match(note.label, /Public parlay tracking starts 2026-05-27/,
    "fresh-era note must name the era start date");
});

test("era: mixed pre+post byDate recomputes lifetime from post-era only", () => {
  // Pre-era row would inflate to 8W-42L (16%) — that must be dropped.
  // Post-era row 3W-2L = 60% must be the only thing surfaced.
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: { wins: 11, losses: 44, pushes: 0, pending: 14, decisive: 55, hitRate: 0.2 },
      byDate: [
        { date: "2026-05-25", wins: 8, losses: 42, pushes: 0, pending: 12, decisive: 50, hitRate: 0.16 },
        { date: "2026-05-27", wins: 3, losses: 2, pushes: 0, pending: 2, decisive: 5, hitRate: 0.6 },
      ],
    },
  });
  const hit = out.find((i) => i.id === "results-hitrate");
  assert.ok(hit, "hit-rate item should appear once a post-era row is present");
  assert.equal(hit.value, "60.0%",
    "lifetime must be recomputed from post-era rows only (3W of 5 = 60%)");
  const recent = out.find((i) => /^results-date-/.test(i.id));
  assert.ok(recent);
  assert.equal(recent.id, "results-date-2026-05-27",
    "most-recent-date item must be the post-era row, never the pre-era row");
});

test("era: post-era-only byDate emits hit rate and recent-date item", () => {
  const out = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: {
      lifetime: { wins: 4, losses: 6, pushes: 0, pending: 1, decisive: 10, hitRate: 0.4 },
      byDate: [
        { date: "2026-05-27", wins: 4, losses: 6, pushes: 0, pending: 1, decisive: 10, hitRate: 0.4 },
      ],
    },
  });
  const hit = out.find((i) => i.id === "results-hitrate");
  assert.ok(hit);
  assert.equal(hit.value, "40.0%");
  const recent = out.find((i) => i.id === "results-date-2026-05-27");
  assert.ok(recent);
  assert.match(recent.label, /4W · 6L/);
});

test("era: projections surface fresh-era note when summary has no post-era data", () => {
  const out = buildMarketTickerItems({
    surface: "projections",
    optimizerSummary: {
      lifetime: { wins: 8, losses: 42, pushes: 0, pending: 12, decisive: 50, hitRate: 0.16 },
      byDate: [
        { date: "2026-05-25", wins: 8, losses: 42, pushes: 0, pending: 12, decisive: 50, hitRate: 0.16 },
      ],
    },
    nba: { leans: [{ projection: 5 }] },
  });
  const note = out.find((i) => i.id === "results-tracked");
  assert.ok(note,
    "projections surface should emit fresh-era note when only pre-era settlements exist");
  assert.match(note.label, /Public parlay tracking starts 2026-05-27/);
});
