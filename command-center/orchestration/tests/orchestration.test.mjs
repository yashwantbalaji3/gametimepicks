/**
 * Orchestration core tests. Run: node --test command-center/orchestration/tests/
 * The no-network guard is loaded first: every test here passes with all outbound network blocked. "Live" adapters in
 * these tests get a stubbed fetch — they exercise the live code path (caps, labels, approvals) without any provider.
 */
import { NETWORK_ATTEMPTS } from "../../tests/no-network-preload.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFileStore } from "../../ledger/store.mjs";
import { canonicalJson, stepClock, digestOf } from "../../lib/util.mjs";
import { createTaskLedger, replay, ConcurrencyConflict, STATES } from "../task-ledger.mjs";
import { PIPELINES, runPipeline, withOrder, validatePipeline, approve, ORCHESTRATOR } from "../pipelines.mjs";
import { budgetConfig, checkSpend, breakerState } from "../budgets.mjs";
import { createMockAdapters, createLiveAdapters, liveAvailable, isLiveAdapter } from "../adapters.mjs";
import { renderOutputs, renderTaskTree, renderAudit, mockBanner } from "../views.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "2026-11-03T12:00:00.000Z";
const NOW = () => ORIGIN;
const FOUNDER = Object.freeze({ role: "founder", id: "founder", surface: "console", authenticated: true });
const OBJECTIVE = "Add a last-updated timestamp to the queue header";

function fresh(ledgerId = "t") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-orch-test-"));
  const clock = stepClock(ORIGIN);
  const store = createFileStore({ dir, clock });
  return { dir, store, clock, ledger: createTaskLedger({ store, clock, ledgerId }) };
}
const mockRun = async (o = {}) => {
  const f = o.f ?? fresh();
  const mocks = o.mocks ?? createMockAdapters(o.script);
  const run = await runPipeline({ ledger: f.ledger, pipeline: o.pipeline ?? PIPELINES["build-review-release"], objective: o.objective ?? OBJECTIVE, adapters: mocks.adapters, config: o.config ?? budgetConfig(), now: NOW, runKey: o.runKey ?? "1" });
  return { ...f, mocks, run };
};
const codeOf = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return null;
};

/** Live adapters over a stubbed transport (no network). Values are dummies; only the names matter to liveAvailable. */
function stubLive({ reply = { summary: "stub", changes: [] } } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ model: "test-model", output_text: JSON.stringify(reply), usage: { input_tokens: 100, output_tokens: 50 } }) };
  };
  const env = { OPENAI_API_KEY: "dummy-not-a-key", OPENAI_MODEL: "test-model", OPENAI_PRICE_IN_PER_M: "1", OPENAI_PRICE_OUT_PER_M: "2" };
  return { ...createLiveAdapters({ env, fetch, sleep: async () => {} }), calls };
}
/** CEO brief → one Level A OpenAI work step → founder approval: the smallest pipeline with a live path. */
const tinyPipeline = (costBudgetUsd = 0.5) => validatePipeline({
  id: "tiny", title: "tiny", parentProject: "test",
  steps: [
    { key: "ceo", kind: "brief", title: "CEO", agent: { provider: "founder", seat: "founder", role: "ceo" }, approvalLevel: "A" },
    { key: "draft", kind: "work", title: "Draft", agent: { provider: "openai", seat: "api:openai", role: "drafter" }, approvalLevel: "A", costBudgetUsd },
    { key: "approval", kind: "approval", title: "Founder approval", agent: { provider: "founder", seat: "founder", role: "ceo" }, approvalLevel: "C", decider: "founder" },
  ],
});
const openCaps = budgetConfig({ env: { GTP_CC_OPENAI_DAILY_CAP_USD: "1", GTP_CC_OPENAI_MONTHLY_CAP_USD: "5", GTP_CC_AGENT_DAILY_CAP_USD: "1", GTP_CC_AGENT_MONTHLY_CAP_USD: "5" } });

// ───────────────────────────── pipeline (a) end to end ─────────────────────────────

