/**
 * NBA GAME PAGE LINKS (Batch 1 fix #2, 2026-10-29). Pure; no fs, no React.
 *
 * Every NBA game that has an exported page — today's Game Simulation page, or a past slate's settled page, both at
 * /nba/simulation/<id>/ — is linked from the /nba game cards, the "Forecast vs. Actual" rows and /today's NBA rows, and
 * ONLY those games: the caller passes the exported id list (components/nba/settled-simulation-data.ts
 * nbaExportedGamePageIds — the same pieces the route's generateStaticParams publishes), so a game whose page is not
 * exported (today's unpublished games; a flag-OFF build) gets no link and the post-build dead-link guard stays green.
 */

/** The game page URL (the route's own shape; trailing slash as the export writes it). */
export const nbaGamePageHref = (id) => `/nba/simulation/${id}/`;

/** The link's accessible name: "Game page: ATL vs MIA" (away first, as every NBA surface lists a game). */
export const nbaGamePageLabel = (away, home) => `Game page: ${away ?? "Away"} vs ${home ?? "Home"}`;

/** The visible link text (the accessible name starts with it, so speech input matches). */
export const NBA_GAME_PAGE_TEXT = "Game page →";

/**
 * The href for `id` only when its page is exported, else null.
 * @param {string|number} id
 * @param {ReadonlySet<string>|readonly string[]|null|undefined} exported
 */
export function nbaGamePageHrefIfExported(id, exported) {
  const key = String(id ?? "");
  if (!key || !exported) return null;
  const has = exported instanceof Set ? exported.has(key) : exported.includes(key);
  return has ? nbaGamePageHref(key) : null;
}
