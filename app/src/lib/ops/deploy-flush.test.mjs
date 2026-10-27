/**
 * DEPLOY FLUSH — the 30-minute freshness backstop for the coalescing Vercel ignore step (build-cost reduction,
 * 2026-10-26). .github/workflows/deploy-flush.yml + app/scripts/ops/deploy-flush-decide.sh.
 *
 * What is pinned here:
 *   SHAPE      cron every 30 min + manual dispatch + Vercel's commit status, one flush at a time, contents: write, a
 *              User-Agent on the fetch;
 *   WAIT       on a final Vercel status for a main commit, sleep until the unchanged decision script first says
 *              flush=true (executed here with a fake clock, curl and sleep); never for preview commits, a lagging live
 *              read, or a span with nothing pending;
 *   ONE SOURCE the decision runs the real ignore step (no pathspec list of its own), so the flush and Vercel cannot
 *              disagree about what is code, critical or coalescible;
 *   NO FLOOD   a failed fetch, a bot challenge, a body without a SHA, a status-API error or a pending Vercel build all
 *              end the run with no commit — executed here against fake curl / gh, not just read;
 *   DECISION   on a throwaway repo with pinned commit times: flush only for overdue changes, never twice in 2 h;
 *   SUBJECT    the commit carries [deploy] (the ignore step's build token) and [skip ci], and never the word that the
 *              release conservation guard reads as a release.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WF_PATH = path.join(REPO, ".github/workflows/deploy-flush.yml");
const HELPER = path.join(REPO, "app/scripts/ops/deploy-flush-decide.sh");
const IGNORE = path.join(REPO, "app/scripts/vercel-ignore-build.sh");
const WF = fs.readFileSync(WF_PATH, "utf8");
const HELPER_TEXT = fs.readFileSync(HELPER, "utf8");

/** The `run: |` body of the step whose `- name:` is `name`, dedented (text-split, as the other workflow guards do). */
function stepRun(name) {
  const lines = WF.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `step "${name}" not found`);
  const stepIndent = lines[at].indexOf("-");
  const runAt = lines.findIndex((l, i) => i > at && /^\s*run: /.test(l));
  for (let i = at + 1; i < runAt; i++) assert.ok(lines[i].trim() === "" || lines[i].search(/\S/) > stepIndent, `step "${name}" has no run key of its own`);
  const inline = /^\s*run: (?!\|)(.+)$/.exec(lines[runAt]);
  if (inline) return inline[1];
  const runIndent = lines[runAt].search(/\S/);
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const ind = lines[i].search(/\S/);
    if (lines[i].trim() !== "" && ind <= runIndent) break;
    body.push(lines[i].slice(runIndent + 2));
  }
  return body.join("\n");
}
/** The `if:` of a step. */
function stepIf(name) {
  const m = new RegExp(`- name: ${name.replace(/[[\]().]/g, "\\$&")}\\n(?:\\s+(?!- name)[^\\n]*\\n)*?\\s+if: ([^\\n]+)`).exec(WF);
  return m?.[1] ?? "";
}

const fakeBin = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-flush-bin-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return dir;
};
const outputs = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const hasJq = spawnSync("jq", ["--version"], { encoding: "utf8" }).status === 0;

// ── SHAPE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("SHAPE: every 30 minutes, on demand and on Vercel's status; one flush at a time, may push, identifies itself", () => {
  assert.match(WF, /^\s+- cron: "\*\/30 \* \* \* \*"\s*$/m, "cron must be */30");
  assert.equal((WF.match(/- cron:/g) ?? []).length, 1, "exactly one schedule");
  assert.match(WF, /^\s+workflow_dispatch:/m);
  assert.match(WF, /^ {2}status:\s*$/m, "Vercel's commit status wakes the wait job");
  assert.doesNotMatch(WF, /^concurrency:/m, "no workflow-level group: a sleeping wait must not hold the flush queue");
  assert.match(WF, /^ {2}flush:\n\s+needs: wait\n/m);
  assert.match(WF, /\n {4}concurrency:\n\s+group: deploy-flush\n\s+cancel-in-progress: false\n {4}steps:/, "flush runs must not overlap");
  assert.match(WF, /^permissions:\n\s+contents: write\n\s+statuses: read/m);
  assert.match(WF, /https:\/\/gametimepicks\.yashwantbalaji\.com\/data\/build-info\.json/);
  assert.match(WF, /-A 'gtp-deploy-flush\/1\.0'/, "the fetch sends a User-Agent");
  assert.match(WF, /\.commit\.sha/);
  assert.match(WF, /fetch-depth: 400/);
  assert.match(WF, /--deepen=/, "falls back to deepening when the deployed SHA is older than the clone");
  assert.match(WF, /timeout-minutes: \d+/);
});

