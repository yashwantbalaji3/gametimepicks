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
import { deriveSportState, stateLabel, partitionSports } from "@/lib/home/simulation-hub.mjs";
import { buildHomeGameAnswers } from "@/lib/home/game-answers";
import { buildDailyBrief } from "@/lib/today/daily-brief";
import { buildMarketCoverage } from "@/lib/today/market-coverage";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";

import LandingHero from "@/components/home/landing-hero";
import HomeTodayMlb from "@/components/home/home-today-mlb";
import PreSportsbookStrip from "@/components/home/pre-sportsbook-strip";
import FlagshipCards, { type FlagshipCard } from "@/components/home/flagship-cards";
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
  // What each featured simulation CONCLUDED — a lookup over the canonical objects.
  const gameAnswers = buildHomeGameAnswers(details);
  // Daily-MLB destination hook — the SAME brief overview /today leads with (factual counts, no picks).
  const homeBrief = buildDailyBrief(details, today, { nowMs: Date.now() });
  // The same canonical availability object /today renders, so Home and Today cannot disagree about
  // what data exists. One derivation, two renderings; no new data path.
  const marketCoverage = buildMarketCoverage(
    details.filter((d) => d.sport === "mlb" && d.date === today),
    today,
  );

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

  // ── SIMULATION HUB — the per-sport simulation centers (the core product topic). The 2026 World Cup is
  //    complete, so it is NOT a simulation-hub card here (archive only); MLB leads. ──
  const serverToday = currentEtDate();

  // ── SIMULATION HUB — EVENT-DRIVEN (Program 139) ───────────────────────────────────────────────
  // Sports qualify for the primary hub from today's artifacts, not from a hardcoded list. UFC used
  // to sit here every day because a settled archive exists, which reads as "UFC is running" when
  // the card settled 2026-06-15 and there is no fight model. History is not activity.
  const mlbState = deriveSportState({
    slateDate: serverToday,
    artifactDate: today,
    leans: mlbLeans,
    inSeason: true,                       // MLB regular season — the daily product runs
  });
  // ── NFL + UFC now publish live simulations, so the hub reads their artifacts instead of the
  //    hard-coded "MLB is the only sport" assumption this page shipped with. Each count is read from
  //    the same artifact its own page renders, so the homepage can never claim coverage that is not
  //    actually built. A missing artifact yields 0 and the sport falls to secondary on its own.
  const readCount = (rel: string, pick: (d: Record<string, unknown>) => number): number => {
    try { return pick(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8"))); }
    catch { return 0; }
  };
  const nflGames = readCount("nfl/game-simulations/latest.json", (d) => (d.games as unknown[] | undefined)?.length ?? 0);
  const nflPicks = readCount("nfl/game-simulations/latest.json",
    (d) => ((d.games ?? []) as Array<{ generatedPicks?: unknown[] }>).reduce((n, g) => n + (g.generatedPicks?.length ?? 0), 0));
  const ufcBouts = readCount("ufc/card-latest.json", (d) => (d.bouts as unknown[] | undefined)?.length ?? 0);
  const ufcPredicted = readCount("ufc/card-latest.json",
    (d) => ((d.bouts ?? []) as Array<{ prediction?: unknown }>).filter((b) => b.prediction).length);
  const ufcSlateDate = (() => {
    try { return String(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "card-latest.json"), "utf8")).event?.slateDate ?? ""); }
    catch { return ""; }
  })();

  const nflState = deriveSportState({
    slateDate: serverToday,
    artifactDate: today,
    leans: nflPicks,
    inSeason: nflGames > 0,
  });
  const ufcState = deriveSportState({
    slateDate: serverToday,
    artifactDate: ufcSlateDate || "2026-06-15",
    leans: ufcPredicted,
    inSeason: ufcPredicted > 0,   // bouts alone are a schedule; predictions are what make it live
    // UFC runs on cards, not on daily slates: the read is published days before fight night and
    // holds until it. Without this the classifier fell through to "in season · no qualified slate",
    // which reads as a quiet day when in fact a full card is five days out.
    nextEventDate: ufcPredicted > 0 && ufcSlateDate ? ufcSlateDate : null,
  });

  const allSports = [
    {
      id: "mlb",
      state: mlbState,
      card: {
        href: "/mlb",
        label: "MLB Simulations",
        blurb: "Moneyline / run line / total, plus a 10,000-run player-prop sim where the artifact exists.",
        status: mlbGames > 0 ? `${mlbLeans} model leans` : stateLabel(mlbState),
        statusSub: "market-anchored · paper-only",
        cta: "Enter",
        accent: "var(--gtp-bank-heat)",
      },
    },
    {
      id: "nfl",
      state: nflState,
      card: {
        href: "/nfl",
        label: "NFL Simulations",
        blurb: "Projected score, win probability and a full player board from 10,000 simulated games.",
        status: nflGames > 0 ? `${nflGames} games · ${nflPicks.toLocaleString()} player markets` : stateLabel(nflState),
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
        blurb: ufcPredicted > 0 ? "Winner, method of victory and finishing round for every bout on the card." : "No upcoming card has enough fighter history to model — the schedule is published without a read.",
        status: ufcPredicted > 0 ? `${ufcPredicted} of ${ufcBouts} bouts predicted` : stateLabel(ufcState, { artifactDate: ufcSlateDate || "2026-06-15" }),
        statusSub: ufcPredicted > 0 ? "experimental · paper-only" : "schedule only · no fighter history yet",
        cta: ufcPredicted > 0 ? "Enter" : "View the card",
        accent: ufcPredicted > 0 ? "var(--sport-ufc)" : "var(--vault-text-mute)",
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
        latestSlateHasGames={mlbGames > 0 || (topPicks ?? 0) > 0}
        archiveHref="/today"
        archiveLabel="See the most recent slate"
        includeMlbNote
      />

      {/* 1 — Simulation-first hero. It carries no money figure: a paper bankroll beside a paper record
          on the front door reads as a return, and the ONE claim above it is that we are behind the
          market. The record and every settled card live on /results. */}
      <LandingHero readyCount={simulationsToday} />

      {/* 2 — Today's MLB destination hook: freshness + availability + one path into the /today brief. */}
      <HomeTodayMlb
        dateLabel={dateLabel}
        games={homeBrief.overview.games}
        simulationsReady={homeBrief.overview.simulationsReady}
        lastUpdatedIso={homeBrief.lastUpdatedIso}
        isLiveToday={today >= serverToday && mlbGames > 0}
      />


      {/* 3 — Before you open a sportsbook: what data exists for today + when the book was captured.
          Availability only — counts and capture provenance, never a suggested action. */}
      <PreSportsbookStrip coverage={marketCoverage} dateLabel={dateLabel} />

      {/* 4 — Simulation Hub: the per-sport simulation centers (the core product topic) */}
      <FlagshipCards
        cards={simHubCards}
        heading="Simulation Hub"
        subtitle="Sports with activity on today's slate"
        ariaLabel="Sport simulation centers"
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
          Simulation Hub by contract: schedule availability is not simulation coverage, and these four
          sports must never render as hub peers of MLB. One line per sport, status in words. */}
      <section aria-label="Upcoming sports schedule status" style={{ marginTop: 8 }}>
        <UpcomingSportsStrip sports={allUpcoming({ nowIso: new Date().toISOString() }) as SportSchedule[]} />
      </section>

      {/* 5 — Flagship products, powered by the simulations. Each card carries its own current status,
          which is why the page no longer repeats those statuses in a second slate-summary block. */}
      <FlagshipCards
        cards={productCards}
        heading="Flagship products"
        subtitle="Bank Builder · Moonshot · Results — paper-only"
        ariaLabel="Flagship products"
      />

      {/* 6 — Featured simulations (real ready artifacts only) */}
      <FeaturedSimulationsSection featured={featured} readyCount={readyCount} answers={gameAnswers} />

      {/* 7 — How it works */}
      <HowItWorks />

      {/* 8 — Footer CTA */}
      <FooterCta />
    </div>
  );
}
