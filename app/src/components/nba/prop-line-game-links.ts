/**
 * The game pages /nba/projections' per-game "model vs sportsbook line" summaries may link (page weight, 2026-10-29) —
 * computed exactly as the /nba hub computes its card links (app/nba/page.tsx), SERVER only:
 *   current  today's Game Simulation ids — read only behind the INLINE GTP_NBA_THEATER_PUBLIC literal, with the public
 *            loader imported dynamically inside that branch, so a flag-OFF build never imports the loader (empty there);
 *   pages    every exported /nba/simulation/<id>/ page (nbaExportedGamePageIds: today's Theater pages + the past slates'
 *            settled pages — the route's own generateStaticParams pieces; empty in a flag-OFF build).
 * nbaPropLinesHref (game-page-link.mjs) then picks `#nba-game-prop-lines` on a Theater page, `#nba-settled-prop-lines` on
 * a settled page, or no link — never a dead one (the post-build dead-link guard).
 * Kept out of src/app so the projections routes name no Theater module or flag themselves (feature-manifest.test.mjs).
 */
import path from "node:path";
import { publicTheaterRouteIds } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import { nbaExportedGamePageIds } from "@/components/nba/settled-simulation-data";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function nbaLineSummaryGameLinks(today: string): Promise<{ current: string[]; pages: string[] }> {
  let theaterIds: string[] = [];
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {
    const { publicPossessionEvents } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    theaterIds = publicTheaterRouteIds(() => publicPossessionEvents(REPO_ROOT));
  }
  return { current: theaterIds, pages: nbaExportedGamePageIds(today, theaterIds) };
}
