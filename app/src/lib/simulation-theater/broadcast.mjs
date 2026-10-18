/**
 * SIMULATION THEATER V2 · BROADCAST GRAPHICS COPY (iteration 7). Pure: every string the score bug's drive strip and the
 * interstitial cards show, built only from recorded fields, stated derivations of them, and labelled illustrative values.
 * No plays, downs, distances, players or kick details: the engine records none (spec §1.2 Forbidden).
 *
 *   driveSituation  the strip under the score bug: the RECORDED totals once a drive has ended ("Drive 7 · 10 plays ·
 *                   75 yds"), its recorded start spot while it starts, and an ILLUSTRATIVE yardage while the ball moves
 *                   between the recorded spots (labelled, and approximate by sign: "≈32 yds")
 *   periodCard      the start-of-period card (opening kickoff, second half, overtime): non-blocking, PERIOD_CARD_MS long
 *   breakCard       halftime (score summary with the run's first-half linescore), end of regulation, final (final-score
 *                   card with the "SIMULATED · not a real game" line)
 *   rolloverCard    the non-blocking "End of Q1" / "End of Q3" strip (S2)
 * Timings are the motion sheet's (spec §2.4): cards ride the compiled timeline's own phases and add no time.
 */
import { PERIOD_SHORT, fieldPosition, fmtClock, fmtPeriodClock, plural, scoreLine } from "./format.mjs";

/** The final card's disclosure line (founder brief, iteration 7). */
export const GAME_DISCLOSURE = "SIMULATED · not a real game";
/** The illustrative tag on the in-drive yardage. */
export const ILLUSTRATIVE_TAG = "illustrative";
export const RECORDED_TAG = "recorded";
/** How long the start-of-period card shows from the drive's first frame (START 500 ms + the first 1.1 s of the drive). */
export const PERIOD_CARD_MS = 1600;

const other = (side) => (side === "home" ? "away" : "home");
const yds = (n) => plural(n, "yd", "yds");

/**
 * The drive strip under the score bug for drive `ev` in `phase`.
 * @returns {{ kind: "start"|"progress"|"recorded", text: string, tag: string }}
 */
export function driveSituation(ev, phase, teams, driveCount) {
  const n = `Drive ${ev.index + 1}${driveCount ? ` of ${driveCount}` : ""}`;
  const off = teams[ev.offense].abbr;
  const pos = fieldPosition(ev.fieldStart, teams[other(ev.offense)].abbr);
  if (phase === "START") return { kind: "start", text: `${n} · ${off} ball · ${pos}`, tag: RECORDED_TAG };
  if (phase === "PROGRESS") return { kind: "progress", text: `${n} · ${off} ball · from ${pos}`, tag: ILLUSTRATIVE_TAG };
  return { kind: "recorded", text: `${n} · ${plural(ev.plays, "play")} · ${yds(ev.netYards)}`, tag: RECORDED_TAG };
}

/** The illustrative yardage while the ball moves: the ball's (illustrative) distance from the recorded start spot. */
export function progressYardsText(ev, ballYardsToGoal) {
  const y = Math.round(ev.fieldStart - ballYardsToGoal);
  return `≈${yds(y)}`;
}

/** Index of the drive that opens a period (game, second half, overtime), or the kind of opening; null otherwise. */
export function periodOpening(compiled, i) {
  if (i === 0) return "GAME";
  const prev = compiled.keyframes.find((k) => k.driveIdx === i - 1 && k.phase === "BREAK");
  if (prev?.breakKind === "HALFTIME") return "SECOND_HALF";
  if (prev?.breakKind === "OT_START") return "OVERTIME";
  return null;
}

/**
 * The start-of-period card at playback time t (non-blocking: it rides the drive's own START and early PROGRESS).
 * @returns {null | { kind: "PERIOD_START", opening: string, title: string, sub: string, note: string, driveIdx: number }}
 */
export function periodCard(sample, compiled, teams, t) {
  for (const span of compiled.driveSpans) {
    if (t < span.startT) break;
    if (t >= span.startT + PERIOD_CARD_MS) continue;
    const opening = periodOpening(compiled, span.driveIdx);
    if (!opening) continue;
    const ev = sample.events[span.driveIdx];
    const title = opening === "GAME" ? "Start of game" : opening === "SECOND_HALF" ? "Start of 2nd half" : "Overtime";
    const pos = fieldPosition(ev.fieldStart, teams[other(ev.offense)].abbr);
    return {
      kind: "PERIOD_START",
      opening,
      title,
      sub: `${fmtPeriodClock(ev.period, ev.periodClockStart)} · ${teams[ev.offense].abbr} ball at ${pos}`,
      note: "kick/return not modelled",
      driveIdx: span.driveIdx,
    };
  }
  return null;
}

/**
 * Halftime / end of regulation / final. `score` is the state's score at the break (the recorded score after the drive).
 * Halftime adds this run's Q1 and Q2 points from `periodScores`, only when they sum to the halftime score (never a
 * filled-in column).
 */
export function breakCard(breakKind, score, sample, teams, runCount) {
  const sides = ["away", "home"];
  if (breakKind === "HALFTIME") {
    const ps = sample.periodScores;
    const ok = ps && sides.every((s) => ps[s][0] + ps[s][1] === score[s]);
    return {
      kind: "HALFTIME",
      title: "Halftime",
      sub: scoreLine(score, teams),
      columns: ok ? ["Q1", "Q2", "Half"] : ["Half"],
      rows: sides.map((s) => ({ side: s, abbr: teams[s].abbr, score: score[s], cells: ok ? [ps[s][0], ps[s][1], score[s]] : [score[s]], leader: score[s] > score[other(s)] })),
      line: GAME_DISCLOSURE,
      dismissible: false,
    };
  }
  if (breakKind === "OT_START") {
    return { kind: "END_REG", title: "End of regulation", sub: `${scoreLine(score, teams)} · overtime next`, rows: null, line: null, dismissible: false };
  }
  if (breakKind === "FINAL") {
    const ot = Boolean(sample.finalScore?.overtime);
    const winner = score.home > score.away ? "home" : score.away > score.home ? "away" : null;
    return {
      kind: "FINAL",
      title: ot ? "Final · OT" : "Final",
      sub: scoreLine(score, teams),
      columns: null,
      rows: sides.map((s) => ({ side: s, abbr: teams[s].abbr, score: score[s], cells: [score[s]], leader: winner === s })),
      line: GAME_DISCLOSURE,
      run: `run #${sample.runIndex.toLocaleString("en-US")}${runCount ? ` of ${runCount.toLocaleString("en-US")}` : ""}`,
      dismissible: true,
    };
  }
  return null;
}

/** The non-blocking quarter-rollover strip (S2): "End of Q1", with the score at that instant. */
export function rolloverCard(rollover, score, teams) {
  if (!rollover) return null;
  return { kind: "ROLLOVER", title: `End of Q${rollover.quarter}`, sub: `${PERIOD_SHORT[rollover.quarter + 1]} next · ${scoreLine(score, teams)}` };
}

/** The drive-end lower third: recorded totals only. */
export function driveEndLowerThird(ev, teams, driveCount) {
  const def = teams[other(ev.offense)].abbr;
  return {
    tag: `Drive ${ev.index + 1} of ${driveCount}`,
    team: teams[ev.offense].abbr,
    facts: `${plural(ev.plays, "play")} · ${plural(ev.netYards, "yard")} · ${fmtClock(ev.seconds)}`,
    result: `${ev.outcomeLabel}${ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? ` · ${def}` : ""}`,
  };
}
