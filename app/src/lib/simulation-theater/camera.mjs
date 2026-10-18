/**
 * SIMULATION THEATER V2 · BROADCAST CAMERA (iteration 7; spec §2.4 camera clause and S8). Pure: no DOM, no clock, no
 * randomness. The camera is a function of (sample, compiled timeline, t, mode) only, so a seek, a reload and playback at
 * any speed all frame the same t identically.
 *
 * WHAT IT IS. A window onto the field, in TOTAL yards (the painted margin included: x 0..TOTAL_LEN, y 0..TOTAL_WID), with
 * a uniform zoom z = TOTAL_LEN / window width, bounded to [1, CAMERA_POLICY.maxZoom]. The island turns it into ONE CSS
 * transform on the wrapper that holds the cached field layers (never a viewBox animation, S8); the grain sits outside
 * that wrapper.
 *
 * HOW IT MOVES (all illustrative presentation; it never changes a recorded value):
 *   - each drive has a SHOT: the narrowest window (zoom ≤ maxZoom) that holds the drive's RECORDED start and end spots
 *     plus CAMERA_POLICY.padYd of context (and, on a scoring or kicking drive, the end zone it ends in). Inside that
 *     window the centre leans toward the ball and a few yards ahead of it, with the slack the zoom leaves;
 *   - drive START eases from wherever the previous drive left the camera to the new shot (500 ms);
 *   - RESULT holds still (the spec: never moves during score holds);
 *   - a change of possession (TRANSITION) eases to a window holding both the old end spot and the next start spot, so the
 *     ball never fades in off screen;
 *   - ESTABLISHING framing (the full field) at the opening kickoff, the second-half and overtime kickoffs and every
 *     kickoff after a score: the camera widens during the break or the post-score transition, holds wide through the next
 *     START, then eases in over the first CAMERA_POLICY.establishMs of the drive;
 *   - halftime, overtime start and the final frame return to the full field.
 * Every ease interpolates the window's EDGES with one weight, so a point inside both end windows is inside every window
 * between them: that is why the camera never clips what the current state needs (camera.test.mjs checks it at every ms).
 *
 * Modes: "follow" (above) and "full" (the static, fully framed field). Reduced motion always gets "full".
 */
import { FIELD_LEN, FIELD_WID, MARGIN_X, MARGIN_Y, TOTAL_LEN, TOTAL_WID } from "./field-geometry.mjs";

export const CAMERA_POLICY = Object.freeze({
  version: "drive-camera@1",
  minZoom: 1,
  /** spec §2.4: "scale ≤1.35×" */
  maxZoom: 1.35,
  /** yards of context kept beyond the recorded spots */
  padYd: 10,
  /** yards the framing leans ahead of the ball, toward the goal the offense attacks */
  leadYd: 6,
  /** every ease is at least this long (spec: ≥400 ms) */
  easeMs: 500,
  /** an establishing drive eases from the full field to its shot over this much of its PROGRESS phase */
  establishMs: 900,
  /** vertical lean toward the ball's (cosmetic) lane, as a fraction of the distance from midfield width */
  laneLean: 0.4,
  /** spec: never faster than one field width (120 yd) per second of playback at 1× */
  maxSpeedYdPerS: FIELD_LEN,
});

export const CAMERA_MODES = Object.freeze(["follow", "full"]);

const H_FULL = TOTAL_LEN / 2;
const ASPECT = TOTAL_WID / TOTAL_LEN;
const round4 = (v) => Math.round(v * 10000) / 10000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (w) => {
  const x = clamp(w, 0, 1);
  return x * x * (3 - 2 * x);
};

/** The full-field window. */
export const FULL_WINDOW = Object.freeze({ cx: TOTAL_LEN / 2, cy: TOTAL_WID / 2, h: H_FULL });

/** Offense-relative yards to goal → TOTAL x (margin included). Home attacks the right (D5). */
const totalX = (offense, ytg) => (offense === "home" ? 110 - ytg : 10 + ytg) + MARGIN_X;
const laneToY = (lane) => MARGIN_Y + clamp(lane, 0, 1) * FIELD_WID;

