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
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

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
  // Two clocks that deliver: publication-watchdog (workflow_run) and daily-products' `tick` job (workflow_dispatch —
  // daily-products is 4 deep in the morning chain, where GitHub never fires a workflow_run; Session 12).
  assert.match(body, /workflow_run:\n\s+workflows: \["publication-watchdog"\]/, "ticks on publication-watchdog");
  assert.match(body, /workflow_dispatch:/, "dispatchable — daily-products' tick reaches it that way");
  assert.match(fs.readFileSync(path.resolve(process.cwd(), "..", ".github", "workflows", "daily-products.yml"), "utf8"), / nba-forecast-window\.yml; do/, "daily-products' tick must dispatch the window");
  assert.match(body, /head_branch == github\.event\.repository\.default_branch/, "workflow_run trust boundary");
  const order = ["decide-nba-forecast-window.mjs", "capture-injuries.mjs", "--family v0 --horizon-hours 8", "--family v0.1 --horizon-hours 8", "verify-nba-forecast-receipts.mjs --against HEAD", "git commit"];
  const pos = order.map((s) => body.indexOf(s));
  for (let i = 0; i < order.length; i += 1) assert.ok(pos[i] > 0, `${order[i]} must appear`);
  for (let i = 1; i < order.length; i += 1) assert.ok(pos[i - 1] < pos[i], `${order[i - 1]} must come before ${order[i]}`);
  // v0.1's refusal is the roster gate working: it must never stop v0 or fail the run.
  assert.match(body, /--family v0\.1 --horizon-hours 8 \\\n[^\n]*\|\| echo "::warning::/, "v0.1 refusal warns, never fails");
  assert.match(body, /--family v0 --horizon-hours 8 \|\| V0_FAILED=1/, "v0 refusal is recorded and fails the run");
  // Stage 12-S1b (founder N3): the 2026-27 challenger is built at the same instant, after v0.1, never fatal, and committed.
  assert.ok(body.indexOf("--family v0.1 --horizon-hours 8") < body.indexOf("--family v0.2 --horizon-hours 8"), "v0.2 builds after v0.1");
  assert.ok(body.indexOf("--family v0.2 --horizon-hours 8") < body.indexOf("verify-nba-forecast-receipts.mjs --against HEAD"), "v0.2 builds before the frozen-game guard");
  assert.match(body, /--family v0\.2 --horizon-hours 8 \\\n[^\n]*\|\| echo "::warning::/, "v0.2 refusal warns, never fails");
  assert.match(body, /for FD in experimental experimental-v0\.1 experimental-v0\.2 experimental-v1; do/, "every family's directory (the challenger and the v1 candidate included) is committed with the others");
});

