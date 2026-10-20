/**
 * SIMULATION THEATER V2 · FIELD GEOMETRY (iteration 2). Pure: no DOM, no clock, no randomness.
 *
 * One mapping shared by the static turf layer (yard units, stretched) and the screen-pixel overlay (ball, ribbon,
 * markers), so they can never disagree about where a yard line is.
 *
 *   x: 0..120 yards, home end zone on the LEFT (fixed orientation, D5). The playing field is framed by a sideline margin
 *      of MARGIN_X yards at each end line and MARGIN_Y yards at each sideline (painted out-of-bounds turf), so the
 *      overlay maps x → (x + MARGIN_X) / (120 + 2·MARGIN_X) · W.
 *   y: a fraction 0..1 of the field's width (sideline to sideline). The y-axis carries NO data (spec §2.2); the lane is
 *      cosmetic (scene-rng.mjs).
 *
 * overlayFrame(frame, box) turns one stateAt frame into the overlay's numbers. It is the ONLY thing the per-frame painter
 * writes, and it is deterministic, so equal `t` always paints the same pixels.
 */

export const FIELD_LEN = 120;
export const FIELD_WID = 53.3;
export const MARGIN_X = 2.6;
export const MARGIN_Y = 2.6;
export const TOTAL_LEN = FIELD_LEN + 2 * MARGIN_X;
export const TOTAL_WID = FIELD_WID + 2 * MARGIN_Y;
/** Static layer units per yard (viewBox = TOTAL_LEN·U × TOTAL_WID·U). */
export const U = 10;
/** NFL inbounds hash marks: 70 ft 9 in from each sideline. */
export const HASH_FROM_SIDELINE = 23.58;

const r2 = (v) => Math.round(v * 100) / 100;

/** Screen mapping for a measured box (px). */
export function fieldMap(W, H) {
  const w = Math.max(1, W);
  const h = Math.max(1, H);
  const sx = w / TOTAL_LEN;
  const sy = h / TOTAL_WID;
  const X = (yd) => (yd + MARGIN_X) * sx;
  const Y = (f) => (MARGIN_Y + f * FIELD_WID) * sy;
  return { W: w, H: h, sx, sy, X, Y, x0: X(0), x1: X(FIELD_LEN), y0: Y(0), y1: Y(1), fieldH: FIELD_WID * sy };
}

/** Ball half-length in px: BALL_RX.perW · box width, clamped to [min, max]; the half-width is BALL_RY_RATIO of it. */
export const BALL_RX = Object.freeze({ min: 9, max: 17, perW: 0.016 });
export const BALL_RY_RATIO = 0.62;

/** Ball size in px: grows with the box, never below a size that reads at 320 px. */
export function ballSize(W) {
  const rx = Math.max(BALL_RX.min, Math.min(BALL_RX.max, W * BALL_RX.perW));
  return { rx: r2(rx), ry: r2(rx * BALL_RY_RATIO) };
}

/**
 * Yard-number set by width (spec §2.2/§2.3): every 10 → every 20 → 30/50/30. [fieldX, label, arrow toward goal]
 * @returns {Array<[number, string, number]>}
 */
export function numberSet(W) {
  const all = [[20, "10"], [30, "20"], [40, "30"], [50, "40"], [60, "50"], [70, "40"], [80, "30"], [90, "20"], [100, "10"]];
  const pick = W < 340 ? [40, 60, 80] : W < 520 ? [30, 50, 60, 70, 90] : all.map((a) => a[0]);
  return all.filter(([x]) => pick.includes(x)).map(([x, l]) => [x, l, x < 60 ? -1 : x > 60 ? 1 : 0]);
}

/** Trail length behind the ball, in yards (illustrative motion only). */
export const TRAIL_YD = 9;

/**
 * The overlay's numbers for one frame.
 * @param {object|null} f  stateAt frame (or the pre-play display variant)
 * @param {{W:number,H:number}} box
 */
