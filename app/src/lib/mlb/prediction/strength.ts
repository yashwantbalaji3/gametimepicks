/**
 * SIMULATION-STRENGTH LABELS (Sprint 009 · Phase 3). A directional prediction is always firm; this label only
 * communicates HOW STRONGLY the 10,000 simulated games agree — it describes simulation agreement, NEVER
 * historical accuracy, expected hit rate, confidence in a bet, or profitability. One config, one function,
 * used everywhere (moneyline winning side, totals/run-line selected side, player selected side).
 */

export type StrengthLabel = "LEAN" | "MODERATE SIMULATION" | "STRONG SIMULATION" | "VERY STRONG SIMULATION";

/** Thresholds on the SELECTED-SIDE probability (always ≥ 0.5), highest first. Centralized + test-pinned. */
export const STRENGTH_THRESHOLDS: { min: number; label: StrengthLabel }[] = [
  { min: 0.7, label: "VERY STRONG SIMULATION" },
  { min: 0.6, label: "STRONG SIMULATION" },
  { min: 0.55, label: "MODERATE SIMULATION" },
  { min: 0.5, label: "LEAN" },
];

/**
 * Label the strength of a directional prediction from the SELECTED side's simulated probability. Accepts any
 * probability in [0,1]; the winning-side probability (max(p, 1−p)) is what the thresholds apply to, so passing
 * either side is safe. Below 0.5 (should not happen for a selected side) it still returns "LEAN".
 */
export function strengthLabel(selectedSideProbability: number): StrengthLabel {
  const p = selectedSideProbability >= 0.5 ? selectedSideProbability : 1 - selectedSideProbability;
  for (const t of STRENGTH_THRESHOLDS) if (p >= t.min) return t.label;
  return "LEAN";
}

/** A shorter chip form for compact surfaces (e.g. /today). Same thresholds, terser wording. */
export function strengthChip(selectedSideProbability: number): string {
  switch (strengthLabel(selectedSideProbability)) {
    case "VERY STRONG SIMULATION":
      return "VERY STRONG";
    case "STRONG SIMULATION":
      return "STRONG";
    case "MODERATE SIMULATION":
      return "MODERATE";
    default:
      return "LEAN";
  }
}
