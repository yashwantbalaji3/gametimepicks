/**
 * THE ONE NBA WIN-CHANCE READ for list surfaces (CONS-DAYVIEW, 2026-11-09). Home's NBA lane rows and Today's NBA rows
 * print the official Elo win chance ONLY through the one accessor (elo-win-probability.mjs eloWinProbabilityOf — PR 1219,
 * its switch and its provenance checks), in ONE text, or withhold it with ONE reason. No number is computed here and
 * no published lane is rewritten. Pure.
 */
import { eloWinProbabilityAttr, eloWinProbabilityOf, eloWinProbabilityText } from "./elo-win-probability.mjs";

/** Said wherever the accessor refuses (switch off, field absent, provenance or side mismatch). */
/* the wording Today has published since #1295 (WEB-03) — one reason, everywhere */
export const ELO_WIN_CHANCE_WITHHELD = "no win chance published";

/**
 * @param game a lane snapshot game (experimental-public lane)
 * @param ctx  { enabled } — the switch, as loadEloWinProbabilityContext reports it
 * @returns {{ shown: true, text: string, fullText: string, attr: string } | { shown: false, reason: string }}
 *   text      the numbers only ("CLE 44% · CHA 56%"), for a row that already names the favoured side (Home's lane)
 *   fullText  the accessor's own sentence (eloWinProbabilityText), as /nba, the game pages and Today print it
 */
export function eloWinChanceRead(game, { enabled } = {}) {
  const v = eloWinProbabilityOf(game ?? null, enabled === undefined ? undefined : { enabled });
  if (!v) return { shown: false, reason: ELO_WIN_CHANCE_WITHHELD };
  return { shown: true, text: `${v.awayAbbr} ${v.awayPct}% · ${v.homeAbbr} ${v.homePct}%`, fullText: eloWinProbabilityText(v), attr: eloWinProbabilityAttr(v) };
}
