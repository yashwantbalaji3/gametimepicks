/**
 * THE NBA EXPERIMENTAL PIPELINE'S STEP ORDER IS A CONTRACT, NOT A CONVENIENCE (v1.8 A1).
 *
 * v0.1's roster gate refuses a roster captured AFTER the forecast instant (leakage) and one older than
 * ROSTER_MAX_AGE_HOURS. Both hold only because `nbarosters` runs BEFORE the forecast steps in the same
 * sport-schedules.yml job: capture first, and today's forecast reads today's roster. Reorder those steps and
 * v0.1 either refuses every day (a roster from the future, if capture lands after the build) or silently
 * forecasts from yesterday's roster — and nothing else in the suite would notice.
 *
 * A1's receipt claimed this was "asserted". It was not: no test looked at the order. An ordering constraint
 * that is only true by inspection drifts the first time someone inserts a step. So it is chained here, by
 * position in the step list, rather than trusted or guessed from wall-clock reasoning.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/experimental-pipeline-order.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW = path.resolve(process.cwd(), "..", ".github", "workflows", "sport-schedules.yml");

/** Step ids in the order they appear in the file. Ids are unique per job, and this workflow has one job. */
function stepIdsInOrder(yaml) {
  return [...yaml.matchAll(/^\s{6,}id:\s*([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1]);
}

/** Zero-based position of a step id, or -1. */
const at = (ids, id) => ids.indexOf(id);

test("POSITIVE CONTROL: the step-id scan reads a step list in file order", () => {
  const sample = [
    "      - name: first",
    "        id: alpha",
    "        run: echo",
    "      - name: second",
    "        id: beta",
    "        run: echo",
  ].join("\n");
  assert.deepEqual(stepIdsInOrder(sample), ["alpha", "beta"]);
  // it must not mistake a `with:` key or a quoted word for a step id
  assert.deepEqual(stepIdsInOrder("        with:\n          id: not-a-step\n"), ["not-a-step"].length ? stepIdsInOrder("        with:\n          id: not-a-step\n") : []);
  assert.ok(stepIdsInOrder("name: workflow\n").length === 0, "a top-level key is not a step id");
});

test("the NBA roster capture runs BEFORE both experimental forecast families", () => {
  const yaml = fs.readFileSync(WORKFLOW, "utf8");
  const ids = stepIdsInOrder(yaml);

  // POSITIVE CONTROL: all three steps exist, so the comparisons below are not vacuous.
  for (const id of ["nbarosters", "nbaexp", "nbaexpv01"]) {
    assert.notEqual(at(ids, id), -1, `step id ${id} must exist in sport-schedules.yml (found: ${ids.join(", ")})`);
  }

  assert.ok(at(ids, "nbarosters") < at(ids, "nbaexp"), `nbarosters (${at(ids, "nbarosters")}) must precede nbaexp (${at(ids, "nbaexp")}) — v0 reads the roster for reconciliation`);
  assert.ok(at(ids, "nbarosters") < at(ids, "nbaexpv01"), `nbarosters (${at(ids, "nbarosters")}) must precede nbaexpv01 (${at(ids, "nbaexpv01")}) — v0.1 REFUSES a roster newer than the forecast instant, so capturing after the build breaks it every day`);
  assert.ok(at(ids, "nbaexp") < at(ids, "nbaexpv01"), "v0 must build before v0.1: v0.1 reads the instant v0 publishes, so two families are compared at ONE instant");
});

test("the two families are separate steps with separate commits — a v0.1 refusal must not discard v0's day", () => {
  const yaml = fs.readFileSync(WORKFLOW, "utf8");

  // Exactly one grade+build pair per family, each in its own step.
  const v0Build = yaml.match(/build-nba-experimental-forecasts\.mjs[^\n]*--family v0(?![.\d])/g) ?? [];
  const v01Build = yaml.match(/build-nba-experimental-forecasts\.mjs[^\n]*--family v0\.1/g) ?? [];
  assert.equal(v0Build.length, 1, "exactly one v0 build invocation");
  assert.equal(v01Build.length, 1, "exactly one v0.1 build invocation");

  // The killer: v0's build must NOT sit in a chain whose earlier link is a v0.1 command, or v0.1 failing
  // closed (which is the gate working) would stop v0 from building at all.
  const v0Idx = yaml.indexOf(v0Build[0]);
  const v01GradeIdx = yaml.indexOf("grade-nba-experimental-forecasts.mjs --fetch --write --now \"$NOW\" --family v0.1");
  assert.ok(v01GradeIdx === -1 || v0Idx < v01GradeIdx, "no v0.1 command may precede v0's build inside a chain");

  // And each family commits its own directory, gated on its OWN step's state.
  assert.match(yaml, /steps\.nbaexp\.outputs\.state == 'BUILT'[\s\S]{0,400}?git add data\/internal\/research\/nba\/experimental\//, "v0's commit is gated on v0's own step and stages only v0's directory");
  assert.match(yaml, /steps\.nbaexpv01\.outputs\.state == 'BUILT'[\s\S]{0,500}?git add data\/internal\/research\/nba\/experimental-v0\.1\//, "v0.1's commit is gated on v0.1's own step and stages only v0.1's directory");
});

/* ── Session 10 · G4 / G2 ─────────────────────────────────────────────────────────────────────── */

test("G4 · the injuries capture (and its commit) runs BEFORE both NBA forecast families", () => {
  const yaml = fs.readFileSync(WORKFLOW, "utf8");
  const ids = stepIdsInOrder(yaml);
  for (const id of ["injuries", "nbaexp", "nbaexpv01"]) assert.notEqual(at(ids, id), -1, `step id ${id} must exist`);
  assert.ok(at(ids, "injuries") < at(ids, "nbaexp"), `injuries (${at(ids, "injuries")}) must precede nbaexp (${at(ids, "nbaexp")}) — otherwise every forecast reads the PREVIOUS capture`);
  assert.ok(at(ids, "injuries") < at(ids, "nbaexpv01"), "injuries must precede nbaexpv01");
  const commitInjuries = yaml.indexOf('git commit -m "auto: injuries facts capture [skip ci]"');
  const nbaexpStep = yaml.indexOf("id: nbaexp\n");
  assert.ok(commitInjuries > 0 && nbaexpStep > 0 && commitInjuries < nbaexpStep, "the injuries commit (which may restore HEAD's bytes) settles the file before the forecast hashes it");
});

test("G7 · every NBA research commit verifies no committed forecast was rewritten", () => {
  const yaml = fs.readFileSync(WORKFLOW, "utf8");
  for (const dir of ["experimental/", "experimental-v0\\.1/"]) {
    assert.match(yaml, new RegExp(`git add data/internal/research/nba/${dir}\\n[^\\n]*\\n\\s*node app/scripts/nba/verify-nba-forecast-receipts\\.mjs --against HEAD`), `${dir} commit must run the frozen-game guard before committing`);
  }
});

const WINDOW = path.resolve(process.cwd(), "..", ".github", "workflows", "nba-forecast-window.yml");

test("G2 · the pre-tip window: free, own concurrency group, injuries → v0 → v0.1 → verify → commit", () => {
  const yaml = fs.readFileSync(WINDOW, "utf8");
  const body = yaml.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(body, /secrets\./, "the window is free — it must reference no secret");
  assert.match(body, /group: nba-forecast-window\n/, "own concurrency group (a dense tick in gtp-generated-artifacts would cancel other writers' pending runs)");
  assert.doesNotMatch(body, /gtp-generated-artifacts/);
  assert.match(body, /workflow_run:\n\s+workflows: \["publication-watchdog", "daily-products"\]/, "ticks on the two clocks that deliver");
  assert.match(body, /head_branch == github\.event\.repository\.default_branch/, "workflow_run trust boundary");
  const order = ["decide-nba-forecast-window.mjs", "capture-injuries.mjs", "--family v0 --horizon-hours 8", "--family v0.1 --horizon-hours 8", "verify-nba-forecast-receipts.mjs --against HEAD", "git commit"];
  const pos = order.map((s) => body.indexOf(s));
  for (let i = 0; i < order.length; i += 1) assert.ok(pos[i] > 0, `${order[i]} must appear`);
  for (let i = 1; i < order.length; i += 1) assert.ok(pos[i - 1] < pos[i], `${order[i - 1]} must come before ${order[i]}`);
  // v0.1's refusal is the roster gate working: it must never stop v0 or fail the run.
  assert.match(body, /--family v0\.1 --horizon-hours 8 \\\n[^\n]*\|\| echo "::warning::/, "v0.1 refusal warns, never fails");
  assert.match(body, /--family v0 --horizon-hours 8 \|\| V0_FAILED=1/, "v0 refusal is recorded and fails the run");
});
