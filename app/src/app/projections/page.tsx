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
import BoardStatTile, { fmtShortDate } from "@/components/board-stat-tile";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { loadProjectionsPayload } from "@/lib/data-projections";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { getBoardForDate } from "@/lib/data";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";
import {
  loadWorldCupProjections,
  type WcProjection,
} from "@/lib/world-cup/projections";
import {
  loadWorldCupTeams,
  loadWorldCupSchedule,
} from "@/lib/data-world-cup";
import { normTeamName } from "@/lib/world-cup/market-outlook";
import WcProjectionCard from "@/components/world-cup/wc-projection-card";
import SectionHeader from "@/components/section-header";

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
  // PR 1 (2026-06-02): count ACTIONABLE projections, not raw leans. A
  // props-only board (posted lines, no projection yet) must not inflate the
  // "projections" headline — those are prop lines, not projections.
  const countFor = (sport: "nba" | "mlb") =>
    todayGames
      .filter((g) => g.sport === sport)
      .reduce(
        (acc, g) => ({ games: acc.games + 1, props: acc.props + g.actionableCount }),
        { games: 0, props: 0 },
      );
  const nba = countFor("nba");
  const mlb = countFor("mlb");
  const gamesCount = nba.games + mlb.games;

  // World Cup model projections (fail-closed: null when gates didn't pass).
  const wcProjections = loadWorldCupProjections();
  const wcTeams = loadWorldCupTeams();
  const wcSchedule = loadWorldCupSchedule();
  const wcScheduleByPair = new Map(
    wcSchedule.map((m) => [
      [normTeamName(m.home), normTeamName(m.away)].sort().join("|"),
      m,
    ]),
  );
  const wcByMatch = new Map<number, WcProjection[]>();
  if (wcProjections) {
    for (const p of wcProjections.matches) {
      const arr = wcByMatch.get(p.matchId) ?? [];
      arr.push(p);
      wcByMatch.set(p.matchId, arr);
    }
  }
  const projectionsCount = nba.props + mlb.props;
  const plural = (n: number) => (n === 1 ? "" : "s");
  // When today has projections, show the per-sport breakdown. When it
  // doesn't — the morning board run hasn't posted yet, or there are no
  // games scheduled — explain the cadence instead of a bare "0 / 0", and
  // point at the most recent slate the experience falls back to below.
  const headerNote =
    projectionsCount > 0
      ? `NBA · ${nba.games} game${plural(nba.games)} / ${nba.props} projection${plural(nba.props)}` +
        ` · MLB · ${mlb.games} game${plural(mlb.games)} / ${mlb.props} projection${plural(mlb.props)}`
      : "Today's board posts each morning once lineups and odds are set, and stays empty on days with no scheduled games. The latest actionable slate is shown below — posted lines without a model projection are labelled as prop lines, not projections.";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6" />

      {/* Premium projections-board hero — matches the Home / Parlay Lab style:
          layered gradient frame, gold top accent rule, headline + a sportsbook
          board-style scoreboard stat strip. All values are real payload counts;
          no data/model change (replaces the prior static DateStatusHeader on
          this page only — the shared component is untouched). */}
      <section
        className="relative overflow-hidden rounded-[14px]"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(240,199,94,0.09) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(11,15,31,0.96) 60%, rgba(7,11,26,0.97) 100%)",
          boxShadow: "var(--vault-shadow-elevated)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
            opacity: 0.7,
          }}
        />
        <div className="relative flex flex-col gap-5 px-5 py-6 sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2.5 lg:max-w-md">
            <span
              className="self-start font-mono uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
              style={{
                fontSize: 9,
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-border-strong)",
                background: "var(--vault-gold-dim)",
              }}
            >
              Straight bets · projections
            </span>
            <h1
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(26px, 5vw, 38px)",
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.015em",
              }}
            >
              Today&apos;s projections board.
            </h1>
            <p
              className="text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)", maxWidth: "46ch" }}
            >
              Single player-prop projections — the model&apos;s line and recent
              form per player. The parlays in Parlay Lab are built from these.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:w-[440px] shrink-0">
            <BoardStatTile
              label="Active slate"
              value={fmtShortDate(today)}
              sub="today"
              accent="var(--risk-low)"
            />
            <BoardStatTile
              label="Games"
              value={`${gamesCount}`}
              sub="scheduled"
              accent="var(--sport-mlb)"
            />
            <BoardStatTile
              label="Projections"
              value={`${projectionsCount}`}
              sub={projectionsCount > 0 ? "actionable" : "posting"}
              accent="var(--vault-gold-bright)"
            />
            <BoardStatTile
              label="Sports"
              value={`${(nba.games > 0 ? 1 : 0) + (mlb.games > 0 ? 1 : 0)}`}
              sub={
                nba.games > 0 && mlb.games > 0
                  ? "NBA · MLB"
                  : nba.games > 0
                    ? "NBA"
                    : mlb.games > 0
                      ? "MLB"
                      : "—"
              }
              accent="var(--risk-longshot)"
            />
          </div>
        </div>
        {projectionsCount === 0 && (
          <p
            className="relative px-5 sm:px-7 pb-5 -mt-1 text-[11.5px] leading-snug"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {headerNote}
          </p>
        )}
      </section>

      {/* World Cup model projections — team-level 90-minute model leans (separate
          from the NBA/MLB player-prop board below). Real data only; hidden when
          gates haven't passed. */}
      {wcProjections && wcByMatch.size > 0 && (
        <section aria-label="World Cup projections">
          <SectionHeader
            eyebrow={`World Cup · ${wcProjections.projectionCount} model picks`}
            title="World Cup model projections"
            sub="Team-level 90-minute projections (recent national-team form blended with the market). Draw is a real outcome; regulation time only. Full match outlooks live on the World Cup page."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from(wcByMatch.entries()).map(([matchId, projs]) => {
              const head = projs[0];
              const homeTeam = wcTeams.find((t) => t.name === head.homeTeam);
              const awayTeam = wcTeams.find((t) => t.name === head.awayTeam);
              const sched = wcScheduleByPair.get(
                [normTeamName(head.homeTeam), normTeamName(head.awayTeam)].sort().join("|"),
              );
              return (
                <WcProjectionCard
                  key={matchId}
                  projections={projs}
                  homeCode={homeTeam?.code ?? ""}
                  awayCode={awayTeam?.code ?? ""}
                  group={(sched?.stage === "group" ? sched?.group : sched?.stage) ?? null}
                  kickoff={sched?.kickoffLocal ?? null}
                />
              );
            })}
          </div>
          <div className="mt-3">
            <Link href="/world-cup" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              Full World Cup board →
            </Link>
          </div>
        </section>
      )}

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
        are built from these same projections. NBA and MLB have player-prop
        projections; World Cup has a live market outlook on its{" "}
        <Link href="/world-cup/" style={{ color: "var(--vault-gold-bright)" }}>
          hub
        </Link>{" "}
        (team-level model projections are under methodology review). Other leagues
        are schedule-only in{" "}
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
