/**
 * THE GAME LIFECYCLE STATE MACHINE (v1.1.1 · L1104).
 *
 * ONE canonical derivation of what a game page — or a hub card — should PRESENT, so a dozen
 * surfaces cannot each invent their own chain of conditions. Pure: no I/O, no clock of its own, no
 * writes. Both the server (static render) and the browser (after a poll) call it with the same
 * inputs and get the same answer.
 *
 * ⚠ THE RULE THIS FILE EXISTS TO ENFORCE: A PROVIDER "FINAL" IS NOT A SETTLEMENT.
 * The live feed saying "Game Over" is an observation by a provider. Being GRADED is a statement by
 * the settlement owner (`mlb/results/game-predictions-graded.jsonl`, `resultSource:
 * statsapi-linescore`, with a `gradedAt`). They usually agree, and they arrive HOURS apart — last
 * night's MIA @ AZ read FINAL at 05:14Z and was graded at 09:58Z. In that window the honest answer
 * is neither "live" nor "graded", so it gets its own first-class state:
 * FINAL_PENDING_SETTLEMENT.
 *
 * There is no function here that writes, grades, or promotes anything. `settlement` is an INPUT,
 * read from the canonical artifact by the caller; nothing in this module can manufacture one.
 *
 * The three owners stay separate (charter §8):
 *   PRE-GAME FORECAST   immutable   model-owned
 *   LIVE EVENT STATE    ephemeral   provider-owned
 *   FINAL RESULT        canonical   settlement-owned
 */
import { isTerminal } from "./contract.mjs";

/** Every presentation state a game can be in. Exceptional states are first-class, not fallbacks. */
export const LIFECYCLE_STATES = Object.freeze([
  "PRE",
  "LIVE",
  "DELAYED",
  "FINAL_PENDING_SETTLEMENT",
  "SETTLED",
  "POSTPONED",
  "CANCELLED",
  "UNKNOWN",
]);

/** Reader-facing label per state. Never says "graded" for a provider-only final. */
export const LIFECYCLE_LABEL = Object.freeze({
  PRE: "Scheduled",
  LIVE: "Live",
  DELAYED: "Delayed",
  FINAL_PENDING_SETTLEMENT: "Final · grading pending",
  SETTLED: "Final",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  UNKNOWN: "Status unknown",
});

/**
 * Derive the presentation state.
 *
 * @param envelope   a LiveEventEnvelope, or null when Live is off/unavailable — the page must still
 *                   work without it, which is why it is optional rather than required.
 * @param settlement the canonical graded result for this game, or null. Its mere PRESENCE is what
 *                   makes a game SETTLED; no provider field can stand in for it.
 */
/**
 * @param {{ envelope?: any, settlement?: any }} [input]
 * @returns {{ state: string, label: string, pollingAllowed: boolean, showsFrozenForecast: boolean,
 *             showsPostgameReview: boolean, isCanonicallyGraded: boolean, reason: string }}
 */
export function derivePresentationState({ envelope = null, settlement = null } = {}) {
  const provider = envelope?.state ?? null;

  /*
   * Settlement outranks the provider — but only for games that actually produce a result. A
   * postponed or cancelled game must never read as SETTLED even if a stray row existed for it;
   * that is the fail-closed direction, and the postponed-as-0-0-final trap has been paid for once
   * already in this repository.
   */
  if (settlement && provider !== "POSTPONED" && provider !== "CANCELLED") {
    return frame("SETTLED", {
      polling: false,
      frozenForecast: true,
      postgameReview: true,
      reason: "CANONICAL_SETTLEMENT_PRESENT",
    });
  }

  switch (provider) {
    case "POSTPONED":
      return frame("POSTPONED", { polling: false, frozenForecast: true, postgameReview: false, reason: "PROVIDER_POSTPONED" });
    case "CANCELLED":
      return frame("CANCELLED", { polling: false, frozenForecast: true, postgameReview: false, reason: "PROVIDER_CANCELLED" });
    case "FINAL":
      // The gap state. Facts are shown, grading is explicitly NOT claimed.
      return frame("FINAL_PENDING_SETTLEMENT", {
        polling: false,
        frozenForecast: true,
        postgameReview: false,
        reason: "PROVIDER_FINAL_WITHOUT_SETTLEMENT",
      });
    case "LIVE":
      return frame("LIVE", { polling: true, frozenForecast: true, postgameReview: false, reason: "PROVIDER_LIVE" });
    case "DELAYED":
      return frame("DELAYED", { polling: true, frozenForecast: true, postgameReview: false, reason: "PROVIDER_DELAYED" });
    case "PRE":
      return frame("PRE", { polling: true, frozenForecast: true, postgameReview: false, reason: "PROVIDER_PRE" });
    case "UNKNOWN":
      return frame("UNKNOWN", { polling: true, frozenForecast: true, postgameReview: false, reason: "PROVIDER_UNKNOWN" });
    default:
      // No envelope at all: Live is off, or the feed refused. The page is still a forecast page.
      return frame("PRE", { polling: false, frozenForecast: true, postgameReview: false, reason: "NO_LIVE_STATE" });
  }
}

