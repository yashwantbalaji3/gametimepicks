/**
 * Pairing registry guards.
 *
 * The positive cases are the cheap half. What this file is really for is the degradations: every
 * way a row can fail to be comparable, asserted individually, so that a future change which makes
 * comparison "work" by quietly dropping a requirement fails here instead of shipping.
 *
 * Run: npx tsx --test src/lib/markets/pairing.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getMarketIntelligenceMode,
  modelSupportsPlayerFamily,
  modelSupportsGameFamily,
  providerKeyFor,
  modelKeyFor,
  censusPairing,
} from "./pairing.ts";
import { MODEL_KEY_BY_PLAYER_FAMILY, PROVIDER_KEY_BY_PLAYER_FAMILY } from "./types.ts";

const CURRENT = {
  state: "CURRENT",
  artifactDate: "2026-07-27",
  generatedAt: "2026-07-27T16:35:04.082Z",
  ageDays: 0,
  isCurrent: true,
};
const STALE = { ...CURRENT, state: "STALE", artifactDate: "2026-07-25", ageDays: 2, isCurrent: false };

/** A row that satisfies every gate — each test below breaks exactly one thing. */
const playerBase = {
  sport: "mlb",
  kind: "player",
  family: "BATTER_HITS",
  sportsbook: { present: true, americanOdds: -255, line: 0.5, requiresLine: true },
  model: { present: true, supportsThreshold: true },
  freshness: CURRENT,
  eventResolved: true,
  teamMapping: "RESOLVED_FROM_GAME",
};

const gameBase = {
  sport: "mlb",
  kind: "game",
  family: "TOTAL",
  sportsbook: { present: true, americanOdds: -103, line: 8, requiresLine: true },
  model: { present: true, supportsThreshold: true },
  freshness: CURRENT,
  eventResolved: true,
};

// ── Family registries ───────────────────────────────────────────────────────────────────────────

test("model family support is derived from the calibration registry, not restated", () => {
  // The four modeled families.
  assert.equal(modelSupportsPlayerFamily("PITCHER_STRIKEOUTS"), true);
  assert.equal(modelSupportsPlayerFamily("BATTER_HITS"), true);
  assert.equal(modelSupportsPlayerFamily("BATTER_TOTAL_BASES"), true);
  // Provider-only families the book offers and GameTimePicks does not model.
  assert.equal(modelSupportsPlayerFamily("BATTER_HOME_RUNS"), false);
  assert.equal(modelSupportsPlayerFamily("BATTER_RBIS"), false);
  assert.equal(modelSupportsPlayerFamily("BATTER_RUNS_SCORED"), false);
  assert.equal(modelSupportsPlayerFamily("PITCHER_OUTS"), false);
  assert.equal(modelSupportsPlayerFamily("PITCHER_EARNED_RUNS"), false);
  assert.equal(modelSupportsPlayerFamily(null), false);
});

test("the modeled-but-unpriced family is modeled and has no provider key", () => {
  // batter_hits_runs_rbis: GameTimePicks projects it, the book does not post it. Both halves of
  // that sentence have to be representable, or MODEL_ONLY is unreachable rather than merely empty.
  assert.equal(modelSupportsPlayerFamily("BATTER_HITS_RUNS_RBIS"), true);
  assert.equal(providerKeyFor("BATTER_HITS_RUNS_RBIS"), null, "the book has no key for it");
  assert.equal(modelKeyFor("BATTER_HITS_RUNS_RBIS"), "batter_hits_runs_rbis");
});

test("a modeled-but-unpriced family with no market row is MODEL_ONLY", () => {
  const r = getMarketIntelligenceMode({
    ...playerBase,
    family: "BATTER_HITS_RUNS_RBIS",
    sportsbook: { present: false },
  });
  assert.equal(r.mode, "MODEL_ONLY");
  assert.equal(r.modelValidatedAgainstMarket, false);
});

test("provider and model key maps agree wherever both have an entry", () => {
  for (const [family, providerKey] of Object.entries(PROVIDER_KEY_BY_PLAYER_FAMILY)) {
    assert.equal(
      MODEL_KEY_BY_PLAYER_FAMILY[family],
      providerKey,
      `${family} must not mean one thing to the book and another to the model`,
    );
  }
});

test("game families are the three the live artifact provides", () => {
  assert.equal(modelSupportsGameFamily("MONEYLINE"), true);
  assert.equal(modelSupportsGameFamily("RUN_LINE"), true);
  assert.equal(modelSupportsGameFamily("TOTAL"), true);
  assert.equal(modelSupportsGameFamily(null), false);
});

test("providerKeyFor round-trips into the join key model artifacts use", () => {
  assert.equal(providerKeyFor("BATTER_HITS"), "batter_hits");
  assert.equal(providerKeyFor("PITCHER_STRIKEOUTS"), "pitcher_strikeouts");
  assert.equal(providerKeyFor(null), null);
});

// ── Positive cases ──────────────────────────────────────────────────────────────────────────────

