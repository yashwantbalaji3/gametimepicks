/**
 * /mlb — MLB hub as a uniform tabbed SportShell (matches /world-cup).
 *
 * Tabs: Overview · Games · Projections · Player Props · Suggested Cards · Results · Methodology.
 * Built on the shared kit (SportShell / SuggestedCard / ProjectionCard / StatusChip /
 * StakePayoutInput) + the normalized optimizer-slip + MLB-lean adapters. The full model board
 * (every lean) stays at /mlb/board — this hub surfaces the top projections + a CTA. No fabricated
 * data; lean/game counts come from the live board summary.
 */
import Link from "next/link";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";

import {
  activeMlbDate,
  getMlbAvailableScheduleDates,
  getMlbBoardForDate,
  getMlbScheduleForDate,
  getMlbPowerForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import { getGameOutlook } from "@/lib/data-game-outlook";
import { formatTipoffEt } from "@/lib/format-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import TeamMark from "@/components/ui/team-mark";
import {
  normalizeMlbLeans,
  normalizeOptimizerSlips,
  type PublicProjection,
} from "@/lib/normalize";
import { gameHrefByMatchId, buildAllGameDetails } from "@/lib/game-detail";
import { slateGames } from "@/lib/today/slate-games";
import MlbSlateAvailability from "@/components/mlb/mlb-slate-availability";
import { getTeamMarketsForDate, buildMlbGameCenter } from "@/lib/mlb-team-markets";
import type { TeamMarketRow } from "@/components/mlb/team-markets-box";

import path from "node:path";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbFlagshipSections from "@/components/mlb/mlb-flagship-sections";
import HomerNukesBoardSection from "@/components/mlb/homer-nukes-board";
import { loadHomerNukesBoard } from "@/lib/mlb/homer-nukes-board";
import { loadRiskLadder } from "@/lib/parlays/risk-ladder";
import RiskLadderBoard from "@/components/parlays/risk-ladder-board";
import DeferUntilVisible from "@/components/defer-until-visible";
import { loadHomerNukes } from "@/lib/mlb/homer-nukes";
import { loadMlbPropsBoard, latestMlbBoardDate } from "@/lib/mlb/mlb-props";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import SimulationCoverageMatrix from "@/components/simulation-coverage-matrix";
import SportMethodologyPanel from "@/components/sport-methodology-panel";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import GameOutlookSection from "@/components/game-outlook-card";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import FreshnessBadge from "@/components/ui/freshness-badge";
import SportOverviewHero from "@/components/sport-overview-hero";
import UpcomingSlateStrip, { type UpcomingSlateDay } from "@/components/upcoming-slate-strip";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import PlayerPropsExplorer from "@/components/ui/player-props-explorer";
import StatusChip from "@/components/ui/status-chip";

export const metadata = {
  title: "MLB · GameTime Picks",
  description:
    "Educational MLB player-prop analytics — transparent model leans on pitcher strikeouts and batter markets, plus suggested paper cards. Educational, paper-only.",
};

const PROPS_PER_MARKET = 9;

function byEdge(a: PublicProjection, b: PublicProjection) {
  return Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0);
}

