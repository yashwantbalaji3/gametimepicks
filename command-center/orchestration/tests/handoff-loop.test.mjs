/**
 * Handoff loop (Command Center V3) tests. Run: node --test command-center/orchestration/tests/*.test.mjs
 * The no-network guard is loaded first. Agents are scripted MOCK stand-ins (handoff-demo.mjs) except where a test
 * uses the live adapter factory over a stubbed transport to prove the $0 caps stop a real call.
 */
import { NETWORK_ATTEMPTS } from "../../tests/no-network-preload.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileStore } from "../../ledger/store.mjs";
import { stepClock, canonicalJson } from "../../lib/util.mjs";
import { createTaskLedger, replay } from "../task-ledger.mjs";
import { budgetConfig } from "../budgets.mjs";
import { createLiveAdapters } from "../adapters.mjs";
import { createHandoffLoop, checkBrief, renderBrief, briefFingerprint, v3Status, V3_STATUSES, route, requiredWorkstreams, isRealSource } from "../handoff-loop.mjs";
import { selectFacts } from "../project-facts.mjs";
import { runDemo, createScriptedMocks, demoBrief, demoReport, DEMO_REQUEST, FOUNDER, KNOWN_COMMITS } from "../handoff-demo.mjs";

const ORIGIN = "2026-11-03T16:00:00.000Z";
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

