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
import { deriveBankBuilderState } from "@/lib/products/product-state-view.mjs";
import { currentEtHour } from "@/lib/daily-freshness-slo.mjs";
import { buildPublicDualLadder, type PublicStepStatus } from "@/lib/bank-builder/public-dual-ladder";
import { rungProjection } from "@/lib/bank-builder/rung-economics.mjs";
import { buildTeamMarkIndex, resolveTeamMark } from "@/lib/teams/team-marks.mjs";
import LifecycleRecord from "@/components/products/lifecycle-record";
import { loadLifecycleHistory, settledCardsFor, positionFor } from "@/lib/products/lifecycle-view";
import ClimbHero, { type ClimbLane, type ClimbRung, type ClimbClearedDetail } from "@/components/bank-builder/climb-hero";
import { readLaneReviewCard } from "@/lib/bank-builder/review-card";
import { currentRunSteps, positionFromReceipts, readReceipts } from "@/lib/products/ladder-position.mjs";
import { clearedDetailFromReceipts, laneDisplayFromReceipts, receiptPositionRecord } from "@/lib/bank-builder/receipt-lane-display";
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
import { RUNBOOKS } from "@/lib/launch/runbook-registry.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

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

export const metadata = withRouteMetadata("/bank-builder/", {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: { title: META_TITLE, description: META_DESCRIPTION, type: "website", url: "/bank-builder/" },
  twitter: { card: "summary_large_image", title: META_TITLE, description: META_DESCRIPTION },
});

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
  //
  // P250 · A01: the lane/date/exposure facts come from deriveBankBuilderState — the owner that
  // names every record system and TYPES their disagreements — instead of a page-local re-read of
  // the same file buildDailyPortfolio already parsed. This is that owner's first production
  // consumer; its `divergences` render below rather than being silently resolved.
  const bbDerived = deriveBankBuilderState(path.join(process.cwd(), "public", "data"));
  const bbArtifact = {
    date: bbDerived.date,
    cards: bbDerived.lanes.filter((l: { status?: string }) => l.status === "active").length,
  };
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
  /*
   * Crests for the ladder's legs, resolved from the live feed's OWN name/abbr pairing rather than a
   * typed table — the MLB board publishes homeTeamName beside homeTeamAbbr, so the map cannot drift
   * from what is rendered. Before this, LegAvatar understood World Cup country codes and nothing
   * else, and every MLB leg on the board wore a soccer ball.
   */
  const teamMarks = (() => {
    const readJson = (rel: string) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")); } catch { return null; } };
    const boardsDir = path.join(process.cwd(), "public", "data", "mlb", "boards");
    let mlbGames: unknown[] = [];
    try {
      /*
       * A WINDOW, NOT JUST TODAY. Today's board names ten clubs; a lane's card can reference a team
       * that played yesterday, and with a one-day index those legs silently kept the fallback while
       * the one team on today's slate got a crest — a board where some rows have logos and others
       * do not looks broken in a way that no logo at all does not.
       *
       * Fourteen days covers all thirty clubs many times over and costs a few small reads at build
       * time. The pairing is still the feed's own, so nothing is invented.
       */
      const files = fs.readdirSync(boardsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-14);
      for (const f of files) {
        const doc = JSON.parse(fs.readFileSync(path.join(boardsDir, f), "utf8"));
        // The board publishes its slate under `games`; `events` is the shape other MLB artifacts use.
        // Reading the wrong one fails SILENTLY into an empty index and every leg keeps its fallback.
        mlbGames = mlbGames.concat(doc?.games ?? doc?.events ?? []);
      }
    } catch { /* a partial index is fine: an unresolved leg keeps its fallback, never a wrong crest */ }
    const nflRows = readJson("nfl/schedule/latest.json")?.rows ?? [];
    return buildTeamMarkIndex({ mlbGames: mlbGames as never, nflRows });
  })();

  /* Attach the crest to a leg. A player leg keeps its portrait; a team leg gets its club; anything
     that resolves to nothing keeps the existing fallback rather than wearing a guess. */
  const withMark = <T extends { selection?: string | null; player?: string | null }>(leg: T) => {
    if (leg.player) return leg;
    const mark = resolveTeamMark(leg.selection ?? "", teamMarks);
    return mark ? { ...leg, teamAbbr: mark.abbr, teamSport: mark.sport } : leg;
  };

  /* ONE LADDER RECORD. The generator deals each lane from the official receipts
     (products/ladder-position.mjs); the board reads the same record, so a rung and its card cannot
     disagree. The dual-ladder card store is used only where no placed receipt exists at all. */
  const dataRoot = path.join(process.cwd(), "public", "data");
  const bbReceipts = readReceipts(dataRoot, today);
  const bbPositions = {
    A: positionFromReceipts({ receipts: bbReceipts, product: "bank-builder", lane: "A", ladder: BANK_BUILDER_LADDER as never, seed: BANK_BUILDER_LADDER[0].start }),
    B: positionFromReceipts({ receipts: bbReceipts, product: "bank-builder", lane: "B", ladder: BANK_BUILDER_LADDER as never, seed: BANK_BUILDER_LADDER[0].start }),
  };
  const receiptsDrive = Boolean(bbPositions.A.basis || bbPositions.B.basis);

  const climbLanes: ClimbLane[] = (["A", "B"] as const)
    .map((letter): ClimbLane | null => {
      const laneId = letter === "A" ? ("lane-a" as const) : ("lane-b" as const);
      const tableCard = dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === letter && c.status === "active") ?? null;
      const laneRun = receiptsDrive ? currentRunSteps(bbReceipts, "bank-builder", letter, BANK_BUILDER_LADDER as never) : [];
      const laneDisplay = receiptsDrive
        ? laneDisplayFromReceipts({
            letter, position: bbPositions[letter], run: laneRun,
            card: tableCard && tableCard.legs.length ? { step: tableCard.step, stake: tableCard.stake, combinedOdds: tableCard.combinedOdds, potentialReturn: tableCard.potentialReturn, date: today } : null,
            waitingReason: dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === letter)?.shortfallNote ?? null,
          })
        : (letter === "A" ? bbPreview.laneA : bbPreview.laneB);
      const view = buildPublicDualLadder(laneDisplay, laneId);
      if (!view) return null;
      // A card is "placed" ONLY when it is APPROVED (status "active"). A "candidate"/"awaiting" lane is a
      // proposal pending founder approval — it must render as "Awaiting a qualified card" (no profit
      // projection), NEVER as today's active card. (2026-07-07: a rejected Under-2.5 candidate was
      // rendering with a "+$489 profit" card; candidate ≠ active ≠ approved.)
      const card = dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === letter && c.status === "active") ?? null;
      const hasCard = !!card && card.legs.length > 0;
      // No placed money card → look for an ACTIVE review card in the ladder artifact (paper · $0). Its
      // legs ARE shown for founder/public review, but hasCard stays false so exposure/seed never count it.
      // The review card lives in the frozen card store; when the receipts drive the board it would be a
      // July card beside a September rung, so it is read only in the store's own era.
      const reviewCard = !hasCard && !receiptsDrive ? readLaneReviewCard(path.join(process.cwd(), "public", "data"), letter === "A" ? "laneA" : "laneB") : null;
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
      /*
       * ── ONE BET, THREE NUMBERS THAT AGREE ────────────────────────────────────────────────────
       *
       * The money row shows a stake, a price and a return, and before this they came from three
       * places. The stake came from the daily card (flat $100 whatever rung the lane stood on), the
       * price from the daily card, and the ladder artifact carried a DIFFERENT card for the same
       * rung — a stale one at +364 where today's is +207. Rendering the ladder's projection beside
       * today's price produced "$200 stake · +207 · to win $928", which is not any bet that exists.
       *
       * So the projection is computed here, once, from the rung's carried stake and the price of
       * the card whose legs are actually on screen. If those two cannot both be read, no return is
       * shown at all — an absent number is recoverable, a confident wrong one is not.
       */
      const displayOdds = card?.combinedOdds ?? reviewCard?.combinedOdds ?? null;
      const carried = curRung?.carriedStake ?? null;
      const proj = hasCard && carried != null && displayOdds != null
        ? rungProjection({ stake: carried, americanOdds: displayOdds, goalTarget: curRung?.goalTarget ?? null })
        : null;
      const laneMoney = {
        stake: hasReview ? 0 : hasCard ? carried : null,
        combinedOdds: displayOdds,
        potentialReturn: hasReview ? null : (proj?.projectedReturn ?? null),
        reachesTarget: proj?.reachesTarget ?? null,
        shortfall: proj?.shortfall ?? null,
      };

      // Cycle # from the lane label ("… lane (cycle 5)") if present — display-only, never fabricated.
      const cycleMatch = /cycle\s+(\d+)/i.exec(laneDisplay?.label ?? "");
      // Official settled detail for each CLEARED step (from the ledger) → the expandable "how it cleared".
      const clearedByStep = receiptsDrive
        ? clearedDetailFromReceipts(bbReceipts, laneRun, "bank-builder", letter)
        : readClearedSteps(path.join(process.cwd(), "public", "data"), laneId);
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
        /*
         * THE LADDER OWNS THE STAKE, NOT THE CARD.
         *
         * This read `card?.stake`, and the daily card is generated at a flat $100 whatever rung the
         * lane stands on — so the board showed "Step 2 · from $200" beside "$100.00 Stake". A
         * ladder that compounds cannot stake the seed twice. The rung's carried stake is the
         * ladder's own number; the card supplies only the legs and the price.
         */
        stake: laneMoney.stake,
        combinedOdds: laneMoney.combinedOdds,
        // Return follows the same stake AND the same price, so the three numbers describe one bet.
        potentialReturn: laneMoney.potentialReturn,
        reachesTarget: laneMoney.reachesTarget,
        shortfall: laneMoney.shortfall,
        goalTarget: curRung?.goalTarget ?? null,
        hasCard,
        reviewMode: hasReview,
        reviewNote: reviewCard?.reviewNote ?? null,
        rungs,
        legs: hasReview
          ? reviewCard!.legs.map((l) => withMark(l))
          : (card?.legs ?? []).map((l) => withMark({
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

  /* Settled outcomes come from the lifecycle ledger, which is the only place they exist. Both lanes
     carried a card frozen on 2026-08-17 that no job ever graded; the ledger now records what the
     official box scores said and where each lane stands as a result. */
  const bbLedger = loadLifecycleHistory();
  const bbSettled = settledCardsFor(bbLedger, "bank-builder");

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
        {/* P211 R-E: the next transition is a fact the runbook already owns — quoted from the ONE
            registry (guard-tied to the workflow's real cron), never hand-kept here. A live card's
            next transition is settlement; a waiting lane's is tomorrow's evaluation. */}
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {isLive(bbProductState)
            ? "Next transition: settles overnight from official box scores — the ladder advances or restarts on the graded result."
            : `Next daily evaluation: ${RUNBOOKS.mlb.products.when}. A watchdog re-runs a missed morning before 7:00 AM ET.`}
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
          {/* ONE product state (P241 · A18): the header said "waiting on today's data" while this
              panel said "no qualified card today" — "we never ran" and "we ran and nothing
              qualified" are different facts, and the skipped card may only claim the second. When
              the state machine says the inputs have not arrived, the panel says exactly that. */}
          {bbProductState === "INPUTS_STALE" || bbProductState === "INPUTS_MISSING" ? (
            <div className="rounded-[12px] px-4 py-4" style={{ background: "var(--vault-wash-faint)", border: "1px dashed var(--vault-border)" }}>
              <p className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>Waiting on today&rsquo;s data</p>
              <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
                Today&rsquo;s source data has not arrived yet, so no card has been assessed — this is not a
                no-play call. The evaluation runs the moment the day&rsquo;s board posts.
              </p>
            </div>
          ) : bbProposal.available
            ? <BankBuilderProposalCard proposal={bbProposal} />
            : <BankBuilderSkippedCard alternatives={strongestSlatePicks(path.join(process.cwd(), "public", "data"), today, 3)} />}
        </div>
      ) : null}

      {/* P250 · A01 — WHAT THE RECORD SYSTEMS SAY, from the ONE derived owner. Live paper exposure
          (today's generated lanes) and the protected settled-money authority's exposure are
          DIFFERENT measures of different eras; both render under their own names, and any typed
          divergence between the generator's step and the lifecycle store's rule-derived position is
          stated instead of silently resolved (that resolution is the founder-gated accounting). */}
      <section aria-label="Record reconciliation" className="mt-5 rounded-[12px] px-4 py-3 flex flex-col gap-1.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)", border: "1px solid var(--vault-border)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>What the record systems say</span>
        <p className="m-0 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          Today&rsquo;s paper exposure (generated lanes): {bbDerived.exposure.live != null ? `$${Number(bbDerived.exposure.live).toFixed(2)}` : "—"} ·
          settled-money record&rsquo;s open exposure: {bbDerived.exposure.settledAuthority != null ? `$${Number(bbDerived.exposure.settledAuthority).toFixed(2)}` : "—"} (protected ledger, its own era)
        </p>
        {bbDerived.divergences.length ? (
          <ul className="m-0 flex flex-col gap-1 pl-4">
            {bbDerived.divergences.map((d: { lane: string; generated: number; lifecycleStore: number; note: string; staleSince?: string | null }) => (
              <li key={d.lane} className="font-mono leading-relaxed" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                {/* P281: said in the reader's words, not the pipeline's. The disclosure stays — a
                    disagreement between record systems is never silently resolved here — but
                    "the lifecycle store's rule-derived position" names a file, not a fact anyone
                    outside this repository can act on. What a reader needs is which number the
                    board follows and why the other one exists. */}
                Lane {d.lane} is on <strong style={{ color: "var(--vault-text)" }}>step {d.generated}</strong>. An older store still
                reads step {d.lifecycleStore}; nothing has written to it since {d.staleSince ?? "its last card"}, and it is kept
                visible as history rather than hidden. Today&rsquo;s card and this board follow the official daily receipts.
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>No step-counter divergence between the generator and the lifecycle store today.</p>
        )}
      </section>

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
      <div className="mt-6">
        <LifecycleRecord
          cards={bbSettled}
          position={receiptsDrive
            ? receiptPositionRecord(bbPositions.A, dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === "A" && c.status === "active")?.step ?? null)
            : positionFor(bbLedger, "bank-builder-lane-A")}
          positionLabel="Lane A"
          emptyReason="No Bank Builder card has been graded yet. When a card's games finish, its legs and the official numbers they were graded against appear here."
        />
      </div>
    </div>
  );
}
