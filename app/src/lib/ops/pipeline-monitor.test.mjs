/**
 * Pipeline monitor (founder P0, Track B #6, 2026-11-10): one guard per condition, fed GitHub REST responses from
 * fixtures (__fixtures__/pipeline-monitor/api-responses.json, shapes from the live API), plus the alert de-dup,
 * the zero-build check on the real Vercel ignore step, and the workflow's read-only / trigger guards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  evaluatePipeline, foldStatus, gatherPipelineInputs, pathGlobRe, pullRequestPaths, serializeStatus, skipCiMarker,
  MAX_REQUESTS_PER_EVALUATION, PIPELINE_STATUS_FILE, THRESHOLDS,
} from "./pipeline-monitor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");
const REPO = path.resolve(APP, "..");
const FIX = path.join(HERE, "__fixtures__", "pipeline-monitor");
const BASE = JSON.parse(fs.readFileSync(path.join(FIX, "api-responses.json"), "utf8"));
const CRON = JSON.parse(fs.readFileSync(path.join(FIX, "cron-slot-watchdog.json"), "utf8"));
const GATE_YAML = fs.readFileSync(path.join(REPO, ".github/workflows/quality-gate.yml"), "utf8");
const WORKFLOW = fs.readFileSync(path.join(REPO, ".github/workflows/pipeline-monitor.yml"), "utf8");
const NOW = BASE.nowIso;

/** A fixture-backed `api(path)`: unknown paths throw, so a request the monitor should not make fails the test. */
function fixtureApi(overrides = {}) {
  const responses = { ...structuredClone(BASE.api), ...overrides };
  const calls = [];
  const api = (p) => {
    const rel = p.replace(/^repos\/o\/r\//, "");
    calls.push(rel);
    if (!(rel in responses)) throw new Error(`unexpected API request: ${rel}`);
    return structuredClone(responses[rel]);
  };
  return { api, calls };
}
const run = (overrides = {}, { cron = CRON, now = NOW } = {}) => {
  const { api, calls } = fixtureApi(overrides);
  const input = gatherPipelineInputs(api, { repo: "o/r", nowIso: now, qualityGateYaml: GATE_YAML, cronSlotReport: cron });
  return { conditions: evaluatePipeline(input, now), calls };
};
const keysOf = (conds, kind) => conds.filter((c) => c.kind === kind).map((c) => c.key);

/* ---- 1. PR head with no workflow run ---- */

test("skip-CI marker detection: every spelling GitHub honours, in the subject or the body; prose mentions are not markers", () => {
  for (const m of ["[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]", "[SKIP CI]"]) {
    assert.equal(skipCiMarker(`fix: thing ${m}`)?.toLowerCase(), m.toLowerCase(), `subject ${m}`);
    assert.equal(skipCiMarker(`fix: thing\n\nThe job commits as "auto: x ${m}" when it changed.`)?.toLowerCase(), m.toLowerCase(), `body ${m}`);
  }
  assert.equal(skipCiMarker("fix: thing\n\nskip-checks: true"), "skip-checks: true");
  assert.equal(skipCiMarker("docs: explain why we skip ci on data commits"), null);
  assert.equal(skipCiMarker("fix: thing\n\nskip-checks: false"), null);
  assert.equal(skipCiMarker(undefined), null);
});

test("PR_HEAD_NO_RUN: #1302's shape — the marker quoted in the head commit BODY, no run 16 min later — is caught and named", () => {
  const { conditions } = run();
  const c = conditions.find((x) => x.key === "PR_HEAD_NO_RUN:1302:3c23246140");
  assert.ok(c, JSON.stringify(conditions, null, 1));
  assert.match(c.detail, /\(pushed 2026-11-10T19:13:20Z\): no workflow run 5\+ min after push — head commit message carries "\[skip ci\]"/);
});

test("PR_HEAD_NO_RUN: a merge-conflicted PR with no run is caught with that reason", () => {
  const c = run().conditions.find((x) => x.key === "PR_HEAD_NO_RUN:1402:cccccccccc");
  assert.ok(c);
  assert.match(c.detail, /merge conflict/);
});

test("PR_HEAD_NO_RUN stays quiet for a PR that ran, a docs-only PR the gate's paths do not cover, and a push under 5 min old", () => {
  const prs = keysOf(run().conditions, "PR_HEAD_NO_RUN");
  assert.deepEqual(prs, ["PR_HEAD_NO_RUN:1302:3c23246140", "PR_HEAD_NO_RUN:1402:cccccccccc"]);
  // #1401 was pushed 3 min before `now`; at +5 min it is caught.
  const later = run({}, { now: "2026-11-10T19:32:30Z" });
  assert.ok(keysOf(later.conditions, "PR_HEAD_NO_RUN").includes("PR_HEAD_NO_RUN:1401:bbbbbbbbbb"));
});

test("PR_HEAD_NO_RUN: the monitor's own pull_request_target run never counts as CI having run", () => {
  const { conditions } = run({ "actions/runs?head_sha=3c23246140af6461dc743d716374fa307f7ad1b0&per_page=20": { workflow_runs: [{ id: 9, name: "quality-gate", event: "pull_request", status: "queued" }] } });
  assert.ok(!keysOf(conditions, "PR_HEAD_NO_RUN").some((k) => k.startsWith("PR_HEAD_NO_RUN:1302")), "a real run clears it");
  assert.ok(keysOf(run().conditions, "PR_HEAD_NO_RUN").some((k) => k.startsWith("PR_HEAD_NO_RUN:1302")), "only the monitor's own run: still no CI");
});

test("PR scan budget: PRs idle past the lookback are not re-read, and a PR that ran costs one request", () => {
  const { calls } = run();
  assert.ok(!calls.some((c) => c.includes("dddddddddd")), "PR #1100 (idle since 10-20) must not be requested");
  assert.deepEqual(calls.filter((c) => c.includes("6f290cb2c0") || c.includes("pulls/1295")), ["actions/runs?head_sha=6f290cb2c0a440990e683c73b91622df5e4f71db&per_page=20"]);
});

test("path globs: \"**\" spans directories, \"*\" does not", () => {
  assert.ok(pathGlobRe("app/**").test("app/src/app/page.tsx"));
  assert.ok(pathGlobRe(".github/workflows/**").test(".github/workflows/a.yml"));
  assert.ok(pathGlobRe("app/next.config.*").test("app/next.config.mjs"));
  assert.ok(!pathGlobRe("app/next.config.*").test("app/next.config.d/x.mjs"));
  assert.ok(pathGlobRe("app/**/x.ts").test("app/x.ts") && pathGlobRe("app/**/x.ts").test("app/a/b/x.ts"));
  assert.ok(!pathGlobRe("app/**").test("docs/app/x.md"));
});

test("rate budget: one evaluation of the fixture pipeline stays inside the per-evaluation request ceiling", () => {
  const { calls } = run();
  assert.ok(calls.length <= MAX_REQUESTS_PER_EVALUATION, `${calls.length} requests`);
  assert.ok(MAX_REQUESTS_PER_EVALUATION * 10 <= 1000, "ten evaluations an hour must fit the token's hourly limit");
});

test("the gate's pull_request paths are read from quality-gate.yml itself (one source)", () => {
  const paths = pullRequestPaths(GATE_YAML);
  assert.ok(paths.includes("app/**") && paths.includes(".github/workflows/**"), JSON.stringify(paths));
  assert.equal(pullRequestPaths("on:\n  pull_request:\n  push:\n"), null);
});

/* ---- 2. Long quality-gate runs and zombies ---- */

test("QUALITY_GATE_LONG: in progress 85 min is caught; 50 min is not; a long non-gate run is not", () => {
  const { conditions } = run();
  assert.deepEqual(keysOf(conditions, "QUALITY_GATE_LONG"), ["QUALITY_GATE_LONG:42900000001"]);
  assert.match(conditions.find((c) => c.kind === "QUALITY_GATE_LONG").detail, /in progress since 2026-11-10T18:05:00Z \(over 75 min\)/);
});

test("RUN_ZOMBIE: the three real 2026-10-07 queued runs are caught, by run id", () => {
  assert.deepEqual(keysOf(run().conditions, "RUN_ZOMBIE"), ["RUN_ZOMBIE:37655501437", "RUN_ZOMBIE:37655527836", "RUN_ZOMBIE:37672956236"]);
});

/* ---- 3. Scheduled data jobs (cron-watchdog's report) ---- */

test("CRON_SLOT_MISSED: missed slots and failing jobs come from cron-watchdog's report; a stale report is itself an alert", () => {
  const keys = keysOf(run().conditions, "CRON_SLOT_MISSED");
  assert.deepEqual(keys, [
    "CRON_SLOT_MISSED:nfl-event-window.yml:failing:failure",
    "CRON_SLOT_MISSED:report-stale:2026-11-08T16:55:26Z",
    "CRON_SLOT_MISSED:ufc-fight-week.yml:2026-11-02T13:00:00.000Z",
  ]);
  const fresh = { ...CRON, generatedAt: "2026-11-10T14:31:00Z", sports: { mlb: CRON.sports.mlb } };
  assert.deepEqual(keysOf(run({}, { cron: fresh }).conditions, "CRON_SLOT_MISSED"), [], "a fresh, clean report is quiet");
  assert.deepEqual(keysOf(run({}, { cron: null }).conditions, "CRON_SLOT_MISSED"), ["CRON_SLOT_MISSED:report-missing"]);
});

test("CRON_SLOT_MISSED reuses cron-watchdog's model: no cron expression is parsed or scheduled here", () => {
  const src = fs.readFileSync(path.join(HERE, "pipeline-monitor.mjs"), "utf8");
  assert.doesNotMatch(src, /from\s+["'][^"']*cron-(slots|punctuality)\.mjs["']|\b(cronMatches|expectedSlots|missedSlots|attributeRuns)\(/);
  assert.match(src, /cron-slot-watchdog\.json/);
});

/* ---- 4. Vercel Production failures ---- */

test("VERCEL_PROD_FAILED: an errored Production deployment is caught; the coalescing cancel and old deployments are not", () => {
  const { conditions, calls } = run();
  assert.deepEqual(keysOf(conditions, "VERCEL_PROD_FAILED"), ["VERCEL_PROD_FAILED:7694430396"]);
  assert.ok(!calls.includes("deployments/7600000000/statuses?per_page=1"), "a deployment past the lookback is not read");
  const allCanceled = run({ "deployments/7694430396/statuses?per_page=1": [{ state: "failure", description: "Canceled from the Vercel Dashboard" }] });
  assert.deepEqual(keysOf(allCanceled.conditions, "VERCEL_PROD_FAILED"), []);
});

/* ---- 5. main's quality gate ---- */

test("MAIN_GATE_RED: main's newest completed gate run failing is caught; success and cancelled are not", () => {
  assert.deepEqual(keysOf(run().conditions, "MAIN_GATE_RED"), ["MAIN_GATE_RED:209c9395aa"]);
  const path1 = "actions/workflows/quality-gate.yml/runs?branch=main&status=completed&per_page=1";
  for (const conclusion of ["success", "cancelled"]) {
    const r = run({ [path1]: { workflow_runs: [{ id: 1, status: "completed", conclusion, head_sha: "209c9395aa" }] } });
    assert.deepEqual(keysOf(r.conditions, "MAIN_GATE_RED"), [], conclusion);
  }
});

/* ---- De-dup ---- */

test("de-dup: one alert per condition key; an unchanged pipeline writes identical bytes; a cleared condition alerts again on recurrence", () => {
  const conds = run().conditions;
  const first = foldStatus(null, conds, NOW);
  assert.equal(first.alerts.length, conds.length);
  const second = foldStatus(first.status, conds, "2026-11-10T19:45:00Z");
  assert.deepEqual(second.alerts, [], "nothing new → no alert");
  assert.equal(serializeStatus(second.status), serializeStatus(first.status), "nothing new → byte-identical status (no commit)");
  const zombieGone = conds.filter((c) => c.key !== "RUN_ZOMBIE:37672956236");
  const third = foldStatus(second.status, zombieGone, "2026-11-10T20:00:00Z");
  assert.deepEqual(third.cleared, ["RUN_ZOMBIE:37672956236"]);
  assert.deepEqual(third.alerts, []);
  const fourth = foldStatus(third.status, conds, "2026-11-10T20:15:00Z");
  assert.deepEqual(fourth.alerts.map((a) => a.key), ["RUN_ZOMBIE:37672956236"], "a recurrence alerts once more");
  assert.equal(fourth.status.conditions.find((c) => c.key === "RUN_ZOMBIE:37672956236").since, "2026-11-10T20:15:00Z");
});

test("de-dup: the same pipeline evaluated 15 and 20 min later (nothing new) writes byte-identical status (no commit per run)", () => {
  const first = foldStatus(null, run().conditions, NOW).status;
  for (const later of ["2026-11-10T19:45:00Z", "2026-11-10T19:50:00Z"]) {
    const again = foldStatus(first, run({}, { now: later }).conditions.filter((c) => c.key !== "PR_HEAD_NO_RUN:1401:bbbbbbbbbb"), later);
    assert.deepEqual(again.alerts, [], later);
    assert.equal(serializeStatus(again.status), serializeStatus(first), later);
  }
});

test("a new push to the same PR is a new condition (keyed by head), so it alerts", () => {
  const a = foldStatus(null, [{ key: "PR_HEAD_NO_RUN:1302:3c23246140", kind: "PR_HEAD_NO_RUN", detail: "x" }], NOW);
  const b = foldStatus(a.status, [{ key: "PR_HEAD_NO_RUN:1302:46af2bfc68", kind: "PR_HEAD_NO_RUN", detail: "y" }], NOW);
  assert.deepEqual(b.alerts.map((x) => x.key), ["PR_HEAD_NO_RUN:1302:46af2bfc68"]);
});

test("an unreadable API throws before anything is folded — a partial read never clears a condition", () => {
  const api = () => { throw new Error("HTTP 502"); };
  assert.throws(() => gatherPipelineInputs(api, { repo: "o/r", nowIso: NOW, qualityGateYaml: GATE_YAML, cronSlotReport: CRON }), /502/);
});

/* ---- Zero builds ---- */

test("zero builds: a commit touching only the status file is skipped by the real Vercel ignore step; an app change still builds", () => {
  const sh = fs.readFileSync(path.join(APP, "scripts", "vercel-ignore-build.sh"), "utf8");
  assert.doesNotMatch(sh, /data\/internal\/ops\/pipeline-status/, "the status file must never be listed as a build input");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-status-build-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  try {
    g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
    w("app/scripts/vercel-ignore-build.sh", sh); w("app/src/lib/x.ts", "1"); w(PIPELINE_STATUS_FILE, "{}\n");
    g("add", "-A"); g("commit", "-q", "-m", "deployed");
    const base = g("rev-parse", "HEAD").trim();
    const ignore = () => spawnSync("bash", [path.join(dir, "app/scripts/vercel-ignore-build.sh")], { cwd: path.join(dir, "app"), encoding: "utf8", env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "" } });
    w(PIPELINE_STATUS_FILE, '{"state":"ATTENTION"}\n'); g("add", "-A"); g("commit", "-q", "-m", "auto: pipeline status");
    const skip = ignore();
    assert.equal(skip.status, 0, `a status-only commit must not build: ${skip.stdout}${skip.stderr}`);
    w("app/src/lib/x.ts", "2"); g("add", "-A"); g("commit", "-q", "-m", "plus a real input");
    assert.equal(ignore().status, 1, "a real build input must still build");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ---- Workflow guards ---- */

const runBlocks = [...WORKFLOW.matchAll(/^\s+run: \|\n((?:\s{10,}.*\n|\s*\n)*)|^\s+run: (.+)$/gm)].map((m) => m[1] ?? m[2]).join("\n");

test("workflow: event wake-ups (PR push, quality-gate runs, commit statuses) plus exactly ONE low-frequency cron backstop", () => {
  for (const ev of ["pull_request_target:", "workflow_run:", "status:", "schedule:", "workflow_dispatch:"]) assert.ok(WORKFLOW.includes(`\n  ${ev}`), ev);
  assert.match(WORKFLOW, /workflows: \[quality-gate\]/);
  const crons = [...WORKFLOW.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert.equal(crons.length, 1);
  const hours = crons[0].split(/\s+/)[1];
  assert.ok(/^\*\/([3-9]|1\d|2[0-4])$/.test(hours) || /^\d+(,\d+)*$/.test(hours), `backstop "${crons[0]}" must run at most every 3 h`);
  assert.doesNotMatch(WORKFLOW, /^\s+pull_request:/m, "pull_request is skipped by the very marker this must catch");
});

test("workflow: read-only — never re-runs, cancels, approves or merges; actions permission is read", () => {
  const scriptSrc = fs.readFileSync(path.join(APP, "scripts/ops/pipeline-monitor.mjs"), "utf8") + fs.readFileSync(path.join(HERE, "pipeline-monitor.mjs"), "utf8");
  for (const src of [WORKFLOW, scriptSrc]) {
    assert.doesNotMatch(src, /gh\s+(run\s+(rerun|cancel)|pr\s+(merge|review|close)|workflow\s+run)|\/(rerun|cancel|merge|approve|force-cancel)\b|--method|-X\s*(POST|PUT|PATCH|DELETE)|method:\s*["'](POST|PUT|PATCH|DELETE)/i);
  }
  assert.match(WORKFLOW, /actions: read/);
  assert.doesNotMatch(WORKFLOW, /actions: write|pull-requests: write|statuses: write|deployments: write/);
});

test("workflow: pull_request_target never touches PR code or expands PR-controlled text into a script", () => {
  assert.doesNotMatch(WORKFLOW, /github\.event\.pull_request\.head|refs\/pull\/|github\.head_ref/);
  assert.match(WORKFLOW, /uses: actions\/checkout@v5\n\s+with:\n\s+ref: main/);
  assert.doesNotMatch(runBlocks, /\$\{\{\s*github\.event\./, "no event field may be interpolated into a run script");
});

test("workflow: the only write is the status file, through the shared commit helper, as github-actions[bot], with the skip marker", () => {
  const adds = [...runBlocks.matchAll(/git add ([^\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(adds, [PIPELINE_STATUS_FILE]);
  assert.match(runBlocks, /GENERATED_PATHS="data\/internal\/ops\/pipeline-status\.json"[\s\\]+bash scripts\/ci\/commit-generated\.sh "auto: pipeline status [^"]*\[skip ci\]"/);
  assert.match(runBlocks, /41898282\+github-actions\[bot\]@users\.noreply\.github\.com/);
  assert.doesNotMatch(runBlocks, /git push/);
});

test("workflow: alerts go through scripts/ops_alert.sh with OPS_WEBHOOK_URL, one per new condition, and a failed monitor run alerts too", () => {
  assert.match(WORKFLOW, /OPS_WEBHOOK_URL: \$\{\{ secrets\.OPS_WEBHOOK_URL \}\}/);
  assert.match(runBlocks, /PHASE="pipeline-monitor\/\$\{KIND\}" OPS_ALERT_KIND=warning EXIT_STATUS=0 ERROR_LINE="\$DETAIL" bash scripts\/ops_alert\.sh/);
  assert.match(WORKFLOW, /if: failure\(\)[\s\S]*bash scripts\/ops_alert\.sh/);
  assert.equal(THRESHOLDS.prNoRunMinutes, 5);
  assert.match(WORKFLOW, /sleep (\d+)/);
  assert.ok(Number(/sleep (\d+)/.exec(WORKFLOW)[1]) > THRESHOLDS.prNoRunMinutes * 60, "the PR wait outlasts the no-run threshold");
});
