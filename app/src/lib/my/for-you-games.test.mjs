/** Session 9 · I5 — For You on /my reorders published games by follows; it never edits them or reads results. */
import test from "node:test";
import assert from "node:assert/strict";
import { forYouGames } from "./for-you-games.mjs";

const g = (id, home, away, start = "2026-10-04T17:00:00Z", sport = "NFL") => ({ sport, gameId: id, startUtc: start, homeId: home, awayId: away, homeName: home, awayName: away, href: null, forecast: null });
const NOW = Date.parse("2026-10-02T12:00:00Z");

test("followed teams first, official order otherwise; started games excluded; objects untouched", () => {
  const games = [g("1", "nfl-team-1", "nfl-team-3"), g("2", "nfl-team-2", "nfl-team-4"), g("0", "nfl-team-9", "nfl-team-8", "2026-10-01T17:00:00Z")];
  const frozen = JSON.stringify(games);
  const r = forYouGames(games, [{ sport: "NFL", entityType: "team", id: "nfl-team-4" }], { nowMs: NOW });
  assert.deepEqual(r.rows.map((x) => x.game.gameId), ["2", "1"]);
  assert.deepEqual(r.rows[0].reasons, ["A team you follow"]);
  assert.equal(r.rows[0].game, games[1], "identity preserved");
  assert.equal(JSON.stringify(games), frozen, "nothing edited");
});

test("a user's results cannot reach the ordering (no such input exists)", () => {
  assert.throws(() => forYouGames([g("1", "a", "b")], [], { nowMs: NOW, prefs: { lastResult: "loss" } }), /only explicit reader choices/);
  assert.throws(() => forYouGames([g("1", "a", "b")], [], { nowMs: NOW, prefs: { bankrollDelta: -300 } }), /only explicit reader choices/);
});
