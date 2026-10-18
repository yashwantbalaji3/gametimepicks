/**
 * SIMULATION THEATER V2 · FORMAT — clock, period and label helpers (ST-01 spec v1.1 §1.3, §3.3; ST2-01b). Pure.
 *
 * DISPLAYED QUARTER COMES FROM THE CLOCK, NEVER FROM THE ENGINE'S `q` (S1). The engine labels a drive with
 * `quarterOf(clockStart)` using `>=` thresholds (engine.mjs:43), so a drive that STARTS on a boundary carries the
 * EARLIER quarter: every second-half kickoff is `{q: 2, clockStart: 1800}`. Read naively that is "Q2 0:00". So:
 *
 *   displayPeriodAtStart(c)  a drive's START instant: an instant on a boundary OPENS the later quarter (1800 → Q3 15:00)
 *   periodAtEnd(c)           a drive's END instant and the running clock up to and including a boundary: an instant on
 *                            a boundary CLOSES the earlier quarter (1800 at the end of the half → Q2 0:00)
 *
 * `c` is regulation seconds remaining in the GAME (3600 → 0), not the quarter clock (engine.mjs:202, :416). Overtime
 * is period 5 and its clock is the OT clock itself.
 */

/** The engine's own rule (engine.mjs:43), reproduced so the theater never imports the engine. */
export const quarterOf = (c) => (c >= 2700 ? 1 : c >= 1800 ? 2 : c >= 900 ? 3 : 4);

/** Period of a drive's START instant: a boundary instant opens the later quarter. 3600 → Q1. */
export const displayPeriodAtStart = (c) => (c > 2700 ? 1 : c > 1800 ? 2 : c > 900 ? 3 : 4);

/** Period of a drive's END instant (and the running clock up to and including a boundary). */
export const periodAtEnd = (c) => quarterOf(c);

/** Seconds left in the displayed period for a regulation instant `c` shown as `period`. */
export const periodClockOf = (c, period) => (period === 5 ? c : c - 900 * (4 - period));

/** "15:00", "1:02", "0:00". Fractional (interpolated) seconds round UP so 15:00 holds until a second has passed. */
export function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A duration in seconds ("2:45"); recorded integers only. */
export const fmtDuration = (seconds) => fmtClock(seconds);

