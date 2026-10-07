/**
 * Stage 3D — the frozen pregame side decision (founder Q3 YES, 2026-10-06 22:22Z).
 *
 * Every winner/pick-capable forecast freezes, BEFORE the event starts, an explicit `publishedSide` or `TOO_CLOSE`.
 * After the start no Results reader may work a side out of probabilities: it reads this block, or it has no side.
 *
 * WHAT THIS MODULE DECIDES, AND WHAT IT DOES NOT. It freezes the decision a named rule makes and stamps the rule on
 * it. It does NOT define when a forecast is too close to call: the abstention threshold is a separate, later
 * product/model rule (founder: "do not silently define TOO_CLOSE as both sides below 50%"). Until that rule exists,
 * `abstention` must be null, and the only TOO_CLOSE this module emits is the one with no side at all (the sides'
 * probabilities are exactly equal). Passing an abstention rule throws: adopting one is a founder gate.
 *
 * Shape (frozen on the receipt, never edited after the start):
 *   sideDecision: { schemaVersion, publishedSide, rule, abstention, frozenAt }
 *     publishedSide  one of the forecast's sides (HOME / AWAY …) or "TOO_CLOSE"
 *     rule           the side rule that produced it (SIDE_RULE)
 *     abstention     null (no abstention threshold adopted) or, later, the adopted rule's id and version
 *     frozenAt       when it was frozen: the receipt's own generatedAt (always before the start)
 *
 * Pure: no fs, no clock.
 */
import { TOO_CLOSE } from "./forecast-of-record.mjs";

export { TOO_CLOSE };
export const SIDE_DECISION_SCHEMA = "side-decision@1";

/** Side rules a producer may freeze under. Adding one is a product/model decision, recorded here. */
export const SIDE_RULE = Object.freeze({
  /** The side with the higher frozen probability (non-side mass such as a tie is ignored); equal sides: TOO_CLOSE.
      Founder F3D-1 YES (2026-10-07 03:21Z, cmsg_018esqVkc9tL9hjPpUhCNowm61RB59h7ePH7bq1LFDx3qQ): the forward NFL
      winner side; TOO_CLOSE only on an exact tie, no abstention band; frozen before kickoff, never reconstructed. */
  MODEL_FAVORED_V1: "MODEL_FAVORED_V1",
});

const isProb = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));

/**
 * Freeze a side decision.
 * @param {{ sideProbabilities: Record<string, number>, sides: string[], rule: string, abstention?: null,
 *           frozenAt: string }} a
 *        sideProbabilities: per-side frozen probabilities (may carry non-side keys such as TIE, which are ignored)
 *        sides: the forecast's sides, e.g. ["HOME", "AWAY"]
 */
export function freezeSideDecision({ sideProbabilities, sides, rule, abstention = null, frozenAt }) {
  if (abstention != null) throw new Error("side-decision: no abstention rule has been adopted (founder gate); pass null");
  if (rule !== SIDE_RULE.MODEL_FAVORED_V1) throw new Error(`side-decision: unknown side rule ${rule}`);
  if (!Array.isArray(sides) || sides.length < 2 || sides.includes(TOO_CLOSE)) throw new Error("side-decision: sides must list at least two real sides");
  if (!isIso(frozenAt)) throw new Error("side-decision: frozenAt must be an ISO time");
  const ps = sides.map((s) => sideProbabilities?.[s]);
  if (!ps.every(isProb)) throw new Error(`side-decision: every side needs a frozen probability (${sides.join(", ")})`);
  const top = Math.max(...ps);
  const leaders = sides.filter((_, i) => ps[i] === top);
  return {
    schemaVersion: SIDE_DECISION_SCHEMA,
    publishedSide: leaders.length === 1 ? leaders[0] : TOO_CLOSE,
    rule,
    abstention: null,
    frozenAt,
  };
}

/**
 * Problems with a frozen side decision against its forecast (empty = valid). A reader that finds any must not grade a
 * side from it.
 * @param {object} d          the sideDecision block
 * @param {{ sides: string[], startUtc?: string|null }} ctx
 */
export function validateSideDecision(d, { sides, startUtc = null } = {}) {
  const p = [];
  if (!d || typeof d !== "object") return ["no side decision"];
  if (d.schemaVersion !== SIDE_DECISION_SCHEMA) p.push(`schemaVersion ${d.schemaVersion}`);
  if (!Object.values(SIDE_RULE).includes(d.rule)) p.push(`rule ${d.rule}`);
  if (d.abstention != null) p.push("abstention rule set but none is adopted");
  if (typeof d.publishedSide !== "string" || !(d.publishedSide === TOO_CLOSE || (sides ?? []).includes(d.publishedSide))) p.push(`publishedSide ${d.publishedSide}`);
  if (!isIso(d.frozenAt)) p.push("frozenAt");
  else if (isIso(startUtc) && !(Date.parse(d.frozenAt) < Date.parse(startUtc))) p.push("frozen at or after the start");
  return p;
}
