/**
 * EPL source adapter — committed artifacts → canonical records. Pure.
 *
 * IDENTITY
 *   game (2026-27)   the SHIPPED fixture id `soccer:epl:<sorted club slugs>:<yyyymmddthhmm>` from the newest
 *                    fixture capture — the id forecasts, graded rows and odds already use. Because the shipped
 *                    id embeds kickoff, a TV reschedule mints a new one; earlier ids are kept as
 *                    `gametime_epl_event` aliases, linked by the STABLE openfootball fixture key (an id
 *                    lineage, not a name match). The platform does not remint this shipped convention.
 *   game (history)   ESPN event id for 2022-23 … 2025-26 (no shipped id exists for those matches) — new in v1.2
 *   team             epl-team-<ESPN team id> — new in v1.2. Identity persists across promotion/relegation.
 *   player           epl-athlete-<ESPN athlete id> — new in v1.2 (graded player projections carry the bare id)
 *
 * The one cross-provider join is EPL_CLUBS below: a reviewed table from ESPN team id to the product's
 * canonical club (lib/soccer/epl-clubs.ts) and its shipped slug. It is verified in adapters.test.mjs (EPL-4 bijection, EPL-5 exact product aliases) to
 * be a bijection whose ESPN names are exact aliases in EPL_CLUB_ALIASES — so fixtures (which carry only the
 * canonical club name) join to ESPN ids through a fixed, tested table, never through name similarity.
 *
 * FINAL SCORES: none. Every committed EPL score source is name-keyed; see coverage.mjs DECLARED_SLICES.
 */
import { createMerger, createLabelPicker } from "../merge.mjs";
import { eplTeamId, eplPlayerId, eplShippedGameId, eplEspnGameId } from "../ids.mjs";
import { normalizeInstant } from "../contract.mjs";
import { alias, teamRecord, playerRecord, gameRecord, playerGameStatRecord, GAME_FIELDS } from "../records.mjs";
import { sourceValue, validateStats } from "../stat-dictionary.mjs";

export const EPL_SOURCES = Object.freeze({ FIXTURES: "epl.fixtures", ESPN_MATCH: "epl.espn-player-match", SQUADS: "epl.espn-squads" });
const S = EPL_SOURCES;

/** Reviewed: ESPN team id → product canonical club, product abbreviation, shipped slug. */
export const EPL_CLUBS = Object.freeze([
  { espnTeamId: "359", club: "Arsenal", abbr: "ARS", slug: "arsenal" },
  { espnTeamId: "362", club: "Aston Villa", abbr: "AVL", slug: "aston-villa" },
  { espnTeamId: "349", club: "Bournemouth", abbr: "BOU", slug: "bournemouth" },
  { espnTeamId: "337", club: "Brentford", abbr: "BRE", slug: "brentford" },
  { espnTeamId: "331", club: "Brighton & Hove Albion", abbr: "BHA", slug: "brighton-hove-albion" },
  { espnTeamId: "379", club: "Burnley", abbr: "BUR", slug: "burnley" },
  { espnTeamId: "363", club: "Chelsea", abbr: "CHE", slug: "chelsea" },
  { espnTeamId: "388", club: "Coventry City", abbr: "COV", slug: "coventry-city" },
  { espnTeamId: "384", club: "Crystal Palace", abbr: "CRY", slug: "crystal-palace" },
  { espnTeamId: "368", club: "Everton", abbr: "EVE", slug: "everton" },
  { espnTeamId: "370", club: "Fulham", abbr: "FUL", slug: "fulham" },
  { espnTeamId: "306", club: "Hull City", abbr: "HUL", slug: "hull-city" },
  { espnTeamId: "373", club: "Ipswich Town", abbr: "IPS", slug: "ipswich-town" },
  { espnTeamId: "357", club: "Leeds United", abbr: "LEE", slug: "leeds-united" },
  { espnTeamId: "375", club: "Leicester City", abbr: "LEI", slug: "leicester-city" },
  { espnTeamId: "364", club: "Liverpool", abbr: "LIV", slug: "liverpool" },
  { espnTeamId: "301", club: "Luton Town", abbr: "LUT", slug: "luton-town" },
  { espnTeamId: "382", club: "Manchester City", abbr: "MCI", slug: "manchester-city" },
  { espnTeamId: "360", club: "Manchester United", abbr: "MUN", slug: "manchester-united" },
  { espnTeamId: "361", club: "Newcastle United", abbr: "NEW", slug: "newcastle-united" },
  { espnTeamId: "393", club: "Nottingham Forest", abbr: "NFO", slug: "nottingham-forest" },
  { espnTeamId: "398", club: "Sheffield United", abbr: "SHU", slug: "sheffield-united" },
  { espnTeamId: "376", club: "Southampton", abbr: "SOU", slug: "southampton" },
  { espnTeamId: "366", club: "Sunderland", abbr: "SUN", slug: "sunderland" },
  { espnTeamId: "367", club: "Tottenham Hotspur", abbr: "TOT", slug: "tottenham-hotspur" },
  { espnTeamId: "371", club: "West Ham United", abbr: "WHU", slug: "west-ham-united" },
  { espnTeamId: "380", club: "Wolverhampton Wanderers", abbr: "WOL", slug: "wolverhampton-wanderers" },
]);
const CLUB_BY_NAME = new Map(EPL_CLUBS.map((c) => [c.club, c]));
const CLUB_BY_ESPN = new Map(EPL_CLUBS.map((c) => [c.espnTeamId, c]));

