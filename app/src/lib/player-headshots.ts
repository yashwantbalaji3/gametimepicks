/**
 * player-headshots.ts — official-CDN headshot URLs derived from REAL player ids
 * already present in our provider artifacts. This is not fabrication: the ids come
 * from the official MLB Stats API / NBA data feeds, and the URL patterns are the
 * leagues' own public media CDNs (the same images MLB.com / NBA.com render).
 *
 * Honesty rules:
 *   - Only call with a real numeric id from an artifact — never a guessed id.
 *   - The MLB URL carries MLB's own generic-silhouette default
 *     (`d_people:generic:headshot`), so a missing player degrades to the league's
 *     official placeholder, never a broken image.
 *   - Callers must keep their monogram/orb fallback for legs without an id.
 */

/** Official MLB Static headshot (with MLB's built-in generic fallback). */
export function mlbHeadshotUrl(playerId: number | string | null | undefined): string | null {
  if (playerId == null || playerId === "") return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

/**
 * The StatsAPI person id inside an official headshot URL — ONLY when `mlbHeadshotUrl(id)` rebuilds the exact same
 * string (Phase 5O payload packing: a client prop can carry the id instead of ~150 bytes of URL, losslessly). Any
 * other URL, or no URL, returns null and the caller keeps what it had.
 */
export function mlbPersonIdFromHeadshotUrl(url: string | null | undefined): string | null {
  const id = url ? /\/people\/(\d+)\/headshot\//.exec(url)?.[1] : undefined;
  return id && mlbHeadshotUrl(id) === url ? id : null;
}

/** Official NBA media CDN headshot. */
export function nbaHeadshotUrl(playerId: number | string | null | undefined): string | null {
  if (playerId == null || playerId === "") return null;
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

/**
 * Official MLB team logo (mlbstatic CDN) from a real MLB Stats API team id.
 * Same official-source family as the player headshots — never a scraped/fabricated
 * mark. Callers keep a monogram fallback for rows without an id.
 */
export function mlbTeamLogoUrl(teamId: number | string | null | undefined): string | null {
  if (teamId == null || teamId === "") return null;
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}
