/**
 * Link ids for the NBA "model vs sportsbook line" surfaces (page weight, 2026-10-29/30), SERVER only:
 *   lines    the games whose /nba/lines/<id>/ page is generated (nbaLinesPageIds — the route's own generateStaticParams
 *            source): /nba/projections' per-game summaries link there through nbaPropLinesHref (game-page-link.mjs), and
 *            nothing else — never a dead link (the post-build dead-link guard);
 * and the exported game pages, computed exactly as the /nba hub computes its card links (app/nba/page.tsx) — the lines
 * page's back-link names its game page only when that page is built:
 *   current  today's Game Simulation ids — read only behind the INLINE GTP_NBA_THEATER_PUBLIC literal, with the public
 *            loader imported dynamically inside that branch, so a flag-OFF build never imports the loader (empty there);
 *   pages    every exported /nba/simulation/<id>/ page (nbaExportedGamePageIds: today's Theater pages + the past slates'
 *            settled pages — the route's own generateStaticParams pieces; empty in a flag-OFF build).
 * Kept out of src/app so the projections and lines routes name no Theater module or flag themselves (feature-manifest.test.mjs).
 */
import path from "node:path";
import { publicTheaterRouteIds } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import { nbaExportedGamePageIds } from "@/components/nba/settled-simulation-data";
import { nbaLinesPageIds } from "@/components/nba/nba-prop-lines";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function nbaLineSummaryGameLinks(today: string): Promise<{ current: string[]; pages: string[]; lines: string[] }> {
  let theaterIds: string[] = [];
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {
    const { publicPossessionEvents } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    theaterIds = publicTheaterRouteIds(() => publicPossessionEvents(REPO_ROOT));
  }
  return { current: theaterIds, pages: nbaExportedGamePageIds(today, theaterIds), lines: nbaLinesPageIds() };
}
