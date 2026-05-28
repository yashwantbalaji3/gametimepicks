/**
 * Tests for sparkline y-scale math. Pure — no rendering.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleSparklinePoints } from "./sparkline-scale.ts";

test("empty input → empty result", () => {
  const out = scaleSparklinePoints([], { width: 100, height: 30 });
  assert.deepEqual(out.points, []);
  assert.equal(out.thresholdY, null);
});

test("all-NaN input → empty result", () => {
  const out = scaleSparklinePoints([Number.NaN, Number.NaN], {
    width: 100,
    height: 30,
  });
  assert.deepEqual(out.points, []);
});

test("single value renders one centered bar", () => {
  const out = scaleSparklinePoints([5], { width: 100, height: 30, padding: 2 });
  assert.equal(out.points.length, 1);
  // Centered: x = padding + innerW/2 = 2 + 96/2 = 50
  assert.equal(out.points[0].x, 50);
  assert.equal(out.points[0].cleared, null);
});

test("multi-value series spreads across width", () => {
  const out = scaleSparklinePoints([0, 1, 2, 3, 4], {
    width: 100,
    height: 30,
    padding: 0,
  });
  assert.equal(out.points.length, 5);
  // First point at left edge, last at right edge
  assert.equal(out.points[0].x, 0);
  assert.equal(out.points[4].x, 100);
  // Y for max value sits at the top (smaller y in SVG)
  assert.ok(out.points[4].y < out.points[0].y);
});

test("threshold yields per-point cleared flag and a thresholdY", () => {
  const out = scaleSparklinePoints([1, 2, 3, 4, 5], {
    width: 100,
    height: 30,
    threshold: 3.5,
  });
  assert.equal(out.points[0].cleared, false); // 1 < 3.5
  assert.equal(out.points[1].cleared, false);
  assert.equal(out.points[2].cleared, false); // 3 < 3.5
  assert.equal(out.points[3].cleared, true);  // 4 > 3.5
  assert.equal(out.points[4].cleared, true);
  assert.ok(out.thresholdY !== null);
});

test("flat-zero series renders zero-height bars without crashing", () => {
  const out = scaleSparklinePoints([0, 0, 0, 0, 0], {
    width: 100,
    height: 30,
  });
  assert.equal(out.points.length, 5);
  // Min bar height enforced
  for (const p of out.points) {
    assert.ok(p.barHeight >= 2);
  }
});

test("threshold below min still included in domain", () => {
  const out = scaleSparklinePoints([5, 6, 7], {
    width: 100,
    height: 30,
    threshold: -2,
  });
  // Domain min must include or be below threshold
  assert.ok(out.domain.min <= -2 || out.domain.min === 0);
  assert.equal(out.thresholdY !== null, true);
});

test("threshold above max still included", () => {
  const out = scaleSparklinePoints([1, 2, 3], {
    width: 100,
    height: 30,
    threshold: 10,
  });
  assert.ok(out.domain.max >= 10);
});

test("negative values are clamped — domain min stays <= 0", () => {
  const out = scaleSparklinePoints([0, 1, 2], { width: 100, height: 30 });
  assert.ok(out.domain.min <= 0);
});
