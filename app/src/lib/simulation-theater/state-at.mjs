/**
 * SIMULATION THEATER V2 · stateAt — the pure frame function (spec §3.3). Deterministic: no Date, no Math.random, no DOM.
 *
 * Every frame is a function of ONE representative run of ONE receipt plus the versioned scene policy. `t` is clamped to
 * [0, tEnd]; a seek is one binary search over keyframe start times plus interpolation (O(log n)).
 *
 * Recorded vs illustrative (spec §1.2, S13): the ball at a drive's start and end, the score, and the clock AT a drive's
 * recorded start and end are exact. The ball's motion between them and the clock between them are illustrative; the
 * state says so (`clockIllustrative`). The displayed quarter always comes from the clock (S1), never the engine's `q`.
 */
import { compileTimeline } from "./timeline.mjs";
import { outcomeLabel, periodAtEnd, periodClockOf } from "./format.mjs";
import { SCENE_VERSION } from "./scene-rng.mjs";

/** cubic-bezier(x1, y1, x2, y2) as a pure function of progress in [0, 1]. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let u = p;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - p;
      if (Math.abs(e) < 1e-7) break;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    // Bisection fallback keeps it monotone and bounded.
    if (!(u >= 0 && u <= 1) || Math.abs(sx(u) - p) > 1e-5) {
      let lo = 0;
      let hi = 1;
      u = p;
      for (let i = 0; i < 40; i++) {
        if (sx(u) < p) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return sy(u);
  };
}

export const EASE_PROGRESS = cubicBezier(0.45, 0.05, 0.35, 1);
export const EASE_START = cubicBezier(0.2, 0.7, 0.2, 1);

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Absolute field x (0..120 yards, home end zone on the left) for offense-relative yards to goal. */
export const fieldXOf = (offense, yardsToGoal) => (offense === "home" ? 110 - yardsToGoal : 10 + yardsToGoal);

function resultChip(ev, teams) {
  const off = teams[ev.offense].abbr;
  const def = teams[ev.offense === "home" ? "away" : "home"].abbr;
  const pts = ev.scoringSide ? ev.delta[ev.scoringSide] : 0;
  switch (ev.outcome) {
    case "TD": return { kind: "TD", tone: "score", text: `TOUCHDOWN · ${off} +${pts}` };
    case "FG": return { kind: "FG", tone: "score", text: `FIELD GOAL · ${off} +${pts}` };
    case "OPP_TD": return { kind: "OPP_TD", tone: "score", text: `Defensive touchdown · ${def}` };
    case "SAFETY": return { kind: "SAFETY", tone: "score", text: `SAFETY · ${def} +${pts}` };
    case "TURNOVER": return { kind: "TURNOVER", tone: "stop", text: `Turnover · ${off}` };
    case "DOWNS": return { kind: "DOWNS", tone: "stop", text: `Turnover on downs · ${off}` };
    case "FG_MISS": return { kind: "FG_MISS", tone: "stop", text: `Missed field goal · ${off}` };
    case "PUNT": return { kind: "PUNT", tone: "neutral", text: `Punt · ${off}` };
    case "END_HALF": {
      const l = outcomeLabel("END_HALF", { inOT: ev.inOT, clockEnd: ev.clockEnd });
      return { kind: "END_HALF", tone: "neutral", text: l.charAt(0).toUpperCase() + l.slice(1) };
    }
    default: return { kind: ev.outcome, tone: "neutral", text: ev.outcomeLabel };
  }
}

const BREAK_CHIP = Object.freeze({
  HALFTIME: { kind: "HALFTIME", tone: "break", text: "HALFTIME" },
  OT_START: { kind: "OT_START", tone: "break", text: "OVERTIME" },
  FINAL: { kind: "FINAL", tone: "break", text: "FINAL" },
});

