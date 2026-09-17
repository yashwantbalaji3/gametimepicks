/**
 * RESEARCH LAB — pure contracts (v1.5 · §99–§121 unit).
 *
 *  LQ1  query schema: an unknown query schemaVersion is REFUSED by the validator and by the engine
 *  LQ2  mode/sport matrix: every blocked sport fails closed with a stable code; every shipped one validates
 *  LQ3  field allowlist: an unknown field, and an operator a field does not declare, are both refused
 *  LQ4  identity: a slug resolves through the EXACT index; a display name, a case variant and a prefix never do
 *  LQ5  cross-sport: an NFL player id in an EPL query, and an MLB team id in an NFL query, are refused
 *  LQ6  season: an unsupported season is refused; NFL 2026 never appears for player rows; "all" is games/seasons only
 *  LQ7  stat: players mode requires a stat; a stat the sport does not define is refused; `stat` in games mode is refused
 *  LQ8  budgets: filters, sorts, entities, page size and page×size are all bounded and refuse past the bound
 *  LQ9  team-relative fields (result, home/away, scored, allowed) refuse without a selected team
 *  LQ10 URL: one logical query ⇢ one canonical string; parse → validate → serialize is stable; key order is fixed
 *  LQ11 reset and sport switch drop incompatible state deliberately and keep nothing invalid
 *  LQ12 engine · missing ≠ zero: a null never matches a numeric comparison (not even >= 0); a recorded 0 does
 *  LQ13 engine · games: one row per canonical game id, doubleheaders distinct, finals only, scores symmetric
 *  LQ14 engine · host: a row that proves no host is NEVER home or away, only neutral; team order is not a claim
 *  LQ15 engine · players: the team of THAT game filters, never the current roster; same-name players stay separate
 *  LQ16 engine · determinism: an order-reversed input gives byte-identical output; ties break on a canonical key
 *  LQ17 engine · truncation is visible: totalMatched counts everything, `capped` says so, nothing drops silently
 *  LQ18 engine · sorting: nulls sort last in both directions; a sorted column carries no evaluative field
 *  LQ19 copy: every error, blocked and coverage code has exactly one sentence, and none is evaluative
 *  LQ20 cost receipt: partitions, scanned, matched and returned are reported and never expose a file path
 *
 * Run: npx tsx --test src/lib/lab/lab-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_SEASONS, LAB_BLOCKED_SPORTS, LAB_BUDGET, LAB_ERROR, LAB_EVALUATIVE_TERMS, LAB_MODES, LAB_MODE_SPORTS,
  LAB_QUERY_SCHEMA_VERSION, LAB_PROJECTION_SCHEMA_VERSION, assertLabVersion, labBlocker, labModeSupports,
} from "./contract.mjs";
import { GAME, HOST_KNOWN, LAB_FIELDS, LAB_SORT_FIELDS, PLAYER, SEASON } from "./fields.mjs";
import { defaultLabQuery, parseLabQuery, queryPartitions, serializeLabQuery, switchTarget, validateLabQuery } from "./query.mjs";
import { labDataset } from "./dataset.mjs";
import { executeLabQuery } from "./engine.mjs";
import { BLOCKED_COPY, COVERAGE_COPY, ERROR_COPY, blockedText, coverageText, errorText, resultCountText, sortOptionText } from "./copy.mjs";

/* ── fixtures ───────────────────────────────────────────────────────────────────────────────────── */

