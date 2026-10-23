/**
 * EPL OFFICIAL FINALS, BY CANONICAL EVENT — the EPL lane's reader for graders outside the lane (Level A forward
 * grading). The lane owns the results capture and its identity join (soccer/epl-current-results.mjs); this only
 * re-exposes the joined, integer-goal FULL_TIME results as a Map, so no outside module names an EPL artifact path.
 * Quarantined results are never in the Map, so they grade as pending, never as a loss.
 */
import { loadCurrentEplResults } from "../../soccer/epl-current-results.mjs";

/** @returns {Map<string, { status: "FULL_TIME", homeGoalsFT: number, awayGoalsFT: number }>} */
export function eplOfficialFinals({ nowIso = new Date().toISOString() } = {}) {
  const out = new Map();
  for (const r of loadCurrentEplResults({ nowIso }).results ?? []) if (r.canonicalEventId && r.settlementResult) out.set(r.canonicalEventId, r.settlementResult);
  return out;
}
