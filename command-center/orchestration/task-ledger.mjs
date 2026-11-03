/**
 * DURABLE TASK LEDGER — the multi-agent task state, kept as an append-only, hash-chained event stream on the
 * existing LedgerStore (ledger/store.mjs: append / claim / readClaim / list).
 *
 * Where the events live
 *   Every event takes the create-only claim `cc-orch/v1/<ledgerId>/seq/<n>`. A claim has exactly one winner, so the
 *   claim IS the optimistic-concurrency check: two writers that both saw head n race for slot n+1 and one loses with
 *   ConcurrencyConflict (the file store links a complete temp file; the Postgres store rolls the flush back with
 *   ClaimConflictError). Idempotency keys take a second claim `cc-orch/v1/<ledgerId>/idem/<key>` → {seq}.
 *   When contracts/index.mjs lists the ledger kind "task-event" (one-line change, see README.md), every event is
 *   ALSO appended as a `task-event` ledger entry so the console's ledger views and ledger sync carry it. Until then
 *   the claim chain is the only copy; it is the authoritative copy either way.
 *
 * State is never stored, only derived: replay(events) folds the stream with the same validation append() runs, so
 * a replay is byte-identical on any machine (canonical JSON, injected clock) and a hand-written event that breaks
 * a rule makes replay throw instead of silently producing a different state.
 *
 * Each event carries `prev` (the digest of the event before it) and its own `digest`, so an edited or reordered
 * record is detectable.
 */
import { canonicalJson, digestOf } from "../lib/util.mjs";
import { LEDGER_KINDS } from "../contracts/index.mjs";

export const STATES = Object.freeze([
  "PLANNED", "IN_PROGRESS", "NEEDS_REVIEW", "BLOCKED", "READY_FOR_APPROVAL", "APPROVED", "DONE", "FAILED", "CANCELLED", "SUPERSEDED",
]);
/** SUPERSEDED: replaced by a newer task (a fix, or a duplicate's original); `outcome.supersededBy` names it. */
export const TERMINAL = Object.freeze(["DONE", "FAILED", "CANCELLED", "SUPERSEDED"]);

/**
 * Allowed `task.transition` moves. APPROVED is deliberately absent as a target: a task reaches APPROVED only through
 * an `approval.granted` event, which carries the approval-level checks below.
 */
export const TRANSITIONS = Object.freeze({
  PLANNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "SUPERSEDED"],
  IN_PROGRESS: ["NEEDS_REVIEW", "READY_FOR_APPROVAL", "BLOCKED", "DONE", "FAILED", "CANCELLED"],
  NEEDS_REVIEW: ["IN_PROGRESS", "READY_FOR_APPROVAL", "BLOCKED", "FAILED", "CANCELLED", "SUPERSEDED"],
  BLOCKED: ["PLANNED", "IN_PROGRESS", "NEEDS_REVIEW", "FAILED", "CANCELLED", "SUPERSEDED"],
  READY_FOR_APPROVAL: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "SUPERSEDED"],
  APPROVED: ["DONE", "CANCELLED"],
  DONE: [], FAILED: [], CANCELLED: [], SUPERSEDED: [],
});

/**
 *   A  routine and reversible: the orchestrator may approve it (or finish it without approval).
 *   B  needs an independent approval: a human approver, or an approve verdict from a review task run by a DIFFERENT
 *      provider than the work it reviews.
 *   C  founder only: an authenticated founder approving the exact artifact digest. Never automatic, never an agent,
 *      never the orchestrator, and never anything whose lineage contains a MOCK output.
 */
export const APPROVAL_LEVELS = Object.freeze({
  A: "routine — orchestrator may approve",
  B: "independent approval — human approver or a different-provider reviewer's approve verdict",
  C: "founder only — authenticated founder approves the exact artifact digest; never automatic",
});
export const BLOCKER_CLASSES = Object.freeze(["AGENT", "TOOL", "FOUNDER"]);
export const MODES = Object.freeze(["LIVE", "MOCK"]);
/** Actors that act on their own; none of them can ever grant a Level C approval. */
export const AUTOMATIC_ROLES = Object.freeze(["orchestrator", "agent", "system", "pipeline", "demo"]);

