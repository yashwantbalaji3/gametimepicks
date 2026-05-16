import Link from "next/link";
import {
  getBoard,
  getBoardForDate,
  getLifetimeSummary,
  getMeta,
  getSlate,
  getAvailableBoardDates,
} from "@/lib/data";
import { formatPercent } from "@/lib/format";
import type { DataMode, BoardData, PropLean } from "@/lib/types";
import NewsletterSignup from "@/components/newsletter-signup";
import HomepageTrendingTabs, {
  type TrendingLean,
  type TrendingGame,
} from "@/components/homepage-trending-tabs";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import SportsbookStatusBoard, {
  type StatusBoardGame,
  type StatusBoardStat,
} from "@/components/sportsbook-status-board";
import OddsTickerRail, {
  type TickerCell,
} from "@/components/odds-ticker-rail";
import NeonStatPanel from "@/components/neon-stat-panel";
import VegasSectionShell from "@/components/vegas-section-shell";
import AnatomyCallout from "@/components/anatomy-callout";
import { currentEtDate, dayLabelFor } from "@/lib/freshness";
import { selectActiveSlate } from "@/lib/active-slate";

export default function HomePage() {
  const board = getBoard();
  // Phase 11: replaced the legacy `getHitRates()` (demo-data path) with
  // `getLifetimeSummary()` which reads real settled-data aggregates from
  // `app/public/data/results/lifetime_summary.json`. Returns null when
  // nothing has been settled yet — the UI then shows honest "—" tiles
  // with a "no settled data yet" sub instead of misleading demo numbers.
  const lifetime = getLifetimeSummary();
  const meta = getMeta();
  const slate = getSlate();

  // Phase 15: pick today's actual game count using the active-slate
  // selector. The pipeline-stamped `isPrimary` is unreliable when the
  // slate is stale — it points at whichever date the pipeline last ran
  // for, which may be days in the past. Use real today and fall back
  // gracefully to whatever upcoming/today date actually has games.
  const buildTimeToday = currentEtDate();
  const allBoardDates = slate.days.map((d) => d.date);
  const slateBoardsByDate: Record<string, BoardData> = {};
  for (const d of slate.days) {
    slateBoardsByDate[d.date] = getBoardForDate(d.date);
  }
  const activeHomeSlate = selectActiveSlate(
    allBoardDates,
    buildTimeToday,
    slateBoardsByDate,
  );

  // The "today" day for hero copy. If active is "today", use today's
  // SlateDay. If active is "upcoming", use the upcoming SlateDay. If
  // active is "no_current" or "no_data", fall through to honest empty
  // state copy below.
  const activeDate = activeHomeSlate.selectedDate;
  const todayDay = activeDate
    ? slate.days.find((d) => d.date === activeDate)
    : undefined;
  const todayMode: DataMode =
    (todayDay?.dataMode as DataMode) ||
    (board.dataMode as DataMode) ||
    "ScheduleUnavailable";

  // "Next game day" pointer: the next upcoming date AFTER the active
  // one that actually has games. Used in copy like "next slate tomorrow".
  const nextGameDay = activeHomeSlate.upcomingAndTodayDates
    .filter((d) => d !== activeDate)
    .map((d) => slate.days.find((sd) => sd.date === d))
    .find((sd) => (sd?.gameCount ?? 0) > 0);

  // Honest game counts. Only count games for the ACTIVE slate's day.
  // When no current slate exists, todayGames is 0 — and the copy
  // below will say "no current slate" rather than "0 games today".
  const todayGames = todayDay?.gameCount ?? 0;
  const isDemoMode = todayMode === "DemoForced";
  const isUnavailable = todayMode === "ScheduleUnavailable";
  const noCurrentSlate =
    activeHomeSlate.kind === "no_current" || activeHomeSlate.kind === "no_data";

  // Eyebrow string — Phase 15: honest "no current slate" when active is
  // neither today nor upcoming.
  // Off-day promotion: when today has no games AND nextGameDay has loaded
  // projections, switch the eyebrow to a forward-looking "next up" line
  // so visitors land on a useful pointer instead of "refreshing slate".
  const nextGameDayHasProjections =
    (nextGameDay?.leanCount ?? 0) > 0;
  const isOffDayWithNextSlate =
    !noCurrentSlate &&
    todayGames === 0 &&
    (todayMode === "NoGames" || todayMode === "ScheduleUnavailable") &&
    nextGameDayHasProjections;
  const eyebrow = noCurrentSlate
    ? "no current slate · awaiting next refresh"
    : isOffDayWithNextSlate && nextGameDay
      ? `no games today · next up ${nextGameDay.dayLabel.toLowerCase()} · projections live`
      : eyebrowForMode(
          todayMode,
          todayDay?.dayLabel ?? "Today",
          todayGames,
          slate.slateDays,
          nextGameDay,
        );

  // For board lean counts on the home page hero KPIs: only count leans
  // from the active slate's board, not the stale top-level board.json.
  const activeBoard: BoardData | undefined = activeDate
    ? slateBoardsByDate[activeDate]
    : undefined;
  const activeLeans = activeBoard?.leans ?? [];
  const leansToday = activeLeans.filter((l) => l.lean !== "No Play").length;
  const highConfidence = activeLeans.filter(
    (l) => l.lean !== "No Play" && l.confidence === "High",
  ).length;

  // For real-mode + no odds, KPI tiles label leans as "—" instead of zero
  // to communicate "props unavailable" rather than "no leans found".
  const showLeanTiles = !(
    todayMode === "ScheduleLiveOddsUnavailable" ||
    todayMode === "NoGames" ||
    todayMode === "ScheduleUnavailable"
  );

  // CTA button text per mode
  const ctaText = ctaForMode(todayMode);

  // PR B — Trending data prep.
  //
  // Find the latest board that has actually-scored leans (projection +
  // edge present). On an off-day this lets the homepage point to real
  // scored data instead of an empty "today" tile.
  // If the slate set didn't include the latest scored board (e.g. it's
  // older than the slate window), fall back to disk dates so we still
  // surface a real scored archive on off-days.
  const latestScoredHit =
    findLatestScoredBoard(slateBoardsByDate) ?? findLatestScoredBoardOnDisk();
  const latestScoredFinalDate = latestScoredHit?.date ?? null;
  const latestScoredFinalBoard = latestScoredHit?.board ?? null;

  const latestScoredLeans: PropLean[] = latestScoredFinalBoard?.leans ?? [];
  const latestScoredLeanCount = latestScoredLeans.length;
  const latestScoredHighCount = latestScoredLeans.filter(
    (l) => l.confidence === "High",
  ).length;
  const latestScoredMatchup = matchupForBoard(latestScoredFinalBoard);
  const latestScoredDayLabel = latestScoredFinalDate
    ? dayLabelFor(latestScoredFinalDate, buildTimeToday)
    : null;

  // Iteration 4: dedupe by (player + market) so two books quoting the
  // same prop don't render twice in the trending lists. Keep the best
  // edge per pair.
  const dedupeByPlayerMarket = (
    rows: TrendingLean[],
  ): TrendingLean[] => {
    const best = new Map<string, TrendingLean>();
    for (const r of rows) {
      const key = `${r.playerName}|${r.market}`;
      const cur = best.get(key);
      const curEdge = Math.abs(cur?.edgePct ?? 0);
      const nextEdge = Math.abs(r.edgePct ?? 0);
      if (!cur || nextEdge > curEdge) best.set(key, r);
    }
    return Array.from(best.values());
  };

  // Strongest clean projections — exclude suspicious_edge anomalies.
  const cleanProjections: TrendingLean[] = dedupeByPlayerMarket(
    latestScoredLeans.filter((l) => isClean(l)).map(toTrendingLean),
  )
    .sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))
    .slice(0, 6);

  // Anomaly watchlist — R5 suspicious_edge flagged leans.
  const anomalyWatchlist: TrendingLean[] = dedupeByPlayerMarket(
    latestScoredLeans
      .filter((l) => (l.riskFlags ?? []).includes("suspicious_edge"))
      .map(toTrendingLean),
  )
    .sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))
    .slice(0, 4);

  // Upcoming slate — next future date with games > 0 after today.
  const upcoming = slate.days
    .filter((d) => d.date > buildTimeToday && (d.gameCount ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const upcomingDate = upcoming?.date ?? null;
  const upcomingDayLabel = upcoming
    ? dayLabelFor(upcoming.date, buildTimeToday)
    : null;
  const upcomingGames: TrendingGame[] = upcoming
    ? (slateBoardsByDate[upcoming.date]?.games ?? []).map((g) => ({
        gameId: g.gameId,
        awayTeamAbbr: g.awayTeamAbbr,
        homeTeamAbbr: g.homeTeamAbbr,
        tipoff: g.tipoff,
      }))
    : [];

  // Primary hero CTA — when today's slate is empty/refresh-pending but a
  // real scored archive exists, route to that archive instead of /board's
  // empty state.
  const ctaHref =
    (todayMode === "ScheduleUnavailable" ||
      todayMode === "NoGames" ||
      noCurrentSlate) &&
    latestScoredFinalDate
      ? `/board?date=${latestScoredFinalDate}`
      : "/board";
  const heroCtaText =
    (todayMode === "ScheduleUnavailable" ||
      todayMode === "NoGames" ||
      noCurrentSlate) &&
    latestScoredFinalDate
      ? "View latest scored board"
      : ctaText;

  // ---------------------------------------------------------------------
  // Iteration 2 — Sportsbook status board + ticker data prep.
  //
  // The hero now has a right-side "status board" panel that composes
  // the already-loaded latest scored slate into LED-style rows. Every
  // number is sourced from the data already in scope; no fabrication.
  // ---------------------------------------------------------------------
  const statusBoardGames: StatusBoardGame[] = latestScoredFinalBoard
    ? (latestScoredFinalBoard.games ?? []).slice(0, 4).map((g) => ({
        gameId: g.gameId,
        awayTeamAbbr: g.awayTeamAbbr,
        homeTeamAbbr: g.homeTeamAbbr,
        tipoff: g.tipoff,
      }))
    : [];

  const statusBoardAnomalyCount = latestScoredLeans.filter((l) =>
    (l.riskFlags ?? []).includes("suspicious_edge"),
  ).length;

  const statusBoardStats: StatusBoardStat[] = latestScoredFinalDate
    ? [
        {
          label: "Projections",
          value: String(latestScoredLeanCount),
          accent: "gold",
        },
        {
          label: "High confidence",
          value: String(latestScoredHighCount),
          accent: "gold",
        },
        {
          label: "Model anomalies",
          value: String(statusBoardAnomalyCount),
          accent: statusBoardAnomalyCount > 0 ? "warn" : "mute",
        },
      ]
    : [];

  // Anatomy callout — pick a real loaded High-clean star lean from the
  // latest scored slate so the "Anatomy of a projection" diagram
  // annotates real data, not synthetic. Falls back to the strongest
  // clean lean if no star matches.
  const anatomyStarOrder = [
    "Victor Wembanyama",
    "Anthony Edwards",
    "Donovan Mitchell",
    "Cade Cunningham",
    "Evan Mobley",
    "Jarrett Allen",
    "De'Aaron Fox",
    "Stephon Castle",
    "James Harden",
  ];
  const anatomyCandidates = latestScoredLeans.filter(
    (l) =>
      l.confidence === "High" &&
      isClean(l) &&
      typeof l.projection === "number" &&
      typeof l.line === "number" &&
      typeof l.edgePct === "number",
  );
  const anatomyLean =
    anatomyStarOrder
      .map((name) => anatomyCandidates.find((l) => l.playerName === name))
      .find((l) => !!l) ??
    anatomyCandidates.sort(
      (a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0),
    )[0];

  // Ticker — top 8 strongest leans across clean + anomaly (deduped),
  // sorted by abs edge desc. Used by the homepage ticker rail.
  const tickerCells: TickerCell[] = latestScoredFinalDate
    ? [
        ...cleanProjections.map((l) => ({
          playerName: l.playerName,
          market: l.market,
          side: l.side,
          line: l.line,
          edgePct: l.edgePct,
          flagged: false,
        })),
        ...anomalyWatchlist.map((l) => ({
          playerName: l.playerName,
          market: l.market,
          side: l.side,
          line: l.line,
          edgePct: l.edgePct,
          flagged: true,
        })),
      ]
        .sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))
        .slice(0, 10)
    : [];

  return (
    <div className="vault-page-shell px-6 sm:px-8 py-14 md:py-24">
      {/* Hero — PR makeover: layered vault-data-orbit + vault-ambient-orbit
          backdrops for richer "model lab" storytelling. Larger display
          typography ramp via vault-display-h1. PR brand-polish: framed
          with neon corner brackets + a soft scanline overlay so the hero
          reads as a sportsbook-lounge centerpiece, not a plain section. */}
      <section className="reveal vault-data-orbit vault-ambient-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-6 sm:-mx-8 px-6 sm:px-8 pt-6 pb-2">
        <NeonCornerBracket />

        {/* Two-column hero: copy + CTAs on the left, sportsbook status
            board on the right. On mobile/tablet they stack with the
            status board appearing below the CTAs. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-10 items-start">
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <span className="live-dot vault-pulse" />
              <span
                className="vault-quiet-label"
                style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
              >
                {eyebrow}
              </span>
            </div>
            <h1
              className="vault-display-h1 max-w-4xl"
              style={{ color: "var(--vault-text)" }}
            >
              Transparent model leans on{" "}
              <span style={{ color: "var(--vault-gold-bright)" }}>
                NBA player props.
              </span>
            </h1>
            <p
              className="mt-6 text-[16px] md:text-[18px] max-w-2xl leading-relaxed"
              style={{ color: "var(--vault-text-mute)" }}
            >
              GametimePicks compares model projections against sportsbook
              lines, surfaces edges with explanations, and tracks every
              result publicly. Educational analytics — not betting advice.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={ctaHref} className="gtp-cta-primary">
                <span>{heroCtaText}</span>
                <span aria-hidden>→</span>
              </Link>
              <Link href="/parlay-lab" className="gtp-cta-ghost">
                Open Parlay Lab
              </Link>
              <Link
                href="/methodology"
                className="font-mono text-[12px] tracking-tight transition-colors px-2"
                style={{ color: "var(--vault-text-mute)" }}
              >
                how the model works →
              </Link>
            </div>

            {/* State-specific callouts */}
            {todayMode === "ScheduleLiveOddsUnavailable" && (
              <ScheduleLiveCallout
                todayGames={todayGames}
                primaryLabel={todayDay?.dayLabel ?? "Today"}
                manualOverride={!!meta.todayManualOverrideUsed}
              />
            )}
            {todayMode === "NoGames" && nextGameDay && (
              <NoGamesCallout next={nextGameDay} />
            )}
            {isUnavailable && (
              <ScheduleUnavailableCallout reason={meta.todayFailureReason} />
            )}
          </div>

          {/* Sportsbook status board — composes real slate data into an
              LED-style panel. Falls back to a quieter "model lab idle"
              treatment when no scored slate exists. */}
          <div className="reveal reveal-d2">
            {latestScoredFinalDate ? (
              <SportsbookStatusBoard
                eyebrow={`${latestScoredDayLabel ?? "Latest"} slate · scored`}
                headline={
                  latestScoredMatchup
                    ? `${latestScoredMatchup}`
                    : `${statusBoardGames.length} NBA game${statusBoardGames.length === 1 ? "" : "s"}`
                }
                sub={`${latestScoredLeanCount} projections · ${latestScoredHighCount} High confidence`}
                games={statusBoardGames}
                stats={statusBoardStats}
                footnote="Guardrails active · educational only"
                ctaHref={`/board?date=${latestScoredFinalDate}`}
                ctaLabel="Open the wall"
              />
            ) : (
              <SportsbookStatusBoard
                eyebrow="Model lab · idle"
                headline="No scored slate loaded"
                sub="Projections will land here once the next scheduled refresh completes."
                steady
                footnote="Educational analytics · not betting advice"
                ctaHref="/methodology"
                ctaLabel="How the model works"
              />
            )}
          </div>
        </div>
      </section>

      {/* Live ticker rail — strongest model projections from the latest
          scored slate, marquee-scrolled. Rendered only when there's
          actually a scored slate; on cold deploys the rail is hidden. */}
      {tickerCells.length > 0 && (
        <div className="mt-12 reveal reveal-d2 -mx-6 sm:-mx-8">
          <OddsTickerRail
            cells={tickerCells}
            eyebrow={`${latestScoredDayLabel ?? "Latest"} · top edges`}
          />
        </div>
      )}

      {/* KPI strip — replaced flat KpiTile with NeonStatPanel so the
          numbers read as a premium scoreboard, not debug output. Tiles
          1 and 2 surface the latest scored slate on off-days; tiles 3
          and 4 always show real settled aggregates. */}
      <section className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label={
            isDemoMode
              ? "Leans in sample"
              : showLeanTiles
                ? "Leans today"
                : "Latest slate · leans"
          }
          value={
            showLeanTiles
              ? String(leansToday)
              : latestScoredFinalDate
                ? String(latestScoredLeanCount)
                : "—"
          }
          valueAccent="gold"
          sub={
            !showLeanTiles
              ? latestScoredFinalDate
                ? `${latestScoredDayLabel ?? latestScoredFinalDate}${
                    latestScoredMatchup ? ` · ${latestScoredMatchup}` : ""
                  }`
                : "Awaiting model leans"
              : isDemoMode
                ? "Demo data"
                : undefined
          }
          delay={1}
        />
        <NeonStatPanel
          label={
            isDemoMode
              ? "High-conf in sample"
              : showLeanTiles
                ? "High confidence"
                : "Latest slate · high conf"
          }
          value={
            showLeanTiles
              ? String(highConfidence)
              : latestScoredFinalDate
                ? String(latestScoredHighCount)
                : "—"
          }
          valueAccent="gold"
          sub={
            !showLeanTiles && latestScoredFinalDate
              ? `${latestScoredDayLabel ?? latestScoredFinalDate}`
              : !showLeanTiles
                ? "Awaiting model leans"
                : undefined
          }
          delay={2}
        />
        <NeonStatPanel
          label="Settled hit rate"
          value={
            lifetime && typeof lifetime.hitRate === "number"
              ? formatPercent(lifetime.hitRate)
              : "—"
          }
          valueAccent={
            lifetime && typeof lifetime.hitRate === "number" ? "default" : "mute"
          }
          sub={
            lifetime
              ? `${lifetime.decisive} decisive · ${lifetime.totalDates} slate${lifetime.totalDates === 1 ? "" : "s"}${lifetime.smallSample ? " · small sample" : ""}`
              : "No settled slates yet"
          }
          delay={3}
        />
        <NeonStatPanel
          label="Settled wins / losses"
          value={
            lifetime
              ? `${lifetime.wins} / ${lifetime.losses}`
              : "—"
          }
          valueAccent={lifetime ? "default" : "mute"}
          sub={
            lifetime
              ? lifetime.pushes > 0
                ? `${lifetime.pushes} push${lifetime.pushes === 1 ? "" : "es"}`
                : "No pushes settled"
              : "No settled data"
          }
          delay={4}
        />
      </section>

      {/* PR B — Trending tabs: projections / parlays / upcoming slate.
          All data precomputed above; client component only owns tab
          state and renders presentation. */}
      <HomepageTrendingTabs
        latestScoredDate={latestScoredFinalDate}
        latestScoredDayLabel={latestScoredDayLabel}
        latestScoredMatchup={latestScoredMatchup}
        latestScoredLeanCount={latestScoredLeanCount}
        cleanProjections={cleanProjections}
        anomalyWatchlist={anomalyWatchlist}
        upcomingDate={upcomingDate}
        upcomingDayLabel={upcomingDayLabel}
        upcomingGames={upcomingGames}
      />

      {/* PR — "What's on the floor" feature tiles. Routes the user to
          the four main destinations with one-line descriptions, using
          only data already loaded above. Anomaly count and star count
          ride along when available. */}
      <section className="mt-20 reveal">
        <div className="flex items-center gap-3 mb-5">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            What&apos;s on the floor
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <FeatureTile
            label="01"
            title="Star spotlight"
            body="Headliner rail surfaces the biggest names on the slate. One click jumps to their full projection card."
            href={
              latestScoredFinalDate
                ? `/board?date=${latestScoredFinalDate}`
                : "/board"
            }
            cta="View the board"
            badge={
              latestScoredLeanCount > 0
                ? `${latestScoredLeanCount} loaded`
                : undefined
            }
          />
          <FeatureTile
            label="02"
            title="Model anomaly guardrails"
            body="Edges above 25% are auto-capped to Low confidence with an audit stamp. No card on the wall overstates the model's confidence."
            href="/methodology"
            cta="Read methodology"
            badge={
              latestScoredFinalBoard
                ? `${(latestScoredFinalBoard.leans ?? []).filter((l) =>
                    (l.riskFlags ?? []).includes("suspicious_edge"),
                  ).length} stamped`
                : undefined
            }
            tone="warn"
          />
          <FeatureTile
            label="03"
            title="Parlay Lab"
            body="Build candidate parlays from real model leans, or analyze a slip you already have. Same-game legs are flagged."
            href="/parlay-lab"
            cta="Open the console"
          />
          <FeatureTile
            label="04"
            title="Results calibration"
            body="Every settled lean lands here — hit rate, projection error, confidence calibration. Honest until graded."
            href="/results"
            cta="Calibration room"
          />
        </div>
      </section>

      {/* Anatomy callout — labelled diagram pinned to a real loaded star
          lean so users can read the structure of a card before they jump
          to the board. Skipped on cold deploys when no scored slate
          exists. */}
      {anatomyLean && latestScoredFinalDate && (
        <AnatomyCallout
          playerName={anatomyLean.playerName ?? ""}
          playerId={anatomyLean.playerId ?? undefined}
          gameId={anatomyLean.gameId ?? undefined}
          awayTeamAbbr={
            anatomyLean.homeAway === "Home"
              ? anatomyLean.opponent ?? undefined
              : anatomyLean.team ?? undefined
          }
          homeTeamAbbr={
            anatomyLean.homeAway === "Home"
              ? anatomyLean.team ?? undefined
              : anatomyLean.opponent ?? undefined
          }
          team={anatomyLean.team ?? undefined}
          matchup={`${anatomyLean.team ?? ""} ${
            anatomyLean.homeAway === "Home" ? "vs" : "at"
          } ${anatomyLean.opponent ?? ""}`}
          market={anatomyLean.market ?? ""}
          side={anatomyLean.lean ?? ""}
          line={(anatomyLean.line as number) ?? 0}
          projection={(anatomyLean.projection as number) ?? 0}
          edgePct={(anatomyLean.edgePct as number) ?? 0}
          confidence={anatomyLean.confidence ?? ""}
          anomaly={(anatomyLean.riskFlags ?? []).includes("suspicious_edge")}
          cardAnchorHref={`/board?date=${latestScoredFinalDate}`}
        />
      )}

      {/* Three-up explainer — wrapped in the new VegasSectionShell so it
          reads as a panelled "how it works" board rather than three free
          cards floating on dark. */}
      <div className="mt-20">
        <VegasSectionShell
          eyebrow="House rules · how it works"
          heading="From line to lean in three steps"
          sub="Every projection on the wall comes through this same pipeline — no black boxes, no hidden weighting."
          staticDot
          action={
            <Link
              href="/methodology"
              className="font-mono tracking-tight transition-colors"
              style={{ color: "var(--vault-gold)", fontSize: 12 }}
            >
              read full methodology →
            </Link>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ExplainerCard
              n="01"
              title="Compare projection to line"
              body="For each NBA player prop, the model produces a projected stat value and over/under probability. We pull the sportsbook line and convert the odds to an implied probability."
              delay={1}
            />
            <ExplainerCard
              n="02"
              title="Quantify the edge"
              body="Edge = model probability minus implied probability. Positive edge means the model thinks the market is mispricing the prop. We surface only edges that clear a transparent threshold."
              delay={2}
            />
            <ExplainerCard
              n="03"
              title="Track every result"
              body="Every lean is logged before tipoff and settled after the box score. Hit rate, calibration, and breakdown by market and confidence tier are all public."
              delay={3}
            />
          </div>
        </VegasSectionShell>
      </div>

      {/* MLB cross-sport entry — sport-categorized UI per the MLB roadmap.
          Keeps NBA content above untouched; MLB lives in its own section. */}
      <section className="mt-16 reveal" aria-label="MLB section">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 8px rgba(240, 199, 94, 0.55)",
              }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)" }}
            >
              MLB · now live in beta
            </span>
          </div>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            transparent by design
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/mlb" className="gtp-aurora-halo block vault-glow-hover">
            <div className="gtp-status-board p-5 h-full">
              <div
                className="font-mono uppercase tracking-[0.14em] mb-2"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                MLB command center
              </div>
              <h3
                className="font-display font-semibold tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.2 }}
              >
                Open the MLB hub
              </h3>
              <p
                className="mt-2 text-[12px] leading-relaxed"
                style={{ color: "var(--vault-text-mute)" }}
              >
                Today's MLB slate, projections summary, and entry points to the
                main board and the Power Board.
              </p>
            </div>
          </Link>
          <Link href="/mlb/board" className="gtp-aurora-halo block vault-glow-hover">
            <div className="gtp-status-board p-5 h-full">
              <div
                className="font-mono uppercase tracking-[0.14em] mb-2"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                MLB main board
              </div>
              <h3
                className="font-display font-semibold tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.2 }}
              >
                Strikeouts · hits · total bases
              </h3>
              <p
                className="mt-2 text-[12px] leading-relaxed"
                style={{ color: "var(--vault-text-mute)" }}
              >
                Pitcher and batter projections with the same R5 guardrails the
                NBA model uses. Home runs intentionally excluded.
              </p>
            </div>
          </Link>
          <Link href="/mlb/power" className="gtp-aurora-halo block vault-glow-hover">
            <div className="gtp-status-board p-5 h-full">
              <div
                className="font-mono uppercase tracking-[0.14em] mb-2"
                style={{ color: "var(--vault-warn)", fontSize: 10 }}
              >
                MLB Power Board · HR watch
              </div>
              <h3
                className="font-display font-semibold tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.2 }}
              >
                Home runs · separate variance profile
              </h3>
              <p
                className="mt-2 text-[12px] leading-relaxed"
                style={{ color: "var(--vault-text-mute)" }}
              >
                Power-profile ratings, not confidence tiers. Pending inputs
                today — shell is up so the slate is visible.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* CTA band — marquee panel pointing users into the two primary
          surfaces (board + parlay lab). Sits between the explainer and
          the newsletter signup so the homepage never dead-ends. */}
      <section className="mt-16 reveal">
        <div className="gtp-cta-band">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
                }}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--vault-gold)" }}
              >
                tonight on the model wall
              </span>
            </div>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              educational analytics
            </span>
          </div>
          <h2
            className="font-display font-semibold tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(22px, 3.2vw, 30px)",
              lineHeight: 1.15,
              maxWidth: 720,
            }}
          >
            Step onto the floor.{" "}
            <span style={{ color: "var(--vault-gold-bright)" }}>
              {latestScoredLeanCount > 0
                ? `${latestScoredLeanCount} projections`
                : "Live projections"}
            </span>{" "}
            are queued and the model has graded every one of them.
          </h2>
          <p
            className="mt-3 text-[14px] leading-relaxed max-w-2xl"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Browse the full board, or hand the model your slate and let it
            compose model-assisted candidate parlays you can sanity-check.
            Nothing here is a recommendation — every number is graded and
            every guardrail is stamped on the card.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={ctaHref} className="gtp-cta-primary">
              <span>{heroCtaText}</span>
              <span aria-hidden>→</span>
            </Link>
            <Link href="/parlay-lab" className="gtp-cta-ghost">
              Build a candidate parlay
            </Link>
            <Link
              href="/results"
              className="font-mono text-[12px] tracking-tight px-2"
              style={{ color: "var(--vault-gold)" }}
            >
              calibration room →
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter signup — Phase 13 */}
      <section className="mt-16 reveal">
        <NewsletterSignup variant="full" />
      </section>

      {/* Demo banner — only when DemoForced */}
      {isDemoMode && (
        <section className="mt-16 surface px-6 py-5 reveal">
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-[var(--vault-warn)] font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[var(--vault-warn-dim)]">
              demo sample
            </div>
            <div className="flex-1 min-w-[280px] text-[13px] text-[var(--text-mute)] leading-relaxed">
              This deployment is showing a representative sample slate
              instead of live data. Real props and projections appear when
              the live data sources are active.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State-specific callouts and copy
// ---------------------------------------------------------------------------
function eyebrowForMode(
  mode: DataMode,
  dayLabel: string,
  todayGames: number,
  slateDays: number,
  nextGameDay: { dayLabel: string } | undefined,
): string {
  switch (mode) {
    case "Live":
      return `${todayGames} NBA game${todayGames === 1 ? "" : "s"} today · ${slateDays}-day slate`;
    case "ScheduleLiveOddsUnavailable":
      return `${todayGames} NBA game${todayGames === 1 ? "" : "s"} tonight · awaiting model leans`;
    case "NoGames":
      return nextGameDay
        ? `no games today · next slate ${nextGameDay.dayLabel.toLowerCase()}`
        : "no games in 4-day window";
    case "ScheduleUnavailable":
      return "refreshing the slate · check back shortly";
    case "DemoForced":
      return "demo sample · representative slate";
    default:
      return "slate unavailable";
  }
}

function ctaForMode(mode: DataMode): string {
  switch (mode) {
    case "Live":
      return "View today's board";
    case "ScheduleLiveOddsUnavailable":
      return "View today's schedule";
    case "NoGames":
      return "View 4-day slate";
    case "ScheduleUnavailable":
      return "View status";
    case "DemoForced":
      return "View the demo board";
    default:
      return "View board";
  }
}

function ScheduleLiveCallout({
  todayGames,
  primaryLabel,
}: {
  todayGames: number;
  primaryLabel: string;
  /** Preserved on the type for caller compatibility; not rendered publicly. */
  manualOverride?: boolean;
}) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--vault-gold)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {primaryLabel.toLowerCase()} · schedule live
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        {todayGames} NBA game{todayGames === 1 ? "" : "s"} on the schedule.
        Model leans are pending — the board will populate as the model
        finishes scoring tonight&rsquo;s matchups. Educational analytics
        only.
      </div>
    </div>
  );
}

