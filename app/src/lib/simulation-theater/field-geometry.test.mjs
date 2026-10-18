/**
 * Simulation Theater V2 · field geometry, the overlay frame and the turf-safe accent rule (iteration 2).
 *
 * Run: npx tsx --test src/lib/simulation-theater/field-geometry.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  FIELD_LEN, MARGIN_X, THEATER_TURF_MIX, TOKEN_RGB, ballSize, fieldMap, numberSet, overlayFrame, turfHexes, turfSafeAccent,
} from "./field-geometry.mjs";
import { NFL_TEAM_COLORS, contrastRatio, theaterPalette } from "./nfl-team-colors.mjs";
import { FIXTURE_EVENT_IDS, loadTheater } from "./loader.mjs";
import { compiledFor, stateAtCompiled } from "./state-at.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

test("TOKEN_RGB mirrors globals.css exactly (--bg, --vault-accent-deep)", () => {
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const hex = (name) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)[1];
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  assert.deepEqual(TOKEN_RGB.bg, rgb(hex("bg")));
  assert.deepEqual(TOKEN_RGB.accentDeep, rgb(hex("vault-accent-deep")));
});

test("the mapping puts yard 0 and yard 120 inside the sideline margin and is linear", () => {
  const m = fieldMap(1252, 585);
  assert.ok(Math.abs(m.X(0) - MARGIN_X * 10) < 1e-9);
  assert.ok(Math.abs(m.X(FIELD_LEN) - (1252 - MARGIN_X * 10)) < 1e-9);
  assert.ok(Math.abs(m.X(60) - 626) < 1e-9);
  assert.ok(m.Y(0) > 0 && m.Y(1) < 585);
  assert.ok(ballSize(272).rx >= 8, "the ball stays visible at 320 px");
  assert.deepEqual(numberSet(272).map((n) => n[1]), ["30", "50", "30"]);
  assert.equal(numberSet(1000).length, 9);
});

test("overlayFrame is a pure function of the frame: equal t → equal overlay; ribbon and trail stay within recorded spots", () => {
  const t = loadTheater(REPO, FIXTURE_EVENT_IDS[0]);
  const sample = t.manifest.samples[0];
  const c = compiledFor(sample);
  const box = { W: 900, H: 420 };
  const m = fieldMap(box.W, box.H);
  for (let k = 0; k <= 400; k++) {
    const tt = (c.tEnd * k) / 400;
    const f = stateAtCompiled(sample, c, t.manifest.teams, tt);
    const a = overlayFrame(f, box);
    const b = overlayFrame(stateAtCompiled(sample, c, t.manifest.teams, tt), box);
    assert.deepEqual(a, b);
    const ev = sample.events[f.driveIdx];
    const sx = m.X(f.startFieldX);
    const ex = m.X(ev.offense === "home" ? 110 - ev.fieldEnd : 10 + ev.fieldEnd);
    const lo = Math.min(sx, ex) - 0.02;
    const hi = Math.max(sx, ex) + 0.02;
    assert.ok(a.ballX >= lo && a.ballX <= hi, `ball between the recorded spots at t=${tt}`);
    if (a.ribbon) assert.ok(a.ribbon.x >= lo && a.ribbon.x + a.ribbon.w <= hi + 0.02, "ribbon between the recorded spots");
    if (a.trail) assert.ok(a.trail.x >= lo && a.trail.x + a.trail.w <= hi + 0.02, "trail never extends past the start spot");
  }
});

test("dev preview: every accent reaches ≥3:1 on both turf stripes (derived toward white where needed); neutral is untouched", () => {
  const turf = turfHexes(THEATER_TURF_MIX);
  const derived = [];
  const teams = Object.values(NFL_TEAM_COLORS);
  for (const h of teams) for (const a of teams) {
    if (h === a) continue;
    const p = theaterPalette(h.abbr, a.abbr, { previewUnvalidated: true });
    for (const side of ["home", "away"]) {
      const acc = p[side].accent;
      assert.ok(Math.min(...turf.map((x) => contrastRatio(acc, x))) >= 3, `${side} ${acc}`);
      if (p[side].accentBase) derived.push(`${p[side].accentBase}`);
    }
  }
  const uniq = [...new Set(derived)];
  console.log(`# theater: accents derived for turf contrast: ${uniq.length} (${uniq.join(", ")})`);
  const r = turfSafeAccent("#0076B6", turf, contrastRatio);
  assert.equal(r.base, "#0076B6");
  assert.ok(r.ratio >= 3);
  assert.equal(theaterPalette("SF", "WSH").mode, "neutral");
  assert.equal(theaterPalette("SF", "WSH").home.accentBase, undefined);
});