export const EVENT_TYPES = Object.freeze([
  "task.created", "task.transition", "task.output", "task.evidence", "task.cost", "task.attempt",
  "handoff", "notify", "review.verdict", "review.escalated", "approval.granted", "budget.refused", "run.status",
  "task.claimed",
]);

const HEX64 = /^[0-9a-f]{64}$/;
const KEY = "cc-orch/v1";

export class OrchestrationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}
export class ConcurrencyConflict extends OrchestrationError {
  constructor(detail) {
    super("CONCURRENCY_CONFLICT", detail);
  }
}
const fail = (code, detail) => { throw new OrchestrationError(code, detail); };

/** Only recordOutput() (in this module) may append task.output: the mode is computed there, never passed in. */
const INTERNAL = Symbol("task-ledger-internal");

// ───────────────────────────────────────────── replay ─────────────────────────────────────────────

export function emptyState() {
  return {
    seq: 0, headDigest: null,
    tasks: {}, taskOrder: [], handoffs: [], notifications: [], verdicts: [], escalations: [], approvals: [],
    refusals: [], attempts: [], costs: [], runs: {}, outputsByDigest: {},
  };
}

const REQUIRED_TASK_FIELDS = ["taskId", "parentProject", "objective", "assignedAgent", "approvalLevel", "approvalRequirement", "costBudget"];

function newTask(spec, ev) {
  for (const f of REQUIRED_TASK_FIELDS) if (spec[f] == null) fail("INVALID_TASK", `task field ${f} is required`);
  const a = spec.assignedAgent;
  if (!a.provider || !a.seat || !a.role) fail("INVALID_TASK", "assignedAgent needs provider, seat and role");
  if (!["A", "B", "C"].includes(spec.approvalLevel)) fail("INVALID_TASK", `approvalLevel must be A, B or C (got ${spec.approvalLevel})`);
  if (!(Number(spec.costBudget.usd) >= 0) || typeof spec.costBudget.hardStop !== "boolean") fail("INVALID_TASK", "costBudget needs usd ≥ 0 and hardStop boolean");
  return {
    taskId: spec.taskId,
    parentProject: spec.parentProject,
    parentTaskId: spec.parentTaskId ?? null,
    runId: spec.runId ?? null,
    stepKey: spec.stepKey ?? null,
    round: spec.round ?? null,
    objective: spec.objective,
    assignedAgent: { provider: a.provider, seat: a.seat, role: a.role },
    sourceDocuments: spec.sourceDocuments ?? [],
    tools: spec.tools ?? [],
    permissions: spec.permissions ?? [],
    requiredInputs: spec.requiredInputs ?? [],
    expectedOutputs: spec.expectedOutputs ?? [],
    deadline: spec.deadline ?? null,
    costBudget: { usd: Number(spec.costBudget.usd), hardStop: spec.costBudget.hardStop },
    approvalLevel: spec.approvalLevel,
    approvalRequirement: spec.approvalRequirement,
    // V3 handoff fields (optional; the pipeline runner leaves them empty).
    priority: spec.priority ?? null,
    dependencies: spec.dependencies ?? [],
    acceptanceCriteria: spec.acceptanceCriteria ?? [],
    brief: spec.brief ?? null,
    fingerprint: spec.fingerprint ?? null,
    depth: spec.depth ?? 0,
    rootTaskId: spec.rootTaskId ?? null,
    route: spec.route ?? null,
    subjectTaskId: spec.subjectTaskId ?? null,
    meta: spec.meta ?? null,
    claim: null,
    state: "PLANNED",
    inputs: spec.inputs ?? [],
    outputs: [],
    evidence: [],
    costUsd: 0,
    attempts: 0,
    blocker: null,
    escalation: null,
    approvals: [],
    outcome: null,
    createdAt: ev.at,
    updatedAt: ev.at,
    history: [{ seq: ev.seq, state: "PLANNED", at: ev.at }],
  };
}

