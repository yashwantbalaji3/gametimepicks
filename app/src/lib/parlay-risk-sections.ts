/**
 * Risk-section classifier — pure mapping from a slip's combined
 * American odds + leg count to a public risk label.
 *
 * Updated 2026-05-28 (PR `fix/public-risk-range-leg-counts`) to the
 * user-specified definitions:
 *
 *   Low Risk     — combined odds <  +300, 2–3 legs
 *   Medium Risk  — combined odds  +300 – +599, 3–4 legs
 *   High Risk    — combined odds  +600 – +999, 4–5 legs
 *   Longshot     — combined odds ≥ +1000, 5–6 legs
 *
 * Boundary discipline: each section is half-open at the top to avoid
 * any double-counting. The odds buckets read:
 *
 *   Low      = (-∞, +300)
 *   Medium   = [+300, +600)
 *   High     = [+600, +1000)
 *   Longshot = [+1000, +∞)
 *
 * The leg-count ranges intentionally overlap at 3 and 4 and 5 so the
 * UI can pick the right bucket from the BOTH-must-match rule below.
 *
 * Public surfaces (parlay-lab Suggested mode, slip-card chip,
 * Bankroll Plan rows) ONLY show a slip under a section when BOTH its
 * combined odds AND its leg count fall in that section's ranges. A
 * slip that fails either filter is excluded from public display
 * (it's still in the internal optimizer JSON; the public selector
 * handles the gap by generating section-aligned slips on the
 * pipeline side).
 *
 * Honesty constraints:
 *   - Does NOT use "safe" / "safety" anywhere.
 *   - Does NOT imply certainty of payout.
 *   - Does NOT change the optimizer or settlement.
 *   - When a slip has no computable combined odds (some leg's
 *     `oddsForSide` is null), it is excluded — the UI never shows a
 *     fabricated payout.
 */

export type RiskSectionKey = "low" | "medium" | "high" | "longshot";

export interface RiskSectionDisplay {
  key: RiskSectionKey;
  /** Public-facing label rendered as the section header. */
  label: string;
  /** Compact odds-range chip (e.g. "+300 to +599"). */
  oddsRange: string;
  /** Compact leg-count chip (e.g. "3–4 legs"). */
  legRange: string;
  /** One-line subtitle for the section header. No "safe" language. */
  subtitle: string;
  /** CSS variable name resolved by the renderer. */
  accentVar: string;
  /** Inclusive lower bound on combined American odds. `-Infinity`
   *  for Low. */
  oddsLowInclusive: number;
  /** Exclusive upper bound. `Infinity` for Longshot. */
  oddsHighExclusive: number;
  /** Inclusive lower bound on leg count. */
  legLowInclusive: number;
  /** Inclusive upper bound. */
  legHighInclusive: number;
}

const SECTION_DISPLAY: Record<RiskSectionKey, RiskSectionDisplay> = {
  low: {
    key: "low",
    label: "Low Risk",
    oddsRange: "under +300",
    legRange: "2–3 legs",
    subtitle: "Shorter combined odds, fewer legs.",
    accentVar: "var(--vault-success)",
    oddsLowInclusive: Number.NEGATIVE_INFINITY,
    oddsHighExclusive: 300,
    legLowInclusive: 2,
    legHighInclusive: 3,
  },
  medium: {
    key: "medium",
    label: "Medium Risk",
    oddsRange: "+300 to +599",
    legRange: "3–4 legs",
    subtitle: "Balanced combined odds and leg count.",
    accentVar: "var(--vault-gold-bright)",
    oddsLowInclusive: 300,
    oddsHighExclusive: 600,
    legLowInclusive: 3,
    legHighInclusive: 4,
  },
  high: {
    key: "high",
    label: "High Risk",
    oddsRange: "+600 to +999",
    legRange: "4–5 legs",
    subtitle: "Longer combined odds, more legs.",
    accentVar: "var(--vault-warn)",
    oddsLowInclusive: 600,
    oddsHighExclusive: 1000,
    legLowInclusive: 4,
    legHighInclusive: 5,
  },
  longshot: {
    key: "longshot",
    label: "Longshot",
    oddsRange: "+1000 and up",
    legRange: "5–6 legs",
    subtitle: "Longest combined odds, most legs.",
    accentVar: "var(--vault-warn)",
    oddsLowInclusive: 1000,
    oddsHighExclusive: Number.POSITIVE_INFINITY,
    legLowInclusive: 5,
    legHighInclusive: 6,
  },
};

