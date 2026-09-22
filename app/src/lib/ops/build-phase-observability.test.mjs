/**
 * B5 — the build's named phases are observable, and the wrapper cannot lie (v1.8).
 *
 * The failure this exists for: a Vercel build that prints `Generating static pages (1856/2475)` and then
 * nothing at all for ~41 minutes until the 46-minute platform ceiling ends it, with no error, no OOM and no
 * progress line (docs/V18_VERCEL_BUILD_FAILURE_DIAGNOSIS.md §2–§3a). The only evidence was a log that stopped.
 *
 * Two classes of thing are pinned here, because either alone would be a green that proves nothing:
 *   1. WIRING — every expensive build step actually runs through the phase runner, in the real `build`
 *      script. A logger nobody calls is decoration; this is the "disconnected logger" probe target.
 *   2. BEHAVIOUR — the runner forwards output byte-for-byte, forwards the child's exit code unchanged, and
 *      emits a heartbeat that NAMES the last progress counter and how long it has been frozen. Each is
 *      exercised against the real script with a real child process, never against a mock of it.
 *
 * Run: cd app && npx tsx --test src/lib/ops/build-phase-observability.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const RUNNER = path.join(APP, "scripts", "build", "run-phase.mjs");
const PKG = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));

/** Run the real runner with a real child. `receipt` defaults to a throwaway file. */
function runPhase(name, childArgs, { heartbeat = 0, env = {} } = {}) {
  const receipt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-phase-")), "build-phases.json");
  const r = spawnSync(process.execPath, [RUNNER, name, "--", process.execPath, ...childArgs], {
    cwd: APP, encoding: "utf8",
    env: { ...process.env, GTP_PHASE_RECEIPT: receipt, GTP_PHASE_HEARTBEAT_SECONDS: String(heartbeat), GTP_PHASE_QUIET: "", ...env },
  });
  return { ...r, out: `${r.stdout}${r.stderr}`, receipt };
}

/* ── 1 · WIRING: the phases the build actually runs through ───────────────────────────────────── */

const EXPENSIVE_PHASES = ["next-build", "compare-assets", "lab-assets", "ask-projections", "ask-assets", "search-index", "prune-internal-routes"];

test("WIRING · the real build script routes every expensive step through the phase runner", () => {
  const build = PKG.scripts.build;
  assert.ok(build, "package.json has a build script");
  for (const phase of EXPENSIVE_PHASES) {
    assert.match(build, new RegExp(`run-phase\\.mjs\\s+${phase}\\s+--\\s`), `${phase} must run through the phase runner`);
  }
  // the step that actually hung must be wrapped, and must still be `next build`
  assert.match(build, /run-phase\.mjs\s+next-build\s+--\s+next build(\s|$|&)/, "next-build wraps the real `next build`");
  // every `&&` link is still a gate: no step was turned into `;` or `|| true` while rewriting the chain
  assert.doesNotMatch(build, /\|\|\s*true/, "no step may be made unconditionally green");
  assert.doesNotMatch(build, /;\s*(node|next|npx)\s/, "steps stay chained with && so a failure still stops the build");
  assert.equal(build.split("&&").length, 9, "nine phases, nine gated links");
});

test("WIRING · nothing in the build weakened the ignore-build gate or added a skip-ci escape", () => {
  const ignore = fs.readFileSync(path.join(APP, "scripts", "vercel-ignore-build.sh"), "utf8");
  // B5 must not touch this file; pin the decision it makes so a later "optimisation" cannot quietly invert it.
  assert.match(ignore, /ignore-build/, "the ignore-build script is still the one making the decision");
  assert.doesNotMatch(PKG.scripts.build, /skip[- ]ci/i, "the build script must never carry a skip-ci escape");
  assert.doesNotMatch(PKG.scripts.build, /--no-lint|--no-typecheck/, "observability must not be bought by skipping work");
});

/* ── 2 · BEHAVIOUR: against the real runner and real child processes ──────────────────────────── */

