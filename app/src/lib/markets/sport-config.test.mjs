/**
 * Market Center seam guards.
 *
 * Two claims are being defended:
 *   1. parameterising the three seams cost MLB nothing — the config RESTATES what was hardcoded;
 *   2. NBA gets market intelligence and no model, structurally rather than by convention.
 *
 * The second half is the one that matters. "We won't publish an NBA probability" is a promise; a
 * config whose model is `NONE` and whose row type declares the model fields `never` is a mechanism.
 *
 * Run: npx tsx --test src/lib/markets/sport-config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MLB_MARKET_CONFIG,
  MLB_SPORT_KEY,
  NBA_MARKET_CONFIG,
  NBA_SPORT_KEY,
  hasModel,
  marketConfigFor,
  noModelReason,
  sportOffersGameFamily,
} from "./sport-config.ts";
import {
  getMarketIntelligenceMode,
  modelSupportsGameFamily,
  modelSupportsPlayerFamily,
} from "./pairing.ts";
import { MLB_MARKET_CALIBRATION } from "../mlb/model-calibration-status.ts";
import { capabilityState } from "../sport-capability-registry.ts";

const CURRENT = {
  state: "CURRENT",
  artifactDate: "2026-07-27",
  generatedAt: "2026-07-27T16:35:04.082Z",
  ageDays: 0,
  isCurrent: true,
};

// ── SEAM 1: family vocabulary ───────────────────────────────────────────────────────────────────

test("MLB's game vocabulary is exactly what the live artifact provides", () => {
  assert.deepEqual([...MLB_MARKET_CONFIG.gameFamilies].sort(), ["MONEYLINE", "RUN_LINE", "TOTAL"]);
  assert.equal(sportOffersGameFamily(MLB_SPORT_KEY, "SPREAD"), false, "MLB posts a run line, not a spread");
});

test("NBA offers game markets only — moneyline, spread, total", () => {
  assert.deepEqual([...NBA_MARKET_CONFIG.gameFamilies].sort(), ["MONEYLINE", "SPREAD", "TOTAL"]);
  assert.equal(sportOffersGameFamily(NBA_SPORT_KEY, "RUN_LINE"), false);
  assert.equal(NBA_MARKET_CONFIG.playerFamilies.size, 0, "player props are out of scope, not empty-for-now");
  assert.deepEqual(NBA_MARKET_CONFIG.playerFamilyByProviderKey, {});
});

test("MLB's player vocabulary still covers every family the calibration registry keys", () => {
  for (const key of Object.keys(MLB_MARKET_CALIBRATION)) {
    assert.ok(
      MLB_MARKET_CONFIG.model.modeledPlayerFamilyKeys.has(key),
      `${key} is in the calibration registry but not in the MLB config`,
    );
  }
});

// ── SEAM 2: data root ───────────────────────────────────────────────────────────────────────────

test("each sport reads its own artifact directory", () => {
  assert.equal(MLB_MARKET_CONFIG.dataDir, "mlb");
  assert.equal(NBA_MARKET_CONFIG.dataDir, "nba");
  assert.ok(fs.existsSync(path.resolve(process.cwd(), "public/data", NBA_MARKET_CONFIG.dataDir)));
});

test("an unregistered sport gets no config, and therefore no data root", () => {
  for (const sport of ["ufc", "nhl", "", null, undefined, "MLB "]) {
    const config = marketConfigFor(sport);
    if (sport === "MLB ") {
      assert.equal(config, MLB_MARKET_CONFIG, "lookup is case- and whitespace-insensitive");
    } else {
      assert.equal(config, null, `${sport} must fail closed`);
    }
  }
});

// ── SEAM 3: calibration / model source ──────────────────────────────────────────────────────────

test("MLB's modelled families are unchanged by the parameterisation", () => {
  for (const family of ["MONEYLINE", "RUN_LINE", "TOTAL"]) {
    assert.equal(modelSupportsGameFamily(family), true, family);
    assert.equal(modelSupportsGameFamily(family, MLB_SPORT_KEY), true, family);
  }
  assert.equal(modelSupportsGameFamily("SPREAD"), false);
  assert.equal(modelSupportsPlayerFamily("BATTER_HITS"), true);
  assert.equal(modelSupportsPlayerFamily("PITCHER_STRIKEOUTS"), true);
  assert.equal(modelSupportsPlayerFamily(null), false);
});

test("NBA models nothing, and says why", () => {
  assert.equal(hasModel(NBA_SPORT_KEY), false);
  assert.equal(hasModel(MLB_SPORT_KEY), true);
  assert.equal(NBA_MARKET_CONFIG.model.kind, "NONE");
  assert.match(noModelReason(NBA_SPORT_KEY), /below coin-flip/);
  assert.equal(noModelReason(MLB_SPORT_KEY), null);
  for (const family of ["MONEYLINE", "SPREAD", "TOTAL"]) {
    assert.equal(modelSupportsGameFamily(family, NBA_SPORT_KEY), false, family);
  }
  assert.equal(modelSupportsPlayerFamily("BATTER_HITS", NBA_SPORT_KEY), false);
});

test("the NBA config declares the model-derived fields as never", () => {
  // A type-level guarantee needs a source-level assertion: `tsx --test` strips types, so a runtime
  // check cannot see them. Reading the declaration is the only way this stays enforced.
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/lib/markets/sport-config.ts"), "utf-8");
  for (const field of [
    "modelProbability",
    "simulationProbability",
    "projection",
    "lean",
    "pick",
    "edgePct",
    "confidence",
  ]) {
    assert.match(
      source,
      new RegExp(`readonly ${field}\\?: never;`),
      `${field} must be typed out of a no-model row, not merely omitted`,
    );
  }
});

// ── The seams composed: what a surface may actually show ────────────────────────────────────────

test("an NBA game market is market context and never a comparison", () => {
  const result = getMarketIntelligenceMode({
    sport: NBA_SPORT_KEY,
    kind: "game",
    family: "SPREAD",
    sportsbook: { present: true, americanOdds: -110, line: -4.5, requiresLine: true },
    model: { present: true },
    freshness: CURRENT,
    eventResolved: true,
  });
  assert.equal(result.mode, "SPORTSBOOK_ONLY");
  assert.equal(result.hasModel, false);
  assert.equal(result.modelValidatedAgainstMarket, false);
  assert.ok(result.blockedBy.includes("SPORT_NOT_MODEL_ELIGIBLE"));
});

test("an MLB game market keeps its full comparison", () => {
  const result = getMarketIntelligenceMode({
    sport: MLB_SPORT_KEY,
    kind: "game",
    family: "TOTAL",
    sportsbook: { present: true, americanOdds: -110, line: 8.5, requiresLine: true },
    model: { present: true },
    freshness: CURRENT,
    eventResolved: true,
  });
  assert.equal(result.mode, "FULL_COMPARISON");
});

test("no MLB family is claimed to out-predict the market", () => {
  // The parameterisation must not have quietly changed this answer. It is false for every family.
  for (const family of ["BATTER_HITS", "PITCHER_STRIKEOUTS", "BATTER_HOME_RUNS"]) {
    const result = getMarketIntelligenceMode({
      sport: MLB_SPORT_KEY,
      kind: "player",
      family,
      sportsbook: { present: true, americanOdds: -110, line: 0.5, requiresLine: true },
      model: { present: true },
      freshness: CURRENT,
      eventResolved: true,
      teamMapping: "EXACT",
    });
    assert.equal(result.modelValidatedAgainstMarket, false, family);
  }
});

test("de-vig is first class for both sports; movement is not claimed without captures", () => {
  assert.equal(NBA_MARKET_CONFIG.deVigIsFirstClass, true);
  assert.equal(NBA_MARKET_CONFIG.movement, "ONLY_WITH_MULTIPLE_CAPTURES");
  // MLB has no snapshot history at all, so movement is unbuildable rather than unbuilt.
  assert.equal(MLB_MARKET_CONFIG.movement, "UNAVAILABLE_NO_HISTORY");
});

test("having a market config does not promote a sport", () => {
  // The registry, not this file, decides what a sport may claim. A config is plumbing.
  assert.equal(capabilityState(NBA_SPORT_KEY), "HISTORICAL_ONLY");
});

/**
 * P177: a sport that posts no player families must not be blocked from opening by a missing
 * player-props artifact. Requiring one demands a file the sport is defined never to produce, and
 * conflates "the book offers no player market" with "the player capture broke" — two different
 * answers. NBA is registered exactly that way today, so this was live, not hypothetical.
 */
test("latestMarketDate does not demand a props file from a sport that posts no player families", async () => {
  const { NBA_MARKET_CONFIG, MLB_MARKET_CONFIG } = await import("./sport-config.ts");
  assert.equal(NBA_MARKET_CONFIG.playerFamilies.size, 0, "NBA is the registered no-player-market sport");
  assert.ok(MLB_MARKET_CONFIG.playerFamilies.size > 0, "MLB posts player families and keeps the stricter rule");

  const load = fs.readFileSync(path.join(process.cwd(), "src/lib/markets/load.ts"), "utf8");
  const fn = load.slice(load.indexOf("export function latestMarketDate"), load.indexOf("export interface MarketCenterData"));
  assert.match(fn, /postsPlayerMarkets/);
  assert.match(fn, /playerFamilies\.size \?\? 0\) > 0/);
  // the stricter both-must-exist rule survives for sports that DO post props
  assert.match(fn, /availableDates\("player-props", sport\)\.filter/);
  assert.match(load, /conflates two\s+\*? ?different things/, "the reason is recorded where the next author will read it");
});