test("pipeline (a) runs end to end on MOCK adapters and stops at the founder's Level C approval", async () => {
  const { run, ledger } = await mockRun();
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
  const s = ledger.state();
  const steps = s.taskOrder.map((id) => `${s.tasks[id].stepKey}${s.tasks[id].round ? `#${s.tasks[id].round}` : ""}:${s.tasks[id].state}`);
  assert.deepEqual(steps, ["ceo:DONE", "implement:DONE", "review#1:DONE", "remediate#1:DONE", "review#2:DONE", "gate:DONE", "approval:READY_FOR_APPROVAL"]);
  assert.equal(s.handoffs.length, 6);
  assert.equal(s.notifications.filter((n) => n.reason === "handoff").length, 6);
  assert.ok(s.notifications.some((n) => n.to === "founder" && n.reason === "approval-required"));
  // Level B work was approved by the independent (different-provider) reviewer, not by itself or the orchestrator.
  for (const k of ["implement", "remediate"]) {
    const t = Object.values(s.tasks).find((x) => x.stepKey === k);
    assert.equal(t.approvals[0].approver.id, "openai:api:openai:independent-reviewer");
  }
  for (const t of Object.values(s.tasks)) {
    for (const f of ["taskId", "parentProject", "objective", "assignedAgent", "sourceDocuments", "tools", "permissions", "requiredInputs", "expectedOutputs", "deadline", "costBudget", "state", "approvalLevel", "approvalRequirement", "evidence", "outcome"]) assert.ok(f in t, `task field ${f}`);
    for (const e of t.evidence) assert.match(e.sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(NETWORK_ATTEMPTS, []);
});

// ───────────────────────────── 1. replay determinism ─────────────────────────────

test("replay is deterministic: same inputs → byte-identical events and state; a fresh reader derives the same state", async () => {
  const a = await mockRun();
  const b = await mockRun();
  assert.equal(canonicalJson(a.ledger.events()), canonicalJson(b.ledger.events()));
  assert.equal(canonicalJson(a.ledger.state()), canonicalJson(b.ledger.state()));
  // A new reader on the same store, and a pure replay of the events, agree with the writer.
  const reader = createTaskLedger({ store: createFileStore({ dir: a.dir, clock: stepClock(ORIGIN) }), clock: stepClock(ORIGIN), ledgerId: "t" });
  assert.equal(canonicalJson(reader.state()), canonicalJson(a.ledger.state()));
  assert.equal(canonicalJson(replay(a.ledger.events())), canonicalJson(a.ledger.state()));
  assert.ok(STATES.includes(reader.state().tasks[reader.state().taskOrder[0]].state));
});

test("replay rejects an edited or reordered event (hash chain)", async () => {
  const { ledger } = await mockRun();
  const evs = structuredClone(ledger.events());
  const edited = structuredClone(evs);
  edited[5].body.output.mode = "LIVE";
  assert.throws(() => replay(edited), (e) => e.code === "BROKEN_CHAIN");
  const swapped = structuredClone(evs);
  [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
  assert.throws(() => replay(swapped), (e) => ["BAD_SEQUENCE", "BROKEN_CHAIN"].includes(e.code));
});

test("invalid transitions are refused and leave no trace", async () => {
  const { ledger } = fresh();
  const task = { taskId: "task-x", parentProject: "p", objective: "o", assignedAgent: { provider: "openai", seat: "api:openai", role: "r" }, approvalLevel: "B", approvalRequirement: "x", costBudget: { usd: 0, hardStop: true } };
  ledger.append("task.created", ORCHESTRATOR, { task });
  const head = ledger.head();
  assert.equal(codeOf(() => ledger.append("task.transition", ORCHESTRATOR, { taskId: "task-x", to: "DONE" })), "INVALID_TRANSITION");
  assert.equal(codeOf(() => ledger.append("task.transition", ORCHESTRATOR, { taskId: "task-x", to: "BLOCKED", blocker: { class: "SOMEONE" } })), "INVALID_BLOCKER");
  ledger.append("task.transition", ORCHESTRATOR, { taskId: "task-x", to: "IN_PROGRESS" });
  assert.equal(codeOf(() => ledger.append("task.transition", ORCHESTRATOR, { taskId: "task-x", to: "DONE" })), "APPROVAL_REQUIRED", "Level B can't skip approval");
  assert.equal(ledger.head(), head + 1);
});

// ───────────────────────────── 2. concurrency ─────────────────────────────

test("optimistic concurrency: a writer with a stale expected sequence is refused and writes nothing", () => {
  const { dir, ledger: a } = fresh();
  const b = createTaskLedger({ store: createFileStore({ dir, clock: stepClock(ORIGIN) }), clock: stepClock("2026-11-03T13:00:00.000Z"), ledgerId: "t" });
  a.append("run.status", ORCHESTRATOR, { runId: "r", status: "STARTED" });
  const seen = b.head();
  assert.equal(seen, 1);
  a.append("run.status", ORCHESTRATOR, { runId: "r", status: "A-WROTE" }, { expectedSeq: seen });
  assert.throws(() => b.append("run.status", ORCHESTRATOR, { runId: "r", status: "B-WROTE" }, { expectedSeq: seen }), ConcurrencyConflict);
  assert.equal(b.head(), 2);
  assert.equal(b.state().runs.r.status, "A-WROTE");
});

test("concurrency: 8 processes racing for the same slot — exactly one wins", async () => {
  const { dir } = fresh();
  const mod = (p) => pathToFileURL(path.join(HERE, p)).href;
  const script = `
    import { createFileStore } from ${JSON.stringify(mod("../../ledger/store.mjs"))};
    import { createTaskLedger } from ${JSON.stringify(mod("../task-ledger.mjs"))};
    const clock = () => "2026-11-03T12:00:00.000Z";
    const l = createTaskLedger({ store: createFileStore({ dir: process.argv[1], clock }), clock, ledgerId: "t" });
    try { l.append("run.status", { role: "orchestrator", id: "w" + process.argv[2] }, { runId: "race", status: "W" + process.argv[2] }, { expectedSeq: 0 }); console.log("WON"); }
    catch (e) { console.log(e.code); }`;
  const outs = await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", script, dir, String(i)]);
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.on("close", () => resolve(out.trim()));
  })));
  assert.equal(outs.filter((o) => o === "WON").length, 1, outs.join(","));
  assert.ok(outs.filter((o) => o !== "WON").every((o) => o === "CONCURRENCY_CONFLICT"), outs.join(","));
  const reader = createTaskLedger({ store: createFileStore({ dir, clock: NOW }), clock: NOW, ledgerId: "t" });
  assert.equal(reader.head(), 1);
});

