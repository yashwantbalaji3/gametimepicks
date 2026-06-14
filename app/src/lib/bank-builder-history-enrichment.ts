/**
 * bank-builder-history-enrichment — real portrait/logo metadata for the settled
 * Steps 1–4 ladder legs, so Previous Hits can render the EXACT legs that hit with
 * official player headshots, team logos, and country flags.
 *
 * Honesty: the public ledger leg rows store only the player/selection NAME (plus the
 * real settled result). The ids/teams/codes below were read directly from the real
 * historical provider boards for each step's date — they are not guessed:
 *   - Step 1 (MLB 2026-06-09): Ohtani (660271, LAD@PIT) · Seager (608369, TEX@KC)
 *   - Step 2 (NBA 2026-06-10): Castle (4845367, SA) · Anunoby (3934719, NY)
 *   - Step 3 (World Cup 2026-06-11): Mexico · South Korea / Czechia
 *   - Step 4 (WC + MLB 2026-06-12): United States / Paraguay · Avila (679883, HOU@KC)
 * NBA ids are ESPN athlete ids (the board source is espn_scoreboard); MLB ids are MLB
 * Stats API ids; country codes are ISO-3166 alpha-2 for the flag emoji. A leg with no
 * entry here simply renders the initials/monogram fallback — never a fabricated face.
 */

export type HistoryLegVisual =
  | { kind: "player"; sport: "nba" | "mlb"; playerId: number; team: string }
  | { kind: "match"; codes: string[] };

/** Keyed by the ledger leg's `player` (props) or `selection` (team/country markets). */
const HISTORY_VISUALS: Record<string, HistoryLegVisual> = {
  // Step 1 — MLB
  "Shohei Ohtani": { kind: "player", sport: "mlb", playerId: 660271, team: "LAD" },
  "Corey Seager": { kind: "player", sport: "mlb", playerId: 608369, team: "TEX" },
  // Step 2 — NBA Finals Game 4 · Step 5 — NBA Finals Game 5 (Castle hit in both)
  "Stephon Castle": { kind: "player", sport: "nba", playerId: 4845367, team: "SA" },
  "OG Anunoby": { kind: "player", sport: "nba", playerId: 3934719, team: "NY" },
  // Step 5 — NBA Finals Game 5
  "Devin Vassell": { kind: "player", sport: "nba", playerId: 4395630, team: "SA" },
  // Step 3 — World Cup
  "Mexico": { kind: "match", codes: ["MX"] },
  "South Korea or Czechia": { kind: "match", codes: ["KR", "CZ"] },
  // Step 4 — World Cup + MLB
  "United States or Paraguay": { kind: "match", codes: ["US", "PY"] },
  "Luinder Avila": { kind: "player", sport: "mlb", playerId: 679883, team: "HOU" },
};

/** Visual metadata for a settled leg, or null to fall back to a monogram. */
export function historyLegVisual(name: string | null | undefined): HistoryLegVisual | null {
  if (!name) return null;
  return HISTORY_VISUALS[name] ?? null;
}
