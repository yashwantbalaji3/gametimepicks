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

test("nflverse-weekly captures snap counts for the participation preregistration and commits them", () => {
  const NW = read(".github/workflows/nflverse-weekly.yml");
  assert.match(NW, /node scripts\/nfl\/capture-nfl-snap-counts\.mjs --now/);
  const commit = NW.slice(NW.indexOf("- name: Commit the derived tables"));
  assert.match(commit, /git add [^\n]*data\/internal\/research\/nfl\/snap-counts\//);
});

test("the CI python job installs pytest (two script-style tests import it)", () => {
  assert.match(read(".github/workflows/quality-gate.yml"), /pip install -r pipeline\/requirements\.txt pytest/);
});

test("the Dixon-Coles v2 shadow runs daily in its own workflow, grades before it forecasts, and stays private", () => {
  const DC = read(".github/workflows/soccer-dc-shadow.yml");
  const grade = DC.indexOf("dixon-coles-shadow.mjs --grade");
  const forecast = DC.indexOf("dixon-coles-shadow.mjs --now");
  assert.ok(grade > 0 && forecast > grade, "grade finished matches first, then forecast");
  assert.ok(!/continue-on-error/.test(DC), "a refusal of the frozen registration must fail the job");
  assert.ok(!/app\/public/.test(DC.replace(/^#.*$/gm, "")), "research only: nothing published");
  assert.match(DC, /group: soccer-dc-shadow/, "never in the public writers' queue");
  assert.ok(!/dixon-coles/.test(read(".github/workflows/soccer-leagues.yml")), "the public job never waits on research");
});

test("the scripts are linted for identifiers that do not exist, and CI runs it", () => {
  const pkg = JSON.parse(read("app/package.json"));
  assert.match(pkg.scripts["lint:scripts"], /eslint .*eslint-scripts\.json.*scripts\/\*\*\/\*\.mjs/, "the lint covers every script");
  assert.ok(pkg.devDependencies.eslint, "and the linter is a pinned dependency, not an npx download");
  const cfg = JSON.parse(read("app/eslint-scripts.json"));
  assert.equal(cfg.rules["no-undef"], "error", "the rule that catches a variable that was never defined");
  const QG = read(".github/workflows/quality-gate.yml");
  assert.match(QG, /run: npm run lint:scripts/);
  assert.ok(QG.indexOf("npm run lint:scripts") < QG.indexOf("npm run typecheck"), "cheapest check first");
});