function NoGamesCallout({ next }: { next: { dayLabel: string; gameCount: number } }) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--text-faint)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        today
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        No NBA games scheduled for today. The next available slate is{" "}
        <span className="text-[var(--text)] font-semibold">
          {next.dayLabel}
        </span>{" "}
        with {next.gameCount} game{next.gameCount === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

function ScheduleUnavailableCallout({
  reason: _reason,
}: {
  /** Preserved on the type for caller compatibility; not rendered publicly. */
  reason?: string | null;
}) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--vault-warn)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--vault-warn)]">
        refresh pending
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        Today&rsquo;s slate is refreshing. New schedule and model leans appear
        after the next scheduled update.
      </div>
    </div>
  );
}

function FeatureTile({
  label,
  title,
  body,
  href,
  cta,
  badge,
  tone,
}: {
  label: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  badge?: string;
  tone?: "warn";
}) {
  const badgeStyle =
    tone === "warn"
      ? {
          color: "var(--vault-warn)",
          background: "var(--vault-warn-dim)",
          border: "1px solid rgba(240, 199, 94, 0.30)",
        }
      : {
          color: "var(--vault-gold-bright)",
          background: "var(--vault-gold-dim)",
          border: "1px solid var(--vault-border-strong)",
        };
  return (
    <Link
      href={href}
      className="vault-deluxe-card casino-glow-card p-5 flex flex-col"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          className="font-mono text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--vault-gold)" }}
        >
          {label}
        </span>
        {badge && (
          <span
            className="font-mono text-[10px] tracking-tight uppercase px-2 py-0.5 rounded-[3px]"
            style={badgeStyle}
          >
            {badge}
          </span>
        )}
      </div>
      <h3
        className="font-display text-[16px] sm:text-[17px] font-semibold tracking-tight mb-2"
        style={{ color: "var(--vault-text)" }}
      >
        {title}
      </h3>
      <p
        className="text-[13px] leading-relaxed flex-1"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
      <div
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px]"
        style={{ color: "var(--vault-gold)" }}
      >
        {cta}
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

