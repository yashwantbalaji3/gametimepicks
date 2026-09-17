/**
 * DATA PLATFORM ADAPTERS — identity hazards on sanitized slices of REAL committed data (v1.2 · D1206).
 *
 * Every fixture row below was copied from a committed artifact (paths in each section) and trimmed to the
 * fields the adapter reads. Hazards pinned: doubleheaders, a postponed game that kept its gamePk and moved
 * two months, name-only sources, ESPN WSH vs nflverse WAS, an ESPN id claimed by three nflverse games,
 * same-name different athletes, a player who changed teams, unmapped ids, zero vs missing, a kicker's
 * empty line, an EPL fixture rescheduled twice, a UFC bout whose fighter was replaced, a draw, a scratch.
 *
 * Run: npx tsx --test src/lib/data-platform/adapters.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptMlb } from "./adapters/mlb.mjs";
import { adaptNfl, NFLVERSE_TEAM_TO_ESPN_TEAM_ID } from "./adapters/nfl.mjs";
import { adaptEpl, EPL_CLUBS } from "./adapters/epl.mjs";
import { adaptUfc } from "./adapters/ufc.mjs";
import { createDiagnostics } from "./diagnostics.mjs";
import { normalizeSportResult, assemblePlatform } from "./build-core.mjs";
import { buildAliasIndex } from "./aliases.mjs";

const run = (adapt, input) => {
  const diag = createDiagnostics();
  const out = adapt(input, diag);
  const { validation, files } = assemblePlatform([normalizeSportResult({ ...out, diagnostics: diag.list() })], { sources: { cutoffs: {}, sources: [] } });
  assert.deepEqual(validation.errors, [], "every adapter output must validate as a store");
  return { out, diag, files };
};
const byId = (list) => new Map(list.map((r) => [r.id, r]));

// ── MLB (data/internal/mlb/linescores-history/2024/2024-04-04.json · app/public/data/mlb/boards/2026-06-06|08-29.json ·
//        data/internal/mlb/linescores/2026-08-29.json · app/public/data/mlb/results/settled_leans.jsonl) ────────────────
const DH = (pk, n, homeRuns, awayRuns) => ({ gamePk: pk, officialDate: "2024-04-04", season: "2024", gameType: "R", doubleHeader: "Y", gameNumber: n, home: { id: 121, name: "New York Mets" }, away: { id: 116, name: "Detroit Tigers" }, homeRuns, awayRuns, venue: { id: 3289, name: "Citi Field" }, isFinal: true, status: "Final" });
const board = (date, gameDate, status) => ({ gamePk: 823539, gameDate, date, venue: "Yankee Stadium", status, awayTeamId: 111, awayTeamAbbr: "BOS", awayTeamName: "Boston Red Sox", homeTeamId: 147, homeTeamAbbr: "NYY", homeTeamName: "New York Yankees" });
const MINCWS = { gamePk: 823665, gameDate: "2026-08-29T18:10:00Z", date: "2026-08-29", venue: "Target Field", awayTeamId: 145, awayTeamAbbr: "CWS", awayTeamName: "Chicago White Sox", homeTeamId: 142, homeTeamAbbr: "MIN", homeTeamName: "Minnesota Twins" };
const lean = (playerId, playerName, playerTeamAbbr, marketKey, actual) => ({ playerId, playerName, playerTeamAbbr, marketKey, actual, gamePk: 823665, date: "2026-08-29" });

test("MLB-1 a doubleheader is two games: identity is gamePk, never teams + date", () => {
  const { out } = run(adaptMlb, { finalsHistory: [{ path: "2024-04-04.json", doc: { date: "2024-04-04", games: [DH(745844, 1, 3, 6), DH(745843, 2, 2, 1)] } }] });
  assert.deepEqual(out.games.map((g) => g.id).sort(), ["745843", "745844"]);
  assert.equal(out.teamGameStats.length, 4);
  const g1 = out.teamGameStats.filter((r) => r.gameId === "745844").map((r) => [r.homeAway, r.teamId, r.stats.runs]);
  assert.deepEqual(g1.sort(), [["AWAY", "mlb-team-116", 6], ["HOME", "mlb-team-121", 3]]);
  assert.deepEqual(byId(out.games).get("745844").venue, { providerId: "3289", name: "Citi Field" });
});

test("MLB-2 a postponed game keeps its gamePk: one record, the NEWEST capture's start, the linescore's final — and 0 runs is 0", () => {
  const { out, diag } = run(adaptMlb, {
    boards: [{ path: "2026-06-06.json", date: "2026-06-06", games: [board("2026-06-06", "2026-06-06T23:35:00Z", "Scheduled")] }, { path: "2026-08-29.json", date: "2026-08-29", games: [board("2026-08-29", "2026-08-29T17:05:00Z", "In Progress")] }],
    linescores: [{ path: "2026-08-29.json", doc: { date: "2026-08-29", games: [{ gamePk: 823539, officialDate: "2026-08-29", homeTeam: "New York Yankees", awayTeam: "Boston Red Sox", homeRuns: 0, awayRuns: 6, isFinal: true }] } }],
  });
  assert.equal(out.games.length, 1);
  const g = out.games[0];
  assert.equal(g.startUtc, "2026-08-29T17:05:00Z", "the June board is superseded, not averaged or first-wins");
  assert.equal(g.officialDate, "2026-08-29");
  assert.equal(g.statusClass, "FINAL");
  const home = out.teamGameStats.find((r) => r.homeAway === "HOME");
  assert.equal(home.stats.runs, 0, "a shutout is a recorded zero");
  assert.equal(diag.count("SOURCE_CONFLICT"), 0);
});

test("MLB-3 name-only linescores never find a team by name — even when both clubs are already known by id", () => {
  // MIN and CWS are known by StatsAPI id from game 823665's board; game 823666 exists ONLY as a name-only
  // linescore with the very same club names. A name join would silently attribute its runs; it must not.
  const { out, diag } = run(adaptMlb, {
    boards: [{ path: "b", date: "2026-08-29", games: [MINCWS] }],
    linescores: [{ path: "x", doc: { date: "2026-08-30", games: [{ gamePk: 823666, officialDate: "2026-08-30", homeTeam: "Minnesota Twins", awayTeam: "Chicago White Sox", homeRuns: 2, awayRuns: 3, isFinal: true }] } }],
  });
  const g = byId(out.games).get("823666");
  assert.equal(g.statusClass, "FINAL");
  assert.equal(g.homeTeamId, null);
  assert.equal(g.awayTeamId, null);
  assert.equal(out.teamGameStats.filter((r) => r.gameId === "823666").length, 0);
  assert.equal(out.teams.length, 2, "only the clubs an id-bearing source named");
  assert.equal(diag.count("UNRESOLVED_TEAM", "MLB"), 1);
});

test("MLB-4 a linescore whose sides disagree with the id-bearing source is dropped, not swapped", () => {
  const { out, diag } = run(adaptMlb, {
    boards: [{ path: "b", date: "2026-08-29", games: [MINCWS] }],
    linescores: [{ path: "l", doc: { date: "2026-08-29", games: [{ gamePk: 823665, officialDate: "2026-08-29", homeTeam: "Chicago White Sox", awayTeam: "Minnesota Twins", homeRuns: 2, awayRuns: 3, isFinal: true }] } }],
  });
  assert.equal(out.teamGameStats.length, 0);
  assert.equal(diag.count("SIDE_MISMATCH"), 1);
});

test("MLB-5 prop actuals: 0 stays 0, an unpriced category is null, an unsettled row is not a zero row, conflicts drop the line", () => {
  const { out, diag } = run(adaptMlb, {
    boards: [{ path: "b", date: "2026-08-29", games: [MINCWS] }],
    settledLeans: { rows: [
      lean(686797, "Brooks Lee", "MIN", "batter_hits", 0),
      lean(607200, "Erick Fedde", "CWS", "pitcher_strikeouts", 4),
      lean(607200, "Erick Fedde", "CWS", "pitcher_strikeouts", 4), // same actual at another line — not a conflict
      lean(680777, "Ryan Jeffers", "MIN", "batter_hits", 0),
      lean(680777, "Ryan Jeffers", "MIN", "batter_hits", 1), // two different actuals — the line is dropped
      lean(669065, "Kyle Stowers", "MIN", "batter_hits", null), // unsettled
    ] },
  });
  const lines = new Map(out.playerGameStats.map((r) => [r.playerId, r]));
  assert.deepEqual(lines.get("mlb-player-686797").stats, { hits: 0, totalBases: null, hitsRunsRbis: null, pitcherStrikeouts: null });
  assert.equal(lines.get("mlb-player-686797").teamId, "mlb-team-142");
  assert.equal(lines.get("mlb-player-607200").teamId, "mlb-team-145");
  assert.equal(lines.get("mlb-player-607200").opponentTeamId, "mlb-team-142");
  assert.equal(lines.has("mlb-player-680777"), false);
  assert.equal(lines.has("mlb-player-669065"), false);
  assert.equal(diag.count("STAT_CONFLICT"), 1);
  assert.ok(out.players.every((p) => /^mlb-player-\d+$/.test(p.id)), "StatsAPI person ids only");
});

test("MLB-6 malformed and duplicate archive rows are counted, never guessed", () => {
  const { out, diag } = run(adaptMlb, { finalsHistory: [
    { path: "a", doc: { date: "2024-04-04", games: [DH(745844, 1, 3, 6), { ...DH(745843, 2, 2, 1), gamePk: null }, { ...DH(745845, 2, 2, 1), homeRuns: null }] } },
    { path: "b", doc: { date: "2024-04-05", games: [DH(745844, 1, 3, 6)] } },
  ] });
  assert.equal(diag.count("MISSING_EVENT_ID"), 1);
  assert.equal(diag.count("MALFORMED_ROW"), 1);
  assert.equal(diag.count("DUPLICATE_SOURCE_OCCURRENCE"), 1);
  assert.equal(out.games.filter((g) => g.id === "745844").length, 1, "a gamePk is written once");
});

// ── NFL (research/nfl/replay/games-history-v2.json · current-season.json · player-games-v2 · snap-counts/id-bridge-v1 ·
//        player-events-v1/2024|2025.json · public nfl/results/latest.json · nfl/rosters/latest.json) ──────────────────
const HIST_COLS = ["gameId", "espnId", "season", "date", "home", "away", "homeScore", "awayScore", "neutral", "total"];
const CUR_COLS = ["gameId", "espnId", "season", "date", "home", "away", "total", "homeScore", "awayScore", "neutral"];
const PG_COLS = ["gameId", "season", "week", "date", "seasonType", "team", "opponent", "playerId", "name", "position", "participation", "offenseSnaps", "targets", "receptions", "recYds", "carries", "rushYds", "passAtt", "passCmp", "passYds", "rushTd", "recTd", "otherTd"];
const ROSTER = { generatedAt: "2026-09-16T23:33:18Z", teams: [
  { teamAbbr: "PHI", providerTeamId: "21", players: [{ id: "4241478", fullName: "DeVonta Smith" }] },
  { teamAbbr: "CAR", providerTeamId: "29", players: [{ id: "4594449", fullName: "DeVonta Smith" }] },
  { teamAbbr: "WSH", providerTeamId: "28", players: [] }, { teamAbbr: "CHI", providerTeamId: "3", players: [] },
  { teamAbbr: "TEN", providerTeamId: "10", players: [] }, { teamAbbr: "LAC", providerTeamId: "24", players: [{ id: "15818", fullName: "Keenan Allen" }] },
  { teamAbbr: "KC", providerTeamId: "12", players: [] }, { teamAbbr: "BUF", providerTeamId: "2", players: [] }, { teamAbbr: "MIA", providerTeamId: "15", players: [] }, { teamAbbr: "CIN", providerTeamId: "4", players: [] },
] };
const NFL_INPUT = () => ({
  gamesHistory: { columns: HIST_COLS, games: [
    ["2024_01_TEN_CHI", "401671719", 2024, "2024-09-08", "CHI", "TEN", 24, 17, 0, 41],
    ["2025_01_KC_LAC", "401772714", 2025, "2025-09-05", "LAC", "KC", 27, 21, 1, 48],
    ["2003_08_BUF_KC", "231027024", 2003, "2003-10-26", "KC", "BUF", 38, 5, 0, 43],
    ["2003_08_MIA_SD", "231027024", 2003, "2003-10-27", "LAC", "MIA", 10, 26, 1, 36],
    ["2003_11_KC_CIN", "231027024", 2003, "2003-11-16", "CIN", "KC", 24, 19, 0, 43],
  ] },
  currentSeason: { columns: CUR_COLS, games: [["2026_01_WAS_PHI", "401872929", 2026, "2026-09-13", "PHI", "WAS", 46, 24, 22, 0]], neutralEspnIds: [] },
  results: { rows: [{ providerEventId: "401872929", dateUtc: "2026-09-13T20:25Z", statusRaw: "STATUS_FINAL", seasonType: 2, week: 1, home: { abbr: "PHI", name: "Philadelphia Eagles", providerTeamId: "21" }, away: { abbr: "WSH", name: "Washington Commanders", providerTeamId: "28" }, ftHome: 24, ftAway: 22, capturedAt: "2026-09-15T14:18:42Z" }] },
  playerEvents: [
    { path: "2024.json", doc: { games: [{ providerEventId: "401671719", season: 2024, seasonType: 2, week: 1, dateUtc: "2024-09-08T17:00Z", ftHome: 24, ftAway: 17, players: [
      { playerId: "nfl-athlete-15818", name: "Keenan Allen", rec: 4, recYds: 29, recTd: 0, targets: 11, teamAbbr: "CHI" },
      { playerId: "nfl-athlete-17427", name: "Cairo Santos", teamAbbr: "CHI" },
    ] }, { providerEventId: "401547654", season: 2024, seasonType: 1, week: 1, dateUtc: "2024-08-02T00:00Z", ftHome: 21, ftAway: 17, players: [{ playerId: "nfl-athlete-15168", name: "Case Keenum", teamAbbr: "HOU" }] }] } },
    { path: "2025.json", doc: { games: [{ providerEventId: "401772714", season: 2025, seasonType: 2, week: 1, dateUtc: "2025-09-06T00:00Z", ftHome: 27, ftAway: 21, players: [{ playerId: "nfl-athlete-15818", name: "Keenan Allen", rec: 7, recYds: 68, recTd: 1, targets: 10, teamAbbr: "LAC" }] }] } },
  ],
  idBridge: { columns: ["pfr_id", "gsis_id", "espn_id"], rows: [["AlleKe00", "00-0030279", "15818"], ["SmitDe07", "00-0036912", "4241478"]] },
  playerGames: { columns: PG_COLS, rows: [
    ["2024_01_TEN_CHI", 2024, 1, "2024-09-08", "REG", "CHI", "TEN", "00-0030279", "Keenan Allen", "WR", "PLAYED", 38, 11, 4, 29, 0, 0, 0, 0, 0, 0, 0, 0],
    ["2024_01_TEN_CHI", 2024, 1, "2024-09-08", "REG", "TEN", "CHI", "00-0022999", "Unbridged Player", "FB", "PLAYED", 8, 0, 0, 0, 1, 2, 0, 0, 0, 1, 0, 0],
  ] },
  rosters: [{ path: "latest.json", doc: ROSTER }],
});

test("NFL-1 ESPN WSH and nflverse WAS are the same team because the IDS say so — nfl-team-28, no conflict", () => {
  const { out, diag } = run(adaptNfl, NFL_INPUT());
  const g = byId(out.games).get("401872929");
  assert.equal(g.awayTeamId, "nfl-team-28");
  assert.equal(g.statusClass, "FINAL");
  const wsh = byId(out.teams).get("nfl-team-28");
  assert.deepEqual(wsh.providerAliases, [{ provider: "espn", entityType: "team", id: "28" }, { provider: "nflverse", entityType: "team", id: "WAS" }]);
  assert.equal(wsh.abbreviation, "WSH", "the label is ESPN's; the identity is the id");
  assert.equal(diag.count("SOURCE_CONFLICT"), 0);
  assert.deepEqual(out.teamGameStats.filter((r) => r.gameId === "401872929").map((r) => [r.homeAway, r.stats.points]).sort(), [["AWAY", 22], ["HOME", 24]]);
});

test("NFL-2 an ESPN id claimed by three nflverse games identifies none of them", () => {
  const { out, diag } = run(adaptNfl, NFL_INPUT());
  assert.equal(byId(out.games).has("231027024"), false);
  assert.equal(diag.count("AMBIGUOUS_ALIAS", "NFL"), 3);
});

test("NFL-3 same name, different ESPN ids ⇒ two athletes; a name never merges or resolves identity", () => {
  const { out } = run(adaptNfl, NFL_INPUT());
  const smiths = out.players.filter((p) => p.name === "DeVonta Smith").map((p) => [p.id, p.currentTeamId]).sort();
  assert.deepEqual(smiths, [["nfl-athlete-4241478", "nfl-team-21"], ["nfl-athlete-4594449", "nfl-team-29"]]);
  const idx = buildAliasIndex(out.players);
  assert.equal(idx.resolve("NFL", "espn", "player", "DeVonta Smith").status, "UNKNOWN");
});

test("NFL-4 a player who changed teams keeps ONE identity; each game line carries the team of THAT game", () => {
  const { out } = run(adaptNfl, NFL_INPUT());
  const allen = out.playerGameStats.filter((r) => r.playerId === "nfl-athlete-15818" && r.family === "nfl.espn-player-lines").map((r) => [r.gameId, r.teamId]).sort();
  assert.deepEqual(allen, [["401671719", "nfl-team-3"], ["401772714", "nfl-team-24"]]);
  assert.equal(byId(out.players).get("nfl-athlete-15818").currentTeamId, "nfl-team-24", "current team comes from the current roster only");
  assert.equal(byId(out.games).get("401772714").neutralSite, true, "2025 São Paulo game");
});

test("NFL-5 nflverse lines join by the exact id bridge; an unbridged gsis id is counted, never minted", () => {
  const { out, diag } = run(adaptNfl, NFL_INPUT());
  const nv = out.playerGameStats.filter((r) => r.family === "nfl.nflverse-skill-lines");
  assert.equal(nv.length, 1);
  assert.equal(nv[0].playerId, "nfl-athlete-15818");
  assert.equal(diag.count("UNRESOLVED_PLAYER", "NFL"), 1);
  assert.ok(!out.players.some((p) => /Unbridged/.test(p.name)));
  const allen = byId(out.players).get("nfl-athlete-15818");
  assert.deepEqual(allen.providerAliases.map((a) => `${a.provider}:${a.id}`).sort(), ["espn:15818", "nflverse:00-0030279", "pfr:AlleKe00"]);
  // the two families agree on this real game, so no disagreement is receipted
  assert.equal(nv[0].stats.targets, 11);
});

test("NFL-6 a kicker's summary line is all null (not zeros); a preseason game is excluded with its reason", () => {
  const { out, diag } = run(adaptNfl, NFL_INPUT());
  const santos = out.playerGameStats.find((r) => r.playerId === "nfl-athlete-17427");
  assert.ok(Object.values(santos.stats).every((v) => v === null));
  assert.equal(byId(out.games).has("401547654"), false);
  assert.equal(diag.count("EXCLUDED_BY_SCOPE", "NFL"), 1);
});

test("NFL-7 the reviewed nflverse→ESPN team table is a bijection over 32 teams with only WAS and LA differing from ESPN codes", () => {
  const ids = Object.values(NFLVERSE_TEAM_TO_ESPN_TEAM_ID);
  assert.equal(ids.length, 32);
  assert.equal(new Set(ids).size, 32);
  assert.equal(NFLVERSE_TEAM_TO_ESPN_TEAM_ID.WAS, "28");
  assert.equal(NFLVERSE_TEAM_TO_ESPN_TEAM_ID.LA, "14");
});

// ── EPL (public soccer/epl/fixtures/capture-2026-27-*.json · research/epl/players/espn-players-v1.jsonl) ──────────────
const avf = (eventId, kickoffIso) => ({ eventId, homeClub: "Aston Villa", awayClub: "Fulham", kickoffIso, matchweek: 9, providerRefs: [{ provider: "openfootball", id: "2026-27:md9:aston-villa-v-fulham" }] });
const cap = (path, rows) => ({ path, doc: { season: "2026-27", rows } });
const espnRow = (teamId, teamName, isHome, playerId, playerName, extra = {}) => ({ espnEventId: "740966", season: "2025-26", dateUtc: "2026-05-24T15:00Z", teamId, teamName, isHome, playerId, playerName, position: "G", formationPlace: "1", started: true, subbedIn: false, subbedOut: false, appeared: true, goals: 0, assists: 0, shots: 0, shotsOnGoal: 0, yellow: 0, red: 0, fouls: 0, offsides: 0, saves: 5, goalsAgainst: 3, ...extra });

test("EPL-1 a fixture rescheduled twice is ONE game under the current shipped id; both superseded ids resolve to it by lineage", () => {
  const { out } = run(adaptEpl, { fixtureCaptures: [
    cap("capture-2026-27-2026-08-09T2245.json", [avf("soccer:epl:aston-villa-v-fulham:20261031t1500", "2026-10-31T15:00:00Z")]),
    cap("capture-2026-27-2026-08-23T1548.json", [avf("soccer:epl:aston-villa-v-fulham:20261101t1400", "2026-11-01T14:00:00Z")]),
    cap("capture-2026-27-2026-09-08T1654.json", [avf("soccer:epl:aston-villa-v-fulham:20261031t2000", "2026-10-31T20:00:00Z")]),
  ] });
  assert.deepEqual(out.games.map((g) => g.id), ["soccer:epl:aston-villa-v-fulham:20261031t2000"]);
  const idx = buildAliasIndex(out.games);
  for (const old of ["soccer:epl:aston-villa-v-fulham:20261031t1500", "soccer:epl:aston-villa-v-fulham:20261101t1400"]) {
    assert.deepEqual(idx.resolve("EPL", "gametime_epl_event", "game", old), { status: "RESOLVED", id: "soccer:epl:aston-villa-v-fulham:20261031t2000" });
  }
  assert.equal(out.games[0].homeTeamId, "epl-team-362");
  assert.equal(out.games[0].statusClass, "NOT_FINAL", "no id-keyed final fact exists for EPL fixtures");
});

test("EPL-2 a club outside the reviewed table is unresolved — the product alias 'Villa' is NOT a join key", () => {
  const { out, diag } = run(adaptEpl, { fixtureCaptures: [cap("c.json", [{ ...avf("soccer:epl:fulham-v-villa:20261031t2000", "2026-10-31T20:00:00Z"), homeClub: "Villa" }])] });
  assert.equal(out.games[0].homeTeamId, null);
  assert.equal(diag.count("UNRESOLVED_TEAM", "EPL"), 1);
});

test("EPL-3 a historical match takes sides from ESPN team ids; recorded zeros stay zeros; no team-game rows are invented", () => {
  const { out } = run(adaptEpl, { espnPlayerRows: [
    espnRow("331", "Brighton & Hove Albion", true, "291609", "Bart Verbruggen"),
    espnRow("360", "Manchester United", false, "301425", "Senne Lammens", { saves: 2, goalsAgainst: 0 }),
  ] });
  const g = out.games[0];
  assert.deepEqual([g.id, g.homeTeamId, g.awayTeamId, g.statusClass, g.seasonId], ["740966", "epl-team-331", "epl-team-360", "FINAL", "EPL-2025-26"]);
  assert.equal(out.teamGameStats.length, 0);
  const keeper = out.playerGameStats.find((r) => r.playerId === "epl-athlete-301425");
  assert.equal(keeper.stats.goalsAgainst, 0);
  assert.equal(keeper.opponentTeamId, "epl-team-331");
  assert.equal(byId(out.teams).get("epl-team-331").name, "Brighton & Hove Albion");
});

test("EPL-4 the reviewed club table is a bijection on ESPN ids and slugs", () => {
  assert.equal(new Set(EPL_CLUBS.map((c) => c.espnTeamId)).size, EPL_CLUBS.length);
  assert.equal(new Set(EPL_CLUBS.map((c) => c.slug)).size, EPL_CLUBS.length);
  assert.equal(new Set(EPL_CLUBS.map((c) => c.club)).size, EPL_CLUBS.length);
});

// ── UFC (public ufc/schedule/capture-*.json · research/ufc/corpus-v1.json) ──────────────────────────────────────
const bout = (id, red, redId, blue, blueId, dateUtc = "2026-09-08T23:00Z") => ({ providerBoutId: id, eventProviderId: "600060736", red, blue, redProviderId: redId, blueProviderId: blueId, dateUtc });
const sched = (path, bouts) => ({ path, doc: { generatedAt: path.slice(8, 23), events: [{ providerEventId: "600060736", name: "UFC Fight Night", dateUtc: "2026-09-08T22:00Z" }], bouts } });

test("UFC-1 a replaced fighter: the newest capture's statement wins; the withdrawn fighter is never back-filled", () => {
  const { out } = run(adaptUfc, { scheduleCaptures: [
    sched("capture-2026-08-10T0230.json", [bout("401891540", "Old Red", "2431356", "Old Blue", "4402367")]),
    sched("capture-2026-09-08T1654.json", [bout("401891540", "Isaac Moreno", "5264395", "Reginaldo Junior", "5291155")]),
  ] });
  assert.deepEqual(out.games[0].competitors, [{ playerId: "ufc-athlete-5264395", corner: "RED" }, { playerId: "ufc-athlete-5291155", corner: "BLUE" }]);
  assert.deepEqual(out.games[0].card, { id: "600060736", name: "UFC Fight Night" });
  assert.equal(out.players.some((p) => p.id === "ufc-athlete-2431356"), false);
});

test("UFC-2 a bout with an unannounced opponent in the newest capture is not completed from an older capture", () => {
  const { out, diag } = run(adaptUfc, { scheduleCaptures: [
    sched("capture-2026-08-10T0230.json", [bout("401891540", "Isaac Moreno", "5264395", "Reginaldo Junior", "5291155")]),
    sched("capture-2026-09-08T1654.json", [bout("401891540", "TBA", null, "Opponent TBA", null)]),
  ] });
  assert.equal(out.games.length, 0);
  assert.equal(diag.count("UNRESOLVED_PLAYER", "UFC"), 1);
});

test("UFC-3 a draw is not a loss for either fighter; a scratched bout from an old capture is excluded", () => {
  const { out, diag } = run(adaptUfc, {
    history: { cardIndex: [{ providerCardId: "600035912", name: "Noche UFC: Grasso vs. Shevchenko 2", dateUtc: "2023-09-16T23:00Z" }], rows: [{ providerBoutId: "401575164", providerCardId: "600035912", cardName: "Noche UFC: Grasso vs. Shevchenko 2", dateUtc: "2023-09-16T23:00Z", red: { id: "4895772", name: "Daniel Lacerda", winner: false }, blue: { id: "5076027", name: "Édgar Cháirez", winner: false }, statusRaw: "STATUS_FINAL" }] },
    scheduleCaptures: [sched("capture-2026-08-10T0230.json", [bout("401905377", "Scratched A", "1", "Scratched B", "2")]), sched("capture-2026-09-08T1654.json", [])],
  });
  const lines = out.playerGameStats.filter((r) => r.gameId === "401575164");
  assert.deepEqual(lines.map((r) => r.stats), [{ won: false, boutHadWinner: false }, { won: false, boutHadWinner: false }]);
  assert.equal(out.games.find((g) => g.id === "401575164").seasonId, "UFC-2023");
  assert.equal(out.games.some((g) => g.id === "401905377"), false);
  assert.equal(diag.count("EXCLUDED_BY_SCOPE", "UFC"), 1);
  assert.deepEqual(new Set(lines.map((r) => r.opponentPlayerId)), new Set(["ufc-athlete-4895772", "ufc-athlete-5076027"]));
});

// ── reviewed-table proofs against committed provider data (ids decide; names/abbreviations only confirm) ───────
test("NFL-8 the nflverse→ESPN table agrees with ESPN's own (abbr, id) pairs and with a join BY EVENT ID", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
  const REPO = path.join(APP, "..");
  const roster = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/rosters/latest.json"), "utf8"));
  const espnIdByAbbr = new Map(roster.teams.map((t) => [t.teamAbbr, String(t.providerTeamId)]));
  const DIFFERS = { WAS: "WSH", LA: "LAR" };
  for (const [code, id] of Object.entries(NFLVERSE_TEAM_TO_ESPN_TEAM_ID)) assert.equal(espnIdByAbbr.get(DIFFERS[code] ?? code), id, `nflverse ${code}`);
  const cur = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nfl/replay/current-season.json"), "utf8"));
  const col = (n) => cur.columns.indexOf(n);
  const espnSides = new Map();
  for (const f of fs.readdirSync(path.join(APP, "public/data/nfl/schedule")).filter((x) => x.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule", f), "utf8")).rows ?? []) espnSides.set(String(r.providerEventId), [String(r.home.providerTeamId), String(r.away.providerTeamId)]);
  }
  let joined = 0;
  for (const g of cur.games) {
    const sides = espnSides.get(String(g[col("espnId")]));
    if (!sides) continue;
    assert.deepEqual([NFLVERSE_TEAM_TO_ESPN_TEAM_ID[g[col("home")]], NFLVERSE_TEAM_TO_ESPN_TEAM_ID[g[col("away")]]], sides, `event ${g[col("espnId")]}`);
    joined += 1;
  }
  assert.ok(joined >= 10, `id-joined games: ${joined}`);
});

test("EPL-5 the reviewed club table names only canonical clubs of lib/soccer/epl-clubs.ts, and each ESPN team name is an exact alias of its club", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { EPL_CLUB_ALIASES } = await import("../soccer/epl-clubs.ts");
  const byCanonical = new Map(EPL_CLUB_ALIASES.map((c) => [c.canonical, c]));
  for (const c of EPL_CLUBS) {
    const product = byCanonical.get(c.club);
    assert.ok(product, `${c.club} is a canonical product club`);
    assert.equal(product.abbr, c.abbr, `${c.club} abbreviation`);
  }
  const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
  const squads = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/players/squads-2026-27.json"), "utf8"));
  const espnNames = new Map(squads.squads.map((s) => [String(s.teamId), s.teamName]));
  const lines = fs.readFileSync(path.join(REPO, "data/internal/research/epl/players/espn-players-v1.jsonl"), "utf8").split("\n");
  for (const l of lines) { if (!l) continue; const r = JSON.parse(l); if (!espnNames.has(String(r.teamId))) espnNames.set(String(r.teamId), r.teamName); }
  for (const c of EPL_CLUBS) {
    const name = espnNames.get(c.espnTeamId);
    assert.ok(name, `ESPN team ${c.espnTeamId} appears in committed ESPN data`);
    assert.ok(byCanonical.get(c.club).aliases.includes(name), `ESPN "${name}" (${c.espnTeamId}) must be an exact alias of ${c.club}`);
  }
  assert.equal(new Set([...espnNames.keys()].filter((id) => !EPL_CLUBS.some((c) => c.espnTeamId === id))).size, 0, "every ESPN EPL team id in committed data is reviewed");
});
