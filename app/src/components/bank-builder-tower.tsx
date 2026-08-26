"use client";

/**
 * BankBuilderTower — the vertical progress "tower" for the Bank Builder
 * ladder (design doc §3.3). A thermometer-style tube whose gold fill
 * grows from the base toward the crown, paired with the five labelled
 * rungs (crown $3,000 on top → base $100 at the bottom).
 *
 * Honesty contract (§3.6):
 *   - The fill height reflects ONLY *cleared* rungs. On the base rung
 *     nothing is cleared yet, so the tube reads 0% — we never fabricate
 *     partial progress inside an unresolved rung.
 *   - The "You are here" marker shows the real current paper bankroll.
 *   - No fake history, no invented prior runs.
 *
 * Motion: the fill animates 0 → target on mount via the shared
 * `.gtp-tower-fill` CSS transition; the active rung glows with
 * `.vault-pulse`; rows reveal with the `.reveal` stagger. Every one of
 * those classes is gated behind `@media (prefers-reduced-motion: reduce)`
 * in globals.css, so reduced-motion users get the final state instantly.
 *
 * "use client" only for the mount-time fill animation (useEffect +
 * requestAnimationFrame). All inputs are plain serializable props, so a
 * server component can render it directly.
 */
import { useEffect, useState } from "react";

import {
  BANK_BUILDER_LADDER,
  BANK_BUILDER_STEP_COUNT,
  formatLadderUsd,
  formatLadderUsdPrecise,
  ladderMultiplierLabel,
} from "@/lib/bank-builder-ladder";

/** Fixed pixel height of each rung row / tube segment. */
const SEGMENT_PX = 76;

export interface BankBuilderTowerProps {
  /** 1-indexed active rung (the rung currently being climbed). */
  activeStepNumber: number;
  /** Current paper bankroll in USD — drives the "You are here" marker. */
  currentBankroll: number;
}

