/**
 * NFL source adapter — committed artifacts → canonical records. Pure.
 *
 * IDENTITY (all shipped, all reused verbatim)
 *   game    ESPN event id           — /nfl/game/[eventId], forecasts, boards, graded picks
 *   team    nfl-team-<ESPN team id> — Follow (never an abbreviation: ESPN WSH/LAR ≠ nflverse WAS/LA)
 *   player  nfl-athlete-<ESPN id>   — player boards, Follow
 *
 * CROSS-PROVIDER JOINS ARE ID-ONLY
 *   nflverse game_id → ESPN event id : the `espnId` column nflverse itself publishes (games history)
 *   nflverse gsis / PFR id → ESPN id : the committed exact crosswalk (snap-counts/id-bridge-v1.json); an
 *                                      id claimed twice in either direction resolves to nobody
 *   nflverse team code → ESPN team id: NFLVERSE_TEAM_TO_ESPN_TEAM_ID below — a reviewed 32-row table,
 *                                      proven against ESPN's own (abbr, id) pairs and a by-event-id join
 *                                      in adapters.test.mjs (NFL-1, NFL-7) and committed-store.test.mjs (CS5). Codes are nflverse's franchise-mapped codes
 *                                      (STL→LA, SD→LAC, OAK→LV already applied upstream).
 *   ESPN abbreviation → ESPN team id : ESPN's own pairs from the committed roster capture (same provider)
 *
 * FIELD PRECEDENCE
 *   startUtc      espn-results > espn-schedule > espn-player-events
 *   officialDate  nflverse-games-history > nflverse-current-season
 *   teams         espn-results > espn-schedule > nflverse-games-history > nflverse-current-season
 *   seasonPhase   espn-results > espn-schedule > espn-player-events > nflverse-player-games
 *   neutralSite   nflverse-games-history > nflverse-current-season
 *   venue         espn-schedule (name only)
 *   points        nflverse-games-history > espn-results > espn-player-events > nflverse-current-season
 */
import { createMerger, createLabelPicker } from "../merge.mjs";
import { nflGameId, nflTeamId, nflPlayerId } from "../ids.mjs";
import { normalizeInstant, isDate } from "../contract.mjs";
import { alias, teamRecord, playerRecord, gameRecord, sidePair, playerGameStatRecord, GAME_FIELDS } from "../records.mjs";
import { sourceValue, validateStats } from "../stat-dictionary.mjs";

export const NFL_SOURCES = Object.freeze({
  HISTORY: "nfl.nflverse-games-history",
  PLAYER_GAMES: "nfl.nflverse-player-games",
  BRIDGE: "nfl.nflverse-id-bridge",
  CURRENT: "nfl.nflverse-current-season",
  EVENTS: "nfl.espn-player-events",
  SCHEDULE: "nfl.espn-schedule",
  RESULTS: "nfl.espn-results",
  ROSTERS: "nfl.espn-rosters",
});
const S = NFL_SOURCES;

/** Reviewed table: nflverse franchise code → ESPN team id. Proven in adapters.test.mjs (NFL-1, NFL-7) and committed-store.test.mjs (CS5); never extended by guessing. */
export const NFLVERSE_TEAM_TO_ESPN_TEAM_ID = Object.freeze({
  ARI: "22", ATL: "1", BAL: "33", BUF: "2", CAR: "29", CHI: "3", CIN: "4", CLE: "5", DAL: "6", DEN: "7", DET: "8",
  GB: "9", HOU: "34", IND: "11", JAX: "30", KC: "12", LA: "14", LAC: "24", LV: "13", MIA: "15", MIN: "16", NE: "17",
  NO: "18", NYG: "19", NYJ: "20", PHI: "21", PIT: "23", SEA: "26", SF: "25", TB: "27", TEN: "10", WAS: "28",
});

const PHASE_BY_ESPN_TYPE = { 1: "PRESEASON", 2: "REGULAR", 3: "POSTSEASON" };
const PHASE_BY_NFLVERSE = { REG: "REGULAR", POST: "POSTSEASON" };
/** ESPN schedules carry no season field; an NFL season starts in late summer and ends in February. */
const seasonOfKickoff = (iso) => {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return String(m >= 3 ? y : y - 1);
};

