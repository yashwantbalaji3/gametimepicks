/**
 * DOES AN ACQUISITION ACTUALLY EXIST FOR THIS SPORT? — Program 234 · Release G.
 *
 * The offered window told an operator that sixteen NFL events were `NOT_YET_CAPTURED` — "scheduled,
 * and our acquisition for it has not run yet" — each with a `nextDeadlineUtc` of tomorrow 15:00Z.
 * There is no acquisition. `nfl-odds-capture.yml` is `workflow_dispatch` only, carries no `cron:`,
 * and last ran on 2026-08-13. The 15:00Z hour came from a literal in the builder, not from anything
 * that would have to meet it. `ufc-odds-refresh.yml` is the same: dispatch-only, with a 13:00Z
 * deadline invented for it.
 *
 * A deadline nothing is scheduled to meet is worse than no deadline: it reads as "wait" when the
 * truth is "this is gated on a decision nobody has taken". So the cadence is DERIVED from the
 * workflow that would perform the capture — if that file has no `cron:`, the sport has no scheduled
 * acquisition, its deadline is null, and its events are typed as gated rather than as pending.
 *
 * Pure: the caller supplies the workflow text. The parsing is deliberately narrow — it answers one
 * question ("is there a schedule block with at least one cron entry?") rather than trying to model
 * GitHub's scheduling, because the only thing that matters here is whether anything will ever run.
 */

/** Which workflow performs each sport's market acquisition. */
export const ACQUISITION_WORKFLOW = Object.freeze({
  nfl: "nfl-odds-capture.yml",
  ufc: "ufc-odds-refresh.yml",
  epl: "epl-matchweek.yml",
  mlb: "mlb-pregame-capture.yml",
});

/**
 * Is this workflow scheduled to run on its own?
 *
 * Counts `cron:` entries anywhere in the file, and requires a `schedule:` key — a workflow may
 * mention cron in a comment, and a comment does not run.
 * @param {string|null|undefined} yamlText
 * @returns {{ scheduled: boolean, cronCount: number, reason: string }}
 */
export function parseCadence(yamlText) {
  if (typeof yamlText !== "string" || !yamlText.trim()) {
    return { scheduled: false, cronCount: 0, reason: "could not be read" };
  }
  /* Strip comment-only lines so a commented-out cron cannot count as a schedule. */
  const live = yamlText.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const hasSchedule = /^\s*schedule:\s*$/m.test(live);
  const cronCount = (live.match(/^\s*-\s*cron:\s*["']?[^\n"']+/gm) ?? []).length;
  if (!hasSchedule || cronCount === 0) {
    return {
      scheduled: false,
      cronCount: 0,
      reason: "carries no schedule and runs only when someone dispatches it by hand",
    };
  }
  return { scheduled: true, cronCount, reason: `runs on ${cronCount} scheduled cron entr${cronCount === 1 ? "y" : "ies"}` };
}

/**
 * The cadence for every sport, from a map of workflow filename → file text.
 * A sport with no entry in `ACQUISITION_WORKFLOW` is reported as unknown rather than unscheduled:
 * "we do not know which job would do this" and "no job will" are different facts.
 * @param {Record<string, string>} workflowTexts
 */
export function acquisitionCadences(workflowTexts = {}) {
  const out = {};
  for (const [sport, file] of Object.entries(ACQUISITION_WORKFLOW)) {
    const text = workflowTexts[file];
    out[sport] = { workflow: file, ...parseCadence(text) };
  }
  return out;
}