/** Smallest window (zoom ≤ max) holding [lo, hi], centred as near `focus` as that allows, inside the frame. */
function windowFor(lo0, hi0, focus, laneY) {
  const lo = clamp(lo0, 0, TOTAL_LEN);
  const hi = clamp(hi0, lo, TOTAL_LEN);
  const z = clamp(TOTAL_LEN / Math.max(1e-6, hi - lo), CAMERA_POLICY.minZoom, CAMERA_POLICY.maxZoom);
  const h = TOTAL_LEN / (2 * z);
  let cx = clamp(focus, hi - h, lo + h);
  cx = clamp(cx, h, TOTAL_LEN - h);
  const hv = h * ASPECT;
  const mid = TOTAL_WID / 2;
  const cy = clamp(mid + CAMERA_POLICY.laneLean * (laneY - mid), hv, TOTAL_WID - hv);
  return { cx, cy, h };
}

function lerpWin(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  return { cx: a.cx + (b.cx - a.cx) * w, cy: a.cy + (b.cy - a.cy) * w, h: a.h + (b.h - a.h) * w };
}

/** The lit / kicked-at end zone as a TOTAL x interval (to the frame edge, so its end line and pylons show), or null. */
function goalZone(ev) {
  const attackRight = (side) => side === "home";
  let side = null;
  if (ev.outcome === "TD" || ev.outcome === "FG" || ev.outcome === "FG_MISS") side = ev.offense;
  else if (ev.outcome === "OPP_TD" || ev.outcome === "SAFETY") side = ev.scoringSide ?? (ev.offense === "home" ? "away" : "home");
  if (!side) return null;
  return attackRight(side) ? [110 + MARGIN_X, TOTAL_LEN] : [0, 10 + MARGIN_X];
}

/** Per-drive geometry (recorded spots only). */
function driveGeom(sample, i) {
  const ev = sample.events[i];
  const s = totalX(ev.offense, ev.fieldStart);
  const e = totalX(ev.offense, ev.fieldEnd);
  const pad = CAMERA_POLICY.padYd;
  let lo = Math.min(s, e) - pad;
  let hi = Math.max(s, e) + pad;
  const zone = goalZone(ev);
  if (zone) { lo = Math.min(lo, zone[0]); hi = Math.max(hi, zone[1]); }
  const dir = ev.offense === "home" ? 1 : -1;
  return { ev, s, e, lo, hi, dir, laneY: laneToY(sample.lanes?.[i] ?? 0.5) };
}

/** Which drives open on an establishing (full-field) shot: the opening kickoff, after halftime / OT start, after a score. */
function establishing(compiled, sample, i) {
  if (i === 0) return true;
  if (sample.events[i - 1].scoring) return true;
  return compiled.keyframes.some((k) => k.driveIdx === i - 1 && k.phase === "BREAK" && (k.breakKind === "HALFTIME" || k.breakKind === "OT_START"));
}

const CACHE = new WeakMap();
function plan(sample, compiled) {
  let p = CACHE.get(compiled);
  if (p && p.sample === sample) return p;
  const geoms = sample.events.map((_, i) => driveGeom(sample, i));
  const est = sample.events.map((_, i) => establishing(compiled, sample, i));
  p = { sample, geoms, est };
  CACHE.set(compiled, p);
  return p;
}

/** Drive i's follow shot at raw PROGRESS fraction p (0 = start spot, 1 = end spot). */
function shot(g, p) {
  const fa = g.s + CAMERA_POLICY.leadYd * g.dir;
  const fb = g.e + CAMERA_POLICY.leadYd * g.dir;
  return windowFor(g.lo, g.hi, fa + (fb - fa) * smooth(p), g.laneY);
}

/** After drive i's possession changes hands: a window holding drive i's spots AND drive i+1's start spot. */
function handoff(P, i) {
  const g = P.geoms[i];
  const n = P.geoms[i + 1];
  const pad = CAMERA_POLICY.padYd;
  return windowFor(Math.min(g.lo, n.s - pad), Math.max(g.hi, n.s + pad), n.s + CAMERA_POLICY.leadYd * n.dir, n.laneY);
}

