/**
 * FOUNDER DISPLAY EXCEPTION FOR AN NBA SLATE. PURE. A package under anomaly REVIEW may be shown with its flags on the record:
 * anomalyCheck EXCEPTION, the review result kept, and the affected player-markets listed. It changes no number. An identity
 * error (a line joined to the wrong player) is never excepted; STALE_PLAYER_ROSTER is a starter-role shift, so it may show. Approval stays with the founder, post by post.
 */
import crypto from "node:crypto";

import { VERDICT } from "./nba-anomaly-check.mjs";

export const IDENTITY_VERDICTS = Object.freeze([VERDICT.BAD_JOIN]);
export const DISPLAY_EXCEPTION_STATEMENT = "unvalidated v0.1, known minutes and role limitations; not corrected, calibrated or validated";

export const identityErrors = (anomalies) => (anomalies ?? []).filter((a) => IDENTITY_VERDICTS.includes(a.verdict));

/** @returns {{ pkg:any } | { blocked:Array<any> }} a PASS package comes back unchanged */
export function applyDisplayException(pkg, { id, nameOf = () => null, statement = DISPLAY_EXCEPTION_STATEMENT }) {
  const blocked = identityErrors(pkg.anomalies);
  if (blocked.length) return { blocked };
  if (pkg.anomalyCheck !== "REVIEW") return { pkg };
  const affected = pkg.anomalies.map((a) => ({ playerId: a.playerId, name: nameOf(a.playerId), market: a.market, verdict: a.verdict }));
  const out = { ...pkg, anomalyCheck: "EXCEPTION", reviewAnomalyCheck: "REVIEW", publicationException: { id, statement, affected } };
  out.contentSha256 = crypto.createHash("sha256").update(JSON.stringify({ exception: id, source: pkg.contentSha256, affected })).digest("hex");
  return { pkg: out };
}

/**
 * Flagged player-markets still printed as numbers. A flag other than GENUINE_EXPECTATION must render as Review or not at all;
 * a number in its cell makes the "flagged cells withheld" statement false (BOS@HOU, 2026-11-02: Derrick White AST shown).
 * `cells`: [key, text] pairs; stat cells are keyed `${playerId}.${market}`.
 */
export function flaggedCellsShown(anomalies, cells) {
  const text = new Map(cells);
  return (anomalies ?? []).filter((a) => a.verdict !== VERDICT.GENUINE_EXPECTATION && /\d/.test(String(text.get(`${a.playerId}.${a.market}`) ?? "")));
}
