/**
 * PIPELINES AS DATA — a pipeline is an ordered list of steps; the runner walks the list, so changing the order is a
 * data change (withOrder), not a code change. Contrast orchestrator/team-flow.mjs, whose step order is fixed in code.
 *
 * Step kinds
 *   brief     the CEO's objective (root task)
 *   work      an agent produces an artifact (Level B work waits in NEEDS_REVIEW for a later review step)
 *   research  as work, for research agents (Grok + x_search when live)
 *   review    an independent agent (a DIFFERENT provider) reviews `subject`; "changes" hands the findings to the
 *             `fixer` step and re-reviews, at most `maxRounds` rounds, then ESCALATES to the named `decider`
 *   fix       only run by a review loop (remediation)
 *   gate      the deterministic release gate (adapters.gateChecks)
 *   approval  Level C: the founder approves the exact artifact digest; the runner only prepares it and stops
 *
 * Every step becomes a task created by a structured `handoff` from the task before it (artifact digest +
 * instructions), and the receiving agent is notified with a `notify` event. Every append carries an idempotency key
 * derived from the run, so re-running the same run resumes it: nothing is written twice and no finished agent call
 * is repeated.
 */
import { digestOf } from "../lib/util.mjs";
import { latestDigest, OrchestrationError, APPROVAL_LEVELS } from "./task-ledger.mjs";
import { agentKey, checkSpend } from "./budgets.mjs";
import { isLiveAdapter } from "./adapters.mjs";

const AGENTS = Object.freeze({
  ceo: { provider: "founder", seat: "founder", role: "ceo" },
  claude: { provider: "anthropic", seat: "cli:claude-code", role: "engineering" },
  claudeVerifier: { provider: "anthropic", seat: "cli:claude-code", role: "verifier" },
  chatgptReviewer: { provider: "openai", seat: "api:openai", role: "independent-reviewer" },
  grok: { provider: "xai", seat: "api:xai", role: "social-intelligence" },
  gate: { provider: "deterministic", seat: "deterministic", role: "release-gate" },
  visualQa: { provider: "deterministic", seat: "deterministic", role: "visual-qa" },
});

export const PIPELINES = deepFreeze({
  "build-review-release": {
    id: "build-review-release",
    title: "CEO → Claude implement → ChatGPT independent review → Claude remediation → release gate → founder approval",
    parentProject: "gtp-command-center",
    steps: [
      { key: "ceo", kind: "brief", title: "CEO objective", agent: AGENTS.ceo, approvalLevel: "A" },
      {
        key: "implement", kind: "work", title: "Implement", agent: AGENTS.claude, approvalLevel: "B", costBudgetUsd: 1,
        tools: ["Read", "Grep", "Glob", "Edit", "Write"], permissions: ["workcopy.write", "no-push", "no-deploy"],
        requiredInputs: ["ceo brief"], expectedOutputs: ["implementation summary", "changed paths"],
        instructions: "Implement the objective in an isolated working copy. Report a summary and every changed path.",
      },
      {
        key: "review", kind: "review", title: "Independent review", subject: "implement", fixer: "remediate", maxRounds: 2, decider: "founder",
        agent: AGENTS.chatgptReviewer, approvalLevel: "A", costBudgetUsd: 0.5, expectedOutputs: ["verdict approve|changes", "findings"],
        instructions: "Review the implementation independently. Verdict approve or changes; every finding gets an id and a severity.",
      },
      {
        key: "remediate", kind: "fix", title: "Remediate review findings", agent: AGENTS.claude, approvalLevel: "B", costBudgetUsd: 1,
        tools: ["Read", "Grep", "Glob", "Edit", "Write"], permissions: ["workcopy.write", "no-push", "no-deploy"], expectedOutputs: ["addressed finding ids"],
        instructions: "Address every finding from the review; list the finding ids you addressed.",
      },
      { key: "gate", kind: "gate", title: "Release gate", agent: AGENTS.gate, approvalLevel: "A", expectedOutputs: ["gate checks"] },
      { key: "approval", kind: "approval", title: "Founder approval", agent: AGENTS.ceo, approvalLevel: "C", decider: "founder" },
    ],
  },
  "research-verify-visual": {
    id: "research-verify-visual",
    title: "CEO → Grok research → Claude verify → visual QA → founder approval",
    parentProject: "gtp-social",
    steps: [
      { key: "ceo", kind: "brief", title: "CEO objective", agent: AGENTS.ceo, approvalLevel: "A" },
      {
        key: "research", kind: "research", title: "Research public X", agent: AGENTS.grok, approvalLevel: "B", costBudgetUsd: 1,
        tools: ["x_search"], permissions: ["read-public-x", "never-post"], expectedOutputs: ["findings with source URLs"],
        instructions: "Research the objective on public X. Every finding carries its source URL. Never post.",
      },
      {
        key: "verify", kind: "review", title: "Verify research", subject: "research", fixer: null, maxRounds: 1, decider: "founder",
        agent: AGENTS.claudeVerifier, approvalLevel: "A", costBudgetUsd: 1, tools: ["Read", "Grep", "Glob"],
        instructions: "Verify every finding against its source and GameTimePicks' published data. Verdict approve or changes.",
      },
      { key: "visual-qa", kind: "work", title: "Visual QA", agent: AGENTS.visualQa, approvalLevel: "A", tools: ["screens.capture"], expectedOutputs: ["screens", "verdict"] },
      { key: "approval", kind: "approval", title: "Founder approval", agent: AGENTS.ceo, approvalLevel: "C", decider: "founder" },
    ],
  },
});

