/**
 * Suggested-card composition — one source for every surface that shows prebuilt cards.
 * (Program 142, Release Train 1 step 3C.)
 *
 * `/picks` built this list inline. Build now needs the same list for its Suggested Cards mode, and
 * the explicit instruction is not to clone `PicksExperience`/`ParlaysExplorer` into "a third
 * drifting implementation". So the COMPOSITION moves here and both routes call it; the rendering
 * component is reused as-is. Nothing about which cards appear, or in what order, changes.
 *
 * The ordering and the date gating are the parts worth preserving carefully, because they are
 * product truth rather than presentation:
 *   - only TODAY's slate counts as an active card; stale daily-mixed and World Cup artifacts are
 *     gated out so no surface leads with an old card
 *   - settled UFC cards are a RESULT, not an active pick, and are excluded from the live slate
 *   - order is tonight's focus first: UFC, then the optimizer slips, then any still-current WC/mixed
 */
import {
  normalizeWcCards,
  normalizeOptimizerSlips,
  normalizeUfcCards,
  loadDailyMixedCards,
  type PublicSuggestedCard,
} from "@/lib/normalize";
import fs from "node:fs";
import path from "node:path";

import { loadWorldCupParlays } from "@/lib/world-cup/projections";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";

const readJson = (...seg: string[]): unknown => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", ...seg), "utf8"));
  } catch {
    return null;
  }
};

/** Moved verbatim from /picks — these were page-local helpers, so Build could not have reused them. */
const loadUfc = (): unknown => readJson("ufc", "suggested-parlays-latest.json");

/** True once the UFC event has been officially settled — its cards are then a result, not an
 *  active pick, so no surface may show them in the live slate. */
function ufcSettled(): boolean {
  const s = readJson("ufc", "results-settled-latest.json") as { status?: string } | null;
  return s?.status === "final";
}

export type { PublicSuggestedCard };

/**
 * Every prebuilt card that is genuinely current for `today`.
 *
 * @param today the slate date to frame on (ET, `YYYY-MM-DD`)
 */
export function loadSuggestedCards(today: string): PublicSuggestedCard[] {
  const wcParlays = loadWorldCupParlays();
  const freshWcParlays = wcParlays && wcParlays.date === today ? wcParlays : null;
  // A settled UFC card is a result, not something to suggest.
  const ufcCardsForToday = ufcSettled() ? null : (loadUfc() as Parameters<typeof normalizeUfcCards>[0]);

  return [
    ...normalizeUfcCards(ufcCardsForToday, today),
    ...normalizeOptimizerSlips(getSuggestedParlaysForDate(today)?.slips ?? null, { date: today }),
    ...normalizeWcCards(freshWcParlays),
    ...loadDailyMixedCards(today),
  ];
}
