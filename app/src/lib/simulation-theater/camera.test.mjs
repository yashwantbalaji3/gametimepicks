/**
 * Simulation Theater V2 · broadcast camera (iteration 7; spec §2.4 camera clause, S8). The camera is a pure function of
 * (sample, compiled timeline, t, mode): bounded, never clipping what the current state needs, identical across seek and
 * reload, static under reduced motion and in "full field" mode, and never faster than one field width per second.
 *
 * Run: npx tsx --test src/lib/simulation-theater/camera.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { readShadowReceipts } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { compileTimeline } from "./timeline.mjs";
import { stateAtCompiled } from "./state-at.mjs";
import { CAMERA_POLICY, REVIEW_ZOOM_CAPS, cameraAt, cameraScreenX, cameraTransform, zoomCapFor } from "./camera.mjs";
import { MARGIN_X, MARGIN_Y, FIELD_WID, TOTAL_LEN, TOTAL_WID, ballSize } from "./field-geometry.mjs";
import { FIXTURE_EVENT_IDS } from "./loader.mjs";

const REPO = path.resolve(process.cwd(), "..");
const MANIFESTS = readShadowReceipts(REPO).map((e) => adaptReceipt(e.receipt, { file: e.file }).manifest);
const SAMPLES = MANIFESTS.flatMap((m) => m.samples.filter((s) => s.validation.ok).map((s) => ({ m, s, c: compileTimeline(s) })));
const FIXTURES = SAMPLES.filter(({ m }) => FIXTURE_EVENT_IDS.includes(m.eventId));
const EPS = 1e-6;

/**
 * What the current state needs on screen, as TOTAL-yard x intervals (and the ball's y): the ball with its glow,
 * chevrons and possession tag (sized for the narrowest box that draws the tag, 360 px), the recorded start spot, the
 * recorded end spot once reached, and the lit end zone during a score.
 */
function required(st, W = 360) {
  const yd = TOTAL_LEN / W; // yards per px at zoom 1 (the camera only enlarges, so this is the worst case)
  const { rx } = ballSize(W);
  // the widest of: the glow (2.3 rx), the chevrons (rx + 5 + 1.9 ry) and half the widest possession tag (a pennant with a
  // 3-letter abbreviation: 3 × 7.4 + 14 + 8 + 7 = 51.2 px), plus 2 px
  const halfBall = (Math.max(rx * 2.3, rx + 5 + 1.9 * rx * 0.62, 51.2 / 2) + 2) * yd;
  const need = [];
  if (st.ballOpacity > 0) need.push([st.ballFieldX + MARGIN_X - halfBall, st.ballFieldX + MARGIN_X + halfBall]);
  need.push([st.startFieldX + MARGIN_X, st.startFieldX + MARGIN_X]);
  if (st.ribbon && ["RESULT", "TRANSITION", "BREAK", "FINAL"].includes(st.phase)) need.push([st.ribbon.toX + MARGIN_X, st.ribbon.toX + MARGIN_X]);
  if (st.flash) need.push(st.flash.side === "home" ? [110 + MARGIN_X, 120 + MARGIN_X] : [MARGIN_X, 10 + MARGIN_X]);
  return need.map(([a, b]) => [Math.max(0, a), Math.min(TOTAL_LEN, b)]);
}

test("bounded: zoom in [1, maxZoom], the window inside the painted frame, at every 8 ms of every representative run", () => {
  let n = 0;
  for (const { s, c } of SAMPLES) {
    for (let t = 0; t <= c.tEnd; t += 8) {
      const cam = cameraAt(s, c, t);
      n++;
      assert.ok(cam.z >= 1 - EPS && cam.z <= CAMERA_POLICY.maxZoom + EPS, `${s.receiptId} t=${t} z=${cam.z}`);
      assert.ok(cam.x0 >= -EPS && cam.x1 <= TOTAL_LEN + EPS && cam.y0 >= -EPS && cam.y1 <= TOTAL_WID + EPS, `${s.receiptId} t=${t} window`);
      assert.ok(Math.abs((cam.x1 - cam.x0) / (cam.y1 - cam.y0) - TOTAL_LEN / TOTAL_WID) < 1e-3, "uniform scale: the aspect never changes");
    }
  }
  assert.ok(CAMERA_POLICY.maxZoom <= 1.35, "spec §2.4 caps the camera at 1.35×");
  console.log(`# camera bounded over ${n.toLocaleString("en-US")} frames of ${SAMPLES.length} runs`);
});