export const PERIOD_SHORT = Object.freeze({ 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4", 5: "OT" });
export const PERIOD_LONG = Object.freeze({ 1: "first quarter", 2: "second quarter", 3: "third quarter", 4: "fourth quarter", 5: "overtime" });

/** "Q3 15:00" / "OT 8:15" for a (period, periodClock) pair. */
export const fmtPeriodClock = (period, periodClock) => `${PERIOD_SHORT[period] ?? "?"} ${fmtClock(periodClock)}`;

/** Every recorded drive result (engine.mjs:32). Anything else fails validation as UNKNOWN_RESULT. */
export const DRIVE_RESULTS = Object.freeze(["TD", "FG", "FG_MISS", "PUNT", "TURNOVER", "DOWNS", "END_HALF", "OPP_TD", "SAFETY"]);
export const SCORING_RESULTS = Object.freeze(["TD", "FG", "OPP_TD", "SAFETY"]);
/** Possession-ending stops that get a 600 ms hold (spec §2.4). */
export const STOP_RESULTS = Object.freeze(["TURNOVER", "DOWNS", "FG_MISS"]);

const RESULT_LABEL = Object.freeze({
  TD: "touchdown",
  FG: "field goal",
  FG_MISS: "missed field goal",
  PUNT: "punt",
  TURNOVER: "turnover",
  DOWNS: "turnover on downs",
  OPP_TD: "defensive touchdown",
  SAFETY: "safety",
});

/**
 * Result label (S3). END_HALF is labelled by the drive's END instant, not by `q`: it ends the first half (clock 1800),
 * regulation (clock 0) or overtime (OT clock 0). "interception" / "fumble" are never used: the engine draws one but does
 * not record it (engine.mjs:254).
 */
export function outcomeLabel(result, { inOT, clockEnd }) {
  if (result === "END_HALF") {
    if (inOT) return "end of overtime";
    if (clockEnd === 1800) return "end of half";
    if (clockEnd === 0) return "end of regulation";
    return "end of half";
  }
  return RESULT_LABEL[result] ?? String(result).toLowerCase();
}

/** Field-position language from offense-relative yards to goal: "own 30", "midfield", "WSH 42". */
export function fieldPosition(yardsToGoal, defenseAbbr) {
  const y = Math.round(yardsToGoal);
  if (y === 50) return "midfield";
  if (y > 50) return `own ${100 - y}`;
  return `${defenseAbbr} ${y}`;
}

const MINUS = "−";
export const fmtSigned = (n) => (n < 0 ? `${MINUS}${Math.abs(n)}` : String(n));
export const plural = (n, one, many = `${one}s`) => `${fmtSigned(n)} ${Math.abs(n) === 1 ? one : many}`;

/** "SF 3–0", "WSH 21–14", "tied 7–7": the leader first, as a broadcast reads it. */
export function scoreLine(score, teams) {
  const { home, away } = score;
  if (home > away) return `${teams.home.abbr} ${home}–${away}`;
  if (away > home) return `${teams.away.abbr} ${away}–${home}`;
  return `tied ${home}–${away}`;
}

/** The run-off note's copy (spec §1.3, S4). */
export const RUNOFF_NOTE_TEXT = "Engine ran out the half on this drive (clock use not modelled play-by-play)";

/** Persistent labels (spec §1.3). One source so the SSR shell, island and transcript cannot drift. */
export const LABELS = Object.freeze({
  badge: "SIMULATED · drive-level · movement illustrative · experimental model",
  // No abbreviated badge (founder review, iteration 2): the badge wraps at narrow widths, it is never shortened.
  sample: "REPRESENTATIVE SIMULATED GAME — not the forecast",
  transitionCard: "Change of possession · kick/return not modelled",
  clockIllustrative: "Clock illustrative between recorded drive start and end",
  orientation: "Fixed field orientation: the home team defends the left end zone all game, so home drives move left to right. Real teams change ends each quarter; the engine records no field direction, so the field is never flipped.",
  noscript: "Playback needs JavaScript. Every drive is listed in the transcript below.",
});

/** Selection-rule text per representative kind (spec §2.1, from receipt.mjs:151-159). */
export const KIND_LABEL = Object.freeze({
  MEDIAN_LIKE: "Median-like",
  HIGH_SCORING: "High-scoring",
  LOW_SCORING: "Low-scoring",
  UPSET: "Upset",
  OVERTIME: "Overtime",
});
export const KIND_RULE = Object.freeze({
  MEDIAN_LIKE: "The run closest to the batch's median total and median margin.",
  HIGH_SCORING: "The run closest to the 90th-percentile total at the median margin.",
  LOW_SCORING: "The run closest to the 10th-percentile total at the median margin.",
  UPSET: "The underdog-wins run closest to the median total and the mirrored median margin.",
  OVERTIME: "The first overtime run in the batch by run index (not “typical”).",
});
export const KIND_ORDER = Object.freeze(["MEDIAN_LIKE", "HIGH_SCORING", "LOW_SCORING", "UPSET", "OVERTIME"]);

/** Merged-chip copy (S5): "Median-like · also the first overtime run". */
export function chipTitle(kinds) {
  const [first, ...rest] = kinds;
  const head = KIND_LABEL[first] ?? first;
  if (!rest.length) return head;
  const also = rest.map((k) => (k === "OVERTIME" ? "the first overtime run" : (KIND_LABEL[k] ?? k).toLowerCase())).join(", ");
  return `${head} · also ${also}`;
}

/** "SF 29–21" / "27–20 OT" chip score: away–home order matches the report's summary line. */
export function finalLine(final, teams) {
  return `${teams.away.abbr} ${final.away}–${final.home} ${teams.home.abbr}${final.overtime ? " OT" : ""}`;
}

/**
 * Transcript sentence (spec §3.8): "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0".
 * Built only from recorded fields plus the derived period and labels.
 */
export function transcriptSentence(ev, teams) {
  const offense = teams[ev.offense];
  const defense = teams[ev.offense === "home" ? "away" : "home"];
  const parts = [
    fmtPeriodClock(ev.period, ev.periodClockStart),
    `${offense.abbr} ball at ${fieldPosition(ev.fieldStart, defense.abbr)}`,
    `${plural(ev.plays, "play")}, ${plural(ev.netYards, "yard")}, ${fmtDuration(ev.seconds)}`,
    ev.outcome === "OPP_TD" ? `${ev.outcomeLabel} (${defense.abbr})` : ev.outcome === "SAFETY" ? `${ev.outcomeLabel} (${defense.abbr})` : ev.outcomeLabel,
    scoreLine(ev.scoreAfter, teams),
  ];
  if (ev.notes?.some((n) => n.code === "ENGINE_CLOCK_RUNOFF")) parts.push(RUNOFF_NOTE_TEXT);
  return parts.join(" · ");
}

/** Accessible name of one timeline segment: "Drive 7, second quarter, SF, touchdown, SF 14–7". */
export function driveAccessibleName(ev, teams) {
  return `Drive ${ev.index + 1}, ${PERIOD_LONG[ev.period]}, ${teams[ev.offense].abbr}, ${ev.outcomeLabel}, ${scoreLine(ev.scoreAfter, teams)}`;
}

/** "1:48" for playback milliseconds. */
export function fmtPlayback(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