export function overlayFrame(f, box) {
  const m = fieldMap(box.W, box.H);
  if (!f) return null;
  const laneY = r2(m.Y(f.lane));
  const ballX = r2(m.X(f.ballFieldX));
  const startX = r2(m.X(f.startFieldX));
  const dir = f.offense === "away" ? -1 : 1;
  const ribbon = f.ribbon ? { x: r2(m.X(Math.min(f.ribbon.fromX, f.ribbon.toX))), w: r2(Math.abs(m.X(f.ribbon.toX) - m.X(f.ribbon.fromX))) } : null;
  // The trail covers at most TRAIL_YD behind the ball and never extends past the recorded start spot.
  // It follows the direction of TRAVEL (a drive can lose yards), not the direction of attack.
  let trail = null;
  const travel = Math.sign(f.ballFieldX - f.startFieldX) || dir;
  if (f.ribbon && f.phase === "PROGRESS") {
    const back = Math.min(TRAIL_YD, Math.abs(f.ballFieldX - f.startFieldX));
    if (back > 0.05) {
      const tailX = m.X(f.ballFieldX - travel * back);
      trail = { x: r2(Math.min(tailX, ballX)), w: r2(Math.abs(ballX - tailX)) };
    }
  }
  return {
    ballX,
    laneY,
    ballOpacity: f.ballOpacity,
    startX,
    ringR: r2(Math.max(5, Math.min(9, box.W * 0.007)) * f.startRingScale),
    dir,
    travel,
    ribbon,
    trail,
    flashOpacity: f.flash ? r2(0.45 * (1 - f.flash.p)) : 0,
    // iteration 7: glow + bloom rise over the first 18 % of the score hold, then fall; a pure function of the hold's p
    glowOpacity: f.flash ? r2(f.flash.p < 0.18 ? f.flash.p / 0.18 : Math.max(0, 1 - (f.flash.p - 0.18) / 0.82)) : 0,
  };
}

// ── turf colour maths (for the ≥3:1 on-field rule; spec S6) ─────────────────────────────────────────────────────
/**
 * The tokens the field surfaces and the keyline are mixed from, as sRGB triples. They MIRROR globals.css (--bg,
 * --vault-accent-deep, --lava-text, --gtp-card-elevated); field-geometry.test.mjs reads globals.css and fails if they
 * drift. Kept as numbers because they feed contrast maths, never paint.
 */
/** Turf stripes: percentages of --vault-accent-deep mixed into --bg (theater-css.ts paints with these). */
export const THEATER_TURF_MIX = Object.freeze({ a: 30, b: 37 });
/** The keyline (halo) around every team mark on the field and timeline: --lava-text mixed into --bg at this %. */
export const THEATER_KEYLINE_MIX = 85;

export const TOKEN_RGB = Object.freeze({
  bg: Object.freeze([10, 7, 5]), accentDeep: Object.freeze([46, 160, 102]),
  lavaText: Object.freeze([245, 247, 246]), cardElevated: Object.freeze([24, 35, 29]),
});

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mixRgb = (a, b, pct) => a.map((v, i) => v * pct / 100 + b[i] * (1 - pct / 100));

/** Hex of each turf stripe for a THEATER_TURF_MIX ({a, b} percentages of --vault-accent-deep into --bg). */
export function turfHexes(mix) {
  return [mix.a, mix.b].map((p) => toHex(mixRgb(TOKEN_RGB.accentDeep, TOKEN_RGB.bg, p)));
}

/** Every surface a team mark is painted on: both turf stripes, then the timeline panel (--st-panel-2), then the page. */
export const fieldSurfaces = () => Object.freeze({
  turf: turfHexes(THEATER_TURF_MIX), panel: toHex(TOKEN_RGB.cardElevated), page: toHex(TOKEN_RGB.bg),
});

/** Hex of the keyline (--st-keyline in theater-css.ts). */
export const keylineHex = () => toHex(mixRgb(TOKEN_RGB.lavaText, TOKEN_RGB.bg, THEATER_KEYLINE_MIX));