function setup({ script, loop = {}, commits = KNOWN_COMMITS, adapters, worker = true, clock: c, paidEnabled = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-v3-test-"));
  const clock = c ?? stepClock(ORIGIN);
  const ledger = createTaskLedger({ store: createFileStore({ dir, clock }), clock, ledgerId: "v3" });
  const mocks = createScriptedMocks(script);
  const l = createHandoffLoop({ ledger, adapters: adapters ?? mocks.adapters, config: budgetConfig(), loop, now: clock, checkers: { commitExists: (sha) => commits.includes(sha) }, paidEnabled });
  const w = worker ? l.registerWorker({ id: "w1" }) : null;
  return { ledger, loop: l, mocks, worker: w, clock };
}
/** Drive the loop and the worker until neither can move. */
async function drive({ ledger, loop, worker }, report = demoReport) {
  for (let i = 0; i < 30; i++) {
    await loop.runUntilIdle();
    const job = worker && loop.claimNext(worker);
    if (!job) return;
    loop.submit(worker, job.taskId, report(ledger.task(job.taskId)));
  }
}
const tasksBy = (ledger, step) => { const s = ledger.state(); return s.taskOrder.map((id) => s.tasks[id]).filter((t) => t.stepKey === step); };

// ───────────────────────────── the 12-step acceptance run (MOCK) ─────────────────────────────

test("acceptance (MOCK): request → Claude → ChatGPT review → Claude fix + Grok research → CEO Home → founder decision, fully audited", async () => {
  const r = await runDemo({ origin: ORIGIN });
  const { ledger, loop, rootId } = r;
  const s = ledger.state();
  const tree = loop.views.tree(rootId);

  // 1. the request came from the founder's (mobile) surface
  const root = s.tasks[rootId];
  assert.equal(root.outputs[0].artifact.surface, "mobile-console");
  // 2. the planner assigned it to Claude engineering, through the worker queue
  const firstWork = tasksBy(ledger, "claude-engineering")[0];
  assert.equal(firstWork.route.mode, "queue");
  assert.equal(s.tasks[firstWork.parentTaskId].stepKey, "plan");
  // 3–4. Claude's completion report is in the ledger as that task's output, labelled MOCK
  assert.equal(firstWork.outputs[0].artifact.stage, "COMMITTED");
  assert.equal(firstWork.outputs[0].mode, "MOCK");
  // 5. the claim verifier and then ChatGPT evaluated it, automatically
  const verify1 = s.tasks[s.taskOrder.find((id) => s.tasks[id].stepKey === "verify" && s.tasks[id].parentTaskId === firstWork.taskId)];
  // The check ran (the commit exists), but a stand-in's report is never evidence: MOCK, not VERIFIED.
  const commitClaim = verify1.outputs[0].artifact.claims.find((c) => c.claim.startsWith("commit"));
  assert.equal(commitClaim.status, "MOCK");
  assert.match(commitClaim.detail, /not evidence \(found in the repository\)/);
  const eval1 = s.tasks[s.taskOrder.find((id) => s.tasks[id].stepKey === "evaluate" && s.tasks[id].subjectTaskId === firstWork.taskId)];
  assert.equal(eval1.assignedAgent.provider, "openai");
  assert.deepEqual(s.verdicts.find((v) => v.reviewTaskId === eval1.taskId).verdict, "changes");
  // 6. ChatGPT's next prompt is implementation-ready and stored verbatim on the handoff
  const fix = tasksBy(ledger, "claude-engineering").find((t) => t.brief.fixesSubject);
  const fixHandoff = s.handoffs.find((h) => h.toTaskId === fix.taskId);
  assert.equal(fixHandoff.fromTaskId, eval1.taskId);
  for (const section of ["## Objective", "## Acceptance criteria", "## Tests to run", "## Constraints and safeguards", "## Report back"]) assert.match(fixHandoff.instructions, new RegExp(section));
  assert.equal(checkBrief(fix.brief).ok, true);
  // the original is SUPERSEDED by the fix (not marked done on Claude's word)
  assert.equal(firstWork.state, "SUPERSEDED");
  assert.equal(firstWork.outcome.supersededBy, fix.taskId);
  // 7. the worker received exactly that text through the queue, with the earlier report in its context
  assert.equal(fix.claim.worker.id, "mock-claude-code-worker-1");
  assert.ok(fix.inputs.includes(firstWork.outputs[0].artifactDigest), "the fix task's inputs carry Claude's first report");
  // 8. Grok contributed an independent research step through the API route; a stand-in never invents a source
  const grok = tasksBy(ledger, "grok-research")[0];
  assert.equal(grok.route.mode, "api");
  assert.equal(grok.state, "DONE");
  assert.ok(grok.outputs[0].artifact.findings.every((f) => f.url === "mock:no-source" && /^\[MOCK\]/.test(f.claim)));
  // 9. outputs moved only through the ledger: every non-root task was created by a handoff from a recorded artifact
  for (const t of Object.values(s.tasks).filter((t) => t.taskId !== rootId)) {
    const h = s.handoffs.find((x) => x.toTaskId === t.taskId);
    assert.ok(h && s.outputsByDigest[h.artifactDigest], `${t.taskId} has a handoff from a recorded artifact`);
  }
  // completed only after verification AND an independent accept
  assert.equal(fix.state, "DONE");
  assert.equal(fix.approvals[0].basis.reviewTaskId, s.verdicts.find((v) => v.subjectTaskId === fix.taskId && v.verdict === "approve").reviewTaskId);
  // 10. CEO Home shows the result, evidence summary and next steps, labelled MOCK
  const home = loop.views.home().find((h) => h.taskId === rootId);
  assert.equal(home.mode, "MOCK");
  assert.match(home.summary, /UTC/);
  assert.ok(home.nextSteps.length >= 1);
  assert.ok(home.decision);
  assert.equal(v3Status(s, s.tasks[home.decision.taskId]), "NEEDS_FOUNDER_APPROVAL");
  // 11. approve is refused on MOCK lineage; redirect works; reject closes
  assert.equal(codeOf(() => loop.founderDecision(FOUNDER, home.decision.taskId, { action: "approve", artifactDigest: home.decision.digest })), "MOCK_NOT_APPROVABLE");
  assert.equal(codeOf(() => loop.founderDecision({ ...FOUNDER, authenticated: false }, home.decision.taskId, { action: "reject" })), "FOUNDER_ONLY");
  const red = loop.founderDecision(FOUNDER, home.decision.taskId, { action: "redirect", objective: "Also show the label on the mobile approvals screen at 390 px" });
  await drive({ ledger, loop, worker: r.worker });
  const s2 = ledger.state();
  assert.equal(s2.tasks[home.decision.taskId].state, "SUPERSEDED");
  assert.ok(s2.taskOrder.some((id) => s2.tasks[id].subjectTaskId === red.redirectTaskId && s2.tasks[id].stepKey === "plan"), "the redirect was planned again");
  const d2 = loop.views.home().find((h) => h.taskId === rootId).decision;
  loop.founderDecision(FOUNDER, d2.taskId, { action: "reject", note: "demo ends here" });
  assert.equal(ledger.task(rootId).state, "CANCELLED");
  // 12. complete audit: replay is byte-identical, every agent output attributed and MOCK (the founder's own words are
  // real input, so LIVE), $0, no network
  assert.equal(canonicalJson(replay(ledger.events())), canonicalJson(ledger.state()));
  const outs = Object.values(ledger.state().tasks).flatMap((t) => t.outputs);
  assert.ok(outs.length > 10);
  assert.ok(outs.filter((o) => o.provider !== "founder").every((o) => o.mode === "MOCK" && o.cost.usd === 0 && o.provider));
  assert.ok(outs.filter((o) => o.provider === "founder").every((o) => o.mode === "LIVE" && o.cost.usd === 0 && o.model === null));
  assert.deepEqual(NETWORK_ATTEMPTS, []);
});

// ───────────────────────────── briefs ─────────────────────────────

test("checkBrief refuses generic or incomplete assignments and accepts an executable one", () => {
  assert.equal(checkBrief(demoBrief()).ok, true);
  assert.match(checkBrief(demoBrief({ objective: "Continue improving the Simulation Theater for users everywhere please" })).problems.join(), /generic instruction/);
  assert.match(checkBrief(demoBrief({ acceptanceCriteria: [] })).problems.join(), /acceptanceCriteria/);
  assert.match(checkBrief(demoBrief({ tests: [] })).problems.join(), /tests/);
  assert.equal(checkBrief({ ...demoBrief(), assignee: "grok-research", tests: [] }).ok, true, "research needs no test command");
  assert.equal(briefFingerprint(demoBrief()), briefFingerprint(demoBrief({ objective: `  ${demoBrief().objective.toUpperCase()} ` })));
  assert.match(renderBrief(demoBrief({ codeLocations: [{ path: "a.mjs", verified: false }] })), /a\.mjs \(UNVERIFIED/);
});

test("a planner that only returns generic briefs is retried once, then escalated — nothing is routed", async () => {
  const generic = { ...demoBrief(), objective: "Continue improving the queue header so that it is better for the founder" };
  const t = setup({ script: { plan: () => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, followUps: [generic], rationale: "", ceoSummary: "" }) } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "g" });
  await drive(t);
  assert.equal(tasksBy(t.ledger, "plan").length, 2, "one retry");
  assert.equal(tasksBy(t.ledger, "claude-engineering").length, 0);
  const d = tasksBy(t.ledger, "decision")[0];
  assert.equal(d.meta.escalation.code, "INVALID_EVALUATION");
});

// ───────────────────────────── claims vs verification ─────────────────────────────

test("a CLOSE over a contradicted claim is refused: an unknown commit is caught by the verifier", async () => {
  const t = setup({ commits: [], script: { evaluate: () => ({ verdict: "accept", decision: "CLOSE", requirementCoverage: [{ requirement: "x", met: "yes", evidence: "trust me" }], missing: [], findings: [], qaRequired: false, followUps: [], rationale: "", ceoSummary: "done" }) } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "c" });
  await drive(t);
  const work = tasksBy(t.ledger, "claude-engineering")[0];
  assert.notEqual(work.state, "DONE", "never completed on the worker's word");
  const v = tasksBy(t.ledger, "verify")[0].outputs[0].artifact;
  assert.equal(v.claims.find((c) => c.claim.startsWith("commit")).status, "CONTRADICTED");
  assert.equal(tasksBy(t.ledger, "decision")[0].meta.escalation.code, "INVALID_EVALUATION");
});

