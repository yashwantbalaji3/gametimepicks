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

/**
 * The per-game "model vs sportsbook line" page (page weight 2026-10-30): /nba/lines/<eventId>/ holds a game's FULL
 * model-vs-line table — the game page, /nba/projections, the /nba hub and /today show a compact summary linking here.
 * The route (app/nba/lines/[eventId]/page.tsx) is generated ONLY for the games nbaLinesPageIds lists (an authorized,
 * decryptable artifact with at least one compared line), so a link is drawn only for an id in that list.
 */
export const nbaLinesPageHref = (id) => `/nba/lines/${id}/`;

/**
 * Where a game's FULL model-vs-sportsbook-line table lives: its /nba/lines/<id>/ page when that page is generated
 * (`linesIds` — nbaLinesPageIds, the route's own generateStaticParams source; empty in a build without a readable
 * artifact), else null (no link: never a dead one).
 * @param {string|number} id
 * @param {readonly string[]|ReadonlySet<string>|null|undefined} linesIds
 */
export function nbaPropLinesHref(id, linesIds) {
  const key = String(id ?? "");
  if (!key || !linesIds) return null;
  const has = linesIds instanceof Set ? linesIds.has(key) : [...linesIds].map(String).includes(key);
  return has ? nbaLinesPageHref(key) : null;
}
