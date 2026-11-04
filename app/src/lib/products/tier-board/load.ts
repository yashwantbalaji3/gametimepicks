/**
 * Reads the engine's gtp.suggested-cards@1 day file (app/public/data/suggested-cards/<ET date>.json) for a product day,
 * and returns the page's tier-board view: that file when it exists and verifies for the day, else the Level A model the
 * page already evaluated (labelled as the fallback). Server-only.
 */
import { loadFrozenDailyCards } from "@/lib/products/leg-pool/page-source.mjs";
import { tierBoardFor, parlayTiersFor } from "@/lib/products/tier-board/view.mjs";
import type { ParlayTiersView } from "@/components/tier-board/parlay-tier-board";
import type { TierBoardView } from "@/components/tier-board/tier-board-section";

/**
 * FOUNDER RULE B (approved 2026-11-03): the day's FROZEN daily card file, read through the engine's verifying loader
 * (lib/products/leg-pool/page-source.mjs). It returns null with no file for the day, a productDay that is not the day,
 * or a content digest that does not verify; null means the page shows its labelled Level A fallback.
 */
export function readSuggestedCards(productDay: string | null, appDir = process.cwd()): unknown | null {
  if (!productDay) return null;
  return loadFrozenDailyCards({ appDir, date: productDay });
}

export function loadTierBoard(product: "bank-builder" | "moonshot", { productDay, levelAModel }: { productDay: string | null; levelAModel: unknown }): TierBoardView | null {
  return tierBoardFor(product, { suggestedCards: readSuggestedCards(productDay), levelAModel, productDay }) as TierBoardView | null;
}

/**
 * The engine guard's state for each NBA player MODEL PROJECTION of the day (`${eventId}:${playerId}` → "pass" | "review"
 * | "blocked"), from the same switched daily file. Empty while the switch is off, so a guarded list withholds everyone.
 */
export function playerGuardFor(productDay: string | null): Record<string, string> {
  const doc = readSuggestedCards(productDay) as { playerProjections?: { nba?: Array<{ eventId?: string; playerId?: string; guard?: { state?: string } }> } } | null;
  const out: Record<string, string> = {};
  for (const p of doc?.playerProjections?.nba ?? []) if (p.eventId && p.playerId && p.guard?.state) out[`${p.eventId}:${p.playerId}`] = p.guard.state;
  return out;
}

/** The Parlay Lab's four-tier board for a product day: the frozen daily file when present, else the Level A model. */
export function loadParlayTiers({ productDay, levelAModel }: { productDay: string | null; levelAModel: unknown }): ParlayTiersView | null {
  return parlayTiersFor({ suggestedCards: readSuggestedCards(productDay), levelAModel, productDay }) as ParlayTiersView | null;
}