test("an incomplete completion report blocks the task as an AGENT problem; it is never evaluated", async () => {
  const t = setup();
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "i" });
  await drive(t, () => ({ summary: "done!" }));
  const work = tasksBy(t.ledger, "claude-engineering")[0];
  assert.equal(work.state, "BLOCKED");
  assert.deepEqual([work.blocker.class, work.blocker.code], ["AGENT", "INVALID_REPORT"]);
  assert.equal(tasksBy(t.ledger, "evaluate").length, 0);
});

// ───────────────────────────── bounds ─────────────────────────────

test("the same finding twice escalates instead of a third fix", async () => {
  const changes = (req, subject) => ({
    verdict: "changes", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], qaRequired: false, rationale: "", ceoSummary: "",
    findings: [{ id: "F1", severity: "major", text: "Label still shows local time" }],
    followUps: [demoBrief({ fixesSubject: true, objective: `Fix the label so it renders UTC — attempt after ${subject.taskId}`, acceptanceCriteria: [`UTC label verified for ${subject.taskId}`] })],
  });
  const t = setup({ script: { evaluate: changes } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r" });
  await drive(t);
  assert.equal(tasksBy(t.ledger, "evaluate").length, 2);
  assert.equal(tasksBy(t.ledger, "claude-engineering").length, 2, "one original, one fix, no third");
  assert.equal(tasksBy(t.ledger, "decision")[0].meta.escalation.code, "REPEATED_FINDING");
});

test("a duplicate brief in one request is skipped, and depth / task-count bounds escalate", async () => {
  const dup = { plan: () => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, followUps: [demoBrief(), demoBrief()], rationale: "", ceoSummary: "" }) };
  const t = setup({ script: dup });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "d" });
  await t.loop.runUntilIdle();
  assert.equal(tasksBy(t.ledger, "claude-engineering").length, 1);
  assert.ok(t.ledger.state().notifications.some((n) => /skipped duplicate brief/.test(n.reason)));

  const deep = setup({ loop: { maxDepth: 1 } });
  deep.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "deep" });
  await drive(deep);
  assert.equal(tasksBy(deep.ledger, "decision")[0].meta.escalation.code, "LOOP_DEPTH");
});

// ───────────────────────────── routing ─────────────────────────────

test("routing: no queue worker → the engineering task is BLOCKED with the limitation named; the Program Director is never auto-driven", async () => {
  const t = setup({ worker: false });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "nw" });
  await t.loop.runUntilIdle();
  const work = tasksBy(t.ledger, "claude-engineering")[0];
  assert.deepEqual([work.state, work.blocker.code], ["BLOCKED", "NO_WORKER"]);
  const pd = route("program-director", { adapters: t.mocks.adapters, workers: [] });
  assert.equal(pd.mode, "manual");
  assert.match(pd.limitation, /no supported interface/);
  assert.equal(route("grok-research", { adapters: {}, workers: [] }).mode, "manual");
});

test("the evaluator is always a different provider from the work it judges", async () => {
  const t = setup({ script: { plan: () => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, rationale: "", ceoSummary: "", followUps: [{ ...demoBrief(), assignee: "chatgpt-product", tests: [] }] }), work: () => demoReport({ taskId: "x", brief: demoBrief() }) } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "p" });
  await drive(t);
  const product = tasksBy(t.ledger, "chatgpt-product")[0];
  const ev = tasksBy(t.ledger, "evaluate").find((e) => e.subjectTaskId === product.taskId);
  assert.equal(product.assignedAgent.provider, "openai");
  assert.equal(ev.assignedAgent.provider, "anthropic");
});

// ───────────────────────────── leases, deadlines, budgets ─────────────────────────────

test("an expired worker lease re-queues the task; a passed deadline fails it and escalates", async () => {
  let t0 = Date.parse(ORIGIN);
  const clock = () => new Date((t0 += 1000)).toISOString();
  const t = setup({ clock, loop: { leaseMs: 60_000, taskTimeoutMs: 3600_000 } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "l" });
  await t.loop.runUntilIdle();
  const job = t.loop.claimNext(t.worker);
  t0 += 120_000;
  t.loop.sweep();
  assert.equal(t.ledger.task(job.taskId).state, "PLANNED");
  assert.equal(t.loop.claimNext(t.loop.registerWorker({ id: "w2" })).taskId, job.taskId, "another worker takes it over");
  t0 += 2 * 3600_000;
  t.loop.sweep();
  assert.equal(t.ledger.task(job.taskId).state, "FAILED");
  assert.equal(tasksBy(t.ledger, "decision")[0].meta.escalation.code, "TIMEOUT");
});

test("budget: with the default $0 caps a live planner call is refused before any request, and the founder sees it", async () => {
  const calls = [];
  const fetch = async (url) => { calls.push(url); throw new Error("must not be called"); };
  const env = { OPENAI_API_KEY: "dummy", OPENAI_MODEL: "test-model", OPENAI_PRICE_IN_PER_M: "2", OPENAI_PRICE_OUT_PER_M: "10" };
  const { adapters } = createLiveAdapters({ env, fetch, sleep: async () => {} });
  const off = setup({ adapters });
  off.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "b" });
  await off.loop.runUntilIdle();
  assert.equal(tasksBy(off.ledger, "plan")[0].blocker.code, "PAID_DISABLED", "paid execution is off by default, before any cap check");
  const t = setup({ adapters, paidEnabled: true });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "b" });
  await t.loop.runUntilIdle();
  const plan = tasksBy(t.ledger, "plan")[0];
  assert.equal(calls.length, 0);
  assert.deepEqual([plan.state, plan.blocker.code], ["BLOCKED", "BUDGET_HARD_STOP"]);
  assert.equal(v3Status(t.ledger.state(), plan), "NEEDS_FOUNDER_APPROVAL");
});

