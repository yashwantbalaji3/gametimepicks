/**
 * NBA theater · court geometry: regulation dimensions, continuity of the three-point line, mirror symmetry.
 * Run: npx tsx --test src/lib/simulation-theater/nba/court-geometry.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ASPECT, CENTER_R, CORNER_LINE_LEN, COURT_LEN, COURT_WID, FT_CIRCLE_R, HOOP_X, LANE_LEN, LANE_WID, RESTRICTED_R, THREE_ARC_R, THREE_CORNER,
  VIEWBOX, courtGeometry, dist, endGeometry, mirrorX, pathPoints,
} from "./court-geometry.mjs";

const near = (a, b, eps = 0.002, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);

test("regulation constants: 94 × 50 ft, hoop 5.25 ft in, arc 23.75 ft, corners 22 ft, lane 16 × 19 ft, circles 6 ft, restricted 4 ft", () => {
  assert.equal(COURT_LEN, 94);
  assert.equal(COURT_WID, 50);
  assert.equal(HOOP_X, 5.25);
  assert.equal(THREE_ARC_R, 23.75);
  assert.equal(THREE_CORNER, 22);
  assert.equal(LANE_WID, 16);
  assert.equal(LANE_LEN, 19);
  assert.equal(FT_CIRCLE_R, 6);
  assert.equal(CENTER_R, 6);
  assert.equal(RESTRICTED_R, 4);
  near(CORNER_LINE_LEN, 5.25 + Math.sqrt(23.75 ** 2 - 22 ** 2), 1e-9);
  near(CORNER_LINE_LEN, 14.198, 0.001);
  assert.deepEqual(VIEWBOX.slice(2), [100, 56]);
  near(ASPECT, 0.56, 1e-9);
});

test("three-point line: corners run 22 ft from the hoop centre, join the arc continuously, apex 23.75 ft out", () => {
  for (const side of ["left", "right"]) {
    const e = endGeometry(side);
    const pts = pathPoints(e.three);
    assert.equal(pts.length, 4, side);
    const [c0, join1, join2, c3] = pts;
    // corners start on the baseline, 3 ft from each sideline (= 22 ft from the hoop's y)
    near(c0.x, side === "left" ? 0 : 94, 1e-9, side);
    near(Math.abs(c0.y - e.hoop.y), 22, 1e-9, side);
    near(Math.abs(c3.y - e.hoop.y), 22, 1e-9, side);
    // both join points lie on the 23.75 ft circle (continuity) at the corner line's y
    near(dist(join1, e.hoop), 23.75, 0.002, `${side} join1`);
    near(dist(join2, e.hoop), 23.75, 0.002, `${side} join2`);
    assert.equal(join2.arc.r, 23.75);
    // the apex (on the hoop's y) is 23.75 ft from the hoop: x = 5.25 + 23.75 = 29 ft from the baseline
    const apexX = side === "left" ? e.hoop.x + 23.75 : e.hoop.x - 23.75;
    near(Math.abs(apexX - (side === "left" ? 0 : 94)), 29, 1e-9, side);
  }
});

test("paint, free-throw circle, restricted area, rim and backboard are where the rules put them", () => {
  const e = endGeometry("left");
  assert.deepEqual([e.lane.x, e.lane.y, e.lane.w, e.lane.h], [0, 17, 19, 16]);
  assert.equal(e.ftX, 19);
  const ft = pathPoints(e.ftOuter);
  near(ft[0].y, 19, 1e-9); near(ft[1].y, 31, 1e-9); assert.equal(ft[1].arc.r, 6);
  const ra = pathPoints(e.restricted);
  near(ra[0].x, 4, 1e-9); near(ra[1].x, 5.25, 1e-9); near(dist(ra[2], e.hoop), 4, 1e-9);
  assert.deepEqual([e.rim.cx, e.rim.cy, e.rim.r], [5.25, 25, 0.75]);
  assert.deepEqual([e.backboard.x1, e.backboard.y2 - e.backboard.y1], [4, 6]);
  // the free-throw line is 15 ft from the backboard plane
  near(e.ftX - e.backboard.x1, 15, 1e-9);
});

test("the two ends are exact mirror images; the half-court line and centre circle sit at 47 ft", () => {
  const g = courtGeometry();
  const L = g.left;
  const R = g.right;
  near(R.hoop.x, mirrorX(L.hoop.x), 1e-9);
  near(R.lane.x, 94 - 19, 1e-9);
  const lp = pathPoints(L.three);
  const rp = pathPoints(R.three);
  lp.forEach((p, i) => { near(rp[i].x, mirrorX(p.x), 0.002); near(rp[i].y, p.y, 1e-9); });
  assert.equal(g.halfCourt.x1, 47);
  assert.equal(g.center.cx, 47);
  assert.equal(g.center.cy, 25);
  // bands sit outside the boundary, behind each baseline
  assert.ok(L.band.x + L.band.w <= 0 && R.band.x >= 94);
});

test("pure and deterministic: identical output on every call", () => {
  assert.deepEqual(JSON.stringify(courtGeometry()), JSON.stringify(courtGeometry()));
});
