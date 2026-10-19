/**
 * NBA SIMULATION THEATER · COURT GEOMETRY. Pure: no DOM, no clock, no randomness.
 *
 * Regulation NBA court, in FEET, as an SVG user space:
 *   x: 0..94 along the length (baseline to baseline). Fixed orientation: the AWAY team's end is on the LEFT and the HOME
 *      team's on the RIGHT, in the same order as the scoreboard (AWAY | HOME). The court carries no data, so it never flips
 *      (teams changing ends at halftime is not modelled and not shown).
 *   y: 0..50 across the width (sideline to sideline).
 * A margin of MARGIN ft of apron surrounds the boundary, so the viewBox is (−MARGIN, −MARGIN, 94 + 2·MARGIN, 50 + 2·MARGIN).
 *
 * Dimensions (NBA rule 1): hoop centre 5.25 ft from the baseline (backboard plane at 4 ft, 18 in rim → 0.75 ft radius);
 * three-point line 23.75 ft from the hoop centre on the arc and 22 ft in the corners, the corner lines running parallel to
 * the sideline until they meet the arc; lane (paint) 16 ft wide and 19 ft deep (free-throw line 15 ft from the backboard
 * plane); free-throw circle 6 ft radius (the half toward the basket dashed); restricted area a 4 ft arc from the hoop
 * centre; centre circle 6 ft (inner circle 2 ft); backboard 6 ft wide.
 *
 * NOTHING here places a player, a ball or a shot: the simulation does not model them (nba-sim-v1 contract).
 */

export const COURT_LEN = 94;
export const COURT_WID = 50;
export const MARGIN = 3;
export const HOOP_X = 5.25;
export const RIM_R = 0.75;
export const BACKBOARD_X = 4;
export const BACKBOARD_HALF = 3;
export const THREE_ARC_R = 23.75;
export const THREE_CORNER = 22;
export const LANE_WID = 16;
export const LANE_LEN = 19;
export const FT_CIRCLE_R = 6;
export const RESTRICTED_R = 4;
export const CENTER_R = 6;
export const CENTER_INNER_R = 2;
export const VIEWBOX = Object.freeze([-MARGIN, -MARGIN, COURT_LEN + 2 * MARGIN, COURT_WID + 2 * MARGIN]);
/** Height / width of the whole drawing (apron included): the court box keeps this aspect ratio at every width. */
export const ASPECT = VIEWBOX[3] / VIEWBOX[2];

const MID_Y = COURT_WID / 2;
const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Distance along x from the hoop centre to where a corner line meets the arc: √(23.75² − 22²) ≈ 8.948 ft. */
export const CORNER_JOIN_DX = Math.sqrt(THREE_ARC_R ** 2 - THREE_CORNER ** 2);
/** Where the corner three-point line ends (ft from the baseline): ≈ 14.198 ft. */
export const CORNER_LINE_LEN = HOOP_X + CORNER_JOIN_DX;

/** Mirror a left-end x coordinate to the right end. */
export const mirrorX = (x) => COURT_LEN - x;

/**
 * Every line of ONE end, drawn for the LEFT (home) end; `side: "right"` mirrors it. All values in feet.
 * @param {"left"|"right"} side
 */
export function endGeometry(side = "left") {
  const m = side === "left" ? (x) => x : mirrorX;
  const dir = side === "left" ? 1 : -1; // +x into the court
  const hx = m(HOOP_X);
  const yTop = MID_Y - THREE_CORNER;
  const yBot = MID_Y + THREE_CORNER;
  const xJoin = m(CORNER_LINE_LEN);
  const sweepOut = side === "left" ? 1 : 0;
  // three-point line: corner (baseline → join), arc of radius 23.75 about the hoop, other corner (join → baseline)
  const three = `M${f(m(0))} ${f(yTop)}L${f(xJoin)} ${f(yTop)}A${f(THREE_ARC_R)} ${f(THREE_ARC_R)} 0 0 ${sweepOut} ${f(xJoin)} ${f(yBot)}L${f(m(0))} ${f(yBot)}`;
  const laneTop = MID_Y - LANE_WID / 2;
  const ftX = m(LANE_LEN);
  const lane = { x: Math.min(m(0), ftX), y: laneTop, w: LANE_LEN, h: LANE_WID };
  // free-throw circle: the half away from the basket solid, the half toward it dashed
  const ftOuter = `M${f(ftX)} ${f(MID_Y - FT_CIRCLE_R)}A${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 ${sweepOut} ${f(ftX)} ${f(MID_Y + FT_CIRCLE_R)}`;
  const ftInner = `M${f(ftX)} ${f(MID_Y - FT_CIRCLE_R)}A${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 ${1 - sweepOut} ${f(ftX)} ${f(MID_Y + FT_CIRCLE_R)}`;
  // restricted area: straight from the backboard plane to the hoop centre's x, then a 4 ft semicircle
  const bx = m(BACKBOARD_X);
  const restricted = `M${f(bx)} ${f(MID_Y - RESTRICTED_R)}L${f(hx)} ${f(MID_Y - RESTRICTED_R)}A${RESTRICTED_R} ${RESTRICTED_R} 0 0 ${sweepOut} ${f(hx)} ${f(MID_Y + RESTRICTED_R)}L${f(bx)} ${f(MID_Y + RESTRICTED_R)}`;
  const backboard = { x1: bx, y1: MID_Y - BACKBOARD_HALF, x2: bx, y2: MID_Y + BACKBOARD_HALF };
  const rim = { cx: hx, cy: MID_Y, r: RIM_R };
  const connector = { x1: bx, y1: MID_Y, x2: hx - dir * RIM_R, y2: MID_Y };
  // the team band: the apron behind this baseline (team colour treatment, carries the abbreviation)
  const band = { x: side === "left" ? -MARGIN : COURT_LEN, y: -MARGIN, w: MARGIN, h: COURT_WID + 2 * MARGIN };
  // the area inside the three-point line (a soft team tint)
  const zone = `${three}Z`;
  return { side, hoop: { x: hx, y: MID_Y }, three, zone, lane, ftOuter, ftInner, restricted, backboard, rim, connector, band, ftX };
}

/** The whole court: boundary, half-court line, centre circles, both ends. */
export function courtGeometry() {
  return Object.freeze({
    viewBox: VIEWBOX.join(" "),
    boundary: { x: 0, y: 0, w: COURT_LEN, h: COURT_WID },
    halfCourt: { x1: COURT_LEN / 2, y1: 0, x2: COURT_LEN / 2, y2: COURT_WID },
    center: { cx: COURT_LEN / 2, cy: MID_Y, r: CENTER_R, inner: CENTER_INNER_R },
    left: endGeometry("left"),
    right: endGeometry("right"),
  });
}

/** Distance helper for tests and probes. */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Parse the numbers of an SVG path (for tests): every coordinate pair after an M/L, and the end point of each A. */
export function pathPoints(d) {
  const out = [];
  const re = /([MLA])([^MLAZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const n = m[2].trim().split(/[\s,]+/).map(Number);
    if (m[1] === "A") out.push({ x: n[5], y: n[6], arc: { r: n[0] } });
    else out.push({ x: n[0], y: n[1] });
  }
  return out;
}
