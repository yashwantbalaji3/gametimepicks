/**
 * Research home (2026-10-05) · who gets a research page, in reader words.
 *
 * The research readiness receipt carries the bars as numbers (`thresholds`) and as engineering notes (`rules`, which
 * name a provider and say "noindex"). The public page writes its own sentence around the receipt's NUMBERS, so a bar
 * that moves in the builder moves on the page with no hand edit — research-home.test.mjs pins that every number shown
 * is the receipt's.
 */
import type { ResearchSport } from "./projection-store";

export type Thresholds = Record<string, number | string | string[]>;

/** "NFL-2023" → "2023"; "EPL-2025-26" → "2025-26". */
const seasonLabel = (id: unknown) => String(id ?? "").replace(/^[A-Z0-9]+-/, "");
const seasonSpan = (ids: unknown) => {
  const list = Array.isArray(ids) ? ids.map(seasonLabel) : [];
  return list.length > 1 ? `${list[0]}–${list[list.length - 1]}` : list[0] ?? "";
};

/** Who gets a page, in reader words. Every number comes from the receipt's thresholds. */
export function inclusionCopy(sport: ResearchSport, t: Thresholds): { team: string | null; player: string } {
  switch (sport) {
    case "NFL": return {
      team: "at least one official final recorded",
      player: `on a current roster with a recorded game in ${seasonSpan(t.NFL_ROSTER_SEASONS)}, or at least ${t.NFL_RECENT_MIN} recorded games across ${seasonSpan(t.NFL_RECENT_SEASONS)}`,
    };
    case "MLB": return {
      team: "at least one official final recorded",
      player: `at least ${t.MLB_MIN} recorded games in a captured stat category; these pages cover captured categories only`,
    };
    case "EPL": return {
      team: `in the ${seasonLabel(t.EPL_CURRENT_SEASON)} fixture list; final results are not yet recorded by ID, so team pages show fixtures, not a record`,
      player: `at least ${t.EPL_MIN} appearances in ${seasonLabel(t.EPL_SEASON)}`,
    };
    case "UFC": return {
      team: null,
      player: `at least ${t.UFC_MIN} recorded bouts, or a scheduled bout plus at least ${t.UFC_UPCOMING_MIN} recorded bout`,
    };
  }
}

