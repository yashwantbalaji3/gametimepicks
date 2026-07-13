/**
 * Launch-blocker pins: internal surfaces (/ops, /preview/june20) must NOT ship in the public export,
 * and no UFC "-internal-" artifact may sit on the public surface. Guards the exclusion mechanism
 * (source), the prune (build), the built output (out/), and the UFC file move.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("internal routes are guarded → 404 (no data) in the production export", () => {
  const guard = read("src/lib/internal-route-guard.ts");
  assert.match(guard, /notFound\(\)/, "guard calls notFound()");
  assert.match(guard, /NODE_ENV === "production"/, "fires in production builds");
  for (const p of ["src/app/ops/page.tsx", "src/app/preview/june20/page.tsx"]) {
    assert.match(read(p), /guardInternalRoute\(\)/, `${p} calls the guard`);
  }
});

test("the build prunes internal routes from out/ (chained into npm build)", () => {
  const prune = read("scripts/prune-internal-routes.mjs");
  assert.match(prune, /"ops"/, "prunes ops");
  assert.match(prune, /"preview"/, "prunes preview");
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.build, /prune-internal-routes/, "build script chains the prune");
});

test("if a build exists, out/ contains NO internal route", () => {
  const out = path.join(APP, "out");
  if (!fs.existsSync(out)) return; // no build in this run — the build-time gate covers it
  assert.ok(!fs.existsSync(path.join(out, "ops")), "out/ops must be absent");
  assert.ok(!fs.existsSync(path.join(out, "preview", "june20")), "out/preview/june20 must be absent");
});

test("no UFC -internal- artifact on the public surface", () => {
  const ufcDir = path.join(APP, "public/data/ufc");
  const leaked = fs.existsSync(ufcDir) ? fs.readdirSync(ufcDir).filter((f) => f.includes("-internal-")) : [];
  assert.deepEqual(leaked, [], "no *-internal-*.json under public/data/ufc");
  // If a build exists, the public surface in out/ is likewise clean.
  const outUfc = path.join(APP, "out/data/ufc");
  if (fs.existsSync(outUfc)) {
    const outLeaked = fs.readdirSync(outUfc).filter((f) => f.includes("-internal-"));
    assert.deepEqual(outLeaked, [], "no *-internal-*.json in out/data/ufc");
  }
});
