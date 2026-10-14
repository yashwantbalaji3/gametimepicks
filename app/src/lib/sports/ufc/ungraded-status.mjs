/**
 * WHY A SNAPSHOT BOUT IS NOT IN THE LEDGER — one honest answer per bout. PURE (2026-10-14).
 *
 * The grader reported every ungraded snapshot bout as "AWAITING_RESULTS — N bout(s) from <oldest date>" and blamed
 * "the upstream source lagging". On 2026-10-14 that line said 10 bouts from 2026-09-26 were awaiting results, with
 * the corpus "-14 day(s)" before that card: in fact ONE was the 09-26 Gall–Dumas bout that never took place
 * (correctly WITHDRAWN by reconcile-card) and NINE were the 2026-10-17 card, not yet fought. Nothing was lagging.
 *
 *   NOT_STARTED  the bout's card starts after `nowIso` — nothing to grade yet;
 *   WITHDRAWN    reconcile-card already classified it (never graded, never voided);
 *   AWAITING     started, not withdrawn, and no official result — the only case that is a lag.
 */
export function classifyUngraded({ rows, resultsByBout, withdrawnIds, startByBout, nowIso }) {
  const now = Date.parse(nowIso);
  const out = { notStarted: [], withdrawn: [], awaiting: [] };
  for (const r of rows ?? []) {
    if (resultsByBout?.has?.(r.boutId)) continue; // gradeable: not this function's business
    if (withdrawnIds?.has?.(r.boutId)) { out.withdrawn.push(r.boutId); continue; }
    const start = Date.parse(startByBout?.get?.(r.boutId) ?? "");
    if (Number.isFinite(start) && start > now) { out.notStarted.push(r.boutId); continue; }
    out.awaiting.push(r.boutId);
  }
  return out;
}

/** "2 on 2026-09-26, 1 on 2026-10-03" — counts per slate date, oldest first. */
export function countByDate(ids) {
  const m = new Map();
  for (const id of ids) { const d = String(id).slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => `${n} on ${d}`).join(", ");
}
