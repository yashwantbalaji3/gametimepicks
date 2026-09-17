/**
 * Coverage receipts — gaps are a first-class output, not a footnote.
 *
 * Every number is a count over records actually built, against a denominator that is named. Nothing
 * here says "100%" unless the denominator is the platform's own normalized set, and the declared
 * UNSUPPORTED slices below say WHY a category is absent so a consumer cannot mistake absence for zero.
 */
import { STAT_FAMILIES } from "./stat-dictionary.mjs";

/** Categories no approved committed source can supply as id-keyed facts (v1.2). Reviewed, not computed. */
export const DECLARED_SLICES = Object.freeze({
  MLB: [
    { category: "player identity", status: "PARTIAL", reason: "StatsAPI person ids are normalized only for players carried by a committed factual row (prop actuals); lineups/boards are forecast-owned and are not treated as participation" },
    { category: "player-game box scores", status: "UNSUPPORTED", reason: "no box score is committed; settlement reads it live and keeps only priced-market actuals" },
    { category: "team-game stats beyond runs", status: "UNSUPPORTED", reason: "committed linescore projections carry runs only (no hits/errors/innings)" },
    { category: "2026 finals before 2026-07-04", status: "SOURCE_MISSING", reason: "the nightly linescore capture starts 2026-07-04; earlier 2026 games have schedule identity only" },
    { category: "2026 start times for games not in a schedule/board capture", status: "SOURCE_MISSING", reason: "finals archive and linescores carry dates, not instants" },
    { category: "postseason / spring training", status: "UNSUPPORTED", reason: "the finals archive is regular season only" },
  ],
  NFL: [
    { category: "EPA / efficiency / play-by-play", status: "UNSUPPORTED", reason: "derived research metrics are not platform facts; raw play-by-play is local-only (gitignored)" },
    { category: "player-game lines for nflverse players without an ESPN id", status: "UNRESOLVED_IDENTITY", reason: "the committed exact id bridge has no ESPN id for them; no id is minted from gsis or name" },
    { category: "2023–2025 preseason player lines", status: "UNSUPPORTED", reason: "preseason team sides are name-only in the committed ESPN player-events corpus" },
    { category: "1999–2012 player-game lines", status: "SOURCE_MISSING", reason: "committed player tables start in 2013" },
    { category: "start instants before 2023 and for games only in nflverse history", status: "SOURCE_MISSING", reason: "nflverse history carries the game date, not the kickoff instant" },
    { category: "2026 finals older than the ESPN results window", status: "SOURCE_MISSING", reason: "app/public/data/nfl/results/latest.json keeps a rolling 9-day window and is overwritten each run; earlier 2026 finals survive only inside settlement ledgers, which are not a platform fact source. Retaining dated results captures would close this" },
    { category: "2026 player-game lines", status: "UNSUPPORTED", reason: "the only committed 2026 box-score capture (data/internal/nfl/official-stats) zero-fills every category an athlete did not appear in, so a recorded zero and a missing category are indistinguishable — normalizing it would convert missing to zero" },
  ],
  EPL: [
    { category: "final scores / team-game stats", status: "UNSUPPORTED", reason: "every committed EPL score source is name-keyed (openfootball, research corpora, ESPN results capture without team ids); joining by club name is banned as identity" },
    { category: "ESPN event alias for 2026-27 fixtures", status: "UNRESOLVED_IDENTITY", reason: "no committed source links a shipped fixture id to an ESPN event id by id" },
    { category: "2026-27 player-game lines", status: "SOURCE_MISSING", reason: "the ESPN player-match corpus ends with 2025-26" },
    { category: "player current team", status: "UNSUPPORTED", reason: "the only squad snapshot predates the 2026 summer transfer deadline" },
    { category: "athletes not in the 2026-08-21 squad snapshot or the 2022–26 match corpus", status: "SOURCE_MISSING", reason: "late signings have ESPN ids in product projections but no committed identity capture" },
  ],
  UFC: [
    { category: "method / round / time / strikes", status: "UNSUPPORTED", reason: "only a name-keyed GPL-3.0 scrape carries them; no id join exists" },
    { category: "bouts completed after the ESPN history capture and outside the results window", status: "SOURCE_MISSING", reason: "the history corpus was captured 2026-08-10 and app/public/data/ufc/results/latest.json keeps a rolling 9-day window (overwritten each run); those bouts' ids exist in schedule captures but no committed final fact does, so they are excluded rather than asserted" },
    { category: "fighter current weight class / ranking", status: "UNSUPPORTED", reason: "not a committed id-keyed fact" },
  ],
});

