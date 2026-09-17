/**
 * RESEARCH LAB QUERY ENGINE (v1.5) — PURE. No React, no storage, no network, no clock, no forecast owner.
 *
 *   executeLabQuery(query, dataset) → { totalMatched, returned, rows, coverage, warnings, cost }
 *
 * Contract:
 *   • The query is validated FIRST (lib/lab/query.mjs). This function assumes a valid, normalized query and a
 *     dataset that matches its mode/sport; it never repairs either.
 *   • Filters are AND. There is no OR tree, no nesting and no user-authored expression.
 *   • MISSINGNESS. A `null` value is "the source did not record this". It never matches a numeric comparison —
 *     not even `>= 0` — and it is never read as 0. A recorded `0` is a value and matches `>= 0`.
 *   • DETERMINISM. After the requested sort clauses, a canonical secondary key breaks every tie (game id, then
 *     player id; team label, then team id). The same dataset and the same query return the same rows in the same
 *     order on every device and after every rebuild.
 *   • TRUNCATION IS VISIBLE. `totalMatched` counts every matching row; `rows` is one page; `capped` says when the
 *     match count exceeds the hard cap. Nothing is dropped silently.
 *
 * The engine describes. It computes no rate, no ranking, no composite and no probability — a threshold query
 * returns the rows that match it, and the count of rows is not a hit rate.
 */
import { ALL_SEASONS, LAB_BUDGET, LAB_QUERY_SCHEMA_VERSION } from "./contract.mjs";
import { GAME, HOST_KNOWN, PLAYER, SEASON, isNum } from "./fields.mjs";

/* ───────────────────────────── shared predicates ───────────────────────────── */

/** A numeric/date comparison. `null` never matches — missing is not zero and not "before everything". */
function matches(op, value, bound) {
  if (value == null) return false;
  switch (op) {
    case "eq": return value === bound;
    case "in": return Array.isArray(bound) && bound.includes(value);
    case "gte": return value >= bound;
    case "lte": return value <= bound;
    case "between": return value >= bound[0] && value <= bound[1];
    default: return false;
  }
}

/** Ascending compare that always puts a missing value LAST, whichever direction was asked for. */
function cmp(a, b, dir) {
  const missingA = a == null, missingB = b == null;
  if (missingA || missingB) return missingA && missingB ? 0 : missingA ? 1 : -1;
  const base = a < b ? -1 : a > b ? 1 : 0;
  return dir === "desc" ? -base : base;
}

const clause = (query, field) => query.filters.find((f) => f.field === field) ?? null;

/* ───────────────────────────── games ───────────────────────────── */

function runGames(query, dataset) {
  const teams = dataset.teams;
  const byId = new Map(teams.map((t, i) => [t.id, i]));
  const teamClause = clause(query, "teamId");
  const perspective = teamClause ? byId.get(Array.isArray(teamClause.value) ? teamClause.value[0] : teamClause.value) : undefined;
  const oppClause = clause(query, "opponentId");
  const oppIdx = oppClause ? byId.get(oppClause.value) : undefined;
  const ha = clause(query, "homeAway");
  const result = clause(query, "result");
  const scored = clause(query, "scored");
  const allowed = clause(query, "allowed");
  const total = clause(query, "totalScore");
  const date = clause(query, "date");
  const seasonIdx = query.seasonId === ALL_SEASONS ? null : dataset.seasons.indexOf(query.seasonId);

  /** Perspective view of a row: which side the selected team is, what it scored and allowed, and the outcome. */
  const view = (r) => {
    const isA = r[GAME.A] === perspective;
    const hostKnown = (r[GAME.FLAGS] & HOST_KNOWN) !== 0;
    const own = isA ? r[GAME.SCORE_A] : r[GAME.SCORE_B];
    const opp = isA ? r[GAME.SCORE_B] : r[GAME.SCORE_A];
    return {
      // Location is proven or it is neutral. A row whose source does not prove a host is NEVER labelled H or A,
      // and team order in the tuple is canonical id order, not a location claim (§62).
      homeAway: hostKnown ? (isA ? "H" : "A") : "N",
      scored: own,
      allowed: opp,
      result: own == null || opp == null ? null : own > opp ? "W" : own < opp ? "L" : "T",
      side: isA ? "A" : "B",
    };
  };

  let scanned = 0;
  const matched = [];
  for (const r of dataset.rows) {
    scanned += 1;
    if (seasonIdx != null && r[GAME.SEASON] !== seasonIdx) continue;
    if (perspective !== undefined && r[GAME.A] !== perspective && r[GAME.B] !== perspective) continue;
    if (date && !matches(date.op, r[GAME.DATE], date.value)) continue;
    if (total) {
      const sum = isNum(r[GAME.SCORE_A]) && isNum(r[GAME.SCORE_B]) ? r[GAME.SCORE_A] + r[GAME.SCORE_B] : null;
      if (!matches(total.op, sum, total.value)) continue;
    }
    if (perspective !== undefined) {
      const v = view(r);
      const other = v.side === "A" ? r[GAME.B] : r[GAME.A];
      if (oppIdx !== undefined && other !== oppIdx) continue;
      if (ha && v.homeAway !== ha.value) continue;
      if (result && v.result !== result.value) continue;
      if (scored && !matches(scored.op, v.scored, scored.value)) continue;
      if (allowed && !matches(allowed.op, v.allowed, allowed.value)) continue;
      matched.push([r, v]);
    } else {
      matched.push([r, null]);
    }
  }

  const keyOf = (pair, field) => {
    const [r, v] = pair;
    switch (field) {
      case "date": return r[GAME.DATE];
      case "scored": return v?.scored ?? null;
      case "allowed": return v?.allowed ?? null;
      case "totalScore": return isNum(r[GAME.SCORE_A]) && isNum(r[GAME.SCORE_B]) ? r[GAME.SCORE_A] + r[GAME.SCORE_B] : null;
      default: return null;
    }
  };
  matched.sort((x, y) => {
    for (const s of query.sort) { const c = cmp(keyOf(x, s.field), keyOf(y, s.field), s.dir); if (c) return c; }
    // Canonical tie-break: game id, descending. Never the file's own order.
    return cmp(x[0][GAME.ID], y[0][GAME.ID], "desc");
  });

  const team = (i) => (i == null || i < 0 ? null : teams[i] ?? null);
  const row = ([r, v]) => {
    const hostKnown = (r[GAME.FLAGS] & HOST_KNOWN) !== 0;
    return {
      gameId: r[GAME.ID],
      date: r[GAME.DATE],
      seasonId: dataset.seasons[r[GAME.SEASON]] ?? null,
      hostKnown,
      teamA: team(r[GAME.A]),
      teamB: team(r[GAME.B]),
      scoreA: r[GAME.SCORE_A],
      scoreB: r[GAME.SCORE_B],
      totalScore: isNum(r[GAME.SCORE_A]) && isNum(r[GAME.SCORE_B]) ? r[GAME.SCORE_A] + r[GAME.SCORE_B] : null,
      perspective: v ? { team: team(perspective), ...v } : null,
      opponent: v ? team(v.side === "A" ? r[GAME.B] : r[GAME.A]) : null,
      matchupPath: r[GAME.PATH] ?? null,
    };
  };
  return { matched, scanned, row };
}