test("ONE SOURCE: the decision runs the real ignore step; neither file keeps a pathspec list of its own", () => {
  assert.match(stepRun("Decide (runs the real Vercel ignore step against the deployed SHA)"), /^bash app\/scripts\/ops\/deploy-flush-decide\.sh\s*$/m);
  assert.match(HELPER_TEXT, /bash "\$TOP\/app\/scripts\/vercel-ignore-build\.sh"/, "the helper must run the ignore script itself");
  assert.match(HELPER_TEXT, /VERCEL_GIT_PREVIOUS_SHA="\$DEPLOYED"/);
  assert.match(HELPER_TEXT, /GTP_GATE verdict=build tier=/, "the helper reads the gate's machine line");
  for (const [label, text] of [["workflow", WF], ["helper", HELPER_TEXT]]) {
    assert.doesNotMatch(text, /:\(top|app\/public\/data\/|data\/internal\//, `${label} must not carry pathspecs — vercel-ignore-build.sh is the one source`);
  }
  assert.match(fs.readFileSync(IGNORE, "utf8"), /_gate\(\) \{\n\s+echo "\[ignore-build\] GTP_GATE verdict=\$1 tier=\$2 trigger_epoch=\$\{3:-\}"/, "the ignore step still prints the line the helper parses");
});

test("SUBJECT: the flush commit carries [deploy] and [skip ci], and never the release word", () => {
  const push = stepRun("Push the empty [deploy] commit");
  const subject = /MSG="([^"]+)"/.exec(push)?.[1];
  assert.equal(subject, "auto: deploy flush [deploy] [skip ci]");
  assert.match(subject, /\[deploy\]/);
  assert.doesNotMatch(subject, /release/i, "a subject with that word reads as a release to the conservation guard");
  assert.doesNotMatch(push, /release/i);
  assert.match(push, /git commit -q --allow-empty -m "\$MSG"/, "the flush commit changes no file");
  assert.match(push, /git config user\.name\s+"github-actions\[bot\]"/);
  assert.match(push, /for attempt in 1 2 3 4 5; do/);
  assert.doesNotMatch(push, /--force|-f\b|push\s+-f/, "never force-push");
  assert.match(push, /exit 1\s*$/, "a push that never lands is visible");
});

test("NO FLOOD (static): only the push step commits, and it runs only on flush=true and not busy, after a SHA was read", () => {
  const steps = [...WF.matchAll(/- name: ([^\n]+)/g)].map((m) => m[1]);
  for (const name of steps) {
    if (name === "Push the empty [deploy] commit") continue;
    if (!/run:/.test(WF.split(`- name: ${name}`)[1]?.split("- name:")[0] ?? "")) continue;
    assert.doesNotMatch(stepRun(name), /git (commit|push)/, `${name} must not commit`);
  }
  assert.equal(stepIf("Push the empty [deploy] commit"), "steps.decide.outputs.flush == 'true' && steps.busy.outputs.busy == 'false'");
  assert.equal(stepIf("Decide (runs the real Vercel ignore step against the deployed SHA)"), "steps.live.outputs.sha != ''");
  assert.equal(stepIf("Skip while Vercel is already deploying a newer commit"), "steps.decide.outputs.flush == 'true'");
  assert.equal(stepIf("Reach the deployed SHA in the clone"), "steps.live.outputs.sha != ''");
});

// ── NO FLOOD (executed) ──────────────────────────────────────────────────────────────────────────────────────────────

test("NO FLOOD: a failed fetch, a bot challenge or a body without a SHA ends the live step with no SHA and exit 0", { skip: !hasJq && "jq not installed" }, () => {
  const body = stepRun("Read the deployed SHA from the live site");
  const sha = "6557ac8da312a6e3221d5297207e8458e655fcc0";
  const modes = {
    fail: ["exit 22", ""],
    challenge: ["echo '<html><title>Vercel Security Checkpoint</title></html>'", ""],
    nosha: [`echo '{"commit":{"message":"x"}}'`, ""],
    shortsha: [`echo '{"commit":{"sha":"6557ac8d"}}'`, ""],
    ok: [`echo '{"schema":1,"commit":{"sha":"${sha}"}}'`, sha],
  };
  for (const [mode, [curl, want]] of Object.entries(modes)) {
    const bin = fakeBin({ curl });
    const out = path.join(bin, "out.txt");
    fs.writeFileSync(out, "");
    try {
      const r = spawnSync("bash", ["-c", body], { encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: out } });
      assert.equal(r.status, 0, `${mode}: the live step must never fail the run: ${r.stdout}${r.stderr}`);
      assert.equal(outputs(out).sha, want, `${mode}: sha output`);
      if (!want) assert.match(r.stdout, /::warning::.*not flushing \(no commit\)/, `${mode}: says why`);
    } finally { fs.rmSync(bin, { recursive: true, force: true }); }
  }
});

