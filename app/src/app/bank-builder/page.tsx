/**
 * /bank-builder — the Bank Builder paper-bankroll ladder prototype
 * (design doc §3). An educational $100 → $3,000 ladder: five rungs,
 * each doubling (the final rung needs 1.875×), with one Daily Builder
 * Pick per active rung. **Read-only** — it derives entirely from the
 * already-published optimizer/suggested snapshot and the existing graded
 * record. No new pipeline, no parallel grader, no real money.
 *
 * What this PR (prototype) ships:
 *   - The static ladder, rendered base → crown.
 *   - The active rung (Step 1 / $100 base, since no ladder history is
 *     persisted yet — §4.2 defers durable history).
 *   - Today's Builder Slip: a *minimal* prototype selector that picks the
 *     highest-confidence non-longshot pending slip from the published
 *     pool whose combined decimal odds clear the rung's target. This is
 *     the documented default heuristic (§3.4); a later PR extracts it
 *     into a tested, deterministic `selectBuilderSlip` helper in
 *     `parlay-suggested.ts` with the richer game-time / diversity
 *     preferences.
 *   - Honest no-history state ("Tracking starts when a Builder Slip
 *     settles.") — no fabricated past runs.
 *
 * Honesty (design doc §3.6): framed as educational paper-trading;
 * disclaimer top AND bottom; none of the banned hype vocabulary;
 * payouts only from real odds (the ticket card renders "—" when a leg
 * lacks a price); a settled slip is never shown as a Builder Pick.
 */
import Link from "next/link";

import ParlayTicketCard from "@/components/parlay-ticket-card";
import PageHero from "@/components/page-hero";
import BoardStatTile from "@/components/board-stat-tile";
import BankBuilderTower from "@/components/bank-builder-tower";
import BankBuilderShareCard from "@/components/bank-builder-share-card";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { getLegPool } from "@/lib/custom-parlay";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { currentEtDate } from "@/lib/freshness";
import {
  selectPlus100BuilderSlip,
  BUILDER_PLUS100_TARGET,
  type BuilderSlipSelection,
} from "@/lib/parlay-suggested";
import { filterOfficialSuggestedSlips } from "@/lib/sport-capabilities";
import { formatAmerican } from "@/lib/odds-math";
import {
  legRecentFormLabel,
  slipRecentFormSummary,
  indexRecentSeries,
  attachRecentSeries,
} from "@/lib/recent-form";
import { diagnoseBuilderPool } from "@/lib/bank-builder-eligibility";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  formatLadderUsd,
  resolveLadderStep,
} from "@/lib/bank-builder-ladder";
import { loadBankBuilderSummary, loadBankBuilderLedger } from "@/lib/data-bank-builder";

const META_TITLE = "Bank Builder · GameTime Picks";
const META_DESCRIPTION =
  "An educational $100 → $3,000 paper-bankroll ladder. One Daily Builder Pick per step, drawn from the published suggested pool. Paper only — we do not take real money.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    type: "website",
    url: "/bank-builder/",
  },
  twitter: {
    card: "summary_large_image",
    title: META_TITLE,
    description: META_DESCRIPTION,
  },
};

const DISCLAIMER =
  "Educational only. Past results do not predict future outcomes. We do not take real money.";

