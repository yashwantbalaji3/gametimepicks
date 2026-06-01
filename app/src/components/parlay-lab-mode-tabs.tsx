"use client";
/**
 * ParlayLabModeTabs — three-way switcher that gives /parlay-lab a
 * real product structure (PR `feature/parlay-lab-mode-tabs-bankroll`,
 * 2026-05-28).
 *
 *   • Suggested      — official model-ranked lane spreads (default)
 *   • Build Your Own — Custom Generator + Manual Builder (not tracked)
 *   • Bankroll Plan  — educational allocation planner
 *
 * Keyboard nav: ArrowLeft / ArrowRight cycles tabs. Active tab gets a
 * gold pill + heavier font weight. Mobile-safe at 375px (horizontal
 * scroll fallback if labels grow longer than the viewport).
 *
 * Presentation only — the active mode lives in the caller's state so
 * the builder can swap content sections without remounting filters or
 * losing the recent-form drawer's open leg.
 *
 * (The earlier "Phase 17" version of this file was dead code with no
 * consumers; it has been replaced by this active component.)
 */
import { useRef } from "react";

export type ParlayLabMode = "suggested" | "build" | "bankroll";

export const PARLAY_LAB_MODES: ReadonlyArray<{
  key: ParlayLabMode;
  label: string;
  sub: string;
}> = [
  {
    key: "suggested",
    label: "Suggested Parlays",
    sub: "Model-ranked lane spreads",
  },
  {
    key: "build",
    label: "Build Your Own",
    sub: "Custom slips · not officially tracked",
  },
  {
    key: "bankroll",
    label: "Bankroll Plan",
    sub: "Educational allocation planner",
  },
];

/**
 * Parse a URL hash (e.g. `#build`, `build`, or `#BUILD`) into a known
 * ParlayLabMode. Returns null for a missing or unrecognized hash so the
 * caller can fall back to its default — the mode keys here stay the one
 * source of truth (no separately-hardcoded hash strings elsewhere).
 */
export function parseParlayLabModeHash(hash: string): ParlayLabMode | null {
  const cleaned = (hash || "").replace(/^#/, "").trim().toLowerCase();
  const match = PARLAY_LAB_MODES.find((m) => m.key === cleaned);
  return match ? match.key : null;
}

interface Props {
  active: ParlayLabMode;
  onChange: (next: ParlayLabMode) => void;
}

export default function ParlayLabModeTabs({ active, onChange }: Props) {
  const refs = useRef<Map<ParlayLabMode, HTMLButtonElement | null>>(new Map());

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = PARLAY_LAB_MODES.findIndex((m) => m.key === active);
    if (idx === -1) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = PARLAY_LAB_MODES[
      (idx + delta + PARLAY_LAB_MODES.length) % PARLAY_LAB_MODES.length
    ];
    onChange(next.key);
    refs.current.get(next.key)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Parlay Lab mode"
      onKeyDown={onKey}
      className="flex items-center gap-1.5 p-1 rounded-full self-start overflow-x-auto"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
        maxWidth: "100%",
      }}
    >
      {PARLAY_LAB_MODES.map((mode) => {
        const isActive = mode.key === active;
        return (
          <button
            key={mode.key}
            ref={(el) => {
              refs.current.set(mode.key, el);
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(mode.key)}
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full inline-flex items-center whitespace-nowrap"
            style={{
              color: isActive ? "var(--vault-bg)" : "var(--vault-text-mute)",
              background: isActive ? "var(--vault-gold-bright)" : "transparent",
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              transition: "background-color 120ms ease",
            }}
            title={mode.sub}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
