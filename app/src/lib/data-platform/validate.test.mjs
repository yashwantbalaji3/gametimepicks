/**
 * DATA PLATFORM STORE VALIDATION + DETERMINISTIC ASSEMBLY (v1.2 · D1205/D1207). Literal stores only.
 *
 * Run: npx tsx --test src/lib/data-platform/validate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStore } from "./validate.mjs";
import { assemblePlatform, normalizeSportResult } from "./build-core.mjs";
import { gameRecord, teamRecord, playerRecord, teamGameStatRecord, playerGameStatRecord, seasonRecord, alias } from "./records.mjs";
import { PLATFORM_SCHEMA_VERSION } from "./contract.mjs";

const V = PLATFORM_SCHEMA_VERSION;
const T = (n) => teamRecord("MLB", `mlb-team-${n}`, { name: `Team ${n}` }, [alias("mlb_statsapi", "team", String(n))]);
const G = (pk, over = {}) => gameRecord("MLB", String(pk), { seasonKey: "2024", officialDate: "2024-04-04", homeTeamId: "mlb-team-121", awayTeamId: "mlb-team-116", statusClass: "FINAL", ...over }, [alias("mlb_statsapi", "game", String(pk))]);
const R = (pk, teamId, opp, homeAway, runs, over = {}) => teamGameStatRecord({ family: "mlb.final-score", sportId: "MLB", gameId: String(pk), teamId, opponentTeamId: opp, homeAway, isFinal: true, stats: { runs }, src: "mlb.finals-history", ...over });
const base = () => ({
  sports: [{ schemaVersion: V, id: "MLB", name: "Baseball" }],
  leagues: [{ schemaVersion: V, id: "MLB", sportId: "MLB", name: "MLB", providerAliases: [] }],
  seasons: [seasonRecord("MLB", "2024")],
  teams: [T(121), T(116)],
  players: [],
  games: [G(745844)],
  teamGameStats: [R(745844, "mlb-team-121", "mlb-team-116", "HOME", 3), R(745844, "mlb-team-116", "mlb-team-121", "AWAY", 6)],
  playerGameStats: [],
});
const codes = (store) => validateStore(store).errors.map((e) => e.code);

test("V1 a coherent store validates", () => {
  const v = validateStore(base());
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("V2 duplicate gamePk emitted twice is refused; one provider id on two DIFFERENT games collides", () => {
  const s = base();
  s.games.push(G(745844));
  assert.ok(codes(s).includes("DUPLICATE_ID"));
  const t = base();
  t.games.push({ ...G(745845), providerAliases: [alias("mlb_statsapi", "game", "745844")] });
  assert.ok(codes(t).includes("ALIAS_COLLISION"));
});

test("V3 orphan rows are refused: unknown game, team, season, player", () => {
  const s = base();
  s.teamGameStats.push(R(999999, "mlb-team-121", "mlb-team-116", "HOME", 1));
  s.games.push(G(745845, { seasonKey: "2019", homeTeamId: "mlb-team-999" }));
  s.playerGameStats.push(playerGameStatRecord({ family: "mlb.prop-actuals", sportId: "MLB", gameId: "745844", playerId: "mlb-player-1", stats: { hits: 1, totalBases: null, hitsRunsRbis: null, pitcherStrikeouts: null }, src: "mlb.settled-leans" }));
  const e = validateStore(s).errors.find((x) => x.code === "ORPHAN_REF");
  assert.ok(e.count >= 4, JSON.stringify(e));
});

test("V4 a final-score row on a NOT_FINAL game is refused — a scheduled game is never 0–0", () => {
  const s = base();
  s.games = [G(745844, { statusClass: "NOT_FINAL" })];
  assert.ok(codes(s).includes("FINAL_FACT"));
});

test("V5 a stat row for a team that did not play, or with a swapped side, is refused", () => {
  const s = base();
  s.teams.push(T(147));
  s.teamGameStats = [R(745844, "mlb-team-147", "mlb-team-116", "HOME", 3), R(745844, "mlb-team-116", "mlb-team-121", "HOME", 6)];
  const e = validateStore(s).errors.find((x) => x.code === "STAT_SIDE");
  assert.ok(e && e.count >= 2);
});

test("V6 duplicate stat rows for one (family, game, team) are refused", () => {
  const s = base();
  s.teamGameStats.push(R(745844, "mlb-team-121", "mlb-team-116", "HOME", 3));
  assert.ok(codes(s).includes("DUPLICATE_STAT_ROW"));
});

test("V7 a game in the wrong season partition is refused; a name-shaped id is refused", () => {
  const s = base();
  s.seasons.push(seasonRecord("MLB", "2019"));
  s.games = [G(745844, { seasonKey: "2019" })];
  assert.ok(codes(s).includes("SEASON_IMPLAUSIBLE"));
  const t = base();
  t.teams.push(teamRecord("MLB", "yankees", { name: "Yankees" }, [alias("mlb_statsapi", "team", "147")]));
  assert.ok(codes(t).includes("ID_FORMAT"));
});

test("V8 UFC bouts need two distinct fighters in RED/BLUE, a card, and no team fields", () => {
  const f = (id) => playerRecord("UFC", `ufc-athlete-${id}`, { name: `F${id}` }, [alias("espn", "player", String(id))]);
  const bout = gameRecord("UFC", "401575164", { seasonKey: "2023", startUtc: "2023-09-16T23:00:00Z", competitors: [{ playerId: "ufc-athlete-1", corner: "RED" }, { playerId: "ufc-athlete-1", corner: "BLUE" }], card: null, statusClass: "FINAL" }, [alias("espn", "game", "401575164")]);
  const s = { sports: [{ schemaVersion: V, id: "UFC", name: "MMA" }], leagues: [{ schemaVersion: V, id: "UFC", sportId: "UFC", name: "UFC", providerAliases: [] }], seasons: [seasonRecord("UFC", "2023")], teams: [], players: [f(1), f(2)], games: [bout], teamGameStats: [], playerGameStats: [] };
  const e = validateStore(s).errors.find((x) => x.code === "PARTICIPANTS");
  assert.ok(e && e.count >= 2, JSON.stringify(validateStore(s).errors));
});

test("V9 assembly is deterministic: shuffled inputs ⇒ byte-identical files; no wall clock in content", () => {
  const sport = (order) => {
    const s = base();
    const games = [G(745844), G(745843, { homeTeamId: "mlb-team-116", awayTeamId: "mlb-team-121" })];
    const rows = [...s.teamGameStats, R(745843, "mlb-team-116", "mlb-team-121", "HOME", 2), R(745843, "mlb-team-121", "mlb-team-116", "AWAY", 1)];
    return normalizeSportResult({ sportId: "MLB", teams: order ? s.teams : [...s.teams].reverse(), players: [], games: order ? games : [...games].reverse(), teamGameStats: order ? rows : [...rows].reverse(), playerGameStats: [], diagnostics: [], conflicts: [], sourceRows: {} });
  };
  const a = assemblePlatform([sport(true)], { sources: { cutoffs: {}, sources: [] } });
  const b = assemblePlatform([sport(false)], { sources: { cutoffs: {}, sources: [] } });
  assert.deepEqual([...a.files.keys()].sort(), [...b.files.keys()].sort());
  for (const [p, c] of a.files) assert.equal(b.files.get(p), c, `${p} differs with input order`);
  const manifest = a.files.get("manifest.json");
  assert.doesNotMatch(manifest, /"(builtAt|generatedAt|now)"/);
  assert.equal(a.validation.ok, true);
});

test("V10 a failing store is reported by assembly (the CLI refuses to write it)", () => {
  const s = base();
  const bad = normalizeSportResult({ sportId: "MLB", teams: s.teams, players: [], games: [G(745844), G(745844)], teamGameStats: s.teamGameStats, playerGameStats: [], diagnostics: [], conflicts: [], sourceRows: {} });
  const { validation, files } = assemblePlatform([bad], { sources: { cutoffs: {}, sources: [] } });
  assert.equal(validation.ok, false);
  assert.match(files.get("manifest.json"), /"ok": false/);
});