// ───────────────────────────── 3. idempotent retry ─────────────────────────────

test("idempotent retry: the same key returns the first event; a different body under the key is refused", () => {
  const { ledger } = fresh();
  const r1 = ledger.append("run.status", ORCHESTRATOR, { runId: "r", status: "STARTED" }, { idempotencyKey: "k1" });
  const r2 = ledger.append("run.status", ORCHESTRATOR, { runId: "r", status: "STARTED" }, { idempotencyKey: "k1" });
  assert.equal(r1.replayed, false);
  assert.equal(r2.replayed, true);
  assert.equal(r2.event.digest, r1.event.digest);
  assert.equal(ledger.head(), 1);
  assert.equal(codeOf(() => ledger.append("run.status", ORCHESTRATOR, { runId: "r", status: "OTHER" }, { idempotencyKey: "k1" })), "IDEMPOTENCY_MISMATCH");
});

test("re-running a pipeline with the same run key writes nothing new and calls no agent again", async () => {
  const first = await mockRun();
  const head = first.ledger.head();
  const calls = first.mocks.calls.length;
  const again = await runPipeline({ ledger: first.ledger, pipeline: PIPELINES["build-review-release"], objective: OBJECTIVE, adapters: first.mocks.adapters, config: budgetConfig(), now: NOW, runKey: "1" });
  assert.equal(again.status, "AWAITING_FOUNDER_APPROVAL");
  assert.equal(first.ledger.head(), head);
  assert.equal(first.mocks.calls.length, calls);
});

