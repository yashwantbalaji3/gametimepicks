/**
 * Risk-section classifier — pure mapping from combined American odds
 * to a public risk label.
 *
 * This module replaces the internal-lane public exposure (Anchor /
 * Core / Spotlight / Swing) on /parlay-lab with four odds-derived
 * sections users actually understand:
 *
 *   Low Risk     — combined odds under +250
 *   Medium Risk  — combined odds +250 to +449
 *   High Risk    — combined odds +450 to +749
 *   Longshot     — combined odds +750 and higher
 *
 * Boundaries were chosen against the live 2026-05-28 production
 * distribution (min +134, median +335, max +1048) so each section in
 * the All / MLB / Mixed views holds ≥3 slips. NBA-only High and
 * Longshot are honestly thin on a one-NBA-game slate because the SGP
 * cap of 2-3 legs prevents per-leg odds from compounding to +750+ —
 * the existing pool-availability banner handles that gap.
 *
 * Honesty constraints (matched to the spec):
 *   - Does NOT use "safe" / "safety" anywhere.
 *   - Does NOT imply certainty of payout.
 *   - Does NOT change the optimizer or settlement.
 *   - When a slip has no computable combined odds (some leg's
 *     `oddsForSide` is null), it falls into "low" so the UI still
 *     renders something — but the card itself will show "—" for the
 *     payout, never a fabricated number.
 */

export type RiskSectionKey = "low" | "medium" | "high" | "longshot";

export interface RiskSectionDisplay {
  key: RiskSectionKey;
  /** Public-facing label rendered as the section header. */
  label: string;
  /** Compact odds-range subtitle (e.g. "+250 to +449"). */
  oddsRange: string;
  /** One-line subtitle for the section header. No "safe" language. */
  subtitle: string;
  /** CSS variable name resolved by the renderer. */
  accentVar: string;
}

/** Inclusive lower bound (American odds) — anything below this lives
 *  in the section ranked one lower. */
const SECTION_BOUNDARIES: Record<RiskSectionKey, number> = {
  low: -Infinity,
  medium: 250,
  high: 450,
  longshot: 750,
};

export const RISK_SECTION_ORDER: ReadonlyArray<RiskSectionKey> = [
  "low",
  "medium",
  "high",
  "longshot",
];

const SECTION_DISPLAY: Record<RiskSectionKey, RiskSectionDisplay> = {
  low: {
    key: "low",
    label: "Low Risk",
    oddsRange: "under +250",
    subtitle: "Shorter combined odds, smaller projected payouts.",
    accentVar: "var(--vault-success)",
  },
  medium: {
    key: "medium",
    label: "Medium Risk",
    oddsRange: "+250 to +449",
    subtitle: "Balanced combined odds and projected payouts.",
    accentVar: "var(--vault-gold-bright)",
  },
  high: {
    key: "high",
    label: "High Risk",
    oddsRange: "+450 to +749",
    subtitle: "Longer combined odds, bigger projected payouts.",
    accentVar: "var(--vault-warn)",
  },
  longshot: {
    key: "longshot",
    label: "Longshot",
    oddsRange: "+750 and higher",
    subtitle: "Longest combined odds, largest projected payouts.",
    accentVar: "var(--vault-warn)",
  },
};

/** Classify a single combined American-odds value into a risk section. */
export function classifyRiskSection(
  combinedAmericanOdds: number | null | undefined,
): RiskSectionKey {
  if (
    combinedAmericanOdds == null ||
    !Number.isFinite(combinedAmericanOdds)
  ) {
    // Honest fallback: when odds can't be computed, keep the card
    // visible by parking it in Low Risk. The card itself will still
    // render "—" for the payout (no fabrication).
    return "low";
  }
  if (combinedAmericanOdds >= SECTION_BOUNDARIES.longshot) return "longshot";
  if (combinedAmericanOdds >= SECTION_BOUNDARIES.high) return "high";
  if (combinedAmericanOdds >= SECTION_BOUNDARIES.medium) return "medium";
  return "low";
}

/** Lookup the public display metadata for a section. */
export function getRiskSectionDisplay(
  key: RiskSectionKey,
): RiskSectionDisplay {
  return SECTION_DISPLAY[key];
}

/** Combined American odds derived from per-leg `oddsForSide` values.
 *  Returns null when any leg lacks a usable price — the caller must
 *  render "—" rather than a fabricated payout. */
export function combinedAmericanOddsFromLegs(
  legs: ReadonlyArray<{ oddsForSide: number | null | undefined }>,
): number | null {
  if (legs.length === 0) return null;
  let decimal = 1;
  for (const leg of legs) {
    const o = leg.oddsForSide;
    if (typeof o !== "number" || !Number.isFinite(o) || o === 0) return null;
    decimal *= o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
  }
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  if (decimal > 1) return -Math.round(100 / (decimal - 1));
  return 0;
}

/** Group an array of slips into per-section buckets. The buckets are
 *  returned in the canonical section order; each section preserves
 *  the caller's input order. Pure. */
export function groupSlipsByRiskSection<
  T extends { legs: ReadonlyArray<{ oddsForSide: number | null | undefined }> },
>(slips: ReadonlyArray<T>): Array<{ section: RiskSectionKey; slips: T[] }> {
  const buckets = new Map<RiskSectionKey, T[]>();
  for (const key of RISK_SECTION_ORDER) buckets.set(key, []);
  for (const slip of slips) {
    const am = combinedAmericanOddsFromLegs(slip.legs);
    const key = classifyRiskSection(am);
    buckets.get(key)!.push(slip);
  }
  return RISK_SECTION_ORDER.map((section) => ({
    section,
    slips: buckets.get(section)!,
  }));
}
