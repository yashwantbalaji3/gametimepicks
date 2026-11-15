/**
 * NFL player evidence — synthetic games only (no committed outcome is read).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/player-evidence.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceFile, gameLog, lineRecord, summary, trendTier, valueOf } from "./player-evidence.mjs";

const P = "nfl-athlete-9";
/* the real player-events-v1 shape: home/away are abbreviation STRINGS */
const game = (id, week, date, home, away, players) => ({ providerEventId: id, season: 2026, week, dateUtc: date, home, away, ftHome: 20, ftAway: 17, players });
const row = (team, rec, recYds, extra = {}) => ({ playerId: P, name: "WR Nine", teamAbbr: team, rec, recYds, ...extra });

// weeks 1-2 for OLD, traded; weeks 3..8 for NEW; week 6 he has no stat line; week 9 is after kickoff
const GAMES = [
  game("1", 1, "2026-09-13T17:00Z", "OLD", "XXX", [row("OLD", 2, 20)]),
  game("2", 2, "2026-09-20T17:00Z", "YYY", "OLD", [row("OLD", 3, 31)]),
  game("2b", 2, "2026-09-20T20:00Z", "NEW", "ZZZ", []), // NEW's game before he joined: not his
  game("3", 3, "2026-09-27T17:00Z", "NEW", "AAA", [row("NEW", 5, 60)]),
  game("4", 4, "2026-10-04T17:00Z", "BBB", "NEW", [row("NEW", 6, 72, { recTd: 1 })]),
  game("5", 5, "2026-10-11T17:00Z", "NEW", "CCC", [row("NEW", 4, 55)]),
  game("6", 6, "2026-10-18T17:00Z", "DDD", "NEW", []),
  game("7", 7, "2026-10-25T17:00Z", "NEW", "EEE", [row("NEW", 7, 90)]),
  game("8", 8, "2026-11-01T17:00Z", "FFF", "NEW", [row("NEW", 5, 66, { rushTd: 1 })]),
  game("9", 9, "2026-11-08T17:00Z", "NEW", "GGG", [row("NEW", 9, 140)]),
];
const KICK = "2026-11-08T17:00Z";

test("game log: most recent first, before kickoff only, NO_STAT_LINE kept, pre-join team games excluded", () => {
  const log = gameLog(GAMES, P, "NEW", KICK);
  assert.deepEqual(log.map((e) => [e.eventId, e.team, e.state]), [["8", "NEW", "STAT_LINE"], ["7", "NEW", "STAT_LINE"], ["6", "NEW", "NO_STAT_LINE"], ["5", "NEW", "STAT_LINE"], ["4", "NEW", "STAT_LINE"], ["3", "NEW", "STAT_LINE"], ["2", "OLD", "STAT_LINE"], ["1", "OLD", "STAT_LINE"]]);
  assert.ok(!log.some((e) => e.eventId === "9"), "the game itself (and anything after kickoff) is never history");
  assert.ok(!log.some((e) => e.eventId === "2b"), "the new team's game before he joined is not his game");
  assert.deepEqual([log[0].opponent, log[0].homeAway, log[0].score], ["FFF", "A", "17-20"]);
});

test("values: missing stat line is null, never zero; anytime TD reads rush or receiving TD", () => {
  const log = gameLog(GAMES, P, "NEW", KICK);
  assert.equal(valueOf(log[2], "player_receptions"), null);
  assert.deepEqual(log.slice(0, 5).map((e) => valueOf(e, "anytime_td")), [1, 0, null, 0, 1]);
  const s = summary(log, "player_reception_yds", 5);
  assert.deepEqual([s.games, s.recorded, s.noStatLine, s.median, s.min, s.max], [5, 4, 1, 69, 55, 90]);
});

test("no observed line ⇒ no hit rate, whatever the history looks like", () => {
  const log = gameLog(GAMES, P, "NEW", KICK);
  assert.deepEqual(lineRecord(log, "player_receptions", 5), { state: "NO_OBSERVED_LINE", basis: "TODAY_LINE", window: 5 });
  assert.equal(lineRecord(log, "player_receptions", 5, { line: { line: null } }).state, "NO_OBSERVED_LINE");
  assert.equal(lineRecord(log, "player_receptions", 5, { basis: "OWN_LINE" }).state, "NO_OBSERVED_LINE");
});

