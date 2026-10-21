/**
 * PARLAY LAB SETTLEMENT · THE NBA LEG GRADER. Pure, deterministic, no I/O.
 *
 * This is a ROUTER onto the two NBA graders that already exist, never a third grading rule:
 *   - team markets (moneyline / point spread / game total) → sports/nba/settlement-contract.mjs `gradeNbaLeg`
 *   - player over/unders (pts reb ast threePm pra ptsReb ptsAst) → sports/nba/prop-settlement.mjs `gradeNbaPlayerProp`
 * Both read the same result object (`prop-settlement-source.mjs` nbaPropResult: the write-once finals record plus the
 * stored FINAL box score), so a team leg and a prop leg on one card can never disagree about whether a game is final.
 * The player's stat comes from `measureAthlete`, the reader Top Board grading uses.
 *
 * GRADING CAPABILITY IS NOT ADMISSION. Routing a leg here says only that an NBA leg COULD be graded. It does not put
 * NBA into any ladder: SETTLEABLE_SPORTS (multi-sport.mjs, the ladder admission list) still excludes "nba", and the
 * registry, the price authorization and the frozen product policies still refuse every NBA leg.
 *
 * MAPPING to the lab's result words (the vocabulary lib/parlays/settlement.mjs settles cards from):
 *   WIN / LOSS / PUSH        → "win" / "loss" / "push"
 *   NO_MEASUREMENT           → "void". The player is absent from the FINAL box score, flagged DNP, or logged 0 minutes.
 *                              The lab's existing rule for a scratch (settle-lab-cards.mjs, P250 · A07): a void reduces
 *                              the card, it is never a loss and never pending forever. `bookRuleUnknown` is kept on the
 *                              note, because which of these a given sportsbook voids is that book's rule.
 *   VOID_PENDING_REVIEW      → "pending". Not final, postponed, no final box score, a recorded finals conflict (e.g. the
 *                              D4 hold on 401901822), a tied final, non-integer stats, an unknown market. An open
 *                              question is held, never guessed, never a loss.
 *   unrecognised leg         → "pending" with code UNMAPPED_LEG.
 */
import { gradeNbaLeg } from "../sports/nba/settlement-contract.mjs";
import { gradeNbaPlayerProp, PROP_FAMILIES } from "../sports/nba/prop-settlement.mjs";

export const NBA_LAB_GRADING_VERSION = "nba-lab-grading@1";

/** Lab market keys → the team contract's market names. */
const TEAM_MARKET = Object.freeze({
  moneyline: "moneyline", h2h: "moneyline",
  spreads: "point_spread", spread: "point_spread", point_spread: "point_spread",
  totals: "total_points", total: "total_points", total_points: "total_points",
});

/** Provider player-prop market keys → the prop grader's families (cross-sport.mjs NBA_FAMILY_MARKET_KEY, inverted). */
const PROP_MARKET_FAMILY = Object.freeze({
  player_points: "pts",
  player_rebounds: "reb",
  player_assists: "ast",
  player_threes: "threePm",
  player_points_rebounds_assists: "pra",
  player_points_rebounds: "ptsReb",
  player_points_assists: "ptsAst",
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The provider event id a lab leg names. Accepts the bare ESPN id ("401901830") or a canonical id whose last
 * segment is that id ("nba:nba:2026-10-21:401901830", "nba-401901830"). Anything else is null (the leg pends).
 */
export function nbaProviderEventId(eventId) {
  const s = eventId == null ? "" : String(eventId).trim();
  const m = /^(?:nba[:-](?:.*[:-])?)?(\d{6,})$/i.exec(s);
  return m ? m[1] : null;
}

/** Classify a lab leg: `{ kind: "team", market, side, line }`, `{ kind: "prop", family, side, line, athleteId }`, or null. */
export function nbaLabLegShape(leg) {
  if (leg == null || typeof leg !== "object") return null;
  const market = String(leg.market ?? "").trim().toLowerCase();
  const familyKey = typeof leg.family === "string" && own(PROP_FAMILIES, leg.family) ? leg.family : null;
  const family = familyKey ?? (own(PROP_MARKET_FAMILY, market) ? PROP_MARKET_FAMILY[market] : null);
  if (family) {
    const side = String(leg.side ?? "").trim().toUpperCase();
    const athleteId = leg.playerId ?? leg.providerAthleteId ?? null;
    return { kind: "prop", family, side, line: leg.line, athleteId: athleteId == null ? null : String(athleteId) };
  }
  if (own(TEAM_MARKET, market)) {
    return { kind: "team", market: TEAM_MARKET[market], side: String(leg.side ?? "").trim().toLowerCase(), line: leg.line ?? null };
  }
  return null;
}

const LAB_WORD = Object.freeze({ WIN: "win", LOSS: "loss", PUSH: "push", NO_MEASUREMENT: "void" });

/**
 * Grade one NBA lab leg.
 * @param {object} leg the ladder leg (sport "nba")
 * @param {(providerEventId: string, providerAthleteId: string|null) => object|null} resultFor
 *   an nbaPropResult-shaped object for that event (and athlete, for a prop), or null when nothing is recorded
 * @returns {{ result: "win"|"loss"|"push"|"void"|"pending", grader: string|null, outcome: string|null, code: string,
 *   reason: string, bookRuleUnknown: boolean, finalStat: number|null, version: string }}
 */
export function gradeNbaLabLeg(leg, resultFor) {
  const base = { grader: null, outcome: null, bookRuleUnknown: false, finalStat: null, version: NBA_LAB_GRADING_VERSION };
  const eventId = nbaProviderEventId(leg?.eventId);
  const shape = nbaLabLegShape(leg);
  if (!eventId || !shape) {
    return { ...base, result: "pending", code: "UNMAPPED_LEG", reason: `no NBA grading rule for this leg (event ${String(leg?.eventId ?? "missing")}, market ${String(leg?.market ?? "missing")}) — held, never a loss` };
  }
  let result = null;
  try { result = typeof resultFor === "function" ? resultFor(eventId, shape.kind === "prop" ? shape.athleteId : null) : null; } catch { result = null; }

  if (shape.kind === "team") {
    const g = gradeNbaLeg({ market: shape.market, side: shape.side, line: typeof shape.line === "number" ? shape.line : null }, result);
    return { ...base, grader: "nba-settlement-contract", outcome: g.outcome, code: g.outcome, reason: g.reason, result: LAB_WORD[g.outcome] ?? "pending" };
  }
  const g = gradeNbaPlayerProp({ family: shape.family, side: shape.side, line: shape.line, providerAthleteId: shape.athleteId, eventId }, result);
  return {
    ...base,
    grader: "nba-prop-settlement",
    outcome: g.outcome,
    code: g.code,
    reason: g.reason,
    bookRuleUnknown: g.bookRuleUnknown === true,
    finalStat: g.finalStat,
    result: LAB_WORD[g.outcome] ?? "pending",
  };
}

/**
 * Does the NBA settlement path cover this PLAYER-PROP leg? Only for a family in `readyFamilies` — families the forward
 * shadow ledger shows GRADED (sports/nba/prop-settlement-readiness.mjs). Team legs answer false here: they are the team
 * contract's question. With no readiness passed in, every prop is refused, as before.
 * @param {ReadonlyArray<string>} [readyFamilies]
 * @returns {(leg: object) => boolean}
 */
export function nbaPropLegSettlesWith(readyFamilies = []) {
  const ready = new Set(readyFamilies ?? []);
  return (leg) => {
    const shape = nbaLabLegShape(leg);
    return shape?.kind === "prop" && ready.has(shape.family);
  };
}
