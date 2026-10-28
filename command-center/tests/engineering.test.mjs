/**
 * M2 delegated engineering, offline: a fake `claude` (tests/fixtures/fake-claude.mjs) and a throwaway git repo.
 * Proves the safety envelope without a single real Claude Code run: billing attestation lock, subscription
 * preflight, scrubbed child environment, gate order and digests, scope guard, Pause / Emergency stop, keep/discard,
 * and that the founder's checkout never changes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { RUN_LIMITS } from "../contracts/engineering.mjs";
import { REASON } from "../contracts/index.mjs";
import { stepClock, digestOf } from "../lib/util.mjs";
import { FOUNDER, STRANGER, tempDir } from "./helpers.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs");
const COMMAND = "Team, add a Copy caption button and a live 280-character counter. Have ChatGPT write the spec and Claude Code implement it in an isolated working copy.";
const SPEC = {
  objective: "Add a Copy caption button and a live n/280 counter to each caption option",
  userStories: ["As the founder I can copy a caption with one tap"],
  constraints: ["Only console files"],
  filesInScope: ["command-center/surfaces/console/app.js"],
  tests: ["existing suite passes"],
  acceptanceCriteria: ["button copies text", "counter shows n/280"],
  nonGoals: ["no publishing changes"],
};
const paste = (o) => "Here you go\n```json\n" + JSON.stringify(o, null, 2) + "\n```";
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function toyRepo() {
  const dir = tempDir("gtp-cc-toy-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "toy");
  git(dir, "config", "user.email", "toy@example.com");
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); };
  w(".gitignore", ".claude/\n");
  w("command-center/surfaces/console/app.js", "// console app\n");
  w("command-center/surfaces/console/styles.css", "/* styles */\n");
  w("command-center/tests/ok.test.mjs", 'import test from "node:test"; test("ok", () => {});\n');
  w("app/README.md", "outside scope\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "toy");
  return dir;
}

