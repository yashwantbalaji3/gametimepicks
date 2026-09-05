/**
 * THE GATE MUST BUILD BEFORE IT CHECKS THE BUILD.
 *
 * Run: npx tsx --test src/lib/ci/suite-phases.test.mjs
 *
 * quality-gate ran the entire suite and THEN built the export. Sixty-three test files read `out/`,
 * and each opens with some form of `if (!fs.existsSync(PAGE)) return;` — an early return inside the
 * test body, not a skip. So in CI they neither failed nor reported as skipped: they reported as
 * PASSING, having asserted nothing. The same 250 tests "pass" with the export present and absent.
 *
 * Two guards repaired the night before — the /ufc self-consistency pair and the sport-lab
 * built-export check — were never once exercised by the gate that is supposed to protect them.
 *
 * This file pins the ordering and the partition. It reads no built export itself, so it runs in
 * phase 1 and cannot be disabled by the very defect it guards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";

const APP = process.cwd();
const GATE = path.join(APP, "..", ".github", "workflows", "quality-gate.yml");
const RUNNER = path.join(APP, "scripts", "ci", "run-suite.mjs");

test("the workflow runs phase 1, then the build, then phase 2 — in that order", () => {
  if (!fs.existsSync(GATE)) return;
  const yml = fs.readFileSync(GATE, "utf8");

  const unit = yml.indexOf("--phase unit");
  const build = yml.indexOf("npm run build");
  const rendered = yml.indexOf("--phase post-build");

  assert.ok(unit > -1, "the gate must run the unit phase");
  assert.ok(build > -1, "the gate must build the export");
  assert.ok(rendered > -1, "the gate must run the rendered phase");
  assert.ok(unit < build, "the unit phase runs before the build — it needs no artifact and should fail fast");
  assert.ok(build < rendered, "THE BUILD MUST PRECEDE THE RENDERED GUARDS — this ordering is the whole defect");
});

test("the gate no longer runs the whole suite in one pre-build pass", () => {
  if (!fs.existsSync(GATE)) return;
  const yml = fs.readFileSync(GATE, "utf8").replace(/^\s*#.*$/gm, "");
  assert.ok(
    !/npx tsx --test \$\(find src -name/.test(yml),
    "the unpartitioned pre-build run is what let rendered guards pass without looking",
  );
});

test("REFUSAL · the rendered phase will not run without a built export", () => {
  /*
   * Without this the runner would reproduce the defect one level up: a full row of green from a
   * phase that never opened a file. Proven by running it, not by reading it.
   *
   * AGAINST A SCRATCH TREE, NOT THE REAL EXPORT. This used to rename `app/out` aside for the length
   * of the spawn below and put it back afterwards. It runs in the same parallel batch as the seventy
   * guards that read `out/`, so the export disappeared underneath them mid-run: `founder-token-
   * boundary` failed three times in six local gate runs with ENOENT partway through walking a
   * directory that existed before and after, passed in isolation every time, and passed in CI —
   * the exact profile of a flake nobody can reproduce. A test may not move the artifact its
   * siblings are reading, so the runner now takes `--app` and this points it somewhere disposable.
   */
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-suite-phase-"));
  const realExportBefore = fs.existsSync(path.join(APP, "out"));
  try {
    /* One test file that mentions out/, so the partition selects it and the phase is non-empty —
       otherwise the runner would refuse for the wrong reason and this would prove nothing. */
    fs.mkdirSync(path.join(scratch, "src"), { recursive: true });
    fs.writeFileSync(path.join(scratch, "src", "scratch.test.mjs"), 'import "node:test"; /* reads out/ */\n');
    assert.equal(fs.existsSync(path.join(scratch, "out")), false, "the scratch tree must have no export");

    const r = spawnSync("node", [RUNNER, "--phase", "post-build", "--app", scratch], { cwd: APP, encoding: "utf8" });
    assert.notEqual(r.status, 0, "a missing export must fail the phase, never pass it");
    assert.match(r.stderr, /needs a built export/i, "and say why");

    /* And the real export is exactly as it was — the property whose absence caused the flake. */
    assert.equal(
      fs.existsSync(path.join(APP, "out")),
      realExportBefore,
      "this test moved the real export; that is what its siblings were failing on",
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the partition still finds the rendered guards", () => {
  /*
   * A partition that stops recognising built-export guards would silently move all of them back
   * into phase 1 — the original defect, wearing the fix's clothes. The runner refuses an empty
   * rendered partition; this pins that it is not merely non-empty but substantial.
   */
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".test.mjs")) files.push(full);
    }
  };
  walk(path.join(APP, "src"));
  const reads = /\bout\/|["'`]out["'`]\s*\)|path\.join\([^)]*["'`]out["'`]/;
  const rendered = files.filter((f) => reads.test(fs.readFileSync(f, "utf8")));
  assert.ok(rendered.length >= 40, `only ${rendered.length} rendered guards detected — the partition has stopped detecting them`);
});

test("LOCAL AND CI RUN THE SAME ORDER — a stale out/ must not look greener than CI", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  assert.equal(pkg.scripts.suite, "node scripts/ci/run-suite.mjs --phase unit");
  assert.equal(pkg.scripts["suite:built"], "node scripts/ci/run-suite.mjs --phase post-build");
  // `npm run gate` is the CI sequence, so a developer cannot accidentally check a stale export.
  const gate = pkg.scripts.gate ?? "";
  const iBuild = gate.indexOf("build");
  const iBuilt = gate.indexOf("suite:built");
  assert.ok(iBuild > -1 && iBuilt > iBuild, `\`npm run gate\` must build before suite:built (got "${gate}")`);
});
