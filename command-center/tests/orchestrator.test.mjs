/** Track A: the CEO conversation end to end, on free seats, against the pinned 2026-10-25 slate. */
import test from "node:test";
import assert from "node:assert/strict";
import { REASON } from "../contracts/index.mjs";
import { freshOrchestrator, ledgerSnapshot, FOUNDER, STRANGER, RECAP_COMMAND } from "./helpers.mjs";

async function recapRun(opts) {
  const ctx = freshOrchestrator(opts);
  const r = await ctx.orchestrator.handleCommand(RECAP_COMMAND, FOUNDER);
  assert.equal(r.ok, true);
  return { ...ctx, commandId: r.commandId, s: ctx.orchestrator.state() };
}

test("recap command: visible plan, role contributions, LOOP_GUARD, one report, one digest-bound decision", async () => {
  const { s } = await recapRun();
  const c = s.commands[0];
  assert.equal(c.intent, "nfl-recap");
  assert.deepEqual(c.plan.steps.map((x) => x.role), ["prompt-architect", "engineering", "social-strategy", "chief-of-staff"]);

  const roles = c.contributions.map((x) => x.role);
  assert.deepEqual(roles, ["prompt-architect", "engineering", "integrity-reviewer", "creative-renderer", "social-strategy", "chief-of-staff"]);
  assert.ok(c.contributions.every((x) => x.cost.usd === 0));
  assert.ok(c.tasks.every((t) => t.status === "DONE"));
  assert.deepEqual(c.tasks.map((t) => t.hop), [1, 2, 3, 3, 1, 1]);

  const eng = c.contributions.find((x) => x.role === "engineering").artifact;
  assert.equal(eng.slateDate, "2026-10-25");
  assert.equal(eng.chosen.eventId, "401873022");

  assert.equal(c.refusals.length, 1);
  assert.equal(c.refusals[0].code, REASON.LOOP_GUARD);
  assert.equal(c.reports.length, 1);
  assert.match(c.reports[0].headline, /KC @ SEA/);

  assert.equal(s.decisions.length, 1);
  const d = s.decisions[0];
  assert.equal(d.options.length, 2);
  assert.ok(d.options.every((o) => /^[0-9a-f]{64}$/.test(o.digest) && o.check.ok));
  assert.equal(d.publisher, "mock");
});

test("approve → mock receipt; second approve is idempotent; nothing published twice", async () => {
  const { orchestrator, s } = await recapRun();
  const d = s.decisions[0];
  const first = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER);
  assert.equal(first.ok, true);
  assert.equal(first.receipt.state, "PUBLISHED_MOCK");
  assert.equal(first.receipt.costUsd, 0);
  const again = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER);
  assert.equal(again.duplicate, true);
  assert.equal(again.receipt.providerPostId, first.receipt.providerPostId);
  const after = orchestrator.state();
  assert.equal(after.history.filter((h) => h.kind === "publish-receipt").length, 1);
  assert.equal(after.history.filter((h) => h.kind === "decision").length, 1);
});

test("pause blocks at the send boundary; resume then publishes the same approval", async () => {
  const { orchestrator, s } = await recapRun();
  const d = s.decisions[0];
  orchestrator.setPaused(true, FOUNDER);
  const blocked = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "B", digest: d.options[1].digest }, FOUNDER);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, REASON.PAUSED);
  assert.equal(orchestrator.state().decisions[0].receipt, null);
  orchestrator.setPaused(false, FOUNDER);
  const sent = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "B", digest: d.options[1].digest }, FOUNDER);
  assert.equal(sent.ok, true);
  assert.equal(orchestrator.state().decisions[0].resolution.captionId, "B");
});

test("approvals are bound to the exact digest and to the founder", async () => {
  const { orchestrator, s } = await recapRun();
  const d = s.decisions[0];
  const stale = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[1].digest }, FOUNDER);
  assert.equal(stale.code, REASON.APPROVAL_DIGEST_MISMATCH);
  const agent = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, STRANGER);
  assert.equal(agent.code, REASON.NOT_FOUNDER);
  assert.equal(orchestrator.setPaused(true, STRANGER).code, REASON.NOT_FOUNDER);
  assert.equal(orchestrator.state().decisions[0].receipt, null);
});

test("a repeated command the same day returns the existing command", async () => {
  const { orchestrator, commandId } = await recapRun();
  const again = await orchestrator.handleCommand(RECAP_COMMAND, FOUNDER);
  assert.equal(again.duplicate, true);
  assert.equal(again.commandId, commandId);
  assert.equal(orchestrator.state().commands.length, 1);
});

test("manual ChatGPT seat: prompt shown, answer pasted, consolidation waits for it", async () => {
  const { orchestrator } = freshOrchestrator();
  assert.equal(orchestrator.setSeat("prompt-architect", "manual:chatgpt", FOUNDER).ok, true);
  assert.equal(orchestrator.setSeat("prompt-architect", "api:openai", FOUNDER).code, REASON.SEAT_NOT_ENABLED);

  await orchestrator.handleCommand("Team, what should our next product improvement be for the Results page?", FOUNDER);
  let c = orchestrator.state().commands[0];
  const waiting = c.tasks.find((t) => t.status === "AWAITING_INPUT");
  assert.equal(waiting.ownerRole, "prompt-architect");
  assert.match(waiting.prompt, /```json/);
  assert.equal(c.reports.length, 0, "the Chief of Staff must not consolidate while an answer is outstanding");

  const answer = '```json\n{"objective":"One accuracy answer per sport","constraints":["wait for CP3"],"dependencies":["Forecast Ledger"],"tests":["links to graded rows"],"acceptanceCriteria":["season default"]}\n```';
  const r = await orchestrator.submitManual(waiting.taskId, answer, FOUNDER);
  assert.equal(r.contractValid, true);
  c = orchestrator.state().commands[0];
  const pa = c.contributions.find((x) => x.role === "prompt-architect");
  assert.equal(pa.seat, "manual:chatgpt");
  assert.equal(pa.simulated, false);
  assert.equal(c.reports.length, 1);
  assert.ok(c.contributions.findIndex((x) => x.role === "chief-of-staff") > c.contributions.findIndex((x) => x.role === "prompt-architect"));
});

test("replay: two fresh runs with the same clock write byte-identical ledgers", async () => {
  const run = async () => {
    const ctx = await recapRun();
    const d = ctx.s.decisions[0];
    await ctx.orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER);
    return ledgerSnapshot(ctx.dir);
  };
  const a = await run();
  const b = await run();
  assert.ok(Object.keys(a).length > 30);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const k of Object.keys(a)) assert.equal(a[k], b[k], k);
});