test("a fully-satisfied player row is FULL_COMPARISON with no gates", () => {
  const r = getMarketIntelligenceMode(playerBase);
  assert.equal(r.mode, "FULL_COMPARISON");
  assert.deepEqual(r.blockedBy, []);
  assert.equal(r.hasModel, true);
  assert.equal(r.hasSportsbook, true);
});

test("a fully-satisfied game row is FULL_COMPARISON", () => {
  assert.equal(getMarketIntelligenceMode(gameBase).mode, "FULL_COMPARISON");
});

test("moneyline needs no line, and a null line does not disqualify it", () => {
  const r = getMarketIntelligenceMode({
    ...gameBase,
    family: "MONEYLINE",
    sportsbook: { present: true, americanOdds: 109, line: null, requiresLine: false },
  });
  assert.equal(r.mode, "FULL_COMPARISON");
});

// ── NEGATIVE 1: sportsbook-only family ──────────────────────────────────────────────────────────

test("NEGATIVE 1 · a family the book offers and the model does not is SPORTSBOOK_ONLY", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, family: "BATTER_HOME_RUNS" });
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("NO_MODEL_FAMILY"));
  assert.equal(r.hasModel, false);
});

// ── NEGATIVE 2: model-only family ───────────────────────────────────────────────────────────────

test("NEGATIVE 2 · a modeled family with no sportsbook market is MODEL_ONLY", () => {
  // batter_hits_runs_rbis: modeled by GameTimePicks, not offered by the book on this slate.
  const r = getMarketIntelligenceMode({
    ...playerBase,
    family: "BATTER_HITS",
    sportsbook: { present: false },
  });
  assert.equal(r.mode, "MODEL_ONLY");
  assert.ok(r.blockedBy.includes("NO_SPORTSBOOK_MARKET"));
  assert.equal(r.hasSportsbook, false);
});

// ── NEGATIVE 3: unresolved player team ──────────────────────────────────────────────────────────

test("NEGATIVE 3 · an unresolved team is never FULL_COMPARISON, and degrades to market context", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, teamMapping: "UNRESOLVED" });
  assert.notEqual(r.mode, "FULL_COMPARISON");
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("TEAM_UNRESOLVED"));
});

// ── NEGATIVE 4: ambiguous identity ──────────────────────────────────────────────────────────────

test("NEGATIVE 4 · ambiguous identity fails the whole row closed, not just the model side", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, teamMapping: "AMBIGUOUS" });
  assert.equal(r.mode, "UNAVAILABLE");
  assert.ok(r.blockedBy.includes("IDENTITY_AMBIGUOUS"));
  assert.equal(r.hasSportsbook, false, "an unidentified row is not market context either");
});

// ── NEGATIVE 5: stale artifact ──────────────────────────────────────────────────────────────────

test("NEGATIVE 5 · a stale snapshot downgrades FULL_COMPARISON to MODEL_ONLY", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, freshness: STALE });
  assert.equal(r.mode, "MODEL_ONLY");
  assert.ok(r.blockedBy.includes("ARTIFACT_NOT_CURRENT"));
});

test("NEGATIVE 5b · a stale snapshot with no model leaves nothing to show", () => {
  const r = getMarketIntelligenceMode({
    ...playerBase,
    family: "BATTER_HOME_RUNS",
    freshness: STALE,
  });
  assert.equal(r.mode, "UNAVAILABLE");
});

test("NEGATIVE 5c · a missing freshness reading is treated as not current", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, freshness: null });
  assert.equal(r.mode, "MODEL_ONLY");
  assert.ok(r.blockedBy.includes("ARTIFACT_NOT_CURRENT"));
});

// ── NEGATIVE 6: missing simulation distribution ─────────────────────────────────────────────────

test("NEGATIVE 6 · a missing model artifact is never FULL_COMPARISON", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, model: { present: false } });
  assert.notEqual(r.mode, "FULL_COMPARISON");
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("MODEL_ARTIFACT_MISSING"));
});

test("NEGATIVE 6b · a null model side behaves as missing, not as present", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, model: null });
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("MODEL_ARTIFACT_MISSING"));
});

// ── NEGATIVE 7: unsupported sport ───────────────────────────────────────────────────────────────

test("NEGATIVE 7 · an unknown sport fails closed to market context, never to prediction", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, sport: "quidditch" });
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("SPORT_NOT_MODEL_ELIGIBLE"));
  assert.equal(r.hasModel, false);
});

test("NEGATIVE 7b · a sportsbook-only sport gets market context and no model side", () => {
  // soccer is not FULL_MODEL in the capability registry, so it may carry markets but not predictions.
  const r = getMarketIntelligenceMode({ ...gameBase, sport: "soccer" });
  assert.equal(r.hasModel, false);
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
});

// ── NEGATIVE 8: missing / malformed market line ─────────────────────────────────────────────────

test("NEGATIVE 8 · a line market with no line is incomplete, not zero", () => {
  const r = getMarketIntelligenceMode({
    ...gameBase,
    sportsbook: { present: true, americanOdds: -103, line: null, requiresLine: true },
  });
  assert.equal(r.mode, "MODEL_ONLY");
  assert.ok(r.blockedBy.includes("MARKET_INCOMPLETE"));
});

