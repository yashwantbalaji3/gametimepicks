/**
 * Company completion scorecard calculator (Program 128-133 §8, §13, §17).
 *
 * The math is a module, not prose, because the governing rule is "do not assign a percentage
 * first and reverse-engineer the checklist." Percentages here are a pure function of
 * (weight, status) pairs; there is no place to put a thumb on the scale, and the tests below it
 * prove weights sum, credits map, and applicability is excluded rather than counted as zero.
 *
 * Completion, health and confidence are deliberately SEPARATE outputs: a nearly complete
 * department can still be mid-incident, and a complete-looking one can rest on stale evidence.
 */

/** §8.2 status-credit scale. NOT_APPLICABLE is excluded from the denominator, never scored 0. */
export const STATUS_CREDIT = Object.freeze({
  DONE_PRODUCTION_PROVEN: 1.0,
  DONE_VALIDATED: 0.9,
  DONE_STAGING_ONLY: 0.75,
  IN_PROGRESS: 0.5,
  DESIGNED_ONLY: 0.25,
  BLOCKED_EXTERNAL: 0.0,
  NOT_STARTED: 0.0,
  ARCHIVED_COMPLETE: 1.0,
  NOT_APPLICABLE: null, // excluded
});

export function creditFor(status) {
  if (!(status in STATUS_CREDIT)) throw new Error(`unknown status: ${status}`);
  return STATUS_CREDIT[status];
}

/**
 * Weighted completion for one checklist.
 * @param {Array<{item:string, weight:number, status:string, evidence?:string, evidenceFresh?:boolean}>} items
 */
export function completion(items) {
  let num = 0;
  let den = 0;
  let applicable = 0;
  for (const it of items) {
    if (!Number.isInteger(it.weight) || it.weight < 1 || it.weight > 5) {
      throw new Error(`weight must be an integer 1..5 (item: ${it.item}, got ${it.weight})`);
    }
    const credit = creditFor(it.status);
    if (credit === null) continue; // NOT_APPLICABLE — excluded from the denominator entirely
    applicable += 1;
    num += it.weight * credit;
    den += it.weight;
  }
  if (den === 0) return { pct: null, applicable: 0, note: "no applicable items" };
  return { pct: Math.round((100 * num) / den), applicable, weightedNumerator: num, weightedDenominator: den };
}

/** §8.4 confidence from the share of WEIGHT backed by current (≤14d) evidence. */
export function confidence(items) {
  let fresh = 0;
  let den = 0;
  for (const it of items) {
    if (creditFor(it.status) === null) continue;
    den += it.weight;
    if (it.evidenceFresh) fresh += it.weight;
  }
  if (den === 0) return { level: "LOW", freshShare: 0 };
  const share = fresh / den;
  return { level: share >= 0.8 ? "HIGH" : share >= 0.5 ? "MEDIUM" : "LOW", freshShare: Math.round(share * 100) };
}

/**
 * §12 company roll-up. Department weights MUST sum to exactly 100 — a roll-up over weights that
 * do not sum to 100 silently rescales every department, which is how a scorecard flatters itself.
 */
export function companyRollup(departments) {
  const total = departments.reduce((s, d) => s + d.companyWeight, 0);
  if (total !== 100) throw new Error(`company department weights must sum to 100 (got ${total})`);
  const scored = departments.filter((d) => d.pct !== null);
  const missing = departments.length - scored.length;
  const pct = scored.reduce((s, d) => s + d.pct * d.companyWeight, 0) / 100;
  // Any department with no applicable items would silently shrink the roll-up; surface it.
  return { pct: Math.round(pct), departmentsScored: scored.length, departmentsUnscored: missing };
}

/**
 * §13 sport completion. Category weights are normalized against the APPLICABLE set, so a sport
 * that legitimately does not have a category is not punished for it.
 */
export function sportCompletion(categories) {
  return completion(categories);
}

export const LAUNCH_STATES = Object.freeze([
  "LIVE_CURRENT",
  "LIVE_PARTIAL",
  "FORWARD_PROOF_PENDING",
  "PREVIEW_ONLY",
  "DESIGN_ONLY",
  "ARCHIVED",
  "BLOCKED",
]);

export function assertLaunchState(s) {
  if (!LAUNCH_STATES.includes(s)) throw new Error(`unknown launch state: ${s}`);
  return s;
}