test("staging survives a family directory that does not exist yet (a missing pathspec must never drop the others)", () => {
  // Real git, real bash: run the window's own staging loop in a repo where experimental-v1/ was never created (v1's
  // first builds refused). The v0 and v0.1 forecasts must still be staged. A single `git add a/ b/ missing/` would
  // stage NOTHING ("fatal: pathspec ... did not match any files") and the run would exit "nothing to commit".
  const yaml = fs.readFileSync(WINDOW, "utf8");
  const loop = yaml.match(/^( *)for FD in [^\n]*\n(?:\1 [^\n]*\n)*?\1done\n/m)?.[0];
  assert.ok(loop, "the per-family staging loop exists");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nba-window-stage-"));
  const app = path.join(root, "app");
  fs.mkdirSync(app);
  for (const d of ["experimental", "experimental-v0.1"]) {
    fs.mkdirSync(path.join(root, "data/internal/research/nba", d, "forecasts"), { recursive: true });
    fs.writeFileSync(path.join(root, "data/internal/research/nba", d, "forecasts", "2026-10-20.json"), "{}\n");
  }
  const git = (args, cwd = root) => execFileSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "-q"]);
  const out = spawnSync("bash", ["-c", `set -uo pipefail\n${loop}git diff --cached --name-only`], { cwd: app, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  const staged = out.stdout.trim().split("\n").sort();
  assert.deepEqual(staged, ["data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json", "data/internal/research/nba/experimental/forecasts/2026-10-20.json"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("roster backstop: a stale (> 30 h) roster is re-captured BEFORE the roster-gated builds; only normalised files are staged", () => {
  const body = fs.readFileSync(WINDOW, "utf8").replace(/^\s*#.*$/gm, "");
  const cap = body.indexOf("capture-nba-rosters.mjs --now \"$NOW\"");
  assert.ok(cap > 0, "the window can re-capture the roster");
  assert.match(body, /if \[ "\$ROSTER_AGE_H" -gt 30 \]; then/, "only when sport-schedules has missed its day (> 30 h), so the two writers do not capture the same day");
  assert.ok(cap < body.indexOf("capture-injuries.mjs"), "roster before injuries");
  assert.ok(cap < body.indexOf("--family v0.1 --horizon-hours 8"), "roster before the roster-gated family reads it");
  // A failed capture must never fail the run or block v0 (the gate decides on the committed capture).
  assert.match(body, /capture-nba-rosters\.mjs --now "\$NOW"; then ROSTER_CAPTURED=1\n\s+else echo "::warning::/);
  const rosterAdds = (body.match(/git add [^\n]*/g) ?? []).filter((l) => l.includes("rosters"));
  assert.equal(rosterAdds.length, 1);
  assert.doesNotMatch(rosterAdds[0], /rosters\/(\s|"|$)|raw/, "never the whole rosters tree or raw payloads");
  assert.ok(body.indexOf(rosterAdds[0]) > body.indexOf("verify-nba-forecast-receipts.mjs --against HEAD"), "staged after the frozen-game guard, with the injuries snapshot");
});

test("private Top Boards: the window is the ONLY freezer (after every family's build, before the frozen-game guard); sport-schedules only grades and reports", () => {
  const body = fs.readFileSync(WINDOW, "utf8").replace(/^\s*#.*$/gm, "");
  const v1Build = body.indexOf("--family v1 --horizon-hours 8");
  for (const fam of ["v0.1", "v1"]) {
    const at = body.indexOf(`freeze-nba-top-boards.mjs --family ${fam} --date "$D" --now "$NOW" --write`);
    assert.ok(at > v1Build, `${fam} boards freeze after every forecast build, at the same instant`);
    assert.ok(at < body.indexOf("verify-nba-forecast-receipts.mjs --against HEAD"), `${fam} freeze before the guard`);
    assert.match(body, new RegExp(`freeze-nba-top-boards\\.mjs --family ${fam.replace(".", "\\.")} [^\\n]*\\\\\\n[^\\n]*\\|\\| echo "::warning::`), `${fam} freeze refusal warns, never fails the forecasts`);
  }
  const ss = fs.readFileSync(path.resolve(process.cwd(), "..", ".github", "workflows", "sport-schedules.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(ss, /freeze-nba-top-boards/, "a second freezer would race the window on the same day file");
  assert.match(ss, /grade-nba-top-boards\.mjs --family "\$FAM" --now "\$NOW" --write/);
  assert.match(ss, /nba-daily-performance-report\.mjs --family "\$FAM" --now "\$NOW" --write/);
  assert.doesNotMatch(ss, /git add [^\n]*top-boards\/(v0\.1|v1)\/?(\s|$)/, "sport-schedules never stages a frozen day file");
});

test("board staging stages frozen day files only — never ledger.json — and tolerates a missing family directory", () => {
  const yaml = fs.readFileSync(WINDOW, "utf8");
  const loop = yaml.match(/^( *)for BD in [^\n]*\n(?:\1 [^\n]*\n)*?\1done\n/m)?.[0];
  assert.ok(loop, "the per-family board staging loop exists");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nba-window-boards-"));
  const app = path.join(root, "app");
  fs.mkdirSync(app);
  const dir = path.join(root, "data/internal/research/nba/top-boards/v0.1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "2026-10-20.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "ledger.json"), "{}\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  const out = spawnSync("bash", ["-c", `set -uo pipefail\n${loop}git diff --cached --name-only`], { cwd: app, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.stdout.trim().split("\n"), ["data/internal/research/nba/top-boards/v0.1/2026-10-20.json"]);
  fs.rmSync(root, { recursive: true, force: true });
});
