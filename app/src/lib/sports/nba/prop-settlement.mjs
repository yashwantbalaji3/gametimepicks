/**
 * NBA PLAYER-PROP GRADER — PURE, client-safe, deterministic. Grades one OVER/UNDER leg against one official
 * final and that player's box-score line.
 *
 * WHY IT IS ITS OWN MODULE. `settlement-contract.mjs` grades team markets (moneyline, point_spread,
 * total_points) and refuses everything else. A player prop needs a different input (a box-score line, not
 * just the final score) and a sixth outcome, NO_MEASUREMENT. Keeping it apart leaves the team contract's
 * closed surface (three markets, four outcomes) unchanged, and both modules sit under the same no-writer
 * guard (settlement-contract.test.mjs).
 *
 * WHAT IT DOES NOT DO. It writes nothing and holds no ledger. The repo's one settlement writer stays
 * nightly-settle (MLB). It reads no file and calls no network: `prop-settlement-source.mjs` builds its
 * input from committed data. It does not admit a prop into any product. Per the PR 1166 plan, a prop leg
 * also needs forward shadow-grading on real frozen pre-tip rows before any product can carry one.
 *
 * NOT A BLIND NFL COPY. It borrows NFL's NO_MEASUREMENT + `bookRuleUnknown` semantics
 * (`nfl/live-prop-state.mjs`). It does not borrow NFL's tie handling: an NBA game cannot end tied, so a tied
 * "final" is a source defect and quarantines, exactly as the team contract does.
 *
 * RULES, checked in this order (the first that applies decides):
 *   1. Leg shape. Unknown family (minutes included: it is not a bettable market), a side other than "OVER" or
 *      "UNDER", a line that is not a finite number >= 0, or a missing athlete or event id: VOID_PENDING_REVIEW.
 *   2. Result identity. No result, or a result for another event: VOID_PENDING_REVIEW.
 *   3. Official status. Only STATUS_FINAL grades. Anything else (pending, in play, postponed, under review):
 *      VOID_PENDING_REVIEW.
 *   4. Final score. Points that are not non-negative integers, or a tied final: VOID_PENDING_REVIEW.
 *   5. Box score. No FINAL box score with player rows: VOID_PENDING_REVIEW. This is a missing feed, not a
 *      missing player, so it is never NO_MEASUREMENT.
 *   6. Player row for another athlete: VOID_PENDING_REVIEW.
 *   7. Participation. Not in the box score, flagged DNP, or exactly 0 minutes: NO_MEASUREMENT, with
 *      `bookRuleUnknown: true`. Never LOSS. Which of these a sportsbook voids is the book's rule, and we do
 *      not hold it.
 *   8. Integer stats or nothing. Minutes or a component stat that is not a non-negative integer:
 *      VOID_PENDING_REVIEW.
 *   9. Grade. A combined family is the sum of its parts (COMBO_KEYS in game-sim.mjs, the forecast's own
 *      definition). Stat equal to the line: PUSH (only an integer line can land exactly). Otherwise OVER wins
 *      when stat > line and UNDER wins when stat < line.
 *
 * The player's stats are read with `measureAthlete` (boxscore-line.mjs), the reader Top Board grading uses,
 * so the two graders cannot disagree on a player's stat. One deliberate difference: Top Board grading scores
 * projection accuracy for a 0-minute row, while this grader returns NO_MEASUREMENT for it (rule 7).
 */
import { COMBO_KEYS } from "./game-sim.mjs";
import { LINE_STATE, measureAthlete } from "./boxscore-line.mjs";

export const NBA_PROP_SETTLEMENT_VERSION = 1;

/** Prop outcomes. NO_MEASUREMENT is the absence of a stat. It is never a LOSS and never in a denominator. */
export const PROP_OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "NO_MEASUREMENT", "VOID_PENDING_REVIEW"]);

export const PROP_SIDES = Object.freeze(["OVER", "UNDER"]);

/** Each bettable family and the box-score stats it sums. Minutes is not a bettable market. */
export const PROP_FAMILIES = Object.freeze({
  pts: Object.freeze(["pts"]),
  reb: Object.freeze(["reb"]),
  ast: Object.freeze(["ast"]),
  threePm: Object.freeze(["threePm"]),
  pra: Object.freeze([...COMBO_KEYS.pra]),
  ptsReb: Object.freeze([...COMBO_KEYS.ptsReb]),
  ptsAst: Object.freeze([...COMBO_KEYS.ptsAst]),
});