const KINDS = ["brief", "work", "research", "review", "fix", "gate", "approval"];

/** Throws OrchestrationError unless the pipeline is runnable. */
export function validatePipeline(def) {
  const bad = (d) => { throw new OrchestrationError("INVALID_PIPELINE", `${def?.id ?? "pipeline"}: ${d}`); };
  if (!def?.id || !Array.isArray(def.steps) || !def.steps.length) bad("needs id and steps");
  const keys = new Set();
  for (const s of def.steps) {
    if (!s.key || keys.has(s.key)) bad(`duplicate or missing step key ${s.key}`);
    keys.add(s.key);
    if (!KINDS.includes(s.kind)) bad(`step ${s.key}: unknown kind ${s.kind}`);
    if (!["A", "B", "C"].includes(s.approvalLevel)) bad(`step ${s.key}: approvalLevel A|B|C`);
    if (!s.agent?.provider || !s.agent?.seat || !s.agent?.role) bad(`step ${s.key}: agent {provider, seat, role}`);
  }
  if (def.steps[0].kind !== "brief") bad("the first step is the CEO brief");
  const ordered = def.steps.filter((s) => s.kind !== "fix");
  const idx = (k) => ordered.findIndex((s) => s.key === k);
  for (const s of def.steps) {
    if (s.kind === "review") {
      const subject = def.steps.find((x) => x.key === s.subject);
      if (!subject) bad(`review ${s.key}: unknown subject ${s.subject}`);
      if (idx(s.subject) < 0 || idx(s.subject) > idx(s.key)) bad(`review ${s.key} must come after its subject ${s.subject}`);
      if (subject.agent.provider === s.agent.provider) bad(`review ${s.key} must be run by a different provider than ${s.subject}`);
      if (!(Number.isInteger(s.maxRounds) && s.maxRounds >= 1 && s.maxRounds <= 5)) bad(`review ${s.key}: maxRounds 1–5`);
      if (!s.decider) bad(`review ${s.key}: name the decider for an escalation`);
      if (s.fixer) {
        const f = def.steps.find((x) => x.key === s.fixer);
        if (f?.kind !== "fix") bad(`review ${s.key}: fixer ${s.fixer} must be a fix step`);
        if (f.agent.provider === s.agent.provider) bad(`review ${s.key}: the fixer must not be the reviewer's provider`);
      }
    }
    if (["work", "research"].includes(s.kind) && s.approvalLevel === "B" && !def.steps.some((r) => r.kind === "review" && r.subject === s.key)) bad(`Level B step ${s.key} needs a review step`);
    if (s.kind === "approval" && s.approvalLevel !== "C") bad(`approval step ${s.key} is Level C`);
  }
  if (!def.steps.some((s) => s.kind === "approval")) bad("a pipeline ends in a founder approval step");
  return def;
}

