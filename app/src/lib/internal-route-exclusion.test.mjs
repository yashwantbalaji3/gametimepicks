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

/**
 * THE DEPLOY TRIGGER AND THE EXPORT MUST AGREE (P0 · 2026-09-24).
 *
 * `scripts/vercel-ignore-build.sh` now declares a NON_BUILD_INPUTS array: paths inside app/ whose
 * change cannot alter one byte the public site serves, because the prune deletes them from the
 * export. Skipping a build for them is only safe while that stays true, and "stays true" is not a
 * thing a comment can promise — so this reads the array out of the script and checks BOTH
 * directions against a real build:
 *
 *   producer ⇒ reader   every prefix the script skips is genuinely absent from out/
 *   reader ⇒ producer   every prefix the script skips genuinely EXISTS and is non-empty in source
 *
 * Without the second direction the rule could be renamed into a no-op (`app/public/data/opsX/`)
 * and this test would still pass while the script silently stopped skipping anything. Without the
 * first, someone could publish /data/ops and the deploy trigger would start skipping builds that
 * change the live site.
 */
test("every NON_BUILD_INPUT prefix is real in source and absent from the built export", () => {
  const sh = read("scripts/vercel-ignore-build.sh");
  const block = /# GTP-NON-BUILD-INPUTS-BEGIN\s*\nNON_BUILD_INPUTS=\(([\s\S]*?)\)\s*\n# GTP-NON-BUILD-INPUTS-END/.exec(sh);
  assert.ok(block, "vercel-ignore-build.sh no longer declares a parseable NON_BUILD_INPUTS block — this guard would scan nothing");

  const prefixes = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(prefixes.length > 0, "NON_BUILD_INPUTS is empty — either restore it or delete this guard, do not leave it vacuous");

  const out = path.join(APP, "out");
  assert.ok(fs.existsSync(out), "this guard runs in the post-build phase and needs a built export at app/out/");

  for (const prefix of prefixes) {
    assert.ok(prefix.startsWith("app/"), `${prefix} is excluded from the app/ pathspec, so it must live under app/`);
    const rel = prefix.slice("app/".length).replace(/\/$/, "");

    // reader ⇒ producer: the rule must skip something that actually exists, or it is a no-op.
    const src = path.join(APP, rel);
    assert.ok(fs.existsSync(src), `${prefix} is skipped by the deploy trigger but does not exist in source — the rule is a no-op`);
    const files = fs.readdirSync(src, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
    assert.ok(files.length > 0, `${prefix} is skipped by the deploy trigger but is empty in source — the rule is a no-op`);

    // producer ⇒ reader: nothing under it may reach the export, or skipping its builds serves stale bytes.
    const exported = path.join(out, rel.replace(/^public\//, ""));
    assert.ok(!fs.existsSync(exported), `${prefix} reaches the export at ${path.relative(APP, exported)} — the deploy trigger must stop skipping builds for it`);
  }
});
