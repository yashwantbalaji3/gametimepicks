/**
 * IS A LANE PUBLISHING SOMETHING OLDER THAN IT LOOKS?
 *
 * The cron-slot watchdog answers two questions: did a scheduled run fire, and did it end well. Both
 * are about JOBS. Neither could see what actually went wrong with UFC, because nothing broke — the
 * ladder builder was in no workflow at all, so there was no run to miss and no failure to report. A
 * hand-built ladder from 2026-08-18 sat serving an event on 2026-08-22 while every surface reported
 * the sport live, for four days, with a green board.
 *
 * A job that never existed leaves no trace in run history. The only evidence is the OUTPUT: a lane
 * that says it is live while its cards belong to a different event, or whose artifacts have quietly
 * stopped moving. So this reads the lane-status artifacts each sport publishes and asks whether what
 * they describe is internally consistent.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not re-derive any sport's state — that is the lane
 * artifact's job, and a second opinion computed here would be a second thing to drift. It reads what
 * each lane already says about itself and reports the combinations that cannot both be true.
 */

/** How long a lane artifact may go unrefreshed before its producer is presumed stopped. */
export const LANE_ARTIFACT_MAX_AGE_H = 72;

/**
 * @param lanes  [{ sport, artifact }] — the parsed *-lane.json documents
 * @param nowIso
 * @returns {{findings: Array, checked: number, worst: "OK"|"WARN"|"ALERT"}}
 */
export function laneStaleness(lanes, nowIso) {
  const now = Date.parse(nowIso);
  const findings = [];

  for (const { sport, artifact } of lanes ?? []) {
    if (!artifact) {
      // ABSENT is not OK. A lane that publishes no state cannot be shown to be healthy, and the
      // sport most likely to have no artifact is the one whose producer just stopped.
      findings.push({ sport, id: "lane-artifact-absent", severity: "ALERT", detail: "no lane-status artifact — this sport publishes no state, so nothing about it can be checked" });
      continue;
    }

    const stamped = Date.parse(artifact.generatedAt ?? "");
    if (!Number.isFinite(stamped)) {
      findings.push({ sport, id: "lane-artifact-unstamped", severity: "ALERT", detail: "the lane artifact carries no readable generatedAt" });
    } else {
      const ageH = (now - stamped) / 3_600_000;
      if (ageH > LANE_ARTIFACT_MAX_AGE_H) {
        findings.push({ sport, id: "lane-artifact-stale", severity: "ALERT", ageHours: Number(ageH.toFixed(1)), detail: `the lane status has not been rebuilt in ${ageH.toFixed(1)}h — its producer has stopped` });
      }
    }

    /*
     * THE EXACT CHECK, and the one that would have caught UFC. A lane reporting itself live while
     * its cards belong to another event is not a freshness judgement call — the two statements
     * contradict each other, whatever the thresholds are.
     */
    const cards = artifact.cards ?? {};
    if (cards.state === "STALE_FOR_A_DIFFERENT_CARD") {
      findings.push({ sport, id: "cards-belong-to-another-event", severity: "ALERT", detail: cards.detail ?? "the published ladder is for a different event than the one on the page" });
    }
    if (artifact.productLane?.live === true && cards.state === "UNKNOWN") {
      findings.push({ sport, id: "live-lane-without-cards", severity: "WARN", detail: "the Lab gate reports this lane live, but no ladder has been published for it" });
    }

    /*
     * Cards that cannot be graded must never publish. This was false for four days on UFC and would
     * have been false for EPL from its first night — the settler read only baseball's directory.
     */
    const reach = artifact.settlementReach;
    if (reach && reach.state !== "IN_SCOPE") {
      findings.push({ sport, id: "settler-out-of-scope", severity: "ALERT", detail: "the lab settler cannot grade this sport's cards; anything published here would sit pending forever" });
    }
  }

  const worst = findings.some((f) => f.severity === "ALERT") ? "ALERT"
    : findings.some((f) => f.severity === "WARN") ? "WARN" : "OK";
  return { findings, checked: (lanes ?? []).length, worst };
}
