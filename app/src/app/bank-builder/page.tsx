/**
 * /bank-builder — a clean, focused product page. Only three things:
 *   1. The ladder + current status (bankroll, step, public record, today's card status).
 *   2. Today's official Bank Builder card (the pending Step-3 candidate), if one exists.
 *   3. Previous hits (settled ladder steps + public record).
 * No Plus100 builder, no audit logs, no unrelated projections. Presentation only — the bankroll /
 * ledger are read from the public artifact and never mutated here. Paper-only, educational.
 */
import Link from "next/link";

import PreviousHits from "@/components/bank-builder/previous-hits";
import { loadOfficialStepCandidate } from "@/lib/world-cup-flex";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import { latestMlbBoardDate } from "@/lib/mlb/mlb-props";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { deriveProductState, productStateLabel, productStateExplanation, isLive } from "@/lib/products/product-state.mjs";
import { currentEtHour } from "@/lib/daily-freshness-slo.mjs";
import { buildPublicDualLadder, type PublicStepStatus } from "@/lib/bank-builder/public-dual-ladder";
import ClimbHero, { type ClimbLane, type ClimbRung, type ClimbClearedDetail } from "@/components/bank-builder/climb-hero";
import { readLaneReviewCard } from "@/lib/bank-builder/review-card";
import BankBuilderSkippedCard from "@/components/bank-builder/bank-builder-skipped-card";
import BankBuilderProposalCard from "@/components/bank-builder/bank-builder-proposal-card";
import { strongestSlatePicks } from "@/lib/world-cup/structured-moonshot";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import fs from "node:fs";
import path from "node:path";
import { getSportIdentity } from "@/lib/sport-identity";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  BANK_BUILDER_STEP_COUNT,
  formatLadderUsd,
  formatLadderUsdPrecise,
  resolveLadderStep,
} from "@/lib/bank-builder-ladder";
import {
  loadPublicBankBuilderSummary,
  loadPublicBankBuilderLedger,
} from "@/lib/data-bank-builder";
import { loadStep5TargetStatus } from "@/lib/bank-builder-step5-target";

const BANK = getSportIdentity("bank_builder");

/** Format a ledger ISO date (YYYY-MM-DD) as "Jun 12, 2026" in UTC (date-stable). */
function fmtUtcDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Completed $100 → $10K ladders for the ClimbHero proof strip. READ-ONLY: reads the same canonical
 * `mr-dub/banked-ladders.json` that `crownLadderSummary` reads and returns each ladder's REAL `start`/
 * `final`/record verbatim — never recomputes or invents a money figure. Returns [] on any read error
 * (fail-closed → the hero omits the proof rather than showing a fabricated number).
 */
function readCompletedLadders(root: string): Array<{ start: number; final: number; recordLabel: string; pathLabel: string }> {
  try {
    const banked = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "banked-ladders.json"), "utf8"));
    return (banked.ladders ?? [])
      .filter((l: any) => typeof l.final === "number" && Number.isFinite(l.final))
      .map((l: any) => {
        const steps = l.steps ?? [];
        const wins = steps.filter((s: any) => s.result === "won" || s.result === "win").length;
        const losses = steps.filter((s: any) => s.result === "lost" || s.result === "loss").length;
        const start = Number(l.start ?? 100);
        const final = Number(l.final);
        return { start, final, recordLabel: `${wins}–${losses}`, pathLabel: `${usd2(start)} → ${usd2(final)}` };
      });
  } catch {
    return [];
  }
}

/** The official settled detail of each CLEARED step for a lane — read verbatim from the append-only
 *  settlement ledger (`mr-dub/ledger.json`), keyed by step. Only publicly-visible cleared steps are
 *  surfaced. Fail-closed: returns {} on a read error (the rung omits the detail rather than fabricate
 *  one). Never recomputes or invents a money figure — powers the expandable "how this step cleared". */