test("a retryable failure is retried within the retry budget; the task records every attempt", async () => {
  const { run, ledger } = await mockRun({ script: { failures: { anthropic: 1 } } });
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
  const impl = Object.values(ledger.state().tasks).find((t) => t.stepKey === "implement");
  assert.equal(impl.attempts, 2);
  assert.deepEqual(ledger.state().attempts.filter((a) => a.taskId === impl.taskId).map((a) => a.ok), [false, true]);
});

// ───────────────────────────── 4. budgets ─────────────────────────────

test("budget hard stop: with the default $0 caps a live call is refused before any request is made", async () => {
  const live = stubLive();
  const f = fresh();
  const run = await runPipeline({ ledger: f.ledger, pipeline: tinyPipeline(), objective: OBJECTIVE, adapters: live.adapters, config: budgetConfig(), now: NOW });
  assert.equal(run.status, "BLOCKED");
  assert.equal(live.calls.length, 0, "no provider request");
  const s = f.ledger.state();
  const t = Object.values(s.tasks).find((x) => x.stepKey === "draft");
  assert.equal(t.state, "BLOCKED");
  assert.deepEqual([t.blocker.class, t.blocker.code], ["FOUNDER", "BUDGET_HARD_STOP"]);
  assert.match(s.refusals[0].scope, /^provider:openai:daily$/);
});

test("budget hard stop: the task's own costBudget stops a call whose worst case exceeds it", async () => {
  const live = stubLive();
  const f = fresh();
  const run = await runPipeline({ ledger: f.ledger, pipeline: tinyPipeline(0.0001), objective: OBJECTIVE, adapters: live.adapters, config: openCaps, now: NOW });
  assert.equal(run.status, "BLOCKED");
  assert.equal(live.calls.length, 0);
  assert.equal(f.ledger.state().refusals[0].scope, "task");
});

test("budgets: cost is recorded per task; provider daily/monthly and agent caps stop at the cap", async () => {
  const live = stubLive();
  const f = fresh();
  const run = await runPipeline({ ledger: f.ledger, pipeline: tinyPipeline(), objective: OBJECTIVE, adapters: live.adapters, config: openCaps, now: NOW });
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
  assert.equal(live.calls.length, 1);
  const s = f.ledger.state();
  const t = Object.values(s.tasks).find((x) => x.stepKey === "draft");
  assert.equal(t.costUsd, 0.0002); // (100 × $1 + 50 × $2) / 1e6
  // Synthetic spend near each cap: the next worst case must not fit.
  const near = (provider, agent, usd, at = ORIGIN) => ({ ...s, costs: [{ at, taskId: "x", provider, agent, usd, mode: "LIVE" }] });
  const task = { ...t, attempts: 0, costUsd: 0 };
  assert.equal(checkSpend(near("openai", "z", 0.999), { task, worstCaseUsd: 0.01, now: ORIGIN, config: openCaps }).scope, "provider:openai:daily");
  assert.equal(checkSpend(near("openai", "z", 4.995, "2026-11-01T00:00:00.000Z"), { task, worstCaseUsd: 0.01, now: ORIGIN, config: openCaps }).scope, "provider:openai:monthly");
  const tight = budgetConfig({ env: { GTP_CC_OPENAI_DAILY_CAP_USD: "10", GTP_CC_OPENAI_MONTHLY_CAP_USD: "10", GTP_CC_AGENT_DAILY_CAP_USD: "0.005", GTP_CC_AGENT_MONTHLY_CAP_USD: "10" } });
  assert.equal(checkSpend({ ...s, costs: [] }, { task, worstCaseUsd: 0.01, now: ORIGIN, config: tight }).scope, "agent:openai:api:openai:drafter:daily");
  assert.equal(checkSpend({ ...s, costs: [] }, { task, worstCaseUsd: 0.01, now: ORIGIN, config: openCaps }).ok, true);
});

