/**
 * SPORTSBOOK PROBABILITY PROVENANCE + CANONICAL ACCESS (Sprint 029 · Phases 1–2).
 *
 * ── Traced provenance (do not restate this from memory; it was followed end to end) ──
 *
 * The provider (`source: "odds_api"`, `bookmaker: "draftkings"`) supplies ONLY American prices.
 * Both probability fields on the live team-market artifact are GameTimePicks-derived:
 *
 *   impliedProb  = americanToImpliedRaw(price)      — projection-framework.ts
 *   noVigProb    = noVigTwoWay(price, otherPrice)   — projection-framework.ts, proportional
 *                                                     overround strip, both sides REQUIRED
 *
 * written by `scripts/ingest-mlb-team-markets.mjs`, which stamps `method: "market_implied_devig"`
 * on the artifact. Verified against the live 2026-07-27 file: no-vig pairs sum to exactly 1.0.
 *
 * This matters for public copy. Neither number is "the sportsbook's probability" — the book never
 * published a probability. They are OUR conversion of the book's price. Calling them the
 * sportsbook's own figures would misattribute the methodology; calling them a GameTimePicks
 * *model* output would be worse, since they contain no model at all. The honest phrasing is
 * "implied by the sportsbook price".
 *
 * ── Field coverage asymmetry (measured, not assumed) ──
 *   moneyline : impliedProb ✅  noVigProb ✅
 *   total     : impliedProb ❌  noVigProb ✅
 *   run line  : impliedProb ❌  coverNoVigProb ✅
 * So a consumer must never assume impliedProb exists just because noVigProb does.
 *
 * This module adds NO new math. It reuses projection-framework and exists to give consumers one
 * access path with provenance attached, so no page reimplements odds conversion.
 */
import { americanToImpliedRaw, noVigTwoWay } from "../projection-framework";
import type { MarketPrice, SportsbookMarket } from "./types";

/**
 * Where a probability came from. Recorded so public copy can attribute methodology correctly and
 * so a future provider-supplied probability is not silently relabelled as ours.
 */
export type ProbabilityProvenance =
  /** We converted the book's price ourselves. True of every probability in the repo today. */
  | "GTP_DERIVED_FROM_BOOK_PRICE"
  /** The provider published the probability itself. Nothing produces this today. */
  | "PROVIDER_SUPPLIED"
  /** Present but unattributable — treat as unusable rather than guess. */
  | "UNKNOWN";

/** The methodology stamp the ingest writes onto artifacts it de-vigs. */
export const DEVIG_METHOD = "market_implied_devig";

/** How the de-vig is described in public copy. Neutral, and accurate about who did the math. */
export const DEVIG_METHODOLOGY_NOTE =
  "Probabilities are converted by GameTimePicks from the sportsbook's posted price. " +
  "No-vig figures remove the book's overround proportionally across both sides of a two-way market.";

export interface ProbabilityReading {
  /** Vig-removed probability. Null when the artifact has none — never back-filled from implied. */
  readonly noVig: number | null;
  /** Raw probability implied by this side's price alone, still containing the book's margin. */
  readonly rawImplied: number | null;
  readonly provenance: ProbabilityProvenance;
  /** True when at least one probability is usable. */
  readonly available: boolean;
}

const UNAVAILABLE: ProbabilityReading = {
  noVig: null,
  rawImplied: null,
  provenance: "UNKNOWN",
  available: false,
};

/**
 * Canonical read of a stored price's probabilities.
 *
 * Deliberately does NOT fall back from noVig to rawImplied. They mean different things — one has
 * the book's margin removed and one does not — and a silent fallback would let a surface label a
 * vig-inclusive number as no-vig. Callers that genuinely want "whatever is available" must say so
 * by reading both fields and choosing explicitly.
 */
export function readProbabilities(price: MarketPrice | null | undefined): ProbabilityReading {
  if (!price || price.status !== "OK") return UNAVAILABLE;
  const noVig = typeof price.noVigProb === "number" ? price.noVigProb : null;
  const rawImplied = typeof price.impliedProb === "number" ? price.impliedProb : null;
  if (noVig === null && rawImplied === null) return UNAVAILABLE;
  return { noVig, rawImplied, provenance: "GTP_DERIVED_FROM_BOOK_PRICE", available: true };
}

/**
 * Derive a raw implied probability from an American price, for markets whose artifact stores none
 * (totals and run lines store only no-vig). Reuses the canonical converter — this adds no formula.
 * Returns null for anything unreadable, including a price of 0, which is not a valid American odd.
 */
export function impliedFromPrice(americanOdds: number | null | undefined): number | null {
  return americanToImpliedRaw(americanOdds);
}

/**
 * De-vig two American prices. Thin pass-through to the canonical implementation, which REQUIRES
 * both sides and returns null otherwise — a one-sided market cannot be de-vigged, because the
 * overround is only observable across the pair.
 */
export function deVigPair(
  sidePrice: number | null | undefined,
  otherPrice: number | null | undefined,
): { side: number; other: number } | null {
  return noVigTwoWay(sidePrice, otherPrice);
}

/** Both prices of a two-way market, keyed by side, for surfaces that show a full market. */
export function readMarketProbabilities(
  market: SportsbookMarket | null | undefined,
): Record<string, ProbabilityReading> {
  const out: Record<string, ProbabilityReading> = {};
  for (const p of market?.prices ?? []) out[p.side] = readProbabilities(p);
  return out;
}

/**
 * Format a probability for display. Presentation only — it returns a STRING, so a rounded value
 * can never be written back over the stored number. Storage precision and display precision are
 * different concerns and this keeps them physically separate.
 */
export function formatProbability(p: number | null | undefined, digits = 1): string | null {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  return `${(p * 100).toFixed(digits)}%`;
}