function setup({ fake = {}, extraEnv = {}, attest = true, limits } = {}) {
  const home = tempDir("gtp-cc-home-");
  fs.writeFileSync(path.join(home, ".fake-claude.json"), JSON.stringify(fake));
  const repo = toyRepo();
  const out = tempDir("gtp-cc-out-");
  const clock = stepClock();
  const store = createFileStore({ dir: path.join(out, "ledger"), clock });
  const o = createOrchestrator({
    store, clock, outDir: out,
    engineering: {
      repoRoot: repo, claudeBin: FAKE, claudeEnv: { PATH: process.env.PATH, HOME: home, SECRET_NOT_FOR_CLAUDE: "x", ...extraEnv }, home,
      screens: false, workcopyPaths: ["command-center", "app/README.md"], nodeModulesFrom: null,
      limits: limits ?? { ...RUN_LIMITS, plan: { ...RUN_LIMITS.plan, timeoutMs: 20_000 }, build: { ...RUN_LIMITS.build, timeoutMs: 20_000 }, killGraceMs: 300 },
    },
  });
  if (attest) assert.equal(o.attestBilling({ usageCredits: "off" }, FOUNDER).ok, true);
  const calls = () => { try { return fs.readFileSync(path.join(home, ".fake-claude-calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { o, repo, home, calls, fingerprint: () => `${git(repo, "rev-parse", "HEAD")}\n${git(repo, "status", "--porcelain")}` };
}

const gate = (o, g) => o.state().decisions.find((d) => d.kind === "gate" && d.gate === g);
const decide = (o, g, verdict, actor = FOUNDER) => { const d = gate(o, g); return o.decide({ decisionId: d.decisionId, verdict, digest: d.subjectDigest }, actor); };

async function toG1(env) {
  await env.o.handleCommand(COMMAND, FOUNDER);
  const c = env.o.state().commands[0];
  assert.equal(c.intent, "engineering-task");
  const pa = c.tasks.find((t) => t.ownerRole === "prompt-architect");
  assert.equal(pa.status, "AWAITING_INPUT");
  assert.equal(pa.seat, "manual:chatgpt", "the spec seat is a real assistant you operate, never simulated");
  assert.match(pa.prompt, /renderDecisions/, "ChatGPT gets the real code excerpt");
  const r = await env.o.submitManual(pa.taskId, paste(SPEC), FOUNDER);
  assert.equal(r.ok, true);
  return pa;
}

test("happy path: spec → G1 → real-shaped plan run → G2 → build → verification → G3 keep (local commit only)", async () => {
  const env = setup();
  const before = env.fingerprint();
  await toG1(env);
  assert.equal(env.calls().length, 0, "nothing runs before G1");
  assert.equal((await decide(env.o, "G1", "approve")).ok, true);
  await env.o.whenIdle();

  let s = env.o.state();
  const plan = s.commands[0].contributions.find((c) => c.artifactType === "implementation-plan");
  assert.equal(plan.seat, "cli:claude-code");
  assert.equal(plan.provider, "anthropic");
  assert.equal(plan.simulated, false);
  assert.equal(plan.run.sessionId, "fake-plan-session");
  assert.equal(plan.cost.usd, 0);
  assert.equal(plan.cost.estUsageUsd, 0.11);
  assert.equal(plan.run.preflight.authMethod, "claude.ai");
  assert.ok(s.commands[0].progress.some((p) => /Preflight OK/.test(p.line)));
  assert.ok(s.commands[0].progress.some((p) => /Reading command-center\/surfaces\/console\/app\.js/.test(p.line)));
  assert.equal(env.calls().length, 1);
  assert.equal(env.calls()[0].mode, "plan");
  assert.ok(env.calls()[0].argv.includes("dontAsk"));
  assert.equal(env.calls()[0].argv[env.calls()[0].argv.indexOf("--allowedTools") + 1], "Read,Grep,Glob");

  assert.equal((await decide(env.o, "G2", "approve")).ok, true);
  await env.o.whenIdle();
  s = env.o.state();
  const ver = s.commands[0].contributions.find((c) => c.artifactType === "verification").artifact;
  assert.deepEqual(ver.files.map((f) => [f.file, f.inScope]), [["command-center/surfaces/console/app.js", true]]);
  assert.equal(ver.tests.ok, true);
  assert.equal(ver.checkoutUnchanged, true);
  assert.match(ver.diff, /fake build edit/);
  const g3 = gate(env.o, "G3");
  assert.equal(g3.options.find((x) => x.id === "keep").allowed, true);
  assert.ok(s.commands[0].reports.some((r) => r.usage?.claudeRuns === 2 && Math.abs(r.usage.estUsageUsd - 0.53) < 1e-9));

  assert.equal((await decide(env.o, "G3", "keep")).ok, true);
  await env.o.whenIdle();
  const kept = env.o.state().commands[0].deliverables.find((d) => d.kind === "kept");
  assert.ok(kept, "kept deliverable recorded");
  assert.equal(git(env.repo, "show", "--name-only", "--format=", kept.commit), "command-center/surfaces/console/app.js");
  assert.equal(env.fingerprint(), before, "the founder's checkout is untouched");
  assert.equal(git(env.repo, "rev-parse", "main"), before.split("\n")[0], "main did not move");
});

test("Claude's environment is scrubbed and limited", async () => {
  const env = setup();
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const keys = env.calls()[0].envKeys;
  assert.ok(!keys.includes("SECRET_NOT_FOR_CLAUDE"));
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) assert.ok(!keys.includes(k), k);
  const argv = env.calls()[0].argv;
  for (const flag of ["--max-turns", "--max-budget-usd", "--strict-mcp-config", "--setting-sources"]) assert.ok(argv.includes(flag), flag);
});

test("no billing attestation → no Claude Code run", async () => {
  const env = setup({ attest: false });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const c = env.o.state().commands[0];
  assert.ok(c.refusals.some((r) => r.code === REASON.BILLING_NOT_CONFIRMED));
  assert.equal(env.calls().length, 0);
});

test("an API key in the environment, or a non-subscription login, refuses the run before Claude starts", async () => {
  for (const variant of [{ extraEnv: { ANTHROPIC_API_KEY: "sk-test" } }, { fake: { auth: { loggedIn: true, authMethod: "apiKey", apiProvider: "firstParty" } } }]) {
    const env = setup(variant);
    await toG1(env);
    await decide(env.o, "G1", "approve");
    await env.o.whenIdle();
    const c = env.o.state().commands[0];
    assert.ok(c.refusals.some((r) => r.code === REASON.SUBSCRIPTION_AUTH_NOT_CONFIRMED), JSON.stringify(c.refusals));
    assert.equal(env.calls().length, 0, "the fake was never asked to run a model");
  }
});

test("a rejected saved login (401) stops the run with a fix-it message and no usage", async () => {
  const env = setup({ fake: { auth401: true } });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const c = env.o.state().commands[0];
  const r = c.refusals.find((x) => x.code === REASON.SUBSCRIPTION_AUTH_NOT_CONFIRMED);
  assert.ok(r, JSON.stringify(c.refusals));
  assert.match(r.detail, /claude auth login/);
  assert.equal(r.cost.estUsageUsd, 0);
  assert.equal(gate(env.o, "G2"), undefined, "no plan, so no G2");
  assert.ok(c.reports.some((x) => /did not complete/.test(x.headline)));
});

test("budget failure: no G2, the last structured attempt is kept as diagnostic-only partial output", async () => {
  const env = setup({ fake: { budgetFail: "plan" } });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const c = env.o.state().commands[0];
  const r = c.refusals.find((x) => x.code === REASON.RUN_FAILED);
  assert.match(r.detail, /\$1 estimated-usage cap was reached after 13 turns/);
  assert.equal(r.partialOutput.diagnosticOnly, true);
  assert.equal(r.partialOutput.attempts, 3);
  assert.equal(r.partialOutput.schemaValid, true);
  assert.equal(gate(env.o, "G2"), undefined, "an unsuccessful run never reaches G2");
  assert.ok(!c.contributions.some((x) => x.artifactType === "implementation-plan"), "the partial plan is not a contribution");
});

test("a session without the StructuredOutput tool is stopped at once", async () => {
  const env = setup({ fake: { noStructuredTool: true } });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const c = env.o.state().commands[0];
  assert.ok(c.refusals.some((x) => x.code === "STRUCTURED_OUTPUT_UNAVAILABLE"), JSON.stringify(c.refusals.map((x) => x.code)));
});

test("plan run: model, effort, tool set, footprint env and the context packet are passed", async () => {
  const env = setup();
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const call = env.calls()[0];
  const arg = (f) => call.argv[call.argv.indexOf(f) + 1];
  assert.equal(arg("--model"), "sonnet");
  assert.equal(arg("--effort"), "medium");
  assert.equal(arg("--tools"), "Read,Grep,Glob");
  assert.equal(arg("--max-budget-usd"), "1", "the $1 plan cap is unchanged");
  assert.equal(arg("--max-turns"), "10");
  for (const k of ["CLAUDE_CODE_DISABLE_AUTO_MEMORY", "CLAUDE_CODE_DISABLE_CLAUDE_MDS", "CLAUDE_CODE_DISABLE_CRON", "CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS"]) assert.ok(call.envKeys.includes(k), k);
  assert.match(call.promptHead, /READ-ONLY planning run/);
  const plan = env.o.state().commands[0].contributions.find((x) => x.artifactType === "implementation-plan");
  assert.equal(plan.run.effort, "medium");
  assert.ok(env.o.state().commands[0].progress.some((p) => /Context packet/.test(p.line)));
});

test("manual seat accepts a bare JSON answer (no ```json fence)", async () => {
  const env = setup();
  await env.o.handleCommand(COMMAND, FOUNDER);
  const pa = env.o.state().commands[0].tasks.find((t) => t.ownerRole === "prompt-architect");
  const r = await env.o.submitManual(pa.taskId, "Sure, here is the spec:\n" + JSON.stringify(SPEC), FOUNDER);
  assert.equal(r.ok, true);
  assert.ok(gate(env.o, "G1"));
});

test("gates: founder-only, digest-bound, and a malformed spec keeps the task waiting", async () => {
  const env = setup();
  await env.o.handleCommand(COMMAND, FOUNDER);
  const pa = env.o.state().commands[0].tasks.find((t) => t.ownerRole === "prompt-architect");
  const bad = await env.o.submitManual(pa.taskId, paste({ objective: "only this" }), FOUNDER);
  assert.equal(bad.code, REASON.SPEC_CONTRACT_INVALID);
  assert.equal(env.o.state().commands[0].tasks.find((t) => t.taskId === pa.taskId).status, "AWAITING_INPUT");
  assert.equal((await env.o.submitManual(pa.taskId, paste(SPEC), FOUNDER)).ok, true);

  const g1 = gate(env.o, "G1");
  assert.equal(g1.subjectDigest, digestOf(SPEC));
  assert.equal((await env.o.decide({ decisionId: g1.decisionId, verdict: "approve", digest: "0".repeat(64) }, FOUNDER)).code, REASON.APPROVAL_DIGEST_MISMATCH);
  assert.equal((await decide(env.o, "G1", "approve", STRANGER)).code, REASON.NOT_FOUNDER);
  assert.equal(env.calls().length, 0);
});

test("reject at G1 stops everything; nothing runs", async () => {
  const env = setup();
  await toG1(env);
  await decide(env.o, "G1", "reject");
  await env.o.whenIdle();
  assert.equal(env.calls().length, 0);
  assert.ok(env.o.state().commands[0].reports.some((r) => /Stopped at G1/.test(r.headline)));
});

test("plan outside the allowed paths cannot be approved at G2", async () => {
  const env = setup({ fake: { plan: { summary: "x", files: [{ path: "app/README.md", change: "edit" }], steps: ["s"], risks: [], testPlan: ["t"] } } });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  const g2 = gate(env.o, "G2");
  assert.equal(g2.options.find((x) => x.id === "approve").allowed, false);
  assert.equal((await decide(env.o, "G2", "approve")).code, REASON.PLAN_OUT_OF_SCOPE);
});

test("an out-of-scope edit makes Keep unavailable; Discard removes the working copy and branch", async () => {
  const env = setup({ fake: { edits: [{ path: "command-center/surfaces/console/app.js", append: "//x\n" }, { path: "app/README.md", append: "sneaky\n" }] } });
  const before = env.fingerprint();
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  await decide(env.o, "G2", "approve");
  await env.o.whenIdle();
  const g3 = gate(env.o, "G3");
  assert.equal(g3.options.find((x) => x.id === "keep").allowed, false);
  assert.ok(g3.warnings.some((w) => w.code === REASON.OUT_OF_SCOPE));
  assert.equal((await decide(env.o, "G3", "keep")).code, REASON.OUT_OF_SCOPE);
  assert.equal((await decide(env.o, "G3", "discard")).ok, true);
  await env.o.whenIdle();
  assert.equal(git(env.repo, "branch", "--list", "cc/*"), "");
  assert.equal(fs.existsSync(path.join(env.repo, ".claude/worktrees")) && fs.readdirSync(path.join(env.repo, ".claude/worktrees")).length, 0);
  assert.equal(env.fingerprint(), before);
});

test("Pause cancels a running Claude process; Emergency stop kills it at once", async () => {
  for (const how of ["pause", "emergency"]) {
    const env = setup({ fake: { hang: "plan" } });
    await toG1(env);
    await decide(env.o, "G1", "approve");
    for (let i = 0; i < 100 && !env.o.state().engineering.activeRuns.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(env.o.state().engineering.activeRuns.length, 1);
    const t0 = Date.now();
    const r = how === "pause" ? env.o.setPaused(true, FOUNDER) : env.o.emergencyStop(FOUNDER);
    assert.equal(r.stoppedRuns, 1);
    await env.o.whenIdle();
    assert.ok(Date.now() - t0 < 5_000);
    const c = env.o.state().commands[0];
    assert.ok(c.refusals.some((x) => x.code === REASON.RUN_CANCELLED), how);
    assert.ok(c.tasks.some((t) => t.status === "CANCELLED"));
    assert.equal(env.o.state().engineering.activeRuns.length, 0);
    if (how === "emergency") assert.equal(env.o.state().engineering.emergency, true);
  }
});

test("a failing test in the working copy makes Keep unavailable", async () => {
  const env = setup({ fake: { edits: [{ path: "command-center/tests/broken.test.mjs", append: 'import test from "node:test"; import assert from "node:assert"; test("broken", () => assert.equal(1, 2));\n' }] } });
  await toG1(env);
  await decide(env.o, "G1", "approve");
  await env.o.whenIdle();
  await decide(env.o, "G2", "approve");
  await env.o.whenIdle();
  const g3 = gate(env.o, "G3");
  assert.equal(g3.options.find((x) => x.id === "keep").allowed, false);
  assert.ok(g3.warnings.some((w) => w.code === "TESTS_FAILED"));
});

test("verification timeout kills the test run and everything it started", async () => {
  const { runTests } = await import("../engineering/verify.mjs");
  const dir = toyRepo();
  const pidFile = path.join(dir, "child.pid");
  fs.writeFileSync(path.join(dir, "command-center/tests/hang.test.mjs"),
    `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";
     test("hang", async () => { const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); await new Promise(() => {}); });\n`);
  const r = await runTests(dir, { timeoutMs: 3_000 });
  assert.equal(r.timedOut, true);
  assert.equal(r.ok, false);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  await new Promise((res) => setTimeout(res, 300));
  assert.throws(() => process.kill(pid, 0), "the grandchild process must be gone");
});

test("approving work while paused is refused", async () => {
  const env = setup();
  await toG1(env);
  env.o.setPaused(true, FOUNDER);
  assert.equal((await decide(env.o, "G1", "approve")).code, REASON.PAUSED);
  assert.equal(env.calls().length, 0);
});