const EVENTS_STAT_MAP = [
  ["passCompletions", "passCmp"], ["passAttempts", "passAtt"], ["passingYards", "passYds"], ["passingTds", "passTd"],
  ["interceptionsThrown", "passInt"], ["sacksTaken", "sacks"], ["rushingAttempts", "rushAtt"], ["rushingYards", "rushYds"],
  ["rushingTds", "rushTd"], ["targets", "targets"], ["receptions", "rec"], ["receivingYards", "recYds"],
  ["receivingTds", "recTd"], ["fumbles", "fumbles"], ["fumblesLost", "fumblesLost"],
];
const NFLVERSE_STAT_MAP = [
  ["participation", "participation"], ["offenseSnaps", "offenseSnaps"], ["targets", "targets"], ["receptions", "receptions"],
  ["receivingYards", "recYds"], ["carries", "carries"], ["rushingYards", "rushYds"], ["passAttempts", "passAtt"],
  ["passCompletions", "passCmp"], ["passingYards", "passYds"], ["rushingTds", "rushTd"], ["receivingTds", "recTd"], ["otherTds", "otherTd"],
];

/** columns[] + rows[][] → objects (nflverse tables are columnar) */
const rowsOf = (doc, rowsKey) => {
  const cols = doc?.columns ?? [];
  return (doc?.[rowsKey] ?? []).map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c, r[i]])) : r));
};

/**
 * @param {{ gamesHistory?: any, playerGames?: any, idBridge?: any, currentSeason?: any,
 *   playerEvents?: Array<{path:string, doc:any}>, schedules?: Array<{path:string, doc:any}>, results?: any,
 *   rosters?: Array<{path:string, doc:any}> }} input
 * @param {ReturnType<import("../diagnostics.mjs").createDiagnostics>} diag
 */