test("never clips what the state needs: ball (with tag), recorded start and end spots, the lit end zone; full field at the final frame", () => {
  let checked = 0;
  for (const { m, s, c } of SAMPLES) {
    const step = FIXTURES.some((f) => f.s === s) ? 1 : 8;
    for (let t = 0; t <= c.tEnd; t += step) {
      const st = stateAtCompiled(s, c, m.teams, t);
      const cam = cameraAt(s, c, t);
      for (const [a, b] of required(st)) {
        assert.ok(a >= cam.x0 - 1e-3 && b <= cam.x1 + 1e-3, `${s.receiptId} #${s.runIndex} t=${t} ${st.phase} needs [${a.toFixed(2)}, ${b.toFixed(2)}], sees [${cam.x0}, ${cam.x1}]`);
      }
      const laneY = MARGIN_Y + st.lane * FIELD_WID;
      assert.ok(laneY - 6 >= cam.y0 && laneY + 3 <= cam.y1, `${s.receiptId} t=${t}: the ball's lane and its tag stay in frame`);
      checked++;
    }
    const fin = cameraAt(s, c, c.tEnd);
    assert.equal(fin.z, 1, "the final frame is the full field");
  }
  console.log(`# camera containment checked on ${checked.toLocaleString("en-US")} frames`);
});

test("speed: the window's edges never move faster than one field width (120 yd) per second of playback", () => {
  let worst = 0;
  for (const { s, c } of SAMPLES) {
    const step = 2;
    let prev = cameraAt(s, c, 0);
    for (let t = step; t <= c.tEnd; t += step) {
      const cam = cameraAt(s, c, t);
      const v = Math.max(Math.abs(cam.x0 - prev.x0), Math.abs(cam.x1 - prev.x1), Math.abs(cam.y0 - prev.y0), Math.abs(cam.y1 - prev.y1)) / (step / 1000);
      worst = Math.max(worst, v);
      assert.ok(v <= CAMERA_POLICY.maxSpeedYdPerS + 1e-6, `${s.receiptId} #${s.runIndex} t=${t}: ${v.toFixed(1)} yd/s`);
      prev = cam;
    }
  }
  console.log(`# fastest camera edge: ${worst.toFixed(1)} yd/s (limit ${CAMERA_POLICY.maxSpeedYdPerS})`);
});

test("score holds: the camera does not move during any RESULT; it is establishing (full field) at every kickoff after a score, halftime and OT", () => {
  for (const { s, c } of SAMPLES) {
    for (const kf of c.keyframes) {
      if (kf.phase === "RESULT") {
        const a = cameraAt(s, c, kf.t0);
        const b = cameraAt(s, c, kf.t0 + kf.dur - 1);
        assert.deepEqual({ ...a, shot: "" }, { ...b, shot: "" }, `${s.receiptId} drive ${kf.driveIdx} RESULT moved`);
      }
      if (kf.phase === "BREAK") assert.equal(cameraAt(s, c, kf.t0 + kf.dur - 1).z, 1, `${kf.breakKind} returns to the full field`);
    }
    for (const span of c.driveSpans) {
      const i = span.driveIdx;
      const kickoff = i === 0 || s.events[i - 1].scoring;
      if (kickoff) assert.equal(cameraAt(s, c, span.startT + 1).shot, "establishing", `${s.receiptId} drive ${i} opens wide`);
    }
  }
});

test("pure and deterministic: equal t gives an identical camera whatever the path (forward, backward, fresh compile = reload)", () => {
  for (const { s, c } of FIXTURES) {
    const ts = Array.from({ length: 300 }, (_, k) => Math.round((k * c.tEnd) / 299));
    const fwd = ts.map((t) => cameraAt(s, c, t));
    const back = [...ts].reverse().map((t) => cameraAt(s, c, t)).reverse();
    const fresh = compileTimeline(JSON.parse(JSON.stringify(s)));
    const reload = ts.map((t) => cameraAt(JSON.parse(JSON.stringify(s)), fresh, t));
    assert.deepEqual(back, fwd);
    assert.deepEqual(reload, fwd);
    // the CSS transform is a pure function of the camera and the box
    for (const cam of fwd.slice(0, 40)) assert.deepEqual(cameraTransform(cam, 1200, 561), cameraTransform({ ...cam }, 1200, 561));
  }
});

test("follow mode actually follows: zoomed in mid-drive and leaning toward the ball", () => {
  const ref = FIXTURES.find(({ s }) => s.runIndex === 428) ?? FIXTURES[0];
  const { s, c } = ref;
  const cam = cameraAt(s, c, 22900); // run #428, drive 7 PROGRESS (iteration 3 walkthrough)
  assert.ok(cam.z > 1.05, `mid-drive zoom ${cam.z}`);
  assert.equal(cam.shot, "follow");
  const tf = cameraTransform(cam, 1200, 561);
  assert.notEqual(tf.css, "none");
  // a TOTAL-yard x maps to the screen consistently with the transform
  const x = (cam.x0 + cam.x1) / 2;
  assert.ok(Math.abs(cameraScreenX(cam, 1200, x) - 600) < 0.5);
});