/** The same pipeline with its (non-fix) steps in a new order. */
export function withOrder(def, keys) {
  const byKey = Object.fromEntries(def.steps.map((s) => [s.key, s]));
  const fixes = def.steps.filter((s) => s.kind === "fix");
  if (keys.length !== def.steps.length - fixes.length || keys.some((k) => !byKey[k] || byKey[k].kind === "fix")) {
    throw new OrchestrationError("INVALID_PIPELINE", "withOrder: list every non-fix step exactly once");
  }
  return validatePipeline({ ...def, id: `${def.id}~${keys.join(">")}`, steps: [...keys.map((k) => byKey[k]), ...fixes] });
}

export const ORCHESTRATOR = Object.freeze({ role: "orchestrator", id: "cc-orchestration", surface: "orchestrator" });

/** AGENT: the agent's own output was unusable · TOOL: the provider/tool failed · FOUNDER: only the founder can unblock. */
export function classifyBlocker(code) {
  if (/AUTH|OUT_OF_CREDIT|NOT_CONFIGURED|BUDGET|FOUNDER|REVIEW_LOOP/.test(code)) return "FOUNDER";
  if (/BAD_RESPONSE|INVALID_ARTIFACT|MOCK_LINEAGE|GATE_FAILED/.test(code)) return "AGENT";
  return "TOOL";
}

/**
 * Run (or resume) a pipeline until it finishes, blocks, escalates, or reaches the founder's approval.
 * @param {{ ledger, pipeline: object, objective: string, adapters: Record<string, object>, config: object,
 *   now?: () => string, runKey?: string, sourceDocuments?: string[], deadline?: string|null, isLive?: Function }} o
 */