const MATCH_STAT_MAP = [
  ["position", "position"], ["formationPlace", "formationPlace"], ["started", "started"], ["subbedIn", "subbedIn"],
  ["subbedOut", "subbedOut"], ["appeared", "appeared"], ["goals", "goals"], ["assists", "assists"], ["shots", "shots"],
  ["shotsOnGoal", "shotsOnGoal"], ["yellowCards", "yellow"], ["redCards", "red"], ["fouls", "fouls"], ["offsides", "offsides"],
  ["saves", "saves"], ["goalsAgainst", "goalsAgainst"],
];

/**
 * @param {{ fixtureCaptures?: Array<{path:string, doc:any}>, espnPlayerRows?: any[], squads?: any }} input
 * @param {ReturnType<import("../diagnostics.mjs").createDiagnostics>} diag
 */
export function adaptEpl(input, diag) {
  const SPORT = "EPL";
  const sourceRows = {};
  const bump = (k, n = 1) => { sourceRows[k] = (sourceRows[k] ?? 0) + n; };
  const games = createMerger({ kind: "game", sportId: SPORT, fields: GAME_FIELDS, defaultPrecedence: [S.FIXTURES, S.ESPN_MATCH], precedence: {} });
  const teamNames = createLabelPicker([S.SQUADS, S.ESPN_MATCH]);
  const teamEspnAbbr = createLabelPicker([S.SQUADS]);
  const teamIds = new Set();
  const noteEspnTeam = (raw, name, date, src) => {
    const id = eplTeamId(raw);
    if (!id) return null;
    teamIds.add(String(raw));
    teamNames.add(id, name, date, src);
    return id;
  };

  // ── fixtures: newest capture defines the current set; older shipped ids become lineage aliases ──
  const captures = [...(input.fixtureCaptures ?? [])].sort((a, b) => (a.path < b.path ? -1 : 1));
  const newest = captures.at(-1)?.doc ?? null;
  const currentByOpenfootball = new Map();
  for (const r of newest?.rows ?? []) {
    bump(S.FIXTURES);
    const id = eplShippedGameId(r.eventId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.FIXTURES, { eventId: r.eventId ?? null }); continue; }
    const of = (r.providerRefs ?? []).find((p) => p?.provider === "openfootball" && p?.id)?.id ?? null;
    if (of) {
      if (currentByOpenfootball.has(of) && currentByOpenfootball.get(of) !== id) diag.add("AMBIGUOUS_ALIAS", SPORT, S.FIXTURES, { openfootball: of });
      currentByOpenfootball.set(of, id);
    }
    const home = CLUB_BY_NAME.get(r.homeClub), away = CLUB_BY_NAME.get(r.awayClub);
    if (!home || !away) diag.add("UNRESOLVED_TEAM", SPORT, S.FIXTURES, { id, clubs: [r.homeClub, r.awayClub] });
    if (home) teamIds.add(home.espnTeamId);
    if (away) teamIds.add(away.espnTeamId);
    games.add(id, S.FIXTURES, {
      seasonKey: typeof newest.season === "string" ? newest.season : null,
      startUtc: normalizeInstant(r.kickoffIso),
      homeTeamId: home ? eplTeamId(home.espnTeamId) : null,
      awayTeamId: away ? eplTeamId(away.espnTeamId) : null,
      statusClass: "NOT_FINAL",
    }, of ? [alias("openfootball", "game", of)] : []);
  }
  // Superseded shipped ids → current id via the openfootball key (ambiguous keys resolve to nobody).
  const ambiguousOf = new Set();
  const lineage = new Map(); // old shipped id → current id
  for (const { doc } of captures.slice(0, -1)) {
    for (const r of doc?.rows ?? []) {
      const old = eplShippedGameId(r.eventId);
      if (!old || games.has(old)) continue;
      const of = (r.providerRefs ?? []).find((p) => p?.provider === "openfootball" && p?.id)?.id ?? null;
      const cur = of ? currentByOpenfootball.get(of) : null;
      if (!cur) { if (!lineage.has(old)) diag.add("UNRESOLVED_GAME", SPORT, S.FIXTURES, { supersededId: old, openfootball: of }); lineage.set(old, null); continue; }
      if (lineage.has(old) && lineage.get(old) !== cur) { ambiguousOf.add(old); continue; }
      lineage.set(old, cur);
    }
  }
  for (const [old, cur] of lineage) {
    if (!cur || ambiguousOf.has(old)) continue;
    games.add(cur, S.FIXTURES, {}, [alias("gametime_epl_event", "game", old)]);
  }
  for (const old of ambiguousOf) diag.add("AMBIGUOUS_ALIAS", SPORT, S.FIXTURES, { supersededId: old });

  // ── ESPN player-match corpus (history) ──────────────────────────────────────────────────────────
  const players = createLabelPicker([S.SQUADS, S.ESPN_MATCH]);
  const playerAliases = new Map();
  const perEvent = new Map();
  for (const row of input.espnPlayerRows ?? []) {
    bump(S.ESPN_MATCH);
    const gid = eplEspnGameId(row.espnEventId);
    if (!gid) { diag.add("MISSING_EVENT_ID", SPORT, S.ESPN_MATCH, {}); continue; }
    const e = perEvent.get(gid) ?? { season: new Set(), date: new Set(), home: new Set(), away: new Set(), rows: [] };
    e.season.add(row.season); e.date.add(normalizeInstant(row.dateUtc));
    const tid = noteEspnTeam(row.teamId, row.teamName, row.dateUtc, S.ESPN_MATCH);
    if (tid) (row.isHome === true ? e.home : row.isHome === false ? e.away : new Set()).add(tid);
    e.rows.push({ row, tid });
    perEvent.set(gid, e);
  }
  const gameSides = new Map();
  for (const [gid, e] of perEvent) {
    const one = (s) => (s.size === 1 ? [...s][0] : null);
    const home = one(e.home), away = one(e.away);
    if (!home || !away || home === away) diag.add("UNRESOLVED_TEAM", SPORT, S.ESPN_MATCH, { id: gid, home: [...e.home], away: [...e.away] });
    const season = one(e.season), start = one(e.date);
    if (!season || !start) diag.add("MALFORMED_ROW", SPORT, S.ESPN_MATCH, { id: gid, reason: "rows disagree on season or kickoff" });
    games.add(gid, S.ESPN_MATCH, {
      seasonKey: season, startUtc: start,
      homeTeamId: home && away && home !== away ? home : null,
      awayTeamId: home && away && home !== away ? away : null,
      // The capture keeps only competitions ESPN marks completed (capture-epl-espn-players.mjs).
      statusClass: "FINAL",
    }, [alias("espn", "game", gid)]);
    gameSides.set(gid, { home: home && away && home !== away ? home : null, away: home && away && home !== away ? away : null });
  }

  const playerGameStats = [];
  const seen = new Set();
  for (const [gid, e] of [...perEvent].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sides = gameSides.get(gid);
    for (const { row, tid } of e.rows) {
      const pid = eplPlayerId(row.playerId);
      if (!pid) { diag.add("UNRESOLVED_PLAYER", SPORT, S.ESPN_MATCH, { gameId: gid }); continue; }
      if (!tid || !sides.home || (tid !== sides.home && tid !== sides.away)) { diag.add("SIDE_MISMATCH", SPORT, S.ESPN_MATCH, { gameId: gid, playerId: pid, teamId: tid }); continue; }
      const key = `${gid}|${pid}`;
      if (seen.has(key)) { diag.add("STAT_CONFLICT", SPORT, S.ESPN_MATCH, { gameId: gid, playerId: pid, reason: "player listed twice" }); continue; }
      seen.add(key);
      const stats = Object.fromEntries(MATCH_STAT_MAP.map(([k, src]) => [k, sourceValue(row[src])]));
      const errs = validateStats("epl.espn-player-match", stats);
      if (errs.length) { diag.add("INVALID_STAT", SPORT, S.ESPN_MATCH, { gameId: gid, playerId: pid, errs }); continue; }
      players.add(pid, row.playerName, row.dateUtc ?? null, S.ESPN_MATCH);
      playerAliases.set(pid, alias("espn", "player", String(row.playerId)));
      playerGameStats.push(playerGameStatRecord({ family: "epl.espn-player-match", sportId: SPORT, gameId: gid, playerId: pid, teamId: tid, opponentTeamId: tid === sides.home ? sides.away : sides.home, stats, src: S.ESPN_MATCH }));
    }
  }

  // ── squads 2026-27 (identity only) ──────────────────────────────────────────────────────────────
  const capturedAt = input.squads?.capturedAt ?? null;
  for (const sq of input.squads?.squads ?? []) {
    const tid = noteEspnTeam(sq.teamId, sq.teamName, capturedAt, S.SQUADS);
    if (tid && typeof sq.abbreviation === "string") teamEspnAbbr.add(tid, sq.abbreviation, capturedAt, S.SQUADS);
    for (const p of sq.players ?? []) {
      bump(S.SQUADS);
      const pid = eplPlayerId(p.playerId);
      if (!pid) { diag.add("UNRESOLVED_PLAYER", SPORT, S.SQUADS, { reason: "non-numeric ESPN id" }); continue; }
      players.add(pid, p.name, capturedAt, S.SQUADS);
      playerAliases.set(pid, alias("espn", "player", String(p.playerId)));
    }
  }

  const gm = games.finalize();
  const gameRecords = gm.records.map((r) => gameRecord(SPORT, r.id, r.fields, r.aliases));
  const teams = [...teamIds].sort().map((raw) => {
    const id = eplTeamId(raw);
    const club = CLUB_BY_ESPN.get(raw);
    const espnName = teamNames.pick(id);
    if (!club) diag.add("UNRESOLVED_TEAM", SPORT, "team", { id, reason: "ESPN team not in the reviewed club table; no shipped slug alias" });
    return teamRecord(SPORT, id, { name: club?.club ?? espnName ?? id, abbreviation: club?.abbr ?? teamEspnAbbr.pick(id) },
      [alias("espn", "team", raw), ...(club ? [alias("gametime_epl_club", "team", club.slug)] : [])]);
  });
  const playerRecords = [...playerAliases.keys()].map((pid) => {
    const name = players.pick(pid);
    for (const v of players.variants(pid)) if (v !== name) diag.add("NAME_VARIANT", SPORT, "player", { id: pid, kept: name, variant: v });
    return playerRecord(SPORT, pid, { name: name ?? pid, currentTeamId: null }, [playerAliases.get(pid)]);
  });

  return { sportId: SPORT, teams, players: playerRecords, games: gameRecords, teamGameStats: [], playerGameStats, conflicts: gm.conflicts, sourceRows };
}
