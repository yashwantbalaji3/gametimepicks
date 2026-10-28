/**
 * Expired game links, emitted as a static file at build time (founder P1 2026-10-26; release owner: no archive of past
 * simulation pages — an expired link lands on the 404 tombstone plus the game's final, its forecast against the result,
 * and the results link).
 *
 * WHY A FILE AND NOT A PROP. The root not-found tree is part of every page's flight payload, so ~18 KB of index passed
 * as a 404 prop rode on every page on the site (CI measured /teams/nfl 80.7 → 98.4 KB). The 404 notices fetch this
 * literal path only when the missing URL is an NBA Game Simulation, MLB game report or UFC bout link, so every other
 * page — and every other 404 — carries none of it. The literal path is what keeps the post-build /data sweep from
 * pruning it.
 *
 * PUBLIC product data only: recorded finals and graded rows that /results already publishes (expired-games-index.ts).
 */
import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";
import { expiredSimulationMap } from "@/components/nba/expired-simulation.mjs";
import { expiredGamesIndex, expiredNbaFacts } from "@/components/expired/expired-games-index";
import { currentEtDate } from "@/lib/freshness";

export const dynamic = "force-static";

export function GET() {
  const lanes = committedLaneDates().map((date) => ({ date, games: loadLaneForDate(date)?.games ?? [] }));
  return Response.json({ nba: expiredNbaFacts(expiredSimulationMap(lanes)), ...expiredGamesIndex(currentEtDate()) });
}