export default function BankBuilderPage() {
  const today = currentEtDate();
  const suggested = getSuggestedParlaysForDate(today);
  const calibrationTable = loadCalibrationTable();

  // Durable ladder history (§4.2): read the persisted, SETTLED-only paper-bankroll
  // ledger (scripts/build-bank-builder-ledger.mjs). Fail-closed — if the artifact is
  // absent we fall back to the honest base rung. We never fabricate prior progress.
  const bbSummary = loadBankBuilderSummary();
  const bbLedger = loadBankBuilderLedger();
  const lastSettled = bbLedger?.entries?.[bbLedger.entries.length - 1] ?? null;
  const currentBankroll = bbSummary?.currentBankrollUnits ?? BANK_BUILDER_BASE;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[0];

  // PR `feature/sport-specific-suggested` (2026-06-02): the Builder Slip is
  // drawn only from OFFICIAL Suggested slips — single-sport only. Filtering out
  // mixed-sport slips keeps Bank Builder consistent with the official surface
  // (no mixed Builder card) without forcing a pick: when nothing single-sport
  // prices near +100, the honest empty state still renders.
  const poolDate = suggested?.date ?? today;
  const officialPool = filterOfficialSuggestedSlips(suggested?.slips ?? []);
  // PR 4: enrich the official pool's legs with REAL recentSeries from the
  // optimizer legPool (the published snapshot omits it) so L10 can be shown.
  // Pure, real-data-only join by (playerId, market, line, side); never
  // fabricated. Falls back to the latest optimizer when today's is absent.
  const optimizerForDate =
    getOptimizerSnapshotForDate(poolDate) ??
    getLatestOptimizerSnapshot()?.payload ??
    null;
  const recentSeriesIndex = indexRecentSeries(
    optimizerForDate ? getLegPool(optimizerForDate) : [],
  );
  const pool = attachRecentSeries(officialPool, recentSeriesIndex);
  // The Builder Slip targets ~+100 combined odds: a $100 paper stake aims
  // for roughly a $200 total return (~$100 profit). We pick the pending,
  // fully-unsettled slip priced closest to +100 (2-leg preferred), and
  // render an honest empty state when nothing prices into the band.
  const builderPick = selectPlus100BuilderSlip(pool);
  // PR 4: transparent eligibility diagnosis — when no card qualifies, show the
  // EXACT honest reason (no pending cards / none near +100 / etc.), never a
  // "nothing good enough to win" framing.
  const diagnosis = diagnoseBuilderPool(pool);
  const poolIsFallback = suggested?.isFallback ?? false;
  const savedPregame = suggested?.source === "snapshot";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
      {/* ---- Hero + top disclaimer ----------------------------------- */}
      <PageHero
        eyebrow="Educational paper-trading · simulated bankroll"
        title="Bank Builder"
        subMaxWidth={620}
        sub={
          <>
            A {formatLadderUsd(BANK_BUILDER_BASE)} →{" "}
            {formatLadderUsd(BANK_BUILDER_GOAL)} paper-bankroll ladder. Five
            rungs, one Daily Builder Pick per rung, drawn from the same
            published suggested pool that powers Parlay Lab. On a loss the
            ladder resets to the {formatLadderUsd(BANK_BUILDER_BASE)} base — the
            reset is always shown, never hidden.
          </>
        }
      />

      {/* Board-style target-path strip — the ladder progression at a glance.
          Honest: a per-step TARGET (not a promise), the current step, and the
          loss reset shown openly. Real ladder constants only. */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BoardStatTile
          label="Start"
          value={formatLadderUsd(BANK_BUILDER_BASE)}
          sub="paper base"
          accent="var(--risk-low)"
        />
        <BoardStatTile
          label="Step target"
          value="~2×"
          sub="≈ +100 odds"
          accent="var(--vault-gold-bright)"
        />
        <BoardStatTile
          label="Current step"
          value={`${activeStep.step} / 5`}
          sub={formatLadderUsd(currentBankroll)}
          accent="var(--sport-mlb)"
        />
        <BoardStatTile
          label="On a loss"
          value="Reset"
          sub={`to ${formatLadderUsd(BANK_BUILDER_BASE)}`}
          accent="var(--risk-longshot)"
        />
      </div>

      {/* ---- Paper Tracker (durable settled history, §4.2) ----------- */}
      {bbSummary && bbSummary.settledPickCount > 0 && (
        <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
              Bank Builder Paper Tracker
            </h2>
            <span className="text-[11px] text-zinc-500">
              educational tracking · not betting advice · not a guarantee
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[20px] font-bold tabular-nums text-zinc-100">{formatLadderUsd(bbSummary.currentBankrollUnits)}</div>
              <div className="text-[11px] text-zinc-500">paper bankroll (current run)</div>
            </div>
            <div>
              <div className={`text-[20px] font-bold tabular-nums ${bbSummary.currentRunProfitUnits >= 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                {bbSummary.currentRunProfitUnits >= 0 ? "+" : ""}{formatLadderUsd(bbSummary.currentRunProfitUnits)}
              </div>
              <div className="text-[11px] text-zinc-500">current-run P/L ({bbSummary.currentRunRoiPct}%)</div>
            </div>
            <div>
              <div className="text-[20px] font-bold tabular-nums text-zinc-100">
                {bbSummary.record.wins}-{bbSummary.record.losses}{bbSummary.record.pushes ? `-${bbSummary.record.pushes}` : ""}
              </div>
              <div className="text-[11px] text-zinc-500">settled picks (W-L{bbSummary.record.pushes ? "-P" : ""})</div>
            </div>
            <div>
              <div className="text-[20px] font-bold tabular-nums text-zinc-100">{activeStep.step} / 5</div>
              <div className="text-[11px] text-zinc-500">current step · streak {bbSummary.currentStreak > 0 ? `W${bbSummary.currentStreak}` : bbSummary.currentStreak < 0 ? `L${-bbSummary.currentStreak}` : "—"}</div>
            </div>
          </div>
          {lastSettled && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-400">
              Last settled Builder Pick ({lastSettled.date}):{" "}
              <span className={lastSettled.result === "win" ? "text-emerald-400 font-semibold" : "text-zinc-300 font-semibold"}>
                {lastSettled.result.toUpperCase()}
              </span>{" "}
              ({formatAmerican(lastSettled.combinedAmerican)}) —{" "}
              {lastSettled.legs.map((l, i) => (
                <span key={i}>
                  {i > 0 ? " + " : ""}{l.player} {l.side} {l.line} {l.market.replace(/_/g, " ")}{" "}
                  <span className={l.result === "win" ? "text-emerald-400" : "text-zinc-500"}>({l.result})</span>
                </span>
              ))}
              . Settled from official results ({lastSettled.settlementSource}); paper bankroll moved{" "}
              {formatLadderUsd(lastSettled.bankrollBefore)} → {formatLadderUsd(lastSettled.bankrollAfter)}.
            </p>
          )}
          <p className="mt-2 text-[12px] leading-snug text-zinc-500">
            {bbSummary.nextPick
              ? `Next Builder Pick (${bbSummary.nextEligibleDate}): step ${bbSummary.nextPick.step}, ${bbSummary.nextPick.legCount}-leg ${formatAmerican(bbSummary.nextPick.combinedAmerican)} — pending settlement.`
              : "Next Builder Pick: pending until the next slate generates a qualifying pick. We never force a pick to keep the streak alive."}
          </p>
        </section>
      )}

      <DisclaimerBanner placement="top" />

      {/* ---- Eligibility chips + transparent criteria (PR 4) --------- */}
      <EligibilityPanel />

      {/* ---- Ladder + Today's Builder Pick --------------------------- */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5">
        <BankBuilderTower
          activeStepNumber={activeStep.step}
          currentBankroll={currentBankroll}
        />
        <TodaysBuilderPick
          pick={builderPick}
          diagnosis={diagnosis}
          calibrationTable={calibrationTable}
          savedPregame={savedPregame}
          poolDate={poolDate}
          poolIsFallback={poolIsFallback}
        />
      </div>

      {/* ---- Ladder history (honest no-history state) ---------------- */}
      <LadderHistory />

      {/* ---- Screenshot-friendly share card -------------------------- */}
      <BankBuilderShareCard
        activeStepNumber={activeStep.step}
        currentBankroll={currentBankroll}
      />

      {/* ---- Bottom disclaimer + responsible-use link ---------------- */}
      <DisclaimerBanner placement="bottom" />
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Bank Builder is a learning demonstration of analytical methodology.{" "}
        <Link
          href="/responsible-use/"
          className="underline"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Read responsible-use →
        </Link>
      </p>
    </div>
  );
}

/* ===================================================================== */
/* Sub-components                                                         */
/* ===================================================================== */

function DisclaimerBanner({ placement }: { placement: "top" | "bottom" }) {
  return (
    <p
      className={`${placement === "top" ? "mt-4" : "mt-8"} rounded-[8px] px-3.5 py-2.5 text-[12.5px] leading-relaxed`}
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
        color: "var(--vault-text-mute)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em] mr-2"
        style={{ color: "var(--vault-warn)", fontSize: 10.5 }}
      >
        Paper only
      </span>
      {DISCLAIMER}
    </p>
  );
}

function TodaysBuilderPick({
  pick,
  diagnosis,
  calibrationTable,
  savedPregame,
  poolDate,
  poolIsFallback,
}: {
  pick: BuilderSlipSelection | null;
  diagnosis: ReturnType<typeof diagnoseBuilderPool>;
  calibrationTable: ReturnType<typeof loadCalibrationTable>;
  savedPregame: boolean;
  poolDate: string;
  poolIsFallback: boolean;
}) {
  const recentForm = pick ? slipRecentFormSummary(pick.slip) : null;
  return (
    <section
      aria-label="Today's Builder Slip"
      className="rounded-[10px] overflow-hidden flex flex-col"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
    >
      <header
        className="px-3.5 py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"
        style={{ background: "var(--gtp-card-sunken)", borderBottom: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
        >
          Today&apos;s Builder Slip
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          · Paper bankroll · {formatLadderUsd(BANK_BUILDER_BASE)} starting bank ·
          Target: about {formatAmerican(BUILDER_PLUS100_TARGET)}
        </span>
      </header>

      <div className="px-3.5 py-4 flex flex-col gap-3">
        {pick ? (
          <>
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              Drawn from the published suggested pool ({poolDate}
              {poolIsFallback ? " · most recent slate" : ""}). Combined{" "}
              {formatAmerican(pick.combinedAmerican)} — a{" "}
              {formatLadderUsd(BANK_BUILDER_BASE)} paper stake aims for about{" "}
              {formatLadderUsd(BANK_BUILDER_BASE * pick.combinedDecimal)} back
              (~{formatLadderUsd(BANK_BUILDER_BASE * (pick.combinedDecimal - 1))}{" "}
              profit). Results update after games finish — never edited after
              games start.
            </p>
            <ParlayTicketCard
              slip={pick.slip}
              emphasis="featured"
              showStakeFooter
              savedPregame={savedPregame}
              calibrationTable={calibrationTable}
            />
            <RecentFormSupport pick={pick} recentForm={recentForm} />
          </>
        ) : (
          <div
            className="flex flex-col items-center text-center gap-2 py-6"
            style={{ minHeight: 120 }}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 400 }}>
              No Builder Slip near {formatAmerican(BUILDER_PLUS100_TARGET)} in
              today&apos;s published pool yet.
            </p>
            {/* PR 4: specific, honest eligibility reasons — never a
                "nothing good enough to win" framing. */}
            <ul
              className="flex flex-col gap-1 text-[12px] leading-snug"
              style={{ color: "var(--vault-text-faint)", maxWidth: 400 }}
            >
              {(diagnosis.reasons.length
                ? diagnosis.reasons
                : [
                    `A pick appears once the published pool has a pending, fully-unsettled slip priced close to ${formatAmerican(BUILDER_PLUS100_TARGET)} combined.`,
                  ]
              ).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
            <Link
              href="/parlay-lab/"
              className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 11,
              }}
            >
              Browse Parlay Lab →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/** Transparent eligibility chips + criteria (PR 4). Every Builder Slip must
 *  pass these — shown so the user sees exactly how a card is chosen. No
 *  win-rate or performance claim. */
function EligibilityPanel() {
  const chips = ["Paper-only", "Published-card pool", "Recent-form review"];
  const criteria = [
    "Official Suggested cards only (modeled sports — no mixed cards)",
    "Pending and fully unsettled only (never a settled slip)",
    `Priced near ${formatAmerican(BUILDER_PLUS100_TARGET)} combined`,
    "Recent-form (L10) shown for transparency — never a win-rate claim",
    "No forced card — an honest empty state when nothing qualifies",
  ];
  return (
    <section
      aria-label="Builder Slip eligibility"
      className="mt-4 rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
      style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
            style={{
              color: "var(--vault-text-mute)",
              background: "var(--gtp-card)",
              border: "1px solid var(--vault-rule)",
              fontSize: 9.5,
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <ul
        className="flex flex-col gap-0.5 text-[11.5px] leading-snug"
        style={{ color: "var(--vault-text-faint)", maxWidth: 640 }}
      >
        {criteria.map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>
    </section>
  );
}

/** Recent-form (L10) support for the chosen Builder Slip — a transparent,
 *  per-leg readout of how often the player has recently cleared the line.
 *  Display only; never a win-probability claim; uses recentSeries, not
 *  edgePct/confidence. */
function RecentFormSupport({
  pick,
  recentForm,
}: {
  pick: BuilderSlipSelection;
  recentForm: ReturnType<typeof slipRecentFormSummary> | null;
}) {
  const legs = pick.slip.legs ?? [];
  return (
    <section
      aria-label="Recent-form support"
      className="rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
      style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}
        >
          Recent-form support
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {recentForm && recentForm.legsWithData < recentForm.totalLegs
            ? `${recentForm.legsWithData}/${recentForm.totalLegs} legs have L10 data`
            : "L10 = recent games clearing the line"}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {legs.map((leg, i) => (
          <li
            key={`${leg.playerName}-${leg.market}-${i}`}
            className="flex items-center justify-between gap-2 text-[12px]"
            style={{ color: "var(--vault-text-mute)" }}
          >
            <span className="truncate">
              {leg.playerName}{" "}
              <span style={{ color: "var(--vault-text-faint)" }}>
                · {leg.market} {leg.side} {leg.line ?? "—"}
              </span>
            </span>
            <span
              className="font-mono shrink-0"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              {legRecentFormLabel(leg)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
        Recent form is shown for transparency only — it is not a prediction or a
        win-rate claim.
      </p>
    </section>
  );
}

/** Honest no-history state. A durable ladder history is deferred
 *  (§4.2) — until a Builder Slip settles in the public era there is
 *  nothing real to show, and we never invent past runs. */
function LadderHistory() {
  return (
    <section
      aria-label="Ladder history"
      className="mt-5 rounded-[10px] overflow-hidden"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
    >
      <header
        className="px-3.5 py-3"
        style={{ background: "var(--gtp-card-sunken)", borderBottom: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Ladder history
        </span>
      </header>
      <div className="px-3.5 py-6 flex flex-col items-center text-center gap-1.5" style={{ minHeight: 96 }}>
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
          Tracking starts when a Builder Slip settles.
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-faint)", maxWidth: 420 }}>
          History is derived from the real graded record — no invented past runs.
          Each rung&apos;s result (cleared or reset) shows here after its games
          finish and the nightly pipeline grades the slip.
        </p>
      </div>
    </section>
  );
}
