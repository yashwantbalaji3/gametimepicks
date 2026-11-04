/**
 * Reads the engine's gtp.suggested-cards@1 day file (app/public/data/suggested-cards/<ET date>.json) for a product day,
 * and returns the page's tier-board view: that file when it exists for the day, else the Level A model the page already
 * evaluated. Server-only. A missing or unreadable file is not an error — the Level A source covers the day.
 */
import fs from "node:fs";
import path from "node:path";
import { tierBoardFor } from "@/lib/products/tier-board/view.mjs";
import type { TierBoardView } from "@/components/tier-board/tier-board-section";

/**
 * FOUNDER DECISION (b), default OFF: pages read the frozen daily file only once the founder says yes. The engine branch
 * (claude/betting-engine-1104-02e05b) carries the owner of this switch, loadFrozenDailyCards in
 * lib/products/leg-pool/page-source.mjs (FROZEN_DAILY_CARDS_PUBLIC); at integration this reader is replaced by that call.
 * While false, the pages render the Level A model exactly as before.
 */
export const PAGES_READ_DAILY_CARDS = false;

export function readSuggestedCards(productDay: string | null, root = path.join(process.cwd(), "public", "data"), enabled = PAGES_READ_DAILY_CARDS): unknown | null {
  if (!enabled) return null;
  if (!productDay || !/^\d{4}-\d{2}-\d{2}$/.test(productDay)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "suggested-cards", `${productDay}.json`), "utf8"));
  } catch {
    return null;
  }
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
