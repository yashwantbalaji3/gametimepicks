/**
 * Root route `/` — the front door. It answers one question — "what is this, and what is there to look
 * at today?" — and hands off: the measured comparison against the sportsbook, today's availability, the
 * simulation centers, the products, real ready simulations, and how it works. The dense daily board
 * lives only on `/today`; this page intentionally does NOT render it.
 *
 * The page states the market comparison ONCE, at the top, from the canonical contract. It used to state
 * it three times in three voices, which reads as a product insisting on its own honesty rather than
 * showing the measurement. One statement with the numbers under it is stronger than three without.
 *
 * MONEY INTEGRITY: every money / record / exposure / step figure is READ here (a server component) from
 * the SAME canonical artifacts the Today board already uses, then passed to the presentational home
 * components as PRE-FORMATTED string/number props. Nothing is recomputed or hardcoded — no record and no
 * dollar literal lives in a component; the components never touch fs/data.
 */
import path from "node:path";
import fs from "node:fs";

import { currentEtDate } from "@/lib/freshness";
import { loadTerminal } from "@/lib/research/public-contract-adapter";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { buildAllGameDetails } from "@/lib/game-detail";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { sportStateFromProductDay, stateLabel, partitionSports } from "@/lib/home/simulation-hub.mjs";
import { buildHomeGameAnswers } from "@/lib/home/game-answers";
import TopReadsPanel from "@/components/top-reads-panel";
import { loadTopReads, topOverall } from "@/lib/top-reads";
import { buildDailyBrief } from "@/lib/today/daily-brief";
import { buildProductDays, type ProductDay } from "@/lib/product-day/product-day";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";

import LandingHero from "@/components/home/landing-hero";
import RecentResultsStrip from "@/components/home/recent-results-strip";
import { getOptimizerSettledDates } from "@/lib/parlay-results";
import HomeTodayMlb from "@/components/home/home-today-mlb";
import FlagshipCards, { type FlagshipCard } from "@/components/home/flagship-cards";
import SuggestedParlaysPreview from "@/components/home/suggested-parlays-preview";
import { loadSuggestedParlaysPreview, TIER_INTENT } from "@/lib/home/suggested-parlays.mjs";
import FeaturedSimulationsSection from "@/components/home/featured-simulations";
import { HowItWorks, FooterCta } from "@/components/home/home-sections";
import { UpcomingSportsStrip, type SportSchedule } from "@/components/sports/upcoming-sports";
import SlateLivenessBanner from "@/components/slate-liveness-banner";

export const metadata = {
  title: "GameTime Picks — Simulate today's games. Review model picks. Track results.",
  description:
    "A simulation-first, paper-only sports model. Run deterministic game simulations, review today's model slate, and follow every result with transparent, official-settlement-only receipts. Free and educational.",
};

