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
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { currentEtDate } from "@/lib/freshness";
import { suggestedScore, type ParlaySlip } from "@/lib/parlay-suggested";
import { combinedParlayPayoutPer100, formatAmerican } from "@/lib/odds-math";
import { classifyOddsSection } from "@/lib/parlay-risk-sections";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  formatLadderUsd,
  ladderMultiplierLabel,
  ladderTargetAmerican,
  resolveLadderStep,
  type LadderStep,
} from "@/lib/bank-builder-ladder";

export const metadata = {
  title: "Bank Builder · GameTime Picks",
  description:
    "An educational $100 → $3,000 paper-bankroll ladder. One Daily Builder Pick per step, drawn from the published suggested pool. Paper only — we do not take real money.",
};

const DISCLAIMER =
  "Educational only. Past results do not predict future outcomes. We do not take real money.";

/**
 * Minimal prototype Builder-Slip selector (design doc §3.4 default).
 * Picks the highest-confidence pending slip from the published pool
 * whose combined decimal odds clear the rung's multiplier target,
 * preferring lower-risk sections and never surfacing a settled slip.
 * Pure + deterministic (stable slipId tiebreak). A later PR replaces
 * this with the tested `selectBuilderSlip` helper.
 */
function pickBuilderSlip(
  slips: ReadonlyArray<ParlaySlip>,
  step: LadderStep,
): { slip: ParlaySlip; combinedAmerican: number } | null {
  type Cand = {
    slip: ParlaySlip;
    combinedAmerican: number;
    sectionPref: number;
    score: number;
  };
  const candidates: Cand[] = [];
  for (const slip of slips) {
    // Never present a graded outcome as a forward-looking pick.
    if (slip.status !== "pending") continue;
    const combined = combinedParlayPayoutPer100(slip.legs);
    if (!combined) continue; // no usable price — never fabricate one
    if (combined.decimal < step.multiplier) continue; // misses the rung target
    const section = classifyOddsSection(combined.american);
    // Prefer Low, then Medium, then High; push Longshot last so the
    // marquee Builder Pick isn't a longshot on an early rung.
    const sectionPref =
      section === "low"
        ? 0
        : section === "medium"
          ? 1
          : section === "high"
            ? 2
            : 3;
    candidates.push({
      slip,
      combinedAmerican: combined.american,
      sectionPref,
      score: suggestedScore(slip),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      a.sectionPref - b.sectionPref ||
      b.score - a.score ||
      a.slip.slipId.localeCompare(b.slip.slipId),
  );
  const best = candidates[0];
  return { slip: best.slip, combinedAmerican: best.combinedAmerican };
}

export default function BankBuilderPage() {
  const today = currentEtDate();
  const suggested = getSuggestedParlaysForDate(today);
  const calibrationTable = loadCalibrationTable();

  // No durable ladder history yet (§4.2). The prototype starts honestly
  // at the base rung — we never fabricate prior progress.
  const currentBankroll = BANK_BUILDER_BASE;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[0];

  const pool = suggested?.slips ?? [];
  const builderPick = pickBuilderSlip(pool, activeStep);
  const poolDate = suggested?.date ?? today;
  const poolIsFallback = suggested?.isFallback ?? false;
  const savedPregame = suggested?.source === "snapshot";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
      {/* ---- Hero + top disclaimer ----------------------------------- */}
      <header className="flex flex-col gap-3">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          Educational paper-trading · simulated bankroll
        </span>
        <h1
          className="font-semibold tracking-tight"
          style={{ color: "var(--vault-gold-bright)", fontSize: 30, lineHeight: 1.05 }}
        >
          Bank Builder
        </h1>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 620 }}
        >
          A {formatLadderUsd(BANK_BUILDER_BASE)} → {formatLadderUsd(BANK_BUILDER_GOAL)}{" "}
          paper-bankroll ladder. Five rungs, one Daily Builder Pick per rung,
          drawn from the same published suggested pool that powers Parlay Lab.
          On a loss the ladder resets to the {formatLadderUsd(BANK_BUILDER_BASE)}{" "}
          base — the reset is always shown, never hidden.
        </p>
      </header>

      <DisclaimerBanner placement="top" />

      {/* ---- Ladder + Today's Builder Pick --------------------------- */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5">
        <LadderRungs activeStepNumber={activeStep.step} />
        <TodaysBuilderPick
          step={activeStep}
          pick={builderPick}
          calibrationTable={calibrationTable}
          savedPregame={savedPregame}
          poolDate={poolDate}
          poolIsFallback={poolIsFallback}
        />
      </div>

      {/* ---- Ladder history (honest no-history state) ---------------- */}
      <LadderHistory />

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

/** The five rungs, rendered base ($100) at the bottom → crown ($3,000)
 *  at the top. The active rung is highlighted. Non-animated in this PR;
 *  the animated tower lands in a later visual PR. */
function LadderRungs({ activeStepNumber }: { activeStepNumber: number }) {
  // Render top → bottom visually, so reverse the base→crown ladder.
  const rungsTopFirst = [...BANK_BUILDER_LADDER].reverse();
  return (
    <section
      aria-label="Bank Builder ladder"
      className="rounded-[10px] overflow-hidden"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
    >
      <header
        className="px-3.5 py-3 flex items-baseline gap-2"
        style={{ background: "var(--gtp-card-sunken)", borderBottom: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
        >
          The ladder
        </span>
        <span className="font-mono ml-auto" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          base → crown
        </span>
      </header>
      <ol className="flex flex-col list-none">
        {rungsTopFirst.map((rung) => {
          const isActive = rung.step === activeStepNumber;
          const isCleared = rung.step < activeStepNumber;
          return (
            <li
              key={rung.step}
              aria-current={isActive ? "step" : undefined}
              className="px-3.5 py-3 flex items-center gap-3"
              style={{
                borderBottom:
                  rung.step === BANK_BUILDER_LADDER[0].step
                    ? "none"
                    : "1px solid var(--vault-rule)",
                background: isActive
                  ? "linear-gradient(90deg, rgba(240,199,94,0.10), rgba(240,199,94,0))"
                  : "transparent",
              }}
            >
              <span
                className="font-mono shrink-0 inline-flex items-center justify-center rounded-full"
                style={{
                  width: 26,
                  height: 26,
                  fontSize: 12,
                  color: isActive ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  border: `1px solid ${isActive ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                }}
              >
                {rung.step}
              </span>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-semibold"
                  style={{
                    color: isActive ? "var(--vault-gold-bright)" : "var(--vault-text)",
                    fontSize: 15,
                  }}
                >
                  {formatLadderUsd(rung.start)} → {formatLadderUsd(rung.goal)}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                  needs ≥ {ladderMultiplierLabel(rung)} ({formatAmerican(ladderTargetAmerican(rung))})
                </span>
              </div>
              <span
                className="font-mono ml-auto uppercase tracking-[0.12em] shrink-0"
                style={{
                  fontSize: 10,
                  color: isActive
                    ? "var(--vault-gold-bright)"
                    : isCleared
                      ? "var(--vault-success)"
                      : "var(--vault-text-faint)",
                }}
              >
                {isActive ? "Active" : isCleared ? "Cleared" : "Upcoming"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TodaysBuilderPick({
  step,
  pick,
  calibrationTable,
  savedPregame,
  poolDate,
  poolIsFallback,
}: {
  step: LadderStep;
  pick: { slip: ParlaySlip; combinedAmerican: number } | null;
  calibrationTable: ReturnType<typeof loadCalibrationTable>;
  savedPregame: boolean;
  poolDate: string;
  poolIsFallback: boolean;
}) {
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
          · Step {step.step} · {formatLadderUsd(step.start)} → {formatLadderUsd(step.goal)} · needs ≥{" "}
          {ladderMultiplierLabel(step)}
        </span>
      </header>

      <div className="px-3.5 py-4 flex flex-col gap-3">
        {pick ? (
          <>
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              Drawn from the published suggested pool ({poolDate}
              {poolIsFallback ? " · most recent slate" : ""}). Combined{" "}
              {formatAmerican(pick.combinedAmerican)} clears this rung&apos;s{" "}
              {ladderMultiplierLabel(step)} target. Graded on the existing nightly
              pipeline — never edited after games start.
            </p>
            <ParlayTicketCard
              slip={pick.slip}
              emphasis="featured"
              showStakeFooter
              savedPregame={savedPregame}
              calibrationTable={calibrationTable}
            />
          </>
        ) : (
          <div
            className="flex flex-col items-center text-center gap-2 py-6"
            style={{ minHeight: 120 }}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 380 }}>
              No qualifying Builder Slip in today&apos;s pool. A pick appears once
              the published pool has a pending slip whose combined odds clear this
              rung&apos;s {ladderMultiplierLabel(step)} target.
            </p>
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
