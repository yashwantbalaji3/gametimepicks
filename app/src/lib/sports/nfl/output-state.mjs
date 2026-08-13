/**
 * NFL output-state classifier (Program 174 · Release C).
 *
 * ONE pure function decides what every NFL output IS, from receipts alone. Before this, each
 * surface inferred its own label from whatever it happened to have loaded, which is how a page
 * ends up calling the same artifact two different things.
 *
 * The load-bearing rule: VALIDATED_PICK is mechanically unreachable from an experimental engine.
 * It is not a stricter branch of the same ladder — it requires a `validated` block that the
 * public-beta engine never emits, so no combination of odds, confidence, or copy can reach it.
 * A synthetic test proves an experimental artifact cannot render validated language.
 */

export const OUTPUT_STATES = Object.freeze([
  "MARKET_VIEW", "PUBLIC_EXPERIMENTAL", "EXPERIMENTAL_LEAN", "PROJECTION_ONLY",
  "VALIDATED_PICK", "NO_MARKET", "ROLE_UNCERTAIN", "STARTED", "SETTLED",
  "STALE", "MODEL_UNAVAILABLE",
]);

/** Reader-facing meaning. Never says "edge", "value", or anything about profit. */
export const STATE_MEANING = Object.freeze({
  MARKET_VIEW: "What sportsbooks imply — their numbers, not ours.",
  PUBLIC_EXPERIMENTAL: "An early model forecast. Not proven to beat the market.",
  EXPERIMENTAL_LEAN: "The direction our experimental model leans, with its uncertainty and record.",
  PROJECTION_ONLY: "A projected range. No comparable line exists, so there is nothing to compare it to.",
  VALIDATED_PICK: "A qualified pick under a named, performance-tested model version.",
  NO_MARKET: "No current line is offered for this.",
  ROLE_UNCERTAIN: "We cannot tell how much this player will play, so we are not projecting them.",
  STARTED: "This game has kicked off. The pre-game forecast is locked as it was.",
  SETTLED: "The official result is in and the original forecast has been graded.",
  STALE: "The evidence behind this aged out before we could refresh it.",
  MODEL_UNAVAILABLE: "No current model output exists for this game.",
});

/** States that may never carry validated-tier vocabulary or product eligibility. */
export const EXPERIMENTAL_STATES = Object.freeze(["PUBLIC_EXPERIMENTAL", "EXPERIMENTAL_LEAN", "PROJECTION_ONLY", "MARKET_VIEW"]);

/**
 * Classify one team-level output.
 *
 * @param {object} p
 * @param {object|null} p.forecast   the committed pre-kickoff forecast, if any
 * @param {object|null} p.market     the joined market row, if any
 * @param {object|null} p.result     the official result row, if any
 * @param {object|null} p.settlement the settlement record for this event, if any
 * @param {string} p.nowIso
 * @param {number} [p.leanThresholdPp] percentage-point gap at which a lean is declared
 */
export function classifyTeamOutput({ forecast, market, result, settlement, nowIso, leanThresholdPp = 5 }) {
  const now = Date.parse(nowIso);
  const kickoff = Date.parse(forecast?.kickoffUtc ?? market?.kickoffUtc ?? "");
  const reason = (state, detail, extra = {}) => ({ state, meaning: STATE_MEANING[state], detail, ...extra });

  if (settlement?.settled) return reason("SETTLED", "graded against the official result", { settlement });
  if (result && /^STATUS_FINAL/.test(result.statusRaw ?? "")) {
    return reason("STARTED", "final score is in; settlement runs on its own schedule", { awaitingSettlement: true });
  }
  if (Number.isFinite(kickoff) && now >= kickoff) {
    return reason("STARTED", "kicked off — the pre-game forecast is locked exactly as it was published", { locked: true });
  }
  if (!forecast) {
    return market ? reason("MARKET_VIEW", "sportsbook consensus only; no model forecast for this game") : reason("MODEL_UNAVAILABLE", "no forecast and no market");
  }
  // a forecast whose evidence aged past its own freshness window is STALE, never silently current
  if (forecast.stale) return reason("STALE", forecast.staleReason ?? "evidence aged out");

  // VALIDATED_PICK is unreachable without an explicit validated block. The public-beta engine
  // does not emit one, so this branch cannot fire for it — that is the point.
  if (forecast.validated?.approved === true && forecast.validated?.modelVersion && forecast.validated?.priceAtApproval) {
    return reason("VALIDATED_PICK", `qualified under ${forecast.validated.modelVersion}`, { validated: forecast.validated });
  }

  const modelHome = forecast.forecastSummary?.winProbability?.home;
  const marketHome = market?.consensus?.homeWinProbNoVig ?? forecast.marketComparison?.marketHomeWinPct;
  if (typeof modelHome === "number" && typeof marketHome === "number") {
    const gapPp = Number(((modelHome - marketHome) * 100).toFixed(1));
    if (Math.abs(gapPp) >= leanThresholdPp) {
      return reason("EXPERIMENTAL_LEAN", `the experimental model differs from the market by ${Math.abs(gapPp)} percentage points`, {
        gapPp,
        leansTo: gapPp > 0 ? forecast.home?.abbr : forecast.away?.abbr,
        mustAlsoShow: ["uncertainty", "model version", "settled experimental record", "that v1 has not met the validated bar"],
        notAnEdge: "A difference is a difference. This model has not been shown to beat the market.",
      });
    }
  }
  return reason("PUBLIC_EXPERIMENTAL", "current experimental forecast", { hasMarket: Boolean(marketHome) });
}

/**
 * Classify one player-family output. Role evidence gates everything: without it a projection is
 * withheld rather than published at zero.
 */
export function classifyPlayerOutput({ projection, roleState, line, result, nowIso, kickoffUtc }) {
  const now = Date.parse(nowIso);
  const kickoff = Date.parse(kickoffUtc ?? "");
  const reason = (state, detail, extra = {}) => ({ state, meaning: STATE_MEANING[state], detail, ...extra });

  if (result?.settled) return reason("SETTLED", "graded against official player statistics");
  if (Number.isFinite(kickoff) && now >= kickoff) return reason("STARTED", "kicked off — the pre-game projection is locked");
  // role first: a posted line never proves a player will take the field
  if (!roleState || roleState === "ROLE_UNCERTAIN" || roleState === "SOURCE_STALE") {
    return reason("ROLE_UNCERTAIN", roleState === "SOURCE_STALE" ? "the role evidence aged out" : "no source-backed evidence of how much this player will play", { withheld: true });
  }
  if (roleState === "OUT" || roleState === "NOT_ON_ROSTER") return reason("ROLE_UNCERTAIN", `player is ${roleState.toLowerCase().replace("_", " ")}`, { withheld: true });
  if (!projection) return reason("MODEL_UNAVAILABLE", "no projection produced for this family");
  if (line == null) return reason("PROJECTION_ONLY", "a projected range with no comparable line to sit beside", { noValueClaim: true });
  return reason("PUBLIC_EXPERIMENTAL", "projection with a current comparable line", { line });
}

/** Guardrail a renderer can call: does this state permit validated-tier vocabulary? */
export function permitsValidatedLanguage(state) {
  return state === "VALIDATED_PICK";
}

/** Guardrail: may this state contribute a leg to a paper product? */
export function permitsProductLeg(state) {
  return state === "VALIDATED_PICK";
}
