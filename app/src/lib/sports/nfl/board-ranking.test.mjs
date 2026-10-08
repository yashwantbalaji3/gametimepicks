/**
 * Session 11 — the public NFL board availability gate (founder policy, 2026-10-04): a QUESTIONABLE player
 * must never appear in a public top ranking. One allowlist, applied inside the ONE ranking rule BEFORE the
 * top-N cut, failing closed on a missing / stale / conflicting availability read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BOARD_METRIC, PUBLIC_BOARD_CLEARED, boardAvailabilityState, isPublicNflBoardEligible, publicBoardEligibility, rankFamily,
} from "./board-ranking.mjs";

const AS_OF = "2031-10-05T10:00:00Z";
const AVAIL = { injuriesCapturedAt: "2031-10-05T09:00:00Z", injuries: "FRESH", rosters: "FRESH" };
const allMarkets = (v) => ({
  anytime_td: { probability: v / 1000 },
  player_receptions: { median: v / 10, mean: v / 10 },
  player_rush_yds: { median: v, mean: v },
  player_reception_yds: { median: v, mean: v },
  player_pass_yds: { median: v * 3, mean: v * 3 },
});
const player = (id, v, participation = "AVAILABLE_ROLE_UNCERTAIN") => ({ playerId: id, name: id, team: "AAA", participation, markets: allMarkets(v) });
const board = (players, availability = AVAIL) => ({ providerEventId: "9", matchup: "AAA @ BBB", kickoffUtc: "2031-10-05T17:00Z", availability, players });
const ids = (boards, family = "player_reception_yds", opts = { asOf: AS_OF }) => rankFamily(boards, family, BOARD_METRIC[family], opts).map((x) => x.player.playerId);

test("🔴 every blocked designation is refused; cleared players rank", () => {
  for (const state of ["QUESTIONABLE", "DOUBTFUL", "INACTIVE", "OUT", "IR", "PUP", "NFI", "SUSPENDED", "PRACTICE_SQUAD", "UNKNOWN", "SOURCE_STALE", "something-new"]) {
    assert.deepEqual(ids([board([player("x", 500, state), player("ok", 50)])]), ["ok"], `${state} must not rank`);
  }
  assert.deepEqual(ids([board([player("a", 90), player("b", 80, "ACTIVE_PROJECTED")])]), ["a", "b"], "healthy players are never removed");
  assert.deepEqual([...PUBLIC_BOARD_CLEARED].sort(), ["ACTIVE_PROJECTED", "AVAILABLE_ROLE_UNCERTAIN"], "the allowlist is exactly the no-designation states");
});

test("🔴 a missing participation is UNKNOWN, never available", () => {
  const p = player("x", 500); delete p.participation;
  assert.deepEqual(publicBoardEligibility(p, board([p]), AS_OF), { eligible: false, reason: "UNKNOWN" });
  assert.deepEqual(publicBoardEligibility({ ...p, participation: "" }, board([p]), AS_OF), { eligible: false, reason: "UNKNOWN" });
});

test("🔴 the gate runs BEFORE truncation — a blocked player is replaced by the next valid row", () => {
  const b = [board([player("q", 100, "QUESTIONABLE"), player("a", 90), player("b", 80), player("c", 70)])];
  assert.deepEqual(ids(b).slice(0, 2), ["a", "b"], "top-2 is two valid players, not one");
});

test("🔴 all five families go through the same gate", () => {
  const b = [board([player("q", 100, "QUESTIONABLE"), player("a", 90)])];
  for (const family of Object.keys(BOARD_METRIC)) assert.deepEqual(ids(b, family), ["a"], `${family} bypasses the gate`);
  assert.deepEqual(Object.keys(BOARD_METRIC).sort(), ["anytime_td", "player_pass_yds", "player_reception_yds", "player_receptions", "player_rush_yds"]);
});

test("🔴 availability read: missing / stale / not-FRESH / conflicting fail closed for every row", () => {
  const ok = player("a", 90);
  assert.equal(boardAvailabilityState(board([ok]), AS_OF), "CURRENT");
  assert.equal(boardAvailabilityState(board([ok], null), AS_OF), "MISSING");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, injuriesCapturedAt: null }), AS_OF), "MISSING");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, injuriesCapturedAt: "2031-10-04T09:59:00Z" }), AS_OF), "STALE", "older than 24 h");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, injuriesCapturedAt: "2031-10-04T10:00:00Z" }), AS_OF), "CURRENT", "exactly 24 h is the bound");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, injuries: "STALE" }), AS_OF), "STALE");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, rosters: "MISSING" }), AS_OF), "STALE");
  assert.equal(boardAvailabilityState(board([ok], { ...AVAIL, injuriesCapturedAt: "2031-10-05T12:00:00Z" }), AS_OF), "CONFLICTING", "a capture after the ranking instant");
  for (const bad of [null, { ...AVAIL, injuries: "STALE" }, { ...AVAIL, injuriesCapturedAt: "2031-10-01T00:00:00Z" }]) {
    assert.deepEqual(ids([board([ok], bad)]), [], "a healthy label on an unreadable availability read is not availability");
  }
  assert.equal(isPublicNflBoardEligible(ok, board([ok]), AS_OF), true);
});

test("removals are named, never silent; asOf is required", () => {
  const blocked = [];
  rankFamily([board([player("q", 100, "QUESTIONABLE"), player("a", 90)])], "player_rush_yds", "median", { asOf: AS_OF, blocked });
  assert.deepEqual(blocked, [{ playerId: "q", name: "q", team: "AAA", providerEventId: "9", reason: "QUESTIONABLE" }]);
  assert.throws(() => rankFamily([board([])], "player_rush_yds", "median"), /asOf/);
  assert.throws(() => rankFamily([board([])], "player_rush_yds", "median", { asOf: "soon" }), /asOf/);
});

test("every public top list reads the ONE allowlist (no INACTIVE-only filter survives)", () => {
  const APP = process.cwd();
  const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
  assert.match(src("scripts/nfl/build-nfl-weekly-boards.mjs"), /rankFamily\(scoped, family, metric, \{ asOf: NOW, blocked \}\)/);
  assert.match(src("scripts/results/freeze-daily-top-boards.mjs"), /rankFamily\(boards, family, metric, \{ asOf: frozenAt \}\)/);
  for (const rel of ["src/components/nfl/player-board.tsx", "src/app/nfl/game/[eventId]/page.tsx"]) {
    const s = src(rel);
    assert.match(s, /PUBLIC_BOARD_CLEARED\.includes\(p\.participation\)/, `${rel} must filter with the shared allowlist`);
    assert.doesNotMatch(s, /participation !== "INACTIVE"/, `${rel} still filters INACTIVE only`);
  }
  // 2026-10-08: the game page and the hub boards rank through the shared forecast view, which extends the SAME
  // allowlist with World Model V2's own ACTIVE state — never a second list.
  assert.match(src("src/lib/sports/nfl/forecast-view.mjs"), /CLEARED = Object\.freeze\(\[\.\.\.PUBLIC_BOARD_CLEARED, "ACTIVE"\]\)/);
  assert.doesNotMatch(src("src/lib/sports/nfl/forecast-view.mjs"), /!== "INACTIVE"/);
  const producer = src("scripts/nfl/build-nfl-player-board.mjs");
  assert.match(producer, /availability: \{\s*injuriesCapturedAt: injuriesArtifact\.generatedAt/, "the per-game board records its availability read");
  assert.match(src("scripts/nfl/build-end-zone-vault.mjs"), /role\?\.state === "QUESTIONABLE"\) \{\s*withheld\.push/, "the Vault withholds a questionable player");
});
