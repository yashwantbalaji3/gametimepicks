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
import { createHandoffLoop, checkBrief, renderBrief, briefFingerprint, v3Status, V3_STATUSES, route } from "../handoff-loop.mjs";
import { selectFacts } from "../project-facts.mjs";
import { runDemo, createScriptedMocks, demoBrief, demoReport, DEMO_REQUEST, FOUNDER, KNOWN_COMMITS } from "../handoff-demo.mjs";

const ORIGIN = "2026-11-03T16:00:00.000Z";
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

function setup({ script, loop = {}, commits = KNOWN_COMMITS, adapters, worker = true, clock: c } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-v3-test-"));
  const clock = c ?? stepClock(ORIGIN);
  const ledger = createTaskLedger({ store: createFileStore({ dir, clock }), clock, ledgerId: "v3" });
  const mocks = createScriptedMocks(script);
  const l = createHandoffLoop({ ledger, adapters: adapters ?? mocks.adapters, config: budgetConfig(), loop, now: clock, checkers: { commitExists: (sha) => commits.includes(sha) } });
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
  assert.equal(verify1.outputs[0].artifact.claims.find((c) => c.claim.startsWith("commit")).status, "VERIFIED");
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
  // 8. Grok contributed an independent research step through the API route, with sources
  const grok = tasksBy(ledger, "grok-research")[0];
  assert.equal(grok.route.mode, "api");
  assert.equal(grok.state, "DONE");
  assert.ok(grok.outputs[0].artifact.findings.every((f) => f.url.startsWith("https://")));
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
  // 12. complete audit: replay is byte-identical, every output attributed and MOCK, $0, no network
  assert.equal(canonicalJson(replay(ledger.events())), canonicalJson(ledger.state()));
  const outs = Object.values(ledger.state().tasks).flatMap((t) => t.outputs);
  assert.ok(outs.length > 10);
  assert.ok(outs.every((o) => o.mode === "MOCK" && o.cost.usd === 0 && o.provider));
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
  const t = setup({ adapters });
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
    const loop = createHandoffLoop({ ledger, adapters, config, now: clock, checkers: { commitExists: () => true } });
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
