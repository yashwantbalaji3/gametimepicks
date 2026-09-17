/**
 * MLB source adapter — committed artifacts → canonical records. Pure: parsed inputs in, records +
 * diagnostics out. No I/O, no clock, no network, no names as identity.
 *
 * SOURCES (source keys are the provenance `src` on every row; artifacts + fingerprints live in sources.json)
 *   mlb.finals-history    data/internal/mlb/linescores-history/<season>/<date>.json — 2023–2025 regular-season
 *                         finals, gamePk + StatsAPI team ids + venue id. Founder-approved research archive:
 *                         ONLY this platform reads it; no live model input may (finals-history-isolation test).
 *   mlb.linescores        data/internal/mlb/linescores/<date>.json — 2026 nightly finals. gamePk + NAMES only:
 *                         sides are attached by gamePk from an id-bearing source and CHECKED against names.
 *   mlb.statsapi-schedule app/public/data/mlb/statsapi-schedule/<date>.json — start instant + team ids.
 *   mlb.boards            app/public/data/mlb/boards/<date>.json (games[] only) — start + team ids + abbr.
 *   mlb.settled-leans     app/public/data/mlb/results/settled_leans.jsonl — box-score actuals for priced player markets.
 *
 * FIELD PRECEDENCE
 *   startUtc      statsapi-schedule > boards            (history + linescores carry no time)
 *   officialDate  finals-history > linescores           (schedule/board file dates are request dates, not officialDate)
 *   teams         finals-history > statsapi-schedule > boards
 *   venue         finals-history (id+name) > statsapi-schedule (name) > boards (name)
 *   seasonKey     finals-history > linescores > statsapi-schedule > boards
 *   statusClass   FINAL only from finals-history / linescores (isFinal rows); captures never assert FINAL
 *   runs          finals-history > linescores
 */
import { createMerger, createLabelPicker } from "../merge.mjs";
import { mlbGameId, mlbTeamId, mlbPlayerId } from "../ids.mjs";
import { normalizeInstant, isDate } from "../contract.mjs";
import { alias, teamRecord, playerRecord, gameRecord, sidePair, playerGameStatRecord, GAME_FIELDS } from "../records.mjs";
import { sourceValue, validateStats } from "../stat-dictionary.mjs";

export const MLB_SOURCES = Object.freeze({
  HISTORY: "mlb.finals-history",
  LINESCORES: "mlb.linescores",
  SCHEDULE: "mlb.statsapi-schedule",
  BOARDS: "mlb.boards",
  LEANS: "mlb.settled-leans",
});
const S = MLB_SOURCES;

/** StatsAPI coded states that are never results, whatever abstractState says (statsapi-linescore.ts rule). */
const NON_RESULT_CODES = new Set(["C", "D", "U"]);

const LEAN_MARKET_TO_STAT = Object.freeze({
  batter_hits: "hits",
  batter_total_bases: "totalBases",
  batter_hits_runs_rbis: "hitsRunsRbis",
  pitcher_strikeouts: "pitcherStrikeouts",
});

/**
 * @param {{ finalsHistory?: Array<{path:string, doc:any}>, linescores?: Array<{path:string, doc:any}>,
 *   schedules?: Array<{path:string, doc:any}>, boards?: Array<{path:string, date:string, games:any[]}>,
 *   settledLeans?: {path:string, rows:any[]} }} input
 * @param {ReturnType<import("../diagnostics.mjs").createDiagnostics>} diag
 */
