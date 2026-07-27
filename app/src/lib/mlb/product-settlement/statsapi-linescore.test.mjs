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
    // Every STORED row is a genuine official result — no in-progress row (whose score would still
    // move) and no resultless row (postponed / suspended). `finalCount` describes the stored rows;
    // `gameCount` is how many games were SCHEDULED, so a partial slate stays visibly partial rather
    // than a short cache passing as a complete one.
    assert.equal(cache.finalCount, cache.games.length, `${f}: finalCount must describe the stored rows`);
    assert.ok(cache.gameCount >= cache.finalCount, `${f}: cannot have more results than scheduled games`);
    for (const g of cache.games) {
      assert.equal(g.isFinal, true, `${f}: only final games are stored`);
      assert.ok(typeof g.homeRuns === "number" && typeof g.awayRuns === "number", `${f}: final game has both scores`);
      assert.ok(!/postpone|suspend|cancel/i.test(g.status ?? ""), `${f}: ${g.status} is not an official result`);
    }
  }
});

/**
 * POSTPONED-IS-NOT-FINAL (Sprint 025). StatsAPI reports a postponed game with
 * abstractGameState "Final" and no team scores. Keying finality off the abstract state alone
 * admitted a resultless row into the committed cache (PIT/MIL, 2026-07-10). The file header
 * always said Postponed is not final; the code only excluded "C" (cancelled).
 */
test("6 · a postponed / suspended game is never final, even though StatsAPI calls it Final", () => {
  const mk = (coded, detailed, scores) => ({
    gamePk: 1, officialDate: "2026-07-10",
    status: { abstractGameState: "Final", codedGameState: coded, detailedState: detailed },
    teams: { home: { team: { abbreviation: "PIT" }, ...(scores ? { score: 4 } : {}) },
             away: { team: { abbreviation: "MIL" }, ...(scores ? { score: 2 } : {}) } },
  });

  for (const [coded, detailed] of [["D", "Postponed"], ["C", "Cancelled"], ["U", "Suspended"]]) {
    const r = parseScheduleGame(mk(coded, detailed, false));
    assert.equal(r.isFinal, false, `${detailed} must not be final`);
    assert.equal(r.homeRuns, null, `${detailed} must carry no runs`);
    assert.equal(r.awayRuns, null, `${detailed} must carry no runs`);
  }

  // Fail-closed backstop: any other resultless "Final" is still refused...
  assert.equal(parseScheduleGame(mk("F", "Final", false)).isFinal, false, "a Final with no scores is not a result");
  // ...while a genuinely played game is unaffected.
  const played = parseScheduleGame(mk("F", "Final", true));
  assert.equal(played.isFinal, true, "a real final still grades");
  assert.equal(played.homeRuns, 4);
  assert.equal(played.awayRuns, 2);
});
