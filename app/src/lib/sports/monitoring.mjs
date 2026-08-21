/**
 * THE `monitoring` GATE STAGE — "the evidence ledger and watchdog cover the sport's chain".
 *
 * Third machinery stage. Written to record what is TRUE today, which is that monitoring is close to
 * MLB-only, and the two halves fail differently:
 *
 *   · WATCHDOG — cron-watchdog.yml runs mlb-topup-classify.mjs. It notices a missed MLB primary and
 *     dispatches it. P188 added the same for EPL, deriving matchday from the fixture capture rather
 *     than the weekday. Nothing yet watches whether a UFC or NFL run happened at all.
 *   · ALERTING — now wired into every owning workflow. UFC and EPL had none at all; NFL had a
 *     hand-rolled curl that worked but sat outside the contract, with no redaction pass and its own
 *     message shape, so it moved onto the shared script rather than being left as a second thing to
 *     maintain. A FAILED run now reaches a human for every sport.
 *
 * That is the gap this stage exists to measure, so it is stated as data rather than left as a
 * surprise for whoever first asks why a fight-week run died quietly. A sport is covered only when
 * BOTH halves hold: something notices it did not run, and someone hears when it breaks.
 */

/** The shared alerting channel. Presence is checked in the workflow, not assumed from this constant. */
export const ALERT_SCRIPT = "scripts/ops_alert.sh";
/** The watchdog, and the classifier that makes it sport-specific. */
export const WATCHDOG = Object.freeze({ workflow: "cron-watchdog.yml", classifier: "app/scripts/mlb-topup-classify.mjs" });

/**
 * sport → its monitoring coverage, as it actually is.
 *
 * `watched` = something notices a missed run. `alerted` = a failure reaches a human.
 * Both are recorded per sport rather than inferred, because "the settler alerts" is not the same as
 * "this sport's own job alerts" — a fight-week capture that dies never reaches the settler at all.
 */
export const MONITORING = Object.freeze({
  mlb: { workflow: "mlb-daily-production.yml", watched: true, alerted: true, gap: null },
  ufc: { workflow: "ufc-fight-week.yml", watched: false, alerted: true, gap: "alerted, but nothing watches whether the fight-week run happened at all" },
  nfl: { workflow: "nfl-event-window.yml", watched: false, alerted: true, gap: "alerted, but nothing watches whether the event-window run happened at all" },
  /*
   * P188: EPL became WATCHED. cron-watchdog.yml now derives matchday from the committed fixture
   * capture, checks whether epl-matchweek ran, and dispatches + alerts when it did not — the
   * lib/sports/epl/matchday-watch.mjs decision, guarded against fixtures rather than weekdays.
   *
   * `residualGap` is NOT `gap`. `gap` means "this sport can fail and nobody hears", which is no
   * longer true. `residualGap` records what this coverage does not reach, so becoming watched cannot
   * quietly read as becoming fully covered — the exact overstatement this registry exists to prevent.
   */
  epl: {
    workflow: "epl-matchweek.yml",
    watched: true,
    alerted: true,
    gap: null,
    residualGap: "the watchdog's single 14:30 UTC slot catches a missed Friday opener with hours to spare, but cannot cover a cluster's EARLIEST kickoff when that kickoff precedes the slot (Saturday 11:30, Sunday 13:00). Full coverage needs a slot per cluster.",
  },
});

export const MONITORED_SPORTS = Object.freeze(Object.keys(MONITORING));

/** `monitoring` may be PROVEN only when a sport is both watched and alerted. */
export function isMonitored(sport) {
  const m = MONITORING[String(sport ?? "").toLowerCase()];
  return Boolean(m && m.watched && m.alerted);
}

/**
 * Every sport whose chain can fail without anyone hearing, with the reason. A sport with a
 * `residualGap` is NOT listed here — it is watched; the residual is reported separately so partial
 * coverage never masquerades as none, nor as complete.
 */
export function monitoringGaps() {
  return MONITORED_SPORTS.filter((s) => !isMonitored(s)).map((s) => ({ sport: s, gap: MONITORING[s].gap }));
}

/** Watched sports that still carry a stated limit — coverage that is real but not complete. */
export function monitoringResiduals() {
  return MONITORED_SPORTS
    .filter((s) => isMonitored(s) && MONITORING[s].residualGap)
    .map((s) => ({ sport: s, residualGap: MONITORING[s].residualGap }));
}