export async function runPipeline({ ledger, pipeline, objective, adapters, config, now = () => new Date().toISOString(), runKey = "1", sourceDocuments = [], deadline = null, isLive = isLiveAdapter }) {
  const def = validatePipeline(pipeline);
  const runId = `run-${digestOf({ pipeline: def.id, objective, runKey }).slice(0, 12)}`;
  const actor = ORCHESTRATOR;
  const ev = (type, body, key) => ledger.append(type, actor, body, { idempotencyKey: `${runId}:${key}` }).event;
  const taskIdOf = (step, round) => `task-${digestOf({ runId, step: step.key, round: round ?? null }).slice(0, 12)}`;
  const stepByKey = Object.fromEntries(def.steps.map((s) => [s.key, s]));
  const status = (s, detail = null) => ev("run.status", { runId, pipeline: def.id, status: s, detail }, `status:${s}`);
  const transition = (taskId, to, extra = {}, tag = to) => {
    const t = ledger.task(taskId);
    if (t.state === to) return;
    ev("task.transition", { taskId, to, ...extra }, `${taskId}:${tag}`);
  };
  const block = (taskId, code, detail, cls = classifyBlocker(code)) => transition(taskId, "BLOCKED", { blocker: { class: cls, code, detail } }, `blocked:${code}`);

  const spec = (step, round = null) => ({
    taskId: taskIdOf(step, round), parentProject: def.parentProject, runId, stepKey: step.key, round,
    objective: `${step.title}: ${objective}`, assignedAgent: step.agent, sourceDocuments,
    tools: step.tools ?? [], permissions: step.permissions ?? [], requiredInputs: step.requiredInputs ?? [], expectedOutputs: step.expectedOutputs ?? [],
    deadline, costBudget: { usd: step.costBudgetUsd ?? 0, hardStop: true },
    approvalLevel: step.approvalLevel, approvalRequirement: step.approvalRequirement ?? APPROVAL_LEVELS[step.approvalLevel],
  });

  function handoff(fromTaskId, step, round, instructions, context = []) {
    const from = ledger.task(fromTaskId);
    const child = spec(step, round);
    ev("handoff", { handoffId: `ho-${child.taskId.slice(5)}`, fromTaskId, child, artifactDigest: latestDigest(from), context, instructions }, `handoff:${child.taskId}`);
    ev("notify", { to: agentKey(step.agent), taskId: child.taskId, reason: "handoff" }, `notify:${child.taskId}`);
    return child.taskId;
  }

  /** Run the task's agent once (with the retry budget). Returns the recorded output, or null if the task blocked. */
  async function execute(taskId, step) {
    let t = ledger.task(taskId);
    if (t.outputs.length) return t.outputs.at(-1); // resumed: never call the agent twice
    if (t.state === "BLOCKED" || t.state === "FAILED") return null;
    if (t.state === "PLANNED") transition(taskId, "IN_PROGRESS");
    const adapter = adapters[step.agent.provider];
    if (!adapter) { block(taskId, "NO_ADAPTER", `no adapter for ${step.agent.provider}`); return null; }
    for (;;) {
      t = ledger.task(taskId);
      const st = ledger.state();
      const inputs = t.inputs.map((d) => ({ digest: d, artifact: st.outputsByDigest[d].artifact, provider: st.outputsByDigest[d].provider, mode: st.outputsByDigest[d].mode }));
      if (isLive(adapter) && inputs.some((i) => i.mode !== "LIVE")) {
        block(taskId, "MOCK_LINEAGE", "a live agent is never called on MOCK inputs (it would spend money on placeholder work)");
        return null;
      }
      const handoffNote = st.handoffs.find((h) => h.toTaskId === taskId)?.instructions;
      const req = { task: t, step, objective, pipeline: def.id, round: t.round, inputs, instructions: [step.instructions, handoffNote].filter(Boolean).join("\n\n") || step.title, state: st };
      const chk = checkSpend(st, { task: t, worstCaseUsd: adapter.worstCase(req), now: now(), config });
      if (!chk.ok) {
        ev("budget.refused", { taskId, code: chk.code, scope: chk.scope, detail: chk.detail }, `${taskId}:refused:${t.attempts}`);
        block(taskId, chk.code, chk.detail, chk.blockerClass);
        return null;
      }
      let result;
      try {
        result = await adapter.run(req);
        if (step.kind === "review" && !["approve", "changes"].includes(result?.artifact?.verdict)) {
          throw Object.assign(new Error("INVALID_ARTIFACT: a review must return verdict approve | changes"), { code: "INVALID_ARTIFACT", retryable: false });
        }
      } catch (err) {
        const code = err.code ?? "PROVIDER_ERROR";
        ev("task.attempt", { taskId, provider: step.agent.provider, ok: false, code, retryable: Boolean(err.retryable) }, `${taskId}:attempt:${t.attempts + 1}`);
        if (!err.retryable) { block(taskId, code, String(err.detail ?? err.message).slice(0, 300)); return null; }
        continue; // checkSpend enforces the retry budget and the breaker on the next pass
      }
      const live = isLive(adapter);
      ev("task.attempt", { taskId, provider: step.agent.provider, ok: true, code: null, retryable: false }, `${taskId}:attempt:${t.attempts + 1}`);
      ev("task.cost", { taskId, provider: step.agent.provider, agent: agentKey(step.agent), usd: live ? Number(result.usage?.usd ?? 0) : 0, estimated: Boolean(result.usage?.estimated), mode: live ? "LIVE" : "MOCK" }, `${taskId}:cost`);
      const { event } = ledger.recordOutput(taskId, actor, { adapter, isLive: live, result }, { idempotencyKey: `${runId}:${taskId}:output` });
      const out = event.body.output;
      ev("task.evidence", { taskId, name: `${step.key}${t.round ? `-r${t.round}` : ""}.json`, sha256: out.artifactDigest, kind: "output" }, `${taskId}:evidence`);
      return ledger.task(taskId).outputs.at(-1);
    }
  }

  const finish = (taskId, outcome) => transition(taskId, "DONE", { outcome });

  status("STARTED");
  // 1. the CEO brief
  const brief = def.steps[0];
  const rootId = taskIdOf(brief, null);
  ev("task.created", { task: spec(brief) }, `create:${rootId}`);
  if (!(await execute(rootId, brief))) return result("BLOCKED");
  finish(rootId, { result: "DONE", summary: "objective recorded" });
  let current = rootId;
  let context = []; // extra artifacts the next handoff carries (the approving review's verdict)

  for (const step of def.steps.slice(1)) {
    if (step.kind === "fix") continue;
    if (step.kind === "review") {
      const r = await reviewLoop(step, current);
      if (r.stop) return result(r.stop, r.detail);
      current = r.holder;
      context = r.context;
      continue;
    }
    if (step.kind === "approval") {
      const id = handoff(current, step, null, `Founder: approve or reject artifact ${latestDigest(ledger.task(current)).slice(0, 12)} for release. Level C — only you can approve.`, context);
      transition(id, "IN_PROGRESS");
      transition(id, "READY_FOR_APPROVAL");
      ev("notify", { to: step.decider, taskId: id, reason: "approval-required" }, `notify:approval:${id}`);
      return result("AWAITING_FOUNDER_APPROVAL", id);
    }
    const id = handoff(current, step, null, step.instructions ?? step.title, context);
    context = [];
    const out = await execute(id, step);
    if (!out) return result("BLOCKED", id);
    if (step.kind === "gate" && !out.artifact.pass) { block(id, "GATE_FAILED", out.artifact.summary); return result("BLOCKED", id); }
    if (step.approvalLevel === "A") finish(id, { result: "DONE", artifactDigest: out.artifactDigest });
    else transition(id, "NEEDS_REVIEW");
    current = id;
  }
  return result("COMPLETED");

  async function reviewLoop(step, current) {
    let holder = current;
    const chain = [current];
    for (let round = 1; round <= step.maxRounds; round++) {
      const reviewId = handoff(holder, step, round, `${step.instructions ?? "Review"} (round ${round} of ${step.maxRounds})`);
      const out = await execute(reviewId, step);
      if (!out) return { stop: "BLOCKED", detail: reviewId };
      const verdict = out.artifact.verdict;
      ev("review.verdict", { reviewTaskId: reviewId, subjectTaskId: holder, round, verdict, findings: out.artifact.findings ?? [] }, `verdict:${reviewId}`);
      finish(reviewId, { result: "DONE", verdict });
      if (verdict === "approve") {
        const reviewer = ledger.task(reviewId).assignedAgent;
        for (const id of chain) {
          const t = ledger.task(id);
          if (t.state === "NEEDS_REVIEW") {
            ledger.append("approval.granted", { role: "agent", id: agentKey(reviewer), surface: "agent" }, { taskId: id, artifactDigest: latestDigest(t), basis: { reviewTaskId: reviewId, subjectTaskId: holder } }, { idempotencyKey: `${runId}:approve:${id}` });
          }
          if (ledger.task(id).state === "APPROVED") finish(id, { result: "DONE", approvedBy: reviewId, finalRevision: holder });
        }
        return { holder, context: [out.artifactDigest] };
      }
      const fixer = step.fixer ? stepByKey[step.fixer] : null;
      if (!fixer || round === step.maxRounds) {
        const reason = fixer ? `changes still requested after ${round} review rounds` : "the verifier requested changes and this pipeline has no remediation step";
        ev("review.escalated", { subjectTaskId: holder, reviewTaskId: reviewId, rounds: round, decider: step.decider, reason }, `escalate:${holder}`);
        block(holder, "REVIEW_LOOP_EXHAUSTED", `${reason}; decider: ${step.decider}`);
        ev("notify", { to: step.decider, taskId: holder, reason: "escalated" }, `notify:escalated:${holder}`);
        return { stop: "ESCALATED", detail: holder };
      }
      const fixId = handoff(reviewId, fixer, round, `${fixer.instructions}\nFindings: ${(out.artifact.findings ?? []).map((f) => f.id).join(", ") || "(none listed)"}`, [latestDigest(ledger.task(holder))]);
      const fixOut = await execute(fixId, fixer);
      if (!fixOut) return { stop: "BLOCKED", detail: fixId };
      transition(fixId, "NEEDS_REVIEW");
      chain.push(fixId);
      holder = fixId;
    }
    return { stop: "ESCALATED", detail: holder };
  }

  function result(s, detail = null) {
    status(s, detail);
    return { runId, status: s, detail, rootTaskId: rootId, state: ledger.state() };
  }
}

/**
 * The founder approves a Level C task (or an approver a Level B task). `actor` must come from an authenticated
 * surface (the hosted console builds it from the passkey session); the ledger re-checks every rule.
 */
export function approve(ledger, taskId, actor, { artifactDigest, autoApprove = false }) {
  const { event } = ledger.append("approval.granted", actor, { taskId, artifactDigest, ...(autoApprove ? { autoApprove: true } : {}) }, { idempotencyKey: `approve:${taskId}` });
  ledger.append("task.transition", actor, { taskId, to: "DONE", outcome: { result: "DONE", approvedBy: actor.id } }, { idempotencyKey: `approve-done:${taskId}` });
  return event;
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
