/**
 * P185 · B4 — the shared motifs, guarded.
 *
 * Decoration is exactly where hardcoded colour and invented timings creep back in: it feels
 * exempt from the system because "it is only a flourish". These assert it is not exempt, and that
 * the one motif carrying real data behaves like data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MOTION_ROLES } from "../../lib/uiux/motion-roles.mjs";

const APP = process.cwd();
const src = fs.readFileSync(path.join(APP, "src/components/motifs/shared-motifs.tsx"), "utf8");
const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const code = strip(src);

test("all five motifs the charter names exist", () => {
  for (const m of ["StadiumLights", "ScoreRibbon", "ProbabilityArc", "NoiseTexture", "DataGridDepth"]) {
    assert.match(code, new RegExp(`export function ${m}\\b`), `${m} is missing`);
  }
});

test("no raw colour survives in decoration", () => {
  /* The ratchet would catch this repo-wide; this catches it at the file that is most tempted. */
  const hits = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,/g)];
  assert.equal(hits.length, 0, `motifs carry ${hits.length} raw colour literal(s): ${hits.map((h) => h[0]).join(", ")}`);
  assert.match(code, /var\(--vault-accent\)/, "motifs consume the semantic hue tokens");
});

test("no motif invents its own timing — every animation names a role", () => {
  const roles = new Set(MOTION_ROLES.map((r) => r.role));
  const used = [...code.matchAll(/--motion-([a-z-]+)-duration/g)].map((m) => m[1]);
  assert.ok(used.length > 0, "motifs must drive animation from the role tokens");
  for (const u of used) assert.ok(roles.has(u), `"${u}" is not a declared motion role`);
  /* A bare ms/s literal inside an animation shorthand is the drift this replaces. */
  for (const a of code.match(/animation:[^"`;]*/g) ?? []) {
    assert.doesNotMatch(a, /\b[0-9.]+m?s\b/, `a motif hard-codes a duration: ${a.trim().slice(0, 70)}`);
  }
});

test("decoration is hidden from assistive tech and never eats a pointer", () => {
  for (const m of ["StadiumLights", "NoiseTexture", "DataGridDepth"]) {
    const i = code.indexOf(`export function ${m}`);
    const body = code.slice(i, i + 1400);
    assert.ok(/DECORATION|aria-hidden/.test(body), `${m} must be aria-hidden`);
  }
  assert.match(code, /pointerEvents: "none"/, "decoration must not intercept the pointer");
});

test("ProbabilityArc is DATA, and says so", () => {
  const i = code.indexOf("export function ProbabilityArc");
  const body = code.slice(i, code.indexOf("function arcPath"));
  assert.doesNotMatch(body, /aria-hidden/, "the arc renders a real number — it is not decoration");
  assert.match(body, /role="img"/, "it needs a role");
  assert.match(body, /aria-label=/, "it needs an accessible label carrying the value");
});

test("absent is not zero — a null probability draws no fill", () => {
  /*
   * The distinction this whole programme kept finding. A zero-length arc reads as "0% chance"; the
   * honest statement for a missing value is "we do not have this".
   */
  const i = code.indexOf("export function ProbabilityArc");
  const body = code.slice(i, code.indexOf("function arcPath"));
  assert.match(body, /clamped != null \?/, "the fill is omitted entirely when there is no value");
  assert.match(body, /pct == null \? "—"/, "an absent value renders an em dash, never 0%");
  assert.match(body, /not available/, "the accessible label distinguishes absent from zero");
});

test("nothing implies a published artifact is being recomputed", () => {
  /* The charter bans fake reroll, jitter and cosmetic differentiation outright. */
  assert.doesNotMatch(code, /Math\.random|Date\.now\(\)/, "a motif must be deterministic");
  assert.match(code, /seed=\{7\}/, "the grain uses a fixed seed, so every reader sees the same texture");
  const kf = css.slice(css.indexOf("@keyframes gtp-motif-arc-draw"));
  assert.doesNotMatch(kf.slice(0, 200), /infinite/, "the arc draws once — repeated drawing implies resampling");
  assert.match(code, /gtp-motif-arc-draw var\(--motion-chart-draw-duration\)[^"]*both/,
    "the arc animation is one-shot (`both`), never looping");
});

test("the keyframes the motifs reference actually exist", () => {
  for (const k of ["gtp-motif-breathe", "gtp-motif-arc-draw"]) {
    assert.ok(css.includes(`@keyframes ${k}`), `${k} is referenced but not defined`);
  }
});