function frame(state, { polling, frozenForecast, postgameReview, reason }) {
  return {
    state,
    label: LIFECYCLE_LABEL[state],
    /** May this surface keep asking the gateway? Terminal and settled games must stop. */
    pollingAllowed: polling,
    /** The frozen pregame forecast is shown in EVERY state — it never disappears. */
    showsFrozenForecast: frozenForecast,
    /** Only a canonically settled game may show the postgame review. */
    showsPostgameReview: postgameReview,
    /** ⚠ Never true from a provider FINAL alone. The only door to "graded" is settlement. */
    isCanonicallyGraded: state === "SETTLED",
    reason,
  };
}

/** Which of the hub's three groups a game belongs to. Exceptional states surface, never hide. */
/** @param {string} state @returns {"LIVE_NOW"|"UPCOMING"|"FINAL_TODAY"} */
export function hubGroupFor(state) {
  if (state === "LIVE" || state === "DELAYED") return "LIVE_NOW";
  if (state === "PRE" || state === "UNKNOWN") return "UPCOMING";
  return "FINAL_TODAY"; // FINAL_PENDING_SETTLEMENT, SETTLED, POSTPONED, CANCELLED
}

export const HUB_GROUPS = Object.freeze(["LIVE_NOW", "UPCOMING", "FINAL_TODAY"]);

export const HUB_GROUP_LABEL = Object.freeze({
  LIVE_NOW: "Live now",
  UPCOMING: "Starting soon",
  FINAL_TODAY: "Final today",
});

/**
 * Does ANY game on the slate still warrant polling?
 *
 * The hub polls once for the whole slate, so the cadence is a property of the slate rather than of
 * a card. An all-terminal slate stops entirely — the cost of an evening of finished baseball is
 * zero, which is the same guarantee the per-game panel already makes.
 */
/** @param {string[]} states @returns {boolean} */
export function slateStillMoving(states) {
  return states.some((s) => s === "LIVE" || s === "DELAYED" || s === "PRE" || s === "UNKNOWN");
}

/**
 * The postgame comparison: did each team's actual runs land inside its published frozen band?
 *
 * DESCRIPTIVE ONLY — the same BELOW/INSIDE/ABOVE vocabulary the player rows already use. It invents
 * no accuracy score, no grade, no expected value and no "beat the line" framing (§5.4). It is also
 * gated on `showsPostgameReview`, so it cannot appear for a game the settlement owner has not
 * graded, and it returns null when the forecast was never publishable for this event.
 */
/**
 * @param {{ settlement?: any, forecast?: any }} input
 * @returns {{ home: any, away: any, gradedAt: string|null } | null}
 */
export function postgameRunComparison({ settlement, forecast }) {
  if (!settlement || !forecast?.runs) return null;
  const actual = settlement.actual;
  if (!actual || typeof actual.homeRuns !== "number" || typeof actual.awayRuns !== "number") return null;
  const side = (key, runs) => {
    const band = forecast.runs[key];
    if (!band || typeof band.rangeLow !== "number" || typeof band.rangeHigh !== "number") return null;
    return {
      actual: runs,
      rangeLow: band.rangeLow,
      rangeHigh: band.rangeHigh,
      position: runs < band.rangeLow ? "BELOW" : runs > band.rangeHigh ? "ABOVE" : "INSIDE",
    };
  };
  const home = side("home", actual.homeRuns);
  const away = side("away", actual.awayRuns);
  if (!home || !away) return null;
  return { home, away, gradedAt: settlement.gradedAt ?? null };
}

/** True when this envelope's state means the gateway should not be asked again. */
export function envelopeIsTerminal(envelope) {
  return Boolean(envelope) && isTerminal(envelope.state);
}
