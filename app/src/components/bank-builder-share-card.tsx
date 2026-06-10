/**
 * BankBuilderShareCard — a clean, static, screenshot-friendly summary of
 * the Bank Builder ladder (design doc §3.5). Designed to read well when
 * cropped and posted to X / Reddit: high-contrast, self-contained, with
 * the ladder, the current step, and the disclaimer footer all visible in
 * one frame.
 *
 * Static + honest: no animation, no fabricated history. The fill bar
 * shows ONLY cleared rungs; the headline bankroll is the real current
 * paper figure. Renders as a server component (no "use client") — pure
 * presentation over plain props.
 */
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  BANK_BUILDER_STEP_COUNT,
  formatLadderUsd,
  ladderMultiplierLabel,
} from "@/lib/bank-builder-ladder";

export interface BankBuilderShareCardLastSlip {
  result: "win" | "loss" | "push";
  dateLabel: string;
  profitUsd: number;
  legs: Array<{ player: string; selection: string }>;
}

export interface BankBuilderShareCardProps {
  /** 1-indexed active rung (the rung currently being climbed). */
  activeStepNumber: number;
  /** Current paper bankroll in USD. */
  currentBankroll: number;
  /** Optional last settled slip (compact, current-run framing — no lifetime record). */
  lastSlip?: BankBuilderShareCardLastSlip | null;
}

export default function BankBuilderShareCard({
  activeStepNumber,
  currentBankroll,
  lastSlip = null,
}: BankBuilderShareCardProps) {
  const clearedSteps = Math.max(
    0,
    Math.min(BANK_BUILDER_STEP_COUNT, activeStepNumber - 1),
  );
  const fillPct = (clearedSteps / BANK_BUILDER_STEP_COUNT) * 100;
  const rungsTopFirst = [...BANK_BUILDER_LADDER].reverse();

  return (
    <section aria-label="Bank Builder share card" className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Screenshot to share
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          · sized for X / Reddit
        </span>
      </div>

      {/* The card itself — fixed aspect, high-contrast, self-contained. */}
      <div
        className="rounded-[14px] overflow-hidden mx-auto"
        style={{
          maxWidth: 620,
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(20,28,54,0.96), rgba(7,11,26,0.98))",
          border: "1px solid var(--vault-gold-dim)",
          boxShadow: "0 0 40px rgba(0,0,0,0.45)",
        }}
      >
        <div className="px-5 sm:px-7 py-6 flex flex-col gap-5">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span
                className="font-mono uppercase tracking-[0.2em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                GameTimePicks · paper ladder
              </span>
              <span
                className="font-semibold tracking-tight"
                style={{ color: "var(--vault-gold-bright)", fontSize: 24 }}
              >
                Bank Builder
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
              >
                Paper bankroll
              </span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: "var(--vault-text)", fontSize: 22 }}
              >
                {formatLadderUsd(currentBankroll)}
              </span>
            </div>
          </div>

          {/* Last settled slip — compact current-run framing (no lifetime record). */}
          {lastSlip && lastSlip.result === "win" && (
            <div
              className="rounded-[10px] px-4 py-3"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  Last slip · {lastSlip.dateLabel}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: "#6ee7b7", fontSize: 14 }}>
                  WIN +{formatLadderUsd(lastSlip.profitUsd)}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {lastSlip.legs.map((l, i) => (
                  <span key={i} style={{ color: "var(--vault-text)", fontSize: 12 }}>
                    {l.player} <span style={{ color: "var(--vault-text-mute)" }}>· {l.selection}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Horizontal progress bar — cleared rungs only. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {formatLadderUsd(BANK_BUILDER_BASE)}
              </span>
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                Step {activeStepNumber} of {BANK_BUILDER_STEP_COUNT}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {formatLadderUsd(BANK_BUILDER_GOAL)}
              </span>
            </div>
            <div
              className="relative rounded-full overflow-hidden"
              style={{
                height: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--vault-rule)",
              }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full"
                style={{
                  width: `${fillPct}%`,
                  background:
                    "linear-gradient(90deg, var(--vault-gold-dim), var(--vault-gold-bright))",
                  boxShadow: "0 0 12px rgba(240,199,94,0.5)",
                }}
              />
            </div>
          </div>

          {/* Compact rung list — crown → base. */}
          <ol className="flex flex-col list-none gap-0">
            {rungsTopFirst.map((rung) => {
              const isActive = rung.step === activeStepNumber;
              const isCleared = rung.step < activeStepNumber;
              return (
                <li
                  key={rung.step}
                  className="flex items-center gap-2.5 py-1.5"
                  style={{
                    borderBottom:
                      rung.step === BANK_BUILDER_LADDER[0].step
                        ? "none"
                        : "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span
                    className="font-mono shrink-0 inline-flex items-center justify-center rounded-full"
                    style={{
                      width: 20,
                      height: 20,
                      fontSize: 10,
                      color: isActive
                        ? "var(--vault-gold-bright)"
                        : isCleared
                          ? "var(--vault-success)"
                          : "var(--vault-text-faint)",
                      border: `1px solid ${
                        isActive
                          ? "var(--vault-gold-bright)"
                          : isCleared
                            ? "var(--vault-success)"
                            : "var(--vault-rule)"
                      }`,
                    }}
                  >
                    {rung.step}
                  </span>
                  <span
                    className="font-semibold"
                    style={{
                      color: isActive
                        ? "var(--vault-gold-bright)"
                        : isCleared
                          ? "var(--vault-text)"
                          : "var(--vault-text-mute)",
                      fontSize: 13,
                    }}
                  >
                    {formatLadderUsd(rung.start)} → {formatLadderUsd(rung.goal)}
                  </span>
                  <span
                    className="font-mono ml-auto"
                    style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}
                  >
                    {ladderMultiplierLabel(rung)}
                  </span>
                  {isActive && (
                    <span
                      className="font-mono uppercase tracking-[0.1em]"
                      style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}
                    >
                      ← here
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Disclaimer footer — always in-frame for a screenshot. */}
          <p
            className="text-center text-[10.5px] leading-relaxed pt-1"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Educational only · paper trading · not financial advice. Past
            results do not predict future outcomes. We do not take real money.
          </p>
        </div>
      </div>
    </section>
  );
}
