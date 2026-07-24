/**
 * GLOBAL ENTITY SYSTEM GUARDS (Sprint 012 · Phase 3). Source guards that the shared team/player visual
 * primitives stay safe: sport-aware portraits (never a guessed photo for a sport with no CDN), graceful
 * missing-image states, and presentational-only (no data fetching, no prediction recomputation).
 *
 * Run: npx tsx --test src/lib/entity-system.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const src = fs.readFileSync(path.join(app, "src/components/entity/index.tsx"), "utf8");

test("the entity system exports the five canonical primitives", () => {
  for (const name of ["TeamLogo", "PlayerPortrait", "EntityHeader", "PlayerCard", "GameHeader"]) {
    assert.match(src, new RegExp(`export function ${name}\\b`), `${name} is exported`);
  }
});

test("it WRAPS the proven primitives instead of duplicating them", () => {
  assert.match(src, /from "@\/components\/ui\/team-mark"/, "team logo reuses TeamMark");
  assert.match(src, /from "@\/components\/ui\/matchup-identity"/, "game header reuses MatchupIdentity");
  assert.match(src, /from "@\/components\/player-avatar"/, "portraits reuse PlayerAvatar");
  // No second headshot/logo URL construction may live here.
  assert.ok(!/https?:\/\/[^"']*headshot|mlbstatic|cdn\.nba\.com/.test(src), "no duplicated CDN URL building");
});

test("portraits are sport-aware — only sports with a real CDN pass an id (never a guessed photo)", () => {
  assert.match(src, /PORTRAIT_SPORTS = new Set\(\["mlb", "nba"\]\)/, "only MLB + NBA resolve headshots");
  assert.match(src, /PORTRAIT_SPORTS\.has\(sport\) \? playerId \?\? null : null/, "unsupported sports fall back to initials");
});

test("it is presentational only — no fetching, no prediction logic", () => {
  assert.ok(!/\bfetch\(|useEffect|readFileSync|buildGamePredictionDecision|buildPlayerPrediction|simulateFullGame/.test(src),
    "entity components never fetch data or compute predictions");
  // Probability is passed in already-computed from a canonical object.
  assert.match(src, /Already-computed percentage/, "probability is an input, not a derivation");
});

test("simulation FREQUENCY is a rendering of the canonical probability, not a new number", () => {
  // "8,400 / 10,000 games" must be probability × runCount — both already computed upstream. The card may
  // never invent a count, and must render nothing when either input is missing.
  assert.match(src, /probabilityPct \/ 100\) \* simulationCount/, "frequency = probability × simulations");
  assert.match(src, /probabilityPct != null && simulationCount != null && simulationCount > 0/, "fails closed when either input is missing");
  assert.match(src, /frequency \? </, "only rendered when derivable");
});

test("missing images degrade gracefully (null-safe props throughout)", () => {
  assert.match(src, /logoUrl\?: string \| null/, "logo may be null");
  assert.match(src, /playerId\?: number \| null/, "player id may be null");
  assert.match(src, /team\?: string \| null/, "team may be null");
});
