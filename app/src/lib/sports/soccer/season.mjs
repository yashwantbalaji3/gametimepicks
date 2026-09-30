/**
 * Soccer season labels — ONE rule per season model (Soccer V2 · C-2). Pure.
 *
 * Two modules each carried their own copy of the August–May rollover (openfootball.mjs seasonOfDate and the
 * Elo-Poisson model's seasonOfIso), and neither could express MLS, whose season is the calendar year. The
 * registry (leagues.mjs `season.model`) now says which rule a competition uses; this file is the rule.
 *   aug-may     the season starting in July/August of that year: 2026-09-06 → "2026-27", 2026-06-30 → "2025-26"
 *   calendar    the calendar year: 2026-03-01 → "2026"
 *   tournament  the calendar year of the tournament
 */
import { league } from "./leagues.mjs";

/** August–May: July rolls over. Byte-for-byte the rule both previous copies used. */
export function augMaySeason(isoDate) {
  const [y, m] = String(isoDate).slice(0, 7).split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export const calendarSeason = (isoDate) => String(isoDate).slice(0, 4);

/** The season label for a date in the named competition, by its registered season model. */
export function seasonOf(key, isoDate) {
  const model = league(key).season?.model;
  if (model === "aug-may") return augMaySeason(isoDate);
  if (model === "calendar" || model === "tournament") return calendarSeason(isoDate);
  throw new Error(`seasonOf: ${key} has no registered season model`);
}
