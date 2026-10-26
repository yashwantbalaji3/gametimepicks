/**
 * "DEGRADED INPUTS" — what an MLB official forecast built on incomplete inputs says about itself (founder decision
 * 2026-10-26: degraded official MLB forecasts stay OUT of model suggestions, but visitors still see them on the MLB
 * hub and the Game Simulation, clearly labelled, with an accurate explanation of the limitation).
 *
 * Pure. Reads ONLY the snapshot's own `status` and `completeness` — the full-game simulation artifact the official
 * prediction is built from (public/data/mlb/full-game-simulations/<date>.json; its `status` equals the prediction
 * snapshot's `status` for every committed game). The sentence names only causes the producer's level rule can act on
 * (board-adapter.ts `fullyReady`: nine projected batters a side and both probable starters), counted from the
 * snapshot's own fields. Nothing is inferred: a degraded snapshot whose fields name no cause gets a generic sentence.
 * A ready (or unavailable) snapshot gets no note at all.
 */

export const DEGRADED_LABEL = "Degraded inputs";

/**
 * The Level A refusal for a degraded MLB source, verbatim (level-a LEG_REFUSAL.SOURCE_NOT_READY), so the page and the
 * suggestions product say the same thing about the same forecast.
 */
export const DEGRADED_REFUSAL = "The official forecast is marked degraded: incomplete inputs.";
export const DEGRADED_SUGGESTIONS = "It is not included in model suggestions while degraded.";

const LINEUP_SIZE = 9;

/**
 * @param {string | null | undefined} status  the snapshot's `status` ("ready" | "degraded" | "unavailable")
 * @param {Record<string, any> | null | undefined} completeness  the snapshot's `completeness`
 * @param {{ away: string, home: string }} teams  team abbreviations, as the snapshot names them
 * @returns {{ label: string, reason: string, refusal: string, suggestions: string } | null}
 */
export function degradedInputsNote(status, completeness, { away, home }) {
  if (status !== "degraded") return null;
  const c = completeness ?? {};
  const reasons = [];
  for (const [abbr, side] of [[away, "away"], [home, "home"]]) {
    const rated = c[`${side}RatedCount`];
    const size = typeof c[`${side}LineupCount`] === "number" ? c[`${side}LineupCount`] : LINEUP_SIZE;
    if (typeof rated !== "number" || rated >= size) continue;
    const missing = size - rated;
    reasons.push(c[`${side}LineupSource`] === "confirmed"
      ? `${missing} of ${size} ${abbr} batters have no projection (no posted prop line, or too little data) and are simulated at replacement-level rates`
      : `${abbr} had not posted a batting order, so ${missing} of ${size} ${abbr} lineup slots are simulated at replacement-level rates`);
  }
  if (c.hasAwayStarter === false) reasons.push(`${away} has no posted probable starter, so a league bullpen aggregate pitches for ${away}`);
  if (c.hasHomeStarter === false) reasons.push(`${home} has no posted probable starter, so a league bullpen aggregate pitches for ${home}`);
  const reason = reasons.length ? `${reasons.join("; ")}.` : "Some pregame inputs for this game are incomplete.";
  return { label: DEGRADED_LABEL, reason: reason.charAt(0).toUpperCase() + reason.slice(1), refusal: DEGRADED_REFUSAL, suggestions: DEGRADED_SUGGESTIONS };
}
