/**
 * MORNING-CHAIN CANCEL WATCH (P258).
 *
 * Every writer shares one concurrency group (`gtp-generated-artifacts`) on purpose — the July-30
 * lost-board incident — and GitHub keeps only ONE pending run per group. A second pending run
 * replaces the first, which ends "cancelled". Usually a later run covers the work. When none does,
 * the day's slate never lands, and every existing check misses it: slot coverage sees a run that
 * fired, and failure alerts ignore "cancelled".
 *
 * This asks one question per chain workflow: did a run end cancelled today with no success started
 * after it? Pure — the runner supplies the runs.
 */

export const MORNING_CHAIN = Object.freeze(["morning-projections", "mlb-daily-production", "daily-products"]);

/** ET calendar date of an ISO instant. */
export function etDateOf(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * @param {{ etDate: string, runsByWorkflow: Record<string, Array<{createdAt:string, conclusion:string|null, status?:string}>|null> }} input
 * @returns {{ state: "OK"|"STRANDED"|"UNKNOWN", stranded: Array<{workflow:string, cancelledAt:string}>, unknown: string[], lines: string[] }}
 */
export function chainCancelWatch({ etDate, runsByWorkflow }) {
  const stranded = [];
  const unknown = [];
  const lines = [];
  for (const wf of MORNING_CHAIN) {
    const runs = runsByWorkflow[wf];
    // null = the runner could not look. Say so; never read "could not look" as "nothing cancelled".
    if (!Array.isArray(runs)) { unknown.push(wf); lines.push(`${wf}: UNKNOWN (run history unavailable)`); continue; }
    const today = runs.filter((r) => r.createdAt && etDateOf(r.createdAt) === etDate);
    const cancelled = today.filter((r) => r.conclusion === "cancelled").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!cancelled.length) { lines.push(`${wf}: OK (${today.length} run(s) today, none cancelled)`); continue; }
    const last = cancelled[cancelled.length - 1];
    // A run still queued or in progress may yet cover it — that is not stranded.
    const covered = today.some((r) => r.createdAt > last.createdAt && (r.conclusion === "success" || r.status === "queued" || r.status === "in_progress"));
    if (covered) { lines.push(`${wf}: OK (cancelled run at ${last.createdAt} was superseded)`); continue; }
    stranded.push({ workflow: wf, cancelledAt: last.createdAt });
    lines.push(`${wf}: STRANDED (cancelled at ${last.createdAt}; no later success today)`);
  }
  const state = stranded.length ? "STRANDED" : unknown.length ? "UNKNOWN" : "OK";
  return { state, stranded, unknown, lines };
}