/** Locate the keyframe active at t: the last with t0 ≤ t (zero-duration keyframes are never emitted). */
function keyframeAt(keyframes, t) {
  let lo = 0;
  let hi = keyframes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframes[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  return keyframes[lo];
}

/**
 * The scene state at playback time t for a compiled timeline of a sample.
 * @param {object} sample   adapted, valid TheaterSample
 * @param {object} compiled compileTimeline(sample, …)
 * @param {{ home: {abbr:string}, away: {abbr:string} }} teams
 * @param {number} tIn playback ms
 */
export function stateAtCompiled(sample, compiled, teams, tIn) {
  const tEnd = compiled.tEnd;
  const t = Math.min(tEnd, Math.max(0, Number.isFinite(tIn) ? tIn : 0));
  const kf = keyframeAt(compiled.keyframes, t);
  const p = kf.dur > 0 ? Math.min(1, Math.max(0, (t - kf.t0) / kf.dur)) : 1;
  const ev = sample.events[kf.driveIdx];
  const startX = fieldXOf(ev.offense, ev.fieldStart);
  const endX = fieldXOf(ev.offense, ev.fieldEnd);

  let ballYardsToGoal = ev.fieldStart;
  let ballOpacity = 1;
  let ribbon = null;
  let score = ev.scoreBefore;
  let clock = ev.clockStart;
  let period = ev.period;
  let periodClock = ev.periodClockStart;
  let clockIllustrative = false;
  let chip = null;
  let card = null;
  let breakKind = null;
  let startRingScale = 1;
  let flash = null;

  switch (kf.phase) {
    case "START": {
      // Reduced motion: no fade or scale tween; the drive's start state appears at once.
      const e = compiled.reducedMotion ? 1 : EASE_START(p);
      ballOpacity = round3(e);
      startRingScale = round3(0.6 + 0.4 * e);
      break;
    }
    case "PROGRESS": {
      const e = EASE_PROGRESS(p);
      ballYardsToGoal = round3(ev.fieldStart + (ev.fieldEnd - ev.fieldStart) * e);
      ribbon = { fromX: startX, toX: round3(fieldXOf(ev.offense, ballYardsToGoal)) };
      // Illustrative clock: linear between the recorded endpoints (S13).
      clock = round3(ev.clockStart - ev.seconds * p);
      if (p <= 0) {
        period = ev.period;
      } else if (p >= 1) {
        clock = ev.clockEnd;
        period = ev.periodEnd;
      } else {
        period = ev.inOT ? 5 : periodAtEnd(clock);
        clockIllustrative = true;
      }
      periodClock = round3(periodClockOf(clock, period));
      break;
    }
    case "RESULT":
    case "TRANSITION":
    case "BREAK": {
      ballYardsToGoal = ev.fieldEnd;
      ribbon = { fromX: startX, toX: endX };
      score = ev.scoreAfter;
      clock = ev.clockEnd;
      period = ev.periodEnd;
      periodClock = ev.periodClockEnd;
      chip = resultChip(ev, teams);
      if (kf.phase === "RESULT" && ev.scoring) flash = { side: ev.scoringSide, p: round3(p) };
      if (kf.phase === "TRANSITION") {
        ballOpacity = round3(1 - p);
        card = "Change of possession · kick/return not modelled";
      }
      if (kf.phase === "BREAK") {
        breakKind = kf.breakKind;
        chip = BREAK_CHIP[kf.breakKind];
      }
      break;
    }
    default:
      break;
  }

  let rollover = null;
  for (const m of compiled.markers) {
    if (t >= m.atT && t < m.atT + compiled.rolloverChipMs) rollover = { quarter: m.quarter, atT: m.atT };
  }
  const final = kf.phase === "BREAK" && kf.breakKind === "FINAL";
  const winner = final ? (score.home > score.away ? "home" : score.away > score.home ? "away" : null) : null;

  return {
    sceneVersion: compiled.sceneVersion,
    receiptId: sample.receiptId,
    runIndex: sample.runIndex,
    t: round3(t),
    tEnd,
    driveIdx: kf.driveIdx,
    driveCount: sample.events.length,
    phase: final ? "FINAL" : kf.phase,
    phaseProgress: round3(p),
    offense: ev.offense,
    ballYardsToGoal,
    ballFieldX: round3(fieldXOf(ev.offense, ballYardsToGoal)),
    ballOpacity,
    startFieldX: startX,
    startRingScale,
    lane: sample.lanes?.[kf.driveIdx] ?? 0.5,
    ribbon,
    score: { home: score.home, away: score.away },
    period,
    periodClock,
    clock,
    clockIllustrative,
    chip,
    card,
    breakKind,
    rollover,
    flash,
    winner,
    dimmed: kf.breakKind === "HALFTIME",
    camera: null,
    illustrative: true,
  };
}

/* Bounded memo (LRU of 5) keyed receiptId|runIndex|sceneVersion|reducedMotion. */
const MEMO = new Map();
const MEMO_MAX = 5;
export function compiledFor(sample, { reducedMotion = false } = {}) {
  const key = `${sample.receiptId}|${sample.runIndex}|${SCENE_VERSION}|${reducedMotion ? 1 : 0}`;
  if (MEMO.has(key)) {
    const v = MEMO.get(key);
    MEMO.delete(key);
    MEMO.set(key, v);
    return v;
  }
  const v = compileTimeline(sample, { reducedMotion });
  MEMO.set(key, v);
  while (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return v;
}

/**
 * stateAt(manifest, runIndex, t, opts) = stateAtCompiled(sample, compileTimeline(sample, opts), teams, t).
 * Returns null when the run is not in the manifest or its sample failed validation (never a guessed frame).
 */
export function stateAt(manifest, runIndex, t, opts = { reducedMotion: false }) {
  const sample = manifest.samples.find((s) => s.runIndex === runIndex && s.validation.ok);
  if (!sample) return null;
  return stateAtCompiled(sample, compiledFor(sample, opts), manifest.teams, t);
}

/** Final-frame state (t = tEnd): the server renders this as the static fallback. */
export function finalState(manifest, sample) {
  const c = compiledFor(sample, { reducedMotion: false });
  return stateAtCompiled(sample, c, manifest.teams, c.tEnd);
}