test("NO FLOOD: a status-API error or a recent pending Vercel status means busy; a stale pending does not", () => {
  const body = stepRun("Skip while Vercel is already deploying a newer commit");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-flush-busy-"));
  const g = (...args) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g("init", "-q"); g("config", "user.email", "t@t.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  g("commit", "-q", "--allow-empty", "-m", "deployed");
  const deployed = g("rev-parse", "HEAD");
  g("commit", "-q", "--allow-empty", "-m", "newer");
  const nowS = Math.floor(Date.now() / 1000);
  const modes = {
    "api error": ["exit 1", "true"],
    "pending 2 min ago": [`echo "pending ${nowS - 120}"`, "true"],
    "pending 2 h ago (stuck record)": [`echo "pending ${nowS - 7200}"`, "false"],
    "success": [`echo "success ${nowS - 120}"`, "false"],
    "no Vercel status": ['echo "none 0"', "false"],
    "garbage": ['echo "pending soon"', "true"],
  };
  try {
    for (const [mode, [gh, want]] of Object.entries(modes)) {
      const bin = fakeBin({ gh });
      const out = path.join(bin, "out.txt");
      fs.writeFileSync(out, "");
      const r = spawnSync("bash", ["-c", body], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: out, DEPLOYED_SHA: deployed, REPO: "o/r", GH_TOKEN: "x" } });
      assert.equal(r.status, 0, `${mode}: ${r.stdout}${r.stderr}`);
      assert.equal(outputs(out).busy, want, `${mode}: busy`);
      fs.rmSync(bin, { recursive: true, force: true });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── DECISION (the helper on a throwaway repo) ────────────────────────────────────────────────────────────────────────

const T = 1761480000;
function flushRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-flush-decide-"));
  const g = (args, env = {}) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } }); assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  g(["init", "-q"]); g(["config", "user.email", "t@t.invalid"]); g(["config", "user.name", "t"]); g(["config", "commit.gpgsign", "false"]);
  const commitAt = (message, files, epoch) => {
    for (const [rel, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), c); }
    g(["add", "-A"]);
    g(["commit", "-q", "--allow-empty", "-m", message], { GIT_COMMITTER_DATE: `@${epoch} +0000`, GIT_AUTHOR_DATE: `@${epoch} +0000` });
    return g(["rev-parse", "HEAD"]);
  };
  const deployed = commitAt("deployed", {
    "app/scripts/vercel-ignore-build.sh": fs.readFileSync(IGNORE, "utf8"),
    "app/scripts/ops/deploy-flush-decide.sh": HELPER_TEXT,
    "app/src/page.tsx": "v1",
    "app/public/data/mlb/results/x.json": "{}",
    "docs/NOTES.md": "v1",
  }, T - 86400);
  const decide = (deployedSha, offset, env = {}) => {
    const out = path.join(dir, ".gh-output");
    fs.writeFileSync(out, "");
    const r = spawnSync("bash", [path.join(dir, "app/scripts/ops/deploy-flush-decide.sh")], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, DEPLOYED_SHA: deployedSha, GTP_NOW_EPOCH: String(T + offset), GITHUB_OUTPUT: out, GTP_COALESCE_SECONDS: "", VERCEL_FORCE_BUILD: "", ...env },
    });
    assert.equal(r.status, 0, `the helper always exits 0: ${r.stdout}${r.stderr}`);
    const o = outputs(out);
    assert.match(r.stdout, new RegExp(`^flush=${o.flush} reason=${o.reason}$`, "m"));
    return { ...o, log: r.stdout };
  };
  return { dir, deployed, commitAt, decide, g, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("DECISION: nothing undeployed, docs only, or data inside the window → no flush", () => {
  const f = flushRepo();
  try {
    assert.deepEqual([f.decide(f.deployed, 60).flush, f.decide(f.deployed, 60).reason], ["false", "up-to-date"]);
    f.commitAt("docs", { "docs/NOTES.md": "v2" }, T);
    assert.equal(f.decide(f.deployed, 7200).reason, "nothing-due");
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    const r = f.decide(f.deployed, 600);
    assert.deepEqual([r.flush, r.reason], ["false", "nothing-due"], r.log);
  } finally { f.cleanup(); }
});

test("DECISION: non-critical data past the window → flush (coalesce-expired)", () => {
  const f = flushRepo();
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    const r = f.decide(f.deployed, 5400);
    assert.deepEqual([r.flush, r.reason], ["true", "coalesce-expired"], r.log);
  } finally { f.cleanup(); }
});