// ───────────────────────────── views and facts ─────────────────────────────

test("V3 statuses are derived for every ledger state; views stay small; facts are capped", async () => {
  const r = await runDemo({ origin: ORIGIN });
  const s = r.ledger.state();
  for (const t of Object.values(s.tasks)) assert.ok(V3_STATUSES.includes(v3Status(s, t)), `${t.state} maps`);
  assert.ok(Buffer.byteLength(JSON.stringify(r.loop.views.home())) < 4000);
  assert.ok(Buffer.byteLength(JSON.stringify(r.loop.views.tree(r.rootId))) < 8000);
  assert.ok(r.loop.views.activity("openai").length >= 3);
  const facts = selectFacts("nba social graphics odds lines engineering merge release forecast results");
  assert.ok(facts.length >= 4 && facts.reduce((n, f) => n + f.text.length, 0) <= 4000);
  assert.ok(selectFacts("anything").some((f) => f.id === "canonical-forecast"));
});

test("nothing in this file reached the network", () => {
  assert.deepEqual(NETWORK_ATTEMPTS, []);
});

// ───────────────────────────── regressions from the independent review ─────────────────────────────

const epochOf = (t) => t.history.filter((h) => h.state === "IN_PROGRESS").at(-1).seq;

test("review #1: after a lease expires another worker really takes the task over — twice", async () => {
  let t0 = Date.parse(ORIGIN);
  const clock = () => new Date((t0 += 1000)).toISOString();
  const t = setup({ clock, loop: { leaseMs: 60_000 } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r1" });
  await t.loop.runUntilIdle();
  const job = t.loop.claimNext(t.worker);
  t0 += 120_000; t.loop.sweep();
  const w2 = t.loop.registerWorker({ id: "w2" });
  assert.equal(t.loop.claimNext(w2).taskId, job.taskId);
  assert.equal(t.ledger.task(job.taskId).state, "IN_PROGRESS");
  t0 += 120_000; t.loop.sweep();
  assert.equal(t.ledger.task(job.taskId).state, "PLANNED", "a second expiry requeues too");
  const w3 = t.loop.registerWorker({ id: "w3" });
  assert.equal(t.loop.claimNext(w3).taskId, job.taskId);
  t.loop.submit(w3, job.taskId, demoReport(t.ledger.task(job.taskId)));
  assert.equal(t.ledger.task(job.taskId).state, "NEEDS_REVIEW");
});

test("review #2: an accept over contradicted claims or unmet requirements is refused even with FOLLOW_UP", async () => {
  const acceptAnyway = () => ({ verdict: "accept", decision: "FOLLOW_UP", requirementCoverage: [{ requirement: "x", met: "no", evidence: "" }], missing: [], findings: [], qaRequired: false, rationale: "", ceoSummary: "",
    followUps: [{ ...demoBrief(), assignee: "grok-research", tests: [], objective: "Research three dashboards' freshness wording with links to inform our label copy" }] });
  const t = setup({ commits: [], script: { evaluate: acceptAnyway } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r2" });
  await drive(t, (task) => demoReport(task, { tests: [{ command: "npm test", passed: 1, failed: 3 }] }));
  assert.notEqual(tasksBy(t.ledger, "claude-engineering")[0].state, "DONE");
  assert.equal(tasksBy(t.ledger, "decision")[0].meta.escalation.code, "INVALID_EVALUATION");
});

test("review #3: a crash between recording a report and acting on it is resumed; re-submitting writes nothing twice", async () => {
  const t = setup();
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r3" });
  await t.loop.runUntilIdle();
  const job = t.loop.claimNext(t.worker);
  const task = t.ledger.task(job.taskId);
  const report = demoReport(task);
  // the crash: the output is recorded exactly as submit() records it, and nothing after it runs
  t.ledger.recordOutput(job.taskId, { role: "agent", id: "w1", surface: "worker" }, { adapter: { provider: "anthropic", model: "mock-claude-code-worker" }, isLive: false, result: { artifact: report, usage: { usd: 0, estimated: true } } }, { idempotencyKey: `v3:${job.taskId}:output:${epochOf(task)}` });
  assert.throws(() => t.loop.submit(t.worker, job.taskId, { ...report, summary: "a different report" }), /IDEMPOTENCY_MISMATCH/);
  t.loop.submit(t.worker, job.taskId, report); // the worker retries with the same report
  await t.loop.runUntilIdle();
  const after = t.ledger.task(job.taskId);
  assert.equal(after.outputs.length, 1);
  assert.equal(after.attempts, 1);
  assert.notEqual(after.state, "IN_PROGRESS");
});

test("review #4: rejecting a request cancels everything under it; no worker or model runs for it again", async () => {
  const t = setup({ loop: { maxTasksPerRequest: 3 } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r4" });
  await t.loop.runUntilIdle();
  const queued = tasksBy(t.ledger, "claude-engineering")[0];
  const d = t.loop.founderDecision; // escalation needs a decision: open one by redirect-free path — use the planner's LOOP_TASKS
  const decision = tasksBy(t.ledger, "decision")[0] ?? null;
  assert.equal(queued.state, "PLANNED");
  // force a decision: drive one report so the evaluation escalates at the task bound
  await drive(t);
  const dec = tasksBy(t.ledger, "decision").find((x) => x.state === "READY_FOR_APPROVAL");
  assert.ok(dec, "an escalation is waiting");
  d(FOUNDER, dec.taskId, { action: "reject" });
  const s = t.ledger.state();
  assert.ok(Object.values(s.tasks).every((x) => ["DONE", "CANCELLED", "SUPERSEDED", "FAILED"].includes(x.state)), "nothing left open");
  assert.equal(t.loop.claimNext(t.worker), null);
  assert.equal(await t.loop.step(), null);
  assert.equal(decision, null);
});

test("review #5: a live worker's claim is checked against the caps and the request ceiling; an overrun escalates", async () => {
  const plan = { verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, rationale: "", ceoSummary: "", followUps: [demoBrief()] };
  const fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ model: "test-model", output_text: JSON.stringify(plan), usage: { input_tokens: 10, output_tokens: 10 } }) });
  const env = { OPENAI_API_KEY: "dummy", OPENAI_MODEL: "test-model", OPENAI_PRICE_IN_PER_M: "1", OPENAI_PRICE_OUT_PER_M: "1" };
  const { adapters } = createLiveAdapters({ env, fetch, sleep: async () => {} });
  const caps = { GTP_CC_OPENAI_DAILY_CAP_USD: "1", GTP_CC_OPENAI_MONTHLY_CAP_USD: "1", GTP_CC_ANTHROPIC_DAILY_CAP_USD: "100", GTP_CC_ANTHROPIC_MONTHLY_CAP_USD: "100", GTP_CC_AGENT_DAILY_CAP_USD: "100", GTP_CC_AGENT_MONTHLY_CAP_USD: "100" };
  const run = async (config) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-v3-r5-"));
    const clock = stepClock(ORIGIN);
    const ledger = createTaskLedger({ store: createFileStore({ dir, clock }), clock, ledgerId: "r5" });
    const loop = createHandoffLoop({ ledger, adapters, config, now: clock, checkers: { commitExists: () => true }, paidEnabled: true });
    const w = loop.registerWorker({ id: "live-w", model: "claude-code", env: { ANTHROPIC_API_KEY: "dummy" }, maxBudgetUsd: 2 });
    loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r5" });
    await loop.runUntilIdle();
    return { ledger, loop, w };
  };
  const zero = await run(budgetConfig({ env: { GTP_CC_OPENAI_DAILY_CAP_USD: "1", GTP_CC_OPENAI_MONTHLY_CAP_USD: "1", GTP_CC_AGENT_DAILY_CAP_USD: "1", GTP_CC_AGENT_MONTHLY_CAP_USD: "1" } }));
  assert.equal(zero.loop.claimNext(zero.w), null, "$0 Claude cap: the claim is refused");
  assert.equal(tasksBy(zero.ledger, "claude-engineering")[0].blocker.code, "BUDGET_HARD_STOP");
  const open = await run(budgetConfig({ env: caps }));
  const job = open.loop.claimNext(open.w);
  assert.ok(job, "caps open: claimed");
  open.loop.submit(open.w, job.taskId, demoReport(open.ledger.task(job.taskId)), { usd: 40, estimated: false });
  assert.equal(open.ledger.task(job.taskId).blocker.code, "BUDGET_OVERRUN");
  assert.equal(tasksBy(open.ledger, "decision")[0].meta.escalation.code, "BUDGET_OVERRUN");
});

test("review #5b: a live worker is never handed a task built on MOCK output", async () => {
  const t = setup();
  const live = t.loop.registerWorker({ id: "live-w", model: "claude-code", env: { ANTHROPIC_API_KEY: "dummy" } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r5b" });
  await t.loop.runUntilIdle();
  assert.equal(t.loop.claimNext(live), null);
  assert.equal(tasksBy(t.ledger, "claude-engineering")[0].blocker.code, "MOCK_LINEAGE");
});

test("review #6 and #8: a redirect after a full round is planned and routed (not LOOP_DEPTH); approve names the MOCK task", async () => {
  const r = await runDemo({ origin: ORIGIN });
  const d = r.loop.views.home()[0].decision;
  assert.throws(() => r.loop.founderDecision(FOUNDER, d.taskId, { action: "approve", artifactDigest: d.digest }), /in this request produced MOCK output/);
  const red = r.loop.founderDecision(FOUNDER, d.taskId, { action: "redirect", objective: "Also show the label on the mobile approvals screen at 390 px" });
  await r.loop.runUntilIdle();
  const s = r.ledger.state();
  const plan = Object.values(s.tasks).find((x) => x.subjectTaskId === red.redirectTaskId && x.stepKey === "plan");
  assert.ok(Object.values(s.tasks).some((x) => x.parentTaskId === plan.taskId && x.stepKey === "claude-engineering"), "the redirect's assignment was routed");
  assert.ok(!Object.values(s.tasks).some((x) => x.meta?.escalation?.code === "LOOP_DEPTH"));
});

test("review #7: a fix brief that restates its subject is routed, and the subject is superseded", async () => {
  const restate = (req, subject) => subject.brief.fixesSubject
    ? { verdict: "accept", decision: "CLOSE", requirementCoverage: [{ requirement: "x", met: "yes", evidence: "ok" }], missing: [], findings: [], qaRequired: false, followUps: [], rationale: "", ceoSummary: "fixed" }
    : { verdict: "changes", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], qaRequired: false, rationale: "", ceoSummary: "", findings: [{ id: "F1", severity: "major", text: "label wrong" }], followUps: [demoBrief({ fixesSubject: true })] };
  const t = setup({ script: { evaluate: restate } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r7" });
  await drive(t);
  const [orig, fix] = tasksBy(t.ledger, "claude-engineering");
  assert.equal(orig.state, "SUPERSEDED");
  assert.equal(fix.state, "DONE");
  assert.equal(tasksBy(t.ledger, "decision")[0].meta?.escalation ?? null, null, "closed normally, not escalated");
});

test("review #9: two timeouts under one parent each reach the founder", async () => {
  let t0 = Date.parse(ORIGIN);
  const clock = () => new Date((t0 += 1000)).toISOString();
  const two = { plan: () => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, rationale: "", ceoSummary: "", followUps: [demoBrief(), demoBrief({ assignee: "claude-qa", objective: "Check the queue header label at 390, 430, 768 and 1440 px in a real browser" })] }) };
  const t = setup({ clock, worker: false, script: two, loop: { taskTimeoutMs: 3600_000 } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "r9" });
  await t.loop.runUntilIdle();
  t0 += 2 * 3600_000;
  t.loop.sweep();
  const decisions = tasksBy(t.ledger, "decision").filter((d) => d.meta?.escalation?.code === "TIMEOUT");
  assert.equal(decisions.length, 2);
});

// ───────────────────────────── cost-first routing (founder 2026-11-03) ─────────────────────────────

test("cost: a low-risk report our checks fully verify closes with no model call; a direct brief skips the planner", async () => {
  // A real worker (the founder's own subscription, $0): only real output can be verified, so only it closes on our checks.
  const t = setup({ worker: false });
  t.worker = t.loop.registerWorker({ id: "w-live", model: "claude-code", credential: "subscription", env: { CLAUDE_CODE_OAUTH_TOKEN: "set" } });
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "low", brief: demoBrief({ risk: "low" }) });
  await drive(t);
  const s = t.ledger.state();
  assert.equal(tasksBy(t.ledger, "plan").length, 0, "no planner call");
  assert.equal(tasksBy(t.ledger, "evaluate").length, 0, "no evaluator call");
  assert.equal(t.mocks.calls.length, 0, "no model was called at all");
  const work = tasksBy(t.ledger, "claude-engineering")[0];
  assert.deepEqual([work.state, work.outcome.deterministic, work.approvalLevel], ["DONE", true, "A"]);
  assert.ok(tasksBy(t.ledger, "decision")[0], "the founder still decides on closing the request");
  assert.equal(t.loop.views.spend().closedWithoutModel, 1);
  assert.equal(s.verdicts.length, 0);

  // The same low-risk report from a MOCK worker is not evidence: it goes to an evaluator instead of closing on our checks.
  const m = setup();
  m.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "low-mock", brief: demoBrief({ risk: "low" }) });
  await drive(m);
  assert.notEqual(tasksBy(m.ledger, "claude-engineering")[0].outcome?.deterministic, true, "MOCK output never closes without review");
  assert.ok(tasksBy(m.ledger, "evaluate").length >= 1);
});

