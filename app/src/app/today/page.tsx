/**
 * /today — the DAILY MODEL HUB. A clean, operational, scan-in-10-seconds board for the day's slate:
 * the top model reads (ranked), the simulation-ready games, and every product's HONEST status
 * (Bank Builder / Build-a-Pick / Longshot Lab), plus no-play discipline notes and a results reminder.
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
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import { buildAllGameDetails } from "@/lib/game-detail";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { buildPublicDualLadder } from "@/lib/bank-builder/public-dual-ladder";

import EventSpotlight from "@/components/home/event-spotlight";
import { loadHomepageSpotlight } from "@/lib/home/load-spotlight";
import TodayDailySlateHeader from "@/components/today/daily-slate-header";
import TodayAtAGlance, { type GlanceCard } from "@/components/today/at-a-glance";
import TodayTopModelPicks from "@/components/today/top-model-picks";
import TodaySimulationLeans from "@/components/today/simulation-leans";
import {
  BuildAPickModule,
  BankBuilderStatus,
  LongshotLabStatus,
  NoPlayNotes,
  ResultsReminder,
  SecondaryLinks,
  type SecondaryLink,
} from "@/components/today/status-modules";

export const metadata = {
  title: "Today · GameTime Picks",
  description:
    "Today's model hub — the day's top model reads, simulation-ready games, and every product's honest status (Bank Builder, Picks Lab, Moonshot). Paper-only, educational; no-play shown honestly.",
};

const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TodayPage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  // Frame on the presented slate (the latest generated slate), same pointer Home uses, so every figure
  // lines up with `/`. Falls back to the wall clock only when no slate exists.
  const today = currentSlateDate() ?? currentEtDate();
  const serverToday = currentEtDate();
  // Event spotlight (same reusable selector as Home) — real ET clock so "tomorrow/today" is honest.
  const todaySpotlight = loadHomepageSpotlight(serverToday);
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // ── MLB slate — same loader Home + the old board used ──
  const mlb = getMlbBoardForDate(today);
  const mlbGames = mlb.summary.scheduledGames ?? 0;
  const mlbLeans = mlb.summary.leans ?? 0;

  // ── Simulation-ready games — REAL ready artifacts only, via the shared selector (no new data path) ──
  const details = buildAllGameDetails();
  const { featured, readyCount } = featuredSimulations(details);

  // ── Top model picks — the canonical cross-sport board; take the strongest ~6 for the compact list ──
  const top10 = buildTop10Board(dataRoot, today, Date.now());
  const topPicks = (top10.overall ?? []).slice(0, 6);

  // ── CANONICAL money / exposure — identical sources to Home; never recomputed or hardcoded ──
  const dailyPortfolio = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const openExposureLabel = usd2(dailyPortfolio.openExposure);

  // ── Record — read from the canonical portfolio.json (the fields AchievementBanner surfaces). Fail
  //    closed to null so a figure is only ever shown when it can be sourced canonically. ──
  let recordLabel: string | null = null;
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
    /* fail closed → the results reminder omits any figure it cannot source canonically */
  }

  // ── Bank Builder status — derived HONESTLY (never a hardcoded "active" card), same pattern as Home.
  //    `available === false` ⇒ no qualified card ⇒ NO-PLAY. The awaiting rung is read from the public
  //    dual-ladder view (Lane A cleared its earlier rungs, now awaiting the next card); the exposure is
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
  const bbStepPhrase = awaitingRung != null ? `awaiting Step ${awaitingRung}` : "awaiting next card";
  const bbStatusValue = bbNoPlay ? "No-play" : bbHasActiveCard ? "Active card" : "Awaiting card";
  const bbReason = bbNoPlay
    ? "No qualified card cleared the model bar today — the ladder holds rather than force a play."
    : bbHasActiveCard
      ? "An approved lane is placed as the active paper ladder — settles from official results only."
      : "The next-rung card is pending approval — no exposure is placed until it is.";

  // ── Longshot / Moonshot status — no active Moonshot card today ⇒ honest no-play (code label stays
  //    `product: "moonshot"` and the /moonshot href; the visible label is "Longshot Lab"). ──
  const moonshotActive = dailyPortfolio.cards.some((c) => c.product === "moonshot" && c.status === "active");
  const longshotStatusValue = moonshotActive ? "Active" : "No-play";
  const longshotReason = moonshotActive
    ? "A high-variance longshot lane is live today — only what is still rolling is ever at risk."
    : "No qualified high-variance longshot today. This lane sits out far more often than it plays — that is the design.";

  // ── Build-a-Pick — the engine's suggested-card count for today (public label "Build-a-Pick" → /picks). ──
  const engineSlate = loadTodaySlate();
  const engineSuggested = engineSlate.allSuggested.length;
  const bapStatus = engineSlate.available && engineSuggested > 0 ? `${engineSuggested} model card${engineSuggested === 1 ? "" : "s"}` : "No cards today";
  const bapSuggestedLine = engineSlate.available && engineSuggested > 0
    ? "Model-ranked, leakage-validated legs — build any card and see the projected paper return."
    : "No model-qualified legs cleared today — the builder returns with the next slate.";

  // ── Active-sport labels for the header (MLB when a board exists; kept honest — no stale soccer sim). ──
  const activeSports: string[] = [];
  if (mlbGames > 0) activeSports.push("MLB");

  // ── Section 2 · Today at a glance — 5 compact status cards, each a canonical figure + a CTA. ──
  const glanceCards: GlanceCard[] = [
    {
      label: "Simulations",
      value: readyCount > 0 ? `${readyCount} ready` : "None ready",
      sub: readyCount > 0 ? "deterministic game sims" : "return with the next slate",
      href: "/simulate",
      tone: readyCount > 0 ? "gold" : "mute",
    },
    {
      label: "Top model reads",
      value: topPicks.length > 0 ? `${topPicks.length} ranked` : "No-play",
      sub: topPicks.length > 0 ? "strongest reads of the day" : "no qualified reads today",
      href: "#top-model-picks",
      tone: topPicks.length > 0 ? "gold" : "mute",
    },
    {
      label: "Bank Builder",
      value: bbStatusValue,
      sub: `${bbStepPhrase} · ${openExposureLabel}`,
      href: "/bank-builder",
      tone: bbNoPlay ? "mute" : "success",
    },
    {
      label: "Picks Lab",
      value: bapStatus,
      sub: engineSuggested > 0 ? "open the daily builder" : "no cards today",
      href: "/picks",
      tone: engineSuggested > 0 ? "gold" : "mute",
    },
    {
      label: "Results",
      value: recordLabel ?? "Track record",
      sub: pendingLabel ?? "official settlement only",
      href: "/results",
      tone: "gold",
    },
  ];

  // ── Section 8 · No-play / unavailable notes — honest, discipline-framed. Built from the real states. ──
  const noPlayNotes: string[] = [];
  if (bbNoPlay) noPlayNotes.push(`Bank Builder is no-play today (${bbStepPhrase}, ${openExposureLabel} open exposure) — the ladder never forces a card to keep a streak alive.`);
  if (!moonshotActive) noPlayNotes.push("Moonshot is no-play — the high-variance lane only plays when a qualified longshot appears, and today none did.");
  if (readyCount === 0) noPlayNotes.push("No simulation artifact is ready for this slate yet; simulations are deterministic and only shown when genuinely generated — never faked.");
  noPlayNotes.push("There is no soccer game simulation — World Cup reads come from real de-vigged market prices, not a fabricated match sim.");
  noPlayNotes.push("Pending is not a loss: a card settles only against the official final, and unsettled cards are never counted against the record.");

  // ── Section 10 · Secondary links — compact link cards out (no large widgets duplicated here). ──
  const secondaryLinks: SecondaryLink[] = [
    { href: "/simulate", label: "Simulate", sub: "Game sims" },
    { href: "/results", label: "Results", sub: "Receipts" },
    { href: "/bank-builder", label: "Bank Builder", sub: "The ladder" },
    { href: "/picks", label: "Picks Lab", sub: "Daily builder" },
    { href: "/games", label: "Game Reports", sub: "Model reads" },
    { href: "/learn", label: "How It Works", sub: "Methodology" },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-7">
      {/* 0 — Slate liveness (real ET clock): on a no-games day this says so plainly and points at the next
          scheduled focus, so the most-recent slate is never presented as live. Hidden on a live day. */}
      <SlateLivenessBanner
        buildTimeToday={serverToday}
        latestSlate={today}
        latestSlateHasGames={mlbGames > 0 || topPicks.length > 0}
        archiveHref="/results"
        archiveLabel="See results & receipts"
        includeMlbNote
      />

      {/* 1 — Daily slate header (operational, not a giant Home hero) */}
      <TodayDailySlateHeader
        dateLabel={dateLabel}
        slateDate={today}
        serverToday={serverToday}
        activeSports={activeSports}
        mlbGames={mlbGames}
        mlbLeans={mlbLeans}
      />

      {/* 1b — Event spotlight (current major event; null when none) */}
      <EventSpotlight event={todaySpotlight} />

      {/* 2 — Today at a glance (compact canonical status cards) */}
      <TodayAtAGlance cards={glanceCards} />

      {/* 3 — Top model picks (compact ranked list from the canonical Top-10 board) */}
      <TodayTopModelPicks picks={topPicks} />

      {/* 4 — Simulation-backed games (real ready artifacts only) */}
      <TodaySimulationLeans featured={featured} readyCount={readyCount} />

      {/* 5 — Build-a-Pick module */}
      <BuildAPickModule
        status={bapStatus}
        suggestedLine={bapSuggestedLine}
        note="Paper-only — the builder places no exposure and never settles a card for you."
      />

      {/* 6 — Bank Builder status (derived; never hardcoded) */}
      <BankBuilderStatus
        statusValue={bbStatusValue}
        stepLine={`${bbStepPhrase} · no active card`}
        exposureLine={`Open exposure ${openExposureLabel}`}
        reason={bbReason}
      />

      {/* 7 — Longshot Lab status (compact; not made to look Tier-1 when inactive) */}
      <LongshotLabStatus statusValue={longshotStatusValue} reason={longshotReason} />

      {/* 8 — No-play / unavailable notes (discipline, not failure) */}
      <NoPlayNotes notes={noPlayNotes} />

      {/* 9 — Results / settlement reminder */}
      <ResultsReminder recordLabel={recordLabel} pendingLine={pendingLabel} />

      {/* 10 — Secondary links */}
      <SecondaryLinks links={secondaryLinks} />
    </div>
  );
}
