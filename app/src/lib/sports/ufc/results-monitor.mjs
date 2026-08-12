/**
 * UFC results monitor — corrections over consecutive results captures (Program 163 · Release I).
 *
 * Mirrors the NFL monitor's discipline with UFC semantics, keyed by provider bout id. The class
 * that exists nowhere else: OVERTURNED_RESULT — a final whose WINNER changes between captures
 * (commission overturns are real in MMA). Like every correction, it is review:true with an
 * append-only receipt; a settled research row is never silently rewritten.
 *
 *   - nonfinal → final: BECAME_FINAL (tonight's five did exactly this)
 *   - final → nonfinal: STATUS_REGRESSION (review — the "Final" lie class)
 *   - winner flip on a final: OVERTURNED_RESULT (review)
 *   - winner appears/disappears (decided ↔ no-winner): DECISION_CHANGE (review — draw/NC churn)
 *   - vanished inside the trailing window: DISAPPEARED_UNEXPECTED (review; preserve both records)
 *   - slid out of the window: LEFT_WINDOW (mechanics, observed live at 83→17 scale)
 *
 * Pure: no network, no filesystem, no clock. Two monitors now share this shape (NFL, UFC) — when
 * EPL's joins at n=3, consolidate the shared core; at n=2 a forced abstraction would cost more
 * than the mirroring.
 */

export const UFC_RESULTS_MONITOR_VERSION = 1;

export const UFC_MONITOR_CLASSES = Object.freeze([
  "NEW_BOUT", "LEFT_WINDOW", "DISAPPEARED_UNEXPECTED", "BECAME_FINAL", "STATUS_REGRESSION",
  "OVERTURNED_RESULT", "DECISION_CHANGE", "RESCHEDULED", "UNCHANGED",
]);

const isFinal = (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "");
const winnerOf = (r) => (r.redWinner === true && r.blueWinner !== true ? "red" : r.blueWinner === true && r.redWinner !== true ? "blue" : null);

export function monitorUfcResults(prev, next) {
  const prevBy = new Map((prev?.rows ?? []).map((r) => [r.providerBoutId, r]));
  const nextBy = new Map((next?.rows ?? []).map((r) => [r.providerBoutId, r]));
  const changes = [];

  const windowStart = next?.windowDays && next?.generatedAt
    ? new Date(Date.parse(next.generatedAt) - next.windowDays * 86400_000).toISOString()
    : null;

  for (const [id, r] of nextBy) if (!prevBy.has(id)) changes.push({ class: "NEW_BOUT", providerBoutId: id, evidence: `${r.red?.name ?? "?"} vs ${r.blue?.name ?? "?"} entered the window` });
  for (const [id, r] of prevBy) {
    if (nextBy.has(id)) continue;
    const insideWindow = windowStart && r.dateUtc && Date.parse(r.dateUtc) >= Date.parse(windowStart);
    changes.push(insideWindow
      ? { class: "DISAPPEARED_UNEXPECTED", providerBoutId: id, review: true, evidence: "a bout vanished while still inside the trailing window — preserve both source records" }
      : { class: "LEFT_WINDOW", providerBoutId: id, evidence: "slid out of the trailing window — expected mechanics" });
  }

  for (const [id, n] of nextBy) {
    const p = prevBy.get(id);
    if (!p) continue;
    const row = [];
    if (!isFinal(p) && isFinal(n)) row.push({ class: "BECAME_FINAL", evidence: `${p.statusRaw} → ${n.statusRaw}, winner: ${winnerOf(n) ?? "none (draw/NC ambiguity)"}` });
    if (isFinal(p) && !isFinal(n)) row.push({ class: "STATUS_REGRESSION", review: true, evidence: `${p.statusRaw} → ${n.statusRaw} — a final that un-finals requires review` });
    if (isFinal(p) && isFinal(n)) {
      const wp = winnerOf(p), wn = winnerOf(n);
      if (wp && wn && wp !== wn) row.push({ class: "OVERTURNED_RESULT", review: true, before: wp, after: wn, evidence: "the official winner CHANGED — commission overturn class; append-only receipt required, nothing regrades silently" });
      else if ((wp === null) !== (wn === null)) row.push({ class: "DECISION_CHANGE", review: true, before: wp ?? "no-winner", after: wn ?? "no-winner", evidence: "a decided bout became draw/NC or vice versa — the ambiguity class moved, review required" });
    }
    if ((p.dateUtc ?? null) !== (n.dateUtc ?? null)) row.push({ class: "RESCHEDULED", evidence: `${p.dateUtc} → ${n.dateUtc}` });
    if (row.length === 0) changes.push({ class: "UNCHANGED", providerBoutId: id });
    else for (const c of row) changes.push({ providerBoutId: id, ...c });
  }

  const counts = {};
  for (const cls of UFC_MONITOR_CLASSES) counts[cls] = changes.filter((c) => c.class === cls).length;
  return {
    version: UFC_RESULTS_MONITOR_VERSION,
    changes,
    counts,
    reviewRequired: changes.filter((c) => c.review === true),
    reconciliation: { prevRows: prevBy.size, nextRows: nextBy.size, exact: counts.NEW_BOUT + [...nextBy.keys()].filter((id) => prevBy.has(id)).length === nextBy.size },
  };
}