/* ───────────────────────────── players ───────────────────────────── */

function runPlayers(query, dataset) {
  const players = dataset.players;
  const playerIdx = new Map(players.map((p, i) => [p.id, i]));
  const teams = dataset.teams;
  const teamIdx = new Map(teams.map((t, i) => [t.id, i]));
  const valueAt = dataset.families.indexOf(query.stat);
  const pClause = clause(query, "playerId");
  const wanted = pClause ? new Set((Array.isArray(pClause.value) ? pClause.value : [pClause.value]).map((id) => playerIdx.get(id))) : null;
  const tClause = clause(query, "teamId");
  const oClause = clause(query, "opponentId");
  const ha = clause(query, "homeAway");
  const value = clause(query, "statValue");
  const date = clause(query, "date");
  const seasonIdx = dataset.seasons.indexOf(query.seasonId);

  let scanned = 0;
  const matched = [];
  for (const r of dataset.rows) {
    scanned += 1;
    const v = valueAt < 0 ? null : r[PLAYER.VALUES + valueAt];
    // The selected stat family is the subject of the query: a row that does not record it is not an answer, and
    // it is not a zero either. This is the same rule the research page prints as "not recorded".
    if (!isNum(v)) continue;
    if (wanted && !wanted.has(r[PLAYER.PLAYER])) continue;
    if (seasonIdx >= 0 && r[PLAYER.SEASON] !== seasonIdx) continue;
    // Historical participation: the team of THAT game, never the current roster (§30 / v1.3 invariant).
    if (tClause && r[PLAYER.TEAM] !== teamIdx.get(tClause.value)) continue;
    if (oClause && r[PLAYER.OPP] !== teamIdx.get(oClause.value)) continue;
    if (ha && r[PLAYER.HA] !== ha.value) continue;
    if (value && !matches(value.op, v, value.value)) continue;
    if (date && !matches(date.op, r[PLAYER.DATE], date.value)) continue;
    matched.push([r, v]);
  }

  const keyOf = ([r, v], field) => (field === "date" ? r[PLAYER.DATE] : field === "statValue" ? v : null);
  matched.sort((x, y) => {
    for (const s of query.sort) { const c = cmp(keyOf(x, s.field), keyOf(y, s.field), s.dir); if (c) return c; }
    const byGame = cmp(x[0][PLAYER.ID], y[0][PLAYER.ID], "desc");
    if (byGame) return byGame;
    // Two players in one game: canonical player id, ascending.
    return cmp(players[x[0][PLAYER.PLAYER]]?.id, players[y[0][PLAYER.PLAYER]]?.id, "asc");
  });

  const team = (i) => (i == null || i < 0 ? null : teams[i] ?? null);
  const row = ([r, v]) => ({
    playerId: players[r[PLAYER.PLAYER]]?.id ?? null,
    player: players[r[PLAYER.PLAYER]] ?? null,
    gameId: r[PLAYER.ID],
    date: r[PLAYER.DATE],
    seasonId: dataset.seasons[r[PLAYER.SEASON]] ?? null,
    team: team(r[PLAYER.TEAM]),
    opponent: team(r[PLAYER.OPP]),
    homeAway: r[PLAYER.HA] ?? null,
    value: v,
    stat: query.stat,
  });
  return { matched, scanned, row };
}