test("NEGATIVE 8b · American odds of 0 is rejected as a price", () => {
  const r = getMarketIntelligenceMode({
    ...playerBase,
    sportsbook: { present: true, americanOdds: 0, line: 0.5, requiresLine: true },
  });
  assert.ok(r.blockedBy.includes("MARKET_INCOMPLETE"));
  assert.equal(r.hasSportsbook, false);
});

test("NEGATIVE 8c · a null price is rejected", () => {
  const r = getMarketIntelligenceMode({
    ...playerBase,
    sportsbook: { present: true, americanOdds: null, line: 0.5, requiresLine: true },
  });
  assert.equal(r.hasSportsbook, false);
});

// ── NEGATIVE 9: no market-beating classification while calibration says otherwise ────────────────

test("NEGATIVE 9 · no mode asserts a validated advantage while calibration is failed", () => {
  for (const family of ["BATTER_HITS", "BATTER_TOTAL_BASES", "PITCHER_STRIKEOUTS"]) {
    const r = getMarketIntelligenceMode({ ...playerBase, family });
    assert.equal(r.mode, "FULL_COMPARISON");
    assert.equal(
      r.modelValidatedAgainstMarket,
      false,
      `${family} must not report a validated advantage`,
    );
  }
});

test("NEGATIVE 9b · the mode vocabulary contains no recommendation language", () => {
  const modes = ["FULL_COMPARISON", "MODEL_ONLY", "SPORTSBOOK_ONLY", "UNAVAILABLE"];
  for (const m of modes) {
    assert.ok(!/EDGE|BEST|PICK|VALUE|LOCK|BEAT/.test(m), `${m} must not imply a recommendation`);
  }
});

// ── Event identity ──────────────────────────────────────────────────────────────────────────────

test("an unresolved event fails the row closed before any other gate", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, eventResolved: false });
  assert.equal(r.mode, "UNAVAILABLE");
  assert.deepEqual(r.blockedBy, ["EVENT_UNRESOLVED"]);
});

test("an unknown provider family fails closed", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, family: null });
  assert.equal(r.mode, "UNAVAILABLE");
  assert.ok(r.blockedBy.includes("FAMILY_UNKNOWN"));
});

// ── Threshold support ───────────────────────────────────────────────────────────────────────────

test("an artifact that cannot evaluate the exact threshold does not support comparison", () => {
  const r = getMarketIntelligenceMode({
    ...gameBase,
    family: "RUN_LINE",
    sportsbook: { present: true, americanOdds: -162, line: 3.5, requiresLine: true },
    model: { present: true, supportsThreshold: false },
  });
  assert.equal(r.mode, "SPORTSBOOK_ONLY");
  assert.ok(r.blockedBy.includes("THRESHOLD_UNSUPPORTED"));
});

test("supportsThreshold defaults to permissive only when the caller does not evaluate one", () => {
  const r = getMarketIntelligenceMode({ ...gameBase, model: { present: true } });
  assert.equal(r.mode, "FULL_COMPARISON");
});

// ── Team gate scope ─────────────────────────────────────────────────────────────────────────────

test("team resolution is required only for player rows", () => {
  const r = getMarketIntelligenceMode({ ...gameBase, teamMapping: "UNRESOLVED" });
  assert.equal(r.mode, "FULL_COMPARISON", "a game market's teams come from the event itself");
});

test("an EXACT provider-supplied team is publishable", () => {
  const r = getMarketIntelligenceMode({ ...playerBase, teamMapping: "EXACT" });
  assert.equal(r.mode, "FULL_COMPARISON");
});

// ── Census ──────────────────────────────────────────────────────────────────────────────────────

test("census tallies modes and attributes every dropped row to a named gate", () => {
  const rows = [
    getMarketIntelligenceMode(playerBase),
    getMarketIntelligenceMode({ ...playerBase, family: "BATTER_HOME_RUNS" }),
    getMarketIntelligenceMode({ ...playerBase, sportsbook: { present: false } }),
    getMarketIntelligenceMode({ ...playerBase, eventResolved: false }),
  ];
  const c = censusPairing(rows);
  assert.equal(c.total, 4);
  assert.equal(c.byMode.FULL_COMPARISON, 1);
  assert.equal(c.byMode.SPORTSBOOK_ONLY, 1);
  assert.equal(c.byMode.MODEL_ONLY, 1);
  assert.equal(c.byMode.UNAVAILABLE, 1);
  assert.equal(c.byGate.NO_MODEL_FAMILY, 1);
  assert.equal(c.byGate.NO_SPORTSBOOK_MARKET, 1);
  assert.equal(c.byGate.EVENT_UNRESOLVED, 1);
});

test("census of an empty slate is zero, not a division error", () => {
  const c = censusPairing([]);
  assert.equal(c.total, 0);
  assert.equal(c.byMode.FULL_COMPARISON, 0);
  assert.deepEqual(c.byGate, {});
});
