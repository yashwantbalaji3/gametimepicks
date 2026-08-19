/**
 * P185 · RELEASE I — the console's UI/UX figures are DERIVED, never typed.
 *
 * The charter asks the operator console to carry "the UI/UX route matrix, drift counts, migration
 * progress and screenshots/evidence references … so an operator can understand remaining work
 * without reading code or handoff prose."
 *
 * A hand-typed percentage on an operator console is worse than no console: it is the same drift the
 * audit exists to measure, wearing a dashboard's clothes. So every figure comes from the committed
 * artifact, and this fails if one is ever written into the page instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildUiuxEvidence, readUiuxBaseline, P184_BASELINE } from "./uiux-evidence.mjs";

const APP = process.cwd();
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("every rendered figure comes from the artifact, not the page", () => {
  const page = strip(fs.readFileSync(path.join(APP, "src/app/launch/page.tsx"), "utf8"));
  const section = page.slice(page.indexOf('aria-labelledby="uiux"'), page.indexOf('aria-labelledby="registry"'));
  assert.ok(section.length > 400, "the UI/UX section must exist on the console");
  // The only literal numbers allowed are style values; no audit figure may be inlined.
  for (const n of ["1616", "1276", "1172", "764", "408", "176", "143"]) {
    assert.ok(!section.includes(n), `${n} is typed into the console — it must come from the artifact`);
  }
  assert.match(section, /uiux\.literals\.now/, "the current count is read");
  assert.match(section, /uiux\.classes\.map/, "the class split is read");
  assert.match(section, /uiux\.routeMatrix\./, "the route matrix is read");
});

test("the baseline origin is the only hard-coded measurement, and it is historical", () => {
  /* A delta needs a fixed origin. That origin is a fact about 2026-08-18, not a current claim, so
     it is pinned with its commit — and nothing else is. */
  assert.equal(P184_BASELINE.rawColorLiterals, 1616);
  assert.equal(P184_BASELINE.commit, "eeff42d61");
  const mod = strip(fs.readFileSync(path.join(APP, "src/lib/launch/uiux-evidence.mjs"), "utf8"));
  const afterBaseline = mod.slice(mod.indexOf("export function buildUiuxEvidence"));
  assert.ok(!/\b(1276|1172|764|408|176)\b/.test(afterBaseline),
    "a current figure is hard-coded in the builder — it must be read from the artifact");
});

test("a missing artifact renders no figures rather than zeros", () => {
  /* Zero is a claim. Absent evidence is a different claim, and the console must make the second. */
  const empty = buildUiuxEvidence(null);
  assert.equal(empty.available, false);
  assert.match(empty.note, /missing or unreadable/);
  assert.equal(empty.literals.now, null, "an absent count is null, never 0");
  assert.deepEqual(empty.classes, []);
  assert.deepEqual(empty.queue, []);
});

test("the shape is identical whether or not the artifact exists", () => {
  /* A union return makes every consumer narrow before reading, and the first one that forgets is
     how a dashboard starts rendering "undefined". */
  const withArtifact = buildUiuxEvidence(readUiuxBaseline());
  const without = buildUiuxEvidence(null);
  assert.deepEqual(Object.keys(withArtifact).sort(), Object.keys(without).sort());
  assert.deepEqual(Object.keys(withArtifact.literals).sort(), Object.keys(without.literals).sort());
  assert.deepEqual(Object.keys(withArtifact.routeMatrix).sort(), Object.keys(without.routeMatrix).sort());
});

test("the section is inside the Evidence group of the IA contract", () => {
  const ia = fs.readFileSync(path.join(APP, "src/lib/launch/ia-contract.mjs"), "utf8");
  const evidence = ia.slice(ia.indexOf('group: "Evidence"'));
  assert.match(evidence.slice(0, evidence.indexOf("},")), /"uiux"/,
    "the nav renders FROM the contract, so an unlisted anchor is unreachable from the menu");
});

test("this evidence stays PRIVATE", () => {
  /* It inventories internal routes. /launch is host-protected, noindex/no-store and pruned from the
     public export — the artifact it reads lives under data/internal/ for the same reason. */
  const out = path.join(APP, "out", "launch");
  assert.ok(!fs.existsSync(out), "/launch must not be in the public export");
  const mod = fs.readFileSync(path.join(APP, "src/lib/launch/uiux-evidence.mjs"), "utf8");
  assert.match(mod, /data", "internal", "uiux"/, "the artifact is read from data/internal/");
});