export const RISK_SECTION_ORDER: ReadonlyArray<RiskSectionKey> = [
  "low",
  "medium",
  "high",
  "longshot",
];

/** Lookup the public display metadata for a section. */
export function getRiskSectionDisplay(
  key: RiskSectionKey,
): RiskSectionDisplay {
  return SECTION_DISPLAY[key];
}

/** Classify a slip's combined American odds into an "odds-only"
 *  section. This is intermediate — the UI only shows a slip under
 *  a section when both odds AND legs align via `classifySlipBySection`.
 *  Returns null when odds are missing (no fabricated payout). */
export function classifyOddsSection(
  combinedAmericanOdds: number | null | undefined,
): RiskSectionKey | null {
  if (
    combinedAmericanOdds == null ||
    !Number.isFinite(combinedAmericanOdds)
  ) {
    return null;
  }
  for (const key of RISK_SECTION_ORDER) {
    const d = SECTION_DISPLAY[key];
    if (
      combinedAmericanOdds >= d.oddsLowInclusive &&
      combinedAmericanOdds < d.oddsHighExclusive
    ) {
      return key;
    }
  }
  return null;
}

/** Strict classification: returns the section key only when BOTH the
 *  slip's combined American odds AND its leg count fall inside that
 *  section's ranges. Returns null otherwise (the slip is excluded
 *  from public display). */
