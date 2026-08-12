/**
 * UFC results monitor — corrections over consecutive results captures (Program 163 · Release I;
 * core-consolidated in Release J at n=3, as the original header promised). Public API, class
 * vocabulary, and review semantics UNCHANGED — the original tests pass untouched.
 *
 * Sport-specific outcome comparator: winner corners. OVERTURNED_RESULT on a winner flip (the
 * commission-overturn class), DECISION_CHANGE when a decided bout becomes draw/NC or vice versa —
 * the winner-only source's ambiguity can MOVE, and that movement is evidence.
 */
import { diffResultCaptures, countByClass } from "../results-monitor-core.mjs";

export const UFC_RESULTS_MONITOR_VERSION = 2;

export const UFC_MONITOR_CLASSES = Object.freeze([
  "NEW_BOUT", "LEFT_WINDOW", "DISAPPEARED_UNEXPECTED", "BECAME_FINAL", "STATUS_REGRESSION",
  "OVERTURNED_RESULT", "DECISION_CHANGE", "RESCHEDULED", "UNCHANGED",
]);

const winnerOf = (r) => (r.redWinner === true && r.blueWinner !== true ? "red" : r.blueWinner === true && r.redWinner !== true ? "blue" : null);

export function monitorUfcResults(prev, next) {
  const out = diffResultCaptures(prev, next, {
    idOf: (r) => r.providerBoutId,
    labelOf: (r) => `${r.red?.name ?? "?"} vs ${r.blue?.name ?? "?"}`,
    isFinal: (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? ""),
    newClass: "NEW_BOUT",
    compareOutcome: (p, n) => {
      const wp = winnerOf(p), wn = winnerOf(n);
      if (wp && wn && wp !== wn) return [{ class: "OVERTURNED_RESULT", review: true, before: wp, after: wn, evidence: "the official winner CHANGED — commission overturn class; append-only receipt required, nothing regrades silently" }];
      if ((wp === null) !== (wn === null)) return [{ class: "DECISION_CHANGE", review: true, before: wp ?? "no-winner", after: wn ?? "no-winner", evidence: "a decided bout became draw/NC or vice versa — the ambiguity class moved, review required" }];
      return [];
    },
  });
  const named = out.changes.map(({ id, ...rest }) => ({ providerBoutId: id, ...rest }));
  return {
    version: UFC_RESULTS_MONITOR_VERSION,
    changes: named,
    counts: countByClass(out.changes, UFC_MONITOR_CLASSES),
    reviewRequired: named.filter((c) => c.review === true),
    reconciliation: out.reconciliation,
  };
}
