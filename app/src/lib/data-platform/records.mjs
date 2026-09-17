/**
 * Record constructors — the one place a platform record's full key set is spelled out, so every adapter
 * emits the same envelope with explicit nulls (never `undefined`, never a missing key).
 */
import { PLATFORM_SCHEMA_VERSION } from "./contract.mjs";
import { LEAGUE_IDS, seasonId } from "./ids.mjs";

const V = PLATFORM_SCHEMA_VERSION;
const alias = (provider, entityType, id) => ({ provider, entityType, id: String(id) });
export { alias };

export const GAME_FIELDS = Object.freeze([
  "seasonKey", "seasonPhase", "startUtc", "officialDate", "homeTeamId", "awayTeamId", "competitors", "card",
  "neutralSite", "venue", "statusClass",
]);

export function teamRecord(sportId, id, { name, shortName = null, abbreviation = null }, providerAliases) {
  return { schemaVersion: V, id, sportId, leagueId: LEAGUE_IDS[sportId], name, shortName, abbreviation, providerAliases };
}

export function playerRecord(sportId, id, { name, currentTeamId = null }, providerAliases) {
  return { schemaVersion: V, id, sportId, name, currentTeamId, providerAliases };
}

/** @param {Record<string, unknown>} f merged GAME_FIELDS */
export function gameRecord(sportId, id, f, providerAliases) {
  return {
    schemaVersion: V,
    id,
    sportId,
    leagueId: LEAGUE_IDS[sportId],
    seasonId: seasonId(sportId, f.seasonKey),
    seasonPhase: f.seasonPhase ?? null,
    startUtc: f.startUtc ?? null,
    officialDate: f.officialDate ?? null,
    homeTeamId: f.homeTeamId ?? null,
    awayTeamId: f.awayTeamId ?? null,
    competitors: f.competitors ?? null,
    card: f.card ?? null,
    neutralSite: f.neutralSite ?? null,
    venue: f.venue ?? null,
    statusClass: f.statusClass ?? "NOT_FINAL",
    providerAliases,
  };
}

export function teamGameStatRecord({ family, sportId, gameId, teamId, opponentTeamId, homeAway, isFinal, stats, src }) {
  return { schemaVersion: V, family, sportId, gameId, teamId, opponentTeamId: opponentTeamId ?? null, homeAway: homeAway ?? null, isFinal, stats, src };
}

export function playerGameStatRecord({ family, sportId, gameId, playerId, teamId = null, opponentTeamId = null, opponentPlayerId = null, stats, src }) {
  return { schemaVersion: V, family, sportId, gameId, playerId, teamId, opponentTeamId, opponentPlayerId, stats, src };
}

/** Season record for a season key actually observed on a game. start/end stay null: no provider season window is committed. */
export function seasonRecord(sportId, key) {
  const semantics = {
    MLB: "calendar season year (StatsAPI season)",
    NFL: "year the season starts (a February postseason game belongs to the prior year's season)",
    EPL: "split-year season label",
    UFC: "calendar year (UTC) of the card's scheduled start — a neutral period key, not a competitive season",
  }[sportId];
  return { schemaVersion: V, id: seasonId(sportId, key), sportId, leagueId: LEAGUE_IDS[sportId], label: sportId === "EPL" ? key : String(key), semantics, startDate: null, endDate: null, providerAliases: [] };
}

/**
 * Build per-team stat rows for a two-team game. homeAway is the provider's DESIGNATED side; a neutral-site
 * game keeps its designation and says so on GameRecord.neutralSite (the enum's NEUTRAL is reserved for a
 * source that designates no side).
 */
export function sidePair(game, family, statsHome, statsAway, src) {
  const out = [];
  if (game.homeTeamId) out.push(teamGameStatRecord({ family, sportId: game.sportId, gameId: game.id, teamId: game.homeTeamId, opponentTeamId: game.awayTeamId, homeAway: "HOME", isFinal: true, stats: statsHome, src }));
  if (game.awayTeamId) out.push(teamGameStatRecord({ family, sportId: game.sportId, gameId: game.id, teamId: game.awayTeamId, opponentTeamId: game.homeTeamId, homeAway: "AWAY", isFinal: true, stats: statsAway, src }));
  return out;
}