test("retry budget exhausts to a TOOL blocker; the circuit breaker opens after consecutive failures", async () => {
  const config = budgetConfig({ env: { GTP_CC_ORCH_MAX_ATTEMPTS: "2", GTP_CC_ORCH_BREAKER_FAILURES: "2" } });
  const f = fresh();
  const mocks = createMockAdapters({ failures: { anthropic: 99 } });
  const r1 = await runPipeline({ ledger: f.ledger, pipeline: PIPELINES["build-review-release"], objective: OBJECTIVE, adapters: mocks.adapters, config, now: NOW, runKey: "a" });
  assert.equal(r1.status, "BLOCKED");
  let impl = Object.values(f.ledger.state().tasks).find((t) => t.stepKey === "implement" && t.runId === r1.runId);
  assert.deepEqual([impl.attempts, impl.blocker.class, impl.blocker.code], [2, "TOOL", "RETRY_BUDGET_EXHAUSTED"]);
  assert.equal(breakerState(f.ledger.state(), "anthropic", NOW(), config).open, true);
  const r2 = await runPipeline({ ledger: f.ledger, pipeline: PIPELINES["build-review-release"], objective: OBJECTIVE, adapters: mocks.adapters, config, now: NOW, runKey: "b" });
  impl = Object.values(f.ledger.state().tasks).find((t) => t.stepKey === "implement" && t.runId === r2.runId);
  assert.deepEqual([impl.attempts, impl.blocker.code], [0, "CIRCUIT_OPEN"]);
  // After the cooldown the breaker closes again.
  assert.equal(breakerState(f.ledger.state(), "anthropic", "2026-11-03T12:30:00.000Z", config).open, false);
});

// ───────────────────────────── 5. bounded review loop ─────────────────────────────

test("bounded review loop: changes every round → ESCALATED to the named decider after maxRounds", async () => {
  const { run, ledger, mocks } = await mockRun({ script: { reviewVerdicts: ["changes"] } });
  assert.equal(run.status, "ESCALATED");
  const s = ledger.state();
  const by = (k) => Object.values(s.tasks).filter((t) => t.stepKey === k);
  assert.equal(by("review").length, 2, "maxRounds = 2 reviews");
  assert.equal(by("remediate").length, 1, "one remediation between them");
  assert.equal(by("gate").length, 0);
  const subject = by("remediate")[0];
  assert.equal(subject.state, "BLOCKED");
  assert.deepEqual([subject.blocker.class, subject.escalation.status, subject.escalation.decider], ["FOUNDER", "ESCALATED", "founder"]);
  assert.ok(s.notifications.some((n) => n.to === "founder" && n.reason === "escalated"));
  assert.equal(mocks.calls.length, 5); // ceo, implement, review, remediate, review — and nothing after
});

test("an independent review must be a different provider; pipelines refuse a self-review", () => {
  const def = structuredClone(PIPELINES["build-review-release"]);
  def.steps.find((s) => s.key === "review").agent = { provider: "anthropic", seat: "cli:claude-code", role: "reviewer" };
  assert.throws(() => validatePipeline(def), (e) => e.code === "INVALID_PIPELINE" && /different provider/.test(e.detail));
});

// ───────────────────────────── pipelines as data ─────────────────────────────

test("pipeline order is data: (b) runs with visual QA moved before verification; invalid orders are refused", async () => {
  const reordered = withOrder(PIPELINES["research-verify-visual"], ["ceo", "research", "visual-qa", "verify", "approval"]);
  const { run, ledger } = await mockRun({ pipeline: reordered, script: { reviewVerdicts: ["approve"] } });
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
  const s = ledger.state();
  assert.deepEqual(s.taskOrder.map((id) => s.tasks[id].stepKey), ["ceo", "research", "visual-qa", "verify", "approval"]);
  assert.throws(() => withOrder(PIPELINES["research-verify-visual"], ["ceo", "verify", "research", "visual-qa", "approval"]), (e) => e.code === "INVALID_PIPELINE");
  const b = await mockRun({ pipeline: PIPELINES["research-verify-visual"], script: { reviewVerdicts: ["approve"] } });
  assert.equal(b.run.status, "AWAITING_FOUNDER_APPROVAL");
});

// ───────────────────────────── 6. MOCK labelling ─────────────────────────────