test("DECISION: a code or critical change is left to its own build for 10 min, then flushed", () => {
  for (const [label, files, tier] of [
    ["code", { "app/src/page.tsx": "v2" }, "code"],
    ["critical", { "app/public/data/nfl/forecasts/2026-10-26.json": "{}" }, "critical"],
  ]) {
    const f = flushRepo();
    try {
      f.commitAt(label, files, T);
      const early = f.decide(f.deployed, 300);
      assert.deepEqual([early.flush, early.reason], ["false", `${tier}-recent`], early.log);
      const late = f.decide(f.deployed, 601);
      assert.deepEqual([late.flush, late.reason], ["true", `${tier}-undeployed`], late.log);
    } finally { f.cleanup(); }
  }
});

test("DECISION: an undeployed flush younger than 2 h is not repeated; an older one is", () => {
  const f = flushRepo();
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    f.commitAt("auto: deploy flush [deploy] [skip ci]", {}, T + 5400);
    const soon = f.decide(f.deployed, 5400 + 1800);
    assert.deepEqual([soon.flush, soon.reason], ["false", "flush-outstanding"], soon.log);
    const later = f.decide(f.deployed, 5400 + 7200);
    assert.equal(later.flush, "true", later.log);
  } finally { f.cleanup(); }
});

test("DECISION: a malformed, missing or non-ancestor deployed SHA, or a broken gate, never flushes", () => {
  const f = flushRepo();
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    const main = f.g(["rev-parse", "HEAD"]);
    assert.equal(f.decide("", 86400).reason, "deployed-sha-malformed");
    assert.equal(f.decide("not-a-sha", 86400).reason, "deployed-sha-malformed");
    assert.equal(f.decide("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", 86400).reason, "deployed-sha-missing");
    f.g(["checkout", "-q", "-b", "side", f.deployed]);
    const side = f.commitAt("side", { "docs/side.md": "x" }, T);
    f.g(["checkout", "-q", main]);
    assert.equal(f.decide(side, 86400).reason, "deployed-sha-not-ancestor");
    // The gate cannot decide (malformed window) → it builds, but the backstop does not act on an undecidable gate.
    const r = f.decide(f.deployed, 86400, { GTP_COALESCE_SECONDS: "ninety" });
    assert.deepEqual([r.flush, r.reason], ["false", "gate-window-malformed"], r.log);
    // A gate that prints no GTP_GATE line (e.g. a future edit drops it) → no flush.
    fs.writeFileSync(path.join(f.dir, "app/scripts/vercel-ignore-build.sh"), "#!/usr/bin/env bash\necho building\nexit 1\n");
    assert.equal(f.decide(f.deployed, 86400).reason, "gate-unparsed");
  } finally { f.cleanup(); }
});

