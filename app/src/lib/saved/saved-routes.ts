/**
 * SAVED FORECASTS — the route manifest the destination resolver checks against (v1.1.4.1). SERVER ONLY.
 *
 * Built from the SAME owners the two routes' generateStaticParams use, so it lists pages this deploy actually
 * exports — not URLs that merely can be constructed:
 *   /games/mlb/<slug>/        buildAllGameDetails()            (gameDetailParams → current slate only)
 *   /mlb/board/<date>/        getMlbAvailableScheduleDates()   (the board page's generateStaticParams)
 * The built-export test (saved-destination-built.test.mjs) proves every entry exists in out/.
 *
 * ⚠ EXPORTED IS NOT ENOUGH. The board route is generated for every schedule date, but a date with no board data renders
 * "MLB board · date unavailable" (200, no games). The first version of the built-export guard found 12 such dates, so a
 * board date counts only under the SAME has-data rule the board page itself applies.
 *
 * Small by construction: one path per game on today's slate and one date per schedule day (~2 KB).
 */
import { buildAllGameDetails } from "@/lib/game-detail";
import { getMlbAvailableScheduleDates, getMlbBoardForDate } from "@/lib/data-mlb";

export interface SavedRouteManifest {
  mlbGamePathByPk: Record<string, string>;
  mlbBoardDates: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildSavedRouteManifest(): SavedRouteManifest {
  const mlbGamePathByPk: Record<string, string> = {};
  for (const d of buildAllGameDetails()) {
    const pk = String(d.matchId ?? "");
    if (d.sport !== "mlb" || !/^\d+$/.test(pk) || !d.slug) continue;
    // One page per gamePk: the unique slug (a doubleheader's carries the gamePk), never the ambiguous base.
    mlbGamePathByPk[pk] = `/games/mlb/${d.slug}/`;
  }
  const mlbBoardDates = getMlbAvailableScheduleDates().filter((x) => ISO_DATE.test(x) && boardHasData(x)).sort();
  return { mlbGamePathByPk, mlbBoardDates };
}

const hasData = new Map<string, boolean>();
/** The board page's own predicate (app/mlb/board/[date]/page.tsx): games, leans, or a real schedule source. */
function boardHasData(date: string): boolean {
  if (!hasData.has(date)) {
    const b = getMlbBoardForDate(date);
    hasData.set(date, (b.games?.length ?? 0) > 0 || (b.leans?.length ?? 0) > 0 || b.scheduleSource !== "unavailable");
  }
  return hasData.get(date) as boolean;
}
