/**
 * P258 wiring guards: the new observers are actually invoked, and the Python tests have a home.
 * A guard that exists in src/ but is called from no workflow is the "built-but-unscheduled" class.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.join(process.cwd(), "..");
const read = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const WD = read(".github/workflows/cron-watchdog.yml");

test("cron-watchdog runs the morning-chain cancel watch and re-dispatches a stranded stage", () => {
  assert.match(WD, /node app\/scripts\/ops\/chain-cancel-watch\.mjs/);
  assert.match(WD, /if: steps\.chain\.outputs\.state == 'STRANDED' && steps\.decide\.outputs\.decision != 'DISPATCH'/,
    "never a second dispatch on top of the watchdog's own recovery");
  assert.match(WD, /gh workflow run "\$\{STAGE\}\.yml"[\s\S]{0,200}bash scripts\/ops_alert\.sh/, "recovery is announced");
});

test("cron-watchdog checks the free feeds and publishes the report", () => {
  assert.match(WD, /node app\/scripts\/ops\/feed-health\.mjs --json app\/public\/data\/ops\/feed-health\.json/);
  const commit = WD.slice(WD.indexOf("- name: Commit the coverage report"));
  assert.match(commit, /app\/public\/data\/ops\/feed-health\.json/, "a report generated and never committed is the 62-hour-outage shape");
});

test("quality-gate runs the pipeline Python tests on pipeline changes", () => {
  const QG = read(".github/workflows/quality-gate.yml");
  assert.match(QG, /bash scripts\/ci\/run-python-tests\.sh/);
  assert.match(QG.slice(0, QG.indexOf("pull_request:")), /- "pipeline\/\*\*"/, "push path filter includes pipeline/");
  const runner = read("scripts/ci/run-python-tests.sh");
  assert.match(runner, /REFUSED: no python tests found/, "zero tests found must fail, not pass");
});

test("soccer-leagues builds the EPL closing-line benchmark and publishes it", () => {
  const SL = read(".github/workflows/soccer-leagues.yml");
  assert.match(SL, /node scripts\/soccer\/build-epl-closing-benchmark\.mjs/);
  assert.match(SL, /capture-football-data\.mjs --leagues epl/, "the EPL history is refreshed before the join");
  const commit = SL.slice(SL.indexOf("- name: Commit and push"));
  assert.match(commit, /data\/internal\/research\/soccer\/epl\/closing-benchmark-v1\.json/);
});
