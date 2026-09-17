/**
 * Data Platform read layer — small, source-agnostic selectors over the canonical store.
 *
 * Callers never see provider file shapes, never parse a source artifact, and never need to know whether a
 * game came from the 2023 finals archive or a 2026 schedule capture. Results are deterministic (explicit
 * ordering, explicit limits). Server/build-time only: this module reads data/internal and must never be
 * imported by a browser bundle (guarded by data-platform-boundary.test.mjs).
 *
 * Storage is replaceable; these signatures and the canonical ids are not.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PLATFORM_SCHEMA_VERSION, SPORT_IDS } from "./contract.mjs";
import { parseJsonl, compareTuple } from "./stable-json.mjs";
import { aliasKey, RESOLUTION } from "./aliases.mjs";
import { sportFiles } from "./build-core.mjs";

const readJson = (abs) => JSON.parse(fs.readFileSync(abs, "utf8"));

/** Content of a store file; `.gz` is transparently decompressed. */
export function readStoreText(abs) {
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

function readRows(abs) {
  if (!fs.existsSync(abs)) return [];
  const rows = parseJsonl(readStoreText(abs));
  for (const r of rows) {
    if (!Array.isArray(r) && r.schemaVersion !== PLATFORM_SCHEMA_VERSION) {
      throw new Error(`${abs}: record schemaVersion ${JSON.stringify(r.schemaVersion)} is not readable by the v${PLATFORM_SCHEMA_VERSION} reader`);
    }
  }
  return rows;
}
const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl.gz")).sort().flatMap((f) => readRows(path.join(dir, f))) : []);

/**
 * Re-read one sport's committed records (for incremental builds). Returns null when the sport was never built.
 * @param {string} root platform store root (…/platform/v1)
 */
export function readSportFromDisk(root, sportId) {
  const f = sportFiles(sportId);
  if (!fs.existsSync(path.join(root, f.teams)) && !fs.existsSync(path.join(root, f.gamesDir))) return null;
  const diagnostics = fs.existsSync(path.join(root, f.diagnostics)) ? readJson(path.join(root, f.diagnostics)).diagnostics : [];
  const conf = fs.existsSync(path.join(root, f.conflicts)) ? readJson(path.join(root, f.conflicts)) : { total: 0, groups: {} };
  const cov = fs.existsSync(path.join(root, f.coverage)) ? readJson(path.join(root, f.coverage)) : null;
  return {
    sportId,
    teams: readRows(path.join(root, f.teams)),
    players: readRows(path.join(root, f.players)),
    games: readDir(path.join(root, f.gamesDir)),
    teamGameStats: readDir(path.join(root, f.teamStatsDir)),
    playerGameStats: readDir(path.join(root, f.playerStatsDir)),
    diagnostics,
    conflictSummary: { total: conf.total, groups: conf.groups },
    sourceRows: cov?.sourceRowsRead ?? {},
  };
}

const SPORT_BY_ID_PREFIX = Object.freeze({ mlb: "MLB", nfl: "NFL", epl: "EPL", ufc: "UFC" });
const sportOfEntityId = (id) => SPORT_BY_ID_PREFIX[/^(mlb|nfl|epl|ufc)-/.exec(String(id ?? ""))?.[1]] ?? null;
const eventKey = (g) => g.startUtc ?? (g.officialDate ? `${g.officialDate}T` : null);

/**
 * @param {string} root platform store root, e.g. <repo>/data/internal/platform/v1
 */
export function openPlatform(root) {
  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`no platform manifest at ${manifestPath}`);
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== PLATFORM_SCHEMA_VERSION) throw new Error(`platform manifest schemaVersion ${manifest.schemaVersion} is not readable by this v${PLATFORM_SCHEMA_VERSION} reader`);
  const registry = (name) => readJson(path.join(root, name)).records;
  const sports = registry("sports.json");
  const leagues = registry("leagues.json");
  const seasons = registry("seasons.json");

  /** @type {Map<string, any>} */
  const loaded = new Map();
  const sport = (sportId) => {
    if (!SPORT_IDS.includes(sportId)) return null;
    if (loaded.has(sportId)) return loaded.get(sportId);
    const f = sportFiles(sportId);
    const s = {
      teams: new Map(readRows(path.join(root, f.teams)).map((r) => [r.id, r])),
      players: new Map(readRows(path.join(root, f.players)).map((r) => [r.id, r])),
      games: new Map(readDir(path.join(root, f.gamesDir)).map((r) => [r.id, r])),
      teamStats: readDir(path.join(root, f.teamStatsDir)),
      playerStats: readDir(path.join(root, f.playerStatsDir)),
      aliases: new Map(readRows(path.join(root, f.aliases)).map(([sp, provider, type, pid, id]) => [aliasKey(sp, provider, type, pid), id])),
    };
    // Build-time indexes — each proven used by a selector below.
    const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
    s.gamesByTeam = new Map();
    s.gamesBySeason = new Map();
    s.gamesByPlayer = new Map();
    for (const g of s.games.values()) {
      for (const t of [g.homeTeamId, g.awayTeamId]) if (t) push(s.gamesByTeam, t, g);
      for (const c of g.competitors ?? []) push(s.gamesByPlayer, c.playerId, g);
      push(s.gamesBySeason, g.seasonId, g);
    }
    s.teamStatsByTeam = new Map();
    for (const r of s.teamStats) push(s.teamStatsByTeam, r.teamId, r);
    s.playerStatsByPlayer = new Map();
    for (const r of s.playerStats) push(s.playerStatsByPlayer, r.playerId, r);
    loaded.set(sportId, s);
    return s;
  };

  const chrono = (order) => (a, b) => {
    const c = compareTuple([eventKey(a), a.id], [eventKey(b), b.id]);
    return order === "desc" ? -c : c;
  };
  const statChrono = (s, order) => (a, b) => {
    const ga = s.games.get(a.gameId), gb = s.games.get(b.gameId);
    const c = compareTuple([eventKey(ga), a.gameId, a.family], [eventKey(gb), b.gameId, b.family]);
    return order === "desc" ? -c : c;
  };
  const take = (list, { limit, offset = 0 } = {}) => {
    if (limit != null && (!Number.isInteger(limit) || limit < 0)) throw new Error("limit must be a non-negative integer");
    return limit == null ? list.slice(offset) : list.slice(offset, offset + limit);
  };

  const api = {
    manifest: () => manifest,
    getSport: (id) => sports.find((s) => s.id === id) ?? null,
    getLeague: (id) => leagues.find((l) => l.id === id) ?? null,
    getSeason: (id) => seasons.find((s) => s.id === id) ?? null,
    listSeasonsForLeague: (leagueId) => seasons.filter((s) => s.leagueId === leagueId),
    getTeam: (id) => sport(sportOfEntityId(id))?.teams.get(id) ?? null,
    getPlayer: (id) => sport(sportOfEntityId(id))?.players.get(id) ?? null,
    /** Game ids are unique within a sport (MLB gamePk, ESPN event ids), so the sport is required. */
    getGame: (sportId, id) => sport(sportId)?.games.get(String(id)) ?? null,

    /** Exact provider-id resolution. Never by name; UNKNOWN is an answer, not an error. */
    resolveAlias(sportId, provider, entityType, providerId) {
      const s = sport(sportId);
      const id = s?.aliases.get(aliasKey(sportId, provider, entityType, String(providerId)));
      return id ? { status: RESOLUTION.RESOLVED, id } : { status: RESOLUTION.UNKNOWN };
    },

    /** @param {string} teamId @param {{seasonId?:string, finalOnly?:boolean, order?:"asc"|"desc", limit?:number, offset?:number}} [o] */
    listGamesForTeam(teamId, o = {}) {
      const s = sport(sportOfEntityId(teamId));
      if (!s) return [];
      const list = (s.gamesByTeam.get(teamId) ?? []).filter((g) => (!o.seasonId || g.seasonId === o.seasonId) && (!o.finalOnly || g.statusClass === "FINAL"));
      return take([...list].sort(chrono(o.order)), o);
    },
    /** UFC: bouts a fighter competed in. */
    listGamesForPlayer(playerId, o = {}) {
      const s = sport(sportOfEntityId(playerId));
      if (!s) return [];
      const fromBouts = s.gamesByPlayer.get(playerId) ?? [];
      const fromStats = (s.playerStatsByPlayer.get(playerId) ?? []).map((r) => s.games.get(r.gameId));
      const uniq = [...new Map([...fromBouts, ...fromStats].map((g) => [g.id, g])).values()]
        .filter((g) => (!o.seasonId || g.seasonId === o.seasonId) && (!o.finalOnly || g.statusClass === "FINAL"));
      return take(uniq.sort(chrono(o.order)), o);
    },
    listGamesForSeason(seasonId, o = {}) {
      const sp = String(seasonId).split("-")[0];
      const s = sport(sp);
      if (!s) return [];
      return take([...(s.gamesBySeason.get(seasonId) ?? [])].sort(chrono(o.order)), o);
    },
    /** Games between two teams, most recent first by default. */
    listHeadToHead(teamA, teamB, o = {}) {
      const s = sport(sportOfEntityId(teamA));
      if (!s || sportOfEntityId(teamB) !== sportOfEntityId(teamA)) return [];
      const list = (s.gamesByTeam.get(teamA) ?? []).filter((g) => [g.homeTeamId, g.awayTeamId].includes(teamB) && (!o.finalOnly || g.statusClass === "FINAL"));
      return take([...list].sort(chrono(o.order ?? "desc")), o);
    },
    listTeamGameStats(teamId, o = {}) {
      const s = sport(sportOfEntityId(teamId));
      if (!s) return [];
      const list = (s.teamStatsByTeam.get(teamId) ?? []).filter((r) => (!o.family || r.family === o.family) && (!o.seasonId || s.games.get(r.gameId).seasonId === o.seasonId));
      return take([...list].sort(statChrono(s, o.order)), o);
    },
    listPlayerGameStats(playerId, o = {}) {
      const s = sport(sportOfEntityId(playerId));
      if (!s) return [];
      const list = (s.playerStatsByPlayer.get(playerId) ?? []).filter((r) => (!o.family || r.family === o.family) && (!o.seasonId || s.games.get(r.gameId).seasonId === o.seasonId));
      return take([...list].sort(statChrono(s, o.order)), o);
    },
    getTeamGameStat(sportId, gameId, teamId, family) {
      const s = sport(sportId);
      return s?.teamStats.find((r) => r.gameId === String(gameId) && r.teamId === teamId && (!family || r.family === family)) ?? null;
    },
    getPlayerGameStat(sportId, gameId, playerId, family) {
      const s = sport(sportId);
      return (s?.playerStatsByPlayer.get(playerId) ?? []).find((r) => r.gameId === String(gameId) && (!family || r.family === family)) ?? null;
    },
    /** Coverage for one sport — read this before treating an absent row as meaningful. */
    getCoverage(sportId) {
      const p = path.join(root, sportFiles(sportId).coverage);
      return fs.existsSync(p) ? readJson(p) : null;
    },
  };
  return api;
}

