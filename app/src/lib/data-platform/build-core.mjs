/**
 * Pure assembly: adapter results → the exact bytes of every platform artifact.
 *
 * Nothing here touches the filesystem or the clock, so determinism is testable directly: the same adapter
 * results always produce the same `files` map. The CLI (app/scripts/data-platform/build.mjs) does the I/O,
 * refuses to write when validation fails, and keeps wall-clock build metadata OUT of these files (it goes
 * to receipts/build-latest.json, which the manifest does not hash).
 */
import { PLATFORM_SCHEMA_VERSION, SPORT_IDS } from "./contract.mjs";
import { LEAGUE_IDS } from "./ids.mjs";
import { seasonRecord } from "./records.mjs";
import { buildAliasIndex } from "./aliases.mjs";
import { validateStore } from "./validate.mjs";
import { computeSportCoverage } from "./coverage.mjs";
import { STAT_FAMILIES } from "./stat-dictionary.mjs";
import { DIAGNOSTIC_CODES } from "./diagnostics.mjs";
import { stablePretty, toJsonl, sha256Hex, compareIds, compareTuple } from "./stable-json.mjs";

export const PLATFORM_DIR_VERSION = "v1";
export const BUILDER_ID = "gametime-data-platform-build@1";

export const SPORT_NAMES = Object.freeze({ MLB: "Baseball — Major League Baseball", NFL: "American football — National Football League", EPL: "Association football — Premier League", UFC: "Mixed martial arts — UFC" });
const LEAGUE_NAMES = Object.freeze({ MLB: "Major League Baseball", NFL: "National Football League", EPL: "Premier League", UFC: "Ultimate Fighting Championship" });

/** "MLB-2025" → "2025", "EPL-2025-26" → "2025-26" */
export const seasonPart = (seasonId) => String(seasonId).replace(/^[A-Z]+-/, "");

export const sportFiles = (sportId) => ({
  teams: `teams/${sportId}.jsonl.gz`,
  players: `players/${sportId}.jsonl.gz`,
  aliases: `aliases/${sportId}.jsonl.gz`,
  coverage: `coverage/${sportId}.json`,
  diagnostics: `receipts/${sportId}/diagnostics.json`,
  conflicts: `receipts/${sportId}/conflicts.json`,
  gamesDir: `games/${sportId}/`,
  teamStatsDir: `team-game-stats/${sportId}/`,
  playerStatsDir: `player-game-stats/${sportId}/`,
});

const byId = (a, b) => compareIds(a.id, b.id);
const statOrder = (idField) => (a, b) => compareTuple([a.gameId, a[idField], a.family], [b.gameId, b[idField], b.family]);

const CONFLICT_SAMPLE_CAP = 40;
export function summarizeConflicts(conflicts) {
  const sorted = [...conflicts].sort((a, b) => compareTuple([a.kind, a.field, a.id, a.other?.src], [b.kind, b.field, b.id, b.other?.src]));
  const groups = {};
  for (const c of sorted) {
    const k = `${c.kind}.${c.field}`;
    const g = (groups[k] ??= { count: 0, rule: c.rule, samples: [] });
    g.count += 1;
    if (g.samples.length < CONFLICT_SAMPLE_CAP) g.samples.push({ id: c.id, chosen: c.chosen, other: c.other });
  }
  return { total: sorted.length, groups };
}

/**
 * Canonical in-memory form of one sport (records sorted, partition-ready). Accepts a fresh adapter result
 * or records re-read from disk (incremental builds).
 */
export function normalizeSportResult(result) {
  return {
    sportId: result.sportId,
    teams: [...result.teams].sort(byId),
    players: [...result.players].sort(byId),
    games: [...result.games].sort(byId),
    teamGameStats: [...result.teamGameStats].sort(statOrder("teamId")),
    playerGameStats: [...result.playerGameStats].sort(statOrder("playerId")),
    diagnostics: result.diagnostics ?? [],
    conflictSummary: result.conflictSummary ?? summarizeConflicts(result.conflicts ?? []),
    sourceRows: result.sourceRows ?? {},
  };
}

/**
 * @param {Array<ReturnType<typeof normalizeSportResult>>} sports every sport in the store (rebuilt or re-read)
 * @param {{ sources: any }} meta sources.json content (artifact fingerprints; produced by the CLI)
 */
