/**
 * EXACT-ID IDENTITY URLS (DS-001 §5) — pure, no I/O, safe on server and client.
 *
 * Every portrait or crest URL on the site is derived from the provider's OWN id for that exact entity, never
 * from a name. Anything that does not match the exact id shape returns null and the caller renders initials.
 * Moved here from lib/live/nfl-hub-data.ts (Release 2B) so research pages can use the same rule without
 * importing a node-only roster module; that module re-exports it unchanged.
 */

/*
 * NFL: research and board ids are `nfl-athlete-<espnAthleteId>`. Served THROUGH THE COMBINER at 96px
 * (~11 KB) rather than the raw ~266 KB path; an unknown id returns a clean 404, so the avatar's onError
 * lands on initials — never a stranger's face.
 */
export function espnNflHeadshotUrl(playerId: string | null | undefined): string | null {
  const m = /^nfl-athlete-(\d+)$/.exec(String(playerId ?? ""));
  if (!m) return null;
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${m[1]}.png&w=96&h=96`;
}

/** MLB: research ids are `mlb-player-<mlbamId>`; the MLB Stats people CDN is keyed by that id. */
export function mlbPlayerIdFromResearchId(id: string | null | undefined): number | null {
  const m = /^mlb-player-(\d+)$/.exec(String(id ?? ""));
  return m ? Number(m[1]) : null;
}

/** EPL: research team ids are `epl-team-<espnTeamId>`; ESPN's soccer crest CDN is keyed by that id. */
export function eplCrestUrl(teamId: string | null | undefined): string | null {
  const m = /^epl-team-(\d+)$/.exec(String(teamId ?? ""));
  return m ? `https://a.espncdn.com/i/teamlogos/soccer/500/${m[1]}.png` : null;
}
