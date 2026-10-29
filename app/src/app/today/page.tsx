/**
 * /today — every game TODAY, across sports, with its official forecast (or the honest state of it), then the ranked
 * reads; the MLB slate in detail, the week's full table and every product's HONEST status (Bank Builder / Build-a-Pick /
 * Moonshot) sit in folds, and the track record closes the page (W4 · 2026-10-28; see the JSX comment for the order).
 *
 * This is DISTINCT from `/` (Home): Home is the 30-second flagship-cards landing (LandingHero +
 * FlagshipCards + HowItWorks); Today is the daily operating hub. Today deliberately does NOT import any
 * Home landing component and builds its own compact, Today-specific sections.
 *
 * MONEY INTEGRITY: every money / record / exposure / step figure is READ HERE (a server component) from
 * the SAME canonical loaders Home uses, then passed to the presentational `components/today/*` blocks as
 * PRE-FORMATTED string/number props. Nothing is recomputed or hardcoded — no record and no dollar literal
 * lives in a Today component; the components never touch fs/data. It approves nothing, places no exposure,
 * settles nothing, and generates no picks: the current honest reality (Bank Builder no-play · awaiting the
 * next rung · $0 open exposure · no active card; Longshot no-play) is DERIVED and rendered, never asserted.
 */
import path from "node:path";
import fs from "node:fs";

import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate, loadTodaySlate } from "@/lib/parlays/ui-loader";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { buildAllGameDetails } from "@/lib/game-detail";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { slateGames, slateReadinessNote } from "@/lib/today/slate-games";
import { buildDailyBrief } from "@/lib/today/daily-brief";
import { buildMarketCoverage } from "@/lib/today/market-coverage";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { BANK_BUILDER_LADDER, resolveLadderStep } from "@/lib/bank-builder-ladder";
import { bankBuilderLaneSummary } from "@/lib/products/bank-builder-lane-summary.mjs";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";

import TodayDailySlateHeader from "@/components/today/daily-slate-header";
import SuggestedParlaysPreview from "@/components/home/suggested-parlays-preview";
import { loadSuggestedParlaysPreview, TIER_INTENT } from "@/lib/home/suggested-parlays.mjs";
import { buildProductDays, buildSportToday, crossSportToday } from "@/lib/product-day/product-day";
import { Suspense } from "react";
import TopReadsFilter from "@/components/today/top-reads-filter";
import { loadTopReads, topBySport, sportsInSet } from "@/lib/top-reads";
import TodayGames from "@/components/today/today-games";
import TodayTopModelPicks from "@/components/today/top-model-picks";
import TodayGamePredictions from "@/components/today/game-predictions";
import TodayTopPicksByCategory from "@/components/today/top-picks-by-category";
import TodaySimulationStories from "@/components/today/simulation-stories";
import { buildSlateStories, buildTodayPredictionRows, buildTopPicksByCategory, type SlatePredictionGame } from "@/lib/mlb/prediction/slate";
import TodaySimulationLeans from "@/components/today/simulation-leans";
import TodayFullSlate from "@/components/today/full-slate";
import TodayMlbBrief from "@/components/today/today-mlb-brief";
import TodayMarketCoverage from "@/components/today/market-coverage-panel";
import {
  BuildAPickModule,
  BankBuilderStatus,
  LongshotLabStatus,
  NoPlayNotes,
  ResultsReminder,
  SecondaryLinks,
  type SecondaryLink,
} from "@/components/today/status-modules";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import YourTeams from "@/components/follow/your-teams";
import GameTimeBrief from "@/components/brief/gametime-brief";
import { buildChangeLog } from "@/lib/command-center/changes";
import YesterdayCard from "@/components/recap/yesterday-card";
import { buildYesterdayRecap } from "@/lib/recap/yesterday.mjs";
import { legacyNameMap } from "@/lib/follow/entity-registry";
import { currentProductRecord } from "@/lib/results/current-record";
import { scopedRecordText } from "@/lib/results/current-record";
import { buildSimulateDay, simulationReadyCount } from "@/lib/simulate/day-view";
import LiveNow from "@/components/live/live-now";
import MoreDisclosure from "@/components/ui/more-disclosure";
import GamesTable from "@/components/games-experience-table";
import { buildGamesTableRows, gamesTableDates } from "@/components/games-experience-table-rows";
import { packGamesTable } from "@/components/games-experience-table-wire";
import { publicSport } from "@/lib/public-registry";
import { loadCurrentLane } from "@/components/nba/experimental-lane";