const KC = "nfl-team-12", LAC = "nfl-team-24", SEA = "nfl-team-26";
const teamTuple = (slug, id, label, abbr) => [slug, id, label, abbr, `/teams/nfl/${slug}/`];
const GAME_TEAMS = [teamTuple("kansas-city-chiefs", KC, "Kansas City Chiefs", "KC"), teamTuple("los-angeles-chargers", LAC, "Los Angeles Chargers", "LAC"), teamTuple("seattle-seahawks", SEA, "Seattle Seahawks", "SEA")];
const SEASONS = ["NFL-2025", "NFL-2024"];
// [gameId, date, seasonIdx, A, B, scoreA, scoreB, flags, matchupPath]
const GAME_ROWS = [
  ["401001", "2025-12-14T18:00:00Z", 0, 0, 1, 13, 16, HOST_KNOWN, "/matchups/nfl/401001/"],  // KC hosted, lost
  ["401002", "2025-09-06T00:00:00Z", 0, 0, 1, 21, 27, 0, null],                               // neutral site
  ["401003", "2025-10-01T00:00:00Z", 0, 2, 0, 0, 0, HOST_KNOWN, null],                        // recorded 0–0 tie
  ["400900", "2024-11-01T00:00:00Z", 1, 1, 0, 30, 24, HOST_KNOWN, null],                      // LAC hosted, KC lost
];
const gamesIndex = {
  schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-index", mode: "games", sport: "NFL", seasons: SEASONS,
  seasonLabels: { "NFL-2025": "2025", "NFL-2024": "2024" }, entities: GAME_TEAMS, teams: GAME_TEAMS,
  coverage: { status: "PARTIAL", from: "2024-11-01", to: "2025-12-14", notes: ["NFL_NEUTRAL_HOST_UNKNOWN"] },
  rowsBySeason: { "NFL-2025": 3, "NFL-2024": 1 }, totalRows: 4,
};
const gamesPart = { schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-games", sport: "NFL", seasons: SEASONS, teams: GAME_TEAMS, rows: GAME_ROWS };
const gamesData = (rows = GAME_ROWS) => labDataset("games", gamesIndex, { ...gamesPart, rows }, 2);

const FAMS = ["NFL.receivingYards", "NFL.receptions"];
// Two same-name athletes, two ids — identity is the id, never the label (v1.3 slug policy suffixes both).
const PLAYERS = [
  ["chris-manhertz-2531358", "nfl-athlete-2531358", "Chris Manhertz", "KC", "/players/nfl/chris-manhertz-2531358/", [0, 1]],
  ["chris-manhertz-4071345", "nfl-athlete-4071345", "Chris Manhertz", "LAC", "/players/nfl/chris-manhertz-4071345/", [0]],
  ["keenan-allen", "nfl-athlete-15818", "Keenan Allen", "LAC", "/players/nfl/keenan-allen/", [0, 1]],
];
// [playerIdx, gameId, date, seasonIdx, teamIdx, oppIdx, ha, recYds, receptions]
const PLAYER_ROWS = [
  [2, "401001", "2025-12-14T18:00:00Z", 0, 1, 0, "A", 80, 6],
  [2, "401002", "2025-09-06T00:00:00Z", 0, 1, 0, "N", 0, 0],     // a recorded ZERO
  [2, "401003", "2025-10-01T00:00:00Z", 0, 0, 2, "H", null, 3],  // receiving yards NOT recorded
  [0, "401001", "2025-12-14T18:00:00Z", 0, 0, 1, "H", 12, 1],
  [1, "401001", "2025-12-14T18:00:00Z", 0, 1, 0, "A", 40, null],
];
const playersIndex = {
  schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-index", mode: "players", sport: "NFL", seasons: ["NFL-2025"],
  seasonLabels: { "NFL-2025": "2025" }, families: FAMS, familyLabels: { "NFL.receivingYards": "Receiving yards", "NFL.receptions": "Receptions" },
  familyUnits: { "NFL.receivingYards": "yards", "NFL.receptions": "receptions" }, familyCoverage: { "NFL.receivingYards": null, "NFL.receptions": null },
  seasonFamilies: { "NFL-2025": FAMS }, entities: PLAYERS, teams: GAME_TEAMS,
  coverage: { status: "PARTIAL", from: "2025-09-06", to: "2025-12-14", notes: ["NFL_NO_CURRENT_SEASON_LOGS"] },
  rowsBySeason: { "NFL-2025": 5 }, totalRows: 5,
};
const playersPart = { schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-players", sport: "NFL", seasonId: "NFL-2025", seasons: ["NFL-2025"], families: FAMS, players: PLAYERS, teams: GAME_TEAMS, rows: PLAYER_ROWS };
const playersData = (rows = PLAYER_ROWS) => labDataset("players", playersIndex, { ...playersPart, rows }, 2);

// [teamIdx, seasonIdx, games, finals, w, l, t, scored, allowed]
const SEASON_ROWS = [[0, 0, 17, 17, 11, 6, 0, 420, 380], [1, 0, 17, 17, 11, 6, 0, 401, 366], [2, 0, 17, 16, 8, 8, 0, 300, 310]];
const seasonsIndex = { ...gamesIndex, mode: "seasons", rowsBySeason: { "NFL-2025": 3, "NFL-2024": 0 }, totalRows: 3 };
const seasonsPart = { schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-seasons", sport: "NFL", seasons: SEASONS, teams: GAME_TEAMS, rows: SEASON_ROWS };
const seasonsData = (rows = SEASON_ROWS) => labDataset("seasons", seasonsIndex, { ...seasonsPart, rows }, 1);

const q = (search, index = gamesIndex) => {
  const { query, errors } = parseLabQuery(search, index);
  return { parsed: query, parseErrors: errors, ...validateLabQuery(query, index) };
};
const codes = (r) => r.errors.map((e) => e.code);
const run = (search, index, data) => { const r = q(search, index); assert.equal(r.valid, true, `expected valid, got ${JSON.stringify(codes(r))}`); return executeLabQuery(r.query, data); };

/* ── LQ1 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ1 an unknown query schemaVersion is refused, never interpreted", () => {
  const base = defaultLabQuery(gamesIndex);
  assert.deepEqual(codes(validateLabQuery({ ...base, schemaVersion: 2 }, gamesIndex)), [LAB_ERROR.UNKNOWN_SCHEMA_VERSION]);
  assert.deepEqual(codes(validateLabQuery({ ...base, schemaVersion: undefined }, gamesIndex)), [LAB_ERROR.UNKNOWN_SCHEMA_VERSION]);
  // The engine refuses independently: a caller cannot bypass the validator by hand-rolling a query.
  assert.throws(() => executeLabQuery({ ...base, schemaVersion: 2 }, gamesData()), /schemaVersion/);
  // Projection documents refuse the same way.
  assert.throws(() => assertLabVersion({ schemaVersion: 99 }, "x"), /not readable/);
  assert.throws(() => labDataset("games", gamesIndex, { ...gamesPart, schemaVersion: 2 }, 2), /not readable/);
});

/* ── LQ2 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ2 every blocked mode/sport fails closed with a stable code; shipped ones validate", () => {
  assert.deepEqual(LAB_MODE_SPORTS.games, ["MLB", "NFL"]);
  assert.deepEqual(LAB_MODE_SPORTS.players, ["NFL", "EPL", "MLB"]);
  assert.deepEqual(LAB_MODE_SPORTS.seasons, ["MLB", "NFL"]);
  assert.equal(labModeSupports("games", "EPL"), false);
  assert.equal(labBlocker("games", "EPL"), "TEAM_RESULTS_UNSUPPORTED");
  assert.equal(labBlocker("seasons", "EPL"), "TEAM_RESULTS_UNSUPPORTED");
  assert.equal(labBlocker("players", "UFC"), "NO_COMPARABLE_STAT_FAMILY");
  assert.equal(labBlocker("games", "UFC"), "SPORT_NOT_SUPPORTED");
  for (const mode of LAB_MODES) {
    for (const sport of Object.keys(LAB_BLOCKED_SPORTS[mode])) {
      const r = validateLabQuery({ ...defaultLabQuery(gamesIndex), mode, sport }, gamesIndex);
      assert.deepEqual(codes(r), [LAB_ERROR.UNSUPPORTED_SPORT_MODE], `${mode}/${sport}`);
    }
  }
  // Every sport is either shipped or blocked in every mode — no mode may silently omit one.
  for (const mode of LAB_MODES) for (const sport of ["MLB", "NFL", "EPL", "UFC"]) {
    assert.equal(labModeSupports(mode, sport) || labBlocker(mode, sport) != null, true, `${mode}/${sport} is neither shipped nor blocked`);
  }
});

/* ── LQ3 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ3 an unknown field and a disallowed operator are both refused", () => {
  const base = q("?mode=games&sport=nfl&season=NFL-2025").query;
  assert.deepEqual(codes(validateLabQuery({ ...base, filters: [{ field: "attendance", op: "gte", value: 1 }] }, gamesIndex)), [LAB_ERROR.UNKNOWN_FIELD]);
  assert.deepEqual(codes(validateLabQuery({ ...base, filters: [{ field: "date", op: "eq", value: "2025-01-01" }] }, gamesIndex)), [LAB_ERROR.OPERATOR_NOT_ALLOWED]);
  // teamId in games mode takes ONE team (the perspective); `in` is not offered.
  assert.deepEqual(codes(validateLabQuery({ ...base, filters: [{ field: "teamId", op: "in", value: [KC, LAC] }] }, gamesIndex)), [LAB_ERROR.OPERATOR_NOT_ALLOWED]);
  assert.equal(q("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs,los-angeles-chargers").parseErrors[0].code, LAB_ERROR.OPERATOR_NOT_ALLOWED);
  // The registry itself never declares an operator outside the closed set, and every sortable field exists.
  for (const [mode, fields] of Object.entries(LAB_FIELDS)) {
    for (const [name, def] of Object.entries(fields)) for (const op of def.ops) assert.ok(["eq", "in", "gte", "lte", "between"].includes(op), `${mode}.${name} ${op}`);
    for (const s of LAB_SORT_FIELDS[mode]) assert.ok(fields[s] || ["seasonId", "team"].includes(s), `${mode} sort ${s} is not a field`);
  }
});

/* ── LQ4 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ4 identity is the exact index slug — a name, a case variant and a prefix are all invalid", () => {
  assert.equal(q("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs").valid, true);
  for (const bad of ["Kansas City Chiefs", "Kansas-City-Chiefs", "kansas-city", "chiefs", "KANSAS-CITY-CHIEFS", "kansas_city_chiefs", " kansas-city-chiefs"]) {
    const r = q(`?mode=games&sport=nfl&season=NFL-2025&team=${encodeURIComponent(bad)}`);
    assert.deepEqual(r.parseErrors.map((e) => e.code), [LAB_ERROR.ENTITY_NOT_FOUND], `"${bad}" must not resolve`);
  }
  // A canonical id is not a URL key either: the URL names slugs only.
  assert.deepEqual(q(`?mode=games&sport=nfl&season=NFL-2025&team=${KC}`).parseErrors.map((e) => e.code), [LAB_ERROR.ENTITY_NOT_FOUND]);
  // Same-name players are two ids and two slugs; picking one never picks the other.
  const a = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=chris-manhertz-2531358", playersIndex, playersData());
  assert.deepEqual(a.rows.map((r) => r.playerId), ["nfl-athlete-2531358"]);
  const b = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=chris-manhertz-4071345", playersIndex, playersData());
  assert.deepEqual(b.rows.map((r) => r.playerId), ["nfl-athlete-4071345"]);
});

/* ── LQ5 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ5 a cross-sport entity id is refused", () => {
  const base = q("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards", playersIndex).query;
  assert.deepEqual(codes(validateLabQuery({ ...base, filters: [{ field: "playerId", op: "eq", value: "epl-athlete-283940" }] }, playersIndex)), [LAB_ERROR.ENTITY_NOT_FOUND]);
  assert.deepEqual(codes(validateLabQuery({ ...base, filters: [{ field: "teamId", op: "eq", value: "mlb-team-121" }] }, playersIndex)), [LAB_ERROR.ENTITY_NOT_FOUND]);
  const g = q("?mode=games&sport=nfl&season=NFL-2025").query;
  assert.deepEqual(codes(validateLabQuery({ ...g, filters: [{ field: "teamId", op: "eq", value: "mlb-team-121" }] }, gamesIndex)), [LAB_ERROR.ENTITY_NOT_FOUND]);
});

/* ── LQ6 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ6 season availability comes from the projection; \"all\" is games/seasons only", () => {
  assert.deepEqual(codes(q("?mode=games&sport=nfl&season=NFL-1998")), [LAB_ERROR.SEASON_NOT_SUPPORTED]);
  // NFL 2026 player logs are blocked upstream, so 2026 is not in the players index and cannot be asked for.
  assert.equal(playersIndex.seasons.includes("NFL-2026"), false);
  assert.deepEqual(codes(q("?mode=players&sport=nfl&season=NFL-2026&stat=receiving-yards", playersIndex)), [LAB_ERROR.SEASON_NOT_SUPPORTED]);
  assert.equal(q(`?mode=games&sport=nfl&season=${ALL_SEASONS}`).valid, true);
  assert.equal(q(`?mode=seasons&sport=nfl&season=${ALL_SEASONS}`, seasonsIndex).valid, true);
  assert.deepEqual(codes(q(`?mode=players&sport=nfl&season=${ALL_SEASONS}&stat=receiving-yards`, playersIndex)), [LAB_ERROR.ALL_SEASONS_NOT_SUPPORTED]);
  assert.deepEqual(codes(q(`?mode=players&sport=nfl&season=${ALL_SEASONS}&stat=receiving-yards&player=keenan-allen`, playersIndex)), [LAB_ERROR.ALL_SEASONS_NOT_SUPPORTED]);
  // The default season is the projection's newest — never the reader's calendar.
  assert.equal(defaultLabQuery(gamesIndex).seasonId, "NFL-2025");
  // "all" over every season still costs ONE partition.
  assert.equal(queryPartitions(q(`?mode=games&sport=nfl&season=${ALL_SEASONS}`).query).length, 1);
});

/* ── LQ7 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ7 players mode requires a stat the sport defines; games mode refuses a stat", () => {
  const base = q("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards", playersIndex).query;
  assert.deepEqual(codes(validateLabQuery({ ...base, stat: null }, playersIndex)), [LAB_ERROR.STAT_REQUIRED]);
  assert.deepEqual(codes(validateLabQuery({ ...base, stat: "NFL.sacks" }, playersIndex)), [LAB_ERROR.STAT_NOT_SUPPORTED]);
  assert.deepEqual(codes(validateLabQuery({ ...base, stat: "EPL.goals" }, playersIndex)), [LAB_ERROR.STAT_NOT_SUPPORTED]);
  assert.deepEqual(q("?mode=players&sport=nfl&season=NFL-2025&stat=tackles", playersIndex).parseErrors.map((e) => e.code), [LAB_ERROR.STAT_NOT_SUPPORTED]);
  const g = q("?mode=games&sport=nfl&season=NFL-2025").query;
  assert.deepEqual(codes(validateLabQuery({ ...g, stat: "NFL.receivingYards" }, gamesIndex)), [LAB_ERROR.UNKNOWN_FIELD]);
  // A value filter or a value sort without a stat is refused rather than applied to nothing.
  assert.ok(codes(validateLabQuery({ ...base, stat: null, filters: [{ field: "statValue", op: "gte", value: 1 }] }, playersIndex)).includes(LAB_ERROR.STAT_REQUIRED));
  assert.ok(codes(validateLabQuery({ ...base, stat: null, sort: [{ field: "statValue", dir: "desc" }] }, playersIndex)).includes(LAB_ERROR.STAT_REQUIRED));
});

/* ── LQ8 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ8 every budget is enforced and refuses past its bound", () => {
  assert.equal(LAB_BUDGET.maxFilters, 8);
  assert.equal(LAB_BUDGET.maxRows, 500);
  assert.equal(LAB_BUDGET.maxPartitions, 2);
  const base = q("?mode=games&sport=nfl&season=NFL-2025").query;
  const many = Array.from({ length: LAB_BUDGET.maxFilters + 1 }, (_, i) => ({ field: "totalScore", op: "gte", value: i }));
  assert.ok(codes(validateLabQuery({ ...base, filters: many }, gamesIndex)).includes(LAB_ERROR.TOO_MANY_FILTERS));
  assert.ok(codes(validateLabQuery({ ...base, sort: [{ field: "date", dir: "desc" }, { field: "scored", dir: "desc" }, { field: "allowed", dir: "asc" }] }, gamesIndex)).includes(LAB_ERROR.TOO_MANY_SORTS));
  const sBase = q("?mode=seasons&sport=nfl&season=NFL-2025", seasonsIndex).query;
  assert.ok(codes(validateLabQuery({ ...sBase, filters: [{ field: "teamId", op: "in", value: [KC, LAC, SEA, KC, LAC] }] }, seasonsIndex)).includes(LAB_ERROR.TOO_MANY_ENTITIES));
  assert.deepEqual(codes(validateLabQuery({ ...base, pageSize: 1000 }, gamesIndex)), [LAB_ERROR.INVALID_VALUE, LAB_ERROR.LIMIT_EXCEEDED]);
  assert.deepEqual(codes(validateLabQuery({ ...base, page: 0 }, gamesIndex)), [LAB_ERROR.INVALID_VALUE]);
  assert.deepEqual(codes(validateLabQuery({ ...base, pageSize: 50, page: 11 }, gamesIndex)), [LAB_ERROR.LIMIT_EXCEEDED]);
  assert.equal(validateLabQuery({ ...base, pageSize: 50, page: 10 }, gamesIndex).valid, true);
  // A URL longer than the budget is refused rather than truncated.
  const long = `?mode=games&sport=nfl&season=NFL-2025&team=${"x".repeat(LAB_BUDGET.maxUrlLength)}`;
  assert.ok(parseLabQuery(long, gamesIndex).errors.some((e) => e.code === LAB_ERROR.QUERY_TOO_LARGE));
  // Every query the engine can be handed loads at most maxPartitions assets.
  for (const mode of LAB_MODES) {
    const idx = mode === "players" ? playersIndex : mode === "seasons" ? seasonsIndex : gamesIndex;
    const r = validateLabQuery(defaultLabQuery(idx), idx);
    assert.equal(r.valid, true, mode);
    assert.ok(queryPartitions(r.query).length <= LAB_BUDGET.maxPartitions - 1, `${mode} row partitions`);
  }
});

/* ── LQ9 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ9 a result, a side and a score are somebody's — they refuse without a team", () => {
  for (const key of ["result=W", "ha=H", "scored_min=20", "allowed_max=10"]) {
    const r = q(`?mode=games&sport=nfl&season=NFL-2025&${key}`);
    assert.deepEqual(codes(r), [LAB_ERROR.FIELD_REQUIRES_TEAM], key);
  }
  // Combined score is not team-relative and needs no team.
  assert.equal(q("?mode=games&sport=nfl&season=NFL-2025&total_min=40").valid, true);
  // Sorting by a team-relative column needs the team too.
  const base = q("?mode=games&sport=nfl&season=NFL-2025").query;
  assert.ok(codes(validateLabQuery({ ...base, sort: [{ field: "scored", dir: "desc" }] }, gamesIndex)).includes(LAB_ERROR.FIELD_REQUIRES_TEAM));
  assert.equal(q("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&result=W&ha=H&scored_min=20&sort=scored-desc").valid, true);
  // Opponent is the pair filter and also needs the perspective team.
  assert.deepEqual(codes(q("?mode=games&sport=nfl&season=NFL-2025&opp=los-angeles-chargers")), [LAB_ERROR.FIELD_REQUIRES_TEAM]);
});

/* ── LQ10 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ10 one logical query has exactly one canonical URL, and round-trips", () => {
  const canonical = "?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&result=W&scored_min=20&scored_max=40";
  // Parameter ORDER in the input does not change the canonical output.
  for (const scrambled of [
    "?scored_max=40&result=W&team=kansas-city-chiefs&season=NFL-2025&sport=nfl&mode=games&scored_min=20",
    "?mode=games&scored_min=20&sport=nfl&scored_max=40&team=kansas-city-chiefs&result=W&season=NFL-2025",
  ]) {
    const r = q(scrambled);
    assert.equal(r.valid, true, JSON.stringify(codes(r)));
    assert.equal(serializeLabQuery(r.query, gamesIndex), canonical);
  }
  // parse → validate → serialize → parse is a fixed point.
  const once = q(canonical);
  const twice = q(serializeLabQuery(once.query, gamesIndex));
  assert.deepEqual(twice.query, once.query);
  assert.equal(serializeLabQuery(twice.query, gamesIndex), canonical);
  // Two bounds on one field collapse into ONE clause, so the filter budget counts what a reader sees.
  assert.deepEqual(once.query.filters.find((f) => f.field === "scored"), { field: "scored", op: "between", value: [20, 40] });
  // Defaults are omitted, so the same state never has two spellings.
  assert.equal(serializeLabQuery(defaultLabQuery(gamesIndex), gamesIndex), "?mode=games&sport=nfl&season=NFL-2025");
  assert.equal(serializeLabQuery({ ...defaultLabQuery(gamesIndex), pageSize: LAB_BUDGET.defaultPageSize, page: 1 }, gamesIndex), "?mode=games&sport=nfl&season=NFL-2025");
  // An unknown key is ignored (a tracking parameter must not break a shared link) but never interpreted.
  const withJunk = q(`${canonical}&utm_source=x&somethingelse=1`);
  assert.equal(withJunk.valid, true);
  assert.equal(serializeLabQuery(withJunk.query, gamesIndex), canonical);
  // A known key with an unreadable value is an ERROR, not a guess.
  assert.deepEqual(q("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&result=X").parseErrors.map((e) => e.code), [LAB_ERROR.INVALID_VALUE]);
  assert.deepEqual(q("?mode=games&sport=nfl&season=NFL-2025&total_min=lots").parseErrors.map((e) => e.code), [LAB_ERROR.INVALID_VALUE]);
  assert.deepEqual(q("?mode=games&sport=nfl&season=NFL-2025&sort=date-sideways").parseErrors.map((e) => e.code), [LAB_ERROR.INVALID_VALUE]);
  assert.deepEqual(q("?mode=games&sport=nfl&season=NFL-2025&from=last-week").parseErrors.map((e) => e.code), [LAB_ERROR.INVALID_VALUE]);
  // A date range the wrong way round is refused.
  assert.deepEqual(codes(q("?mode=games&sport=nfl&season=NFL-2025&from=2025-12-01&to=2025-01-01")), [LAB_ERROR.INVALID_DATE_RANGE]);
});

/* ── LQ11 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ11 switching mode or sport drops incompatible state deliberately; reset returns a clean default", () => {
  const eplIndex = { ...playersIndex, sport: "EPL", seasons: ["EPL-2025-26"], seasonLabels: { "EPL-2025-26": "2025-26" }, families: ["EPL.goals"], seasonFamilies: { "EPL-2025-26": ["EPL.goals"] }, entities: [["mohamed-salah", "epl-athlete-148943", "Mohamed Salah", "LIV", "/players/epl/mohamed-salah/", [0]]], teams: [] };
  const nfl = q("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=keenan-allen&value_min=80&sort=statValue-desc&size=25", playersIndex);
  assert.equal(nfl.valid, true);

  // Sport switch: nothing sport-specific survives; a sort key the mode still offers and the page size do.
  const toEpl = switchTarget(nfl.query, { mode: "players", sport: "EPL" });
  assert.equal(toEpl, "?mode=players&sport=epl&sort=statValue-desc&size=25");
  const switched = q(toEpl, eplIndex);
  assert.equal(switched.valid, true, JSON.stringify(codes(switched)));
  assert.equal(switched.query.seasonId, "EPL-2025-26");   // the NEW index's newest season
  assert.equal(switched.query.stat, "EPL.goals");          // the NEW index's first family
  assert.deepEqual(switched.query.filters, []);            // no NFL athlete, no NFL threshold
  assert.deepEqual(switched.query.sort, [{ field: "statValue", dir: "desc" }]);
  assert.equal(switched.query.pageSize, 25);
  // And the NFL state really is invalid against the EPL index, so the drop was not cosmetic.
  assert.equal(validateLabQuery({ ...nfl.query, sport: "EPL" }, eplIndex).valid, false);

  // Mode switch: a sort key the new mode does not offer is dropped rather than carried into a refusal.
  const games = q("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&sort=scored-desc");
  assert.equal(games.valid, true);
  assert.equal(switchTarget(games.query, { mode: "players", sport: "NFL" }), "?mode=players&sport=nfl");
  assert.equal(switchTarget(games.query, { mode: "seasons", sport: "NFL" }), "?mode=seasons&sport=nfl&sort=scored-desc");
  // The sport is KEPT across a mode change when the new mode ships it — a mode tab changes the question, not the sport.
  assert.equal(switchTarget(games.query, { mode: "seasons" }), "?mode=seasons&sport=nfl&sort=scored-desc");
  // …and falls back to the new mode's first sport when it does not. EPL has players but no games or seasons.
  const eplPlayers = q("?mode=players&sport=epl&season=EPL-2025-26&stat=goals", { ...playersIndex, sport: "EPL", seasons: ["EPL-2025-26"], seasonLabels: { "EPL-2025-26": "x" }, families: ["EPL.goals"], seasonFamilies: { "EPL-2025-26": ["EPL.goals"] }, entities: [], teams: [] });
  assert.equal(switchTarget(eplPlayers.query, { mode: "games" }), "?mode=games&sport=mlb");
  // The default sort is never spelled out, so one state has one URL.
  assert.equal(switchTarget(q("?mode=games&sport=nfl&season=NFL-2025").query, { mode: "games", sport: "MLB" }), "?mode=games&sport=mlb");
  assert.equal(switchTarget(null, { mode: "games", sport: "NFL" }), "?mode=games&sport=nfl");

  // Reset: the clean default for the mode, nothing carried.
  assert.deepEqual(defaultLabQuery(gamesIndex).filters, []);
  assert.equal(defaultLabQuery(gamesIndex).page, 1);
});

/* ── LQ12 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ12 missing is not zero: a null never matches a numeric comparison; a recorded 0 does", () => {
  // Keenan Allen has three rows: 80, a recorded 0, and one where receiving yards were NOT recorded.
  const all = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=keenan-allen", playersIndex, playersData());
  assert.deepEqual(all.rows.map((r) => r.value), [80, 0]);          // the null row is not an answer at all
  assert.equal(all.totalMatched, 2);
  const gte0 = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=keenan-allen&value_min=0", playersIndex, playersData());
  assert.deepEqual(gte0.rows.map((r) => r.value), [80, 0]);          // >= 0 keeps the zero and still excludes the null
  const gte1 = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=keenan-allen&value_min=1", playersIndex, playersData());
  assert.deepEqual(gte1.rows.map((r) => r.value), [80]);
  // The OTHER family on the same rows: receptions ARE recorded for the null-yards game, so it appears there.
  const rec = run("?mode=players&sport=nfl&season=NFL-2025&stat=receptions&player=keenan-allen&value_min=0", playersIndex, playersData());
  // Newest first: 12-14 → 6, 10-01 → 3 (the game whose YARDS are not recorded), 09-06 → a recorded 0.
  assert.deepEqual(rec.rows.map((r) => r.value), [6, 3, 0]);
  // MUTATION: a null read as 0 would change every one of these answers.
  const zeroed = PLAYER_ROWS.map((r) => r.map((v, i) => (i >= PLAYER.VALUES && v === null ? 0 : v)));
  const mutated = run("?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&player=keenan-allen&value_min=0", playersIndex, playersData(zeroed));
  assert.notDeepEqual(mutated.rows.map((r) => r.value), gte0.rows.map((r) => r.value));
  assert.equal(mutated.totalMatched, 3);

  /*
   * THE SECOND LINE OF DEFENCE, exercised. The players runner drops a row whose selected family is not a number
   * before any comparison runs, so the comparator's own null rule was never reached by a real query — a mutation
   * probe that read `null` as `0` inside the comparator changed nothing and "passed". A guard nothing exercises is
   * not a guard, so the comparator is pinned here directly, through the games path, on a row whose score is null.
   */
  // KC is side A and its own score is NOT recorded; the opponent's 3 IS.
  const nullScore = [["401099", "2025-05-01T00:00:00Z", 0, 0, 1, null, 3, HOST_KNOWN, null], ...GAME_ROWS];
  const kcWith = (q) => run(`?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&${q}`, gamesIndex, gamesData(nullScore)).rows.some((r) => r.gameId === "401099");
  for (const [q, why] of [
    ["scored_min=0", "an unrecorded score must not match >= 0"],
    ["scored_max=100", "an unrecorded score must not match <= 100"],
    ["scored_min=0&scored_max=100", "an unrecorded score must not match a between"],
    ["total_min=0", "a game with one unrecorded score has no combined score"],
  ]) assert.equal(kcWith(q), false, why);
  // Each field is filtered on ITS OWN recorded value: the opponent's 3 is a fact and still matches.
  assert.equal(kcWith("allowed_min=3"), true, "a recorded opponent score still matches");
  assert.equal(kcWith("allowed_min=4"), false);
  // …and the recorded 0–0 game matches >= 0, so the rule excludes MISSING, not SMALL.
  assert.equal(run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&scored_min=0", gamesIndex, gamesData(nullScore)).rows.some((r) => r.gameId === "401003"), true);
});

/* ── LQ13 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ13 games: one row per canonical game id, finals only, scores symmetric, doubleheaders distinct", () => {
  const kc = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, gamesData());
  assert.equal(kc.totalMatched, 4);
  assert.equal(new Set(kc.rows.map((r) => r.gameId)).size, 4);
  // The same game seen from both sides is ONE row with mirrored perspective numbers.
  const fromKc = kc.rows.find((r) => r.gameId === "401001");
  const fromLac = run("?mode=games&sport=nfl&season=all&team=los-angeles-chargers", gamesIndex, gamesData()).rows.find((r) => r.gameId === "401001");
  assert.equal(fromKc.perspective.scored, fromLac.perspective.allowed);
  assert.equal(fromKc.perspective.allowed, fromLac.perspective.scored);
  assert.deepEqual([fromKc.perspective.result, fromLac.perspective.result], ["L", "W"]);
  assert.deepEqual([fromKc.perspective.homeAway, fromLac.perspective.homeAway], ["H", "A"]);
  // A recorded 0–0 is a TIE, not a missing final.
  const tie = kc.rows.find((r) => r.gameId === "401003");
  assert.equal(tie.perspective.result, "T");
  assert.deepEqual([tie.scoreA, tie.scoreB], [0, 0]);
  assert.equal(run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&result=T", gamesIndex, gamesData()).totalMatched, 1);
  // MUTATION: a duplicated game id must not be counted twice by the engine either.
  const dup = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, gamesData([...GAME_ROWS, GAME_ROWS[0]]));
  assert.equal(dup.rows.filter((r) => r.gameId === "401001").length, 2, "the engine does not dedupe — the PROJECTION must, and lab-projection.test.mjs proves it does");
  // Two same-day games with distinct ids stay two rows (an MLB doubleheader).
  const dh = gamesData([["900001", "2026-08-30T17:05:00Z", 0, 0, 1, 5, 4, HOST_KNOWN, null], ["900002", "2026-08-30T23:05:00Z", 0, 1, 0, 3, 0, HOST_KNOWN, null]]);
  assert.equal(run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, dh).totalMatched, 2);
});

/* ── LQ14 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ14 a game that proves no host is neutral — never home, never away", () => {
  const data = gamesData();
  const kcAll = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, data);
  const neutral = kcAll.rows.find((r) => r.gameId === "401002");
  assert.equal(neutral.hostKnown, false);
  assert.equal(neutral.perspective.homeAway, "N");
  // It matches N and neither H nor A, from EITHER side.
  for (const team of ["kansas-city-chiefs", "los-angeles-chargers"]) {
    assert.deepEqual(run(`?mode=games&sport=nfl&season=all&team=${team}&ha=N`, gamesIndex, data).rows.map((r) => r.gameId), ["401002"]);
    for (const ha of ["H", "A"]) {
      assert.equal(run(`?mode=games&sport=nfl&season=all&team=${team}&ha=${ha}`, gamesIndex, data).rows.some((r) => r.gameId === "401002"), false, `${team} ${ha}`);
    }
  }
  // MUTATION: setting HOST_KNOWN on that row invents a host, and the guard above would pass — so assert the
  // difference explicitly, which is what makes the flag load-bearing rather than decorative.
  const lying = GAME_ROWS.map((r) => (r[GAME.ID] === "401002" ? [...r.slice(0, GAME.FLAGS), HOST_KNOWN, r[GAME.PATH]] : r));
  assert.deepEqual(run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&ha=H", gamesIndex, gamesData(lying)).rows.map((r) => r.gameId).sort(), ["401001", "401002"]);
});

/* ── LQ15 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ15 players: the team of THAT game filters, never a current roster", () => {
  const data = playersData();
  // Keenan Allen's fixture hint is LAC, but one of his rows is recorded for KC.
  assert.equal(playersIndex.entities[2][3], "LAC");
  const forKc = run("?mode=players&sport=nfl&season=NFL-2025&stat=receptions&player=keenan-allen&team=kansas-city-chiefs", playersIndex, data);
  assert.deepEqual(forKc.rows.map((r) => r.gameId), ["401003"]);
  assert.equal(forKc.rows[0].team.label, "Kansas City Chiefs");
  const forLac = run("?mode=players&sport=nfl&season=NFL-2025&stat=receptions&player=keenan-allen&team=los-angeles-chargers", playersIndex, data);
  assert.deepEqual(forLac.rows.map((r) => r.gameId), ["401001", "401002"]);
  // Opponent is the row's opponent id, and home/away is the row's own side.
  assert.deepEqual(run("?mode=players&sport=nfl&season=NFL-2025&stat=receptions&opp=seattle-seahawks", playersIndex, data).rows.map((r) => r.gameId), ["401003"]);
  assert.deepEqual(run("?mode=players&sport=nfl&season=NFL-2025&stat=receptions&ha=N", playersIndex, data).rows.map((r) => r.gameId), ["401002"]);
  // MUTATION: filtering on the index hint instead of the row's team would return all three Allen rows for LAC.
  assert.notEqual(forLac.totalMatched, 3);
});

/* ── LQ16 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ16 results are deterministic: reversed input, identical output; ties break on a canonical key", () => {
  for (const [search, index, rows, make] of [
    ["?mode=games&sport=nfl&season=all&sort=date-desc", gamesIndex, GAME_ROWS, gamesData],
    ["?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&sort=statValue-desc", playersIndex, PLAYER_ROWS, playersData],
    ["?mode=seasons&sport=nfl&season=all&sort=wins-desc", seasonsIndex, SEASON_ROWS, seasonsData],
  ]) {
    const forward = run(search, index, make(rows));
    const reversed = run(search, index, make([...rows].reverse()));
    assert.equal(JSON.stringify(reversed.rows), JSON.stringify(forward.rows), search);
  }
  // A tie on the sort key is broken by game id descending, not by file order.
  const sameDay = [
    ["401010", "2025-11-01T00:00:00Z", 0, 0, 1, 10, 7, HOST_KNOWN, null],
    ["401011", "2025-11-01T00:00:00Z", 0, 2, 0, 3, 3, HOST_KNOWN, null],
    ["401012", "2025-11-01T00:00:00Z", 0, 0, 2, 20, 0, HOST_KNOWN, null],
  ];
  const asc = run("?mode=games&sport=nfl&season=all&sort=date-desc", gamesIndex, gamesData(sameDay));
  assert.deepEqual(asc.rows.map((r) => r.gameId), ["401012", "401011", "401010"]);
  assert.deepEqual(run("?mode=games&sport=nfl&season=all&sort=date-desc", gamesIndex, gamesData([...sameDay].reverse())).rows.map((r) => r.gameId), ["401012", "401011", "401010"]);
  // Season rows tie-break on season, then label, then canonical id.
  const seasonTies = [[2, 0, 17, 17, 11, 6, 0, 1, 1], [0, 0, 17, 17, 11, 6, 0, 2, 2], [1, 0, 17, 17, 11, 6, 0, 3, 3]];
  assert.deepEqual(run("?mode=seasons&sport=nfl&season=all&sort=wins-desc", seasonsIndex, seasonsData(seasonTies)).rows.map((r) => r.team.label),
    ["Kansas City Chiefs", "Los Angeles Chargers", "Seattle Seahawks"]);
});

/* ── LQ17 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ17 truncation is visible: the total counts everything and the cap is announced", () => {
  const many = Array.from({ length: LAB_BUDGET.maxRows + 137 }, (_, i) => [`9${String(i).padStart(6, "0")}`, `2025-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, 0, 0, 1, i % 50, 3, HOST_KNOWN, null]);
  const res = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, gamesData(many));
  assert.equal(res.totalMatched, LAB_BUDGET.maxRows + 137);
  assert.equal(res.available, LAB_BUDGET.maxRows);
  assert.equal(res.capped, true);
  assert.equal(res.returned, LAB_BUDGET.defaultPageSize);
  assert.equal(res.pageCount, LAB_BUDGET.maxRows / LAB_BUDGET.defaultPageSize);
  assert.deepEqual(res.warnings.map((w) => w.code), ["RESULT_CAP"]);
  const text = resultCountText(res);
  assert.match(text, new RegExp(String(res.totalMatched)));
  assert.match(text, /first 500 are available/);
  // Under the cap there is no cap claim, and the count sentence says how many are shown.
  const few = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs", gamesIndex, gamesData());
  assert.equal(few.capped, false);
  assert.deepEqual(few.warnings, []);
  assert.equal(resultCountText(few), "4 recorded games match.");
  assert.equal(resultCountText({ ...few, totalMatched: 0, returned: 0 }), "No recorded games match these filters.");
  // Paging never loses or repeats a row.
  const p1 = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&size=25&page=1", gamesIndex, gamesData(many));
  const p2 = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&size=25&page=2", gamesIndex, gamesData(many));
  assert.equal(new Set([...p1.rows, ...p2.rows].map((r) => r.gameId)).size, 50);
});

/* ── LQ18 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ18 sorting is factual: nulls last in both directions, and no row carries an evaluative field", () => {
  const withNulls = [
    [2, "401020", "2025-03-01T00:00:00Z", 0, 1, 0, "H", 5, 1],
    [2, "401021", "2025-03-02T00:00:00Z", 0, 1, 0, "H", null, 1],
    [2, "401022", "2025-03-03T00:00:00Z", 0, 1, 0, "H", 9, 1],
  ];
  for (const dir of ["asc", "desc"]) {
    const res = run(`?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&sort=statValue-${dir}`, playersIndex, playersData(withNulls));
    assert.deepEqual(res.rows.map((r) => r.value), dir === "asc" ? [5, 9] : [9, 5], dir);
    assert.equal(res.rows.some((r) => r.value == null), false);
  }
  // Season rows: a null-free numeric sort is still stable, and "sorted" is never "ranked".
  const res = run("?mode=seasons&sport=nfl&season=all&sort=scored-desc", seasonsIndex, seasonsData());
  assert.deepEqual(res.rows.map((r) => r.scored), [420, 401, 300]);
  const json = JSON.stringify(res).toLowerCase();
  for (const t of LAB_EVALUATIVE_TERMS) assert.equal(json.includes(t), false, `result carries "${t}"`);
  for (const key of ["rank", "winner", "advantage", "hitRate", "grade", "edge"]) {
    assert.equal(Object.keys(res.rows[0]).includes(key), false, key);
  }
  // Only declared fields are sortable.
  assert.equal(validateLabQuery({ ...defaultLabQuery(seasonsIndex), sort: [{ field: "games", dir: "desc" }] }, seasonsIndex).valid, false);
});

/* ── LQ19 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ19 every code has exactly one plain sentence, and no sentence is evaluative", () => {
  for (const code of Object.values(LAB_ERROR)) assert.equal(typeof errorText(code), "string", code);
  assert.equal(Object.keys(ERROR_COPY).length, Object.keys(LAB_ERROR).length);
  assert.throws(() => errorText("MADE_UP"), /unknown error code/);
  for (const code of Object.keys(BLOCKED_COPY)) assert.match(blockedText(code, { sportName: "Premier League" }), /\w/);
  assert.throws(() => blockedText("MADE_UP", { sportName: "x" }), /unknown blocked code/);
  for (const code of Object.keys(COVERAGE_COPY)) assert.match(coverageText(code), /\w/);
  assert.throws(() => coverageText("MADE_UP"), /unknown coverage note/);
  // Every blocker a mode can declare must have copy — a blocked sport that renders nothing is worse than none.
  for (const mode of LAB_MODES) for (const code of Object.values(LAB_BLOCKED_SPORTS[mode])) assert.ok(BLOCKED_COPY[code], `${mode}: ${code}`);
  const all = [...Object.values(ERROR_COPY).map((f) => f()), ...Object.values(COVERAGE_COPY), ...Object.keys(BLOCKED_COPY).map((c) => blockedText(c, { sportName: "MLB" }))].join(" ").toLowerCase();
  for (const t of LAB_EVALUATIVE_TERMS) assert.equal(all.includes(t), false, `copy says "${t}"`);
  // Database words stay in the docs, never in a sentence a reader sees (§129).
  for (const t of ["schema", "sql", "database", "partition", "query cost", "jsonl"]) assert.equal(all.includes(t), false, `copy says "${t}"`);
  // Every sortable field in every mode has words, and a direction is described in the column's own terms.
  for (const mode of LAB_MODES) for (const f of LAB_SORT_FIELDS[mode]) for (const dir of ["asc", "desc"]) assert.match(sortOptionText(f, dir), /\w+ · \w+/, `${mode} ${f} ${dir}`);
  assert.equal(sortOptionText("date", "desc"), "Date · newest first");
  assert.equal(sortOptionText("team", "asc"), "Team · A to Z");
  assert.equal(sortOptionText("scored", "desc"), "Scored · high to low");
  assert.throws(() => sortOptionText("madeUp", "asc"), /unknown sort field/);
});

/* ── LQ20 ────────────────────────────────────────────────────────────────────────────────────────── */

test("LQ20 the cost receipt reports work done and never a file path", () => {
  const res = run("?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&scored_min=20", gamesIndex, gamesData());
  assert.deepEqual(Object.keys(res.cost).sort(), ["partitions", "rowsMatched", "rowsReturned", "rowsScanned"]);
  assert.equal(res.cost.rowsScanned, GAME_ROWS.length);
  assert.equal(res.cost.rowsMatched, res.totalMatched);
  assert.equal(res.cost.rowsReturned, res.rows.length);
  assert.ok(res.cost.partitions <= LAB_BUDGET.maxPartitions);
  const json = JSON.stringify(res);
  for (const leak of ["/data/lab", "data/internal", ".json", ".gz", "lab-projection"]) assert.equal(json.includes(leak), false, leak);
  // The engine refuses a dataset that does not answer the query, rather than filtering the wrong rows.
  assert.throws(() => executeLabQuery(q("?mode=games&sport=nfl&season=NFL-2025").query, playersData()), /does not answer/);
  // SEASON tuple positions are the documented ones (a silent renumbering would move every column).
  assert.deepEqual([GAME.ID, GAME.PATH, PLAYER.VALUES, SEASON.ALLOWED], [0, 8, 7, 8]);
  assert.equal(LAB_QUERY_SCHEMA_VERSION, 1);
  assert.equal(LAB_PROJECTION_SCHEMA_VERSION, 1);
});
