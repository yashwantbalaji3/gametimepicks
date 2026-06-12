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

/** Official NBA media CDN headshot. */
export function nbaHeadshotUrl(playerId: number | string | null | undefined): string | null {
  if (playerId == null || playerId === "") return null;
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}