export const metadata = withRouteMetadata("/today/", {
  title: "Today · GameTime Picks",
  description:
    "Every game today across NFL, NBA, MLB, Premier League, Ligue 1 and UFC with its official forecast, plus the model's ranked reads and each paper product's status. Paper-only, educational.",
});

const etStamp = (ms: number) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + " ET";
const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TodayPage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  // Frame on the presented slate (the latest generated slate), same pointer Home uses, so every figure
  // lines up with `/`. Falls back to the wall clock only when no slate exists.
  const today = currentSlateDate() ?? currentEtDate();
  const serverToday = currentEtDate();
  // The day claim is CROSS-SPORT (lib/product-day crossSportToday) — never MLB's slate or the picks count.
  const todayAcross = crossSportToday(serverToday, buildSportToday(dataRoot, { today: serverToday }));
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // ── Simulation-ready games — REAL ready artifacts only, via the shared selector (no new data path) ──
  const details = buildAllGameDetails();
  /* simulationsToday is the only number that may back a sentence containing "today"; allCurrent
     tells the leans section when the pool fell back to the archive (P241 · A12 — "36 ready" was
     the whole historical pool, not this slate). */
  const { featured, readyCount, allCurrent } = featuredSimulations(details, serverToday);
  /* P1-E: today's figure is /simulate's own ready count (a started game is not "ready"), the same number
     Home's hero shows — one derivation. A past presented slate keeps the pool rule below. */
  const slateReadyCount = today === serverToday ? simulationReadyCount(buildSimulateDay(serverToday, { today: serverToday })) : (allCurrent ? readyCount : 0);

  // ── EVERY game on the presented slate — honest per-game action so none is stranded, GROUPED by
  //    readiness (Simulations ready › Model reads › Market context › Reports) via the shared availability
  //    contract. Framed on `today` (the presented slate); a real clock (Date.now) drives honest start-state.
  //    Reads the same details; fabricates nothing. ──
  /* ONE instant for the page (P252), so two sections cannot judge the same game against two
     clocks — which is how the predictions table and the slate list came to print first pitches a
     minute apart for every one of fifteen games. */
  const nowMs = Date.now();
  const slate = slateGames(details, today, { nowMs });
  const gamesRows = buildGamesTableRows(serverToday);
  // Explicit readiness for a CURRENT slate (ready vs still-filling-in); stale/no-games stay with the banner.
  const slateReadiness = slateReadinessNote(slate.summary, today >= serverToday);
  // ── Daily MLB intelligence brief — the executive digest ("what should I know about MLB today?"). Reuses
  //    the same details; factual signals only (markets simulated + simulated p10–p90 range), never a pick. ──
  const brief = buildDailyBrief(details, today, { nowMs });
  // ── Sportsbook + model AVAILABILITY for the presented slate. Passes the WHOLE MLB slate (not a
  //    filtered subset) so the denominator stays honest and every gap is attributed. ──
  const marketCoverage = buildMarketCoverage(
    details.filter((d) => d.sport === "mlb" && d.date === today),
    today,
  );

  // ── Parlay Lab preview — the SAME reshaping of the risk-coverage matrix Home renders ──
  const parlayPreview = loadSuggestedParlaysPreview(dataRoot);
  // ── Cross-sport ranked reads — the same owner Home's strongest-reads panel consumes ──
  const topReadsSet = loadTopReads();
  const topReadsShown = topReadsSet ? sportsInSet(topReadsSet).flatMap((s) => topBySport(topReadsSet, s, 10)) : [];

  // ── Top model picks — the canonical cross-sport board; take the strongest ~6 for the compact list ──
  const top10 = buildTop10Board(dataRoot, today, nowMs);
  const topPicks = (top10.overall ?? []).slice(0, 6);

  // ── The Game Predictions table + Top Model Picks BY CATEGORY, both derived from the SAME canonical
  //    prediction objects the game report uses (detail.prediction / detail.playerPredictions). No
  //    re-derivation, no hardcoding: a game with no full-game artifact simply drops out. ──
  const slatePredictionGames: SlatePredictionGame[] = details
    .filter((d) => d.sport === "mlb" && d.prediction && d.fullGameSim)
    .map((d) => ({
      gamePk: Number(d.matchId),
      slug: d.slug,
      href: `/games/mlb/${d.slug}/`,
      homeTeam: d.prediction!.homeTeam,
      awayTeam: d.prediction!.awayTeam,
      homeTeamName: d.prediction!.homeTeamName,
      awayTeamName: d.prediction!.awayTeamName,
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      /* ONE FIRST PITCH PER GAME. Two artifacts carry it — the game centre (schedule truth) and a
         copy stamped into the simulation when it was built — and they differ by up to a minute, so
         the predictions table printed "1:35 PM ET" while the slate list below printed "1:36 PM ET"
         for the same game, on every one of fifteen rows. The game centre is the owner; the
         simulation's copy is the fallback so a game never loses its time entirely. */
      firstPitchIso: d.gameCenter?.firstPitch ?? d.fullGameSim!.firstPitch ?? null,
      prediction: d.prediction!,
      playerPredictions: d.playerPredictions ?? [],
      simulationCount: d.fullGameSim!.runCount ?? null,
    }));
  const predictionRows = buildTodayPredictionRows(slatePredictionGames);
  const picksByCategory = buildTopPicksByCategory(slatePredictionGames, { perCategory: 5 });
  // The four slate-wide headlines — a RANKING of the same objects, never a new calculation.
  const slateStories = buildSlateStories(slatePredictionGames);

  // ── CANONICAL money / exposure — identical sources to Home; never recomputed or hardcoded ──
  const dailyPortfolio = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const openExposureLabel = usd2(dailyPortfolio.openExposure);

  // ── Record — read from the canonical portfolio.json (the fields AchievementBanner surfaces). Fail
  //    closed to null so a figure is only ever shown when it can be sourced canonically. ──
  /*
   * C2: the same question the front door asks, through the same reader, so the two pages cannot disagree
   * about the record — they used to agree only because two hand-written copies happened to match.
   * `settled` still gates the brief's yesterday link, and stays null (not 0) when the cell cannot be read,
   * so an unreadable projection hides the recap link rather than claiming nothing has settled.
   */
  const bbRecord = currentProductRecord("bank-builder");
  const { settled: settledCount } = bbRecord;
  const hasSettledResults = (settledCount ?? 0) > 0;
  /* P0 U2: the reminder leads with the CURRENT era, labelled ("Bank Builder · current era 28–38") — it printed the
     all-time 47–52 as "Track record". Same reader, same scope label as Home and the product pages. */
  const recordLabel = bbRecord.currentEra ? scopedRecordText(bbRecord.currentEra, { product: "Bank Builder", dates: false }) : bbRecord.recordLabel;
  const pendingLabel = bbRecord.currentEra ? bbRecord.currentEraPendingLabel : bbRecord.pendingLabel;

  // ── Bank Builder status — derived HONESTLY (never a hardcoded "active" card), same pattern as Home.
  //    `available === false` ⇒ no qualified card ⇒ NO-PLAY. The awaiting rung is read from the public
  //    dual-ladder view (the first lane cleared its earlier rungs, now awaiting the next card); the exposure is
  //    the canonical open exposure ($0 while there is no active card). resolveLadderStep still guards the
  //    crown-ladder step for the copy fallback. A Bank Builder card is "active" ONLY when an approved lane
  //    is placed (status "active") — a proposal / candidate is not a placed card. ──
  const bbProposal = buildBankBuilderProposal(dataRoot, today);
  const bbSummary = loadPublicBankBuilderSummary();
  const crownRung = bbSummary ? resolveLadderStep(bbSummary.currentBankrollUnits) : null; // null when the crown ladder is complete
  const bbPreview = loadTodaySlate().bankBuilderPreview;
  const laneAView = buildPublicDualLadder(bbPreview.laneA, "lane-a");
  const awaitingRung =
    laneAView?.steps.find((s) => s.status === "awaiting")?.step ??
    laneAView?.currentStep ??
    crownRung?.step ??
    null;
  const bbHasActiveCard = dailyPortfolio.cards.some((c) => c.product === "bank-builder" && c.status === "active");
  const bbNoPlay = !bbProposal.available && !bbHasActiveCard;
  /* Audit F10 (2026-10-23): name BOTH lanes, from the placed-card receipts /bank-builder reads
     (products/bank-builder-lane-summary.mjs) — "Lane A awaiting Step 2 · Lane B awaiting Step 1". The dual-ladder /
     crown fallback above applies only when no lane has a placed receipt yet, and it names the lane it describes. */
  const bbLanes = bankBuilderLaneSummary({ dataRoot, today, ladder: BANK_BUILDER_LADDER as never });
  const bbStepPhrase = bbLanes.phrase ?? (awaitingRung != null ? `Lane A awaiting Step ${awaitingRung}` : "awaiting next card");
  /* TRUTH-001 (B6): a day with no games is not a no-play CALL — /bank-builder says so explicitly. "No-play" means
     the ladder looked at a slate and held; with no events anywhere there was nothing to look at. */
  const noGamesToday = todayAcross.state !== "UNKNOWN" && todayAcross.eventsToday === 0;
  const bbStatusValue = bbNoPlay ? (noGamesToday ? "No games today" : "No-play") : bbHasActiveCard ? "Active card" : "Awaiting card";
  /* Session 7: the lane's OWN reason (activationEligibility.reason) — "a postseason off day" or "no priced slate yet"
     is not "no card reaches this step's price". The generic sentence is only the fallback when no reason is published. */
  const sentence = (r: string | null | undefined) => (r ? `${r.charAt(0).toUpperCase()}${r.slice(1).replace(/\.\s*$/, "")}.` : null);
  const bbLaneReason = sentence(dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.status !== "active" && c.laneReason)?.laneReason);
  const msLaneReason = sentence(dailyPortfolio.cards.find((c) => c.product === "moonshot" && c.status !== "active" && c.laneReason)?.laneReason);
  const bbReason = bbNoPlay
    ? bbLaneReason ?? "No card reaches this step's price today — the ladder holds rather than force a play."
    : bbHasActiveCard
      ? "An approved lane is placed as the active paper ladder — settles from official results only."
      : "The next-rung card is pending approval — no exposure is placed until it is.";

  // ── Longshot / Moonshot status — no active Moonshot card today ⇒ honest no-play (code label stays
  //    `product: "moonshot"` and the /moonshot href; the visible label is "Longshot Lab"). ──
  const moonshotActive = dailyPortfolio.cards.some((c) => c.product === "moonshot" && c.status === "active");
  const longshotStatusValue = moonshotActive ? "Active" : noGamesToday ? "No games today" : "No-play";
  const longshotReason = moonshotActive
    ? "A Moonshot ladder card is live today — both legs must win to carry the balance to the next day's rung."
    : msLaneReason ?? "No Moonshot card today: nothing on the slate reaches the rung's price with two legs, and the ladder waits rather than force one.";

  // ── Build-a-Pick — the engine's suggested-card count for today (public label "Build-a-Pick" → /picks). ──
  const engineSlate = loadTodaySlate();
  const engineSuggested = engineSlate.allSuggested.length;
  const bapStatus = engineSlate.available && engineSuggested > 0 ? `${engineSuggested} suggested card${engineSuggested === 1 ? "" : "s"}` : "No cards today";
  const bapSuggestedLine = engineSlate.available && engineSuggested > 0
    ? "Suggested from today's eligible legs — build any card and see the projected paper return."
    : "No eligible legs today — the builder returns with the next slate.";

  // ── Active-sport labels for the header — from the PRODUCT-DAY OWNER (P201 · A1), never counted
  //    here. A sport is "active today" exactly when its own canonical artifacts say LIVE; upcoming
  //    cards/matchdays stay off this line (they have their own surfaces below). ──
  /* Founder directive 2026-10-23 public readiness: labels are the public registry's, and NBA — an Official Forecast
     sport that is not a product day — counts as active when today's frozen lane snapshot is published. */
  const activeSports: string[] = buildProductDays(dataRoot)
    .filter((d) => d.state === "LIVE")
    .map((d) => publicSport(d.sport)?.label ?? d.sport.toUpperCase());
  const etToday = currentEtDate();
  const nbaToday = loadCurrentLane(etToday);
  if (nbaToday?.date === etToday && nbaToday.games.length) activeSports.push(publicSport("nba")!.label);

  /* W4 (2026-10-28): the "Today at a glance" strip (five status cards: simulations, top reads, Bank Builder, Parlay
     Center, Results) is gone. Each card repeated a section on this page — the reads, the product modules, the results
     reminder — and its Bank Builder card put the ladder's lane/step state in the first screen. */

  // ── Today's games, grouped (W4): the games table's own rows for the ET day, shown once. On a day with no games the
  //    next day that has games answers "what's next?". Rows are the table's, so status and forecast state match it.
  const todayRows = gamesRows.filter((r) => r.date === serverToday);
  const nextDate = todayRows.length ? null : gamesRows.map((r) => r.date).filter((d) => d > serverToday).sort()[0] ?? null;
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  /* The MLB detail below is framed on the presented MLB slate, which can be the previous day's in the morning: its fold
     says so rather than calling it today's. */
  const mlbSlateQualifier = today < serverToday ? "Latest slate" : null;

  // ── Section 8 · No-play / unavailable notes — honest, discipline-framed. Built from the real states. ──
  const noPlayNotes: string[] = [];
  /* TRUTH-001 (B6): with no games anywhere there was no slate to hold back from — no no-play call, and no simulation
     "not ready yet". One true sentence replaces those three. */
  if (noGamesToday) noPlayNotes.push("No games are scheduled today, so no card is made and nothing is simulated. This is not a no-play call: the ladders resume on the next game day.");
  if (bbNoPlay && !noGamesToday) noPlayNotes.push(`Bank Builder is no-play today (${bbStepPhrase}, ${openExposureLabel} open exposure) — the ladder never forces a card to keep a streak alive.`);
  /* Session 5 — the reason is the lane's OWN (the producer's shortfallNote), never a fixed sentence: on 2026-10-01 this
     said "no two-leg card reaches its rung's price" while the lanes said "fewer than two eligible legs on the slate". */
  const moonshotReason = (dailyPortfolio.cards.find((c) => c.product === "moonshot" && c.laneReason)?.laneReason ?? dailyPortfolio.cards.find((c) => c.product === "moonshot" && c.shortfallNote)?.shortfallNote)?.replace(/\.\s*$/, "") ?? null;
  if (!moonshotActive && !noGamesToday) noPlayNotes.push(`Moonshot is no-play${moonshotReason ? ` — ${moonshotReason.charAt(0).toLowerCase()}${moonshotReason.slice(1)}` : ""}. The ladder waits rather than force a card.`);
  if (slateReadyCount === 0 && !noGamesToday) noPlayNotes.push("No simulation artifact is ready for this slate yet; simulations are deterministic and only shown when genuinely generated — never faked.");
  noPlayNotes.push("Pending is not a loss: a card settles only against the official final, and unsettled cards are never counted against the record.");

  // ── Section 10 · Secondary links — compact link cards out (no large widgets duplicated here). ──
  const secondaryLinks: SecondaryLink[] = [
    { href: "/simulate", label: "Simulate", sub: "Game sims" },
    { href: "/results", label: "Results", sub: "Receipts" },
    { href: "/bank-builder", label: "Bank Builder", sub: "The ladder" },
    { href: "/build", label: "Parlay Center", sub: "Suggested cards + build your own" },
    { href: "/simulate", label: "Game Reports", sub: "Model reads" },
    { href: "/learn", label: "How It Works", sub: "Methodology" },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-7">
      {/* REMOVED 2026-08-17: the three-layer probability dump ("Three estimates for the same
         question") used to open this page, above even the slate header.
     *
     * It was built as research transparency and it was honest, but as the FIRST thing a visitor met
     * it was the wrong content in the wrong place. Nothing honest was lost: that we do not out-score the book is stated
     * by /results, derived in /methodology, and said in this page's own intro line. The layers still power the learning
     * loop.
     */}
      {/*
        W4 (2026-10-28) · ONE READING PATH. /today measured 25.8 phone screens: three game lists for one slate (the
        cross-sport table, the MLB predictions table, "Every game on the slate"), a five-card status strip repeating the
        sections below it, and product/ladder state in the first screen. The page now reads: header → live now → today's
        games (started / upcoming / final, each game once, with its official forecast or its honest state) → the ranked
        reads → three folds (the week's full table, the MLB slate in detail, the paper products and model updates) → the
        track record. Everything folded is still server-rendered (find-in-page, the rendered guards, deep links open the
        fold) — folded, never removed.
      */}

      {/* 0 — Slate liveness (real ET clock): on a no-games day this says so plainly and points at the next scheduled focus,
          so the most-recent slate is never presented as live. Hidden on a live day. */}
      <SlateLivenessBanner
        publishDeadlineUtc={publicationDeadlineUtc()}
        buildTimeToday={serverToday}
        latestSlate={serverToday}
        latestSlateHasGames={todayAcross.eventsToday > 0}
        todayEvidence={todayAcross.state === "UNKNOWN" ? "unknown" : "known"}
        archiveHref="/results"
        archiveLabel="See results & receipts"
        includeMlbNote
      />

      {/* 1 — Header: framed on the reader's ET day (the games below are that day's). The MLB fold names its own slate. */}
      <TodayDailySlateHeader
        dateLabel={dayName(serverToday)}
        slateRelative={null}
        activeSports={activeSports}
      />
      {/* UX System V2 (founder directive 2026-10-13): LIVE FIRST. The same view-time strip Home and the hubs use; it
          renders nothing when no game is in play. */}
      <LiveNow sports={["nfl", "mlb"]} />

      {/* 2 — Today's games, each once: started / upcoming / final, each linking to its game page with its official
          forecast, or "pending" (and when its sport publishes), or "no official forecast". */}
      <TodayGames
        rows={todayRows}
        dayLabel={dayName(serverToday)}
        asOf={etStamp(nowMs)}
        next={nextDate ? { dayLabel: dayName(nextDate), rows: gamesRows.filter((r) => r.date === nextDate) } : null}
      />

      {/* 1b — P251-F9: the payoff for following a club. Renders nothing until a reader has followed one. v1.1.2: the strip
              is the main place P251 follows were READ, so it migrates them forward here. */}
      <YourTeams legacyMap={legacyNameMap()} />

      {/* 3 — The ranked reads by sport (P201 · charter C): the per-sport view over the SAME ranked owner the homepage's
          panel uses — grouping is presentation, never a second ranking. */}
      {topReadsSet ? (
        /* Suspense: useSearchParams inside the client filter requires a boundary under static export; the fallback is
           null, so nothing blanks while chips hydrate. The filter's props are serialized into the page, so only the reads
           this section renders are shipped (the full set was ~220KB on the 10-23 EPL matchweek). */
        <Suspense fallback={null}>
          <TopReadsFilter
            set={{ ...topReadsSet, reads: topReadsShown }}
            reads={topReadsShown}
          />
        </Suspense>
      ) : null}

      {/* 4 — Fold: every game from yesterday through the next three days, filterable (gap 3, 2026-10-23). Same rows as
          above; `#all-games` deep links open the fold. */}
      <MoreDisclosure
        id="all-games"
        title="Every game this week"
        summary="Filter every game from yesterday through the next three days by sport, date or forecast state."
      >
        <GamesTable table={packGamesTable(gamesRows)} today={serverToday} dates={gamesTableDates(serverToday)} asOf={etStamp(nowMs)} />
      </MoreDisclosure>

      {/* 5 — Fold: the MLB slate in detail — the brief, the game-predictions table, the player-prop rankings, every game on
          the slate grouped by readiness, and the simulation leans and stories. Framed on the presented MLB slate. */}
      <MoreDisclosure
        id="mlb-slate"
        title={mlbSlateQualifier ? `MLB slate in detail · ${mlbSlateQualifier.toLowerCase()}, ${dateLabel}` : `MLB slate in detail · ${dateLabel}`}
        summary="The MLB brief, game predictions, player-prop rankings and every game's simulation."
      >
        <TodayMlbBrief brief={brief} recapHref={hasSettledResults ? "/results" : null} />
        <TodayGamePredictions rows={predictionRows} nowMs={nowMs} />
        {/* Top model picks: BY CATEGORY when the MLB slate supports it, else the cross-sport list */}
        {picksByCategory.length > 0 ? <TodayTopPicksByCategory categories={picksByCategory} /> : <TodayTopModelPicks picks={topPicks} noGamesToday={noGamesToday} />}
        {/* Every game on the slate: grouped by readiness, one honest per-game action, factual summary */}
        <TodayFullSlate groups={slate.groups} summary={slate.summary} readinessNote={slateReadiness} />
        {/* Only current simulations belong on Today — the archive lives in /simulate (P241 · A12). */}
        {allCurrent ? <TodaySimulationLeans featured={featured} readyCount={slateReadyCount} /> : null}
        <TodaySimulationStories stories={slateStories} />
      </MoreDisclosure>

      {/* 6 — Fold: the paper products and the trust layer — suggested parlays, the ladders' status, yesterday's recap,
          what changed since the last run, sportsbook coverage, and the no-play notes. Same owners, same content. */}
      <MoreDisclosure
        id="more-from-today"
        title="Paper products and model updates"
        summary="Suggested parlays, Bank Builder and Moonshot status, yesterday's recap, what changed, and sportsbook coverage."
      >
        {/* The Parlay Lab's four risk evaluations per lane (P200): the SAME component + lib Home renders. */}
        {parlayPreview ? (
          <SuggestedParlaysPreview live={parlayPreview.live} closed={parlayPreview.closed} tierIntent={TIER_INTENT} todayEt={currentEtDate()} />
        ) : null}
        {/* Build-a-Pick module */}
        <BuildAPickModule
          status={bapStatus}
          suggestedLine={bapSuggestedLine}
          note="Paper-only — the builder places no exposure and never settles a card for you."
        />
        {/* Bank Builder status (derived; never hardcoded) */}
        <BankBuilderStatus
          statusValue={bbStatusValue}
          /* "· no active card" was a HARDCODED literal sitting beside a derived statusValue that
             said "Active card", so the tile read "Active card … awaiting Step 1 · no active card".
             This file's own header promises the state is derived and never asserted; this line was
             the exception, and it contradicted the line above it. */
          stepLine={bbHasActiveCard ? bbStepPhrase : `${bbStepPhrase} · no active card`}
          exposureLine={`Open exposure ${openExposureLabel}`}
          reason={bbReason}
        />
        {/* Moonshot status (compact; not made to look Tier-1 when inactive) */}
        <LongshotLabStatus statusValue={longshotStatusValue} reason={longshotReason} />
        {/* P251: how the last settled day went — it does not soften a losing day. */}
        <YesterdayCard recap={buildYesterdayRecap(dataRoot)} />
        {/* P311 — the GameTime Brief: what changed since the last run (model states from the scorecard's own transition
            record, MLB forecast moves between today's frozen snapshots). Nothing here is a "best bet". */}
        <GameTimeBrief changes={buildChangeLog({ dataRoot, repoRoot: path.join(process.cwd(), ".."), today, nowIso: new Date(nowMs).toISOString() })} />
        {/* What we can show today: sportsbook + model availability, capture provenance, and a named reason for every
            withheld market. Derived from canonical GameIntelligence; availability only. */}
        <TodayMarketCoverage coverage={marketCoverage} />
        {/* No-play / unavailable notes (discipline, not failure) */}
        <NoPlayNotes notes={noPlayNotes} />
      </MoreDisclosure>

      {/* 7 — The track record, once: the shared current-era reader (lib/results/current-record.ts). */}
      <ResultsReminder recordLabel={recordLabel} pendingLine={pendingLabel} />

      {/* 8 — Secondary links */}
      <SecondaryLinks links={secondaryLinks} />
    </div>
  );
}
