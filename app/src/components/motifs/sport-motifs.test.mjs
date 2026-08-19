/**
 * P185 · B4 — the sport motifs, guarded.
 *
 * Same contract as the shared layer, plus one rule specific to this file: a field diagram is
 * GEOMETRY, not data. None of these may take a score, a probability or a player — the moment a
 * motif renders a number it has to be labelled and behave like the probability arc instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const src = fs.readFileSync(path.join(APP, "src/components/motifs/sport-motifs.tsx"), "utf8");
const globals = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MOTIFS = ["MlbDiamond", "NflGridiron", "NbaCourt", "EplPitch", "UfcOctagon", "NhlRink"];

test("every sport the charter names has a motif", () => {
  for (const m of MOTIFS) assert.match(code, new RegExp(`export function ${m}\\b`), `${m} is missing`);
  assert.match(code, /SPORT_MOTIF/, "a hub should pick by sport key, not import six components");
});

test("no raw colour — each motif reads its own sport accent token", () => {
  const hits = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,/g)];
  assert.equal(hits.length, 0, `sport motifs carry raw colour: ${hits.map((h) => h[0]).join(", ")}`);
  for (const t of ["--sport-mlb", "--sport-nfl", "--sport-nba", "--sport-soccer", "--sport-ufc", "--sport-nhl"]) {
    assert.ok(code.includes(t), `no motif reads ${t}`);
    assert.match(globals, new RegExp(`${t}\\s*:`), `${t} is used but not declared`);
  }
});

test("a field diagram is geometry, not data", () => {
  /* The bright line this file exists on the correct side of. */
  /*
   * Scoped to the PROPS TYPE, which is the actual invariant. A first pass matched any identifier
   * and flagged `line(accent, pct)` — a local geometry helper, not a datum. A guard that fires on
   * its own file's internals teaches the next author to delete it.
   */
  const props = code.slice(code.indexOf("type MotifProps"), code.indexOf("};", code.indexOf("type MotifProps")));
  assert.doesNotMatch(props, /\b(score|probability|winPct|value|percent|prob)\b/i,
    `a sport motif must not accept a datum — that would make it an unlabelled chart. Props: ${props}`);
  assert.match(props, /className\?|opacity\?/, "props are presentation only");
  for (const m of MOTIFS) {
    const body = code.slice(code.indexOf(`export function ${m}`), code.indexOf(`export function ${m}`) + 900);
    assert.match(body, /DECOR/, `${m} must be aria-hidden decoration`);
  }
  assert.match(code, /pointerEvents: "none"/, "decoration must not intercept the pointer");
});

test("deterministic — no randomness, no clock", () => {
  assert.doesNotMatch(code, /Math\.random|Date\.now\(\)/,
    "every reader sees the same geometry, like every other artifact this product publishes");
});

test("no motif invents a timing", () => {
  /* These are static by design; if one ever animates it must name a role, not a duration. */
  for (const a of code.match(/animation:[^"`;]*/g) ?? []) {
    assert.doesNotMatch(a, /\b[0-9.]+m?s\b/, `a sport motif hard-codes a duration: ${a.trim().slice(0, 60)}`);
    assert.match(a, /var\(--motion-/, "animation must come from a motion role");
  }
});

test("NHL stays the plainest of the six", () => {
  /*
   * The charter asks for "restrained NHL/rink treatment" because the sport is off-season with no
   * live board. A motif richer than the product behind it is the visual polish this programme
   * spent nine releases removing, so this is measured rather than trusted.
   */
  const strokes = (m) => {
    const body = code.slice(code.indexOf(`export function ${m}`), code.indexOf(`export function ${m}`) + 1600);
    return (body.match(/stroke=/g) ?? []).length;
  };
  const nhl = strokes("NhlRink");
  for (const m of MOTIFS.filter((x) => x !== "NhlRink")) {
    assert.ok(nhl <= strokes(m), `NhlRink (${nhl}) must not be busier than ${m} (${strokes(m)})`);
  }
});