test("MOCK labelling can't be removed: no direct output writes, no relabel event, frozen views, label from the ledger", async () => {
  const { ledger, run } = await mockRun({ objective: "LIVE LIVE LIVE — this text claims to be live" });
  const s = ledger.state();
  const outs = Object.values(s.tasks).flatMap((t) => t.outputs);
  assert.ok(outs.length > 0 && outs.every((o) => o.mode === "MOCK" && o.label === "MOCK" && /^mock-/.test(o.model)));
  // Every rendered output line starts with [MOCK]; the banner is always there.
  const lines = renderOutputs(s).split("\n").filter((l) => !l.startsWith(" "));
  assert.ok(lines.length === outs.length && lines.every((l) => l.startsWith("[MOCK]")));
  assert.match(mockBanner(s), /MOCK RUN/);
  assert.doesNotMatch(renderTaskTree(s), /\[LIVE\]/);
  assert.doesNotMatch(renderAudit(s, ledger.events()), /\[LIVE\]/);
  // The view is frozen.
  assert.throws(() => { s.tasks[s.taskOrder[1]].outputs[0].mode = "LIVE"; }, TypeError);
  // No path writes an output with a chosen mode, and no event type relabels one.
  const t = s.taskOrder[1];
  assert.equal(codeOf(() => ledger.append("task.output", ORCHESTRATOR, { taskId: t, output: { mode: "LIVE" } })), "OUTPUT_VIA_RECORD_OUTPUT");
  assert.equal(codeOf(() => ledger.append("task.relabel", ORCHESTRATOR, { taskId: t, mode: "LIVE" })), "UNKNOWN_EVENT");
  // A mock adapter can't be recorded as LIVE even if the caller claims it is.
  const f = fresh();
  const task = { taskId: "task-m", parentProject: "p", objective: "o", assignedAgent: { provider: "openai", seat: "api:openai", role: "r" }, approvalLevel: "A", approvalRequirement: "x", costBudget: { usd: 0, hardStop: true } };
  f.ledger.append("task.created", ORCHESTRATOR, { task });
  f.ledger.append("task.transition", ORCHESTRATOR, { taskId: "task-m", to: "IN_PROGRESS" });
  const mock = createMockAdapters().adapters.openai;
  assert.equal(isLiveAdapter(mock), false);
  assert.equal(codeOf(() => f.ledger.recordOutput("task-m", ORCHESTRATOR, { adapter: mock, isLive: true, result: { artifact: { mode: "LIVE" }, usage: { usd: 0 } } })), "MOCK_LABEL_REQUIRED");
  const rec = f.ledger.recordOutput("task-m", ORCHESTRATOR, { adapter: mock, isLive: false, result: { artifact: { mode: "LIVE", label: "LIVE" }, usage: { usd: 5 } } });
  assert.deepEqual([rec.event.body.output.mode, rec.event.body.output.cost.usd], ["MOCK", 0]);
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
});

test("MOCK taint propagates: a live agent is never called on MOCK inputs", async () => {
  const live = stubLive();
  const mocks = createMockAdapters();
  const f = fresh();
  const run = await runPipeline({ ledger: f.ledger, pipeline: tinyPipeline(), objective: OBJECTIVE, adapters: { ...live.adapters, founder: mocks.adapters.founder }, config: openCaps, now: NOW });
  assert.equal(run.status, "BLOCKED");
  assert.equal(live.calls.length, 0);
  const t = Object.values(f.ledger.state().tasks).find((x) => x.stepKey === "draft");
  assert.deepEqual([t.blocker.class, t.blocker.code], ["AGENT", "MOCK_LINEAGE"]);
});

test("liveAvailable checks variable names only — it never reads a value — and is MOCK when any is absent", () => {
  const reads = [];
  const env = new Proxy({ OPENAI_API_KEY: "x", OPENAI_MODEL: "x", OPENAI_PRICE_IN_PER_M: "1", OPENAI_PRICE_OUT_PER_M: "1" }, {
    get(target, k) { reads.push(k); return target[k]; },
  });
  assert.equal(liveAvailable("openai", env).mode, "LIVE");
  assert.deepEqual(liveAvailable("xai", env), { provider: "xai", mode: "MOCK", missing: ["XAI_API_KEY"] });
  assert.equal(liveAvailable("anthropic", env).mode, "MOCK");
  assert.deepEqual(reads, []);
});

