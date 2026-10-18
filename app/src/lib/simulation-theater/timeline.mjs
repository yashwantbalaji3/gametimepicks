/**
 * SIMULATION THEATER V2 · TIMELINE COMPILER (spec §3.4, with S2 and S17). Pure, deterministic.
 *
 * compileTimeline(sample, opts) → { keyframes[], markers[], driveSpans[], tEnd }
 *
 * Per drive: START (500 ms), PROGRESS (clamp(900, 260 × plays, 3200) ms), RESULT (900 ms score / 600 ms stop / 0 ms
 * otherwise), TRANSITION (500 ms when the next drive has a different offense or a kick follows). Blocking BREAK
 * keyframes only at halftime, OT start and the end of the game. All durations are PLAYBACK milliseconds at 1×; 2× and
 * 4× only change how fast `t` advances, never the timeline, so equal `t` is equal state at every speed.
 *
 * QUARTER_ROLLOVER markers (S2) are non-blocking and add no time: one at Q1→Q2 and one at Q3→Q4 per run. If a drive's
 * interval strictly contains the boundary b ∈ {2700, 900}, the marker sits inside its PROGRESS phase where the
 * (linearly interpolated, illustrative) clock equals b; if a drive ends exactly on b, it sits at the next drive's START.
 *
 * Reduced motion changes the COMPILED timeline only (no PROGRESS tween; each drive is START → RESULT steps, 1.5 s per
 * drive), never the outcomes.
 */
import { SCENE_VERSION } from "./scene-rng.mjs";
import { STOP_RESULTS } from "./format.mjs";

/** Versioned scene policy. Changing any duration must bump `version` (and the screenshot baselines). */
export const SCENE_POLICY = Object.freeze({
  version: SCENE_VERSION,
  orientation: "home-left", // D5: fixed; home defends the left end zone, home drives move left → right
  length: "drive-weighted", // D7: ≈40–103 s at 1×
  startMs: 500,
  progressMs: (plays) => Math.min(3200, Math.max(900, 260 * plays)),
  resultScoreMs: 900,
  resultStopMs: 600,
  resultOtherMs: 0,
  transitionMs: 500,
  breakMs: Object.freeze({ HALFTIME: 1200, OT_START: 900, FINAL: 1500 }),
  rolloverChipMs: 700,
});

/** Reduced-motion variant: stepped, no tweening, one drive per 1.5 s. */
export const REDUCED_POLICY = Object.freeze({
  ...SCENE_POLICY,
  startMs: 500,
  progressMs: () => 0,
  resultScoreMs: 1000,
  resultStopMs: 1000,
  resultOtherMs: 1000,
  transitionMs: 0,
});

function resultMs(ev, policy) {
  if (ev.scoring) return policy.resultScoreMs;
  if (STOP_RESULTS.includes(ev.outcome)) return policy.resultStopMs;
  return policy.resultOtherMs;
}

/** Which blocking break (if any) follows drive i. */
function breakAfter(events, i) {
  const ev = events[i];
  const next = events[i + 1];
  if (!next) return "FINAL";
  if (!ev.inOT && !next.inOT && ev.clockStart > 1800 && ev.clockEnd === 1800) return "HALFTIME";
  if (!ev.inOT && next.inOT) return "OT_START";
  return null;
}

/**
 * @param {{ events: any[], receiptId: string, runIndex: number }} sample  an adapted, VALID TheaterSample
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export function compileTimeline(sample, { reducedMotion = false } = {}) {
  const policy = reducedMotion ? REDUCED_POLICY : SCENE_POLICY;
  const events = sample.events ?? [];
  const keyframes = [];
  const driveSpans = [];
  const markers = [];
  let t = 0;
  const push = (driveIdx, phase, dur, extra = {}) => {
    if (dur <= 0) return null;
    const kf = { driveIdx, phase, t0: t, dur, ...extra };
    keyframes.push(kf);
    t += dur;
    return kf;
  };

  const pendingBoundary = []; // rollovers that land exactly on a drive boundary: placed at the next START
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const spanStart = t;
    const startT = t;
    push(i, "START", policy.startMs);
    for (const q of pendingBoundary.splice(0)) markers.push({ type: "QUARTER_ROLLOVER", quarter: q, atT: startT, driveIdx: i, exact: true });
    const progStart = t;
    const progDur = policy.progressMs(ev.plays);
    push(i, "PROGRESS", progDur);
    if (!ev.inOT) {
      for (const [b, q] of [[2700, 1], [900, 3]]) {
        if (ev.clockStart > b && b > ev.clockEnd) {
          // Clock is linear in the phase's raw progress, so the crossing instant is exact (not the eased ball).
          const frac = (ev.clockStart - b) / ev.seconds;
          markers.push({ type: "QUARTER_ROLLOVER", quarter: q, atT: progStart + Math.round(frac * progDur * 1000) / 1000, driveIdx: i, exact: false });
        } else if (ev.clockEnd === b && ev.clockStart > b) {
          pendingBoundary.push(q);
        }
      }
    }
    push(i, "RESULT", resultMs(ev, policy));
    const brk = breakAfter(events, i);
    if (brk) push(i, "BREAK", policy.breakMs[brk], { breakKind: brk });
    else {
      const next = events[i + 1];
      const kickOrChange = next.offense !== ev.offense || ev.scoring;
      if (kickOrChange) push(i, "TRANSITION", policy.transitionMs);
    }
    driveSpans.push({ driveIdx: i, t0: spanStart, t1: t, startT });
  }
  return {
    sceneVersion: policy.version,
    reducedMotion,
    receiptId: sample.receiptId,
    runIndex: sample.runIndex,
    keyframes,
    markers,
    driveSpans,
    tEnd: t,
    rolloverChipMs: policy.rolloverChipMs,
  };
}

/** Index of the drive whose span contains t (the last drive at t = tEnd). */
export function driveAt(compiled, t) {
  const spans = compiled.driveSpans;
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (spans[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}
