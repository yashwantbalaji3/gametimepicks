/**
 * THE `monitoring` GATE STAGE — "the evidence ledger and watchdog cover the sport's chain".
 *
 * Third machinery stage. Written to record what is TRUE today, which is that monitoring is close to
 * MLB-only, and the two halves fail differently:
 *
 *   · WATCHDOG — cron-watchdog.yml runs mlb-topup-classify.mjs. It notices a missed MLB primary and
 *     dispatches it. Nothing watches whether a UFC, NFL or EPL run happened at all.
 *   · ALERTING — ops_alert.sh is wired into mlb-daily-production and nightly-settle, and into NONE of
 *     the ufc/nfl/epl owning workflows. Those three can fail with nobody told.
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
  ufc: { workflow: "ufc-fight-week.yml", watched: false, alerted: false, gap: "no watchdog entry and no ops_alert.sh call — a failed fight-week capture is silent" },
  nfl: { workflow: "nfl-event-window.yml", watched: false, alerted: false, gap: "no watchdog entry and no ops_alert.sh call — a failed event-window run is silent" },
  epl: { workflow: "epl-matchweek.yml", watched: false, alerted: false, gap: "no watchdog entry and no ops_alert.sh call — a failed matchweek run is silent" },
});

export const MONITORED_SPORTS = Object.freeze(Object.keys(MONITORING));

/** `monitoring` may be PROVEN only when a sport is both watched and alerted. */
export function isMonitored(sport) {
  const m = MONITORING[String(sport ?? "").toLowerCase()];
  return Boolean(m && m.watched && m.alerted);
}

/** Every sport whose chain can fail without anyone hearing, with the reason. */
export function monitoringGaps() {
  return MONITORED_SPORTS.filter((s) => !isMonitored(s)).map((s) => ({ sport: s, gap: MONITORING[s].gap }));
}