test("the runner forwards the child's stdout and stderr byte-for-byte", () => {
  const r = runPhase("t-forward", ["-e", 'process.stdout.write("OUT-MARKER\\n"); process.stderr.write("ERR-MARKER\\n")']);
  assert.match(r.out, /OUT-MARKER/);
  assert.match(r.out, /ERR-MARKER/);
  assert.equal(r.status, 0);
});

test("the runner forwards the child's exit code UNCHANGED — it can never turn red into green", () => {
  for (const code of [1, 3, 7, 42]) {
    const r = runPhase("t-exit", ["-e", `process.exit(${code})`]);
    assert.equal(r.status, code, `exit ${code} must survive the wrapper`);
    assert.match(r.out, new RegExp(`FAIL\\s+t-exit .*exit=${code}`), "and be named in the log");
  }
  const ok = runPhase("t-exit-ok", ["-e", "0"]);
  assert.equal(ok.status, 0, "positive control: success stays success");
  assert.match(ok.out, /END\s+t-exit-ok ok in/);
});

test("a phase that hangs is DIAGNOSABLE from stdout alone: elapsed time, the last counter, and how long it froze", () => {
  // Reproduces the real signature: print the counter that froze at 1856/2475, then stop producing output.
  const r = runPhase("t-hang", ["-e", 'console.log("Generating static pages (1856/2475)"); setTimeout(() => {}, 2600)'], { heartbeat: 1 });
  assert.equal(r.status, 0);
  const alive = r.out.split("\n").filter((l) => /ALIVE\s+t-hang/.test(l));
  assert.ok(alive.length >= 2, `the heartbeat must fire repeatedly while the phase is silent (got ${alive.length})`);
  // it names the counter, not just "still running"
  assert.match(alive.at(-1), /Generating static pages \(1856\/2475\)/, "the heartbeat names the last progress line");
  assert.match(alive.at(-1), /\d+s ago/, "…and how long that counter has been frozen");
  assert.match(alive.at(-1), /ALIVE\s+t-hang\s+\d+s/, "…and the phase's elapsed time");
  // POSITIVE CONTROL: before any progress line, it says so rather than inventing one
  const r2 = runPhase("t-silent", ["-e", "setTimeout(() => {}, 2600)"], { heartbeat: 1 });
  const alive2 = r2.out.split("\n").filter((l) => /ALIVE\s+t-silent/.test(l));
  assert.ok(alive2.length >= 1);
  assert.match(alive2.at(-1), /no progress line seen yet/, "an honest 'nothing seen yet', never a stale counter");
});

test("START is printed BEFORE the child runs, so the last phase to start is identifiable when it never ends", () => {
  const r = runPhase("t-order", ["-e", 'console.log("CHILD-RAN")']);
  const iStart = r.out.indexOf("START  t-order");
  const iChild = r.out.indexOf("CHILD-RAN");
  const iEnd = r.out.indexOf("END    t-order");
  assert.ok(iStart >= 0 && iChild > iStart, "START precedes the child's first output");
  assert.ok(iEnd > iChild, "END follows it");
  /*
   * THE CEILING CASE. A platform kill is how the 46-minute failures actually ended, so the kill path is the
   * one that has to carry evidence: the signal that ended it AND the counter it was frozen on. Exit status
   * alone is not enough — `code ?? 1` already makes a signalled close non-zero, so a probe that only checked
   * redness passed while the signal name and the last progress line were both being dropped.
   */
  const killed = runPhase("t-killed", ["-e", 'console.log("Generating static pages (1856/2475)"); process.kill(process.pid, "SIGKILL")'], { heartbeat: 0 });
  assert.match(killed.out, /START\s+t-killed/);
  assert.notEqual(killed.status, 0, "a killed phase is a failure, never a pass");
  assert.match(killed.out, /FAIL\s+t-killed/, "and it is named as one");
  assert.match(killed.out, /killed by SIGKILL/, "the signal that ended it is named — 'it failed' does not distinguish a ceiling kill from a crash");
  assert.match(killed.out, /killed by SIGKILL[^\n]*Generating static pages \(1856\/2475\)/, "…beside the counter it was frozen on, which is the whole diagnosis");
});