export default function BankBuilderTower({
  activeStepNumber,
  currentBankroll,
}: BankBuilderTowerProps) {
  // Cleared rungs are the rungs strictly below the active one. On the
  // base rung (step 1) nothing is cleared → 0% fill. Clamp defensively.
  const clearedSteps = Math.max(
    0,
    Math.min(BANK_BUILDER_STEP_COUNT, activeStepNumber - 1),
  );
  const targetFillPct = (clearedSteps / BANK_BUILDER_STEP_COUNT) * 100;

  // Animate the fill 0 → target on mount. Reduced-motion users skip the
  // transition (gated in globals.css) and land on the target immediately.
  const [fillPct, setFillPct] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFillPct(targetFillPct));
    return () => cancelAnimationFrame(id);
  }, [targetFillPct]);

  const totalPx = SEGMENT_PX * BANK_BUILDER_STEP_COUNT;
  const rungsTopFirst = [...BANK_BUILDER_LADDER].reverse();

  // The active rung's vertical centre, measured from the top of the
  // tube. Rungs render crown-first, so the active rung sits at index
  // (count − step) from the top.
  const activeIndexFromTop = BANK_BUILDER_STEP_COUNT - activeStepNumber;
  const markerTopPx = (activeIndexFromTop + 0.5) * SEGMENT_PX;

  return (
    <section
      aria-label="Bank Builder progress tower"
      className="rounded-[10px] overflow-hidden"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
      }}
    >
      <header
        className="px-3.5 py-3 flex items-baseline gap-2"
        style={{
          background: "var(--gtp-card-sunken)",
          borderBottom: "1px solid var(--vault-rule)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
        >
          The ladder
        </span>
        <span
          className="font-mono ml-auto"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          base → crown
        </span>
      </header>

      <div className="px-3.5 py-5 flex gap-4">
        {/* ---- The tube ------------------------------------------------ */}
        <div
          className="relative shrink-0"
          style={{ width: 26, height: totalPx }}
          aria-hidden
        >
          {/* Empty track */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, var(--vault-wash-soft), color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent))",
              border: "1px solid var(--vault-rule)",
            }}
          >
            {/* Gold fill — cleared rungs only. Animates via .gtp-tower-fill. */}
            <div
              className="gtp-tower-fill absolute left-0 right-0 bottom-0"
              style={{
                height: `${fillPct}%`,
                background:
                  "linear-gradient(180deg, var(--vault-gold-bright), var(--vault-gold-dim))",
                boxShadow: "0 0 14px color-mix(in srgb, var(--vault-accent) 45%, transparent)",
              }}
            />
          </div>

          {/* "You are here" marker — pinned to the active rung's centre. */}
          <div
            className="absolute left-1/2"
            style={{
              top: markerTopPx,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span
              className="vault-pulse block rounded-full"
              style={{
                width: 14,
                height: 14,
                background: "var(--vault-gold-bright)",
                border: "2px solid var(--gtp-card)",
                boxShadow: "0 0 12px color-mix(in srgb, var(--vault-accent) 70%, transparent)",
              }}
            />
          </div>
        </div>

        {/* ---- Rung labels (crown → base) ------------------------------ */}
        <ol className="flex flex-col flex-1 list-none min-w-0">
          {rungsTopFirst.map((rung, i) => {
            const isActive = rung.step === activeStepNumber;
            const isCleared = rung.step < activeStepNumber;
            const revealClass = `reveal reveal-d${Math.min(i + 1, 6)}`;
            return (
              <li
                key={rung.step}
                aria-current={isActive ? "step" : undefined}
                className={`${revealClass} flex items-center gap-3`}
                style={{
                  height: SEGMENT_PX,
                  borderBottom:
                    rung.step === BANK_BUILDER_LADDER[0].step
                      ? "none"
                      : "1px solid var(--vault-rule)",
                }}
              >
                <span
                  className={`font-mono shrink-0 relative inline-flex items-center justify-center rounded-full${
                    isActive ? " gtp-heat-pulse" : ""
                  }`}
                  style={{
                    width: 26,
                    height: 26,
                    fontSize: 12,
                    // Heat metaphor: the ACTIVE rung burns magma-hot (the climb's
                    // leading edge); cleared rungs keep the settled emerald glow.
                    color: isActive
                      ? "var(--gtp-bank-heat)"
                      : isCleared
                        ? "var(--vault-success)"
                        : "var(--vault-text-mute)",
                    border: `1px solid ${
                      isActive
                        ? "var(--gtp-bank-heat)"
                        : isCleared
                          ? "var(--vault-success)"
                          : "var(--vault-rule)"
                    }`,
                    // Cleared rungs carry a soft emerald "completed" glow; the
                    // active rung breathes via .gtp-active-glow (gold).
                    boxShadow: isCleared ? "0 0 10px color-mix(in srgb, var(--gtp-success-on-dark) 40%, transparent)" : undefined,
                    ["--gtp-glow" as string]: isActive ? "color-mix(in srgb, var(--vault-accent) 55%, transparent)" : undefined,
                  }}
                >
                  {isCleared ? "✓" : rung.step}
                  {isCleared && (
                    // Completed-step sparkle — subtle, CSS-only, motion-gated.
                    <span
                      aria-hidden
                      className="gtp-spark absolute rounded-full"
                      style={{
                        width: 5,
                        height: 5,
                        top: -2,
                        right: -2,
                        background: "var(--vault-success)",
                        boxShadow: "0 0 6px color-mix(in srgb, var(--gtp-success-on-dark) 80%, transparent)",
                      }}
                    />
                  )}
                </span>

                <div className="flex flex-col min-w-0">
                  <span
                    className="font-semibold"
                    style={{
                      color: isActive
                        ? "var(--vault-gold-bright)"
                        : "var(--vault-text)",
                      fontSize: 15,
                    }}
                  >
                    {formatLadderUsd(rung.start)} → {formatLadderUsd(rung.goal)}
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
                  >
                    needs ≥ {ladderMultiplierLabel(rung)}
                  </span>
                </div>

                <span className="ml-auto flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className="font-mono uppercase tracking-[0.12em]"
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
                  {isActive && (
                    <span
                      className="font-mono rounded-full px-2 py-0.5"
                      style={{
                        fontSize: 10,
                        color: "var(--vault-gold-bright)",
                        border: "1px solid var(--vault-gold-bright)",
                        background: "color-mix(in srgb, var(--vault-accent) 8%, transparent)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      You are here · {formatLadderUsdPrecise(currentBankroll)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