test("reduced motion and 'full field' mode: a static, fully framed field at every t (no transform)", () => {
  for (const { s } of FIXTURES) {
    const reduced = compileTimeline(s, { reducedMotion: true });
    const normal = compileTimeline(s);
    for (let t = 0; t <= normal.tEnd; t += 50) {
      for (const cam of [cameraAt(s, reduced, t), cameraAt(s, normal, t, { mode: "full" }), cameraAt(s, normal, t, { reducedMotion: true })]) {
        assert.deepEqual([cam.z, cam.x0, cam.x1, cam.y0, cam.y1], [1, 0, TOTAL_LEN, 0, TOTAL_WID].map((v) => Math.round(v * 10000) / 10000));
        assert.equal(cameraTransform(cam, 1200, 561).css, "none");
      }
    }
  }
});

// ── iteration 8: the dev-only 1.6× review variant ─────────────────────────────────────────────────────────────────
test("review cap: only the listed variant is honoured; the default (and every other request) is exactly the spec's 1.35×", () => {
  assert.equal(CAMERA_POLICY.maxZoom, 1.35, "the default stays the validated spec cap");
  assert.deepEqual([...REVIEW_ZOOM_CAPS], [1.6]);
  for (const bad of [undefined, null, 0, 1, 1.35, 1.5, 1.61, 2, 10, "1.6", Number.NaN, Infinity]) assert.equal(zoomCapFor(bad), 1.35, String(bad));
  assert.equal(zoomCapFor(1.6), 1.6);
  const { s, c } = FIXTURES.find(({ s }) => s.runIndex === 428) ?? FIXTURES[0];
  for (let t = 0; t <= c.tEnd; t += 25) {
    assert.deepEqual(cameraAt(s, c, t, { maxZoom: 1.35 }), cameraAt(s, c, t), `t=${t}: an explicit 1.35 equals the default`);
    assert.deepEqual(cameraAt(s, c, t, { maxZoom: 7 }), cameraAt(s, c, t), `t=${t}: an unlisted cap falls back to the default`);
  }
});

test("review cap 1.6×: bounded, deterministic, and it still never clips the ball, the recorded spots or the lit end zone", () => {
  let n = 0;
  let deeper = 0;
  let laneClips = 0;
  for (const { m, s, c } of SAMPLES) {
    const step = FIXTURES.some((f) => f.s === s) ? 4 : 40;
    for (let t = 0; t <= c.tEnd; t += step) {
      const cam = cameraAt(s, c, t, { maxZoom: 1.6 });
      assert.ok(cam.z >= 1 - EPS && cam.z <= 1.6 + EPS, `${s.receiptId} t=${t} z=${cam.z}`);
      assert.ok(cam.x0 >= -EPS && cam.x1 <= TOTAL_LEN + EPS && cam.y0 >= -EPS && cam.y1 <= TOTAL_WID + EPS);
      const st = stateAtCompiled(s, c, m.teams, t);
      for (const [a, b] of required(st)) assert.ok(a >= cam.x0 - 1e-3 && b <= cam.x1 + 1e-3, `${s.receiptId} #${s.runIndex} t=${t} ${st.phase} 1.6× clips [${a.toFixed(2)}, ${b.toFixed(2)}]`);
      // FINDING (iteration 8): at 1.6× the top of the possession tag can leave the frame for a few frames of a hand-off
      // while the ball fades out (TRANSITION); 1.35× never does. Counted, and held to "never while the ball is ≥ 50 % visible".
      const laneY = MARGIN_Y + st.lane * FIELD_WID;
      if (!(laneY - 6 >= cam.y0 && laneY + 3 <= cam.y1)) {
        laneClips++;
        assert.ok(st.phase === "TRANSITION" && st.ballOpacity < 0.5, `${s.receiptId} t=${t} ${st.phase} opacity ${st.ballOpacity}: 1.6× clips the ball's lane`);
      }
      if (cam.z > 1.35 + EPS) deeper++;
      n++;
    }
    assert.equal(cameraAt(s, c, c.tEnd, { maxZoom: 1.6 }).z, 1);
  }
  const { s, c } = FIXTURES[0];
  assert.deepEqual(cameraAt(s, c, 22900, { maxZoom: 1.6 }), cameraAt(JSON.parse(JSON.stringify(s)), compileTimeline(s), 22900, { maxZoom: 1.6 }));
  console.log(`# 1.6× review cap: ${n.toLocaleString("en-US")} frames, ${((100 * deeper) / n).toFixed(1)}% of them zoomed past 1.35×; spots, ball and end zone never clipped; the fading ball's tag clipped at the top in ${laneClips} frames`);
});