test("the runner refuses a malformed invocation rather than silently running nothing", () => {
  const bad = spawnSync(process.execPath, [RUNNER, "only-a-name"], { cwd: APP, encoding: "utf8" });
  assert.equal(bad.status, 2, "no `--` separator → usage error");
  assert.match(`${bad.stdout}${bad.stderr}`, /usage:/);
  const bad2 = spawnSync(process.execPath, [RUNNER, "name", "--"], { cwd: APP, encoding: "utf8" });
  assert.equal(bad2.status, 2, "`--` with no command → usage error");
});

test("instrumentation is never fatal: an unwritable receipt path does not fail the phase", () => {
  // The receipt is a convenience for builds that finish; the stdout markers are the mechanism. A build must
  // not go red because a JSON file could not be written.
  const r = runPhase("t-receipt", ["-e", 'console.log("fine")'], { env: { GTP_PHASE_RECEIPT: "/proc/definitely/not/writable/x.json" } });
  assert.equal(r.status, 0, "the phase still passes");
  assert.match(r.out, /END\s+t-receipt ok/);
});

test("the DEFAULT receipt path is a build artifact — never a published or committed data path", () => {
  /*
   * The first draft defaulted the receipt to public/data/ops/build-phases.json. That path is published AND
   * nightly-settle stages `app/public/data/ops/` wholesale, so every bot build would have committed its own
   * runner's phase timings into the repo as product data. Nothing would have failed; the churn would just
   * have appeared. So the default path is pinned, and pinned against the two properties that made the old
   * one wrong: it must be git-ignored, and it must not live under public/data.
   */
  const src = fs.readFileSync(path.join(APP, "scripts", "build", "run-phase.mjs"), "utf8");
  const m = /GTP_PHASE_RECEIPT\s*\|\|\s*path\.join\(([^)]*)\)/.exec(src);
  assert.ok(m, "the default receipt path is a path.join the guard can read");
  const segments = m[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""));
  const rel = segments.join("/");
  assert.doesNotMatch(rel, /^public\//, `the receipt must not default under public/ (got ${rel})`);
  assert.ok(rel.startsWith(".next/"), `the receipt must default to a build artifact directory (got ${rel})`);

  // …and that directory must really be ignored by git, not merely assumed to be
  const ignore = fs.readFileSync(path.join(path.dirname(APP), ".gitignore"), "utf8");
  assert.match(ignore, /^app\/\.next\/?$/m, "app/.next must be git-ignored for that default to be safe");

  // POSITIVE CONTROL: a real run writes there and leaves nothing under public/data
  const before = fs.existsSync(path.join(APP, "public", "data", "ops", "build-phases.json"));
  assert.equal(before, false, "no build-phases.json may sit in the published ops directory");
  const r = spawnSync(process.execPath, [RUNNER, "t-default", "--", process.execPath, "-e", "0"], {
    cwd: APP, encoding: "utf8",
    env: { ...process.env, GTP_PHASE_RECEIPT: "", GTP_PHASE_HEARTBEAT_SECONDS: "0" },
  });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(APP, "public", "data", "ops", "build-phases.json")), false, "…and a real run does not create one");
  assert.ok(fs.existsSync(path.join(APP, ".next", "gtp-build-phases.json")), "the receipt landed in the build-artifact directory");
});

test("a completed phase also leaves a receipt, with its duration and last progress line", () => {
  const r = runPhase("t-json", ["-e", 'console.log("Generating static pages (2475/2475)")']);
  assert.equal(r.status, 0);
  const doc = JSON.parse(fs.readFileSync(r.receipt, "utf8"));
  assert.equal(doc.schema, "gtp.build-phases.v1");
  const ph = doc.phases.find((p) => p.name === "t-json");
  assert.ok(ph, "the phase is recorded");
  assert.equal(ph.outcome, "ok");
  assert.equal(ph.exitCode, 0);
  assert.ok(Number.isFinite(ph.durationMs), "with a duration");
  assert.match(ph.lastProgress, /2475\/2475/, "and the last counter it reached");
});
