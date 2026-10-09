/**
 * What the simulated box score may say about each batter row's rates (TRUTH-001, 2026-10-09).
 *
 * A confirmed batter with no GTP projection keeps his real name and slot but is simulated at
 * replacement-level rates. New artifacts record that per row (`rateSource`); older ones recorded only
 * the per-team count (`completeness.<side>RatedCount`). This never guesses WHICH rows were replacement
 * on an older artifact: it states the count and says the per-row source was not recorded.
 */

import type { FullGameSimGame, SimBatterLine } from "./types";

export type RowRateLabel = "projection" | "replacement" | "not_recorded";

export function rowRateLabel(b: Pick<SimBatterLine, "playerId" | "rateSource">): RowRateLabel {
  if (b.rateSource === "replacement" || b.rateSource === "projection") return b.rateSource;
  // A filler slot is replacement by construction (negative sentinel id, "Lineup fallback").
  if (b.playerId < 0) return "replacement";
  return "not_recorded";
}

/** One sentence per team under its table, or null when every row used the batter's own projection. */
export function teamRateNote(g: Pick<FullGameSimGame, "awayTeam" | "homeTeam" | "completeness" | "players">, team: string): string | null {
  const rows = (g.players?.batters ?? []).filter((b) => b.team === team);
  if (!rows.length) return null;
  const side = team === g.awayTeam ? "away" : team === g.homeTeam ? "home" : null;
  const rated = side ? (g.completeness as unknown as Record<string, unknown>)[`${side}RatedCount`] : null;
  const labels = rows.map(rowRateLabel);
  const marked = labels.filter((l) => l === "replacement").length;
  if (labels.every((l) => l !== "not_recorded")) {
    return marked
      ? `${marked} of ${rows.length} marked "replacement rates": no GTP projection (no posted prop line, or too little data), so the simulation used replacement-level rates under the real batter's name.`
      : null;
  }
  // Older artifact: the per-row source was not recorded. State only the count it did record.
  const unrated = typeof rated === "number" ? Math.max(0, rows.length - rated) : null;
  if (unrated == null) return "This simulation did not record which batters used their own projection.";
  if (unrated === 0) return null;
  if (marked === unrated) {
    // Every replacement row is a visible "Lineup fallback" filler, so nothing is hidden.
    return `${unrated} of ${rows.length} slots are "Lineup fallback" rows simulated at replacement-level rates.`;
  }
  return `${unrated} of ${rows.length} batters were simulated at replacement-level rates (no GTP projection). This simulation did not record which ones, so no row is marked.`;
}
