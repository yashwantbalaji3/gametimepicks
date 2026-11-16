/**
 * HISTORY NEVER BLOCKS FORECASTS, AND NEVER FAILS SILENTLY (review of #1353, 2026-11-16).
 *
 * The player-evidence build ran fatally inside the event window's board step, before the commit: one bad box-score row
 * would have kept every forecast and board of that window from publishing. It is now non-fatal for publishing and
 * deferred-loud: an ::error::, a line in $RUNNER_TEMP/nfl-deferred-alerts.txt, and a step AFTER the publish that fails
 * the run (so "Notify on failure" fires). This test pins the wiring in the workflow text and EXECUTES both snippets.
 * Run (from app/): npx tsx --test src/lib/ci/nfl-deferred-alerts.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WF = path.resolve(process.cwd(), "..", ".github", "workflows", "nfl-event-window.yml");
const text = fs.readFileSync(WF, "utf8");
const lines = text.split("\n");
const stepAt = (name) => lines.findIndex((l) => l.trim() === `- name: ${name}`);

/** The `run: |` body of a step, de-indented. */
function runBody(name) {
  const i = stepAt(name);
  assert.ok(i >= 0, `step "${name}" exists`);
  const r = lines.findIndex((l, k) => k > i && /^\s+run: \|\s*$/.test(l));
  const indent = lines[r + 1].match(/^\s*/)[0].length;
  const body = [];
  for (let k = r + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() && l.match(/^\s*/)[0].length < indent) break;
    body.push(l.slice(indent));
  }
  return body.join("\n").trimEnd();
}

/** The guarded evidence block: from its `if !` to the matching `fi`, de-indented. */
function evidenceBlock() {
  const i = lines.findIndex((l) => l.includes("if ! node scripts/nfl/build-nfl-player-evidence.mjs --write; then"));
  assert.ok(i >= 0, "the evidence build is wrapped in `if ! …; then`");
  const indent = lines[i].match(/^\s*/)[0].length;
  const j = lines.findIndex((l, k) => k > i && l.trim() === "fi" && l.match(/^\s*/)[0].length === indent);
  return { start: i, block: lines.slice(i, j + 1).map((l) => l.slice(indent)).join("\n") };
}

const bash = (script, env, cwd) => spawnSync("bash", ["-c", `set -euo pipefail\n${script}`], { env: { ...process.env, ...env }, cwd, encoding: "utf8" });

test("wiring: the only evidence-build call is guarded, sits before the commit, and the deferred step runs after the publish and before the failure notice", () => {
  const calls = lines.filter((l) => /\bnode scripts\/nfl\/build-nfl-player-evidence\.mjs/.test(l) && !l.trim().startsWith("#"));
  assert.equal(calls.length, 1, `one call, guarded: ${calls.join(" | ")}`);
  const { start } = evidenceBlock();
  const gen = stepAt("Generate public-beta NFL forecasts"), commit = stepAt("Commit the window's artifacts"), publish = stepAt("Publish this run's commits (one push, one deployment)");
  const deferred = stepAt("Fail the run on deferred alerts"), notify = stepAt("Notify on failure");
  assert.ok(gen < start && start < commit, "inside the board step, before the commit");
  assert.ok(publish < deferred && deferred < notify, "deferred failure after publishing, before the failure notice");
  assert.match(lines.slice(deferred, deferred + 3).join("\n"), /if: \$\{\{ always\(\) \}\}/, "runs even after an earlier failure");
  assert.match(runBody("Generate public-beta NFL forecasts"), /^set -euo pipefail/, "the board step keeps set -euo pipefail");
  assert.match(runBody("Fail the run on deferred alerts"), /^set -euo pipefail/);
});

test("detection: a failing evidence build does not stop the step, writes the alert, and the deferred step then fails the run", () => {
  const { block } = evidenceBlock();
  const final = runBody("Fail the run on deferred alerts");
  for (const [code, expectFail] of [[1, true], [0, false]]) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-deferred-"));
    const bin = path.join(tmp, "bin"); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "node"), `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
    const env = { RUNNER_TEMP: tmp, PATH: `${bin}:${process.env.PATH}` };
    const step = bash(`${block}\necho STEP_CONTINUED`, env, tmp);
    assert.equal(step.status, 0, `the board step never dies on the evidence build (node exit ${code}): ${step.stderr}`);
    assert.match(step.stdout, /STEP_CONTINUED/, "the commands after it (and the commit step) still run");
    const alerts = path.join(tmp, "nfl-deferred-alerts.txt");
    assert.equal(fs.existsSync(alerts), expectFail, "alert line written only on failure");
    if (expectFail) assert.match(step.stdout, /::error::NFL player-evidence build failed/);
    const end = bash(final, env, tmp);
    assert.equal(end.status, expectFail ? 1 : 0, `deferred step exit (node exit ${code})`);
    if (expectFail) assert.match(end.stdout, /::error::deferred alert: nfl-player-evidence/);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