// ── WAIT (the status-triggered job) ──────────────────────────────────────────────────────────────────────────────────

/** The `if:` of a job, folded onto one line. */
function jobIf(job) {
  const m = new RegExp(`\\n {2}${job}:\\n((?: {4}.*\\n|\\s*\\n)*)`).exec(WF);
  assert.ok(m, `job ${job} not found`);
  const at = /\n? {4}if: (>-\n((?: {6}.*\n)+)|.+\n)/.exec(m[1]);
  return (at?.[2] ?? at?.[1] ?? "").replace(/\s+/g, " ").trim();
}

test("WAIT (static): only a final Vercel status starts it; a newer one replaces it; the flush follows only a due wait", () => {
  assert.equal(jobIf("wait"), "github.event_name == 'status' && github.event.context == 'Vercel' && github.event.state != 'pending'");
  assert.match(WF, /\n {2}wait:\n(?: {4}.*\n|\s*\n)*? {4}concurrency:\n\s+group: deploy-flush-wait\n\s+cancel-in-progress: true\n/, "a newer status cancels a sleeping wait");
  assert.match(WF, /\n {2}wait:\n(?: {4}.*\n|\s*\n)*? {4}permissions:\n\s+contents: read\n/, "the wait job cannot push");
  assert.equal(jobIf("flush"), "always() && github.ref == 'refs/heads/main' && ((github.event_name != 'status' && needs.wait.result == 'skipped') || (needs.wait.result == 'success' && needs.wait.outputs.due == 'true'))");
  const wait = stepRun("Sleep until the oldest pending change falls due");
  assert.match(wait, /bash app\/scripts\/ops\/deploy-flush-decide\.sh/, "the wait asks the same decision script");
  assert.doesNotMatch(wait, /git (commit|push)|GTP_COALESCE_SECONDS|5400/, "the wait keeps no window or commit logic of its own");
  assert.match(wait, /-A 'gtp-deploy-flush\/1\.0'/);
});

