/**
 * /projections — unified consumer-first projections experience.
 *
 * Server component. Loads ONE payload (every available date that has
 * at least one real lean on disk) and hands it to
 * <ProjectionsExperience />. The client component owns date/game
 * selection state and renders the four-step flow:
 *
 *   1. Compact header   — "Today's projections · N games · M projections"
 *   2. Date pill row    — horizontal scroll, mobile-first
 *   3. Game card grid   — sportsbook-style matchup cards
 *   4. Game detail view — large hero + market chips + player accordions
 *
 * Why this page is a server component:
 *   - Static export keeps SEO good (initial dates + games render on
 *     the first paint with no client fetch).
 *   - The client portion uses search-param state for deep links and
 *     accordion expansion only.
 *
 * Honest framing preserved:
 *   - We render only dates with real leans on disk; the page never
 *     advertises sports we don't currently model.
 *   - Game markets show "—" when a value is missing instead of
 *     fabricating one.
 *   - Confidence labels render via the shared `confidenceLabel`
 *     helper introduced in PR #82.
 */
import { Suspense } from "react";

import ProjectionsExperience from "@/components/projections-experience";
// Cricket components + loaders stay in the codebase but are
// intentionally NOT imported here — PR #113 unwired cricket from
// every user-facing surface.
import MarketTicker from "@/components/market-ticker";
import DateStatusHeader from "@/components/date-status-header";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { loadProjectionsPayload } from "@/lib/data-projections";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { getBoardForDate } from "@/lib/data";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";

export const metadata = {
  title: "Projections · GameTime Picks",
  description:
    "Tonight's NBA and MLB player-prop projections in one place. Pick a date, pick a game, expand a player.",
};

export default function ProjectionsPage() {
  const payload = loadProjectionsPayload();
  // PR #113: cricket fully unwired from this surface. The IPL board
  // section, context cards, and player accordion are no longer
  // rendered until cricket is intentionally re-enabled.

  // ---- Market ticker (PR #112) ------------------------------------------
  // Projections surface: lead with the live data this page is about
  // to show (NBA count, MLB games).
  const today = currentEtDate();
  const nbaBoard = getBoardForDate(today);
  const mlbBoard = getMlbBoardForDate(today);
  const tickerItems = buildMarketTickerItems({
    surface: "projections",
    nba: nbaBoard,
    mlb: mlbBoard,
  });

  // PR #124 — server-side header that anchors today's date BEFORE the
  // client `<ProjectionsExperience>` takes over. The client component
  // owns date-pill state; this header just makes the entry point
  // unambiguous when the page loads. Counts are derived from today's
  // boards (honest 0s when boards are empty).
  const nbaGames = nbaBoard?.games?.length ?? 0;
  const nbaLeans = nbaBoard?.leans?.length ?? 0;
  const mlbGames = mlbBoard?.games?.length ?? 0;
  const mlbLeans = mlbBoard?.leans?.length ?? 0;
  const projectionsCount = nbaLeans + mlbLeans;
  const headerNote =
    `NBA · ${nbaGames} games / ${nbaLeans} props` +
    ` · MLB · ${mlbGames} games / ${mlbLeans} props`;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6" />
      <DateStatusHeader
        date={today}
        label="today"
        context="Today's projections"
        counts={{
          games: nbaGames + mlbGames,
          projections: projectionsCount,
        }}
        note={headerNote}
      />
      {/* Suspense is required because <ProjectionsExperience />'s
          useSearchParams() call needs a client boundary for static
          export. The fallback is intentionally minimal — first paint
          shows the date pills + game cards from the payload directly
          since the experience component renders fully on first
          render even before hydration. */}
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        <ProjectionsExperience
          payload={payload}
          calibrationTable={loadCalibrationTable()}
        />
      </Suspense>
      {/* PR #113: <CricketBoardSection /> intentionally not rendered. */}
    </div>
  );
}