test("cost: low risk that our checks can't fully verify falls back to a light-tier evaluator; high risk gets the strong tier", async () => {
  const tiers = [];
  const t = setup({ commits: [] }); // commit not found → not VERIFIED
  const wrap = (a) => ({ ...a, run: (req) => { tiers.push([req.step.key, req.tier]); return a.run(req); } });
  for (const k of Object.keys(t.mocks.adapters)) t.mocks.adapters[k] = wrap(t.mocks.adapters[k]);
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "fall", brief: demoBrief({ risk: "low" }) });
  await drive(t);
  assert.ok(tasksBy(t.ledger, "evaluate").length >= 1, "unverified low-risk work goes to an evaluator");
  const evals = tiers.filter(([k]) => ["evaluate", "plan"].includes(k));
  assert.ok(evals.length >= 1 && evals.every(([, tier]) => tier === "light"), "evaluators of low/medium work run on the light tier");
  assert.ok(tiers.filter(([k]) => k === "grok-research").every(([, tier]) => tier === "standard"), "research runs on the standard tier");

  const h = setup();
  const seen = [];
  for (const k of Object.keys(h.mocks.adapters)) { const a = h.mocks.adapters[k]; h.mocks.adapters[k] = { ...a, run: (req) => { seen.push([req.step.key, req.tier]); return a.run(req); } }; }
  h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "high", brief: demoBrief({ risk: "high" }) });
  await drive(h);
  assert.deepEqual(seen.find(([k]) => k === "evaluate"), ["evaluate", "strong"]);
});