function setState(task, to, ev) {
  task.state = to;
  task.updatedAt = ev.at;
  task.history.push({ seq: ev.seq, state: to, at: ev.at });
}

/** The latest output digest of a task (what a handoff or an approval refers to). */
export const latestDigest = (task) => task.outputs.at(-1)?.artifactDigest ?? null;

/** Apply one event to `s` in place, validating it. Throws OrchestrationError on any rule break. */
export function applyEvent(s, ev) {
  if (ev.seq !== s.seq + 1) fail("BAD_SEQUENCE", `event seq ${ev.seq} after ${s.seq}`);
  if (ev.prev !== s.headDigest) fail("BROKEN_CHAIN", `event ${ev.seq} prev does not match the head digest`);
  const { digest, ...unsigned } = ev;
  if (digest !== digestOf(unsigned)) fail("BROKEN_CHAIN", `event ${ev.seq} digest does not match its content`);
  if (!EVENT_TYPES.includes(ev.type)) fail("UNKNOWN_EVENT", `unknown event type ${ev.type}`);
  if (!ev.actor?.role || !ev.actor?.id) fail("INVALID_ACTOR", "every event names an actor {role, id}");
  const b = ev.body ?? {};
  const task = (id) => s.tasks[id] ?? fail("UNKNOWN_TASK", `no task ${id}`);

  switch (ev.type) {
    case "task.created": {
      if (s.tasks[b.task?.taskId]) fail("DUPLICATE_TASK", `task ${b.task.taskId} exists`);
      if (b.task?.parentTaskId) task(b.task.parentTaskId);
      addTask(s, newTask(b.task ?? {}, ev));
      break;
    }
    case "handoff": {
      const from = task(b.fromTaskId);
      if (!b.child) fail("INVALID_HANDOFF", "a handoff creates its child task");
      if (s.tasks[b.child.taskId]) fail("DUPLICATE_TASK", `task ${b.child.taskId} exists`);
      if (!HEX64.test(b.artifactDigest ?? "")) fail("INVALID_HANDOFF", "artifactDigest must be a sha256");
      if (!from.outputs.some((o) => o.artifactDigest === b.artifactDigest)) fail("INVALID_HANDOFF", `task ${from.taskId} produced no artifact ${b.artifactDigest.slice(0, 12)}`);
      for (const d of b.context ?? []) if (!s.outputsByDigest[d]) fail("INVALID_HANDOFF", `context artifact ${String(d).slice(0, 12)} is unknown`);
      if (!b.instructions) fail("INVALID_HANDOFF", "a handoff carries instructions");
      const child = newTask({ ...b.child, parentTaskId: from.taskId, inputs: [b.artifactDigest, ...(b.context ?? [])] }, ev);
      addTask(s, child);
      s.handoffs.push({
        seq: ev.seq, at: ev.at, handoffId: b.handoffId, fromTaskId: from.taskId, toTaskId: child.taskId,
        from: from.assignedAgent, to: child.assignedAgent, artifactDigest: b.artifactDigest, context: b.context ?? [], instructions: b.instructions,
      });
      break;
    }
    case "notify": {
      task(b.taskId);
      if (!b.to) fail("INVALID_NOTIFY", "notify names a recipient");
      s.notifications.push({ seq: ev.seq, at: ev.at, to: b.to, taskId: b.taskId, reason: b.reason ?? null });
      break;
    }
    case "task.transition": {
      const t = task(b.taskId);
      const to = b.to;
      if (!STATES.includes(to)) fail("INVALID_STATE", `unknown state ${to}`);
      if (to === "APPROVED") fail("APPROVAL_REQUIRED", "APPROVED is reached only through approval.granted");
      if (!TRANSITIONS[t.state].includes(to)) fail("INVALID_TRANSITION", `${t.taskId}: ${t.state} → ${to} is not allowed`);
      if (to === "DONE" && t.approvalLevel !== "A" && t.state !== "APPROVED") fail("APPROVAL_REQUIRED", `${t.taskId} is Level ${t.approvalLevel}: it must be APPROVED before DONE`);
      if (to === "BLOCKED") {
        if (!BLOCKER_CLASSES.includes(b.blocker?.class)) fail("INVALID_BLOCKER", "BLOCKED needs blocker.class AGENT | TOOL | FOUNDER");
        t.blocker = { class: b.blocker.class, code: b.blocker.code ?? null, detail: b.blocker.detail ?? "", at: ev.at };
      } else if (t.state === "BLOCKED") {
        t.blocker = null;
      }
      if (to === "SUPERSEDED" && !s.tasks[b.outcome?.supersededBy]) fail("INVALID_SUPERSEDE", "SUPERSEDED names the task that replaces it (outcome.supersededBy)");
      if (TERMINAL.includes(to)) t.outcome = b.outcome ?? { result: to };
      setState(t, to, ev);
      break;
    }
    case "task.output": {
      const t = task(b.taskId);
      if (t.state !== "IN_PROGRESS") fail("NOT_IN_PROGRESS", `${t.taskId} is ${t.state}; outputs are recorded while IN_PROGRESS`);
      const o = b.output ?? {};
      if (!MODES.includes(o.mode)) fail("MODE_REQUIRED", "every output records mode LIVE or MOCK");
      if (!o.provider || !("model" in o) || !o.cost) fail("ATTRIBUTION_REQUIRED", "every output records provider, model and cost");
      if (o.artifactDigest !== digestOf(o.artifact)) fail("DIGEST_MISMATCH", "artifactDigest is not the sha256 of the artifact");
      if (o.mode === "MOCK" && o.cost.usd !== 0) fail("MOCK_COST", "a MOCK output costs $0");
      if (o.mode === "LIVE") {
        if (/^mock/i.test(String(o.model))) fail("MOCK_LABEL_REQUIRED", "a mock model's output is MOCK");
        for (const d of t.inputs) if (s.outputsByDigest[d]?.mode !== "LIVE") fail("MOCK_LINEAGE", `${t.taskId}: an output built on a MOCK input is MOCK`);
      }
      const rec = { ...o, seq: ev.seq, at: ev.at, taskId: t.taskId, lineage: [...t.inputs] };
      t.outputs.push(rec);
      t.updatedAt = ev.at;
      s.outputsByDigest[o.artifactDigest] ??= rec;
      break;
    }
    case "task.evidence": {
      const t = task(b.taskId);
      if (!HEX64.test(b.sha256 ?? "")) fail("INVALID_EVIDENCE", "evidence needs a sha256");
      t.evidence.push({ name: b.name, sha256: b.sha256, kind: b.kind ?? "artifact", at: ev.at });
      break;
    }
    case "task.cost": {
      const t = task(b.taskId);
      if (!(b.usd >= 0)) fail("INVALID_COST", "usd ≥ 0");
      if (!MODES.includes(b.mode)) fail("MODE_REQUIRED", "cost records mode");
      if (b.mode === "MOCK" && b.usd !== 0) fail("MOCK_COST", "a MOCK call costs $0");
      t.costUsd = round6(t.costUsd + b.usd);
      s.costs.push({ seq: ev.seq, at: ev.at, taskId: t.taskId, provider: b.provider, agent: b.agent, usd: b.usd, estimated: Boolean(b.estimated), mode: b.mode });
      break;
    }
    case "task.attempt": {
      const t = task(b.taskId);
      t.attempts += 1;
      s.attempts.push({ seq: ev.seq, at: ev.at, taskId: t.taskId, provider: b.provider, ok: Boolean(b.ok), code: b.code ?? null, retryable: Boolean(b.retryable) });
      break;
    }
    case "review.verdict": {
      const r = task(b.reviewTaskId);
      const subj = task(b.subjectTaskId);
      if (!["approve", "changes"].includes(b.verdict)) fail("INVALID_VERDICT", "verdict is approve | changes");
      if (r.assignedAgent.provider === subj.assignedAgent.provider) fail("NOT_INDEPENDENT", "a review must be run by a different provider than the work it reviews");
      s.verdicts.push({ seq: ev.seq, at: ev.at, reviewTaskId: r.taskId, subjectTaskId: subj.taskId, round: b.round, verdict: b.verdict, findings: b.findings ?? [], reviewer: r.assignedAgent, mode: r.outputs.at(-1)?.mode ?? null });
      break;
    }
    case "review.escalated": {
      const subj = task(b.subjectTaskId);
      if (!b.decider) fail("INVALID_ESCALATION", "an escalation names its decider");
      subj.escalation = { status: "ESCALATED", decider: b.decider, rounds: b.rounds, reason: b.reason ?? null, at: ev.at };
      s.escalations.push({ seq: ev.seq, at: ev.at, subjectTaskId: subj.taskId, decider: b.decider, rounds: b.rounds, reason: b.reason ?? null });
      break;
    }
    case "approval.granted": {
      const t = task(b.taskId);
      checkApproval(s, t, ev.actor, b);
      t.approvals.push({ seq: ev.seq, at: ev.at, level: t.approvalLevel, approver: ev.actor, artifactDigest: b.artifactDigest, basis: b.basis ?? null });
      s.approvals.push({ seq: ev.seq, at: ev.at, taskId: t.taskId, level: t.approvalLevel, approver: ev.actor, artifactDigest: b.artifactDigest });
      setState(t, "APPROVED", ev);
      break;
    }
    case "budget.refused": {
      task(b.taskId);
      s.refusals.push({ seq: ev.seq, at: ev.at, taskId: b.taskId, code: b.code, scope: b.scope, detail: b.detail });
      break;
    }
    case "task.claimed": {
      // A queue worker takes a PLANNED task. A live lease blocks every other worker; an expired one can be taken over.
      const t = task(b.taskId);
      if (t.state !== "PLANNED") fail("NOT_CLAIMABLE", `${t.taskId} is ${t.state}`);
      if (!b.worker?.id || !b.leaseUntil) fail("INVALID_CLAIM", "a claim names worker.id and leaseUntil");
      if (t.claim && t.claim.leaseUntil > ev.at && t.claim.worker.id !== b.worker.id) fail("ALREADY_CLAIMED", `${t.taskId} is leased to ${t.claim.worker.id} until ${t.claim.leaseUntil}`);
      t.claim = { worker: { id: b.worker.id, kind: b.worker.kind ?? null }, leaseUntil: b.leaseUntil, at: ev.at };
      t.updatedAt = ev.at;
      break;
    }
    case "run.status": {
      s.runs[b.runId] = { ...(s.runs[b.runId] ?? {}), runId: b.runId, pipeline: b.pipeline ?? s.runs[b.runId]?.pipeline, status: b.status, detail: b.detail ?? null, at: ev.at };
      break;
    }
    default:
      fail("UNKNOWN_EVENT", ev.type);
  }
  s.seq = ev.seq;
  s.headDigest = ev.digest;
  return s;
}

