/**
 * PLAYER / FIGHTER RESEARCH READ MODEL (v1.3 · R1303) — pure factual selector over canonical platform records.
 *
 * RULES PINNED IN player-read-model.test.mjs
 *   - One row per game. NFL takes ESPN's line when ESPN recorded any value, else nflverse's; never a mix of both
 *     inside one row, and the row says which family it came from.
 *   - A row's team and opponent are THAT GAME's (the platform stat row), never the player's current team.
 *   - Missing is never zero: a null platform value stays null. A recorded 0 stays 0.
 *   - A row is a GAME LOG row only when it records participation: EPL `appeared === true` (an unused substitute
 *     is not a match played), NFL/MLB at least one recorded number, UFC a winner flag.
 *   - Order: canonical event instant desc, then game id desc. Never gradedAt / observedAt / build time.
 *   - Last 3/5/10 are ordered slices of rows where THAT stat is recorded (numbers only), with n stated. An average
 *     is published only with its n; there is no hit rate and no threshold.
 *   - UFC: won=true → W; won=false with a winner → L; no winner (draw / no contest) → N. A draw is never a loss.
 *   - Team results in an NFL/MLB log come from the canonical team final-score rows (teamGameResult) — never from
 *     settlement or a model.
 */
import { eventDate, newestFirst, teamGameResult } from "./team-read-model.mjs";
import { FAMILY_CODE, PLAYER_FAMILY_PRECEDENCE, PLAYER_GROUPS, UFC_RESULT, EPL_MATCH, sportColumns } from "./stat-groups.mjs";

export const WINDOWS = Object.freeze([3, 5, 10]);

/**
 * Packed player row:
 *   [gameId, date, seasonId, teamId, opponentId, ha, result, teamScore, oppScore, familyCode, detail, ...values]
 *   opponentId  opponent TEAM id (team sports) or opponent FIGHTER id (UFC)
 *   ha          "H" | "A" | "N" | null (UFC)
 *   result      team result W/L/T (NFL/MLB, when proven) · bout result W/L/N (UFC) · null (EPL: no id-keyed scores)
 *   detail      EPL "S" started / "B" came off the bench · UFC card id · otherwise null
 *   values      sportColumns(sport) order; null = not recorded
 */
export const PLAYER_ROW = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, TEAM: 3, OPP: 4, HA: 5, RESULT: 6, TEAM_SCORE: 7, OPP_SCORE: 8, FAM: 9, DETAIL: 10, VALUES: 11 });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Does a platform row record participation? */
export function recordsParticipation(row) {
  if (row.family === EPL_MATCH) return row.stats?.appeared === true;
  if (row.family === UFC_RESULT) return typeof row.stats?.won === "boolean" && typeof row.stats?.boutHadWinner === "boolean";
  const cols = sportColumns(row.sportId);
  return cols.some((c) => c.src[row.family] && isNum(row.stats?.[c.src[row.family]]));
}

/** UFC outcome from the platform's two flags. */
export function boutOutcome(stats) {
  if (stats?.won === true) return "W";
  if (stats?.won === false && stats?.boutHadWinner === true) return "L";
  if (stats?.won === false && stats?.boutHadWinner === false) return "N";
  return null;
}

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {{ sportId: string, player: any, statRows: any[], gamesById: Map<string, any>, teamStatsByGame: Map<string, any[]>, seasonLabel: (id: string) => string }} input
 */
