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
import TerminalSummaryPanel from "@/components/research/terminal-summary-panel";
import { loadTerminal } from "@/lib/research/public-contract-adapter";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { buildAllGameDetails } from "@/lib/game-detail";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { buildHomeGameAnswers } from "@/lib/home/game-answers";
import { buildDailyBrief } from "@/lib/today/daily-brief";
import { buildMarketCoverage } from "@/lib/today/market-coverage";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";

import LandingHero from "@/components/home/landing-hero";
import HomeTodayMlb from "@/components/home/home-today-mlb";
import PreSportsbookStrip from "@/components/home/pre-sportsbook-strip";
import FlagshipCards, { type FlagshipCard } from "@/components/home/flagship-cards";
import FeaturedSimulationsSection from "@/components/home/featured-simulations";
import { HowItWorks, FooterCta } from "@/components/home/home-sections";
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
  const { featured, readyCount } = featuredSimulations(details, currentEtDate());
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
  const simHubCards: FlagshipCard[] = [
    {
      href: "/mlb",
      label: "MLB Simulations",
      blurb: "Moneyline / run line / total, plus a 10,000-run player-prop sim where the artifact exists.",
      status: mlbGames > 0 ? `${mlbLeans} model leans` : "No MLB slate on the board right now",
      statusSub: "market-anchored · paper-only",
      cta: "Enter",
      accent: "#3b82f6",
    },
    {
      href: "/ufc",
      label: "UFC Simulations",
      blurb: "Market-implied moneyline reads + experimental method insight. Never in a product card.",
      status: "Experimental · market-implied",
      statusSub: "moneyline only · paper-only",
      cta: "Enter",
      accent: "#ef4444",
    },
  ];
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
  const serverToday = currentEtDate();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-9">
      {/* Research-terminal positioning, read from the canonical contract. This is the ONLY place the
         page states how the model compares to the sportsbook — with the settled counts and the scores
         under it. A homepage that shows a hit rate while omitting that comparison is technically
         silent and practically misleading. */}
      <TerminalSummaryPanel terminal={loadTerminal()} />

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
      <LandingHero readyCount={readyCount} />

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
        subtitle="MLB · UFC — pick a sport, run its simulations"
        ariaLabel="Sport simulation centers"
      />

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
