/**
 * STATSAPI LINESCORE PARSER (2026-07-09) — pure extraction, final-only, never a fabricated score.
 *
 * Pins: a Final game parses official scores; a non-final (Preview/Live) or cancelled game exposes NO
 * runs (null) and isFinal=false so it can't be graded; the payload walker handles dates[].games[]; and
 * the committed final-date caches are all genuinely final (no volatile in-progress rows).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseScheduleGame, parseSchedulePayload, isGradeable } from "./statsapi-linescore.ts";

const app = process.cwd();
const repo = path.join(app, "..");

const finalGame = { gamePk: 823202, officialDate: "2026-07-08", status: { abstractGameState: "Final", detailedState: "Final", codedGameState: "F" }, teams: { home: { team: { abbreviation: "SF", name: "San Francisco Giants" }, score: 0 }, away: { team: { abbreviation: "TOR", name: "Toronto Blue Jays" }, score: 10 } } };
const liveGame = { gamePk: 999001, officialDate: "2026-07-09", status: { abstractGameState: "Live", detailedState: "In Progress", codedGameState: "I" }, teams: { home: { team: { abbreviation: "NYY" }, score: 3 }, away: { team: { abbreviation: "BOS" }, score: 2 } } };
const cancelledGame = { gamePk: 999002, officialDate: "2026-07-09", status: { abstractGameState: "Final", detailedState: "Cancelled", codedGameState: "C" }, teams: { home: { team: { abbreviation: "CHC" }, score: 0 }, away: { team: { abbreviation: "STL" }, score: 0 } } };

test("1 · a Final game parses official scores + isFinal", () => {
  const r = parseScheduleGame(finalGame);
  assert.equal(r.isFinal, true);
  assert.equal(r.homeTeam, "SF"); assert.equal(r.awayTeam, "TOR");
  assert.equal(r.homeRuns, 0); assert.equal(r.awayRuns, 10);
  assert.equal(r.source, "statsapi");
  assert.ok(isGradeable(r));
});

test("2 · a non-final (Live) game exposes NO runs and is not gradeable", () => {
  const r = parseScheduleGame(liveGame);
  assert.equal(r.isFinal, false);
  assert.equal(r.homeRuns, null, "no mid-game score exposed for settlement");
  assert.equal(r.awayRuns, null);
  assert.ok(!isGradeable(r), "live game is not gradeable");
});

test("3 · a cancelled game (codedGameState C) is not final", () => {
  const r = parseScheduleGame(cancelledGame);
  assert.equal(r.isFinal, false);
  assert.ok(!isGradeable(r));
});

test("4 · payload walker reads dates[].games[]", () => {
  const rs = parseSchedulePayload({ dates: [{ games: [finalGame, liveGame] }] });
  assert.equal(rs.length, 2);
  assert.equal(rs.filter((r) => r.isFinal).length, 1);
  assert.deepEqual(parseSchedulePayload({}), [], "empty payload ⇒ no rows");
});

test("5 · committed final-date caches are genuinely final (deterministic, no in-progress rows)", () => {
  const dir = path.join(repo, "data/internal/mlb/linescores");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const cache = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.equal(cache.source, "statsapi");
    assert.equal(cache.finalCount, cache.gameCount, `${f}: every committed game is final (no volatile rows)`);
    for (const g of cache.games) {
      assert.equal(g.isFinal, true);
      assert.ok(typeof g.homeRuns === "number" && typeof g.awayRuns === "number", `${f}: final game has both scores`);
    }
  }
});
