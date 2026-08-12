/**
 * Shared results-monitor core (Program 163 · Release J) — the n=3 consolidation the NFL and UFC
 * monitors' headers promised when EPL's arrived.
 *
 * The core owns what every sport shares: id-keyed diffing of consecutive captures, window
 * mechanics (LEFT_WINDOW vs DISAPPEARED_UNEXPECTED by window arithmetic), final-transition
 * detection, reschedules, unchanged accounting, exact reconciliation, and the review-flag
 * discipline (a rewritten past is never silently absorbed). Each sport supplies only its
 * OUTCOME COMPARATOR — the piece that genuinely differs:
 *   NFL/EPL: score pairs → SCORE_CORRECTION on change
 *   UFC:     winner corners → OVERTURNED_RESULT on flip, DECISION_CHANGE on decided↔no-winner
 *
 * Pure: no network, no filesystem, no clock. Sport wrappers keep their public names and class
 * vocabularies so no guard weakens; the consolidation is behavioral-identity by test.
 */

export const RESULTS_MONITOR_CORE_VERSION = 1;

/**
 * @param {object} cfg
 * @param {(r: any) => string} cfg.idOf
 * @param {(r: any) => boolean} cfg.isFinal
 * @param {(prevRow: any, nextRow: any) => Array<object>} cfg.compareOutcome  final-vs-final only
 * @param {(r: any) => string} [cfg.labelOf]
 * @param {string} [cfg.newClass]   e.g. "NEW_EVENT" | "NEW_BOUT"
 */
export function diffResultCaptures(prev, next, cfg) {
  const idOf = cfg.idOf, isFinal = cfg.isFinal, labelOf = cfg.labelOf ?? ((r) => idOf(r));
  const NEW_CLASS = cfg.newClass ?? "NEW_EVENT";
  const prevBy = new Map((prev?.rows ?? []).map((r) => [idOf(r), r]));
  const nextBy = new Map((next?.rows ?? []).map((r) => [idOf(r), r]));
  const changes = [];

  const windowStart = next?.windowDays && next?.generatedAt
    ? new Date(Date.parse(next.generatedAt) - next.windowDays * 86400_000).toISOString()
    : null;

  for (const [id, r] of nextBy) if (!prevBy.has(id)) changes.push({ class: NEW_CLASS, id, evidence: `${labelOf(r)} entered the window` });
  for (const [id, r] of prevBy) {
    if (nextBy.has(id)) continue;
    const insideWindow = windowStart && r.dateUtc && Date.parse(r.dateUtc) >= Date.parse(windowStart);
    changes.push(insideWindow
      ? { class: "DISAPPEARED_UNEXPECTED", id, review: true, evidence: `${labelOf(r)} vanished while still inside the trailing window — both source records must be preserved` }
      : { class: "LEFT_WINDOW", id, evidence: `${labelOf(r)} slid out of the trailing window — expected mechanics` });
  }

  for (const [id, n] of nextBy) {
    const p = prevBy.get(id);
    if (!p) continue;
    const row = [];
    if (!isFinal(p) && isFinal(n)) row.push({ class: "BECAME_FINAL", evidence: `${p.statusRaw} → ${n.statusRaw}` });
    if (isFinal(p) && !isFinal(n)) row.push({ class: "STATUS_REGRESSION", review: true, evidence: `${p.statusRaw} → ${n.statusRaw} — a final that un-finals requires review, never silent acceptance` });
    if (isFinal(p) && isFinal(n)) row.push(...cfg.compareOutcome(p, n));
    if ((p.dateUtc ?? null) !== (n.dateUtc ?? null)) row.push({ class: "RESCHEDULED", evidence: `${p.dateUtc} → ${n.dateUtc}` });
    if (row.length === 0) changes.push({ class: "UNCHANGED", id });
    else for (const c of row) changes.push({ id, ...c });
  }

  return {
    changes,
    reviewRequired: changes.filter((c) => c.review === true),
    reconciliation: {
      prevRows: prevBy.size,
      nextRows: nextBy.size,
      exact: changes.filter((c) => c.class === NEW_CLASS).length + [...nextBy.keys()].filter((id) => prevBy.has(id)).length === nextBy.size,
    },
  };
}

/** Count changes into a closed class map (unknown classes throw — vocabularies stay closed). */
export function countByClass(changes, classes) {
  const counts = {};
  for (const cls of classes) counts[cls] = 0;
  for (const c of changes) {
    if (!(c.class in counts)) throw new Error(`class ${c.class} is outside the closed vocabulary`);
    counts[c.class] += 1;
  }
  return counts;
}