const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HomePage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  // Frame on the same presented slate the Today board uses so every figure lines up with /today.
  const today = currentSlateDate() ?? currentEtDate();

  // ── CANONICAL money / record — identical sources to the Today board; never recomputed or hardcoded ──
  const dailyPortfolio = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const crown = crownLadderSummary(dataRoot);

  // Record comes from the canonical portfolio.json. Fail closed to null so a figure is only ever shown
  // when it can be sourced canonically. The peak/high-water figure is deliberately NOT read here: a
  // "peak paper bankroll" tile on the front door reads as a profitability claim, and this is a research
  // terminal. The full paper record, including every losing card, lives on /results.
  let recordLabel: string | null = crown?.recordLabel ?? null;
  let pendingLabel: string | null = null;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8"));
    if (p.record && typeof p.record.wins === "number" && typeof p.record.losses === "number") {
      recordLabel = `${p.record.wins}–${p.record.losses}`;
      const settled = p.record.wins + p.record.losses + (p.record.voids ?? 0);
      const pending = p.record.pending ?? 0;
      pendingLabel = `${pending} pending · ${settled} settled`;
    }
  } catch {
    /* fail closed → the product card omits any figure it cannot source canonically */
  }

  const openExposureLabel = usd2(dailyPortfolio.openExposure);

  // ── Featured simulations — REAL ready artifacts only, via the shared selector (no new data path) ──
  const details = buildAllGameDetails();
  const { featured, readyCount, simulationsToday } = featuredSimulations(details, currentEtDate());
  const topReads = loadTopReads();
  // What each featured simulation CONCLUDED — a lookup over the canonical objects.
  const gameAnswers = buildHomeGameAnswers(details);
  // Daily-MLB destination hook — the SAME brief overview /today leads with (factual counts, no picks).
  const homeBrief = buildDailyBrief(details, today, { nowMs: Date.now() });
  // P200: the pre-sportsbook availability strip moved off Home — that derivation (buildMarketCoverage)
  // still renders at its canonical destination, /today, from the same lib. Home previews and routes.

  // Parlay Lab preview — a reshaping of the day's risk-coverage matrix (the evaluation of record),
  // never a second eligibility pass. Null when the artifact is missing/relic → section renders nothing.
  const parlayPreview = loadSuggestedParlaysPreview(dataRoot);

  // ── MLB slate — same loader the Today board uses ──
  const mlb = getMlbBoardForDate(today);
  const mlbGames = mlb.summary.scheduledGames ?? 0;
  const mlbLeans = mlb.summary.leans ?? 0;

  // ── Top model picks count — only surfaced when real (else omitted) ──
  const top10 = buildTop10Board(dataRoot, today, Date.now());
  const topPicks = top10.overall?.length ? top10.overall.length : null;

  // ── Bank Builder status — derived HONESTLY from the loaders (never a hardcoded "active" card) ──
  // `available === false` ⇒ no qualified card ⇒ NO-PLAY. The current awaiting rung is read from the
  // public dual-ladder view (Lane A cleared Step 1+2, now awaiting Step 3); the exposure is the
  // canonical open exposure ($0 while there is no active card). `resolveLadderStep` still guards the
  // crown-ladder step for the copy fallback.
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
  // A Bank Builder card is "active" ONLY when an approved lane is placed (status "active"); a proposal /
  // candidate is not a placed card. Today there is none → no active card.
  const bbHasActiveCard = dailyPortfolio.cards.some((c) => c.product === "bank-builder" && c.status === "active");
  const bbNoPlay = !bbProposal.available && !bbHasActiveCard;
  const bbStepPhrase = awaitingRung != null ? `awaiting Step ${awaitingRung}` : "awaiting next card";

  // ── Longshot / Moonshot status — no active Moonshot card today ⇒ honest no-play ──
  const moonshotActive = dailyPortfolio.cards.some((c) => c.product === "moonshot" && c.status === "active");
  const moonshotStatus = moonshotActive ? "Active longshot lane today" : "No-play today · no active longshot";

  // ── SIMULATION HUB — facts from the PRODUCT-DAY AUTHORITY (P202 · A). The page used to rebuild
  //    each sport's state from raw artifacts — a duplicate product-day derivation. The owner answers
  //    "what does this sport have today?"; the hub keeps only its own presentation vocabulary
  //    (primary vs secondary) via sportStateFromProductDay, and DISPLAY DETAILS it already loads for
  //    other sections (the MLB leans figure; the NFL player-market count) stay presentation-only. ──
  const serverToday = currentEtDate();
  const productDays = buildProductDays(dataRoot);
  const dayOf = (sport: ProductDay["sport"]): ProductDay | undefined => productDays.find((d) => d.sport === sport);
  const mlbDay = dayOf("mlb");
  const eplDay = dayOf("epl");
  const ufcDay = dayOf("ufc");
  const nflDay = dayOf("nfl");

  const mlbState = sportStateFromProductDay(mlbDay, { slateDate: serverToday });
  const eplState = sportStateFromProductDay(eplDay, { slateDate: serverToday });
  const ufcState = sportStateFromProductDay(ufcDay, { slateDate: serverToday });
  const nflState = sportStateFromProductDay(nflDay, { slateDate: serverToday });

  // Presentation-only detail: the NFL player-market count for the card's status line. Never a
  // state input — the owner decides whether the window is live at all.
  const readCount = (rel: string, pick: (d: Record<string, unknown>) => number): number => {
    try { return pick(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8"))); }
    catch { return 0; }
  };
  const nflPicks = readCount("nfl/game-simulations/latest.json",
    (d) => ((d.games ?? []) as Array<{ generatedPicks?: unknown[] }>).reduce((n, g) => n + (g.generatedPicks?.length ?? 0), 0));

  const allSports = [
    {
      id: "mlb",
      state: mlbState,
      card: {
        href: "/mlb",
        label: "MLB Simulations",
        blurb: "Moneyline / run line / total, plus a 10,000-run player-prop sim where the artifact exists.",
        status: (mlbDay?.events ?? 0) > 0 ? `${mlbLeans} model leans` : stateLabel(mlbState),
        statusSub: "market-anchored · paper-only",
        cta: "Enter",
        accent: "var(--gtp-bank-heat)",
      },
    },
    {
      id: "epl",
      state: eplState,
      card: {
        href: "/epl",
        label: "Premier League Forecasts",
        blurb: "Score-distribution forecasts for every matchweek fixture — win/draw/win, expected goals, over 2.5.",
        status: (eplDay?.eligible ?? 0) > 0 ? (eplDay?.note ?? stateLabel(eplState)) : stateLabel(eplState),
        statusSub: "public beta · not validated out of sample",
        cta: "Enter",
        accent: "var(--sport-soccer)",
      },
    },
    {
      id: "nfl",
      state: nflState,
      card: {
        href: "/nfl",
        label: "NFL Simulations",
        blurb: "Projected score, win probability and a full player board from 10,000 simulated games.",
        status: (nflDay?.events ?? 0) > 0 ? `${nflDay?.events} games · ${nflPicks.toLocaleString()} player markets` : (nflDay?.note ?? stateLabel(nflState)),
        statusSub: "experimental preseason · paper-only",
        cta: "Enter",
        accent: "var(--vault-gold)",
      },
    },
    {
      id: "ufc",
      state: ufcState,
      card: {
        href: "/ufc",
        label: "UFC",
        blurb: (ufcDay?.eligible ?? 0) > 0 ? "Winner, method of victory and finishing round for every bout on the card." : "No upcoming card has enough fighter history to model — the schedule is published without a read.",
        status: (ufcDay?.eligible ?? 0) > 0 ? `${ufcDay?.eligible} of ${ufcDay?.events} bouts predicted` : stateLabel(ufcState, { artifactDate: ufcDay?.productDate ?? undefined }),
        statusSub: (ufcDay?.eligible ?? 0) > 0 ? "experimental · paper-only" : "schedule only · no fighter history yet",
        cta: (ufcDay?.eligible ?? 0) > 0 ? "Enter" : "View the card",
        accent: (ufcDay?.eligible ?? 0) > 0 ? "var(--sport-ufc)" : "var(--vault-text-mute)",
      },
    },
  ];
  const { primary: primarySports, secondary: secondarySports } = partitionSports(allSports);
  const simHubCards: FlagshipCard[] = primarySports.map((s) => s.card as FlagshipCard);
  const coverageCards: FlagshipCard[] = secondarySports.map((s) => s.card as FlagshipCard);
  // ── FLAGSHIP PRODUCTS — paper products powered BY the simulations (+ the track record) ──
  const productCards: FlagshipCard[] = [
    {
      href: "/bank-builder",
      label: "Bank Builder",
      blurb: "The disciplined paper ladder — structured cards only.",
      status: bbNoPlay ? `No-play · ${bbStepPhrase}` : bbStepPhrase,
      statusSub: `Open exposure ${openExposureLabel} · no active card`,
      cta: "View Bank Builder",
      accent: "var(--vault-gold)",
    },
    {
      href: "/moonshot",
      label: "Moonshot",
      blurb: "High-upside longshot paper cards — separate record, its own risk.",
      status: moonshotStatus,
      statusSub: "high-variance · paper-only",
      cta: "View Moonshot",
      accent: "var(--gtp-bank-heat)",
    },
    {
      href: "/results",
      label: "Results",
      blurb: "Receipts, settled + pending cards, and the official track record.",
      status: recordLabel ? `Record ${recordLabel}` : "Track record",
      statusSub: pendingLabel ? `${pendingLabel} · official settlement only` : "Official settlement only",
      cta: "View Results",
      accent: "var(--vault-success)",
    },
  ];

  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Real ET clock for the liveness banner (never the slate date). Stale/random event spotlights were
  // removed from the homepage in the simulation-first reset — the sim hub + liveness banner lead instead.

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-9">
      {/* 0 — Slate liveness: on a no-games day this frames the page honestly on the REAL ET clock
          (never presents the most-recent slate as live) and points at the next scheduled focus.
          Renders nothing on a genuinely live day. */}
      <SlateLivenessBanner
        buildTimeToday={serverToday}
        latestSlate={today}
        latestSlateHasGames={(mlbDay?.events ?? 0) > 0 || (topPicks ?? 0) > 0}
        archiveHref="/today"
        archiveLabel="See the most recent slate"
        includeMlbNote
      />

      {/* 1 — Simulation-first hero. It carries no money figure: a paper bankroll beside a paper record
          on the front door reads as a return, and the ONE claim above it is that we are behind the
          market. The record and every settled card live on /results. */}
      <LandingHero readyCount={simulationsToday} />

      {/* 2 — Simulation Hub: the per-sport simulation centers, directly under the hero (P200). This
          IS the live-sports strip — each card carries its sport's derived state, honest tier line and
          today's counts, so a first-time reader sees what is active before anything else. */}
      <FlagshipCards
        cards={simHubCards}
        heading="Simulation Hub"
        subtitle="Sports with activity on today's slate"
        ariaLabel="Sport simulation centers"
      />

      {/*
        3 — THE MODEL'S STRONGEST READS, ACROSS EVERY SPORT.
        Ranked by the model's own probability rather than by any gap against a price: a gap asserts
        the market is wrong and no model here has established that. Each sport's proven state renders
        with its reads, and a sport excluded for having no event-specific signal is named.
      */}
      {topReads ? (
        <TopReadsPanel
          set={topReads}
          reads={topOverall(topReads, 10)}
          eyebrow="Across every sport"
          title="The model's strongest reads today"
        />
      ) : null}

      {/* 4 — Suggested parlays: the Parlay Lab's four risk evaluations per lane, rendered from the
          day's risk-coverage matrix (the evaluation of record). No-play chips render as prominently
          as published cards — the refusal is the product working, not a gap to hide. */}
      {parlayPreview ? (
        <SuggestedParlaysPreview live={parlayPreview.live} closed={parlayPreview.closed} tierIntent={TIER_INTENT} />
      ) : null}

      {/* 6 — Flagship products, powered by the simulations. Each card carries its own current status,
          which is why the page no longer repeats those statuses in a second slate-summary block. */}
      <FlagshipCards
        cards={productCards}
        heading="Flagship products"
        subtitle="Bank Builder · Moonshot · Results — paper-only"
        ariaLabel="Flagship products"
      />

      {/* 6 — Recent results: the proof section (charter 5B order). Same owners as /results — the
          record label and pending line arrive from portfolio.json above; the last settled date from
          the optimizer's settled index. The homepage composes NOTHING. */}
      <RecentResultsStrip
        recordLabel={recordLabel}
        pendingLabel={pendingLabel}
        lastSettledDate={getOptimizerSettledDates().sort().slice(-1)[0] ?? null}
      />

      {/* 5 — Today's MLB destination hook: freshness + availability + one path into the /today brief. */}
      <HomeTodayMlb
        dateLabel={dateLabel}
        games={homeBrief.overview.games}
        simulationsReady={homeBrief.overview.simulationsReady}
        lastUpdatedIso={homeBrief.lastUpdatedIso}
        isLiveToday={today >= serverToday && mlbGames > 0}
      />

      {/* Historical / not-yet-live coverage, kept reachable but clearly secondary. Nothing is hidden —
          it is simply no longer presented as something running today. */}
      {coverageCards.length ? (
        <FlagshipCards
          cards={coverageCards}
          heading="Other coverage"
          subtitle="Archives and sports without a live daily product"
          ariaLabel="Historical and upcoming sport coverage"
        />
      ) : null}

      {/* Upcoming Sports schedules (Program 148 · Release B) — a deliberately quiet strip, OUTSIDE the
          Simulation Hub by contract: schedule availability is not simulation coverage, and these
          sports must never render as hub peers of MLB. One line per sport, status in words. */}
      <section aria-label="Upcoming sports schedule status" style={{ marginTop: 8 }}>
        <UpcomingSportsStrip sports={allUpcoming({ nowIso: new Date().toISOString() }) as SportSchedule[]} />
      </section>

      {/* 7 — Featured simulations (real ready artifacts only) */}
      <FeaturedSimulationsSection featured={featured} readyCount={readyCount} answers={gameAnswers} />

      {/* 8 — How it works */}
      <HowItWorks />

      {/* 9 — Footer CTA */}
      <FooterCta />
    </div>
  );
}