test("cost: a brief without a risk level is refused; large input artifacts reach a model as digest + summary", async () => {
  assert.match(checkBrief({ ...demoBrief(), risk: undefined }).problems.join(), /risk/);
  const big = [];
  const t = setup({ loop: { maxInputArtifactChars: 200 } });
  const a = t.mocks.adapters.openai;
  t.mocks.adapters.openai = { ...a, run: (req) => { big.push(...req.inputs.map((i) => i.artifact.truncated === true)); return a.run(req); } };
  t.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "big" });
  await drive(t);
  assert.ok(big.includes(true), "a report larger than the limit was passed by reference");
});

test("cost: a subscription-credential worker is LIVE at $0 incremental; an API-key worker is refused while paid execution is off", async () => {
  const sub = setup({ worker: false });
  const w = sub.loop.registerWorker({ id: "sub-w", model: "claude-code", credential: "subscription", env: { CLAUDE_CODE_OAUTH_TOKEN: "dummy" } });
  assert.deepEqual([w.live, w.billing, w.maxBudgetUsd], [true, "subscription", 0]);
  sub.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "sub", brief: demoBrief({ risk: "low" }) });
  const job = sub.loop.claimNext(w);
  assert.ok(job, "the founder's brief is real input, so a live worker may take it");
  sub.loop.submit(w, job.taskId, demoReport(sub.ledger.task(job.taskId)), { usd: 3.2 });
  const out = sub.ledger.task(job.taskId).outputs[0];
  assert.deepEqual([out.mode, out.cost.usd], ["LIVE", 0]);

  const api = setup({ worker: false });
  const wa = api.loop.registerWorker({ id: "api-w", model: "claude-code", env: { ANTHROPIC_API_KEY: "dummy" } });
  api.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "api", brief: demoBrief({ risk: "low" }) });
  assert.equal(api.loop.claimNext(wa), null);
  assert.equal(tasksBy(api.ledger, "claude-engineering")[0].blocker.code, "PAID_DISABLED");
});

test("cost: the spend view reports caps, 80% alerts and usage by step", async () => {
  const r = await runDemo({ origin: ORIGIN });
  const sp = r.loop.views.spend();
  assert.equal(sp.paidEnabled, false);
  assert.deepEqual(Object.keys(sp.providers).sort(), ["anthropic", "openai", "xai"]);
  assert.ok(sp.bySteps.some((b) => b.step === "evaluate" && b.mode === "MOCK" && b.calls >= 3 && b.usd === 0));
  assert.equal(sp.providers.openai.alert, false);
});

