/**
 * EPL results monitor — corrections before opening day (Program 163 · Release J).
 *
 * The corrections runbook (docs/EPL_CORRECTIONS_RUNBOOK.md) documented DETECTION as a diff of
 * consecutive captures; this is that instrument, on the shared core, ready BEFORE Aug 21 supplies
 * the first real full-time result. Outcome comparator: goal pairs — a full-time score that
 * changes between captures is SCORE_CORRECTION (review; latest-wins applies only AFTER the
 * append-only receipt exists, exactly as the runbook says).
 */
import { diffResultCaptures, countByClass } from "../sports/results-monitor-core.mjs";

export const EPL_RESULTS_MONITOR_VERSION = 1;

export const EPL_MONITOR_CLASSES = Object.freeze([
  "NEW_EVENT", "LEFT_WINDOW", "DISAPPEARED_UNEXPECTED", "BECAME_FINAL", "STATUS_REGRESSION",
  "SCORE_CORRECTION", "RESCHEDULED", "UNCHANGED",
]);

export function monitorEplResults(prev, next) {
  const out = diffResultCaptures(prev, next, {
    idOf: (r) => r.providerEventId,
    labelOf: (r) => `${r.home ?? "?"} v ${r.away ?? "?"}`,
    isFinal: (r) => /^STATUS_FULL_TIME|^STATUS_FINAL/.test(r?.statusRaw ?? ""),
    newClass: "NEW_EVENT",
    compareOutcome: (p, n) => (p.ftHome !== n.ftHome || p.ftAway !== n.ftAway)
      ? [{ class: "SCORE_CORRECTION", review: true, before: `${p.ftHome}-${p.ftAway}`, after: `${n.ftHome}-${n.ftAway}`, evidence: "a full-time score changed — append-only correction receipt required before latest-wins applies (runbook rule)" }]
      : [],
  });
  const named = out.changes.map(({ id, ...rest }) => ({ providerEventId: id, ...rest }));
  return {
    version: EPL_RESULTS_MONITOR_VERSION,
    changes: named,
    counts: countByClass(out.changes, EPL_MONITOR_CLASSES),
    reviewRequired: named.filter((c) => c.review === true),
    reconciliation: out.reconciliation,
  };
}