/* ───────────────────────────── seasons ───────────────────────────── */

function runSeasons(query, dataset) {
  const teams = dataset.teams;
  const byId = new Map(teams.map((t, i) => [t.id, i]));
  const tClause = clause(query, "teamId");
  const wanted = tClause ? new Set((Array.isArray(tClause.value) ? tClause.value : [tClause.value]).map((id) => byId.get(id))) : null;
  const seasonIdx = query.seasonId === ALL_SEASONS ? null : dataset.seasons.indexOf(query.seasonId);
  const numFields = [["finals", SEASON.FINALS], ["wins", SEASON.W], ["losses", SEASON.L], ["scored", SEASON.SCORED], ["allowed", SEASON.ALLOWED]];

  let scanned = 0;
  const matched = [];
  for (const r of dataset.rows) {
    scanned += 1;
    if (seasonIdx != null && r[SEASON.SEASON] !== seasonIdx) continue;
    if (wanted && !wanted.has(r[SEASON.TEAM])) continue;
    let ok = true;
    for (const [name, i] of numFields) {
      const c = clause(query, name);
      if (c && !matches(c.op, r[i], c.value)) { ok = false; break; }
    }
    if (ok) matched.push([r, null]);
  }

  const keyOf = ([r], field) => {
    switch (field) {
      case "seasonId": return dataset.seasons[r[SEASON.SEASON]] ?? null;
      case "team": return teams[r[SEASON.TEAM]]?.label ?? null;
      case "finals": return r[SEASON.FINALS];
      case "wins": return r[SEASON.W];
      case "losses": return r[SEASON.L];
      case "scored": return r[SEASON.SCORED];
      case "allowed": return r[SEASON.ALLOWED];
      default: return null;
    }
  };
  matched.sort((x, y) => {
    for (const s of query.sort) { const c = cmp(keyOf(x, s.field), keyOf(y, s.field), s.dir); if (c) return c; }
    // Canonical tie-break: season id descending, then team label, then canonical team id.
    return cmp(dataset.seasons[x[0][SEASON.SEASON]], dataset.seasons[y[0][SEASON.SEASON]], "desc")
      || cmp(teams[x[0][SEASON.TEAM]]?.label, teams[y[0][SEASON.TEAM]]?.label, "asc")
      || cmp(teams[x[0][SEASON.TEAM]]?.id, teams[y[0][SEASON.TEAM]]?.id, "asc");
  });

  const row = ([r]) => ({
    team: teams[r[SEASON.TEAM]] ?? null,
    seasonId: dataset.seasons[r[SEASON.SEASON]] ?? null,
    games: r[SEASON.GAMES],
    finals: r[SEASON.FINALS],
    wins: r[SEASON.W],
    losses: r[SEASON.L],
    ties: r[SEASON.T],
    scored: r[SEASON.SCORED],
    allowed: r[SEASON.ALLOWED],
  });
  return { matched, scanned, row };
}

const RUNNERS = { games: runGames, players: runPlayers, seasons: runSeasons };

/**
 * Execute a VALIDATED query against a normalized dataset.
 * @param {any} query the object `validateLabQuery` returned
 * @param {any} dataset the object `lib/lab/dataset.mjs` returned
 */
export function executeLabQuery(query, dataset) {
  if (!query || query.schemaVersion !== LAB_QUERY_SCHEMA_VERSION) throw new Error("executeLabQuery: query schemaVersion is not readable by this engine");
  if (dataset.mode !== query.mode || dataset.sport !== query.sport) throw new Error(`executeLabQuery: dataset ${dataset.mode}/${dataset.sport} does not answer ${query.mode}/${query.sport}`);

  const { matched, scanned, row } = RUNNERS[query.mode](query, dataset);
  const totalMatched = matched.length;
  const cap = LAB_BUDGET.maxRows;
  const capped = totalMatched > cap;
  const available = Math.min(totalMatched, cap);
  const pageCount = Math.max(1, Math.ceil(available / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;
  const slice = matched.slice(0, cap).slice(start, start + query.pageSize);
  const rows = slice.map(row);

  return {
    schemaVersion: LAB_QUERY_SCHEMA_VERSION,
    normalizedQuery: query,
    mode: query.mode,
    sport: query.sport,
    totalMatched,
    // Every number a reader sees about size comes from here — the result panel cannot invent a total.
    available,
    capped,
    cap,
    returned: rows.length,
    page,
    pageCount,
    pageSize: query.pageSize,
    rows,
    coverage: dataset.coverage,
    warnings: capped ? [{ code: "RESULT_CAP", detail: `${totalMatched} matched; the first ${cap} are available` }] : [],
    cost: { partitions: dataset.partitions ?? 1, rowsScanned: scanned, rowsMatched: totalMatched, rowsReturned: rows.length },
  };
}
