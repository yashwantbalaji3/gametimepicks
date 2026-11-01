/**
 * FOUNDER DISPLAY EXCEPTION FOR AN NBA SLATE. PURE. A package under anomaly REVIEW may be shown with its flags on the record:
 * anomalyCheck EXCEPTION, the review result kept, and the affected player-markets listed. It changes no number. An identity
 * error (a wrong join or a player on the wrong roster) is never excepted. Approval stays with the founder, post by post.
 */
import crypto from "node:crypto";

import { VERDICT } from "./nba-anomaly-check.mjs";

export const IDENTITY_VERDICTS = Object.freeze([VERDICT.BAD_JOIN, VERDICT.STALE_PLAYER_ROSTER]);
export const DISPLAY_EXCEPTION_STATEMENT = "unvalidated v0.1, known minutes and role limitations; not corrected, calibrated or validated";

export const identityErrors = (anomalies) => (anomalies ?? []).filter((a) => IDENTITY_VERDICTS.includes(a.verdict));

/** @returns {{ pkg:any } | { blocked:Array<any> }} a PASS package comes back unchanged */
export function applyDisplayException(pkg, { id, nameOf = () => null }) {
  const blocked = identityErrors(pkg.anomalies);
  if (blocked.length) return { blocked };
  if (pkg.anomalyCheck !== "REVIEW") return { pkg };
  const affected = pkg.anomalies.map((a) => ({ playerId: a.playerId, name: nameOf(a.playerId), market: a.market, verdict: a.verdict }));
  const out = { ...pkg, anomalyCheck: "EXCEPTION", reviewAnomalyCheck: "REVIEW", publicationException: { id, statement: DISPLAY_EXCEPTION_STATEMENT, affected } };
  out.contentSha256 = crypto.createHash("sha256").update(JSON.stringify({ exception: id, source: pkg.contentSha256, affected })).digest("hex");
  return { pkg: out };
}