export function classifySlipBySection(
  combinedAmericanOdds: number | null | undefined,
  legCount: number,
): RiskSectionKey | null {
  if (!Number.isInteger(legCount) || legCount < 0) return null;
  const oddsSection = classifyOddsSection(combinedAmericanOdds);
  if (oddsSection == null) return null;
  const d = SECTION_DISPLAY[oddsSection];
  if (legCount < d.legLowInclusive || legCount > d.legHighInclusive) {
    return null;
  }
  return oddsSection;
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

/** Group an array of slips into per-section buckets using the strict
 *  "both odds AND legs must align" rule. Slips that don't align with
 *  any section are returned in `excluded` so the caller can decide
 *  whether to surface them (e.g. an "Other" fallback). */
export function groupSlipsByRiskSection<
  T extends { legs: ReadonlyArray<{ oddsForSide: number | null | undefined }> },
>(
  slips: ReadonlyArray<T>,
): {
  sections: Array<{ section: RiskSectionKey; slips: T[] }>;
  excluded: T[];
} {
  const buckets = new Map<RiskSectionKey, T[]>();
  for (const key of RISK_SECTION_ORDER) buckets.set(key, []);
  const excluded: T[] = [];
  for (const slip of slips) {
    const am = combinedAmericanOddsFromLegs(slip.legs);
    const sec = classifySlipBySection(am, slip.legs.length);
    if (sec == null) {
      excluded.push(slip);
      continue;
    }
    buckets.get(sec)!.push(slip);
  }
  return {
    sections: RISK_SECTION_ORDER.map((section) => ({
      section,
      slips: buckets.get(section)!,
    })),
    excluded,
  };
}

/**
 * Resolve the four per-section buckets exactly the way the public
 * Suggested-mode spread renders them, so any caller that needs a count
 * (e.g. a "Showing N parlays" summary line) derives it from the SAME
 * source the cards are drawn from — no risk of the summary disagreeing
 * with what's on screen.
 *
 * Two paths, mirroring `RiskSectionSpread`:
 *   - `sections` (server-bucketed `publicRiskSections`, already filtered
 *     to the active sport/team/player) wins when provided. Missing keys
 *     resolve to empty arrays.
 *   - otherwise the visible `slips` are re-bucketed client-side with the
 *     strict "both odds AND legs must align" rule (`groupSlipsByRiskSection`).
 */
export function getDisplaySectionBuckets<
  T extends { legs: ReadonlyArray<{ oddsForSide: number | null | undefined }> },
>(args: {
  sections?: Partial<Record<RiskSectionKey, ReadonlyArray<T>>>;
  slips?: ReadonlyArray<T>;
}): Record<RiskSectionKey, T[]> {
  if (args.sections) {
    return {
      low: [...(args.sections.low ?? [])],
      medium: [...(args.sections.medium ?? [])],
      high: [...(args.sections.high ?? [])],
      longshot: [...(args.sections.longshot ?? [])],
    };
  }
  const out: Record<RiskSectionKey, T[]> = {
    low: [],
    medium: [],
    high: [],
    longshot: [],
  };
  const { sections } = groupSlipsByRiskSection(args.slips ?? []);
  for (const { section, slips } of sections) out[section] = slips;
  return out;
}

/** Total parlays that will actually render across all four sections —
 *  the honest count behind the "Showing N parlays" summary line. */
export function countDisplaySlips<
  T extends { legs: ReadonlyArray<{ oddsForSide: number | null | undefined }> },
>(args: {
  sections?: Partial<Record<RiskSectionKey, ReadonlyArray<T>>>;
  slips?: ReadonlyArray<T>;
}): number {
  const buckets = getDisplaySectionBuckets(args);
  return RISK_SECTION_ORDER.reduce((n, key) => n + buckets[key].length, 0);
}

// ---------------------------------------------------------------------------
// Suggested-mode section display summary (PR: empty-section clarity)
// ---------------------------------------------------------------------------

export interface RiskSectionDisplaySummary {
  /** Total cards rendered across all sections. */
  displayedCards: number;
  /** Sections that have ≥1 card. */
  sectionsWithCards: number;
  /** Sections rendered empty (after sport / variety / volume filters). */
  emptySections: number;
  /** Total sections (always 4: Low / Medium / High / Longshot). */
  totalSections: number;
}

/**
 * Summarize the per-section display buckets for the honest "N cards across M
 * of 4 sections · K empty after filters" line above the Suggested spread.
 * Pure; derives only from what will actually render (no padding implied).
 */
export function getRiskSectionDisplaySummary<T>(
  buckets: Record<RiskSectionKey, ReadonlyArray<T>>,
): RiskSectionDisplaySummary {
  let displayedCards = 0;
  let sectionsWithCards = 0;
  for (const key of RISK_SECTION_ORDER) {
    const n = buckets[key]?.length ?? 0;
    displayedCards += n;
    if (n > 0) sectionsWithCards += 1;
  }
  const totalSections = RISK_SECTION_ORDER.length;
  return {
    displayedCards,
    sectionsWithCards,
    emptySections: totalSections - sectionsWithCards,
    totalSections,
  };
}

/**
 * Honest, generic reason an individual section rendered empty. We never claim
 * a specific cause we can't prove per-slate (volume/exposure caps vs sport
 * filter vs odds/leg band) — we name the real filter set and state plainly
 * that sections are NOT padded. `hasActiveFilter` = a team/game/player filter
 * is set, which adds a "clearing the filter may surface more" hint.
 *
 * No banned betting copy; never implies the shown cards are likelier to win.
 */
export function getEmptySectionReason(
  sectionKey: RiskSectionKey,
  hasActiveFilter: boolean = false,
): string {
  const d = SECTION_DISPLAY[sectionKey];
  const base =
    `No qualifying ${d.legRange} cards after sport, variety, and volume ` +
    `filters. Sections are not padded.`;
  return hasActiveFilter
    ? `${base} Clearing the active filter may surface more.`
    : base;
}

/** Back-compat shim used by ParlayTicketCard's lane chip:
 *  classify by odds only so a slip in High Risk (4 legs at +700)
 *  shows the "High Risk" chip even if it isn't aligned with the
 *  4-5 leg constraint of a section spread. The public spread itself
 *  uses the strict classifier — the per-card chip just labels the
 *  payout class. */
export function classifyRiskSection(
  combinedAmericanOdds: number | null | undefined,
): RiskSectionKey {
  return classifyOddsSection(combinedAmericanOdds) ?? "low";
}