export function buildPlayerResearch({ sportId, player, statRows, gamesById, teamStatsByGame, seasonLabel }) {
  const precedence = PLAYER_FAMILY_PRECEDENCE[sportId];
  const columns = sportColumns(sportId);

  // Choose ONE participating family row per game, by precedence.
  const chosen = new Map();
  for (const fam of precedence) {
    for (const r of statRows) {
      if (r.playerId !== player.id || r.family !== fam || chosen.has(r.gameId)) continue;
      if (!recordsParticipation(r)) continue;
      chosen.set(r.gameId, r);
    }
  }

  const games = [...chosen.keys()].map((id) => {
    const g = gamesById.get(id);
    if (!g) throw new Error(`player research: stat row references unknown game ${id}`);
    return g;
  }).sort(newestFirst);

  const rows = games.map((g) => {
    const r = chosen.get(g.id);
    if (sportId === "UFC") {
      return [g.id, eventDate(g), g.seasonId, null, r.opponentPlayerId ?? null, null, boutOutcome(r.stats), null, null, FAMILY_CODE[r.family], g.card?.id ?? null];
    }
    const ha = g.neutralSite === true ? "N" : g.homeTeamId === r.teamId ? "H" : g.awayTeamId === r.teamId ? "A" : null;
    const res = r.teamId ? teamGameResult(sportId, g, r.teamId, teamStatsByGame) : null;
    const detail = r.family === EPL_MATCH ? (r.stats.started === true ? "S" : "B") : null;
    const values = columns.map((c) => {
      const k = c.src[r.family];
      if (!k) return null;
      const v = r.stats?.[k];
      return isNum(v) ? v : null; // never coerce: undefined/null/"" stay not-recorded
    });
    return [g.id, eventDate(g), g.seasonId, r.teamId ?? null, r.opponentTeamId ?? null, ha, res?.result ?? null, res?.own ?? null, res?.opp ?? null, FAMILY_CODE[r.family], detail, ...values];
  });

  // Stat groups actually available: at least one row records a non-zero value of the group's primary stat.
  const colIndex = new Map(columns.map((c, i) => [c.key, i]));
  const groups = (PLAYER_GROUPS[sportId] ?? [])
    .map((g, order) => {
      const i = colIndex.get(g.primary);
      const volume = rows.filter((row) => isNum(row[PLAYER_ROW.VALUES + i]) && row[PLAYER_ROW.VALUES + i] !== 0).length;
      return { key: g.key, label: g.label, order, volume, columns: g.columns.map((c) => c.key) };
    })
    .filter((g) => g.volume > 0)
    .sort((a, b) => b.volume - a.volume || a.order - b.order)
    .map(({ key, label, columns: cols }) => ({ key, label, columns: cols }));

  // Last 3/5/10 per available column: newest rows where THAT stat is recorded.
  const windows = {};
  for (const g of groups) {
    for (const key of g.columns) {
      if (windows[key]) continue;
      const i = PLAYER_ROW.VALUES + colIndex.get(key);
      const recorded = rows.filter((row) => isNum(row[i]));
      windows[key] = WINDOWS.map((n) => {
        const slice = recorded.slice(0, n);
        const sum = slice.reduce((a, row) => a + row[i], 0);
        return { size: n, n: slice.length, values: slice.map((row) => row[i]), sum, avg: slice.length ? round1(sum / slice.length) : null };
      });
    }
  }

  const bySeason = new Map();
  for (const row of rows) {
    const s = bySeason.get(row[PLAYER_ROW.SEASON]) ?? { id: row[PLAYER_ROW.SEASON], label: seasonLabel(row[PLAYER_ROW.SEASON]), games: 0, totals: {}, teams: [] };
    s.games += 1;
    if (row[PLAYER_ROW.TEAM] && !s.teams.includes(row[PLAYER_ROW.TEAM])) s.teams.push(row[PLAYER_ROW.TEAM]);
    for (const [key, ci] of colIndex) {
      const v = row[PLAYER_ROW.VALUES + ci];
      if (!isNum(v)) continue;
      const t = s.totals[key] ?? { n: 0, sum: 0 };
      t.n += 1;
      t.sum += v;
      s.totals[key] = t;
    }
    if (sportId === "UFC") {
      const o = row[PLAYER_ROW.RESULT];
      s.record ??= { w: 0, l: 0, n: 0 };
      if (o === "W") s.record.w += 1; else if (o === "L") s.record.l += 1; else if (o === "N") s.record.n += 1;
    }
    bySeason.set(s.id, s);
  }
  const seasons = [...bySeason.values()].sort((a, b) => (a.id < b.id ? 1 : -1));

  let record = null;
  if (sportId === "UFC") {
    record = { w: 0, l: 0, n: 0 };
    for (const row of rows) {
      const o = row[PLAYER_ROW.RESULT];
      if (o === "W") record.w += 1; else if (o === "L") record.l += 1; else if (o === "N") record.n += 1;
    }
  }

  return {
    entityType: "player",
    id: player.id,
    sport: sportId,
    name: player.name,
    currentTeamId: player.currentTeamId ?? null,
    columns: columns.map((c) => ({ key: c.key, label: c.label, short: c.short, unit: c.unit })),
    groups,
    seasons,
    defaultSeason: seasons[0]?.id ?? null,
    firstDate: rows.length ? rows[rows.length - 1][PLAYER_ROW.DATE] : null,
    lastDate: rows.length ? rows[0][PLAYER_ROW.DATE] : null,
    record,
    windows,
    gameLog: rows,
  };
}
