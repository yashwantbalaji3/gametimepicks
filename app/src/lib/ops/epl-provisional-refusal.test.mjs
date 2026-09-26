/**
 * A CORRECT REFUSAL IS NOT A FAILED RUN — `sport-schedules` and the EPL fixture capture.
 *
 * ⚠ THE MEASURED PROBLEM. `sport-schedules` was red on 8 of its last 14 runs (2026-09-14 → 09-26)
 * while every other capture in those runs SUCCEEDED — 30/30 EPL teams, 563 players, NFL, NBA and
 * UFC all fine. The single cause, every time:
 *
 *     REFUSED: 1 matchday(s) carry a single kickoff slot for every fixture — that is a
 *     provisional block, not a schedule: md6 (all at 2026-10-10 12:30)
 *
 * That refusal is CORRECT and it is RECURRING. openfootball publishes a matchday as one
 * placeholder slot until broadcasters assign times, so a round a fortnight out is provisional most
 * weeks by construction. Reporting it as a failure trains an operator to ignore the workflow, and
 * the next REAL capture failure then arrives into a workflow nobody reads.
 *
 * ⚠ AND THE FIX MUST NOT BECOME SILENCE. This repository has been burned by `|| true`, by
 * `continue-on-error` cancelling an explicit `exit 1`, and by `|| echo` making a step green. So the
 * distinction is carried by an EXIT CODE that exactly one code path produces, and both halves are
 * asserted here: the script must use 3 only for the provisional case, and the workflow must treat
 * only 3 as a warning while still writing every other refusal to the file that decides the colour.
 *
 * Run: cd app && npx tsx --test src/lib/ops/epl-provisional-refusal.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const SCRIPT = fs.readFileSync(path.join(APP, "scripts/epl/capture-epl-fixtures.mjs"), "utf8");
const WF = fs.readFileSync(path.join(ROOT, ".github/workflows/sport-schedules.yml"), "utf8");

test("exactly ONE code path exits 3, and it is the provisional block", () => {
  const threes = [...SCRIPT.matchAll(/process\.exit\((\w+)\)/g)].map((m) => m[1]);
  const provisional = threes.filter((t) => t === "EXIT_SOURCE_PROVISIONAL");
  assert.equal(provisional.length, 1, "the provisional exit must be used once and only once");
  assert.match(SCRIPT, /const EXIT_SOURCE_PROVISIONAL = 3;/);
  // Every OTHER refusal in this file stays a failure.
  assert.ok(threes.filter((t) => t === "1").length >= 5,
    "the source-moved refusals must still exit 1 — a partial parse is not a provisional block");
});

test("the provisional refusal sits with the provisional message, not somewhere else", () => {
  const i = SCRIPT.indexOf("provisional block, not a schedule");
  const j = SCRIPT.indexOf("process.exit(EXIT_SOURCE_PROVISIONAL)");
  assert.ok(i > 0 && j > i && j - i < 2000,
    "exit 3 must be the provisional branch's own exit, not attached to an unrelated refusal");
});

test("🔴 the workflow treats ONLY 3 as a warning, and every other code still reddens the run", () => {
  /*
   * ⚠ EXECUTED, NOT READ. Valid YAML can hold broken shell — this repository lost a night's
   * settlement to exactly that. The branch is run for each code and the two observable outputs are
   * checked: the step's state, and whether a line reached "$REFUSALS", which is the ONLY thing the
   * final gate reads to decide the run's colour.
   */
  assert.match(WF, /if \[ "\$CODE" -eq 3 \]; then/, "the workflow must branch on the provisional code");
  assert.match(WF, /::warning::EPL fixtures/, "a provisional source must still be surfaced");

  /*
   * ⚠ THE BRANCH IS EXTRACTED FROM THE WORKFLOW, NOT RETYPED HERE.
   *
   * The first version of this test executed an inline COPY of the shell. Deleting
   * `echo "EPL fixtures" >> "$REFUSALS"` from the real workflow — the line that makes a genuine
   * refusal redden the run — changed nothing, because the test was measuring itself. A second
   * implementation in a test is a second rule, and the two disagree the first time either moves.
   */
  const stepRun = (() => {
    const from = WF.indexOf('if [ "$CODE" -eq 3 ]; then');
    assert.ok(from > 0, "the provisional branch is not in the workflow");
    const to = WF.indexOf("# Snapshot-per-capture", from);
    assert.ok(to > from, "could not find the end of the branch");
    const raw = WF.slice(from, to);
    // Strip the YAML block indentation so the shell is executable as written.
    const indent = Math.min(...raw.split("\n").filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return raw.split("\n").map((l) => l.slice(indent)).join("\n");
  })();

  const run = (code) => {
    const dir = fs.mkdtempSync("/tmp/gtp-epl-");
    const refusals = path.join(dir, "refusals");
    const out = path.join(dir, "out");
    fs.writeFileSync(refusals, ""); fs.writeFileSync(out, "");
    execFileSync("bash", ["-c", `
      set -uo pipefail
      CODE=${code}; REFUSALS="${refusals}"; GITHUB_OUTPUT="${out}"
      ${stepRun}
      echo "state=OK" >> "$GITHUB_OUTPUT"
    `], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    return { state: fs.readFileSync(out, "utf8").trim(), refusals: fs.readFileSync(refusals, "utf8").trim() };
  };

  assert.deepEqual(run(0), { state: "state=OK", refusals: "" });
  // 3 → warned, and NOTHING in the file that decides the colour.
  assert.deepEqual(run(3), { state: "state=SOURCE_PROVISIONAL", refusals: "" });
  // 1 and any other non-zero → the run goes red, exactly as before.
  assert.deepEqual(run(1), { state: "state=REFUSED", refusals: "EPL fixtures" });
  assert.deepEqual(run(2), { state: "state=REFUSED", refusals: "EPL fixtures" });
  assert.deepEqual(run(4), { state: "state=REFUSED", refusals: "EPL fixtures" });
});

test("the final gate still reddens the run on any recorded refusal — the fix changed WHAT is recorded, not the gate", () => {
  assert.match(WF, /captures refused this run:/);
  const gate = WF.slice(WF.indexOf("Fail the run if any capture refused"));
  assert.match(gate, /exit 1/, "a recorded refusal must still fail the run");
  assert.match(gate, /if: always\(\)/, "the gate must run even when an earlier step failed");
});

test("nothing is published on either refusal path — the committed capture stands", () => {
  const i = SCRIPT.indexOf("provisional block, not a schedule");
  assert.match(SCRIPT.slice(i, i + 600), /previously committed capture stands/);
  // The exit precedes every write in the script's flow.
  assert.ok(SCRIPT.indexOf("process.exit(EXIT_SOURCE_PROVISIONAL)") < SCRIPT.indexOf("writeFileSync"),
    "a refusal must exit before anything is written");
});