export function assemblePlatform(sports, meta) {
  const files = new Map();
  const put = (p, content) => files.set(p, content);

  const sportRecords = SPORT_IDS.map((id) => ({ schemaVersion: PLATFORM_SCHEMA_VERSION, id, name: SPORT_NAMES[id] }));
  const leagueRecords = SPORT_IDS.map((id) => ({ schemaVersion: PLATFORM_SCHEMA_VERSION, id: LEAGUE_IDS[id], sportId: id, name: LEAGUE_NAMES[id], providerAliases: [] }));
  const seasonIds = new Map();
  for (const s of sports) for (const g of s.games) if (g.seasonId && !seasonIds.has(`${s.sportId}|${g.seasonId}`)) seasonIds.set(`${s.sportId}|${g.seasonId}`, seasonRecord(s.sportId, seasonPart(g.seasonId)));
  const seasonRecords = [...seasonIds.values()].sort((a, b) => compareTuple([a.sportId, a.id], [b.sportId, b.id]));

  // Validation first: nothing is emitted from a store that fails.
  const all = (k) => sports.flatMap((s) => s[k]);
  const validation = validateStore({
    sports: sportRecords, leagues: leagueRecords, seasons: seasonRecords,
    teams: all("teams"), players: all("players"), games: all("games"),
    teamGameStats: all("teamGameStats"), playerGameStats: all("playerGameStats"),
  });

  put("sports.json", stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, records: sportRecords }));
  put("leagues.json", stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, records: leagueRecords }));
  put("seasons.json", stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, records: seasonRecords }));
  put("stat-dictionary.json", stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, families: STAT_FAMILIES }));
  put("sources.json", stablePretty(meta.sources));

  const manifestSports = {};
  for (const s of sports) {
    const f = sportFiles(s.sportId);
    put(f.teams, toJsonl(s.teams));
    put(f.players, toJsonl(s.players));
    const seasonOfGame = new Map(s.games.map((g) => [g.id, seasonPart(g.seasonId)]));
    const partition = (rows, dir, seasonOf) => {
      const parts = new Map();
      for (const r of rows) {
        const k = seasonOf(r);
        if (!parts.has(k)) parts.set(k, []);
        parts.get(k).push(r);
      }
      for (const [k, list] of [...parts].sort((a, b) => compareIds(a[0], b[0]))) put(`${dir}${k}.jsonl.gz`, toJsonl(list));
    };
    partition(s.games, f.gamesDir, (g) => seasonPart(g.seasonId));
    partition(s.teamGameStats, f.teamStatsDir, (r) => seasonOfGame.get(r.gameId));
    partition(s.playerGameStats, f.playerStatsDir, (r) => seasonOfGame.get(r.gameId));

    const aliasRows = buildAliasIndex([...s.teams, ...s.players, ...s.games]).rows();
    put(f.aliases, toJsonl(aliasRows));
    put(f.diagnostics, stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, sportId: s.sportId, diagnostics: s.diagnostics }));
    put(f.conflicts, stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, sportId: s.sportId, ...s.conflictSummary }));
    const coverage = computeSportCoverage({ ...s, conflicts: s.conflictSummary.total, aliasRows });
    put(f.coverage, stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, ...coverage }));

    const count = (pred) => s.diagnostics.filter(pred).reduce((n, d) => n + d.count, 0);
    manifestSports[s.sportId] = {
      seasons: [...new Set(s.games.map((g) => g.seasonId))].sort(),
      teams: s.teams.length,
      players: s.players.length,
      games: s.games.length,
      teamGameRows: s.teamGameStats.length,
      playerGameRows: s.playerGameStats.length,
      aliases: aliasRows.length,
      unresolvedIdentityRows: count((d) => /^UNRESOLVED_|^AMBIGUOUS_ALIAS$/.test(d.code)),
      droppedRows: count((d) => DIAGNOSTIC_CODES[d.code] === "ROW_DROPPED"),
      excludedRows: count((d) => DIAGNOSTIC_CODES[d.code] === "ROW_EXCLUDED"),
      sourceConflicts: s.conflictSummary.total,
    };
  }

  put("receipts/validation.json", stablePretty({ schemaVersion: PLATFORM_SCHEMA_VERSION, ok: validation.ok, checked: validation.checked, errors: validation.errors }));

  // Hashes and byte counts describe the UNCOMPRESSED content: `.gz` is storage, and gzip bytes may vary by zlib
  // build while the content does not.
  const contentFiles = [...files.keys()].sort().map((p) => ({ path: p, storage: p.endsWith(".gz") ? "gzip" : "plain", contentBytes: Buffer.byteLength(files.get(p)), sha256: sha256Hex(files.get(p)) }));
  const manifest = {
    schemaVersion: PLATFORM_SCHEMA_VERSION,
    artifact: "gametime-data-platform-manifest",
    dataClass: "INTERNAL",
    public: false,
    storeVersion: PLATFORM_DIR_VERSION,
    builder: BUILDER_ID,
    note: "Content manifest. Deterministic: no wall-clock field. Build timing lives in receipts/build-latest.json, which is not hashed here. Source cutoffs describe the SOURCES (their latest event/capture evidence), never the build time.",
    sourceCutoff: meta.sources?.cutoffs ?? {},
    sports: manifestSports,
    totals: Object.fromEntries(["teams", "players", "games", "teamGameRows", "playerGameRows", "aliases", "unresolvedIdentityRows", "droppedRows", "excludedRows", "sourceConflicts"].map((k) => [k, Object.values(manifestSports).reduce((n, s) => n + s[k], 0)])),
    leagues: leagueRecords.length,
    seasons: seasonRecords.length,
    validation: { ok: validation.ok, errorCodes: validation.errors.map((e) => e.code) },
    files: contentFiles,
  };
  put("manifest.json", stablePretty(manifest));
  return { files, validation, manifest };
}