function addTask(s, t) {
  s.tasks[t.taskId] = t;
  s.taskOrder.push(t.taskId);
}

/** Every artifact digest `digest` was built from, transitively (inclusive). */
export function lineageOf(s, digest, seen = new Set()) {
  if (seen.has(digest)) return seen;
  seen.add(digest);
  for (const d of s.outputsByDigest[digest]?.lineage ?? []) lineageOf(s, d, seen);
  return seen;
}

function checkApproval(s, t, actor, b) {
  if (!["READY_FOR_APPROVAL", "NEEDS_REVIEW"].includes(t.state)) fail("NOT_AWAITING_APPROVAL", `${t.taskId} is ${t.state}`);
  if (b.autoApprove) {
    if (t.approvalLevel !== "A") fail("AUTO_APPROVE_FORBIDDEN", `Level ${t.approvalLevel} is never approved automatically`);
  }
  const digest = b.artifactDigest;
  const known = new Set([...t.inputs, ...t.outputs.map((o) => o.artifactDigest)]);
  if (!known.has(digest)) fail("DIGEST_MISMATCH", `${t.taskId}: approval must name an artifact digest this task holds`);
  if (t.approvalLevel === "A") return;
  if (t.approvalLevel === "B") {
    if (["founder", "approver"].includes(actor.role) && actor.authenticated === true) return;
    const v = b.basis?.reviewTaskId ? s.verdicts.filter((x) => x.reviewTaskId === b.basis.reviewTaskId).at(-1) : null;
    // The verdict must approve this task or a later revision of it (a descendant through handoffs).
    if (v?.verdict === "approve" && v.reviewer.provider !== t.assignedAgent.provider && isSelfOrDescendant(s, v.subjectTaskId, t.taskId)) return;
    fail("APPROVAL_FORBIDDEN", `Level B needs an authenticated approver or an independent reviewer's approve verdict`);
  }
  // Level C
  if (actor.role !== "founder" || actor.authenticated !== true || AUTOMATIC_ROLES.includes(actor.surface)) {
    fail("FOUNDER_ONLY", `${t.taskId} is Level C: only the authenticated founder can approve it (actor: ${actor.role}/${actor.id})`);
  }
  if (b.basis?.reviewTaskId) fail("FOUNDER_ONLY", "a reviewer's verdict cannot stand in for a Level C approval");
  for (const d of lineageOf(s, digest)) {
    if (s.outputsByDigest[d]?.mode === "MOCK") fail("MOCK_NOT_APPROVABLE", `artifact ${digest.slice(0, 12)} is built on MOCK output ${d.slice(0, 12)}; MOCK work can never be approved for release`);
  }
}

