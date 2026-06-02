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
import Link from "next/link";

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
  // unambiguous when the page loads.
  //
  // PR `fix/projections-header-count-source` (2026-05-30) — the header
  // counts now derive from the SAME payload `<ProjectionsExperience>`
  // renders from, so the "N games · M projections" headline can never
  // disagree with the game grid (and per-sport filter pills) below it.
  // Previously the header summed the RAW board leans, which include
  // team-less orphan rows the grid can't attribute to any game (e.g.
  // 55 MLB rows with a null `playerTeamAbbr`/`opponentAbbr` on the
  // 2026-05-30 slate). That made the header over-count what the user
  // could actually browse — 769 in the header vs 714 in the grid. The
  // payload's per-game `projectionCount` only counts leans that map to
  // a scheduled matchup, so summing it keeps every count honest and
  // identical to what's on screen. Pluralization is fixed in passing
  // ("1 game", not "1 games").
  const todayEntry = payload.dates.find((d) => d.date === today) ?? null;
  const todayGames = todayEntry?.games ?? [];
  const countFor = (sport: "nba" | "mlb") =>
    todayGames
      .filter((g) => g.sport === sport)
      .reduce(
        (acc, g) => ({ games: acc.games + 1, props: acc.props + g.projectionCount }),
        { games: 0, props: 0 },
      );
  const nba = countFor("nba");
  const mlb = countFor("mlb");
  const gamesCount = nba.games + mlb.games;
  const projectionsCount = nba.props + mlb.props;
  const plural = (n: number) => (n === 1 ? "" : "s");
  // When today has projections, show the per-sport breakdown. When it
  // doesn't — the morning board run hasn't posted yet, or there are no
  // games scheduled — explain the cadence instead of a bare "0 / 0", and
  // point at the most recent slate the experience falls back to below.
  const headerNote =
    projectionsCount > 0
      ? `NBA · ${nba.games} game${plural(nba.games)} / ${nba.props} props` +
        ` · MLB · ${mlb.games} game${plural(mlb.games)} / ${mlb.props} props`
      : "Today's board posts each morning once lineups and odds are set, and stays empty on days with no scheduled games. The most recent slate is shown below.";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6" />
      <DateStatusHeader
        date={today}
        label="today"
        context="Straight bets · projections"
        counts={{
          games: gamesCount,
          projections: projectionsCount,
        }}
        note={headerNote}
      />
      {/* PR `feat/projections-straight-bets-framing` (2026-06-01) — one
          plain-English line so first-time visitors know what this page
          is (single straight-bet projections, not parlays) and how to
          use it. Purely explanatory copy — no banned betting language. */}
      <p
        className="text-[13px] leading-relaxed -mt-4"
        style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}
      >
        <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>
          Straight bet recommendations
        </strong>{" "}
        — single player-prop projections, not parlays. Each game lists the
        model&apos;s projected line and edge for individual players; pick a game
        to review them. The parlays in{" "}
        <Link href="/parlay-lab/#suggested" style={{ color: "var(--vault-gold-bright)" }}>
          Parlay Lab
        </Link>{" "}
        are built from these same projections. Only NBA and MLB are modelled
        — other leagues are schedule-only in{" "}
        <Link href="/events/" style={{ color: "var(--vault-gold-bright)" }}>
          Sports &amp; Events
        </Link>
        .
      </p>
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
