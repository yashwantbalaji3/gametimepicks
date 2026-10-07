/**
 * APPEND-ONLY GUARD for the Forecast Ledger (B3). Pure.
 *
 * Compares the previously committed ledger with a candidate and lists every violation:
 *   MISSING_ROW          a forecast that existed is gone
 *   IMMUTABLE_CHANGED    projection / probability / model / publication time / market / … changed
 *   SETTLEMENT_REWRITTEN a settled / void / unmeasured row changed outcome without the owner recording a correction
 *   SETTLEMENT_REVERTED  a decided row went back to PENDING
 *   PUBLICATION_CHANGED  publication status moved other than PUBLISHED → WITHDRAWN (an append-only withdrawal event)
 *   (HN-1) a restated `probability` is accepted only for ids a committed Homer Nukes correction names
 *   DIRECTIONAL_REWRITTEN a settled row's directional WIN / LOSS / PUSH changed while its settlement did not, and no
 *                        committed correction restates it (Stage 3C: a grading-rule restatement is append-only and
 *                        named, e.g. data/internal/nfl/winner-corrections/; the caller passes the restated ids)
 *
 * Allowed: new rows; PENDING → anything; NO_MEASUREMENT → SETTLED (a late official stat); a settled outcome change
 * that comes with a larger `settlement.corrections` count (the owner's own correction log); measurement fields that
 * follow an allowed settlement change.
 */
import { IMMUTABLE_FIELDS } from "./contract.mjs";

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * @param {object[]} prevRows
 * @param {object[]} nextRows
 * @param {{ directionalRestated?: Set<string>, probabilityRestated?: Set<string> }} [opts]  forecastIds a committed
 *        correction log restates (directional word: NFL winner log; probability: HN-1 Homer Nukes log, the list of
 *        record's number replacing one graded from a post-start rebuild). Nothing else may ever change.
 */
export function compareLedgers(prevRows, nextRows, { directionalRestated = new Set(), probabilityRestated = new Set() } = {}) {
  const next = new Map(nextRows.map((r) => [r.forecastId, r]));
  const violations = [];
  for (const p of prevRows) {
    const n = next.get(p.forecastId);
    if (!n) {
      violations.push({ forecastId: p.forecastId, kind: "MISSING_ROW", detail: `${p.sport} ${p.eventId} ${p.subjectId} ${p.family}` });
      continue;
    }
    for (const f of IMMUTABLE_FIELDS) {
      if (f === "probability" && probabilityRestated.has(p.forecastId)) continue;
      if (stable(p[f]) !== stable(n[f])) {
        violations.push({ forecastId: p.forecastId, kind: "IMMUTABLE_CHANGED", detail: `${f}: ${stable(p[f])} → ${stable(n[f])}` });
      }
    }
    if (p.publicationStatus !== n.publicationStatus && !(p.publicationStatus === "PUBLISHED" && n.publicationStatus === "WITHDRAWN")) {
      violations.push({ forecastId: p.forecastId, kind: "PUBLICATION_CHANGED", detail: `${p.publicationStatus} → ${n.publicationStatus}` });
    }
    const ps = p.settlement;
    const ns = n.settlement;
    if (ps.state === "PENDING") continue;
    if (ns.state === "PENDING") {
      violations.push({ forecastId: p.forecastId, kind: "SETTLEMENT_REVERTED", detail: `${ps.state} → PENDING` });
      continue;
    }
    if (ps.state === "NO_MEASUREMENT" && ns.state === "SETTLED") continue;
    const outcome = (s) => stable({ state: s.state, finalValue: s.finalValue, finalCategory: s.finalCategory });
    if (outcome(ps) !== outcome(ns) && !((ns.corrections ?? 0) > (ps.corrections ?? 0))) {
      violations.push({ forecastId: p.forecastId, kind: "SETTLEMENT_REWRITTEN", detail: `${outcome(ps)} → ${outcome(ns)}` });
      continue;
    }
    const pd = p.measurement?.directionalResult ?? null;
    const nd = n.measurement?.directionalResult ?? null;
    if (outcome(ps) === outcome(ns) && pd != null && pd !== nd && !directionalRestated.has(p.forecastId)) {
      violations.push({ forecastId: p.forecastId, kind: "DIRECTIONAL_REWRITTEN", detail: `${pd} → ${nd ?? "none"} with no committed restatement` });
    }
  }
  return violations;
}

/**
 * AN EXPLICIT SUBJECT RE-KEY MIGRATION — the only way a row's identity may change, and never silently.
 *
 * A vanished row is accepted ONLY when exactly one new row carries the same forecast in every immutable field except
 * `forecastId` and `subjectId`, and `mapSubject(old.subjectId)` equals the new subjectId. Everything else is still a
 * violation. The caller writes the returned pairs to a committed migration receipt (old → new forecastId).
 */
export function pairRekeys(prevRows, nextRows, mapSubject) {
  const SAME = IMMUTABLE_FIELDS.filter((f) => f !== "forecastId" && f !== "subjectId");
  const sig = (r) => stable(Object.fromEntries(SAME.map((f) => [f, r[f]])));
  const nextIds = new Set(nextRows.map((r) => r.forecastId));
  const prevIds = new Set(prevRows.map((r) => r.forecastId));
  const candidates = new Map();
  for (const n of nextRows) {
    if (prevIds.has(n.forecastId)) continue; // not new
    const k = sig(n);
    const a = candidates.get(k) ?? [];
    a.push(n);
    candidates.set(k, a);
  }
  const pairs = [];
  const unexplained = [];
  for (const p of prevRows) {
    if (nextIds.has(p.forecastId)) continue;
    const want = mapSubject(p.subjectId);
    const hits = (candidates.get(sig(p)) ?? []).filter((n) => want && n.subjectId === want);
    if (hits.length === 1) pairs.push({ from: p.forecastId, to: hits[0].forecastId, subjectFrom: p.subjectId, subjectTo: want });
    else unexplained.push({ forecastId: p.forecastId, subjectId: p.subjectId, matches: hits.length });
  }
  return { pairs, unexplained };
}