/** Machine-readable reason codes, one per rule branch. */
export const PROP_REASON = Object.freeze({
  INVALID_LEG: "INVALID_LEG",
  UNKNOWN_FAMILY: "UNKNOWN_FAMILY",
  UNKNOWN_SIDE: "UNKNOWN_SIDE",
  INVALID_LINE: "INVALID_LINE",
  INVALID_IDENTITY: "INVALID_IDENTITY",
  NO_RESULT: "NO_RESULT",
  EVENT_MISMATCH: "EVENT_MISMATCH",
  NOT_FINAL: "NOT_FINAL",
  NON_INTEGER_SCORE: "NON_INTEGER_SCORE",
  TIED_FINAL: "TIED_FINAL",
  NO_FINAL_BOXSCORE: "NO_FINAL_BOXSCORE",
  PLAYER_MISMATCH: "PLAYER_MISMATCH",
  NOT_IN_BOXSCORE: "NOT_IN_BOXSCORE",
  DNP: "DNP",
  ZERO_MINUTES: "ZERO_MINUTES",
  NON_INTEGER_STAT: "NON_INTEGER_STAT",
  GRADED: "GRADED",
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isId = (v) => (typeof v === "string" && v.trim() !== "") || Number.isInteger(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
/** String form of an id that cannot throw; null when the value has no string form. */
const idOf = (v) => {
  try { return v == null ? null : String(v); } catch { return null; }
};
/** Reason-text rendering that cannot throw (BigInt, Symbol, cycles), so the grader stays total. */
const show = (v) => {
  try { return JSON.stringify(v) ?? String(v); } catch { return `<${typeof v}>`; }
};

/**
 * @typedef {{ family: string, side: "OVER"|"UNDER", line: number, providerAthleteId: string, eventId: string }} NbaPropLeg
 *
 * @typedef {object} NbaPropResult
 * @property {string} providerEventId
 * @property {string} status official game status (finals record); only STATUS_FINAL grades
 * @property {number|null} homePointsFT
 * @property {number|null} awayPointsFT
 * @property {boolean} boxscoreAvailable a FINAL box score with player rows exists for the event
 * @property {object|null} player the athlete's box-score row (boxscore-parse.mjs shape), null when absent
 */

/**
 * Grade one player-prop leg. Total: every input, including null and garbage, returns an outcome. It never
 * throws and never modifies `leg` or `result`.
 *
 * @param {NbaPropLeg} leg
 * @param {NbaPropResult} result
 * @returns {{ outcome: string, code: string, reason: string, family: string|null, side: string|null,
 *   line: number|null, finalStat: number|null, components: Record<string, number>|null, minutes: number|null,
 *   bookRuleUnknown: boolean, version: number }}
 */
export function gradeNbaPlayerProp(leg, result) {
  const isLeg = leg != null && typeof leg === "object";
  const family = isLeg && typeof leg.family === "string" ? leg.family : null;
  const side = isLeg && typeof leg.side === "string" ? leg.side : null;
  const line = isLeg && typeof leg.line === "number" && Number.isFinite(leg.line) ? leg.line : null;
  const out = (outcome, code, reason, extra = {}) => ({
    outcome, code, reason, family, side, line,
    finalStat: null, components: null, minutes: null,
    bookRuleUnknown: false,
    version: NBA_PROP_SETTLEMENT_VERSION,
    ...extra,
  });
  const review = (code, reason) => out("VOID_PENDING_REVIEW", code, reason);
  const noMeasurement = (code, reason, minutes = null) => out("NO_MEASUREMENT", code,
    `${reason}. Not a loss. Whether a sportsbook voids or settles this is the book's rule, and we do not hold it.`,
    { minutes, bookRuleUnknown: true });

  // 1. Leg shape.
  if (!isLeg) return review(PROP_REASON.INVALID_LEG, "no leg to grade");
  if (family === null || !own(PROP_FAMILIES, family)) {
    const why = family === "minutes" || family === "min" ? "minutes is not a bettable market" : "no grading rule for this family";
    return review(PROP_REASON.UNKNOWN_FAMILY, `family ${show(leg.family ?? null)}: ${why} (families: ${Object.keys(PROP_FAMILIES).join(", ")})`);
  }
  if (!PROP_SIDES.includes(side)) return review(PROP_REASON.UNKNOWN_SIDE, `side ${show(leg.side ?? null)}: only "OVER" or "UNDER" grades`);
  if (line === null || line < 0) return review(PROP_REASON.INVALID_LINE, `line ${show(leg.line ?? null)}: needs a finite number at or above 0`);
  if (!isId(leg.providerAthleteId) || !isId(leg.eventId)) return review(PROP_REASON.INVALID_IDENTITY, "the leg needs a providerAthleteId and an eventId");
  const eventId = String(leg.eventId);
  const athleteId = String(leg.providerAthleteId);

  // 2. Result identity.
  if (result == null || typeof result !== "object") return review(PROP_REASON.NO_RESULT, `no result for event ${eventId}`);
  if (!isId(result.providerEventId) || String(result.providerEventId) !== eventId) {
    return review(PROP_REASON.EVENT_MISMATCH, `the result is for event ${show(result.providerEventId ?? null)}, the leg is for ${eventId}`);
  }

  // 3. Official status: only STATUS_FINAL grades (the team contract's own test).
  if (!/^STATUS_FINAL/.test(String(result.status ?? ""))) {
    return review(PROP_REASON.NOT_FINAL, `status ${show(result.status ?? "missing")}: only STATUS_FINAL grades`);
  }

  // 4. Final score: integers, and never tied.
  const h = result.homePointsFT, a = result.awayPointsFT;
  if (!isCount(h) || !isCount(a)) return review(PROP_REASON.NON_INTEGER_SCORE, "FINAL status without integer points. Quarantined, never guessed");
  if (h === a) return review(PROP_REASON.TIED_FINAL, `final ${h}-${a}: an NBA game cannot end tied. Source defect, quarantined for review`);

  // 5. A final box score must exist before a player can be absent from it.
  if (result.boxscoreAvailable !== true) {
    return review(PROP_REASON.NO_FINAL_BOXSCORE, `no FINAL box score for event ${eventId}: a missing feed is not a missing player`);
  }

  // 6. The row must be this athlete's.
  const player = result.player ?? null;
  if (player !== null && (typeof player !== "object" || idOf(player.providerAthleteId) !== athleteId)) {
    return review(PROP_REASON.PLAYER_MISMATCH, `the box-score row is for athlete ${show(player?.providerAthleteId ?? null)}, the leg is for ${athleteId}`);
  }

  // 7. Participation. The shared reader decides whether there is a row and whether it is a DNP.
  const parts = PROP_FAMILIES[family];
  const m = measureAthlete(player, parts);
  if (m.state === LINE_STATE.NOT_IN_BOXSCORE) return noMeasurement(PROP_REASON.NOT_IN_BOXSCORE, `athlete ${athleteId} is not listed in the final box score (late scratch or inactive)`);
  if (m.state === LINE_STATE.DNP) return noMeasurement(PROP_REASON.DNP, `athlete ${athleteId} did not play${m.dnpReason ? ` (${show(m.dnpReason)})` : ""}`);
  if (m.minutes === 0) return noMeasurement(PROP_REASON.ZERO_MINUTES, `athlete ${athleteId} is listed with 0 minutes`, 0);

  // 8. Integer stats or nothing.
  if (m.state !== LINE_STATE.MEASURED || !isCount(m.minutes) || !parts.every((s) => isCount(m.values[s]))) {
    const raw = parts.map((s) => `${s} ${show(m.values?.[s] ?? null)}`).join(" · ");
    return review(PROP_REASON.NON_INTEGER_STAT, `minutes ${show(m.minutes)} · ${raw}: not non-negative integer stats. Quarantined, never read as 0`);
  }

  // 9. Grade. A combined family is the sum of its parts.
  const components = {};
  for (const s of parts) components[s] = m.values[s];
  const finalStat = parts.reduce((sum, s) => sum + components[s], 0);
  const measured = { finalStat, components, minutes: m.minutes };
  const label = parts.length > 1 ? `${family} ${finalStat} (${parts.map((s) => `${s} ${components[s]}`).join(" + ")})` : `${family} ${finalStat}`;
  if (finalStat === line) return out("PUSH", PROP_REASON.GRADED, `${label} lands exactly on ${line}`, measured);
  const overWon = finalStat > line;
  return (side === "OVER") === overWon
    ? out("WIN", PROP_REASON.GRADED, `${label} vs ${line}: ${side} wins`, measured)
    : out("LOSS", PROP_REASON.GRADED, `${label} vs ${line}: ${side} loses`, measured);
}

/**
 * Grade a batch and count it. Decisive = WIN + LOSS only. Pushes, no-measurements and reviews are counted
 * beside it, never inside it, and the population must reconcile exactly.
 *
 * @param {NbaPropLeg[]} legs
 * @param {(leg: NbaPropLeg) => NbaPropResult|null} resultFor
 */
export function settleNbaPlayerProps(legs, resultFor) {
  const graded = (legs ?? []).map((leg) => ({ leg, ...gradeNbaPlayerProp(leg, resultFor(leg)) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    version: NBA_PROP_SETTLEMENT_VERSION,
    total: graded.length,
    wins: count("WIN"),
    losses: count("LOSS"),
    pushes: count("PUSH"),
    noMeasurement: count("NO_MEASUREMENT"),
    voids: count("VOID_PENDING_REVIEW"),
    decisive: count("WIN") + count("LOSS"),
    bookRuleUnknown: graded.filter((g) => g.bookRuleUnknown).length,
  };
  summary.reconciles = summary.wins + summary.losses + summary.pushes + summary.noMeasurement + summary.voids === summary.total;
  return { graded, summary };
}