// ───────────────────────────── 7. Level C ─────────────────────────────

test("Level C can't be auto-approved: not by the orchestrator, an agent, a reviewer verdict, a flag, or a transition", async () => {
  const { ledger, run } = await mockRun({ script: { reviewVerdicts: ["approve"] } });
  const id = run.detail;
  const t = ledger.task(id);
  assert.equal(t.approvalLevel, "C");
  const digest = t.inputs[0];
  const head = ledger.head();
  const reviewTask = Object.values(ledger.state().tasks).find((x) => x.stepKey === "review").taskId;
  const attempts = {
    orchestrator: () => approve(ledger, id, ORCHESTRATOR, { artifactDigest: digest }),
    agent: () => approve(ledger, id, { role: "agent", id: "openai:api:openai:independent-reviewer", surface: "agent" }, { artifactDigest: digest }),
    founderNotAuthenticated: () => approve(ledger, id, { role: "founder", id: "founder", surface: "console" }, { artifactDigest: digest }),
    founderViaOrchestratorSurface: () => approve(ledger, id, { ...FOUNDER, surface: "orchestrator" }, { artifactDigest: digest }),
    autoFlag: () => approve(ledger, id, FOUNDER, { artifactDigest: digest, autoApprove: true }),
    reviewerBasis: () => ledger.append("approval.granted", FOUNDER, { taskId: id, artifactDigest: digest, basis: { reviewTaskId: reviewTask } }),
    transitionToApproved: () => ledger.append("task.transition", ORCHESTRATOR, { taskId: id, to: "APPROVED" }),
    transitionToDone: () => ledger.append("task.transition", ORCHESTRATOR, { taskId: id, to: "DONE" }),
  };
  const codes = Object.fromEntries(Object.entries(attempts).map(([k, fn]) => [k, codeOf(fn)]));
  assert.deepEqual(codes, {
    orchestrator: "FOUNDER_ONLY", agent: "FOUNDER_ONLY", founderNotAuthenticated: "FOUNDER_ONLY", founderViaOrchestratorSurface: "FOUNDER_ONLY",
    autoFlag: "AUTO_APPROVE_FORBIDDEN", reviewerBasis: "FOUNDER_ONLY", transitionToApproved: "APPROVAL_REQUIRED", transitionToDone: "INVALID_TRANSITION",
  });
  // Even the authenticated founder can't approve MOCK work for release.
  assert.equal(codeOf(() => approve(ledger, id, FOUNDER, { artifactDigest: digest })), "MOCK_NOT_APPROVABLE");
  assert.equal(ledger.head(), head, "no refused approval left a record");
  assert.equal(ledger.task(id).state, "READY_FOR_APPROVAL");
});

test("Level C on an all-LIVE lineage: only the authenticated founder, naming the exact digest, can approve", async () => {
  const live = stubLive();
  const f = fresh();
  const run = await runPipeline({ ledger: f.ledger, pipeline: tinyPipeline(), objective: OBJECTIVE, adapters: live.adapters, config: openCaps, now: NOW });
  assert.equal(run.status, "AWAITING_FOUNDER_APPROVAL");
  const id = run.detail;
  const digest = f.ledger.task(id).inputs[0];
  assert.equal(f.ledger.state().outputsByDigest[digest].mode, "LIVE");
  assert.equal(codeOf(() => approve(f.ledger, id, ORCHESTRATOR, { artifactDigest: digest })), "FOUNDER_ONLY");
  assert.equal(codeOf(() => approve(f.ledger, id, FOUNDER, { artifactDigest: digestOf({ other: true }) })), "DIGEST_MISMATCH");
  approve(f.ledger, id, FOUNDER, { artifactDigest: digest });
  assert.equal(f.ledger.task(id).state, "DONE");
  assert.equal(f.ledger.task(id).approvals[0].approver.id, "founder");
});