// ── for the hosted HQ (Command Center asks, 2026-11-03) ──

test("HQ: a request's category is a ledger field; an unknown category is refused", () => {
  const h = setup();
  const id = h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "cat-1", category: "results" });
  assert.equal(h.ledger.task(id).category, "results");
  assert.equal(replay(h.ledger.events()).tasks[id].category, "results");
  assert.equal(h.loop.views.home()[0].category, "results");
  assert.equal(codeOf(() => h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "cat-2", category: "astrology" })), "INVALID_CATEGORY");
  assert.equal(h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "cat-3" }) !== id, true, "category stays optional");
});

test("HQ: intake again with the same requestKey returns the same request and writes nothing", () => {
  const h = setup();
  const a = h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "chat-42", category: "engineering" });
  const n = h.ledger.events().length;
  h.clock(); h.clock(); // time moves on between the two sends (the deadline would differ)
  const b = h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "chat-42", category: "engineering" });
  assert.equal(b, a);
  assert.equal(h.ledger.events().length, n);
  assert.notEqual(h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "chat-43" }), a, "a new key is a new request");
});

test("HQ: views.working shows which worker holds which task until it reports", async () => {
  const h = setup();
  h.loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "w-1" });
  await h.loop.runUntilIdle();
  assert.deepEqual(h.loop.views.working(), []);
  const job = h.loop.claimNext(h.worker);
  const w = h.loop.views.working();
  assert.equal(w.length, 1);
  assert.equal(w[0].taskId, job.taskId);
  assert.equal(w[0].worker.id, "w1");
  assert.equal(w[0].assignee, "claude-engineering");
  assert.equal(w[0].leaseExpired, false);
  h.loop.submit(h.worker, job.taskId, demoReport(h.ledger.task(job.taskId)));
  assert.deepEqual(h.loop.views.working(), []);
});

test("HQ: MOCK stand-ins name the founder's own request, not the scripted demo", async () => {
  const h = setup();
  const objective = "Add a last-updated UTC label to the Results V2 page header";
  const id = h.loop.intake(FOUNDER, { objective, acceptanceCriteria: ["The header shows the label"], requestKey: "echo-1" });
  await drive(h);
  const home = h.loop.views.home().find((r) => r.taskId === id);
  assert.match(home.summary, /^\[MOCK\] stand-ins simulated: Add a last-updated UTC label to the Results V2 page header\. Nothing was built, tested or verified$/);
  const texts = JSON.stringify(h.ledger.events().map((e) => e.body));
  assert.doesNotMatch(texts, /queue header/i, "nothing from the scripted demo leaks into another request");
  assert.equal(home.mode, "MOCK");
});

// ── founder acceptance test 2026-11-03 (req-91d1f106b158): the HQ must execute what was asked, not just close tasks ──

// The founder's request as described in their report (named agents and subject); the exact wording replaces this
// constant when available. What matters is preserved: four named workstreams and a Simulation Theater subject.
const UAT_REQUEST = "Improve Simulation Theater. Use ChatGPT planning to break the work down, Claude engineering to build the change, Grok competitor research on how rival sports sites present game simulations, and a ChatGPT independent engineering review of Claude's work.";

test("UAT: the agents a request names are read deterministically, clause by clause", () => {
  assert.deepEqual(requiredWorkstreams(UAT_REQUEST), ["chatgpt-review", "claude-engineering", "grok-research"]);
  assert.deepEqual(requiredWorkstreams("Have Claude test the betslip and Grok look at competitors"), ["claude-qa", "grok-research"]);
  assert.deepEqual(requiredWorkstreams("ChatGPT, audit the onboarding UX"), ["chatgpt-product"]);
  assert.deepEqual(requiredWorkstreams("Fix the results page header"), [], "no agent named: nothing is forced");
  assert.equal(isRealSource("https://www.espn.com/nba/game"), true);
  for (const u of ["https://example.invalid/mock-1", "https://example.com/x", "http://espn.com", "mock:no-source", "https://localhost/x", "https://site.test/a", ""]) assert.equal(isRealSource(u), false, u);
});