export default function MlbLandingPage() {
  const date = activeMlbDate() ?? currentEtDate();
  const board = getMlbBoardForDate(date);
  // The flagship sections align to the freshest ingested MODEL BOARD (activeMlbDate → mlb/boards). The old
  // resolver keyed off mlb/home-run-props — the RETIRED Homer Nukes feed — which froze the whole MLB hub on
  // that product's last date (June-28). Prefer the live board date; fall back to the retired-props resolver
  // only when no board exists, then the global slate / ET date.
  const flagshipDate = date
    ?? latestMlbBoardDate(path.join(process.cwd(), "public", "data"), currentEtDate())
    ?? currentSlateDate() ?? currentEtDate();
  const mlbProps = loadMlbPropsBoard(path.join(process.cwd(), "public", "data"), flagshipDate);
  // Game Explorer reads the schedule for the SAME flagship date so its gameIds join the props' gameIds.
  const flagshipGames = (getMlbScheduleForDate(flagshipDate).games ?? []).map((g: any) => ({
    gameId: String(g.gameId ?? ""), matchup: String(g.matchup ?? ""), home: String(g.home ?? ""), away: String(g.away ?? ""), commenceTime: g.commenceTime ?? null,
  }));
  const schedule = getMlbScheduleForDate(date);
  const mlbLifetime = getMlbLifetimeSummary();

  // ── Availability parity with /today — SAME shared contract + SAME slate pointer, so the two hubs can
  //    never disagree on what analysis is available. Compact lens only (the full board lives on /today). ──
  const mlbSlateDate = currentSlateDate() ?? currentEtDate();
  const mlbSlate = slateGames(buildAllGameDetails(), mlbSlateDate, { nowMs: Date.now() });

  const summary = board.summary;
  const propsAvailable = board.propsAvailable;
  const games = schedule.games ?? [];
  const gameCount = summary.scheduledGames || games.length || 0;
  const gameOutlook = getGameOutlook("mlb");
  const homerNukesBoard = loadHomerNukesBoard(path.join(process.cwd(), "public", "data"), date);
  const riskLadder = loadRiskLadder(path.join(process.cwd(), "public", "data"), flagshipDate);

  /*
   * TEAM MARKETS for the third column, and the simulation destination for the closing card.
   *
   * Abbreviations come from the BOARD's own homeTeamName/homeTeamAbbr pairs. The team-markets feed
   * carries full club names only, and the alternative — a name→abbr table written into the
   * component — is exactly the kind of lookup that rots silently on a rebrand. Where the board has
   * no answer the crest falls back rather than guessing.
   */
  const teamAbbrByName = new Map<string, string>();
  for (const r of (board as { leans?: { homeTeamName?: string; homeTeamAbbr?: string; awayTeamName?: string; awayTeamAbbr?: string }[] }).leans ?? []) {
    if (r.homeTeamName && r.homeTeamAbbr) teamAbbrByName.set(r.homeTeamName, r.homeTeamAbbr);
    if (r.awayTeamName && r.awayTeamAbbr) teamAbbrByName.set(r.awayTeamName, r.awayTeamAbbr);
  }
  const teamMarketRows: TeamMarketRow[] = Object.values(getTeamMarketsForDate(flagshipDate)?.games ?? {}).map((g) => {
    const gc = buildMlbGameCenter(g);
    return {
      gameId: String(g.gameId ?? ""),
      homeTeam: g.homeTeam, awayTeam: g.awayTeam,
      homeAbbr: teamAbbrByName.get(g.homeTeam) ?? null,
      awayAbbr: teamAbbrByName.get(g.awayTeam) ?? null,
      firstPitch: g.commenceTime ?? null,
      homeWinProb: gc?.moneyline?.homeWinProb ?? null,
      awayWinProb: gc?.moneyline?.awayWinProb ?? null,
      totalLine: gc?.total?.line ?? null,
      totalLean: gc?.total?.lean ?? null,
      runLine: gc?.runLine?.line ?? null,
      runLineFavorite: gc?.runLine?.favorite ?? null,
      reportHref: gameHrefByMatchId("mlb", String(g.gameId ?? "")) ?? null,
    };
  }).sort((a, b) => String(a.firstPitch ?? "").localeCompare(String(b.firstPitch ?? "")));

  /** The closing simulation card points at the richest game we actually published a sim for. */
  const featuredSimHref = mlbSlate.groups
    .find((grp) => grp.level === "simulation")?.games[0]?.href ?? "/simulate/";

  // Normalized model output.
  const leans = normalizeMlbLeans(board as Parameters<typeof normalizeMlbLeans>[0]);
  const pitcherLeans = leans.filter((l) => l.player?.position === "pitcher").sort(byEdge);
  const batterLeans = leans.filter((l) => l.player?.position !== "pitcher");
  const batterByMarket = new Map<string, PublicProjection[]>();
  for (const l of batterLeans) {
    const arr = batterByMarket.get(l.marketLabel) ?? [];
    arr.push(l);
    batterByMarket.set(l.marketLabel, arr);
  }
  const mlbCards = normalizeOptimizerSlips(getSuggestedParlaysForDate(date)?.slips ?? null, {
    sportFilter: "mlb",
    date,
  });

  /*
   * Is the slate on screen actually TODAY's? The hero already branched on this for its eyebrow, but
   * the pill, the stat label and the CTA all kept speaking in the present tense regardless. On the
   * morning of 2026-08-17, before the day's board published, this page showed the Aug 16 slate under
   * "Live · 15 games", "Games today 15" and "View today's projections" — three separate claims that
   * yesterday's finished baseball was happening now.
   */
  const isTodaysSlate = date >= currentEtDate();

  const statusKind: "live" | "settled" | "linesPending" | "upcoming" = !isTodaysSlate
    ? "settled"
    : propsAvailable && summary.leans > 0 ? "live" : gameCount > 0 ? "linesPending" : "upcoming";
  const statusCaption = gameCount > 0 ? `${gameCount} game${gameCount === 1 ? "" : "s"}` : undefined;

  const heroStats = [
    { label: isTodaysSlate ? "Games today" : "Games on this slate", value: String(gameCount), sub: date },
    { label: "Projections", value: String(summary.leans), sub: propsAvailable ? "real prop lines" : "lines pending" },
    {
      label: "Category A · Category C",
      value: `${summary.highConfidence} · ${summary.anomalies}`,
      sub: mlbLifetime?.hitRate != null ? `track record ${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive}` : "results pending",
    },
  ];

  const slateTiles =
    games.length > 0 ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {games.map((g) => {
          const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
          const tileKey = g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
          const detailHref = gameHrefByMatchId("mlb", g.gamePk) ?? `/mlb/board#${anchor}`;
          return (
            <Link
              key={tileKey}
              href={detailHref}
              className="vault-glow-hover flex items-center justify-between gap-3 rounded-[6px]"
              style={{ padding: "12px 14px", border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14, 0.55)", color: "inherit", textDecoration: "none" }}
              aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
            >
              <span className="inline-flex items-center gap-1 shrink-0" aria-hidden>
                <TeamMark name={g.awayTeamAbbr} logoUrl={mlbTeamLogoUrl(g.awayTeamId)} size="md" />
                <TeamMark name={g.homeTeamAbbr} logoUrl={mlbTeamLogoUrl(g.homeTeamId)} size="md" />
              </span>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}</span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{g.venue ?? "MLB"}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}>{formatTipoffEt(g.gameDate)}</span>
                <span aria-hidden className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 12 }}>→</span>
              </div>
            </Link>
          );
        })}
      </div>
    ) : (
      <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>The MLB Stats API will return today&apos;s games shortly.</p>
    );

  // Honest slate freshness — the board date vs the REAL today (client re-computes with the browser clock),
  // so a stale July-1 board never reads as "live today" once the wall clock passes it.
  const freshnessSlot = <FreshnessBadge slateDate={date} serverToday={currentEtDate()} noun="board" />;

  const boardCta = (
    <div className="mt-3">
      <Link href="/mlb/board" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        Open full model board →
      </Link>
    </div>
  );

  // ─────────────────────────── Tabs ───────────────────────────
  const overviewTab = (
    <div className="flex flex-col gap-8">
      <MlbSummaryStrip board={board} />
      {mlbCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Top cards · ${mlbCards.length} live`} title="Suggested paper cards" sub="Enter any stake to see the projected paper return. Paper only — not betting advice." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mlbCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      <section aria-label="Today's slate">
        <SectionHeader eyebrow={`Slate · ${date}`} title={games.length === 0 ? "Schedule warming up" : `${games.length} game${games.length === 1 ? "" : "s"} on the slate`} />
        {slateTiles}
      </section>
      {/* Availability lens — same shared contract as /today, with a bridge to the full daily board. */}
      <MlbSlateAvailability summary={mlbSlate.summary} games={mlbSlate.games} slateDate={mlbSlateDate} />
    </div>
  );

  const gamesTab = (
    <div className="flex flex-col gap-8">
      <section aria-label="Today's slate">
        <SectionHeader eyebrow={`Slate · ${date}`} title={`${games.length} game${games.length === 1 ? "" : "s"} today`} rightSlot={games.length > 0 ? <Link href="/mlb/board" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Open board →</Link> : undefined} />
        {slateTiles}
      </section>
      <GameOutlookSection outlook={gameOutlook} slateDate={date} />
      <UpcomingSlateStrip title="Upcoming · next 7 days" days={buildMlbUpcomingDays(date)} boardHrefBase="/mlb/board" emptyMessage="No upcoming MLB slates on disk yet. The next refresh will pull the rolling window." />
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Projections · ${summary.leans} model views`} title="Pitcher projections" sub="Strikeout projections from MLB Stats API game logs vs the bookmaker line. Model probability, market probability, and the difference on each. A bigger sample is weighted toward the season; the R5 anomaly guardrail caps extreme differences to Low." />
      {pitcherLeans.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pitcherLeans.slice(0, 12).map((p) => <ProjectionCard key={p.id} p={p} />)}
          </div>
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Pitcher projections appear once strikeout prop lines post for the slate.</p>
      )}
    </div>
  );

  const playerPropsTab = (
    <div className="flex flex-col gap-6">
      <SectionHeader eyebrow={`Player props · ${batterLeans.length} batter views`} title="Batter player props" sub={`Hits, total bases, and hits+runs+RBIs projected from recent + season game logs vs the line. Showing the top ${PROPS_PER_MARKET} by projection difference per market — open the full board for all ${summary.leans} projections.`} />
      {batterLeans.length > 0 ? (
        <>
          {/* Same guided explorer as fixture pages: top picks default, market tabs,
              team filter, player search, expandable last-5 drawer per row. */}
          <PlayerPropsExplorer props={batterLeans} />
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Batter player props appear once prop lines post for the slate.</p>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${mlbCards.length} live`} title="MLB suggested parlays" sub="Built by the parlay optimizer from the largest projection differences. Default paper stakes; enter any amount for the projected paper payout. Educational / paper, not betting advice." />
      {mlbCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {mlbCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No suggested cards cleared the optimizer for this slate. The probability views (Projections / Player Props) are still shown.</p>
      )}
    </div>
  );

  const resultsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Results" title="MLB track record" sub="Settled model projections and their outcomes. Full cross-sport history lives on the Results page." />
      <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusChip label={mlbLifetime?.hitRate != null ? "Settled" : "Pending settlement"} />
        <span style={{ color: "var(--vault-text)", fontSize: 13 }}>
          {mlbLifetime?.hitRate != null ? `${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive} settled decisions` : "Pending first settlement."}
        </span>
      </div>
      <QuickActionRail
        heading="More on MLB"
        cards={[
          { href: "/mlb/board", eyebrow: "Tonight", title: "Model board", sub: propsAvailable ? `${summary.leans} projections across ${gameCount} game${gameCount === 1 ? "" : "s"}.` : "Lines arriving soon — schedule live." },
          { href: "/results/mlb", eyebrow: "Results", title: "MLB results", sub: mlbLifetime?.hitRate != null ? `${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive} settled.` : "Pending first settlement." },
          { href: "/results/model-audit", eyebrow: "Performance", title: "Model performance", sub: "Per-market, per-edge, per-game dispersion." },
          { href: "/mlb/power", eyebrow: "Power", title: "Power Board", sub: "Home runs tracked separately. High-variance watch." },
        ]}
      />
    </div>
  );

  const methodologyTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Methodology" title="How MLB projections work" sub="Educational analytics — not betting advice." />
      <OverviewFooterDisclosure
        inputsLabel="MVP projection method"
        inputsBody={<>Pitcher strikeouts: 0.55 · last-3 mean + 0.45 · season mean, normal approximation. Batters: 0.5 · last-10 mean + 0.5 · season mean, with a floor on sigma. The MLB R5 anomaly guardrail caps edges above 20pp to Low confidence.</>}
        framingBody={<>Home runs live on a separate Power Board because they are higher-variance. Same responsible-use commitments across every sport.</>}
      />
      <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Full framework: <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>methodology</Link>.
      </p>
    </div>
  );

  const tabs: ShellTab[] = [
    // Games-first (June-12 sprint): users land on today's games, then drill in.
    { key: "games", label: "Games", badge: gameCount || null, content: gamesTab },
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "projections", label: "Projections", badge: pitcherLeans.length || null, content: projectionsTab },
    { key: "player-props", label: "Player Props", badge: batterLeans.length || null, content: playerPropsTab },
    { key: "cards", label: "Parlay Lab", badge: mlbCards.length || null, content: cardsTab },
    { key: "results", label: "Results", badge: null, content: resultsTab },
    { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
  ];

  return (
    <div data-sport="mlb" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      {/* Slate liveness (real ET clock) — on an MLB no-games day (e.g. the All-Star break) this says so
          plainly instead of presenting the most-recent board as live. Hidden on a live day. */}
      <div className="mb-4">
        <SlateLivenessBanner
          buildTimeToday={currentEtDate()}
          latestSlate={date}
          latestSlateHasGames={games.length > 0}
          archiveHref="/mlb/board"
          archiveLabel="Open the most recent MLB board"
          includeMlbNote
          includeWcFocus={false}
        />
      </div>

      {/* Compact identity strip. The tall shared hero — big glyph, tagline, framing paragraph and
          three stat CARDS — spent most of the first screen introducing a page the reader already
          chose, pushing the board itself below the fold. Same facts, one strip. The framing moved
          down to the methodology panel, where someone who wants it goes looking. */}
      <SportOverviewHero
        compact
        badge={<CompetitionBadge sport="mlb" size="sm" />}
        icon={getSportIdentity("mlb").icon}
        eyebrow={isTodaysSlate ? "Simulation Center" : "Simulation Center · latest slate"}
        sport="MLB"
        tagline="projections · track record · power board"
        statusKind={statusKind}
        statusCaption={statusCaption}
        matchupLine={`Slate · ${date}`}
        stats={heroStats}
        accent="mlb"
        ctas={[
          { href: "/homer-nukes", label: "Homer Nukes", primary: true },
          { href: "/mlb/board", label: !isTodaysSlate ? "Latest board" : "Full model board" },
          { href: "/results/mlb", label: "Results" },
        ]}
      />


      {/* Honest slate freshness — always visible (the tabbed board below is deferred/client-rendered). */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>MLB board</span>
        {freshnessSlot}
      </div>

      {/*
       * HOMER NUKES LEADS. The model's own read comes before the market's.
       *
       * Until now the top of this hub was "Today's featured MLB plays" — the sportsbook's shortest
       * prices, sorted. Whatever else is true of our model, the page should open with something we
       * actually computed. This board is the only surface on /mlb carrying a probability the model
       * produced end-to-end rather than de-vigged off a posted price.
       */}
      {/* The board is rendered INSIDE MlbFlagshipSections now, so it leads the same grid the three
          market columns sit in rather than floating above an unrelated block. */}
      <div className="mt-4">
        <MlbFlagshipSections
          props={mlbProps}
          games={flagshipGames}
          teamRows={teamMarketRows}
          homerBoard={homerNukesBoard}
          simHref={featuredSimHref}
        />
      </div>

      {/* The risk ladder — "give me today's card at each risk level", which is the question the
          18-card Suggested Cards tab never answered directly. Every tier ships with its own
          measured record because every tier of this stream is negative. */}
      {riskLadder ? (
        <div className="mt-8">
          <RiskLadderBoard
            cards={riskLadder.cards}
            skipped={riskLadder.skipped}
            overallRoi={riskLadder.record.overall.roi}
            gradedDays={riskLadder.record.gradedDays}
          />
        </div>
      ) : null}

      {/* Simulation methodology + honest per-market coverage — how the MLB sim works and every gap. */}
      <div className="mt-8 flex flex-col gap-6">
        <SportMethodologyPanel sport="mlb" />
        <SimulationCoverageMatrix sport="mlb" />
      </div>

      {/* Legacy sport shell (Overview / Projections / Player Props / Results …) is heavy and below the
          fold — defer its render until the reader scrolls toward it so the flagship sections stay fast. */}
      <div className="mt-6">
        <DeferUntilVisible minHeight={520} label="Loading full MLB board…">
          <SportShell tabs={tabs} />
        </DeferUntilVisible>
      </div>
    </div>
  );
}

function buildMlbUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getMlbAvailableScheduleDates();
  if (allDates.length === 0) return [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const forward = allDates.filter((d) => d >= today).slice(0, 8);
  return forward.map((d) => {
    /*
     * THE SLATE COMES FROM THE StatsAPI-DERIVED ARTIFACT, NOT THE ODDS FEED.
     *
     * Two bugs met here. This read `schedule/<date>.json`, whose games carry `home` / `away` full
     * names — not the `homeTeamAbbr` / `awayTeamAbbr` this code asked for — so every tile rendered
     * a literal "? @ ?" with the count beside it. And that file is built from the provider's EVENTS
     * feed, which only lists games with odds posted: on 2026-08-17 it held 9 while the board held
     * 11, so the same page showed two different sizes for the same slate.
     *
     * The power artifact is the official schedule (gamePk, both abbreviations, venue, probable
     * pitchers) and agrees with the board. One source, correct names, honest count.
     */
    const power = getMlbPowerForDate(d);
    const board = getMlbBoardForDate(d);
    const games = power.games ?? [];
    const propsLive = board.propsAvailable && (board.leans?.length ?? 0) > 0;
    const status: UpcomingSlateDay["status"] = games.length === 0 ? "off-day" : propsLive ? "live" : "pending";
    const label = (g: (typeof games)[number] | undefined) =>
      g?.awayTeamAbbr && g?.homeTeamAbbr ? `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}` : null;
    const first = label(games[0]);
    const teaser =
      games.length === 0 ? "No games scheduled"
      : games.length === 1 ? (first ?? "1 game")
      // Never "? @ ?": when the matchup cannot be named, say the count and nothing more.
      : first ? `${games.length} games · ${first} +${games.length - 1} more`
      : `${games.length} games`;
    return { date: d, gameCount: games.length, label: shortDateLabel(d), teaser, status };
  });
}

function shortDateLabel(date: string): string {
  try {
    const dt = new Date(`${date}T17:00:00Z`);
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).replace(",", " ·");
  } catch {
    return date;
  }
}
