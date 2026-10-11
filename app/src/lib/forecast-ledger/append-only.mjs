/**
 * APPEND-ONLY GUARD for the Forecast Ledger (B3). Pure.
 *
 * Compares the previously committed ledger with a candidate and lists every violation:
 *   MISSING_ROW          a forecast that existed is gone
 *   IMMUTABLE_CHANGED    projection / probability / model / publication time / market / … changed
 *   SETTLEMENT_REWRITTEN a settled / void / unmeasured row changed outcome without the owner recording a correction
 *   SETTLEMENT_REVERTED  a decided row went back to PENDING
 *   PUBLICATION_CHANGED  publication status moved other than PUBLISHED → WITHDRAWN (an append-only withdrawal event)
 *   DIRECTIONAL_REWRITTEN a settled row's directional WIN / LOSS / PUSH changed while its settlement did not, and no
 *                        committed correction restates it (Stage 3C: a grading-rule restatement is append-only and
 *                        named, e.g. data/internal/nfl/winner-corrections/; the caller passes the restated ids)
 *
 * Allowed: new rows; PENDING → anything; NO_MEASUREMENT → SETTLED (a late official stat); a settled outcome change
 * that comes with a larger `settlement.corrections` count (the owner's own correction log); measurement fields that
 * follow an allowed settlement change.
 */
import { IMMUTABLE_FIELDS, OPTIONAL_IMMUTABLE_FIELDS } from "./contract.mjs";

const PROTECTED_FIELDS = [...IMMUTABLE_FIELDS, ...OPTIONAL_IMMUTABLE_FIELDS];

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * @param {object[]} prevRows
 * @param {object[]} nextRows
 * @param {{ directionalRestated?: Set<string>, restatements?: Map<string, { fields: Record<string, { before: unknown, after: unknown }>, restatementId: string }> }} [opts]
 *   directionalRestated  forecastIds a committed correction log restates (Stage 3C)
 *   restatements         TRUTH-001 Stage B (amendment 1): per forecastId, the EXACT immutable fields (and/or
 *                        publicationStatus PUBLISHED → NOT_SERVED) an approved restatement log changes, with before and
 *                        after values. A change is forgiven only when it matches exactly; any listed change that does
 *                        not happen, or happens differently, is itself a violation (RESTATEMENT_MISMATCH).
 */
export function compareLedgers(prevRows, nextRows, { directionalRestated = new Set(), restatements = new Map() } = {}) {
  const next = new Map(nextRows.map((r) => [r.forecastId, r]));
  const violations = [];
  for (const p of prevRows) {
    const n = next.get(p.forecastId);
    if (!n) {
      violations.push({ forecastId: p.forecastId, kind: "MISSING_ROW", detail: `${p.sport} ${p.eventId} ${p.subjectId} ${p.family}` });
      continue;
    }
    const rs = restatements.get(p.forecastId) ?? null;
    const listed = rs?.fields ?? {};
    for (const f of PROTECTED_FIELDS) {
      const changed = stable(p[f]) !== stable(n[f]);
      const l = listed[f];
      if (l) {
        // Exactness both ways: the listed before must be what was there, the listed after must be what is there now.
        if (stable(l.before) !== stable(p[f]) || stable(l.after) !== stable(n[f])) {
          violations.push({ forecastId: p.forecastId, kind: "RESTATEMENT_MISMATCH", detail: `${f}: listed ${stable(l.before)} → ${stable(l.after)}, found ${stable(p[f])} → ${stable(n[f])} (${rs.restatementId})` });
        }
        continue;
      }
      if (changed) violations.push({ forecastId: p.forecastId, kind: "IMMUTABLE_CHANGED", detail: `${f}: ${stable(p[f])} → ${stable(n[f])}` });
    }
    if (rs) {
      for (const f of Object.keys(listed)) {
        if (f !== "publicationStatus" && !PROTECTED_FIELDS.includes(f)) violations.push({ forecastId: p.forecastId, kind: "RESTATEMENT_MISMATCH", detail: `${f} is not a restatable field (${rs.restatementId})` });
      }
    }
    const pub = listed.publicationStatus;
    if (pub) {
      if (!(pub.before === "PUBLISHED" && pub.after === "NOT_SERVED" && p.publicationStatus === "PUBLISHED" && n.publicationStatus === "NOT_SERVED")) {
        violations.push({ forecastId: p.forecastId, kind: "RESTATEMENT_MISMATCH", detail: `publicationStatus: listed ${pub.before} → ${pub.after}, found ${p.publicationStatus} → ${n.publicationStatus} (${rs.restatementId})` });
      }
    } else if (p.publicationStatus !== n.publicationStatus && !(p.publicationStatus === "PUBLISHED" && n.publicationStatus === "WITHDRAWN")) {
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
    if (outcome(ps) === outcome(ns) && pd != null && pd !== nd && !directionalRestated.has(p.forecastId) && !rs) {
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
