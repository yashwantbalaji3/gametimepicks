/**
 * MLB FORECAST STATE — the ONE reader that says, in public words, what state a game's official MLB forecast is in
 * (overnight 2026-10-28, founder: /today, the MLB game page and the simulation lobby must never present a degraded
 * or unavailable official snapshot as "Published" / "Simulation ready").
 *
 * Pure and filesystem-free (client- and server-safe). It reads ONLY the official snapshot's own fields: `status`
 * ("ready" | "degraded" | "unavailable") and `completeness`, as the prediction snapshot
 * (public/data/mlb/predictions/<date>.json) and the full-game artifact it is built from both carry them. Nothing is
 * inferred from a clock, a schedule or UI text, and nothing here decides what products may use — Level A refusals
 * (lib/products/level-a) stay the owner of that.
 *
 *   ready        → "Official Forecast"
 *   degraded     → "Official Forecast · degraded inputs" — the number stays (it IS the official snapshot) but never
 *                  as an unqualified headline: `headline` carries the qualifier AND the one-line cause.
 *   unavailable  → "Forecast unavailable", with the reason.
 *   anything else (no snapshot, unknown status) → null: the caller states no forecast state at all.
 */
import { degradedInputsNote } from "./degraded-note.mjs";

export const FORECAST_STATE_LABEL = Object.freeze({
  ready: "Official Forecast",
  degraded: "Official Forecast · degraded inputs",
  unavailable: "Forecast unavailable",
});

/** Words a non-ready snapshot's label may never carry (the guard in forecast-state.test.mjs reads this). */
export const NON_READY_FORBIDDEN = /\b(published|ready)\b/i;

const LINEUP_SIZE = 9;

/** The plain reason an official snapshot is unavailable, from its own completeness fields. */
function unavailableReason(c) {
  if (c?.startedBeforeGeneration === true) {
    return "The game had already started when the forecast was generated, so there is no pregame forecast.";
  }
  const lineupShort = ["away", "home"].some((side) => {
    const rated = c?.[`${side}RatedCount`];
    const size = typeof c?.[`${side}LineupCount`] === "number" ? c[`${side}LineupCount`] : LINEUP_SIZE;
    return (typeof rated === "number" && rated < size) || (c?.[`${side}LineupSource`] != null && c[`${side}LineupSource`] !== "confirmed");
  });
  return lineupShort
    ? "Not enough pregame lineup data to simulate this game."
    : "Not enough pregame data to produce a forecast for this game.";
}

/**
 * @typedef {{
 *   status: "ready" | "degraded" | "unavailable",
 *   ready: boolean,
 *   label: string,
 *   reason: string | null,
 *   causes: string | null,
 *   headline: string,
 *   tone: "ok" | "warn" | "mute",
 *   degradedNote: ReturnType<typeof degradedInputsNote>,
 * }} MlbForecastState
 */

/**
 * @param {{ status?: string | null, completeness?: any, awayTeam?: string | null, homeTeam?: string | null } | null | undefined} snapshot
 * @returns {MlbForecastState | null}
 */
export function mlbForecastState(snapshot) {
  const status = snapshot?.status;
  const away = snapshot?.awayTeam ?? "Away";
  const home = snapshot?.homeTeam ?? "Home";
  if (status === "ready") {
    return { status, ready: true, label: FORECAST_STATE_LABEL.ready, reason: null, causes: null, headline: FORECAST_STATE_LABEL.ready, tone: "ok", degradedNote: null };
  }
  if (status === "degraded") {
    const note = degradedInputsNote(status, snapshot?.completeness ?? null, { away, home });
    const causes = note?.causes ?? "some inputs incomplete";
    return {
      status, ready: false, label: FORECAST_STATE_LABEL.degraded,
      reason: note?.reason ?? "Some pregame inputs for this game are incomplete.",
      causes,
      headline: `${FORECAST_STATE_LABEL.degraded}: ${causes}`,
      tone: "warn", degradedNote: note,
    };
  }
  if (status === "unavailable") {
    const reason = unavailableReason(snapshot?.completeness ?? null);
    return { status, ready: false, label: FORECAST_STATE_LABEL.unavailable, reason, causes: null, headline: `${FORECAST_STATE_LABEL.unavailable}: ${reason}`, tone: "mute", degradedNote: null };
  }
  return null;
}

/**
 * The state for one game from a predictions document (public/data/mlb/predictions/<date>.json), by gamePk.
 * @param {{ predictions?: Array<Record<string, any>> } | null | undefined} doc
 * @param {string | number | null | undefined} gamePk
 */
export function mlbForecastStateForGame(doc, gamePk) {
  if (gamePk == null || gamePk === "") return null;
  const p = (doc?.predictions ?? []).find((x) => String(x?.gamePk ?? "") === String(gamePk));
  return p ? mlbForecastState(p) : null;
}

/* ── Surface view models — every surface's words for a NON-ready snapshot come from here, so they cannot drift. ── */

/**
 * The /today games table cell for a non-ready official snapshot: "Degraded inputs" (the forecast exists, qualified) or
 * "Unavailable" (with the reason). Null for a ready snapshot or no snapshot — the table's own Published/Frozen/Pending
 * rule applies unchanged.
 * @param {MlbForecastState | null} f
 * @returns {{ forecast: "Degraded inputs" | "Unavailable", note: string } | null}
 */
export function forecastTableCell(f) {
  if (!f || f.ready) return null;
  if (f.status === "degraded") return { forecast: "Degraded inputs", note: `${f.headline}. Not included in model suggestions.` };
  return { forecast: "Unavailable", note: `${f.label}: ${f.reason}` };
}

/**
 * The /simulate event-card badge for an MLB game with an official snapshot. Before the start the badge IS the
 * forecast state (never "Simulation ready" over a degraded/unavailable snapshot); after the start the lifecycle
 * badge (Started / Final) stays and a non-ready snapshot adds its state as a second line.
 * @param {MlbForecastState | null} f
 * @param {boolean} postStart
 * @returns {{ badge: string | null, tone: "ok" | "warn" | "mute" | null, note: string | null }}
 */
export function forecastEventBadge(f, postStart) {
  if (!f) return { badge: null, tone: null, note: null };
  if (postStart) return { badge: null, tone: null, note: f.ready ? null : f.headline };
  return { badge: f.label, tone: f.tone, note: f.ready ? null : f.status === "degraded" ? `${f.causes}. Not included in model suggestions.` : f.reason };
}
