/**
 * THE RACE THIS CLOSES, AND THE PROOF THAT CLOSING IT DID NOT BUY A VACUOUS PASS.
 *
 * `identity/integrity.test.mjs` and `research/row-lineage.test.mjs` write a `*.mutation-probe.*` sibling
 * into `src/`, spawn a child against it, and delete it. Fifteen other guards walk `src/` and read what
 * they enumerated, in parallel, so the file could vanish between the two calls and red the guard with an
 * ENOENT about a file nobody shipped.
 *
 * Every test below is written so that it FAILS if the fix is removed. Where a property could pass for the
 * wrong reason, the positive control is in the same test: the hand-rolled walker these replace is run over
 * the same tree and must disagree in exactly the expected way.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { TRANSIENT_SOURCE, isTransientSource, readSourceIfPresent, walkSourceFiles } from "./source-tree.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP = (n) => /\.(ts|tsx|mjs)$/.test(n);

/** The walker idiom this module replaces, verbatim, so "output unchanged" is measured and not asserted. */
const referenceWalk = (dir, keep, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next", "out"].includes(e.name)) referenceWalk(p, keep, acc); }
    else if (keep(e.name)) acc.push(p);
  }
  return acc;
};

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-source-tree-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

// ── 4 · NORMAL TRAVERSAL IS UNCHANGED ────────────────────────────────────────────────────────────────

