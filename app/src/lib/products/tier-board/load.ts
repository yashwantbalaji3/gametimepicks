/**
 * Reads the engine's gtp.suggested-cards@1 day file (app/public/data/suggested-cards/<ET date>.json) for a product day,
 * and returns the page's tier-board view: that file when it exists for the day, else the Level A model the page already
 * evaluated. Server-only. A missing or unreadable file is not an error — the Level A source covers the day.
 */
import fs from "node:fs";
import path from "node:path";
import { tierBoardFor } from "@/lib/products/tier-board/view.mjs";
import type { TierBoardView } from "@/components/tier-board/tier-board-section";

export function readSuggestedCards(productDay: string | null, root = path.join(process.cwd(), "public", "data")): unknown | null {
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