function readClearedSteps(root: string, laneId: string): Record<number, ClimbClearedDetail> {
  try {
    const led = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "ledger.json"), "utf8"));
    const events: any[] = Array.isArray(led?.events) ? led.events : [];
    const out: Record<number, ClimbClearedDetail> = {};
    for (const e of events) {
      if (e?.type !== "lane_step_won" || e?.laneId !== laneId || !e?.publicBankBuilderVisible) continue;
      const step = Number(e.step);
      if (!Number.isFinite(step)) continue;
      out[step] = { // chronological ledger → last write wins (the current cycle's step)
        date: String(e.date ?? ""),
        stake: Number(e.paperStake ?? 0),
        returned: Number(e.paperReturn ?? 0),
        profit: Number(e.paperProfit ?? 0),
        combinedOdds: typeof e.combinedOdds === "number" ? e.combinedOdds : null,
        settledStatus: String(e.status ?? "settled"),
        source: (e.legs ?? []).find((l: any) => l?.source)?.source ?? null,
        legs: (e.legs ?? []).map((l: any) => ({
          selection: String(l.selection ?? ""),
          market: l.market ?? null,
          officialResult: l.officialResult ?? null,
          result: String(l.result ?? "won"),
        })),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Map a public-dual-ladder step status → the ClimbHero rung status (a lost step is never surfaced
 *  by the view model, so it presents as "upcoming"; a queued restart presents as "awaiting"). */
const RUNG_STATUS: Record<PublicStepStatus, ClimbRung["status"]> = {
  cleared: "completed",
  active: "active",
  awaiting: "awaiting",
  queued: "awaiting",
  upcoming: "upcoming",
};

const META_TITLE = "Bank Builder · GameTime Picks";
const META_DESCRIPTION =
  "An educational $100 → $10,000 paper-bankroll ladder — one card per step. The current run, today's official card, and previous hits. Paper-only; we do not take real money.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: { title: META_TITLE, description: META_DESCRIPTION, type: "website", url: "/bank-builder/" },
  twitter: { card: "summary_large_image", title: META_TITLE, description: META_DESCRIPTION },
};

export default function BankBuilderPage() {
  const pubSummary = loadPublicBankBuilderSummary();
  const pubLedger = loadPublicBankBuilderLedger();
  const currentBankroll = pubSummary?.currentBankrollUnits ?? BANK_BUILDER_BASE;
  const rec = pubSummary?.record ?? { wins: 0, losses: 0, pushes: 0 };
  const recordLabel = `${rec.wins}–${rec.losses}${rec.pushes ? `–${rec.pushes}` : ""}`;
  // Crown reached: bankroll has cleared the $10,000 goal (resolveLadderStep → null) with a
  // clean card — the ladder is COMPLETE. We pin the display rung to the final step (not the
  // Step-1 fallback) so labels read $3,500 → $10,000.
  const completed = resolveLadderStep(currentBankroll) === null && rec.losses === 0;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[BANK_BUILDER_STEP_COUNT - 1];
  // The official candidate is loaded for the ACTIVE rung (stake = full current bankroll,
  // floor = the rung's ladder goal). The loader returns null for stale slates and after a
  // step settles, so a settled card can never re-render as pending — it lives in Previous
  // hits instead.
  // A PUBLISHED candidate artifact (may mix sports) takes precedence over the
  // World-Cup-derived generator; both are pending-only and freshness/step gated.
  const publishedCandidate = loadOfficialPublishedCandidate();
  // Final step (Step 5 · Road to $10K): the brief is explicit that the final card is NOT
  // published yet — it only appears once the model+market gates clear a real slate. So on
  // the final rung we never run the data generator (no invented Step 5 parlay); the page
  // shows the "Step 5 review pending" panel instead.
  const isFinalStep = activeStep.step >= BANK_BUILDER_STEP_COUNT;
  // The owner-authorized final rung is the best real 2-leg card from tonight's slate —
  // NBA Finals + MLB (cross-sport) or two NBA Finals legs. We compute NBA/MLB readiness so
  // the review panel (shown only when no official candidate is published) is honest.
  const step5Target = isFinalStep ? loadStep5TargetStatus() : null;
  const officialStep3 = publishedCandidate || isFinalStep ? null : pubSummary ? loadOfficialStepCandidate(currentBankroll, activeStep.goal) : null;
  const candidateSports = publishedCandidate
    ? Array.from(new Set(publishedCandidate.legs.map((l) => getSportIdentity(l.sport).label))).join(" + ")
    : null;
  const hits = (pubLedger?.entries ?? []).filter((e) => e.result === "win");
  // The most recently cleared step (highest step number) — its real legs + final-result
  // evidence power the celebratory "latest hit" card above the previous-hits grid.
  const latestHit = hits.length ? hits.reduce((a, b) => (b.step > a.step ? b : a)) : null;
  const onTheCrownRun = isFinalStep && rec.losses === 0 && hits.length === BANK_BUILDER_STEP_COUNT - 1;

  const bbPreview = loadTodaySlate().bankBuilderPreview;

  // Today's daily portfolio — feeds the ClimbHero (current/peak bankroll, open exposure, lane cards).
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);

  // ── PRODUCT STATE (Program 140) ───────────────────────────────────────────────────────────────
  // Read from THIS PRODUCT'S OWN artifact, never the MLB slate. The two diverge exactly when the
  // card generator has not run — which is the fifteen-day window in which this page said
  // "Live today" over 2026-07-21 cards.
  const bbArtifact = ((): { date: string | null; cards: number } => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "daily-portfolio.json"), "utf8"));
      const cards = Array.isArray(j.lanes)
        ? j.lanes.filter((l: { product?: string; status?: string }) => l.product === "bank-builder" && l.status === "active").length
        : 0;
      return { date: typeof j.date === "string" ? j.date : null, cards };
    } catch {
      return { date: null, cards: 0 };
    }
  })();
  /*
   * "NO QUALIFIED CARD" CLAIMS THE SLATE WAS CHECKED. Pass the evidence for that claim.
   *
   * deriveProductState has carried INPUTS_MISSING/INPUTS_STALE — "today's source data has not
   * arrived yet, so no card has been assessed" — since it was written, and no caller has ever
   * passed `inputsMissing` or `inputsDate`. Both branches were unreachable, so EVERY cardless day
   * fell through to "Today's slate was checked in full and nothing met the card's qualification
   * policy", including days where nothing was checked because there was nothing to check.
   *
   * On 2026-08-17 the morning board had not published by 09:40 ET. The daily portfolio existed and
   * was dated today (CI regenerates it regardless), so the artifact looked present while its INPUT
   * was absent — and the page told visitors the day's eleven games had been assessed and rejected.
   *
   * MLB is the only sport currently cleared to place live paper cards, so its board IS this
   * product's input; when the board is behind today, the honest answer is that the data has not
   * arrived, not that the slate lost on merit.
   */
  const bbInputsDate = latestMlbBoardDate(path.join(process.cwd(), "public", "data"), currentEtDate());
  const bbProductState = deriveProductState({
    productDate: currentEtDate(),
    artifactDate: bbArtifact.date,
    publishedCards: bbArtifact.cards,
    inputsMissing: bbInputsDate == null,
    inputsDate: bbInputsDate,
  });
  // The real ET hour lets the label distinguish "the morning generator has not run YET" (expected
  // overnight) from "it missed its window" (alarming) — same NOT_RUN state, honest framing.
  // currentEtHour carries the %24 guard for Intl's midnight "24" quirk.
  const bbStateLabel = productStateLabel(bbProductState, { artifactDate: bbArtifact.date, productDate: currentEtDate(), etHour: currentEtHour() });
  const bbStateExplanation = productStateExplanation(bbProductState);
  const bbProposal = buildBankBuilderProposal(path.join(process.cwd(), "public", "data"), today);

  // ── ClimbHero props — built ONLY from data already loaded above (dailyPortfolio + bbPreview +
  //    crownLadderSummary's artifact). No new model/money computation; values are read verbatim.
  const completedLadders = readCompletedLadders(path.join(process.cwd(), "public", "data"));
  // Public-dual-ladder view models give the rung states (cleared/active/awaiting/upcoming) without ever
  // surfacing a lost step — exactly what the hero needs. The day's Bank Builder card (stake/odds/return/
  // legs) comes from the daily portfolio. Both are already loaded; nothing is recomputed.
  const climbLanes: ClimbLane[] = (["A", "B"] as const)
    .map((letter): ClimbLane | null => {
      const laneId = letter === "A" ? ("lane-a" as const) : ("lane-b" as const);
      const view = buildPublicDualLadder(letter === "A" ? bbPreview.laneA : bbPreview.laneB, laneId);
      if (!view) return null;
      // A card is "placed" ONLY when it is APPROVED (status "active"). A "candidate"/"awaiting" lane is a
      // proposal pending founder approval — it must render as "Awaiting a qualified card" (no profit
      // projection), NEVER as today's active card. (2026-07-07: a rejected Under-2.5 candidate was
      // rendering with a "+$489 profit" card; candidate ≠ active ≠ approved.)
      const card = dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === letter && c.status === "active") ?? null;
      const hasCard = !!card && card.legs.length > 0;
      // No placed money card → look for an ACTIVE review card in the ladder artifact (paper · $0). Its
      // legs ARE shown for founder/public review, but hasCard stays false so exposure/seed never count it.
      const reviewCard = !hasCard ? readLaneReviewCard(path.join(process.cwd(), "public", "data"), letter === "A" ? "laneA" : "laneB") : null;
      const hasReview = !!reviewCard && reviewCard.legs.length > 0;
      // The active rung is the one carrying today's card; fall back to awaiting, then currentStep.
      const curRung =
        view.steps.find((s) => s.status === "active") ??
        view.steps.find((s) => s.status === "awaiting" || s.status === "queued") ??
        view.steps.find((s) => s.step === view.currentStep) ??
        null;
      const statusTone: ClimbLane["statusTone"] =
        view.currentStatus === "completed" ? "completed"
          : hasCard ? "active"                        // a real money card is placed → live heat
          : hasReview ? "awaiting"                    // review card is paper · $0 → gold, never live-money red
          : view.currentStatus === "advanced" ? "advanced" : "awaiting"; // no card → gold "awaiting", never a bare "active"
      const statusLabel =
        view.currentStatus === "completed" ? "🏆 $10K reached"
          : hasCard ? "Active · today's card"
          : hasReview ? `Step ${reviewCard!.step} · Review · Paper $0`
          : view.currentStatus === "advanced" ? "Advanced"
          // No placed card + no review card → honestly awaiting (never a bare "Active" with nothing behind it).
          : `Step ${curRung?.step ?? view.currentStep ?? 1} · Awaiting a qualified card`;
      // Cycle # from the lane label ("… lane (cycle 5)") if present — display-only, never fabricated.
      const cycleMatch = /cycle\s+(\d+)/i.exec(view.label === "Lane A" ? (bbPreview.laneA?.label ?? "") : (bbPreview.laneB?.label ?? ""));
      // Official settled detail for each CLEARED step (from the ledger) → the expandable "how it cleared".
      const clearedByStep = readClearedSteps(path.join(process.cwd(), "public", "data"), laneId);
      const rungs: ClimbRung[] = view.steps.map((s) => {
        const status = RUNG_STATUS[s.status];
        return {
          step: s.step,
          startTarget: s.startTarget,
          goalTarget: s.goalTarget,
          status,
          cleared: status === "completed" ? (clearedByStep[s.step] ?? null) : null,
        };
      });
      return {
        id: laneId,
        label: view.label,
        name: null,
        statusLabel,
        statusTone,
        step: curRung?.step ?? reviewCard?.step ?? view.currentStep ?? null,
        cycle: cycleMatch ? Number(cycleMatch[1]) : null,
        stake: card?.stake ?? (hasReview ? 0 : null), // review card is $0 — nothing placed
        combinedOdds: card?.combinedOdds ?? reviewCard?.combinedOdds ?? null,
        potentialReturn: card?.potentialReturn ?? null, // review → no money projection
        goalTarget: curRung?.goalTarget ?? null,
        hasCard,
        reviewMode: hasReview,
        reviewNote: reviewCard?.reviewNote ?? null,
        rungs,
        legs: hasReview
          ? reviewCard!.legs
          : (card?.legs ?? []).map((l) => ({
              selection: l.selection,
              market: l.marketLabel,
              odds: l.odds,
              kickoff: l.kickoffEt ?? null, // real kickoff (ET) from the persisted leg — never fabricated
              game: l.matchup,
              why: null,
              player: l.player ?? null,
            })),
        nextKickoff: null,
      };
    })
    .filter((l): l is ClimbLane => l !== null);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      {/* Operating state from THIS product's own artifact (Program 140). The badge previously took
          the MLB slate date, which the daily board keeps current, so a fifteen-day-old set of cards
          rendered under "Live today". `deriveProductState` cannot produce a live label without a
          card published for the current date, and it distinguishes "we ran and nothing qualified"
          from "we never ran" — those rendered identically before. */}
      <div className="mb-3 flex flex-col items-end gap-1">
        {/* The freshness badge answers "is the artifact current?" and says "Live today" when it is.
            That is true of the ARTIFACT but contradicts the product state directly beneath it when
            today's honest answer is a no-play — two labels, one saying live, one saying no card.
            It renders only when a card is actually running; otherwise the state label below is both
            more precise and the only claim on screen. */}
        {isLive(bbProductState) ? (
          <FreshnessBadge slateDate={bbArtifact.date ?? today} serverToday={currentEtDate()} noun="card slate" />
        ) : null}
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: isLive(bbProductState) ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 10 }}
        >
          {bbStateLabel}
        </span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11, maxWidth: "52ch", textAlign: "right" }}>
          {bbStateExplanation}
        </span>
      </div>

      {/* FLAGSHIP — the "live climb" hero: a plain-English, mobile-first front door to the ladder. It is
          purely presentational (every figure is read verbatim from the data loaded above) and sits ABOVE
          the existing dense ladder components, which remain below unchanged. */}
      <ClimbHero
        currentBankroll={dailyPortfolio.activeBankroll}
        peakBankroll={dailyPortfolio.crownBankroll}
        openExposure={dailyPortfolio.exposure.core}
        recordLabel={recordLabel}
        lanes={climbLanes}
        completedLadders={completedLadders}
      />

      {/* When a lane is ACTIVE, the ClimbHero above already shows its card + the expandable cleared-step
          history — so we do NOT repeat it here (removes the duplicate "active daily Bank Builder"). Only
          when NO lane is active AND no review card is showing do we render the fresh proposal, else the
          premium "model skipped" no-play. (A review card in the hero would otherwise be contradicted by a
          "model skipped" panel directly below it.) */}
      {!dailyPortfolio.cards.some((c) => c.product === "bank-builder" && c.status === "active" && c.legs.length > 0)
        && !climbLanes.some((l) => l.reviewMode) ? (
        <div className="mt-5">
          {bbProposal.available
            ? <BankBuilderProposalCard proposal={bbProposal} />
            : <BankBuilderSkippedCard alternatives={strongestSlatePicks(path.join(process.cwd(), "public", "data"), today, 3)} />}
        </div>
      ) : null}

      {/* Moonshot is now its OWN product at /moonshot (mirrors Bank Builder). It is no longer surfaced
          here — Bank Builder stays focused on the core ladder. */}


      {/* SECTION 4 — previous hits */}
      <PreviousHits hits={hits} recordLabel={recordLabel} />

      {/* The "next run" is no longer a teaser — the Dual Bank Builder above is LIVE
          (Run #2, Step 1). The old next-ladder teaser was removed to avoid contradicting it. */}

      {/* SECTION 5 — tiny footer */}
      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking.{" "}
        <Link href="/learn#bank-builder" className="underline" style={{ color: "var(--vault-text-mute)" }}>How it works →</Link>
      </p>
    </div>
  );
}
