/**
 * RESULTS · THE MODEL SUGGESTIONS RECORD (Level A, unpriced). Pure. Founder mandate 2026-10-24: a reader comes back
 * after the games and finds every model suggestion as it was recorded, graded against the official final.
 *
 * Reads the two append-only files the Level A writers own (read-only here):
 *   suggestions  data/internal/products/level-a/suggestions.jsonl  (record.mjs — one entry per suggestion, as shown)
 *   grades       data/internal/products/level-a/graded.jsonl       (grade.mjs — one row per entry, once FINAL)
 * and recomputes nothing: an entry's result is its grade row's, and an entry with no grade row is PENDING.
 *
 * Rules (each pinned in level-a-record.test.mjs):
 *   - PENDING IS NEVER A LOSS and VOID IS NEVER A LOSS: decided = won + lost; void and pending are counted apart.
 *   - Its own record: no price, no payout, never pooled with the priced products' ledgers or sportsbook settlement.
 *   - Every entry counts, including one recorded as a `revisionOf` an earlier entry: the grader grades every entry that
 *     was shown before its first leg started (record.mjs), so a later suggestion never replaces an earlier one.
 *   - No rate below the stated minimum: a policy/tier with fewer than MIN_DECIDED_FOR_RATE decided suggestions shows
 *     counts only. The minimum is the site's own sample rule (graded-picks.mjs ASSESSABLE_MIN); Level A has no
 *     preregistered bar of its own.
 */
import { ASSESSABLE_MIN } from "../sports/graded-picks.mjs";

export const MIN_DECIDED_FOR_RATE = ASSESSABLE_MIN;

export const POLICY_LABEL = Object.freeze({
  "parlay-lab-suggest@1": "Parlay Lab card",
  "bank-builder-suggest@1": "Bank Builder card",
  "moonshot-suggest@1": "Moonshot card",
  "untiered-pick@1": "Single pick (untiered)",
});
const POLICY_ORDER = Object.keys(POLICY_LABEL);
const TIER_ORDER = ["low", "medium", "high", "longshot", "untiered"];
export const TIER_LABEL = Object.freeze({ low: "Low", medium: "Medium", high: "High", longshot: "Longshot", untiered: "Untiered" });

const RESULT = { win: "WON", loss: "LOST", void: "VOID" };
const zero = () => ({ recorded: 0, graded: 0, won: 0, lost: 0, void: 0, pending: 0 });

/** The instant readers could first see an entry — the latest publication evidence it carries (record.mjs). */
export function shownInstant(e) {
  return e?.servedFrom ?? e?.shownAt ?? null;
}

/**
 * @param {Array<Record<string, any>>} suggestions  suggestions.jsonl rows, file order
 * @param {Array<Record<string, any>>} grades       graded.jsonl rows
 */
export function levelARecord(suggestions, grades) {
  const gradeOf = new Map((grades ?? []).map((g) => [g.entryId, g]));
  const groups = new Map();
  const entries = [];
  for (const e of suggestions ?? []) {
    const g = gradeOf.get(e.id) ?? null;
    const status = g ? RESULT[g.result] ?? "PENDING" : "PENDING";
    const key = `${e.policy}|${e.tier}`;
    if (!groups.has(key)) groups.set(key, { policy: e.policy, tier: e.tier, label: POLICY_LABEL[e.policy] ?? e.policy, tierLabel: TIER_LABEL[e.tier] ?? e.tier, ...zero() });
    const c = groups.get(key);
    c.recorded += 1;
    if (status === "WON") { c.won += 1; c.graded += 1; }
    else if (status === "LOST") { c.lost += 1; c.graded += 1; }
    else if (status === "VOID") { c.void += 1; c.graded += 1; }
    else c.pending += 1;
    const legGrade = new Map((g?.legs ?? []).map((l) => [`${l.sport}|${l.eventId}`, l]));
    entries.push({
      id: e.id, productDay: e.productDay, policy: e.policy, tier: e.tier,
      label: POLICY_LABEL[e.policy] ?? e.policy, tierLabel: TIER_LABEL[e.tier] ?? e.tier,
      jointProbability: typeof e.jointProbability === "number" ? e.jointProbability : null,
      recordedAt: e.recordedAt ?? null, shownAt: e.shownAt ?? null, servedFrom: e.servedFrom ?? null, source: e.source ?? null,
      firstStartUtc: e.firstStartUtc ?? null, revisionOf: e.revisionOf ?? null,
      status, gradedAt: g?.gradedAt ?? null,
      legs: (e.legs ?? []).map((l) => {
        const lg = legGrade.get(`${l.sport}|${l.eventId}`) ?? null;
        return {
          sport: l.sport, eventId: l.eventId, eventLabel: l.eventLabel ?? null, startUtc: l.startUtc ?? null,
          selection: l.selection?.label ?? null, probability: typeof l.probability === "number" ? l.probability : null,
          modelId: l.forecast?.modelId ?? null, stampedAt: l.forecast?.stampedAt ?? null,
          result: lg ? (RESULT[lg.result] ?? "PENDING") : "PENDING", final: lg?.reason ?? null,
        };
      }),
    });
  }
  const rank = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? arr.length : i; };
  const byGroup = [...groups.values()].sort((a, b) => rank(POLICY_ORDER, a.policy) - rank(POLICY_ORDER, b.policy) || rank(TIER_ORDER, a.tier) - rank(TIER_ORDER, b.tier))
    .map((c) => ({ ...c, decided: c.won + c.lost, rateShown: c.won + c.lost >= MIN_DECIDED_FOR_RATE }));
  const totals = byGroup.reduce((t, c) => { for (const k of Object.keys(zero())) t[k] += c[k]; return t; }, zero());
  entries.sort((a, b) => String(b.productDay).localeCompare(String(a.productDay)) || rank(POLICY_ORDER, a.policy) - rank(POLICY_ORDER, b.policy) || rank(TIER_ORDER, a.tier) - rank(TIER_ORDER, b.tier) || String(a.firstStartUtc).localeCompare(String(b.firstStartUtc)));
  const orphanGrades = (grades ?? []).filter((g) => !(suggestions ?? []).some((e) => e.id === g.entryId)).length;
  return { byGroup, totals, entries, orphanGrades, minDecidedForRate: MIN_DECIDED_FOR_RATE };
}