/** @param {{ sportId:string, games:any[], teams:any[], players:any[], teamGameStats:any[], playerGameStats:any[], diagnostics:any[], sourceRows:Record<string,number>, conflicts:number, aliasRows:any[] }} s */
export function computeSportCoverage(s) {
  const seasons = {};
  const bySeason = (id) => (seasons[id] ??= {
    games: 0, finalGames: 0, gamesMissingStartUtc: 0, gamesMissingAnyDate: 0, gamesMissingTeamIds: 0,
    finalGamesWithoutTeamRows: 0, teamGameRows: {}, playerGameRows: {}, firstEventDate: null, lastEventDate: null,
  });
  const gameSeason = new Map();
  const teamRowGames = new Set(s.teamGameStats.map((r) => r.gameId));
  for (const g of s.games) {
    const c = bySeason(g.seasonId);
    gameSeason.set(g.id, g.seasonId);
    c.games += 1;
    if (g.statusClass === "FINAL") c.finalGames += 1;
    if (!g.startUtc) c.gamesMissingStartUtc += 1;
    if (!g.startUtc && !g.officialDate) c.gamesMissingAnyDate += 1;
    if (s.sportId !== "UFC" && (!g.homeTeamId || !g.awayTeamId)) c.gamesMissingTeamIds += 1;
    if (s.sportId !== "UFC" && g.statusClass === "FINAL" && !teamRowGames.has(g.id)) c.finalGamesWithoutTeamRows += 1;
    const d = (g.startUtc ?? g.officialDate ?? "").slice(0, 10) || null;
    if (d && (!c.firstEventDate || d < c.firstEventDate)) c.firstEventDate = d;
    if (d && (!c.lastEventDate || d > c.lastEventDate)) c.lastEventDate = d;
  }
  for (const r of s.teamGameStats) { const c = bySeason(gameSeason.get(r.gameId)); c.teamGameRows[r.family] = (c.teamGameRows[r.family] ?? 0) + 1; }
  for (const r of s.playerGameStats) { const c = bySeason(gameSeason.get(r.gameId)); c.playerGameRows[r.family] = (c.playerGameRows[r.family] ?? 0) + 1; }

  const families = Object.values(STAT_FAMILIES).filter((f) => f.sportId === s.sportId);
  const familyStatus = families.map((f) => {
    const rows = f.level === "team" ? s.teamGameStats.filter((r) => r.family === f.id).length : s.playerGameStats.filter((r) => r.family === f.id).length;
    return { family: f.id, level: f.level, rows, status: rows === 0 ? "SOURCE_MISSING" : /PARTIAL/.test(f.coverage) ? "PARTIAL" : "AVAILABLE", coverageNote: f.coverage };
  });

  const diagnostics = {};
  for (const d of s.diagnostics) diagnostics[d.code] = (diagnostics[d.code] ?? 0) + d.count;
  const aliasesByProvider = {};
  for (const [, provider, entityType] of s.aliasRows) aliasesByProvider[`${provider}:${entityType}`] = (aliasesByProvider[`${provider}:${entityType}`] ?? 0) + 1;

  const playersWithRows = new Set(s.playerGameStats.map((r) => r.playerId)).size;
  return {
    sportId: s.sportId,
    entities: { teams: s.teams.length, players: s.players.length, playersWithGameRows: playersWithRows, games: s.games.length },
    rows: { teamGame: s.teamGameStats.length, playerGame: s.playerGameStats.length },
    sourceRowsRead: Object.fromEntries(Object.entries(s.sourceRows).sort()),
    aliases: { total: s.aliasRows.length, byProvider: Object.fromEntries(Object.entries(aliasesByProvider).sort()) },
    diagnostics: Object.fromEntries(Object.entries(diagnostics).sort()),
    conflicts: s.conflicts,
    seasons: Object.fromEntries(Object.entries(seasons).sort()),
    families: familyStatus,
    declaredSlices: DECLARED_SLICES[s.sportId] ?? [],
  };
}