function keyIndexAt(keyframes, t) {
  let lo = 0;
  let hi = keyframes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframes[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The window at local time `dt` (ms) into keyframe k. */
function windowInKeyframe(P, compiled, k, dt) {
  const kf = compiled.keyframes[k];
  const i = kf.driveIdx;
  const g = P.geoms[i];
  const p = kf.dur > 0 ? clamp(dt / kf.dur, 0, 1) : 1;
  switch (kf.phase) {
    case "START": {
      const from = k === 0 ? FULL_WINDOW : windowInKeyframe(P, compiled, k - 1, compiled.keyframes[k - 1].dur);
      const to = P.est[i] ? FULL_WINDOW : shot(g, 0);
      return lerpWin(from, to, smooth(p));
    }
    case "PROGRESS": {
      const s = shot(g, p);
      return P.est[i] ? lerpWin(FULL_WINDOW, s, smooth(dt / CAMERA_POLICY.establishMs)) : s;
    }
    case "RESULT":
      return shot(g, 1);
    case "TRANSITION": {
      const to = g.ev.scoring || i + 1 >= P.geoms.length ? FULL_WINDOW : handoff(P, i);
      return lerpWin(shot(g, 1), to, smooth(p));
    }
    case "BREAK":
      return lerpWin(shot(g, 1), FULL_WINDOW, smooth(dt / CAMERA_POLICY.easeMs));
    default:
      return FULL_WINDOW;
  }
}

/** Window → the public camera record. */
function out(win, mode, shotKind) {
  const z = TOTAL_LEN / (2 * win.h);
  const hv = win.h * ASPECT;
  return {
    version: CAMERA_POLICY.version,
    mode,
    shot: shotKind,
    z: round4(z),
    x0: round4(win.cx - win.h),
    x1: round4(win.cx + win.h),
    y0: round4(win.cy - hv),
    y1: round4(win.cy + hv),
  };
}

/**
 * The camera at playback time t.
 * @param {object} sample   adapted, valid TheaterSample
 * @param {object} compiled compileTimeline(sample, …)
 * @param {number} tIn      playback ms
 * @param {{ mode?: "follow"|"full", reducedMotion?: boolean }} [opts]
 * @returns {{ version:string, mode:string, shot:string, z:number, x0:number, x1:number, y0:number, y1:number }}
 */
export function cameraAt(sample, compiled, tIn, { mode = "follow", reducedMotion = false } = {}) {
  const eff = reducedMotion || compiled?.reducedMotion ? "full" : mode === "full" ? "full" : "follow";
  if (eff === "full" || !compiled?.keyframes?.length) return out(FULL_WINDOW, eff, "full");
  const t = clamp(Number.isFinite(tIn) ? tIn : 0, 0, compiled.tEnd);
  const P = plan(sample, compiled);
  const k = keyIndexAt(compiled.keyframes, t);
  const kf = compiled.keyframes[k];
  const win = windowInKeyframe(P, compiled, k, t - kf.t0);
  const kind = win.h >= H_FULL - 1e-9 ? "establishing" : kf.phase === "RESULT" ? "hold" : kf.phase === "PROGRESS" && !P.est[kf.driveIdx] ? "follow" : "ease";
  return out(win, eff, kind);
}

/**
 * The CSS transform for a camera on a box of W × H px (the field layers fill the box; transform-origin 0 0). A uniform
 * scale z, so nothing drawn in screen px is distorted; the translation keeps the window's corner at the box's corner.
 */
export function cameraTransform(cam, W, H) {
  const sx = W / TOTAL_LEN;
  const sy = H / TOTAL_WID;
  const tx = Math.round(-cam.z * cam.x0 * sx * 100) / 100;
  const ty = Math.round(-cam.z * cam.y0 * sy * 100) / 100;
  return { z: cam.z, tx, ty, css: cam.z === 1 && tx === 0 && ty === 0 ? "none" : `translate3d(${tx}px, ${ty}px, 0) scale(${cam.z})` };
}

/** Screen x (px) of a TOTAL-yard x under the camera, for screen-space labels (spot tags). */
export function cameraScreenX(cam, W, totalXYd) {
  return (totalXYd - cam.x0) * cam.z * (W / TOTAL_LEN);
}