/** Every record in the store, for whole-store validation. */
export function readStore(root) {
  const registry = (name) => readJson(path.join(root, name)).records;
  const sports = SPORT_IDS.map((s) => readSportFromDisk(root, s)).filter(Boolean);
  return {
    sports: registry("sports.json"),
    leagues: registry("leagues.json"),
    seasons: registry("seasons.json"),
    teams: sports.flatMap((s) => s.teams),
    players: sports.flatMap((s) => s.players),
    games: sports.flatMap((s) => s.games),
    teamGameStats: sports.flatMap((s) => s.teamGameStats),
    playerGameStats: sports.flatMap((s) => s.playerGameStats),
  };
}

/**
 * Manifest integrity: every listed content file exists and its (decompressed) content hashes to the manifest's
 * sha256; no unlisted content file sits in the store. build-latest.json is wall-clock and deliberately unlisted.
 */
export async function verifyManifest(root) {
  const { sha256Hex } = await import("./stable-json.mjs");
  const manifest = readJson(path.join(root, "manifest.json"));
  const problems = [];
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const f of manifest.files) {
    const abs = path.join(root, f.path);
    if (!fs.existsSync(abs)) { problems.push(`missing ${f.path}`); continue; }
    const text = readStoreText(abs);
    if (sha256Hex(text) !== f.sha256) problems.push(`content hash mismatch ${f.path}`);
    if (Buffer.byteLength(text) !== f.contentBytes) problems.push(`content size mismatch ${f.path}`);
  }
  const walk = (dir, rel = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  for (const p of walk(root)) {
    if (p === "manifest.json" || p === "receipts/build-latest.json" || p === "receipts/parity.json") continue;
    if (!listed.has(p)) problems.push(`unlisted file ${p}`);
  }
  return { ok: problems.length === 0, problems, files: manifest.files.length };
}