function ExplainerCard({
  n,
  title,
  body,
  delay,
}: {
  n: string;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <div
      className={`vault-deluxe-card casino-glow-card p-6 reveal reveal-d${delay}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full font-mono font-semibold text-[12px] tabular"
          style={{
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-gold-bright)",
            boxShadow: "0 0 12px -4px rgba(240, 199, 94, 0.35)",
          }}
          aria-hidden
        >
          {n}
        </span>
        <h3 className="font-display text-[18px] sm:text-[20px] font-semibold tracking-tight">
          {title}
        </h3>
      </div>
      <p className="text-[14px] text-[var(--vault-text-mute)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PR B — Trending data helpers (pure, server-side)
// ---------------------------------------------------------------------------

/**
 * Returns the latest board (within the loaded slate window) that has at
 * least one scored lean. Used so the homepage can surface real model
 * intelligence even when today is an off-day or refresh-pending.
 */
function findLatestScoredBoard(
  boardsByDate: Record<string, BoardData>,
): { date: string; board: BoardData } | null {
  const dates = Object.keys(boardsByDate).sort().reverse();
  for (const date of dates) {
    const b = boardsByDate[date];
    if (!b) continue;
    if ((b.leans ?? []).some((l) => isScored(l))) {
      return { date, board: b };
    }
  }
  return null;
}

/**
 * Fallback: walk every board file on disk (not just slate-window dates)
 * looking for the latest scored one. Used when the active slate window
 * doesn't include any scored board.
 */
function findLatestScoredBoardOnDisk(): { date: string; board: BoardData } | null {
  const allDates = getAvailableBoardDates().slice().sort().reverse();
  for (const date of allDates) {
    const b = getBoardForDate(date);
    if ((b.leans ?? []).some((l) => isScored(l))) {
      return { date, board: b };
    }
  }
  return null;
}

function isScored(l: PropLean): boolean {
  // Real scored leans have both projection and edge set as numbers.
  // trends_pending / insufficient_data leans always have projection null,
  // so this single check covers both.
  return (
    typeof l.projection === "number" && typeof l.edgePct === "number"
  );
}

/** A lean is "clean" if it's actionable AND not flagged as a model anomaly. */
function isClean(l: PropLean): boolean {
  if (!isScored(l)) return false;
  if (l.confidence === "insufficient_data" || l.confidence === "no_play")
    return false;
  if ((l.riskFlags ?? []).includes("suspicious_edge")) return false;
  if (l.lean === "No Play" || l.lean === "Pass") return false;
  return true;
}

function toTrendingLean(l: PropLean): TrendingLean {
  return {
    playerName: l.playerName ?? "",
    team: l.team ?? "",
    opponent: l.opponent ?? "",
    market: l.market ?? "",
    line: typeof l.line === "number" ? l.line : 0,
    side: l.lean ?? "No Play",
    projection: typeof l.projection === "number" ? l.projection : null,
    edgePct: typeof l.edgePct === "number" ? l.edgePct : null,
    confidence: l.confidence ?? "Low",
  };
}

/** Build a compact matchup string from a board's first game, e.g. "CLE @ DET". */
function matchupForBoard(board: BoardData | null): string | null {
  if (!board) return null;
  const games = board.games ?? [];
  if (games.length === 0) return null;
  const g = games[0];
  if (!g.awayTeamAbbr || !g.homeTeamAbbr) return null;
  return `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`;
}