test("UAT: the founder's request runs every named workstream, criteria first, labelled REAL REQUEST / MOCK EXECUTION", async () => {
  const h = setup();
  const id = h.loop.intake(FOUNDER, { objective: UAT_REQUEST, requestKey: "uat-91d1", category: "theater" });
  const root = h.ledger.task(id);
  // testable acceptance criteria exist before any agent runs
  assert.equal(root.meta.criteriaSource, "generated");
  assert.equal(root.acceptanceCriteria.length, 4);
  assert.ok(root.acceptanceCriteria.some((c) => /Claude engineering/.test(c)) && root.acceptanceCriteria.some((c) => /real https source/.test(c)));
  await drive(h);
  const s = h.ledger.state();
  // every named workstream ran, with its own agent
  const eng = tasksBy(h.ledger, "claude-engineering");
  assert.ok(eng.length >= 1 && eng.every((t) => t.assignedAgent.provider === "anthropic"), "Claude engineering ran");
  const grok = tasksBy(h.ledger, "grok-research");
  assert.equal(grok.length, 1);
  assert.match(grok[0].objective, /Simulation Theater/, "Grok researched the requested subject");
  assert.doesNotMatch(JSON.stringify(grok[0].outputs), /Updated N min ago|example\.invalid|https:\/\//, "no unrelated finding and no invented source");
  assert.doesNotMatch(h.loop.views.home().find((r) => r.taskId === id).summary, /verified;|\bdone:/, "a MOCK summary never claims verification");
  assert.match(grok[0].outputs[0].artifact.summary, /^\[MOCK\] no research was run for: Improve Simulation Theater/, "the stand-in says it did nothing");
  const review = tasksBy(h.ledger, "evaluate").filter((t) => s.tasks[t.subjectTaskId].stepKey === "claude-engineering");
  assert.ok(review.length && review.every((t) => t.assignedAgent.provider === "openai"), "ChatGPT independently reviewed Claude's work");
  // the verifier never counts stand-in output as evidence
  for (const v of tasksBy(h.ledger, "verify")) assert.ok(v.outputs[0].artifact.claims.every((c) => c.status === "MOCK"), "every claim in MOCK output is labelled MOCK");
  // labels: real request, MOCK execution, and every workstream accounted for
  const home = h.loop.views.home().find((r) => r.taskId === id);
  assert.deepEqual([home.request, home.execution], ["REAL REQUEST", "MOCK"]);
  assert.deepEqual(home.workstreams.map((w) => [w.id, w.status]), [["chatgpt-review", "DONE"], ["claude-engineering", "DONE"], ["grok-research", "DONE"]]);
  assert.equal(h.loop.views.tree(id)[0].mode, "FOUNDER", "the request node is never shown as LIVE");
  const decision = tasksBy(h.ledger, "decision")[0];
  assert.match(decision.objective, /\(MOCK EXECUTION\)$/);
  assert.equal(decision.meta.execution, "MOCK");
  assert.match(s.handoffs.find((x) => x.toTaskId === decision.taskId).instructions, /no real code, test or research exists/);
  // and MOCK work still can't be approved
  assert.equal(codeOf(() => h.loop.founderDecision(FOUNDER, decision.taskId, { action: "approve", artifactDigest: decision.inputs[0] })), "MOCK_NOT_APPROVABLE");
});

test("UAT: a plan that drops a named workstream is refused, retried once, then escalated (never executed)", async () => {
  const onlyGrok = (req) => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, rationale: "[MOCK] research only", ceoSummary: "[MOCK] research only",
    followUps: [{ ...demoBrief(), assignee: "grok-research", tests: [], codeLocations: [], objective: `Research: ${req.state.tasks[req.task.rootTaskId].objective.slice(0, 80)}`, deliverables: ["A research report"], permissions: ["read-public-web"] }] });
  const h = setup({ script: { plan: onlyGrok } });
  const id = h.loop.intake(FOUNDER, { objective: UAT_REQUEST, requestKey: "uat-incomplete" });
  await drive(h);
  const plans = tasksBy(h.ledger, "plan");
  assert.equal(plans.length, 2, "one retry");
  assert.ok(plans.every((p) => p.outcome.refused?.some((x) => /plan omits required workstream\(s\): claude-engineering/.test(x))));
  assert.equal(tasksBy(h.ledger, "grok-research").length, 0, "nothing from a refused plan runs");
  const d = tasksBy(h.ledger, "decision");
  assert.equal(d.length, 1);
  assert.equal(d[0].meta.escalation.code, "INCOMPLETE_PLAN");
  assert.equal(h.loop.views.home().find((r) => r.taskId === id).workstreams.find((w) => w.id === "claude-engineering").status, "MISSING");
});

test("UAT: a request never reaches a close proposal while a named workstream has no accepted result", async () => {
  // Founder names only ChatGPT review; a planner that routes research alone passes the plan check (review is not an
  // assignment), but nothing ChatGPT accepted from Claude exists at the end: escalated, not proposed for closing.
  const researchOnly = (req) => ({ verdict: "not-applicable", decision: "FOLLOW_UP", requirementCoverage: [], missing: [], findings: [], qaRequired: false, rationale: "[MOCK]", ceoSummary: "[MOCK]",
    followUps: [{ ...demoBrief(), assignee: "grok-research", tests: [], codeLocations: [], objective: "Research how rival sports sites present game simulations, with sources", deliverables: ["A research report"], permissions: ["read-public-web"] }] });
  const h = setup({ script: { plan: researchOnly } });
  h.loop.intake(FOUNDER, { objective: "Get a ChatGPT independent engineering review of the Simulation Theater changes", requestKey: "uat-missing" });
  await drive(h);
  const d = tasksBy(h.ledger, "decision");
  assert.equal(d.length, 1);
  assert.equal(d[0].meta.escalation?.code, "INCOMPLETE_WORKSTREAMS");
  assert.match(d[0].meta.escalation.reason, /ChatGPT independent review/);
});

test("UAT: a stand-in that names a placeholder source is caught as UNSOURCED; nothing closes over it", async () => {
  const fabricated = (req) => ({ summary: "[MOCK]", findings: [{ claim: "Rival X shows live sims", url: "https://example.invalid/rival-x" }], limitations: [], suggestedNextSteps: [] });
  const h = setup({ script: { research: fabricated } });
  h.loop.intake(FOUNDER, { objective: "Grok competitor research on Simulation Theater features", requestKey: "uat-fab" });
  await drive(h);
  const v = tasksBy(h.ledger, "verify").find((t) => h.ledger.state().tasks[t.parentTaskId].stepKey === "grok-research");
  assert.equal(v.outputs[0].artifact.claims[0].status, "UNSOURCED");
  assert.ok(v.outputs[0].artifact.contradicted >= 1);
  const d = tasksBy(h.ledger, "decision");
  assert.ok(d.length && d.every((x) => x.meta.escalation), "only escalations reach the founder, never a close proposal");
});

test("UAT: retried runs and a resent request write nothing twice", async () => {
  const h = setup();
  const a = h.loop.intake(FOUNDER, { objective: UAT_REQUEST, requestKey: "uat-retry" });
  await drive(h);
  const n = h.ledger.events().length;
  await h.loop.runUntilIdle(); // a second function invocation (cron + page) over a settled request
  await h.loop.runUntilIdle();
  assert.equal(h.loop.intake(FOUNDER, { objective: UAT_REQUEST, requestKey: "uat-retry" }), a);
  assert.equal(h.ledger.events().length, n);
  assert.equal(tasksBy(h.ledger, "decision").length, 1);
});
