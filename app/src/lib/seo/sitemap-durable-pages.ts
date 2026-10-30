/**
 * DURABLE SETTLED PAGES FOR sitemap.xml (Batch 1 · #10) — SERVER / BUILD TIME ONLY.
 *
 * The route-table half of the sitemap lists static routes; dynamic families are skipped there because a family is a
 * pattern, not a URL. This module lists the CONCRETE pages of the families whose pages outlive their game — a settled
 * page stays at the same URL — from the SAME id sources each family's generateStaticParams uses, so the sitemap can
 * never name a page the export did not build (sitemap-durable-pages.test.mjs checks every listed URL against the
 * pages' own param lists).
 *
 * `lastModified` is the event's own date from committed data (the ET slate date / the kickoff's ET date), never the
 * build's wall-clock time: a page whose game is over does not change because a build ran.
 *
 * Deliberately NOT listed:
 *   - live, pre-game pages (/games/<sport>/<slug> for today's board, the current NFL week): they churn daily and are
 *     reachable from their hubs; a settled page is the durable one.
 *   - /nba/simulation/<id>: an internal family, pruned from the export while the Theater gate is off, and `noindex`
 *     even when on (candidate pages are kept out of search until the release owner publishes them).
 *   - /nba/lines/<id>: a game's model-vs-sportsbook-line table — `noindex`, superseded every slate, and generated only on
 *     a build that can read a line artifact.
 *
 * Adding a family (e.g. UFC settled bouts): append one source to DURABLE_PAGE_SOURCES that reads the same ids as that
 * route's generateStaticParams, and extend the export-membership test with that route's params.
 */
import path from "node:path";

import { settledMlbGames } from "@/lib/mlb/settled-games-data";
import { archivedEventIds, reconciledGames } from "@/lib/sports/nfl/archived-forecast";
import { currentEtDate } from "@/lib/freshness";
import { ufcSettledBouts } from "@/lib/sports/ufc/bout";

export interface DurablePage {
  /** Site path with the export's trailing slash. */
  path: string;
  /** YYYY-MM-DD from committed data (event date), or absent when no deterministic date exists. */
  lastModified?: string;
}

const DATA_ROOT = () => path.join(process.cwd(), "public", "data");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** MLB settled game pages: /games/[sport]/[gameId] generateStaticParams' settled half (settledMlbGames at the build's ET date). */
export function mlbSettledGamePages(today: string = currentEtDate()): DurablePage[] {
  return settledMlbGames(today).map((g) => ({
    path: `/games/mlb/${g.slug}/`,
    ...(ISO_DATE.test(g.date) ? { lastModified: g.date } : {}),
  }));
}

/** NFL archived game pages: /nfl/game/[eventId] generateStaticParams' archived half (archivedEventIds). */
export function nflArchivedGamePages(root: string = DATA_ROOT()): DurablePage[] {
  const kickoff = new Map(reconciledGames(root).map((x) => [x.game.providerEventId, x.game.kickoffUtc]));
  return archivedEventIds(root).map((id) => {
    const k = kickoff.get(id);
    const t = k ? Date.parse(k) : NaN;
    return { path: `/nfl/game/${id}/`, ...(Number.isFinite(t) ? { lastModified: currentEtDate(new Date(t)) } : {}) };
  });
}

/** UFC settled bout pages: /ufc/bout/[boutId] generateStaticParams' settled half (ufcSettledBouts, the forecast ledger). */
export function ufcSettledBoutPages(): DurablePage[] {
  return ufcSettledBouts().map((b) => {
    const t = b.cardStartUtc ? Date.parse(b.cardStartUtc) : NaN;
    return { path: `/ufc/bout/${b.boutId}/`, ...(Number.isFinite(t) ? { lastModified: currentEtDate(new Date(t)) } : {}) };
  });
}

/** Every durable page source, in sitemap order. */
export const DURABLE_PAGE_SOURCES: ReadonlyArray<{ family: string; pages: () => DurablePage[] }> = [
  { family: "/games/[sport]/[gameId]", pages: () => mlbSettledGamePages() },
  { family: "/nfl/game/[eventId]", pages: () => nflArchivedGamePages() },
  { family: "/ufc/bout/[boutId]", pages: () => ufcSettledBoutPages() },
];

/** All durable pages, de-duplicated by path (first source wins). */
export function durablePages(): DurablePage[] {
  const seen = new Set<string>();
  const out: DurablePage[] = [];
  for (const s of DURABLE_PAGE_SOURCES) for (const p of s.pages()) if (!seen.has(p.path)) { seen.add(p.path); out.push(p); }
  return out;
}
