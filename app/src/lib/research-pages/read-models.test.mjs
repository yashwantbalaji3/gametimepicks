/**
 * TEAM + PLAYER RESEARCH — pure read-model contracts (v1.3). Fixtures are tiny synthetic platform records, so every
 * rule is pinned without the store.
 *
 * Run: npx tsx --test src/lib/research/read-models.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { assignSlugs, slugifyLabel } from "./slugs.mjs";
import { buildTeamResearch, teamGameResult, TEAM_ROW } from "./team-read-model.mjs";
import { buildPlayerResearch, boutOutcome, recordsParticipation, PLAYER_ROW } from "./player-read-model.mjs";
import { playerEligibility, teamEligibility, THRESHOLDS } from "./eligibility.mjs";
import { coverageFor, coverageNoteText, COVERAGE_COPY } from "./coverage.mjs";
import { formatGameDate, isUpcoming, recentFormSentence, windowSentence, boutOutcomeLabel, formatFightRecord } from "./format.mjs";
import { sportColumns } from "./stat-groups.mjs";
import { assertProjectionVersion } from "./contract.mjs";

const label = (id) => id.replace(/^[A-Z]+-/, "");
const game = (o) => ({ schemaVersion: 1, sportId: "NFL", leagueId: "NFL", seasonId: "NFL-2025", neutralSite: null, statusClass: "FINAL", startUtc: null, officialDate: null, competitors: null, card: null, ...o });
const score = (sportId, gameId, teamId, v, fam = sportId === "MLB" ? "mlb.final-score" : "nfl.final-score", key = sportId === "MLB" ? "runs" : "points") =>
  ({ family: fam, sportId, gameId, teamId, isFinal: true, stats: { [key]: v } });
const byGame = (rows) => { const m = new Map(); for (const r of rows) { const a = m.get(r.gameId) ?? []; a.push(r); m.set(r.gameId, a); } return m; };

// ─── slugs ──────────────────────────────────────────────────────────────────────────────────────
test("SL1 slugs are safe ASCII from the label; punctuation, apostrophes, suffixes and accents are stable", () => {
  assert.equal(slugifyLabel("Ja'Marr Chase"), "jamarr-chase");
  assert.equal(slugifyLabel("Amon-Ra St. Brown"), "amon-ra-st-brown");
  assert.equal(slugifyLabel("Marvin Harrison Jr."), "marvin-harrison-jr");
  assert.equal(slugifyLabel("Jay Rodríguez"), "jay-rodriguez");
  assert.equal(slugifyLabel("Martin Ødegaard"), "martin-odegaard");
  assert.equal(slugifyLabel("Brighton & Hove Albion"), "brighton-hove-albion");
  assert.equal(slugifyLabel("金"), "");
});

test("SL2 same-name collision suffixes EVERY claimant by canonical id, independent of order", () => {
  const a = [{ id: "nfl-athlete-4035671", label: "Mike Williams" }, { id: "nfl-athlete-15894", label: "Mike Williams" }, { id: "nfl-athlete-1", label: "Josh Allen" }];
  const s1 = assignSlugs(a);
  const s2 = assignSlugs([...a].reverse());
  assert.equal(s1.get("nfl-athlete-4035671"), "mike-williams-4035671");
  assert.equal(s1.get("nfl-athlete-15894"), "mike-williams-15894");
  assert.equal(s1.get("nfl-athlete-1"), "josh-allen");
  assert.deepEqual([...s1].sort(), [...s2].sort(), "order must not decide who gets the plain slug");
  assert.ok(![...s1.values()].includes("mike-williams"), "an ambiguous plain slug must not exist");
  assert.equal(assignSlugs([{ id: "ufc-athlete-9", label: "金" }]).get("ufc-athlete-9"), "id-9");
  assert.throws(() => assignSlugs([{ id: "x-1", label: "A" }, { id: "x-1", label: "A" }]), /duplicate canonical id/);
});

// ─── team read model ────────────────────────────────────────────────────────────────────────────
test("TR1 a record counts only FINAL games with BOTH scores; pending/postponed never count; zeros preserved; newest first", () => {
  const T = "nfl-team-1", O = "nfl-team-2", P = "nfl-team-3";
  const games = [
    game({ id: "10", startUtc: "2025-09-07T17:00:00Z", homeTeamId: T, awayTeamId: O }),
    game({ id: "11", startUtc: "2025-09-14T17:00:00Z", homeTeamId: P, awayTeamId: T }),
    game({ id: "12", startUtc: "2025-09-21T17:00:00Z", homeTeamId: T, awayTeamId: P, statusClass: "NOT_FINAL" }), // pending
    game({ id: "13", startUtc: "2025-09-28T17:00:00Z", homeTeamId: O, awayTeamId: T }), // FINAL but one score missing
    game({ id: "14", startUtc: "2025-10-05T17:00:00Z", homeTeamId: T, awayTeamId: O }),
  ];
  const stats = byGame([score("NFL", "10", T, 0), score("NFL", "10", O, 3), score("NFL", "11", P, 20), score("NFL", "11", T, 20),
    score("NFL", "12", T, 99), score("NFL", "12", P, 0), score("NFL", "13", T, 17), score("NFL", "14", T, 24), score("NFL", "14", O, 10)]);
  const t = buildTeamResearch({ sportId: "NFL", team: { id: T, name: "Team", abbreviation: "TM", leagueId: "NFL" }, games: [...games].reverse(), teamStatsByGame: stats, seasonLabel: label });
  assert.deepEqual(t.games.map((r) => r[TEAM_ROW.GAME]), ["14", "13", "12", "11", "10"], "canonical event order, newest first");
  assert.deepEqual(t.games.map((r) => r[TEAM_ROW.RESULT]), ["W", null, null, "T", "L"]);
  assert.equal(t.games.find((r) => r[0] === "10")[TEAM_ROW.OWN], 0, "a 0 is a recorded zero");
  assert.equal(t.games.find((r) => r[0] === "12")[TEAM_ROW.STATUS], "S");
  assert.deepEqual(t.seasons[0].record, { w: 1, l: 1, t: 1, finals: 3, scored: 44, allowed: 33 });
  assert.equal(t.games.find((r) => r[0] === "11")[TEAM_ROW.HA], "A");
  assert.deepEqual(t.recentForm, { n: 3, w: 1, l: 1, t: 1, gameIds: ["14", "11", "10"] });
});

test("TR2 EPL never derives a result or record, even if score-shaped rows were present", () => {
  const T = "epl-team-1", O = "epl-team-2";
  const g = game({ id: "740001", sportId: "EPL", leagueId: "EPL", seasonId: "EPL-2025-26", startUtc: "2025-08-16T14:00:00Z", homeTeamId: T, awayTeamId: O });
  const stats = byGame([score("EPL", "740001", T, 2, "nfl.final-score", "points"), score("EPL", "740001", O, 1, "nfl.final-score", "points")]);
  assert.equal(teamGameResult("EPL", g, T, stats), null);
  const t = buildTeamResearch({ sportId: "EPL", team: { id: T, name: "Club", abbreviation: "CLB", leagueId: "EPL" }, games: [g], teamStatsByGame: stats, seasonLabel: label });
  assert.equal(t.supportsResults, false);
  assert.equal(t.seasons[0].record, null);
  assert.equal(t.recentForm, null);
  assert.equal(t.games[0][TEAM_ROW.RESULT], null);
});

test("TR3 MLB date-only historical games order by official date and a 0-run final is a real result", () => {
  const T = "mlb-team-121", O = "mlb-team-147";
  const games = [
    game({ id: "700", sportId: "MLB", leagueId: "MLB", seasonId: "MLB-2024", officialDate: "2024-04-02", homeTeamId: O, awayTeamId: T }),
    game({ id: "699", sportId: "MLB", leagueId: "MLB", seasonId: "MLB-2024", officialDate: "2024-04-01", homeTeamId: T, awayTeamId: O }),
  ];
  const stats = byGame([score("MLB", "700", T, 0), score("MLB", "700", O, 1), score("MLB", "699", T, 5), score("MLB", "699", O, 0)]);
  const t = buildTeamResearch({ sportId: "MLB", team: { id: T, name: "Mets", abbreviation: "NYM", leagueId: "MLB" }, games, teamStatsByGame: stats, seasonLabel: label });
  assert.deepEqual(t.games.map((r) => [r[0], r[1], r[6], r[7], r[8]]), [["700", "2024-04-02", 0, 1, "L"], ["699", "2024-04-01", 5, 0, "W"]]);
});

// ─── player read model ──────────────────────────────────────────────────────────────────────────
const nflLine = (gameId, teamId, oppId, stats, fam = "nfl.espn-player-lines") => ({ family: fam, sportId: "NFL", gameId, playerId: "nfl-athlete-7", teamId, opponentTeamId: oppId, stats });
const espn = (o) => ({ passCompletions: null, passAttempts: null, passingYards: null, passingTds: null, interceptionsThrown: null, sacksTaken: null, rushingAttempts: null, rushingYards: null, rushingTds: null, targets: null, receptions: null, receivingYards: null, receivingTds: null, fumbles: null, fumblesLost: null, ...o });
const verse = (o) => ({ participation: "PLAYED", offenseSnaps: 40, targets: 0, receptions: 0, receivingYards: 0, carries: 0, rushingYards: 0, passAttempts: 0, passCompletions: 0, passingYards: 0, rushingTds: 0, receivingTds: 0, otherTds: 0, ...o });

function nflFixture() {
  const LAC = "nfl-team-24", CHI = "nfl-team-3", KC = "nfl-team-12";
  const games = [
    game({ id: "g1", seasonId: "NFL-2024", startUtc: "2024-09-08T17:00:00Z", homeTeamId: CHI, awayTeamId: KC }),
    game({ id: "g2", seasonId: "NFL-2025", startUtc: "2025-09-07T17:00:00Z", homeTeamId: LAC, awayTeamId: KC }),
    game({ id: "g3", seasonId: "NFL-2025", startUtc: "2025-09-14T17:00:00Z", homeTeamId: KC, awayTeamId: LAC }),
    game({ id: "g4", seasonId: "NFL-2025", startUtc: "2025-09-21T17:00:00Z", homeTeamId: LAC, awayTeamId: KC }),
    game({ id: "g5", seasonId: "NFL-2019", officialDate: "2019-10-06", homeTeamId: CHI, awayTeamId: KC }),
  ];
  const rows = [
    nflLine("g1", CHI, KC, espn({ targets: 9, receptions: 7, receivingYards: 82 })),
    nflLine("g1", CHI, KC, verse({ targets: 10, receptions: 8, receivingYards: 90 }), "nfl.nflverse-skill-lines"), // ESPN wins, never mixed
    nflLine("g2", LAC, KC, espn({ targets: 5, receptions: 0, receivingYards: 0 })), // zeros recorded
    nflLine("g3", LAC, KC, espn({ targets: null, receptions: null })), // records nothing → not a log row
    nflLine("g3", LAC, KC, verse({ targets: 4, receptions: 3, receivingYards: 41, carries: 1, rushingYards: 5 }), "nfl.nflverse-skill-lines"), // fills g3
    nflLine("g4", LAC, KC, espn({ targets: 6, receptions: 4, receivingYards: 77, interceptionsThrown: null })),
    nflLine("g5", CHI, KC, verse({ targets: 11, receptions: 6, receivingYards: 91 }), "nfl.nflverse-skill-lines"),
  ];
  const stats = byGame([score("NFL", "g4", LAC, 21), score("NFL", "g4", KC, 24)]);
  return { games: new Map(games.map((g) => [g.id, g])), rows, stats, LAC, CHI };
}

test("PR1 one family per game (ESPN precedence), newest first, historical team kept, missing ≠ zero", () => {
  const f = nflFixture();
  const p = buildPlayerResearch({ sportId: "NFL", player: { id: "nfl-athlete-7", name: "Receiver", currentTeamId: "nfl-team-99" }, statRows: f.rows, gamesById: f.games, teamStatsByGame: f.stats, seasonLabel: label });
  assert.deepEqual(p.gameLog.map((r) => r[PLAYER_ROW.GAME]), ["g4", "g3", "g2", "g1", "g5"]);
  const cols = sportColumns("NFL").map((c) => c.key);
  const v = (r, k) => r[PLAYER_ROW.VALUES + cols.indexOf(k)];
  const g1 = p.gameLog.find((r) => r[0] === "g1");
  assert.equal(g1[PLAYER_ROW.FAM], "E");
  assert.equal(v(g1, "receivingYards"), 82, "ESPN line, not nflverse's 90");
  assert.equal(g1[PLAYER_ROW.TEAM], f.CHI, "the team of THAT game, never the current team");
  const g3 = p.gameLog.find((r) => r[0] === "g3");
  assert.equal(g3[PLAYER_ROW.FAM], "V");
  assert.equal(v(g3, "rushingAttempts"), 1, "nflverse carries fill rushing attempts");
  assert.equal(v(g3, "interceptionsThrown"), null, "nflverse has no INT field: not recorded, never 0");
  const g2 = p.gameLog.find((r) => r[0] === "g2");
  assert.equal(v(g2, "receptions"), 0, "a recorded zero stays zero");
  assert.equal(v(g2, "rushingYards"), null, "ESPN had no rushing block: null, not 0");
  const g4 = p.gameLog.find((r) => r[0] === "g4");
  assert.deepEqual([g4[PLAYER_ROW.HA], g4[PLAYER_ROW.RESULT], g4[PLAYER_ROW.TEAM_SCORE], g4[PLAYER_ROW.OPP_SCORE]], ["H", "L", 21, 24]);
  assert.equal(p.gameLog.find((r) => r[0] === "g5")[PLAYER_ROW.DATE], "2019-10-06");
  assert.equal(p.currentTeamId, "nfl-team-99");
});

test("PR2 Last 3/5/10 = newest rows where THAT stat is recorded; zeros in, nulls out, n stated", () => {
  const f = nflFixture();
  const p = buildPlayerResearch({ sportId: "NFL", player: { id: "nfl-athlete-7", name: "Receiver", currentTeamId: null }, statRows: f.rows, gamesById: f.games, teamStatsByGame: f.stats, seasonLabel: label });
  const [w3, w5, w10] = p.windows.receivingYards;
  assert.deepEqual(w3, { size: 3, n: 3, values: [77, 41, 0], sum: 118, avg: 39.3 });
  assert.deepEqual([w5.n, w5.values], [5, [77, 41, 0, 82, 91]]);
  assert.equal(w10.n, 5, "fewer games than the window size: n says so");
  assert.equal(p.groups[0].key, "receiving");
  assert.ok(p.groups.some((g) => g.key === "rushing"));
  assert.ok(!p.groups.some((g) => g.key === "passing"), "a group whose primary stat is never non-zero is not listed");
  assert.equal(p.windows.interceptionsThrown, undefined);
});

test("PR3 EPL: an unused substitute is not an appearance; started vs came on kept", () => {
  const T = "epl-team-359", O = "epl-team-360";
  const g = (id, d) => game({ id, sportId: "EPL", leagueId: "EPL", seasonId: "EPL-2025-26", startUtc: d, homeTeamId: T, awayTeamId: O });
  const line = (gameId, o) => ({ family: "epl.espn-player-match", sportId: "EPL", gameId, playerId: "epl-athlete-5", teamId: T, opponentTeamId: O, stats: { position: "F", formationPlace: "9", started: false, subbedIn: false, subbedOut: false, appeared: false, goals: 0, assists: 0, shots: 0, shotsOnGoal: 0, yellowCards: 0, redCards: 0, fouls: 0, offsides: 0, saves: 0, goalsAgainst: 0, ...o } });
  const games = new Map([g("1", "2025-08-16T14:00:00Z"), g("2", "2025-08-23T14:00:00Z")].map((x) => [x.id, x]));
  const rows = [line("1", { started: true, appeared: true, goals: 2, shots: 4 }), line("2", { appeared: false })];
  assert.equal(recordsParticipation(rows[1]), false);
  const p = buildPlayerResearch({ sportId: "EPL", player: { id: "epl-athlete-5", name: "Striker" }, statRows: rows, gamesById: games, teamStatsByGame: new Map(), seasonLabel: label });
  assert.equal(p.gameLog.length, 1);
  assert.equal(p.gameLog[0][PLAYER_ROW.DETAIL], "S");
  assert.equal(p.gameLog[0][PLAYER_ROW.RESULT], null, "no EPL match result exists");
});

test("PR4 UFC: a no-winner bout is N (never L); record counts it separately", () => {
  assert.equal(boutOutcome({ won: true, boutHadWinner: true }), "W");
  assert.equal(boutOutcome({ won: false, boutHadWinner: true }), "L");
  assert.equal(boutOutcome({ won: false, boutHadWinner: false }), "N");
  const g = (id, d) => game({ id, sportId: "UFC", leagueId: "UFC", seasonId: "UFC-2025", startUtc: d, competitors: [{ corner: "RED", playerId: "ufc-athlete-1" }, { corner: "BLUE", playerId: "ufc-athlete-2" }], card: { id: "c1", name: "Card" } });
  const bout = (id, won, had) => ({ family: "ufc.bout-result", sportId: "UFC", gameId: id, playerId: "ufc-athlete-1", teamId: null, opponentTeamId: null, opponentPlayerId: "ufc-athlete-2", stats: { won, boutHadWinner: had } });
  const games = new Map([g("1", "2025-01-01T00:00:00Z"), g("2", "2025-02-01T00:00:00Z"), g("3", "2025-03-01T00:00:00Z")].map((x) => [x.id, x]));
  const p = buildPlayerResearch({ sportId: "UFC", player: { id: "ufc-athlete-1", name: "Fighter" }, statRows: [bout("1", true, true), bout("2", false, false), bout("3", false, true)], gamesById: games, teamStatsByGame: new Map(), seasonLabel: label });
  assert.deepEqual(p.record, { w: 1, l: 1, n: 1 });
  assert.deepEqual(p.gameLog.map((r) => r[PLAYER_ROW.RESULT]), ["L", "N", "W"]);
  assert.equal(boutOutcomeLabel("N"), "No winner (draw or no contest)");
  assert.equal(formatFightRecord(p.record), "1–1 · 1 no winner");
});

test("PR5 ordering ignores grading/observation times carried on rows", () => {
  const f = nflFixture();
  const rows = f.rows.map((r, i) => ({ ...r, gradedAt: `2030-01-0${(9 - i) % 9 + 1}T00:00:00Z`, observedAt: "2030-01-01T00:00:00Z" }));
  const p = buildPlayerResearch({ sportId: "NFL", player: { id: "nfl-athlete-7", name: "Receiver", currentTeamId: null }, statRows: rows, gamesById: f.games, teamStatsByGame: f.stats, seasonLabel: label });
  assert.deepEqual(p.gameLog.map((r) => r[0]), ["g4", "g3", "g2", "g1", "g5"]);
});

// ─── eligibility + coverage + format ────────────────────────────────────────────────────────────
test("EL1 eligibility is threshold-driven, sport-specific, and MLB/EPL-team pages are never indexable", () => {
  assert.deepEqual(playerEligibility({ sport: "MLB", games: THRESHOLDS.MLB_MIN, seasonCounts: {}, currentTeamId: null, hasUpcoming: false }), { published: true, indexable: false, reason: "PARTIAL_CAPTURED_CATEGORIES" });
  assert.equal(playerEligibility({ sport: "MLB", games: THRESHOLDS.MLB_MIN - 1, seasonCounts: {}, currentTeamId: null, hasUpcoming: false }).published, false);
  assert.equal(playerEligibility({ sport: "NFL", games: 1, seasonCounts: { "NFL-2025": 1 }, currentTeamId: "nfl-team-1", hasUpcoming: false }).indexable, false, "a rostered player with one game gets a page but is thin → noindex");
  assert.equal(playerEligibility({ sport: "NFL", games: 7, seasonCounts: { "NFL-2025": 7 }, currentTeamId: null, hasUpcoming: false }).published, false);
  assert.equal(playerEligibility({ sport: "NFL", games: 30, seasonCounts: { "NFL-2019": 30 }, currentTeamId: null, hasUpcoming: false }).published, false, "old volume alone is not eligible");
  assert.equal(playerEligibility({ sport: "EPL", games: 50, seasonCounts: { "EPL-2025-26": 9 }, currentTeamId: null, hasUpcoming: false }).published, false);
  assert.deepEqual(playerEligibility({ sport: "UFC", games: 1, seasonCounts: {}, currentTeamId: null, hasUpcoming: true }), { published: true, indexable: false, reason: "UPCOMING_BOUT" });
  assert.equal(playerEligibility({ sport: "UFC", games: 4, seasonCounts: {}, currentTeamId: null, hasUpcoming: false }).published, false);
  assert.deepEqual(teamEligibility({ sport: "EPL", finalsWithResult: 0, seasons: ["EPL-2026-27"] }), { published: true, indexable: false, reason: "CURRENT_FIXTURES_PARTIAL" });
  assert.equal(teamEligibility({ sport: "NFL", finalsWithResult: 0, seasons: ["NFL-2026"] }).published, false);
});

test("CV1 coverage copy is centralised, provider-free, never claims 'career' or completeness; unknown code throws", () => {
  for (const [code, text] of Object.entries(COVERAGE_COPY)) {
    assert.doesNotMatch(text, /career|all-time|complete history|espn|nflverse|statsapi|openfootball|SOURCE_MISSING|UNSUPPORTED/i, code);
  }
  const nfl = coverageFor({ kind: "player", sport: "NFL", seasons: ["NFL-2025", "NFL-2019"], firstSeasonLabel: "2019", lastSeasonLabel: "2025", hasPre2023: true });
  assert.deepEqual(nfl.notes, ["NFL_PLAYER_2026_BLOCKED", "NFL_PLAYER_PRE_2023_PARTIAL"]);
  assert.match(coverageNoteText("NFL_PLAYER_2026_BLOCKED", nfl), /not available yet/);
  assert.match(coverageNoteText("EPL_PLAYER_2026_27_BLOCKED", { from: "2022-23", to: "2025-26" }), /2022-23 to 2025-26/);
  assert.deepEqual(coverageFor({ kind: "team", sport: "EPL", seasons: [] }).unavailable, ["RESULTS_UNAVAILABLE"]);
  assert.throws(() => coverageNoteText("NOPE", nfl), /unknown note code/);
});

test("FM1 dates are absolute; date-only values never shift a day; upcoming needs a known future instant on the reader clock", () => {
  assert.equal(formatGameDate("2023-04-01"), "Apr 1, 2023");
  assert.equal(formatGameDate("2025-09-15T00:15:00Z"), "Sep 14, 2025", "an 8:15 PM ET kickoff is the Eastern date");
  assert.equal(formatGameDate(null), "Date not recorded");
  const now = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(isUpcoming("2026-09-18T00:00:00Z", now), true);
  assert.equal(isUpcoming("2026-09-17T11:59:00Z", now), false);
  assert.equal(isUpcoming("2026-09-18", now), false, "a date without an instant is never upcoming");
  assert.equal(isUpcoming(null, now), false);
  assert.equal(recentFormSentence({ n: 5, w: 3, l: 2, t: 0 }, "The team"), "The team won 3 of its last 5 recorded finals.");
  assert.equal(windowSentence({ size: 5, n: 3, values: [82, 91, 77] }, { label: "Receiving yards" }), "Recorded 82, 91, 77 receiving yards in the 3 available games.");
});

test("CT1 a projection of an unknown schema version is refused", () => {
  assert.throws(() => assertProjectionVersion({ schemaVersion: 2 }, "x"), /not readable/);
  assert.throws(() => assertProjectionVersion(null, "x"), /not an object/);
  assert.equal(assertProjectionVersion({ schemaVersion: 1 }, "x").schemaVersion, 1);
});
