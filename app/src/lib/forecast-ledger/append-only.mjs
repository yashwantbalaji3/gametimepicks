/**
 * APPEND-ONLY GUARD for the Forecast Ledger (B3). Pure.
 *
 * Compares the previously committed ledger with a candidate and lists every violation:
 *   MISSING_ROW          a forecast that existed is gone
 *   IMMUTABLE_CHANGED    projection / probability / model / publication time / market / … changed
 *   SETTLEMENT_REWRITTEN a settled / void / unmeasured row changed outcome without the owner recording a correction
 *   SETTLEMENT_REVERTED  a decided row went back to PENDING
 *   PUBLICATION_CHANGED  publication status moved other than PUBLISHED → WITHDRAWN (an append-only withdrawal event)
 *
 * Allowed: new rows; PENDING → anything; NO_MEASUREMENT → SETTLED (a late official stat); a settled outcome change
 * that comes with a larger `settlement.corrections` count (the owner's own correction log); measurement fields that
 * follow an allowed settlement change.
 */
import { IMMUTABLE_FIELDS } from "./contract.mjs";

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

export function compareLedgers(prevRows, nextRows) {
  const next = new Map(nextRows.map((r) => [r.forecastId, r]));
  const violations = [];
  for (const p of prevRows) {
    const n = next.get(p.forecastId);
    if (!n) {
      violations.push({ forecastId: p.forecastId, kind: "MISSING_ROW", detail: `${p.sport} ${p.eventId} ${p.subjectId} ${p.family}` });
      continue;
    }
    for (const f of IMMUTABLE_FIELDS) {
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
    }
  }
  return violations;
}
