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
import CricketBoardSection from "@/components/cricket-board-section";
import { loadProjectionsPayload } from "@/lib/data-projections";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { getActiveCricketBoard } from "@/lib/data-cricket";
import { getCricketContextForDate } from "@/lib/data-cricket-context";

export const metadata = {
  title: "Projections · GameTime Picks",
  description:
    "Tonight's NBA and MLB player-prop projections in one place. Pick a date, pick a game, expand a player.",
};

export default function ProjectionsPage() {
  const payload = loadProjectionsPayload();
  // Cricket runs as a separate sport surface here — projections-only,
  // never enters the parlay optimizer / custom builder / Results.
  const cricketBoard = getActiveCricketBoard();
  const cricketContext = cricketBoard
    ? getCricketContextForDate(cricketBoard.date)
    : null;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
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
      <CricketBoardSection board={cricketBoard} context={cricketContext} />
    </div>
  );
}
