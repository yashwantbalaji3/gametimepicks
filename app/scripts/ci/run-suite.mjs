#!/usr/bin/env node
/**
 * THE SUITE, IN TWO PHASES — because half of it was never running in CI.
 *
 *   node scripts/ci/run-suite.mjs --phase unit        # everything that needs no built export
 *   node scripts/ci/run-suite.mjs --phase post-build  # the guards that read out/
 *   node scripts/ci/run-suite.mjs --phase all         # both, for a local full run
 *
 * WHY THIS EXISTS
 * ---------------
 * quality-gate ran `npx tsx --test $(find src -name '*.test.mjs')` and THEN built the export. Forty-three
 * test files read `out/`, and every one of them opens with some form of
 *
 *     if (!fs.existsSync(PAGE)) return;        // export not built in this run
 *
 * That is an early return inside the test body, not a skip. So in CI they did not fail, and they did
 * not report as skipped either — they reported as PASSING, 250 of them, having asserted nothing at
 * all. Measured on 2026-09-01: the same 250 tests "pass" with `out/` present and with it absent.
 *
 * A guard that cannot tell "I checked and it was fine" from "I could not look" is worse than no
 * guard, because it certifies the thing it never examined. Two of these were repaired the night
 * before — the /ufc self-consistency pair and the sport-lab built-export check — and neither repair
 * was ever exercised by the gate that is supposed to protect it.
 *
 * WHAT THIS DOES
 * --------------
 * Partitions the suite by whether a file reads the built export, so the gate can run the unit phase
 * before the build (fast, deterministic, no artifact dependency) and the rendered phase after it.
 *
 * THE PHASE REFUSES TO RUN VACUOUSLY. `--phase post-build` exits non-zero when `out/` is missing or
 * when the partition selected no files. Otherwise this script would reproduce the exact defect it
 * exists to remove, one level up.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "out");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PHASE = arg("--phase", "all");
if (!["unit", "post-build", "all"].includes(PHASE)) {
  console.error(`REFUSED: --phase must be unit | post-build | all (got ${PHASE})`);
  process.exit(2);
}

/**
 * Does this test file read the built export?
 *
 * Deliberately a content scan rather than a naming convention or a manifest: a list would have to be
 * maintained by hand, and the failure mode of a hand-maintained list is a new built-export guard
 * quietly landing in the unit phase, where it goes back to passing without looking.
 */
const READS_BUILT_EXPORT = /\bout\/|["'`]out["'`]\s*\)|path\.join\([^)]*["'`]out["'`]/;

function testFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { testFiles(full, acc); continue; }
    if (e.name.endsWith(".test.mjs")) acc.push(full);
  }
  return acc;
}

const all = testFiles(path.join(APP, "src")).sort();
const built = all.filter((f) => READS_BUILT_EXPORT.test(fs.readFileSync(f, "utf8")));
const unit = all.filter((f) => !built.includes(f));

const rel = (f) => path.relative(APP, f);

function run(label, files) {
  if (files.length === 0) return { label, files: 0, code: 0, empty: true };
  console.log(`\n[suite] ${label}: ${files.length} file(s)`);
  const r = spawnSync("npx", ["tsx", "--test", ...files.map(rel)], { cwd: APP, stdio: "inherit" });
  return { label, files: files.length, code: r.status ?? 1, empty: false };
}

const results = [];

if (PHASE === "unit" || PHASE === "all") {
  results.push(run("unit + contract (no built export)", unit));
}

if (PHASE === "post-build" || PHASE === "all") {
  /*
   * The refusal that keeps this honest. Without it, running the rendered phase on a tree that was
   * never built would print a full row of green — which is precisely the defect this file removes.
   */
  if (!fs.existsSync(OUT)) {
    console.error("REFUSED: --phase post-build needs a built export at app/out/. Run `npm run build` first.");
    console.error("         (Running these guards without it is how 250 assertions came to report success while never executing.)");
    process.exit(3);
  }
  if (built.length === 0) {
    console.error("REFUSED: the post-build partition selected no files — the detector for built-export guards has stopped detecting them.");
    process.exit(4);
  }
  results.push(run("rendered guards (reads out/)", built));
}

console.log("\n[suite] summary");
for (const r of results) console.log(`  ${r.label.padEnd(38)} ${r.files} file(s) → ${r.code === 0 ? "pass" : `FAIL (${r.code})`}`);
if (PHASE !== "post-build") console.log(`  partition: ${unit.length} unit · ${built.length} rendered · ${all.length} total`);

process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