function isSelfOrDescendant(s, taskId, ancestorId) {
  for (let id = taskId; id; id = s.tasks[id]?.parentTaskId) if (id === ancestorId) return true;
  return false;
}

const round6 = (n) => Number(n.toFixed(6));

/** Fold a whole event list. Pure and deterministic. */
export function replay(events) {
  const s = emptyState();
  for (const ev of events) applyEvent(s, ev);
  return s;
}

// ───────────────────────────────────────────── the ledger ─────────────────────────────────────────────

/**
 * @param {{ store: {claim:Function, readClaim:Function, append?:Function}, clock: () => string, ledgerId?: string }} o
 */
export function createTaskLedger({ store, clock, ledgerId = "default" }) {
  if (!/^[a-z0-9-]{1,64}$/.test(ledgerId)) throw new Error("ledgerId: lowercase letters, digits and dashes");
  const seqKey = (n) => `${KEY}/${ledgerId}/seq/${n}`;
  const idemKey = (k) => `${KEY}/${ledgerId}/idem/${k}`;
  const mirror = LEDGER_KINDS.includes("task-event") && typeof store.append === "function";
  const cache = [];
  let state = emptyState();

  /** Read new events from the claim chain and fold them in. */
  function sync() {
    for (;;) {
      const rec = store.readClaim(seqKey(cache.length + 1));
      if (!rec) break;
      const ev = rec.value;
      applyEvent(state, ev);
      cache.push(deepFreeze(structuredClone(ev)));
    }
    return state;
  }

  function events() {
    sync();
    return cache.slice();
  }

  /** Lookup an idempotency key: the claim first, then the events themselves (a crash between the two claims). */
  function findIdempotent(key) {
    const c = store.readClaim(idemKey(key));
    if (c) return cache[c.value.seq - 1] ?? null;
    return cache.find((e) => e.idempotencyKey === key) ?? null;
  }

  /**
   * Append one event.
   *   expectedSeq     the head the caller decided on; anything else → ConcurrencyConflict (no write)
   *   idempotencyKey  a retry with the same key returns the first event instead of writing again; the same key with
   *                   different content is refused (IDEMPOTENCY_MISMATCH)
   */
  function append(type, actor, body, opts = {}) {
    if ((type === "task.output") && opts[INTERNAL] !== true) fail("OUTPUT_VIA_RECORD_OUTPUT", "outputs are recorded with recordOutput(), which sets the mode from the adapter");
    sync();
    const key = opts.idempotencyKey ?? null;
    if (key) {
      const prior = findIdempotent(key);
      if (prior) {
        if (prior.type !== type || digestOf(prior.body) !== digestOf(body)) fail("IDEMPOTENCY_MISMATCH", `key ${key} was used for a different event`);
        return { event: prior, replayed: true };
      }
    }
    if (opts.expectedSeq !== undefined && opts.expectedSeq !== state.seq) {
      throw new ConcurrencyConflict(`expected head ${opts.expectedSeq}, ledger is at ${state.seq}`);
    }
    const unsigned = { ledgerId, seq: state.seq + 1, prev: state.headDigest, type, actor: { ...actor }, at: clock(), body, idempotencyKey: key };
    const ev = { ...unsigned, digest: digestOf(unsigned) };
    // Validate against a scratch copy first: a refused event leaves no trace.
    applyEvent(structuredClone(state), JSON.parse(canonicalJson(ev)));
    const won = store.claim(seqKey(ev.seq), JSON.parse(canonicalJson(ev)));
    if (!won.won) {
      sync();
      if (key) {
        const prior = findIdempotent(key);
        if (prior && prior.type === type && digestOf(prior.body) === digestOf(body)) return { event: prior, replayed: true };
      }
      throw new ConcurrencyConflict(`slot ${ev.seq} was taken by another writer`);
    }
    if (key) store.claim(idemKey(key), { seq: ev.seq });
    if (mirror) store.append("task-event", actor.id, { ledgerId, seq: ev.seq, type, digest: ev.digest });
    sync();
    return { event: cache[ev.seq - 1], replayed: false };
  }

  /**
   * Record an adapter's output for a task. The mode is decided HERE from the adapter (isLiveAdapter) and the task's
   * input lineage — a caller cannot pass one in, and an artifact that claims to be live changes nothing.
   */
  function recordOutput(taskId, actor, { adapter, isLive, result }, opts = {}) {
    sync();
    const t = state.tasks[taskId] ?? fail("UNKNOWN_TASK", taskId);
    const lineageLive = t.inputs.every((d) => state.outputsByDigest[d]?.mode === "LIVE");
    const mode = isLive && lineageLive ? "LIVE" : "MOCK";
    const artifact = result.artifact;
    const output = {
      mode, label: mode, provider: adapter.provider, model: adapter.model ?? null,
      seat: t.assignedAgent.seat, role: t.assignedAgent.role,
      cost: { usd: mode === "MOCK" ? 0 : round6(Number(result.usage?.usd ?? 0)), estimated: Boolean(result.usage?.estimated), tokensIn: result.usage?.tokensIn ?? null, tokensOut: result.usage?.tokensOut ?? null },
      citations: result.citations ?? [],
      artifact, artifactDigest: digestOf(artifact),
    };
    return append("task.output", actor, { taskId, output }, { ...opts, [INTERNAL]: true });
  }

  return {
    ledgerId,
    append,
    recordOutput,
    events,
    /** A frozen copy of the derived state (callers can't change the ledger's view). */
    state: () => deepFreeze(structuredClone(sync())),
    task: (id) => (sync().tasks[id] ? deepFreeze(structuredClone(state.tasks[id])) : null),
    head: () => sync().seq,
  };
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