export function adaptMlb(input, diag) {
  const SPORT = "MLB";
  const games = createMerger({
    kind: "game", sportId: SPORT, fields: GAME_FIELDS,
    defaultPrecedence: [S.HISTORY, S.LINESCORES, S.SCHEDULE, S.BOARDS],
    precedence: {
      startUtc: [S.SCHEDULE, S.BOARDS],
      officialDate: [S.HISTORY, S.LINESCORES],
      homeTeamId: [S.HISTORY, S.SCHEDULE, S.BOARDS],
      awayTeamId: [S.HISTORY, S.SCHEDULE, S.BOARDS],
      venue: [S.HISTORY, S.SCHEDULE, S.BOARDS],
      statusClass: [S.HISTORY, S.LINESCORES],
    },
  });
  const scores = createMerger({ kind: "final-score", sportId: SPORT, fields: ["home", "away"], defaultPrecedence: [S.HISTORY, S.LINESCORES], precedence: {} });
  const teamNames = createLabelPicker([S.SCHEDULE, S.BOARDS, S.HISTORY]);
  const teamAbbr = createLabelPicker([S.BOARDS]);
  const teamAliases = new Map();
  /** gamePk → id-bearing side names, for CHECKING (never joining) the name-only linescores */
  const sideNames = new Map();
  const sourceRows = {};
  const bump = (k, n = 1) => { sourceRows[k] = (sourceRows[k] ?? 0) + n; };

  const noteTeam = (rawId, name, date, src) => {
    const id = mlbTeamId(rawId);
    if (!id) return null;
    teamAliases.set(id, alias("mlb_statsapi", "team", String(rawId)));
    teamNames.add(id, name, date, src);
    return id;
  };
  const venueOf = (v) => {
    if (v == null) return null;
    if (typeof v === "string") return v.trim() ? { providerId: null, name: v.trim() } : null;
    const providerId = v.id != null && /^\d+$/.test(String(v.id)) ? String(v.id) : null;
    const name = typeof v.name === "string" && v.name.trim() ? v.name.trim() : null;
    return providerId || name ? { providerId, name } : null;
  };

  // ── finals history ──────────────────────────────────────────────────────────────────────────────
  for (const { doc } of input.finalsHistory ?? []) {
    for (const g of doc?.games ?? []) {
      bump(S.HISTORY);
      const id = mlbGameId(g.gamePk);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.HISTORY, { date: doc?.date }); continue; }
      if (g.isFinal !== true || g.gameType !== "R") { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.HISTORY, { id, reason: "non-final or non-regular" }); continue; }
      if (games.has(id)) diag.add("DUPLICATE_SOURCE_OCCURRENCE", SPORT, S.HISTORY, { id });
      const home = noteTeam(g.home?.id, g.home?.name, g.officialDate, S.HISTORY);
      const away = noteTeam(g.away?.id, g.away?.name, g.officialDate, S.HISTORY);
      if (!home || !away) diag.add("UNRESOLVED_TEAM", SPORT, S.HISTORY, { id });
      games.add(id, S.HISTORY, {
        seasonKey: /^\d{4}$/.test(String(g.season)) ? String(g.season) : null,
        seasonPhase: "REGULAR",
        officialDate: isDate(g.officialDate) ? g.officialDate : null,
        homeTeamId: home, awayTeamId: away,
        venue: venueOf(g.venue),
        statusClass: "FINAL",
      }, [alias("mlb_statsapi", "game", id)]);
      if (Number.isInteger(g.homeRuns) && Number.isInteger(g.awayRuns)) scores.add(id, S.HISTORY, { home: g.homeRuns, away: g.awayRuns });
      else diag.add("MALFORMED_ROW", SPORT, S.HISTORY, { id, reason: "final without integer runs" });
    }
  }

  // ── schedule captures ───────────────────────────────────────────────────────────────────────────
  // Newest capture first: a postponed game keeps its gamePk and moves date, so the LATEST capture is the
  // source's current statement (first occurrence wins within a source).
  for (const { doc } of [...(input.schedules ?? [])].sort((a, b) => (String(b.doc?.date) < String(a.doc?.date) ? -1 : 1))) {
    const fileDate = typeof doc?.date === "string" ? doc.date : null;
    for (const g of doc?.games ?? []) {
      bump(S.SCHEDULE);
      const id = mlbGameId(g.gamePk);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.SCHEDULE, { date: fileDate }); continue; }
      const home = noteTeam(g.home?.id, g.home?.name, fileDate, S.SCHEDULE);
      const away = noteTeam(g.away?.id, g.away?.name, fileDate, S.SCHEDULE);
      if (g.home?.name && g.away?.name && !sideNames.has(id)) sideNames.set(id, { home: g.home.name, away: g.away.name });
      games.add(id, S.SCHEDULE, {
        seasonKey: fileDate ? fileDate.slice(0, 4) : null,
        seasonPhase: null,
        startUtc: normalizeInstant(g.gameDate),
        homeTeamId: home, awayTeamId: away,
        venue: venueOf(g.venue),
      }, [alias("mlb_statsapi", "game", id)]);
    }
  }

  // ── boards (games only) ─────────────────────────────────────────────────────────────────────────
  for (const b of [...(input.boards ?? [])].sort((x, y) => (y.date < x.date ? -1 : 1))) {
    for (const g of b.games ?? []) {
      bump(S.BOARDS);
      const id = mlbGameId(g.gamePk);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.BOARDS, { date: b.date }); continue; }
      const date = typeof g.date === "string" ? g.date : b.date;
      const home = noteTeam(g.homeTeamId, g.homeTeamName, date, S.BOARDS);
      const away = noteTeam(g.awayTeamId, g.awayTeamName, date, S.BOARDS);
      if (home && typeof g.homeTeamAbbr === "string") teamAbbr.add(home, g.homeTeamAbbr, date, S.BOARDS);
      if (away && typeof g.awayTeamAbbr === "string") teamAbbr.add(away, g.awayTeamAbbr, date, S.BOARDS);
      if (g.homeTeamName && g.awayTeamName && !sideNames.has(id)) sideNames.set(id, { home: g.homeTeamName, away: g.awayTeamName });
      games.add(id, S.BOARDS, {
        seasonKey: date ? String(date).slice(0, 4) : null,
        startUtc: normalizeInstant(g.gameDate),
        homeTeamId: home, awayTeamId: away,
        venue: venueOf(g.venue),
      }, [alias("mlb_statsapi", "game", id)]);
    }
  }

  // ── 2026 linescores: finals by gamePk; sides CHECKED against an id-bearing source's names ───────
  for (const { doc } of input.linescores ?? []) {
    for (const g of doc?.games ?? []) {
      bump(S.LINESCORES);
      const id = mlbGameId(g.gamePk);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.LINESCORES, { date: doc?.date }); continue; }
      const final = g.isFinal === true && !NON_RESULT_CODES.has(String(g.codedGameState ?? ""));
      if (!final) { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.LINESCORES, { id, reason: "not final" }); continue; }
      games.add(id, S.LINESCORES, {
        seasonKey: isDate(g.officialDate) ? g.officialDate.slice(0, 4) : null,
        officialDate: isDate(g.officialDate) ? g.officialDate : null,
        statusClass: "FINAL",
      }, [alias("mlb_statsapi", "game", id)]);
      const names = sideNames.get(id);
      if (!names) { diag.add("UNRESOLVED_TEAM", SPORT, S.LINESCORES, { id, reason: "no id-bearing source for this gamePk; runs not attributed to teams" }); continue; }
      if (names.home !== g.homeTeam || names.away !== g.awayTeam) {
        diag.add("SIDE_MISMATCH", SPORT, S.LINESCORES, { id, linescore: [g.homeTeam, g.awayTeam], idSource: [names.home, names.away] });
        continue;
      }
      if (Number.isInteger(g.homeRuns) && Number.isInteger(g.awayRuns)) scores.add(id, S.LINESCORES, { home: g.homeRuns, away: g.awayRuns });
      else diag.add("MALFORMED_ROW", SPORT, S.LINESCORES, { id, reason: "final without integer runs" });
    }
  }

  // ── finalize games + teams ──────────────────────────────────────────────────────────────────────
  const gm = games.finalize();
  const gameRecords = gm.records.map((r) => gameRecord(SPORT, r.id, r.fields, r.aliases));
  const byId = new Map(gameRecords.map((g) => [g.id, g]));
  const sc = scores.finalize();
  const teamGameStats = [];
  for (const r of sc.records) {
    const g = byId.get(r.id);
    const src = r.sources.includes(S.HISTORY) ? S.HISTORY : S.LINESCORES;
    if (!g.homeTeamId || !g.awayTeamId) { diag.add("UNRESOLVED_TEAM", SPORT, src, { id: r.id, reason: "final score without both team ids" }); continue; }
    teamGameStats.push(...sidePair(g, "mlb.final-score", { runs: r.fields.home }, { runs: r.fields.away }, src));
  }

  const teams = [...teamAliases.keys()].map((id) => {
    const name = teamNames.pick(id);
    for (const v of teamNames.variants(id)) if (v !== name) diag.add("NAME_VARIANT", SPORT, "team", { id, kept: name, variant: v });
    return teamRecord(SPORT, id, { name, abbreviation: teamAbbr.pick(id) }, [teamAliases.get(id)]);
  });

  // ── player prop actuals (partial by construction) ───────────────────────────────────────────────
  const players = createLabelPicker([S.LEANS]);
  const playerAliases = new Map();
  /** @type {Map<string, {gameId:string, playerId:string, teamAbbr:Set<string>, stats: Map<string, Set<number|string>>}>} */
  const lines = new Map();
  for (const row of input.settledLeans?.rows ?? []) {
    bump(S.LEANS);
    const stat = LEAN_MARKET_TO_STAT[row.marketKey];
    if (!stat) { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.LEANS, { market: row.marketKey }); continue; }
    const pid = mlbPlayerId(row.playerId);
    if (!pid) { diag.add("UNRESOLVED_PLAYER", SPORT, S.LEANS, { reason: "no StatsAPI person id", name: row.playerName ?? null }); continue; }
    const gid = mlbGameId(row.gamePk);
    if (!gid || !byId.has(gid)) { diag.add("UNRESOLVED_GAME", SPORT, S.LEANS, { gamePk: row.gamePk ?? null }); continue; }
    players.add(pid, row.playerName, row.date ?? null, S.LEANS);
    playerAliases.set(pid, alias("mlb_statsapi", "player", String(row.playerId)));
    const k = `${gid}|${pid}`;
    const cur = lines.get(k) ?? { gameId: gid, playerId: pid, teamAbbr: new Set(), stats: new Map() };
    if (typeof row.playerTeamAbbr === "string" && row.playerTeamAbbr) cur.teamAbbr.add(row.playerTeamAbbr);
    const v = sourceValue(row.actual);
    if (v !== null) cur.stats.set(stat, new Set([...(cur.stats.get(stat) ?? []), v]));
    lines.set(k, cur);
  }
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbreviation]));
  const playerGameStats = [];
  for (const l of lines.values()) {
    if (l.stats.size === 0) { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.LEANS, { game: l.gameId, player: l.playerId, reason: "no settled actual yet" }); continue; }
    const stats = { hits: null, totalBases: null, hitsRunsRbis: null, pitcherStrikeouts: null };
    let conflict = false;
    for (const [k, vals] of l.stats) {
      if (vals.size > 1) { conflict = true; diag.add("STAT_CONFLICT", SPORT, S.LEANS, { game: l.gameId, player: l.playerId, stat: k, values: [...vals] }); }
      stats[k] = [...vals][0];
    }
    if (conflict) continue;
    const errs = validateStats("mlb.prop-actuals", stats);
    if (errs.length) { diag.add("INVALID_STAT", SPORT, S.LEANS, { game: l.gameId, player: l.playerId, errs }); continue; }
    const g = byId.get(l.gameId);
    let teamId = null, opponentTeamId = null;
    if (l.teamAbbr.size === 1) {
      const a = [...l.teamAbbr][0];
      const homeHit = g.homeTeamId && abbrOf.get(g.homeTeamId) === a;
      const awayHit = g.awayTeamId && abbrOf.get(g.awayTeamId) === a;
      if (homeHit !== awayHit) { teamId = homeHit ? g.homeTeamId : g.awayTeamId; opponentTeamId = homeHit ? g.awayTeamId : g.homeTeamId; }
    }
    if (!teamId) diag.add("UNRESOLVED_TEAM", SPORT, S.LEANS, { game: l.gameId, player: l.playerId, abbr: [...l.teamAbbr] });
    playerGameStats.push(playerGameStatRecord({ family: "mlb.prop-actuals", sportId: SPORT, gameId: l.gameId, playerId: l.playerId, teamId, opponentTeamId, stats, src: S.LEANS }));
  }
  const playerRecords = [...playerAliases.keys()].map((id) => {
    const name = players.pick(id);
    for (const v of players.variants(id)) if (v !== name) diag.add("NAME_VARIANT", SPORT, "player", { id, kept: name, variant: v });
    return playerRecord(SPORT, id, { name, currentTeamId: null }, [playerAliases.get(id)]);
  });

  return {
    sportId: SPORT,
    teams,
    players: playerRecords,
    games: gameRecords,
    teamGameStats,
    playerGameStats,
    conflicts: [...gm.conflicts, ...sc.conflicts],
    sourceRows,
  };
}
