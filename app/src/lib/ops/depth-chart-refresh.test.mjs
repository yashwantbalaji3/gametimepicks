/**
 * THE DEPTH-CHART REFRESH JOB — the prerequisite for founder gate #2 (§12.2).
 *
 * 🔴 WHY IT EXISTS. `acquire-depth-chart-research.mjs` had been in the repository since 2026-09-08
 * and appeared in NO workflow. The committed artifact had exactly ONE commit in history, its newest
 * snapshot was eighteen days old, and the upstream source was current the whole time. Measured
 * against the 2026-09-27 slate, 28 team-board questions across fourteen games:
 *
 *     committed (newest 2026-09-08)   3/7/14-day bound → RESOLVED  0 / 28, age 18.3 days
 *     refreshed (newest 2026-09-26)   3-day bound      → RESOLVED 28 / 28, age  0.3 days
 *     CLE starter under a 14-day bound:  STALE (none)  →  RESOLVED Deshaun Watson
 *
 * Run: cd app && npx tsx --test src/lib/ops/depth-chart-refresh.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const WF = fs.readFileSync(path.join(ROOT, ".github/workflows/nfl-depth-charts.yml"), "utf8");
/*
 * ⚠ COMMENTS STRIPPED FOR THE "MUST NOT CONTAIN" CHECKS. The first cut scanned raw YAML for
 * `|| true` and `continue-on-error` — and the workflow's own comment explaining that it uses
 * NEITHER matched both. A guard that reads the explanation is measuring the documentation. The
 * repo's `epl-closeout-guard` already keeps this rule for source scans; it applies to YAML too.
 */
const WF_CODE = WF.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const ACQ = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/acquire-depth-chart-research.mjs"), "utf8");

test("🔴 the acquirer is actually SCHEDULED — an armed script nothing invokes never fires", () => {
  assert.match(WF, /schedule:/, "a workflow_dispatch-only job is how eighteen days happened");
  assert.match(WF, /acquire-depth-chart-research\.mjs/, "the workflow must run the acquirer");
  const crons = [...WF.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(crons.length >= 2, `expected a real cadence, got ${JSON.stringify(crons)}`);
});

test("🔴 it never runs on SUNDAY — a research refresh must not compete during the acceptance", () => {
  const crons = [...WF.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  for (const c of crons) {
    const dow = c.trim().split(/\s+/)[4];
    assert.notEqual(dow, "0", `${c} fires on Sunday`);
    assert.notEqual(dow, "7", `${c} fires on Sunday`);
    assert.equal(/^\*|,0|0,|-/.test(dow) && dow !== "3" && dow !== "6", false,
      `${c} has a day-of-week field that may include Sunday`);
  }
});

test("the job commits what it produces, path-scoped, and nothing else", () => {
  assert.match(WF, /git add data\/internal\/research\/nfl\/depth-charts\//,
    "a writer whose output is outside its allowlist is built and never published");
  const adds = [...WF.matchAll(/git add ([^\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(adds, ["data/internal/research/nfl/depth-charts/"], "exactly one path, and it is this job's own");
});

test("🔴 a source failure is RED — no `|| true`, no `continue-on-error`, no `|| echo`", () => {
  /* A green step that fetched nothing is precisely how eighteen days would happen again with a
     workflow in place. This repository has lost a night's settlement to each of these. */
  assert.equal(/continue-on-error/.test(WF_CODE), false);
  assert.equal(/\|\|\s*true/.test(WF_CODE), false);
  assert.equal(/\|\|\s*echo/.test(WF_CODE), false);
  const acquire = WF.slice(WF.indexOf("Acquire the current season"), WF.indexOf("Commit the snapshot"));
  assert.match(acquire, /set -euo pipefail/);
});

test("an UNCHANGED source is a clean no-op, not a failure", () => {
  /* Most runs will find the same file. That is the source being stable, not the job failing. */
  assert.match(WF, /if git diff --cached --quiet; then echo "source unchanged/);
  const commit = WF.slice(WF.indexOf("Commit the snapshot"));
  assert.match(commit, /exit 0/, "the no-change path must exit clean");
  assert.match(commit, /::error::/, "and an exhausted push must still be an error");
});

test("🔴 content-addressed and write-once, so no filename can ever be rewritten", () => {
  /*
   * This is what makes the job safe to add beside every other bot: each distinct upstream file
   * lands as `<season>-<sha16>`, written with `flag: "wx"`. An untracked local copy can never
   * collide with a different bot-produced body under the same name — the defect that would have
   * aborted Sunday's `git pull` for the live-props artifacts.
   */
  assert.match(ACQ, /const stem = `\$\{season\}-\$\{hash\.slice\(0, 16\)\}`/);
  assert.match(ACQ, /flag: "wx"/);
  assert.equal((ACQ.match(/flag: "wx"/g) ?? []).length, 2, "both the json and the csv.gz must be write-once");
});

test("the acquirer refuses an invalid source rather than writing a partial snapshot", () => {
  assert.match(ACQ, /invalid\/incomplete source/);
  assert.match(ACQ, /if \(!response\.ok\) throw/);
});

test("it stays PRIVATE_RESEARCH — this job publishes nothing a reader sees", () => {
  assert.match(ACQ, /dataClass: "PRIVATE_RESEARCH"/);
  assert.equal(/app\/public/.test(WF_CODE), false, "a research refresh must not touch a public path");
});
