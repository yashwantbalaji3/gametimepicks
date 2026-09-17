/**
 * Whole-store validation — identity, aliases, referential integrity, participants, time, final facts,
 * stat domains, row uniqueness. Pure; returns every problem at once (a gate wants the full list).
 *
 * ERRORS fail the build and the committed-artifact test. There is no "warning that is really an error":
 * coverage gaps (a game without a start time, a final without team ids) are counted in coverage, and
 * everything that would make a record WRONG (rather than incomplete) is an error.
 */
import { validateRecord, SPORT_IDS } from "./contract.mjs";
import { isCanonicalId } from "./ids.mjs";
import { buildAliasIndex } from "./aliases.mjs";
import { STAT_FAMILIES, validateStats } from "./stat-dictionary.mjs";

const TEAM_SPORTS = new Set(["MLB", "NFL", "EPL"]);
const ERROR_SAMPLE_CAP = 25;

/**
 * @param {{ sports:any[], leagues:any[], seasons:any[], teams:any[], players:any[], games:any[], teamGameStats:any[], playerGameStats:any[] }} store
 */
export function validateStore(store) {
  const errors = new Map(); // code → {count, samples}
  const err = (code, detail) => {
    const b = errors.get(code) ?? { count: 0, samples: [] };
    b.count += 1;
    if (b.samples.length < ERROR_SAMPLE_CAP) b.samples.push(detail);
    errors.set(code, b);
  };

  const kinds = [
    ["sport", store.sports], ["league", store.leagues], ["season", store.seasons], ["team", store.teams],
    ["player", store.players], ["game", store.games], ["teamGameStat", store.teamGameStats], ["playerGameStat", store.playerGameStats],
  ];
  for (const [kind, list] of kinds) {
    for (const r of list) {
      const e = validateRecord(kind, r);
      if (e.length) err("SCHEMA", { kind, id: r?.id ?? r?.gameId ?? null, errors: e });
    }
  }

  // ── identity: unique, well-formed, provider-derived ─────────────────────────────────────────────
  const index = (list, kind, withFormat) => {
    const m = new Map();
    for (const r of list) {
      const k = `${r.sportId ?? r.id}|${r.id}`;
      if (m.has(k)) err("DUPLICATE_ID", { kind, id: r.id, sportId: r.sportId });
      m.set(k, r);
      if (withFormat && !isCanonicalId(r.sportId, kind, r.id)) err("ID_FORMAT", { kind, sportId: r.sportId, id: r.id });
    }
    return m;
  };
  const sports = new Set(store.sports.map((s) => s.id));
  for (const s of store.sports) if (!SPORT_IDS.includes(s.id)) err("ID_FORMAT", { kind: "sport", id: s.id });
  const leagues = index(store.leagues, "league", false);
  const seasons = index(store.seasons, "season", false);
  const teams = index(store.teams, "team", true);
  const players = index(store.players, "player", true);
  const games = index(store.games, "game", true);

  // ── aliases: no collision, one id per provider namespace per entity, full round trip ────────────
  const aliasIdx = buildAliasIndex([...store.teams, ...store.players, ...store.games]);
  for (const c of aliasIdx.collisions) err("ALIAS_COLLISION", c);
  for (const d of aliasIdx.sameProviderDuplicates) err("ALIAS_SAME_PROVIDER_TWICE", d);
  const rt = aliasIdx.roundTrip();
  for (const f of rt.failures) err("ALIAS_ROUND_TRIP", f);

  // ── referential integrity + participants + time ─────────────────────────────────────────────────
  for (const l of store.leagues) if (!sports.has(l.sportId)) err("ORPHAN_REF", { kind: "league", id: l.id, missing: l.sportId });
  for (const s of store.seasons) {
    if (!sports.has(s.sportId)) err("ORPHAN_REF", { kind: "season", id: s.id, missing: s.sportId });
    if (!leagues.has(`${s.sportId}|${s.leagueId}`)) err("ORPHAN_REF", { kind: "season", id: s.id, missing: s.leagueId });
  }
  for (const t of store.teams) if (!leagues.has(`${t.sportId}|${t.leagueId}`)) err("ORPHAN_REF", { kind: "team", id: t.id, missing: t.leagueId });
  for (const p of store.players) if (p.currentTeamId && !teams.has(`${p.sportId}|${p.currentTeamId}`)) err("ORPHAN_REF", { kind: "player", id: p.id, missing: p.currentTeamId });

  for (const g of store.games) {
    const at = `${g.sportId}|`;
    if (!leagues.has(at + g.leagueId)) err("ORPHAN_REF", { kind: "game", id: g.id, missing: g.leagueId });
    const season = seasons.get(at + g.seasonId);
    if (!season) err("ORPHAN_REF", { kind: "game", id: g.id, missing: g.seasonId });
    for (const side of ["homeTeamId", "awayTeamId"]) if (g[side] && !teams.has(at + g[side])) err("ORPHAN_REF", { kind: "game", id: g.id, missing: g[side] });
    if (TEAM_SPORTS.has(g.sportId)) {
      if (g.homeTeamId && g.homeTeamId === g.awayTeamId) err("PARTICIPANTS", { id: g.id, reason: "home and away are the same team" });
      if (g.competitors !== null) err("PARTICIPANTS", { id: g.id, reason: "team sport game carries competitors" });
      if (g.card !== null) err("PARTICIPANTS", { id: g.id, reason: "team sport game carries a card" });
    } else if (g.sportId === "UFC") {
      if (g.homeTeamId || g.awayTeamId) err("PARTICIPANTS", { id: g.id, reason: "a bout has no home/away team" });
      const cs = g.competitors ?? [];
      if (cs.length !== 2 || cs[0].playerId === cs[1].playerId || new Set(cs.map((c) => c.corner)).size !== 2) err("PARTICIPANTS", { id: g.id, reason: "a bout needs two distinct fighters in RED and BLUE" });
      for (const c of cs) if (!players.has(at + c.playerId)) err("ORPHAN_REF", { kind: "game", id: g.id, missing: c.playerId });
      if (!g.card) err("PARTICIPANTS", { id: g.id, reason: "a bout must name its card" });
    }
    // Season plausibility: the event date sits in (seasonYear-1 … seasonYear+1). Catches a mis-partitioned row.
    const y = Number(String(g.seasonId).match(/(\d{4})/)?.[1]);
    const when = g.startUtc ?? g.officialDate;
    if (Number.isFinite(y) && when) {
      const ey = Number(when.slice(0, 4));
      if (ey < y - 1 || ey > y + 1) err("SEASON_IMPLAUSIBLE", { id: g.id, seasonId: g.seasonId, when });
    }
  }

  // ── stats ───────────────────────────────────────────────────────────────────────────────────────
  const seenTeamRows = new Set();
  for (const r of store.teamGameStats) {
    const fam = STAT_FAMILIES[r.family];
    if (!fam || fam.level !== "team" || fam.sportId !== r.sportId) { err("STAT_FAMILY", { family: r.family, sportId: r.sportId, level: "team" }); continue; }
    const g = games.get(`${r.sportId}|${r.gameId}`);
    if (!g) { err("ORPHAN_REF", { kind: "teamGameStat", missing: r.gameId }); continue; }
    if (!teams.has(`${r.sportId}|${r.teamId}`)) err("ORPHAN_REF", { kind: "teamGameStat", missing: r.teamId });
    const sides = [g.homeTeamId, g.awayTeamId];
    if (!sides.includes(r.teamId)) err("STAT_SIDE", { gameId: r.gameId, teamId: r.teamId, reason: "team is not a participant of the game" });
    if (r.opponentTeamId !== null && (!sides.includes(r.opponentTeamId) || r.opponentTeamId === r.teamId)) err("STAT_SIDE", { gameId: r.gameId, teamId: r.teamId, reason: "opponent is not the other participant" });
    if (r.homeAway === "HOME" && r.teamId !== g.homeTeamId) err("STAT_SIDE", { gameId: r.gameId, teamId: r.teamId, reason: "HOME row for the away team" });
    if (r.homeAway === "AWAY" && r.teamId !== g.awayTeamId) err("STAT_SIDE", { gameId: r.gameId, teamId: r.teamId, reason: "AWAY row for the home team" });
    // A final-score family row asserts a final fact; the game must say FINAL (a scheduled game is never 0–0).
    if (r.isFinal !== true || g.statusClass !== "FINAL") err("FINAL_FACT", { gameId: r.gameId, teamId: r.teamId, isFinal: r.isFinal, statusClass: g.statusClass });
    for (const e of validateStats(r.family, r.stats)) err("STAT_DOMAIN", { gameId: r.gameId, teamId: r.teamId, error: e });
    const k = `${r.sportId}|${r.family}|${r.gameId}|${r.teamId}`;
    if (seenTeamRows.has(k)) err("DUPLICATE_STAT_ROW", { key: k });
    seenTeamRows.add(k);
  }
  const seenPlayerRows = new Set();
  for (const r of store.playerGameStats) {
    const fam = STAT_FAMILIES[r.family];
    if (!fam || fam.level !== "player" || fam.sportId !== r.sportId) { err("STAT_FAMILY", { family: r.family, sportId: r.sportId, level: "player" }); continue; }
    const g = games.get(`${r.sportId}|${r.gameId}`);
    if (!g) { err("ORPHAN_REF", { kind: "playerGameStat", missing: r.gameId }); continue; }
    if (!players.has(`${r.sportId}|${r.playerId}`)) err("ORPHAN_REF", { kind: "playerGameStat", missing: r.playerId });
    if (r.teamId !== null) {
      if (!teams.has(`${r.sportId}|${r.teamId}`)) err("ORPHAN_REF", { kind: "playerGameStat", missing: r.teamId });
      if (![g.homeTeamId, g.awayTeamId].includes(r.teamId)) err("STAT_SIDE", { gameId: r.gameId, playerId: r.playerId, reason: "player's team is not a participant" });
      if (r.opponentTeamId !== null && ((r.opponentTeamId === r.teamId) || ![g.homeTeamId, g.awayTeamId].includes(r.opponentTeamId))) err("STAT_SIDE", { gameId: r.gameId, playerId: r.playerId, reason: "opponent is not the other participant" });
    }
    if (g.sportId === "UFC") {
      const ids = (g.competitors ?? []).map((c) => c.playerId);
      if (!ids.includes(r.playerId)) err("STAT_SIDE", { gameId: r.gameId, playerId: r.playerId, reason: "fighter did not compete in this bout" });
      if (r.opponentPlayerId !== null && (r.opponentPlayerId === r.playerId || !ids.includes(r.opponentPlayerId))) err("STAT_SIDE", { gameId: r.gameId, playerId: r.playerId, reason: "opponent fighter is not the other corner" });
    }
    for (const e of validateStats(r.family, r.stats)) err("STAT_DOMAIN", { gameId: r.gameId, playerId: r.playerId, error: e });
    const k = `${r.sportId}|${r.family}|${r.gameId}|${r.playerId}`;
    if (seenPlayerRows.has(k)) err("DUPLICATE_STAT_ROW", { key: k });
    seenPlayerRows.add(k);
  }

  const list = [...errors].map(([code, b]) => ({ code, ...b })).sort((a, b) => (a.code < b.code ? -1 : 1));
  return {
    ok: list.length === 0,
    errors: list,
    checked: {
      records: kinds.reduce((n, [, l]) => n + l.length, 0),
      aliases: rt.checked,
    },
  };
}
