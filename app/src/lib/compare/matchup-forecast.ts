/**
 * MATCHUP FORECAST COMPOSITION (v1.4 · §27 §28 §71 · C1412) — SERVER / BUILD TIME ONLY.
 *
 * A Matchup page shows the CURRENT GameTime forecast only as a separate, labelled section that LINKS to the forecast
 * owner's own report. No forecast value is copied here or into any compare artifact, nothing is regenerated, and the
 * join is by exact canonical game id:
 *
 *   NFL  the /nfl/game/<eventId> report exists (nflPageIds — the route's own rule: published live/frozen/archived
 *        forecasts). Players listed are those with a range in a PUBLISHED player-board family for that exact report
 *        (buildMyPlayerRows — ESTIMATE / WITHHELD / research families never reach it); names link to research only.
 *   MLB  the game's detail report carries a prediction whose status is not "unavailable" (detailByMatchId applies the
 *        live-record pause gate — pauseMlbMarkets — before anything reads it; MLB totals stay PAUSED).
 *
 * When no exact join exists the page renders no forecast section.
 */
import { detailByMatchId, gameHrefByMatchId } from "@/lib/game-detail";
import { buildMyPlayerRows, nflPageIds, type MyPlayerRow } from "@/lib/my/read-model";
import { researchHref } from "@/lib/research-pages/projection-store";

export interface MatchupForecastLink {
  href: string;
  label: string;
  players: Array<{ id: string; name: string; researchHref: string | null }>;
}

let nflIds: Set<string> | null = null;
let nflRows: MyPlayerRow[] | null = null;

export function matchupForecast(sport: "MLB" | "NFL", gameId: string): MatchupForecastLink | null {
  if (sport === "NFL") {
    nflIds ??= nflPageIds();
    if (!nflIds.has(gameId)) return null;
    const href = `/nfl/game/${gameId}/`;
    nflRows ??= buildMyPlayerRows();
    const seen = new Set<string>();
    const players = nflRows
      .filter((r) => r.href === href && r.markets.length > 0 && !seen.has(r.playerId) && (seen.add(r.playerId), true))
      .map((r) => ({ id: r.playerId, name: r.name, researchHref: researchHref(r.playerId) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));
    return { href, label: "Open the NFL game report", players };
  }
  return mlbForecastLink(detailByMatchId("mlb", gameId), gameHrefByMatchId("mlb", gameId));
}

/**
 * The MLB decision, pure so it is testable with an unavailable (paused) prediction — the committed slate may hold none.
 * A link only when a prediction exists and is not "unavailable" (pauseMlbMarkets has already run in detailByMatchId).
 */
export function mlbForecastLink(detail: { prediction?: { status?: string } | null } | null, href: string | null): MatchupForecastLink | null {
  if (!detail?.prediction || detail.prediction.status === "unavailable" || !href) return null;
  return { href: href.endsWith("/") ? href : `${href}/`, label: "Open the MLB game report", players: [] };
}
