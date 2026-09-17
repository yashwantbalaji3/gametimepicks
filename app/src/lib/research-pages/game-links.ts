/**
 * RESEARCH GAME LINKS (v1.3 · §60) — SERVER / BUILD TIME ONLY.
 *
 * A research game log spans years; most of its games have no page. A link is emitted only to a destination THIS
 * deploy exports, decided from the same owners the destination routes' generateStaticParams use:
 *
 *   NFL   /nfl/game/<eventId>/                 nflPageIds() — My GameTime's copy of the /nfl/game route rule
 *   MLB   /games/mlb/<slug>/                   today's exported game page for the gamePk (Saved route manifest)
 *         /mlb/board/<ET date>/#game-<gamePk>   the dated board, only when that board LISTS the gamePk AND has leans —
 *                                              MlbBoardBody renders the per-game `id="game-<pk>"` sections only in its
 *                                              projection state; a schedule-only date has no anchors (found by RX4)
 *   EPL   /epl/match/<slug>/                   the forecast archive the match route enumerates, keyed by shipped event id
 *   UFC   /ufc/bout/<boutId>/                  the current card's bouts
 *
 * Anything else → no link (a known 404 is worse than plain text). Every emitted link is proven against out/ by
 * research-links-built.test.mjs.
 */
import { nflPageIds } from "@/lib/my/read-model";
import { buildSavedRouteManifest } from "@/lib/saved/saved-routes";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { loadEplForecastArchive } from "@/lib/sports/epl/forecast-view";
import { ufcBoutIds } from "@/lib/sports/ufc/bout";
import type { ResearchSport } from "./projection-store";

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

interface LinkTables {
  nfl: Set<string>;
  mlbGame: Record<string, string>;
  mlbBoardPks: Map<string, Set<string>>;
  mlbBoardDates: Set<string>;
  epl: Map<string, string>;
  ufc: Set<string>;
}

let tables: LinkTables | null = null;
function linkTables(): LinkTables {
  if (tables) return tables;
  const manifest = buildSavedRouteManifest();
  const epl = new Map<string, string>();
  for (const r of loadEplForecastArchive()) if (r.eventId && r.slug) epl.set(String(r.eventId), `/epl/match/${r.slug}/`);
  tables = {
    nfl: nflPageIds(),
    mlbGame: manifest.mlbGamePathByPk,
    mlbBoardPks: new Map(),
    mlbBoardDates: new Set(manifest.mlbBoardDates),
    epl,
    ufc: new Set(ufcBoutIds()),
  };
  return tables;
}

function mlbBoardHref(gamePk: string, date: string | null): string | null {
  if (!date) return null;
  // A date-only value is already the official (ET) date; an instant converts to its ET calendar date.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ET_DATE.format(new Date(date));
  const t = linkTables();
  if (!t.mlbBoardDates.has(d)) return null;
  if (!t.mlbBoardPks.has(d)) {
    const board = getMlbBoardForDate(d);
    const anchored = (board.leans?.length ?? 0) > 0 ? (board.games ?? []).map((g) => String(g.gamePk)) : [];
    t.mlbBoardPks.set(d, new Set(anchored));
  }
  return t.mlbBoardPks.get(d)!.has(gamePk) ? `/mlb/board/${d}/#game-${gamePk}` : null;
}

/** The exported destination for one game, or null. */
export function gameHref(sport: ResearchSport, gameId: string, date: string | null): string | null {
  const t = linkTables();
  switch (sport) {
    case "NFL": return t.nfl.has(gameId) ? `/nfl/game/${gameId}/` : null;
    case "MLB": return t.mlbGame[gameId] ?? mlbBoardHref(gameId, date);
    case "EPL": return t.epl.get(gameId) ?? null;
    case "UFC": return t.ufc.has(gameId) ? `/ufc/bout/${gameId}/` : null;
  }
}

/** Hrefs for a set of [gameId, date] pairs — only the ones that resolve. */
export function gameHrefs(sport: ResearchSport, games: Array<[string, string | null]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, date] of games) {
    const h = gameHref(sport, id, date);
    if (h) out[id] = h;
  }
  return out;
}
