/**
 * THE `owner` GATE STAGE, AS DATA — "a named owner (automation + human escalation) for the daily run".
 *
 * Shared machinery: built once against the workflow set, inherited by every sport, rather than
 * re-argued per sport. The stage is the easiest of the twelve to fake, because a name in a document
 * satisfies a reader and nothing else. So this registry names a workflow FILE and the guard beside it
 * asserts that file exists, carries a schedule, and can reach a human — an owner that cannot be
 * paged is a label, not an owner.
 *
 * `escalation` is the shared ops alert path (scripts/ops_alert.sh → OPS_WEBHOOK_URL). It is recorded
 * once because it genuinely is one channel; if a sport ever needs its own, it becomes a field here
 * rather than an assumption in someone's head.
 */

/** The shared human-escalation channel every automated owner reports failures through. */
export const ESCALATION = Object.freeze({
  script: "scripts/ops_alert.sh",
  secret: "OPS_WEBHOOK_URL",
  contract: "docs/OPS_ALERTING_CONTRACT.md",
});

/**
 * sport → the workflow accountable for its daily run.
 *
 * `primary` is the job that MUST run for the sport to be current. `settlement` is where its results
 * are graded — for every sport that is the one shared nightly settler, which is a fact worth writing
 * down: a per-sport settler would be a second writer, and this repo has exactly one by design.
 */
export const SPORT_OWNERS = Object.freeze({
  mlb: { primary: "mlb-daily-production.yml", settlement: "nightly-settle.yml", cadence: "daily" },
  ufc: { primary: "ufc-fight-week.yml", settlement: "nightly-settle.yml", cadence: "fight-week (Tue/Thu/Sat)" },
  nfl: { primary: "nfl-event-window.yml", settlement: "nightly-settle.yml", cadence: "event-window" },
  epl: { primary: "epl-matchweek.yml", settlement: "nightly-settle.yml", cadence: "matchweek" },
  /*
   * NBA HAS NO DAILY OWNER, DECLARED. nba-market-probe.yml exists but carries no cron, so nothing
   * runs it on a schedule — the sport is off-season with its source failing since 2026-06-13. Naming
   * it as the owner would have passed a reading of this file and failed the guard below, which is
   * the correct outcome: an unowned sport is a STATE to declare, not a gap to paper over with the
   * nearest workflow that happens to mention the sport.
   */
  nba: { primary: null, unownedReason: "off-season; nba-market-probe.yml is dispatch-only and the source has failed since 2026-06-13", settlement: "nightly-settle.yml", cadence: "none" },
});

export const OWNED_SPORTS = Object.freeze(Object.keys(SPORT_OWNERS));

/**
 * The owner record for one sport, or null when the sport has none.
 * Null rather than a throw: "this sport has no owner" is an answer the gate needs to report.
 */
export function ownerFor(sport) {
  return SPORT_OWNERS[String(sport ?? "").toLowerCase()] ?? null;
}

/** True only when a sport has a scheduled automated owner. `owner` cannot be PROVEN without it. */
export function hasDailyOwner(sport) {
  return Boolean(ownerFor(sport)?.primary);
}