test("a window with a NO_STAT_LINE game is INCOMPLETE and carries no 5/5 badge even if every recorded game hit", () => {
  const log = gameLog(GAMES, P, "NEW", KICK);
  const r = lineRecord(log, "player_receptions", 5, { line: { line: 3.5, sportsbook: "draftkings", capturedAt: "2026-11-08T12:00Z" } });
  assert.equal(r.state, "INCOMPLETE");
  assert.deepEqual([r.hits, r.missing], [4, 1]);
  assert.equal(r.badge, undefined);
  assert.equal(trendTier(r), null);
});

test("complete window: badge counts hits over N; pushes are separate and block a tier; short samples have no badge", () => {
  const full = gameLog(GAMES.filter((g) => g.providerEventId !== "6"), P, "NEW", KICK);
  const r = lineRecord(full, "player_receptions", 5, { line: { line: 4.5 } });
  assert.deepEqual([r.state, r.badge, r.hits, r.misses], ["COMPLETE", "4/5", 4, 1]);
  assert.equal(trendTier(r), "4/5");
  const push = lineRecord(full, "player_receptions", 5, { line: { line: 5 } });
  assert.equal(push.pushes, 2);
  assert.equal(trendTier(push), null, "a push is not a hit");
  const under = lineRecord(full, "player_receptions", 5, { line: { line: 7.5 }, side: "under" });
  assert.equal(under.badge, "5/5");
  const short = lineRecord(full, "player_receptions", 10, { line: { line: 1.5 } });
  assert.equal(short.state, "SHORT_SAMPLE");
  assert.equal(short.badge, undefined);
});

test("OWN_LINE basis: each game against the line captured before THAT game; a game without one is INCOMPLETE", () => {
  const full = gameLog(GAMES.filter((g) => g.providerEventId !== "6"), P, "NEW", KICK);
  // actual receptions: wk8 5, wk7 7, wk5 4, wk4 6, wk3 5 — vs own lines 4.5 / 6.5 / 4.5 / 6.5 / 5.5 ⇒ H H M M M
  const own = { 8: 4.5, 7: 6.5, 5: 4.5, 4: 6.5, 3: 5.5 };
  const r = lineRecord(full, "player_receptions", 5, { basis: "OWN_LINE", lineFor: (e) => (own[e.eventId] != null ? { line: own[e.eventId] } : null) });
  assert.deepEqual([r.state, r.badge, r.line], ["COMPLETE", "2/5", null]);
  assert.equal(lineRecord(full, "player_receptions", 5, { line: { line: 4.5 } }).badge, "4/5", "same games vs TODAY's 4.5 is a different claim");
  const gap = lineRecord(full, "player_receptions", 5, { basis: "OWN_LINE", lineFor: (e) => (e.eventId === "7" ? null : { line: 1.5 }) });
  assert.equal(gap.state, "INCOMPLETE");
});

test("evidence file is deterministic and carries no wall-clock", () => {
  const boards = [{ providerEventId: "9", kickoffUtc: KICK, players: [{ playerId: P, team: "NEW" }] }];
  const a = JSON.stringify(buildEvidenceFile({ boards, games: GAMES, sourceHash: "h" }));
  const b = JSON.stringify(buildEvidenceFile({ boards: [...boards], games: [...GAMES].reverse(), sourceHash: "h" }));
  assert.equal(a, b);
  assert.doesNotMatch(a, /generatedAt/);
  assert.equal(JSON.parse(a).events["9"].players[P].length, 8);
});

test("legacy { abbr } game shape reads the same", () => {
  const legacy = GAMES.map((g) => ({ ...g, home: { abbr: g.home }, away: { abbr: g.away } }));
  assert.deepEqual(gameLog(legacy, P, "NEW", KICK), gameLog(GAMES, P, "NEW", KICK));
});

test("nflverse side codes (LA, WAS) match ESPN player codes (LAR, WSH)", () => {
  const g = [{ providerEventId: "x", season: 2026, week: 1, dateUtc: "2026-09-13T17:00Z", home: "WAS", away: "LA", ftHome: 10, ftAway: 3, players: [{ playerId: P, teamAbbr: "WSH", rec: 1, recYds: 9 }] },
    { providerEventId: "y", season: 2026, week: 2, dateUtc: "2026-09-20T17:00Z", home: "DAL", away: "WAS", players: [] }];
  const log = gameLog(g, P, "WSH", "2026-10-01T00:00Z");
  assert.deepEqual(log.map((e) => [e.opponent, e.homeAway, e.state]), [["DAL", "A", "NO_STAT_LINE"], ["LAR", "H", "STAT_LINE"]]);
});