test("WAIT: sleeps to the first due minute, or not at all, on a throwaway repo with a fake clock", { skip: !hasJq && "jq not installed" }, () => {
  const body = stepRun("Sleep until the oldest pending change falls due");
  const run = (f, { statusSha, desc = "Canceled by Ignored Build Step", lives, offset }) => {
    const bin = fakeBin({
      // Each call serves the next body in lives (the last one repeats), as the live site would across reads.
      curl: `n=$(cat "$(dirname "$0")/n" 2>/dev/null || echo 0); echo $((n+1)) > "$(dirname "$0")/n"; i=$n; [ $i -lt ${lives.length} ] || i=${lives.length - 1}; sed -n "$((i+1))p" "$(dirname "$0")/lives"`,
      sleep: `echo "$1" >> "$(dirname "$0")/slept"`,
    });
    fs.writeFileSync(path.join(bin, "lives"), lives.map((sha) => (sha ? `{"commit":{"sha":"${sha}"}}` : "<html>challenge</html>")).join("\n") + "\n");
    const out = path.join(bin, "out.txt");
    fs.writeFileSync(out, "");
    try {
      const r = spawnSync("bash", ["-c", body], {
        cwd: f.dir, encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: out, STATUS_SHA: statusSha, STATUS_DESC: desc,
          MAX_WAIT_MINUTES: "125", LIVE_RETRY_SECONDS: "30", GTP_NOW_EPOCH: String(T + offset), GTP_COALESCE_SECONDS: "", VERCEL_FORCE_BUILD: "" },
      });
      assert.equal(r.status, 0, `the wait never fails the run: ${r.stdout}${r.stderr}`);
      const slept = fs.existsSync(path.join(bin, "slept")) ? fs.readFileSync(path.join(bin, "slept"), "utf8").trim().split("\n").map(Number) : [];
      return { due: outputs(out).due, slept, log: r.stdout };
    } finally { fs.rmSync(bin, { recursive: true, force: true }); }
  };
  const f = flushRepo();
  try {
    // Up to date: nothing to wait for.
    let r = run(f, { statusSha: f.deployed, desc: "Deployment has completed", lives: [f.deployed], offset: 0 });
    assert.deepEqual([r.due, r.slept], ["false", []], r.log);
    assert.match(r.log, /reason=up-to-date — not waiting/);
    // Docs only: not a build input, nothing pending.
    const docs = f.commitAt("docs", { "docs/NOTES.md": "v2" }, T);
    r = run(f, { statusSha: docs, lives: [f.deployed], offset: 600 });
    assert.deepEqual([r.due, r.slept], ["false", []], r.log);
    assert.match(r.log, /nothing undeployed is a build input — not waiting/, "stops at once instead of scanning the clock");
    // Non-critical data pushed at T, skipped by the gate: 10 min later the wait sleeps 80 min to the window's end.
    const data = f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    r = run(f, { statusSha: data, lives: [f.deployed], offset: 600 });
    assert.deepEqual([r.due, r.slept], ["true", [80 * 60 + 15]], r.log);
    // Already overdue (a missed cron slot): flush at once.
    r = run(f, { statusSha: data, lives: [f.deployed], offset: 5400 + 1200 });
    assert.deepEqual([r.due, r.slept], ["true", []], r.log);
    // A bot challenge: no wait (fail-safe).
    r = run(f, { statusSha: data, lives: [""], offset: 600 });
    assert.deepEqual([r.due, r.slept], ["false", []], r.log);
    // A status for a commit that is not on main (a preview branch): no wait.
    const main = f.g(["rev-parse", "HEAD"]);
    f.g(["checkout", "-q", "-b", "preview/x", f.deployed]);
    const preview = f.commitAt("preview", { "app/src/page.tsx": "preview" }, T);
    f.g(["checkout", "-q", main]);
    r = run(f, { statusSha: preview, lives: [f.deployed], offset: 600 });
    assert.deepEqual([r.due, r.slept], ["false", []], r.log);
    // A completed build whose live read lags: read again until it shows, then nothing is pending.
    r = run(f, { statusSha: data, desc: "Deployment has completed", lives: [f.deployed, f.deployed, data], offset: 600 });
    assert.deepEqual([r.due, r.slept], ["false", [30, 30]], r.log);
    assert.match(r.log, /not waiting/);
    // ...and a read that never catches up never turns into a flush.
    r = run(f, { statusSha: data, desc: "Deployment has completed", lives: [f.deployed], offset: 5400 + 1200 });
    assert.deepEqual([r.due, r.slept.length], ["false", 5], r.log);
  } finally { f.cleanup(); }
});

test("WAIT: a code change's own build gets 10 minutes before the wait falls due", { skip: !hasJq && "jq not installed" }, () => {
  const body = stepRun("Sleep until the oldest pending change falls due");
  const f = flushRepo();
  const bin = fakeBin({ curl: `echo '{"commit":{"sha":"${f.deployed}"}}'`, sleep: `echo "$1" >> "$(dirname "$0")/slept"` });
  try {
    const code = f.commitAt("code", { "app/src/page.tsx": "v2" }, T);
    const out = path.join(bin, "out.txt");
    fs.writeFileSync(out, "");
    const r = spawnSync("bash", ["-c", body], {
      cwd: f.dir, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: out, STATUS_SHA: code, STATUS_DESC: "",
        MAX_WAIT_MINUTES: "125", LIVE_RETRY_SECONDS: "30", GTP_NOW_EPOCH: String(T + 120), GTP_COALESCE_SECONDS: "", VERCEL_FORCE_BUILD: "" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(outputs(out).due, "true", r.stdout);
    assert.deepEqual(fs.readFileSync(path.join(bin, "slept"), "utf8").trim().split("\n").map(Number), [8 * 60 + 15], "600 s after the commit, rounded up to the minute");
  } finally { fs.rmSync(bin, { recursive: true, force: true }); f.cleanup(); }
});