export function adaptNfl(input, diag) {
  const SPORT = "NFL";
  const sourceRows = {};
  const bump = (k, n = 1) => { sourceRows[k] = (sourceRows[k] ?? 0) + n; };

  const games = createMerger({
    kind: "game", sportId: SPORT, fields: GAME_FIELDS,
    defaultPrecedence: [S.RESULTS, S.SCHEDULE, S.HISTORY, S.EVENTS, S.CURRENT, S.PLAYER_GAMES],
    precedence: {
      startUtc: [S.RESULTS, S.SCHEDULE, S.EVENTS],
      officialDate: [S.HISTORY, S.CURRENT],
      homeTeamId: [S.RESULTS, S.SCHEDULE, S.HISTORY, S.CURRENT],
      awayTeamId: [S.RESULTS, S.SCHEDULE, S.HISTORY, S.CURRENT],
      seasonKey: [S.HISTORY, S.EVENTS, S.RESULTS, S.SCHEDULE, S.CURRENT],
      seasonPhase: [S.RESULTS, S.SCHEDULE, S.EVENTS, S.PLAYER_GAMES],
      neutralSite: [S.HISTORY, S.CURRENT],
      venue: [S.SCHEDULE],
      statusClass: [S.RESULTS, S.HISTORY, S.EVENTS, S.CURRENT],
    },
  });
  const scores = createMerger({ kind: "final-score", sportId: SPORT, fields: ["home", "away"], defaultPrecedence: [S.HISTORY, S.RESULTS, S.EVENTS, S.CURRENT], precedence: {} });

  // ── teams: ESPN's own (abbr, id) pairs + the reviewed nflverse table ────────────────────────────
  const teamNames = createLabelPicker([S.RESULTS, S.SCHEDULE]);
  const espnAbbrToId = new Map();
  const teamAbbr = createLabelPicker([S.ROSTERS, S.SCHEDULE]);
  const knownTeams = new Set(Object.values(NFLVERSE_TEAM_TO_ESPN_TEAM_ID));
  const rosters = [...(input.rosters ?? [])].sort((a, b) => (a.path < b.path ? -1 : 1));
  const latestRoster = rosters.at(-1)?.doc ?? null;
  for (const t of latestRoster?.teams ?? []) {
    const id = String(t.providerTeamId ?? "");
    if (!/^\d+$/.test(id) || typeof t.teamAbbr !== "string") continue;
    if (espnAbbrToId.has(t.teamAbbr) && espnAbbrToId.get(t.teamAbbr) !== id) diag.add("AMBIGUOUS_ALIAS", SPORT, S.ROSTERS, { abbr: t.teamAbbr });
    espnAbbrToId.set(t.teamAbbr, id);
    teamAbbr.add(nflTeamId(id), t.teamAbbr, latestRoster.generatedAt ?? null, S.ROSTERS);
  }
  const teamFromEspnAbbr = (abbr) => {
    const id = espnAbbrToId.get(String(abbr ?? ""));
    return id ? nflTeamId(id) : null;
  };
  const teamFromNflverse = (code) => {
    const id = NFLVERSE_TEAM_TO_ESPN_TEAM_ID[String(code ?? "")];
    return id ? nflTeamId(id) : null;
  };
  const teamFromEspnId = (raw) => {
    const id = String(raw ?? "");
    return knownTeams.has(id) ? nflTeamId(id) : null;
  };

  // ── nflverse games history (1999–2025) ─────────────────────────────────────────────────────────
  const espnIdByNflverseGame = new Map();
  const historyRows = rowsOf(input.gamesHistory, "games");
  // SOURCE DEFECT GUARD: nflverse's espn column occasionally assigns ONE ESPN event id to several different
  // games (measured: 11 ids in 2003-era rows). An id claimed by more than one nflverse game identifies none of
  // them — every claimant is dropped, never first-wins.
  const claimants = new Map();
  for (const g of historyRows) { const id = nflGameId(g.espnId); if (id) claimants.set(id, new Set([...(claimants.get(id) ?? []), g.gameId])); }
  for (const g of historyRows) {
    bump(S.HISTORY);
    const id = nflGameId(g.espnId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.HISTORY, { gameId: g.gameId }); continue; }
    if (claimants.get(id).size > 1) { diag.add("AMBIGUOUS_ALIAS", SPORT, S.HISTORY, { espnEventId: id, nflverseGameIds: [...claimants.get(id)].sort() }); continue; }
    if (espnIdByNflverseGame.has(g.gameId)) diag.add("DUPLICATE_SOURCE_OCCURRENCE", SPORT, S.HISTORY, { gameId: g.gameId });
    espnIdByNflverseGame.set(g.gameId, id);
    const home = teamFromNflverse(g.home), away = teamFromNflverse(g.away);
    if (!home || !away) diag.add("UNRESOLVED_TEAM", SPORT, S.HISTORY, { id, codes: [g.home, g.away] });
    games.add(id, S.HISTORY, {
      seasonKey: Number.isInteger(g.season) ? String(g.season) : null,
      officialDate: isDate(g.date) ? g.date : null,
      homeTeamId: home, awayTeamId: away,
      neutralSite: g.neutral === 1 ? true : g.neutral === 0 ? false : null,
      statusClass: "FINAL",
    }, [alias("espn", "game", id), alias("nflverse", "game", g.gameId)]);
    if (Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore)) scores.add(id, S.HISTORY, { home: g.homeScore, away: g.awayScore });
    else diag.add("MALFORMED_ROW", SPORT, S.HISTORY, { id, reason: "final without integer scores" });
  }

  // ── nflverse 2026 current season ───────────────────────────────────────────────────────────────
  const neutralIds = new Set((input.currentSeason?.neutralEspnIds ?? []).map(String));
  for (const g of rowsOf(input.currentSeason, "games")) {
    bump(S.CURRENT);
    const id = nflGameId(g.espnId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.CURRENT, { gameId: g.gameId }); continue; }
    espnIdByNflverseGame.set(g.gameId, id);
    const scored = Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore);
    games.add(id, S.CURRENT, {
      seasonKey: Number.isInteger(g.season) ? String(g.season) : null,
      officialDate: isDate(g.date) ? g.date : null,
      homeTeamId: teamFromNflverse(g.home), awayTeamId: teamFromNflverse(g.away),
      neutralSite: input.currentSeason?.neutralEspnIds ? neutralIds.has(id) : null,
      statusClass: scored ? "FINAL" : null,
    }, [alias("espn", "game", id), alias("nflverse", "game", g.gameId)]);
    if (scored) scores.add(id, S.CURRENT, { home: g.homeScore, away: g.awayScore });
  }

  // ── ESPN schedule captures (newest first) ───────────────────────────────────────────────────────
  for (const { doc } of [...(input.schedules ?? [])].sort((a, b) => (a.path < b.path ? 1 : -1))) {
    const capturedAt = doc?.generatedAt ?? null;
    for (const r of doc?.rows ?? []) {
      bump(S.SCHEDULE);
      const id = nflGameId(r.providerEventId);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.SCHEDULE, { shortName: r.shortName ?? null }); continue; }
      const start = normalizeInstant(r.dateUtc);
      const home = teamFromEspnId(r.home?.providerTeamId), away = teamFromEspnId(r.away?.providerTeamId);
      if (!home || !away) diag.add("UNRESOLVED_TEAM", SPORT, S.SCHEDULE, { id });
      if (home) teamNames.add(home, r.home?.name, capturedAt, S.SCHEDULE);
      if (away) teamNames.add(away, r.away?.name, capturedAt, S.SCHEDULE);
      games.add(id, S.SCHEDULE, {
        seasonKey: seasonOfKickoff(start),
        seasonPhase: PHASE_BY_ESPN_TYPE[r.seasonType] ?? null,
        startUtc: start,
        homeTeamId: home, awayTeamId: away,
        venue: typeof r.venue === "string" && r.venue.trim() ? { providerId: null, name: r.venue.trim() } : null,
      }, [alias("espn", "game", id)]);
    }
  }

  // ── ESPN results capture (FINAL rows only) ──────────────────────────────────────────────────────
  for (const r of input.results?.rows ?? []) {
    bump(S.RESULTS);
    const id = nflGameId(r.providerEventId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.RESULTS, {}); continue; }
    if (!/^STATUS_FINAL/.test(String(r.statusRaw ?? ""))) { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.RESULTS, { id, reason: `status ${r.statusRaw}` }); continue; }
    const start = normalizeInstant(r.dateUtc);
    const home = teamFromEspnId(r.home?.providerTeamId), away = teamFromEspnId(r.away?.providerTeamId);
    if (home) teamNames.add(home, r.home?.name, r.capturedAt ?? null, S.RESULTS);
    if (away) teamNames.add(away, r.away?.name, r.capturedAt ?? null, S.RESULTS);
    games.add(id, S.RESULTS, {
      seasonKey: seasonOfKickoff(start), seasonPhase: PHASE_BY_ESPN_TYPE[r.seasonType] ?? null, startUtc: start,
      homeTeamId: home, awayTeamId: away, statusClass: "FINAL",
    }, [alias("espn", "game", id)]);
    if (Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway)) scores.add(id, S.RESULTS, { home: r.ftHome, away: r.ftAway });
    else diag.add("MALFORMED_ROW", SPORT, S.RESULTS, { id, reason: "FINAL without integer scores" });
  }

  // ── ESPN player-events corpus (2023–2025): game instants + finals + player lines ────────────────
  const eventLines = [];
  const players = createLabelPicker([S.ROSTERS, S.EVENTS, S.PLAYER_GAMES]);
  const playerAliases = new Map(); // playerId → Map(key → alias)
  const addPlayerAlias = (pid, a) => {
    const m = playerAliases.get(pid) ?? new Map();
    m.set(`${a.provider}|${a.id}`, a);
    playerAliases.set(pid, m);
  };
  for (const { doc } of input.playerEvents ?? []) {
    for (const g of doc?.games ?? []) {
      bump(S.EVENTS);
      const id = nflGameId(g.providerEventId);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.EVENTS, {}); continue; }
      const phase = PHASE_BY_ESPN_TYPE[g.seasonType] ?? null;
      if (phase === "PRESEASON" || phase === null) {
        diag.add("EXCLUDED_BY_SCOPE", SPORT, S.EVENTS, { id, reason: "preseason: team sides are name-only in this corpus", playerLines: (g.players ?? []).length });
        continue;
      }
      games.add(id, S.EVENTS, {
        seasonKey: Number.isInteger(g.season) ? String(g.season) : null,
        seasonPhase: phase,
        startUtc: normalizeInstant(g.dateUtc),
        statusClass: Number.isInteger(g.ftHome) && Number.isInteger(g.ftAway) ? "FINAL" : null,
      }, [alias("espn", "game", id)]);
      if (Number.isInteger(g.ftHome) && Number.isInteger(g.ftAway)) scores.add(id, S.EVENTS, { home: g.ftHome, away: g.ftAway });
      for (const p of g.players ?? []) eventLines.push({ gameId: id, date: g.dateUtc, p });
    }
  }

  // ── rosters (identity + current team) ───────────────────────────────────────────────────────────
  const currentTeam = new Map();
  for (const { doc } of rosters) {
    const when = doc?.generatedAt ?? null;
    for (const t of doc?.teams ?? []) {
      for (const p of t.players ?? []) {
        bump(S.ROSTERS);
        const pid = nflPlayerId(p.id);
        if (!pid) { diag.add("UNRESOLVED_PLAYER", SPORT, S.ROSTERS, { reason: "non-numeric ESPN athlete id" }); continue; }
        players.add(pid, p.fullName, when, S.ROSTERS);
        addPlayerAlias(pid, alias("espn", "player", pid.replace("nfl-athlete-", "")));
      }
    }
  }
  for (const t of latestRoster?.teams ?? []) {
    const team = teamFromEspnId(t.providerTeamId);
    for (const p of t.players ?? []) {
      const pid = nflPlayerId(p.id);
      if (pid && team) currentTeam.set(pid, currentTeam.has(pid) && currentTeam.get(pid) !== team ? null : team);
    }
  }

  // ── id bridge: exact, both directions unique ────────────────────────────────────────────────────
  const bridgeRows = rowsOf(input.idBridge, "rows");
  const espnByGsis = new Map(), espnByPfr = new Map(), gsisByEspn = new Map(), pfrByEspn = new Map();
  const addSet = (m, k, v) => { if (!k || !v) return; const s = m.get(k) ?? new Set(); s.add(v); m.set(k, s); };
  for (const r of bridgeRows) {
    bump(S.BRIDGE);
    const espn = /^\d+$/.test(String(r.espn_id ?? "")) ? String(r.espn_id) : null;
    addSet(espnByGsis, r.gsis_id, espn); addSet(espnByPfr, r.pfr_id, espn);
    addSet(gsisByEspn, espn, r.gsis_id); addSet(pfrByEspn, espn, r.pfr_id);
  }
  const unique = (m, k) => { const s = m.get(k); return s && s.size === 1 ? [...s][0] : s && s.size > 1 ? "AMBIGUOUS" : null; };
  const espnFor = (playerKey) => {
    const k = String(playerKey ?? "");
    const viaPfr = k.startsWith("pfr:");
    const espn = viaPfr ? unique(espnByPfr, k.slice(4)) : unique(espnByGsis, k);
    if (espn === "AMBIGUOUS") return { status: "AMBIGUOUS" };
    if (!espn) return { status: "UNKNOWN" };
    // the reverse direction must be unique too, or two nflverse ids would merge into one athlete
    const back = viaPfr ? unique(pfrByEspn, espn) : unique(gsisByEspn, espn);
    return back === "AMBIGUOUS" ? { status: "AMBIGUOUS" } : { status: "RESOLVED", espn };
  };

  // ── finalize games so player lines can be side-checked ──────────────────────────────────────────
  // nflverse player rows contribute the season phase BEFORE finalization.
  const playerGameRows = rowsOf(input.playerGames, "rows");
  const phaseSeen = new Set();
  for (const r of playerGameRows) {
    const id = espnIdByNflverseGame.get(r.gameId);
    if (!id || phaseSeen.has(id) || !PHASE_BY_NFLVERSE[r.seasonType]) continue;
    phaseSeen.add(id);
    games.add(id, S.PLAYER_GAMES, { seasonPhase: PHASE_BY_NFLVERSE[r.seasonType] }, [alias("espn", "game", id)]);
  }
  const gm = games.finalize();
  const gameRecords = gm.records.map((r) => gameRecord(SPORT, r.id, r.fields, r.aliases));
  const byId = new Map(gameRecords.map((g) => [g.id, g]));

  const teamGameStats = [];
  const sc = scores.finalize();
  for (const r of sc.records) {
    const g = byId.get(r.id);
    if (!g.homeTeamId || !g.awayTeamId) { diag.add("UNRESOLVED_TEAM", SPORT, r.fieldSources.home, { id: r.id, reason: "final score without both team ids" }); continue; }
    teamGameStats.push(...sidePair(g, "nfl.final-score", { points: r.fields.home }, { points: r.fields.away }, r.fieldSources.home));
  }

  const sideOf = (g, teamId) => (teamId === g.homeTeamId ? g.awayTeamId : teamId === g.awayTeamId ? g.homeTeamId : undefined);
  const playerGameStats = [];
  const conflictsExtra = [];

  // ESPN lines
  const eventSeen = new Map();
  for (const { gameId, date, p } of eventLines) {
    bump(`${S.EVENTS}#player-lines`);
    const pid = nflPlayerId(p.playerId);
    if (!pid) { diag.add("UNRESOLVED_PLAYER", SPORT, S.EVENTS, { reason: "malformed athlete id" }); continue; }
    const g = byId.get(gameId);
    const teamId = teamFromEspnAbbr(p.teamAbbr);
    if (!teamId) { diag.add("UNRESOLVED_TEAM", SPORT, S.EVENTS, { gameId, abbr: p.teamAbbr ?? null }); continue; }
    const opp = sideOf(g, teamId);
    if (opp === undefined) { diag.add("SIDE_MISMATCH", SPORT, S.EVENTS, { gameId, playerId: pid, teamId, sides: [g.homeTeamId, g.awayTeamId] }); continue; }
    const stats = Object.fromEntries(EVENTS_STAT_MAP.map(([k, src]) => [k, sourceValue(p[src])]));
    const errs = validateStats("nfl.espn-player-lines", stats);
    if (errs.length) { diag.add("INVALID_STAT", SPORT, S.EVENTS, { gameId, playerId: pid, errs }); continue; }
    const key = `${gameId}|${pid}`;
    if (eventSeen.has(key)) {
      if (JSON.stringify(eventSeen.get(key)) !== JSON.stringify(stats)) diag.add("STAT_CONFLICT", SPORT, S.EVENTS, { gameId, playerId: pid });
      else diag.add("DUPLICATE_SOURCE_OCCURRENCE", SPORT, S.EVENTS, { gameId, playerId: pid });
      continue;
    }
    eventSeen.set(key, stats);
    players.add(pid, p.name, date ?? null, S.EVENTS);
    addPlayerAlias(pid, alias("espn", "player", pid.replace("nfl-athlete-", "")));
    playerGameStats.push(playerGameStatRecord({ family: "nfl.espn-player-lines", sportId: SPORT, gameId, playerId: pid, teamId, opponentTeamId: opp, stats, src: S.EVENTS }));
  }

  // nflverse lines
  const nvSeen = new Set();
  for (const r of playerGameRows) {
    bump(`${S.PLAYER_GAMES}#player-lines`);
    const gameId = espnIdByNflverseGame.get(r.gameId);
    const g = gameId ? byId.get(gameId) : null;
    if (!g) { diag.add("UNRESOLVED_GAME", SPORT, S.PLAYER_GAMES, { nflverseGameId: r.gameId }); continue; }
    const res = espnFor(r.playerId);
    if (res.status !== "RESOLVED") { diag.add(res.status === "AMBIGUOUS" ? "AMBIGUOUS_ALIAS" : "UNRESOLVED_PLAYER", SPORT, S.PLAYER_GAMES, { nflversePlayerId: r.playerId }); continue; }
    const pid = nflPlayerId(res.espn);
    const teamId = teamFromNflverse(r.team);
    const opp = teamId ? sideOf(g, teamId) : undefined;
    if (!teamId || opp === undefined) { diag.add("SIDE_MISMATCH", SPORT, S.PLAYER_GAMES, { gameId, code: r.team, sides: [g.homeTeamId, g.awayTeamId] }); continue; }
    const stats = Object.fromEntries(NFLVERSE_STAT_MAP.map(([k, src]) => [k, sourceValue(r[src])]));
    const errs = validateStats("nfl.nflverse-skill-lines", stats);
    if (errs.length) { diag.add("INVALID_STAT", SPORT, S.PLAYER_GAMES, { gameId, playerId: pid, errs }); continue; }
    const key = `${gameId}|${pid}`;
    if (nvSeen.has(key)) { diag.add("STAT_CONFLICT", SPORT, S.PLAYER_GAMES, { gameId, playerId: pid, reason: "two nflverse rows resolve to one ESPN athlete in one game" }); continue; }
    nvSeen.add(key);
    players.add(pid, r.name, r.date ?? null, S.PLAYER_GAMES);
    addPlayerAlias(pid, alias("espn", "player", res.espn));
    if (!String(r.playerId).startsWith("pfr:")) addPlayerAlias(pid, alias("nflverse", "player", String(r.playerId)));
    playerGameStats.push(playerGameStatRecord({ family: "nfl.nflverse-skill-lines", sportId: SPORT, gameId, playerId: pid, teamId, opponentTeamId: opp, stats, src: S.PLAYER_GAMES }));
  }
  // A second nflverse row claiming the same player-game after a first resolved would have been counted above;
  // now drop BOTH if a key was claimed twice (fail closed on the whole key, not first-wins).
  // (nvSeen skips later duplicates; the receipt counts them. Duplicates are 0 on committed data — pinned by test.)

  // PFR aliases for athletes the platform knows, when the bridge maps them uniquely.
  for (const [pid] of playerAliases) {
    const espn = pid.replace("nfl-athlete-", "");
    const pfr = unique(pfrByEspn, espn);
    if (pfr && pfr !== "AMBIGUOUS" && unique(espnByPfr, pfr) === espn) addPlayerAlias(pid, alias("pfr", "player", pfr));
    const gsis = unique(gsisByEspn, espn);
    if (gsis && gsis !== "AMBIGUOUS" && unique(espnByGsis, gsis) === espn) addPlayerAlias(pid, alias("nflverse", "player", gsis));
  }

  // Cross-family disagreements on shared fields (ESPN vs nflverse, 2023–2025) — receipted, never merged.
  const espnByKey = new Map(playerGameStats.filter((r) => r.family === "nfl.espn-player-lines").map((r) => [`${r.gameId}|${r.playerId}`, r]));
  const SHARED = [["receptions", "receptions"], ["receivingYards", "receivingYards"], ["rushingYards", "rushingYards"], ["passingYards", "passingYards"], ["targets", "targets"]];
  for (const r of playerGameStats) {
    if (r.family !== "nfl.nflverse-skill-lines") continue;
    const e = espnByKey.get(`${r.gameId}|${r.playerId}`);
    if (!e) continue;
    for (const [nk, ek] of SHARED) {
      const a = r.stats[nk], b = e.stats[ek];
      if (a != null && b != null && a !== b) conflictsExtra.push({ kind: "player-line", sportId: SPORT, id: `${r.gameId}|${r.playerId}`, field: nk, chosen: { src: S.EVENTS, value: b }, other: { src: S.PLAYER_GAMES, value: a }, rule: "families kept separate; disagreement receipted" });
    }
  }

  const teams = [...knownTeams].sort().map((raw) => {
    const id = nflTeamId(raw);
    const name = teamNames.pick(id);
    if (!name) diag.add("UNRESOLVED_TEAM", SPORT, "team", { id, reason: "no ESPN team name in committed captures" });
    const code = Object.entries(NFLVERSE_TEAM_TO_ESPN_TEAM_ID).find(([, v]) => v === raw)[0];
    return teamRecord(SPORT, id, { name: name ?? id, abbreviation: teamAbbr.pick(id) }, [alias("espn", "team", raw), alias("nflverse", "team", code)]);
  });

  const playerRecords = [...playerAliases.keys()].map((pid) => {
    const name = players.pick(pid);
    for (const v of players.variants(pid)) if (v !== name) diag.add("NAME_VARIANT", SPORT, "player", { id: pid, kept: name, variant: v });
    return playerRecord(SPORT, pid, { name: name ?? pid, currentTeamId: currentTeam.get(pid) ?? null }, [...playerAliases.get(pid).values()]);
  });

  return {
    sportId: SPORT,
    teams,
    players: playerRecords,
    games: gameRecords,
    teamGameStats,
    playerGameStats,
    conflicts: [...gm.conflicts, ...sc.conflicts, ...conflictsExtra],
    sourceRows,
  };
}
