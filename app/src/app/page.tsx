/**
 * Root route `/` — a focused, premium, simulation-first flagship landing page (NOT the dense Today board).
 * It leads a first-time visitor through the 30-second story in seven sections: a simulation-first hero,
 * four flagship product cards, featured (real, ready-artifact) simulations, a COMPACT slate summary, a
 * trust/receipts strip, a "how it works" explainer, and a footer CTA. The full dense board lives only on
 * `/today` (unchanged) — this page intentionally does NOT render it.
 *
 * MONEY INTEGRITY: every money / record / exposure / step figure is READ here (a server component) from
 * the SAME canonical artifacts the Today board already uses, then passed to the presentational home
 * components as PRE-FORMATTED string/number props. Nothing is recomputed or hardcoded — no record and no
 * dollar literal lives in a component; the components never touch fs/data.
 */
import path from "node:path";
import fs from "node:fs";

import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { buildAllGameDetails } from "@/lib/game-detail";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { buildHomeGameAnswers } from "@/lib/home/game-answers";
import { buildDailyBrief } from "@/lib/today/daily-brief";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";

import LandingHero from "@/components/home/landing-hero";
import WhatThisIs from "@/components/home/what-this-is";
import ReturnHook from "@/components/home/return-hook";
import HomeTodayMlb from "@/components/home/home-today-mlb";
import FlagshipCards, { type FlagshipCard } from "@/components/home/flagship-cards";
import FeaturedSimulationsSection from "@/components/home/featured-simulations";
import { SlateSummary, TrustStrip, HowItWorks, FooterCta } from "@/components/home/home-sections";
import SlateLivenessBanner from "@/components/slate-liveness-banner";

export const metadata = {
  title: "GameTime Picks — Simulate today's games. Review model picks. Track results.",
  description:
    "A simulation-first, paper-only sports model. Run deterministic game simulations, review today's model slate, and follow every result with transparent, official-settlement-only receipts. Free and educational.",
};

const usd0 = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HomePage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  // Frame on the same presented slate the Today board uses so every figure lines up with /today.
  const today = currentSlateDate() ?? currentEtDate();

  // ── CANONICAL money / record — identical sources to the Today board; never recomputed or hardcoded ──
  const dailyPortfolio = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const crown = crownLadderSummary(dataRoot);

  // Record / peak come from the canonical portfolio.json (the fields AchievementBanner surfaces). Fail
  // closed to null so a figure is only ever shown when it can be sourced canonically.
  let recordLabel: string | null = crown?.recordLabel ?? null;
  let peakLabel: string | null = null;
  let pendingLabel: string | null = null;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8"));
    if (p.record && typeof p.record.wins === "number" && typeof p.record.losses === "number") {
      recordLabel = `${p.record.wins}–${p.record.losses}`;
      const settled = p.record.wins + p.record.losses + (p.record.voids ?? 0);
      const pending = p.record.pending ?? 0;
      pendingLabel = `${pending} pending · ${settled} settled`;
    }
    const peak = p.highWaterMark ?? p.peakBankroll ?? p.crownBankroll;
    if (typeof peak === "number") peakLabel = usd0(peak);
  } catch {
    /* fail closed → the trust strip omits any figure it cannot source canonically */
  }

  const bankrollLabel = usd2(dailyPortfolio.activeBankroll);
  const openExposureLabel = usd2(dailyPortfolio.openExposure);

  // ── Featured simulations — REAL ready artifacts only, via the shared selector (no new data path) ──
  const details = buildAllGameDetails();
  const { featured, readyCount } = featuredSimulations(details, currentEtDate());
  // Sprint 015 Phase 1: what each featured simulation CONCLUDED — a lookup over the canonical objects.
  const gameAnswers = buildHomeGameAnswers(details);
  // Daily-MLB destination hook — the SAME brief overview /today leads with (factual counts, no picks).
  const homeBrief = buildDailyBrief(details, today, { nowMs: Date.now() });

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
  const bankBuilderStatus = bbNoPlay
    ? `No-play · ${bbStepPhrase} · open exposure ${openExposureLabel}`
    : bbHasActiveCard
      ? `Active card · ${bbStepPhrase}`
      : `${bbStepPhrase} · open exposure ${openExposureLabel}`;

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

      {/* 1 — Simulation-first hero */}
      <LandingHero bankrollLabel={bankrollLabel} recordLabel={recordLabel} readyCount={readyCount} />

      {/* 1b — Honest three-way separation: what's live · what we're building (gated) · what we don't claim. */}
      <WhatThisIs />

      {/* 1c — Return hook: the honest daily loop (new sims each game day, graded from official box scores). */}
      <ReturnHook latestSettledLabel={today < serverToday ? dateLabel : null} />

      {/* 1d — Today's MLB destination hook: freshness + availability + one path into the /today brief. */}
      <HomeTodayMlb
        dateLabel={dateLabel}
        games={homeBrief.overview.games}
        simulationsReady={homeBrief.overview.simulationsReady}
        lastUpdatedIso={homeBrief.lastUpdatedIso}
        isLiveToday={today >= serverToday && mlbGames > 0}
      />


      {/* 2 — Simulation Hub: the per-sport simulation centers (the core product topic) */}
      <FlagshipCards
        cards={simHubCards}
        heading="Simulation Hub"
        subtitle="MLB · UFC — pick a sport, run its simulations"
        ariaLabel="Sport simulation centers"
      />

      {/* 2b — Flagship products, powered by the simulations */}
      <FlagshipCards
        cards={productCards}
        heading="Flagship products"
        subtitle="Bank Builder · Moonshot · Results — paper-only"
        ariaLabel="Flagship products"
      />

      {/* 3 — Featured simulations (real ready artifacts only) */}
      <FeaturedSimulationsSection featured={featured} readyCount={readyCount} answers={gameAnswers} />

      {/* 4 — Compact today's-slate summary (NOT the full board) */}
      <SlateSummary
        dateLabel={dateLabel}
        mlbGames={mlbGames}
        mlbLeans={mlbLeans}
        topPicks={topPicks}
        bankBuilderStatus={bankBuilderStatus}
        moonshotStatus={moonshotStatus}
      />

      {/* 5 — Trust / receipts strip */}
      <TrustStrip
        recordLabel={recordLabel}
        bankrollLabel={bankrollLabel}
        peakLabel={peakLabel}
        openExposureLabel={openExposureLabel}
        pendingLabel={pendingLabel}
      />

      {/* 6 — How it works */}
      <HowItWorks />

      {/* 7 — Footer CTA */}
      <FooterCta />
    </div>
  );
}
