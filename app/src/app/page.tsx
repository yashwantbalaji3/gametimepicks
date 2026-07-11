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
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";

import LandingHero from "@/components/home/landing-hero";
import FlagshipCards, { type FlagshipCard } from "@/components/home/flagship-cards";
import FeaturedSimulationsSection from "@/components/home/featured-simulations";
import { SlateSummary, TrustStrip, HowItWorks, FooterCta } from "@/components/home/home-sections";
import EventSpotlight from "@/components/home/event-spotlight";
import { loadHomepageSpotlight } from "@/lib/home/load-spotlight";

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
  const { featured, readyCount } = featuredSimulations(details);

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

  // ── Four flagship product cards — status lines built from the canonical figures above ──
  const flagshipCards: FlagshipCard[] = [
    {
      href: "/simulate",
      label: "Simulate",
      blurb: "Run a sport-specific model simulation dashboard for today's games.",
      status: readyCount > 0 ? `${readyCount} games simulation-ready` : "Simulations return with the next slate",
      // The "1,000-run" claim is shown ONLY when the featured artifacts actually carry it (honest).
      statusSub:
        readyCount > 0 && featured.some((f) => f.runCountLabel)
          ? "1,000-run deterministic sims · same output for every user"
          : "Deterministic · same output for every user",
      cta: "Run a Simulation",
      accent: "var(--vault-gold-bright)",
    },
    {
      href: "/today",
      label: "Today's Picks",
      blurb: "See the daily paper-only model slate.",
      status: mlbGames > 0 ? `${mlbLeans} MLB model leans` : "No board yet",
      statusSub: "No-play notes shown honestly · paper-only",
      cta: "View Today's Picks",
      accent: "var(--gtp-bank-heat)",
    },
    {
      href: "/bank-builder",
      label: "Bank Builder",
      blurb: "Follow the disciplined ladder challenge.",
      status: bbNoPlay ? `No-play · ${bbStepPhrase}` : bbStepPhrase,
      statusSub: `Open exposure ${openExposureLabel} · no active card`,
      cta: "View Bank Builder",
      accent: "var(--vault-gold)",
    },
    {
      href: "/results",
      label: "Results",
      blurb: "Check receipts, settled cards, pending cards, and track record.",
      status: recordLabel ? `Record ${recordLabel}` : "Track record",
      statusSub: pendingLabel ? `${pendingLabel} · official settlement only` : "Official settlement only",
      cta: "View Results",
      accent: "var(--vault-success)",
    },
  ];

  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Homepage Event Spotlight — the current major event, pinned above the hero (UFC 329 first). Reusable
  // selector; market-implied only; a settled card is never spotlighted. Null ⇒ normal homepage.
  const spotlightEvent = loadHomepageSpotlight(today);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-9">
      {/* 0 — Event Spotlight: the current major event, pinned above the hero (null when none) */}
      <EventSpotlight event={spotlightEvent} />

      {/* 1 — Simulation-first hero */}
      <LandingHero bankrollLabel={bankrollLabel} recordLabel={recordLabel} readyCount={readyCount} />

      {/* 2 — Four flagship product cards (live, prop-driven status) */}
      <FlagshipCards cards={flagshipCards} />

      {/* 3 — Featured simulations (real ready artifacts only) */}
      <FeaturedSimulationsSection featured={featured} readyCount={readyCount} />

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