test("4 · with no probe file present, the walk returns exactly what the hand-rolled walker returned", () => {
  const root = tree({
    "a.ts": "a", "b.tsx": "b", "sub/c.mjs": "c", "sub/deep/d.ts": "d",
    "skip.json": "x", "sub/e.css": "x",
    "node_modules/pkg/index.ts": "x", ".next/chunk.ts": "x", "out/page.ts": "x",
  });
  try {
    assert.deepEqual(walkSourceFiles(root, KEEP), referenceWalk(root, KEEP));
    assert.deepEqual(
      walkSourceFiles(root, KEEP).map((p) => path.relative(root, p)).sort(),
      ["a.ts", "b.tsx", "sub/c.mjs", "sub/deep/d.ts"].map((p) => p.split("/").join(path.sep)),
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("4 · a missing directory is empty, not a throw — the call sites that guarded with existsSync still can", () => {
  assert.deepEqual(walkSourceFiles(path.join(os.tmpdir(), "gtp-does-not-exist-" + Date.now()), KEEP), []);
});

// ── 1 · THE DISAPPEARING PROBE FILE DOES NOT RED THE GUARD ───────────────────────────────────────────

test("1 · the probe copy is not enumerated — and the walker it replaces DID enumerate it", () => {
  const root = tree({ "real.ts": "real", "real.mutation-probe.ts": "planted", "other.mutation-probe.mjs": "planted" });
  try {
    const seen = walkSourceFiles(root, KEEP).map((p) => path.basename(p));
    assert.deepEqual(seen, ["real.ts"]);
    // Positive control: without the fix the probe copies are in the list, so this test can fail.
    const before = referenceWalk(root, KEEP).map((p) => path.basename(p)).sort();
    assert.deepEqual(before, ["other.mutation-probe.mjs", "real.mutation-probe.ts", "real.ts"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("1 · a file that vanishes between enumeration and read returns null instead of throwing ENOENT", () => {
  const root = tree({ "a.ts": "a", "gone.ts": "gone" });
  try {
    const listed = referenceWalk(root, KEEP);           // enumerate first, exactly as a guard does
    fs.rmSync(path.join(root, "gone.ts"));              // …then the sibling suite deletes its probe
    const read = listed.map((f) => [path.basename(f), readSourceIfPresent(f)]);
    assert.deepEqual(read, [["a.ts", "a"], ["gone.ts", null]]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("1 · the whole enumerate-then-read pass survives the file disappearing under it", () => {
  const root = tree({ "keep.ts": "keep", "vanishes.mutation-probe.ts": "planted" });
  try {
    const listed = walkSourceFiles(root, KEEP);
    fs.rmSync(path.join(root, "vanishes.mutation-probe.ts"));
    assert.deepEqual(listed.map((f) => readSourceIfPresent(f)), ["keep"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ── 2 · A GENUINE SOURCE PROBLEM IS STILL LOUD ───────────────────────────────────────────────────────

test("2 · excluding the probe copy does not hide the real file it was copied from", () => {
  const root = tree({
    "offender.ts": "SUPABASE_SERVICE_ROLE",
    "offender.mutation-probe.ts": "SUPABASE_SERVICE_ROLE",
    "clean.ts": "fine",
  });
  try {
    const hits = walkSourceFiles(root, KEEP).filter((f) => /SUPABASE_SERVICE_ROLE/.test(readSourceIfPresent(f) ?? ""));
    assert.deepEqual(hits.map((f) => path.basename(f)), ["offender.ts"],
      "the shipped offender must still be found — the fix drops the transient copy, not the module");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("2 · a file that is present and readable is returned verbatim, so content assertions still bite", () => {
  const root = tree({ "a.ts": "line one\nline two\n" });
  try {
    assert.equal(readSourceIfPresent(path.join(root, "a.ts")), "line one\nline two\n");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ── 3 · NON-ENOENT IS NOT SWALLOWED ──────────────────────────────────────────────────────────────────

test("3 · a directory where a file was expected still throws (EISDIR), it does not read as absent", () => {
  const root = tree({ "sub/a.ts": "a" });
  try {
    assert.throws(() => readSourceIfPresent(path.join(root, "sub")), (e) => e.code === "EISDIR" || e.code === "EACCES");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("3 · an unreadable file still throws EACCES — the old catch-all scanned it as empty", (t) => {
  const root = tree({ "secret.ts": "content" });
  const f = path.join(root, "secret.ts");
  try {
    fs.chmodSync(f, 0o000);
    let denied = true;
    try { fs.readFileSync(f, "utf8"); denied = false; } catch { /* denied, as intended */ }
    if (!denied) return t.skip("this process can read a 0o000 file (running as root); EACCES is unreachable here");
    assert.throws(() => readSourceIfPresent(f), (e) => e.code === "EACCES");
  } finally { try { fs.chmodSync(f, 0o644); } catch {} fs.rmSync(root, { recursive: true, force: true }); }
});

// ── THE CONVENTION IS WRITTEN DOWN ONCE, AND BOTH PRODUCERS MATCH IT ─────────────────────────────────

test("both mutating suites produce names this module recognises as transient", () => {
  for (const name of ["settlement-lineage.mutation-probe.ts", "row-lineage.mutation-probe.mjs", "provenance.mutation-probe.ts"]) {
    assert.ok(isTransientSource(name), `${name} must be recognised as a transient probe copy`);
  }
  for (const name of ["settlement-lineage.ts", "row-lineage.mjs", "mutation-probes.test.mjs", "probe.ts"]) {
    assert.ok(!isTransientSource(name), `${name} is shipped source and must never be skipped`);
  }
  assert.ok(TRANSIENT_SOURCE.test(".mutation-probe."), "the exported pattern is the one both producers write");
});

test("the producers still write the name this module skips — measured against their source, not assumed", () => {
  const app = path.resolve(HERE, "..", "..", "..");
  for (const rel of ["src/lib/identity/integrity.test.mjs", "src/lib/research/row-lineage.test.mjs"]) {
    const src = fs.readFileSync(path.join(app, rel), "utf8");
    assert.match(src, /mutation-probe/, `${rel} is the producer this module exists for; its naming moved`);
    const written = /\.replace\(\/\\\.\(?[a-z|]+\)?\$\/, *"\.mutation-probe\.(?:\$1)?"\)/.test(src)
      || src.includes('".mutation-probe.ts"') || src.includes('".mutation-probe.$1"');
    assert.ok(written, `${rel} must still build its probe path with the .mutation-probe. infix`);
  }
});

// ── MUTATION PROBE · the ENOENT discrimination is load-bearing ───────────────────────────────────────

/**
 * Mutate a SIBLING COPY of the module and run the probe in a CHILD PROCESS — the live file is never
 * written, and an in-process re-import would return the cached original and prove nothing.
 */
function mutating(file, find, replace, probeSource) {
  const target = path.join(HERE, file);
  const original = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const text = original.toString();
  assert.ok(text.includes(find), `mutation anchor not found in ${file} — the source changed shape`);

  for (const stale of fs.readdirSync(HERE).filter((n) => isTransientSource(n))) fs.rmSync(path.join(HERE, stale), { force: true });
  const mutatedPath = path.join(HERE, file.replace(/\.mjs$/, ".mutation-probe.mjs"));
  const probePath = path.join(os.tmpdir(), `gtp-source-tree-probe-${digest.slice(0, 8)}.mjs`);
  let out = "";
  try {
    fs.writeFileSync(mutatedPath, text.replace(find, replace));
    fs.writeFileSync(probePath, probeSource(mutatedPath));
    out = execFileSync("npx", ["tsx", probePath], { encoding: "utf8", cwd: process.cwd() }).trim();
  } finally {
    fs.rmSync(mutatedPath, { force: true });
    fs.rmSync(probePath, { force: true });
  }
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"), digest,
    `${file} was NOT left untouched — the probe must never write the live module`);
  return out;
}

test("MUTATION · dropping the ENOENT check makes an unreadable file scan as absent", () => {
  const probe = (t) => `import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSourceIfPresent } from ${JSON.stringify(t)};
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-probe-"));
fs.mkdirSync(path.join(root, "adir"));
try { const v = readSourceIfPresent(path.join(root, "adir")); console.log(v === null ? "MISSED" : "UNEXPECTED"); }
catch (e) { console.log(e.code === "EISDIR" ? "CAUGHT" : "UNEXPECTED:" + e.code); }
finally { fs.rmSync(root, { recursive: true, force: true }); }`;

  // Mutated: every error becomes "absent".
  assert.equal(mutating("source-tree.mjs", 'if (err && err.code === "ENOENT") return null;', "return null;", probe),
    "MISSED", "the mutation must actually defeat the discrimination, or this test proves nothing");

  // Restored: the same EISDIR is still loud.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-probe-live-"));
  fs.mkdirSync(path.join(root, "adir"));
  try { assert.throws(() => readSourceIfPresent(path.join(root, "adir")), (e) => e.code === "EISDIR" || e.code === "EACCES"); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("MUTATION · dropping the transient filter puts the probe copy back in the walk", () => {
  const out = mutating(
    "source-tree.mjs",
    "} else if (!isTransientSource(e.name) && keep(e.name)) {",
    "} else if (keep(e.name)) {",
    (t) => `import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { walkSourceFiles } from ${JSON.stringify(t)};
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-probe-"));
fs.writeFileSync(path.join(root, "a.ts"), "a");
fs.writeFileSync(path.join(root, "a.mutation-probe.ts"), "planted");
try {
  const names = walkSourceFiles(root, (n) => /\\.ts$/.test(n)).map((p) => path.basename(p)).sort();
  console.log(names.includes("a.mutation-probe.ts") ? "MISSED" : "CAUGHT");
} finally { fs.rmSync(root, { recursive: true, force: true }); }`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the filter, or this test proves nothing");
});
