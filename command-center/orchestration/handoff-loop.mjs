/**
 * HANDOFF LOOP (Command Center V3) — agents pass finished work and the next steps to each other through the task
 * ledger, without the founder copying anything between sessions.
 *
 *   CEO request ─► planner (ChatGPT) ─► assignment briefs ─► workers (Claude queue / Claude API / Grok API)
 *        ▲                                                         │ completion report (a CLAIM)
 *        │                                                         ▼
 *   founder decision ◄─ CLOSE ── evaluator (ChatGPT; Claude when ChatGPT made the work) ◄── claim verifier
 *                                     │ FOLLOW_UP: new briefs, routed again        (our code, not a model)
 *                                     └ ESCALATE: founder decides
 *
 * Every arrow is a ledger event (handoff / notify / task.output / review.verdict …) on the hash-chained task
 * ledger, so the loop resumes after a crash, never runs a step twice (idempotency keys), and leaves a full audit.
 *
 * What makes it safe to run without the founder in the loop
 *   • A report is a claim. A task is COMPLETED only after the claim verifier ran AND an independent evaluator (a
 *     different provider) accepted it. An evaluator cannot CLOSE over a contradicted claim.
 *   • Briefs are checked before anything is routed: an assignment without acceptance criteria, tests, deliverables
 *     or constraints, or one that only says "continue improving", is refused.
 *   • Bounds: tree depth, tasks per request, repeats of the same finding, evaluator retries, a cost ceiling per
 *     request, task deadlines and worker leases. Hitting any of them escalates to the founder instead of looping.
 *   • Duplicate briefs (same role + objective + acceptance criteria in one request) are skipped, never re-run.
 *   • Spend: every model call passes budgets.checkSpend first (every cap defaults to $0).
 *   • A founder decision on anything built from MOCK output can't be approved (task-ledger enforces it).
 *
 * Workers
 *   api    the call runs here through an adapter (adapters.mjs): Claude via the Anthropic API, ChatGPT via OpenAI,
 *          Grok via xAI. Structured output only — an API worker cannot change the repository.
 *   queue  the task waits in the ledger until a worker process claims it (claimNext → submit). This is how a
 *          headless Claude Code worker (GitHub Actions or a long-running process) does repository work.
 *   manual no supported interface exists (e.g. an interactive Claude Desktop session): the task is created with a
 *          notify and stays BLOCKED with the limitation named. Nothing pretends to drive a desktop conversation.
 */
import { canonicalJson, digestOf } from "../lib/util.mjs";
import { latestDigest, TERMINAL, APPROVAL_LEVELS, OrchestrationError } from "./task-ledger.mjs";
import { agentKey, checkSpend } from "./budgets.mjs";
import { isLiveAdapter, liveAvailable } from "./adapters.mjs";
import { ORCHESTRATOR, classifyBlocker } from "./pipelines.mjs";
import { selectFacts } from "./project-facts.mjs";

// ───────────────────────────────────────────── schemas ─────────────────────────────────────────────

export const STAGES = Object.freeze(["LOCAL", "COMMITTED", "PUSHED", "MERGED", "DEPLOYED", "VERIFIED_IN_PRODUCTION"]);
export const ASSIGNEES = Object.freeze(["claude-engineering", "claude-qa", "chatgpt-product", "grok-research", "program-director"]);

const str = { type: "string" };
const strs = { type: "array", items: str };
const obj = (required, properties) => ({ type: "object", additionalProperties: false, required, properties });

/** What a worker hands back. Every field is a claim until the verifier checks it. */
export const COMPLETION_REPORT_SCHEMA = obj(
  ["originalTask", "intendedOutcome", "summary", "changes", "files", "git", "tests", "evidence", "limitations", "risks", "suggestedNextSteps", "stage"],
  {
    originalTask: str, intendedOutcome: str, summary: str,
    changes: strs, files: strs,
    git: obj(["branch", "commits", "prs"], { branch: str, commits: strs, prs: strs }),
    tests: { type: "array", items: obj(["command", "passed", "failed"], { command: str, passed: { type: "integer" }, failed: { type: "integer" } }) },
    evidence: { type: "array", items: obj(["kind", "ref"], { kind: str, ref: str }) },
    limitations: strs, risks: strs,
    suggestedNextSteps: { type: "array", items: obj(["title", "rationale"], { title: str, rationale: str, suggestedAssignee: str }) },
    stage: { type: "string", enum: STAGES },
  },
);

/** A research worker's report (Grok). Every finding carries its source. */
export const RESEARCH_REPORT_SCHEMA = obj(["summary", "findings", "limitations", "suggestedNextSteps"], {
  summary: str,
  findings: { type: "array", items: obj(["claim", "url"], { claim: str, url: str }) },
  limitations: strs,
  suggestedNextSteps: { type: "array", items: obj(["title", "rationale"], { title: str, rationale: str, suggestedAssignee: str }) },
});

const BRIEF_SCHEMA = obj(
  ["assignee", "objective", "whyItMatters", "currentState", "requirements", "codeLocations", "priorResults", "acceptanceCriteria", "tests", "constraints", "deliverables", "reportingFormat", "dependencies", "permissions", "priority", "fixesSubject"],
  {
    assignee: { type: "string", enum: ASSIGNEES },
    objective: str, whyItMatters: str, currentState: str, requirements: strs,
    codeLocations: { type: "array", items: obj(["path", "verified"], { path: str, verified: { type: "boolean" } }) },
    priorResults: str, acceptanceCriteria: strs, tests: strs, constraints: strs, deliverables: strs, reportingFormat: str,
    dependencies: strs, permissions: strs,
    priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
    fixesSubject: { type: "boolean" },
  },
);

/** What the evaluator (normally ChatGPT) returns about one report — or, as the planner, about a CEO request. */
export const EVALUATION_SCHEMA = obj(["verdict", "decision", "requirementCoverage", "missing", "findings", "qaRequired", "followUps", "rationale", "ceoSummary"], {
  verdict: { type: "string", enum: ["accept", "changes", "not-applicable"] },
  decision: { type: "string", enum: ["CLOSE", "FOLLOW_UP", "ESCALATE"] },
  requirementCoverage: { type: "array", items: obj(["requirement", "met", "evidence"], { requirement: str, met: { type: "string", enum: ["yes", "partial", "no"] }, evidence: str }) },
  missing: strs,
  findings: { type: "array", items: obj(["id", "severity", "text"], { id: str, severity: str, text: str }) },
  qaRequired: { type: "boolean" },
  followUps: { type: "array", items: BRIEF_SCHEMA },
  rationale: str,
  ceoSummary: str,
});

/** Shallow structural check against the schemas above (the adapters already ask the model for them). */
function missingFields(schema, value, path = "") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path || "report"} is not an object`];
    return schema.required.flatMap((k) => (value[k] === undefined ? [`${path}${k} is missing`] : missingFields(schema.properties[k], value[k], `${path}${k}.`)));
  }
  if (schema.type === "array") return Array.isArray(value) ? [] : [`${path.slice(0, -1)} is not a list`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path.slice(0, -1)} must be one of ${schema.enum.join(", ")}`];
  return [];
}
export const validateReport = (kind, artifact) => missingFields(kind === "research" ? RESEARCH_REPORT_SCHEMA : COMPLETION_REPORT_SCHEMA, artifact);
export const validateEvaluation = (artifact) => missingFields(EVALUATION_SCHEMA, artifact);

// ───────────────────────────────────────────── briefs ─────────────────────────────────────────────

const GENERIC = /\b(continue (improving|working)|keep (improving|going)|make it better|improve (it|things|the feature|the ux) (generally|overall)|as needed|do your best|polish (it|things))\b/i;
const ENGINEERING = new Set(["claude-engineering", "claude-qa"]);

/** Is this brief immediately executable? Generic or incomplete assignments are refused before they are routed. */
export function checkBrief(b) {
  const p = [];
  if (!ASSIGNEES.includes(b?.assignee)) p.push(`assignee must be one of ${ASSIGNEES.join(", ")}`);
  if (String(b?.objective ?? "").trim().length < 40) p.push("objective is under 40 characters");
  for (const f of ["whyItMatters", "currentState", "reportingFormat"]) if (String(b?.[f] ?? "").trim().length < 10) p.push(`${f} is empty`);
  if (!(b?.acceptanceCriteria?.length >= 1) || b.acceptanceCriteria.some((c) => String(c).trim().length < 15)) p.push("acceptanceCriteria needs at least one concrete criterion");
  if (!(b?.deliverables?.length >= 1)) p.push("deliverables is empty");
  if (!(b?.constraints?.length >= 1)) p.push("constraints is empty");
  if (ENGINEERING.has(b?.assignee) && !(b?.tests?.length >= 1)) p.push("an engineering or QA brief names the tests to run");
  const text = [b?.objective, ...(b?.requirements ?? []), ...(b?.acceptanceCriteria ?? [])].join(" ");
  if (GENERIC.test(text)) p.push(`generic instruction: "${GENERIC.exec(text)[0]}"`);
  return { ok: p.length === 0, problems: p };
}

/** The same brief always has the same fingerprint, so a duplicate in one request is detected. */
export const briefFingerprint = (b) => digestOf({
  assignee: b.assignee,
  objective: String(b.objective).trim().toLowerCase().replace(/\s+/g, " "),
  acceptanceCriteria: [...(b.acceptanceCriteria ?? [])].map((c) => String(c).trim().toLowerCase()).sort(),
}).slice(0, 16);

const findingFingerprint = (f) => digestOf(String(f.text).trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ")).slice(0, 16);

/** The assignment as the worker reads it: the exact text stored on the handoff. */
export function renderBrief(b, { taskId, rootObjective } = {}) {
  const list = (xs) => (xs?.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  const loc = b.codeLocations?.length ? b.codeLocations.map((c) => `- ${c.path}${c.verified ? "" : " (UNVERIFIED — confirm before editing)"}`).join("\n") : "- (none given)";
  return [
    `# Assignment ${taskId ?? ""} · ${b.assignee} · ${b.priority}`.trim(),
    rootObjective ? `CEO request: ${rootObjective}` : null,
    `## Objective\n${b.objective}`,
    `## Why it matters\n${b.whyItMatters}`,
    `## Current state\n${b.currentState}`,
    `## Requirements\n${list(b.requirements)}`,
    `## Code locations\n${loc}`,
    `## Prior results\n${b.priorResults || "(none)"}`,
    `## Acceptance criteria\n${list(b.acceptanceCriteria)}`,
    `## Tests to run\n${list(b.tests)}`,
    `## Constraints and safeguards\n${list(b.constraints)}`,
    `## Deliverables\n${list(b.deliverables)}`,
    `## Dependencies\n${list(b.dependencies)}`,
    `## Permissions\n${list(b.permissions)}`,
    `## Report back\n${b.reportingFormat}\nSubmit a completion report (originalTask, intendedOutcome, summary, changes, files, git, tests, evidence, limitations, risks, suggestedNextSteps, stage). The report is a claim: it is verified and independently evaluated before the task completes.`,
  ].filter(Boolean).join("\n\n");
}

// ───────────────────────────────────────────── routing ─────────────────────────────────────────────

/** Default responsibilities. Routing picks the first seat that is available; these are defaults, not limits. */
export const ROLES = Object.freeze({
  "claude-engineering": { provider: "anthropic", role: "engineering", kind: "work", seats: ["queue:claude-code"], needs: ["repo.write", "tests.run"] },
  "claude-qa": { provider: "anthropic", role: "qa", kind: "work", seats: ["queue:claude-code", "api:anthropic"], needs: ["repo.read"] },
  "chatgpt-product": { provider: "openai", role: "product", kind: "work", seats: ["api:openai"], needs: [] },
  "grok-research": { provider: "xai", role: "research", kind: "research", seats: ["api:xai"], needs: ["x_search"] },
  "program-director": { provider: "anthropic", role: "program-director", kind: "work", seats: ["manual:program-director"], needs: [] },
});

/**
 * Where can a brief for `assignee` run right now? Queue seats need a registered worker serving that assignee;
 * API seats need an adapter. Returns { seat, mode, provider, role } or { mode: "manual", limitation }.
 */
export function route(assignee, { adapters, workers }) {
  const r = ROLES[assignee];
  if (!r) return { mode: "none", limitation: `unknown assignee ${assignee}` };
  for (const seat of r.seats) {
    const [kind] = seat.split(":");
    if (kind === "queue" && workers.some((w) => w.seat === seat && w.serves.includes(assignee))) return { seat, mode: "queue", provider: r.provider, role: r.role };
    if (kind === "api" && adapters[r.provider]) return { seat, mode: "api", provider: r.provider, role: r.role };
  }
  const why = assignee === "program-director"
    ? "the Program Director is an interactive Claude Code session; no supported interface lets a server post into it, so this waits for a human relay"
    : `no ${r.seats.join(" / ")} worker is available for ${assignee}`;
  return { seat: r.seats[0], mode: "manual", provider: r.provider, role: r.role, limitation: why };
}

/** The evaluator must be a different provider from the work it judges: ChatGPT normally, Claude when ChatGPT did it. */
const evaluatorFor = (subjectProvider, adapters) =>
  ["openai", "anthropic", "xai"].find((p) => p !== subjectProvider && adapters[p]) ?? null;

// ───────────────────────────────────────────── V3 statuses ─────────────────────────────────────────────

export const V3_STATUSES = Object.freeze([
  "QUEUED", "ASSIGNED", "RUNNING", "SUBMITTED", "VERIFYING", "COMPLETED",
  "BLOCKED", "FAILED", "NEEDS_FOUNDER_APPROVAL", "CANCELLED", "SUPERSEDED",
]);

/** The founder-facing status, derived from the ledger state (never stored separately, so it can't drift). */
export function v3Status(state, t) {
  switch (t.state) {
    case "PLANNED": return t.claim || t.route?.mode === "api" ? "ASSIGNED" : "QUEUED";
    case "IN_PROGRESS": return "RUNNING";
    case "NEEDS_REVIEW": {
      const judged = state.taskOrder.some((id) => state.tasks[id].parentTaskId === t.taskId && state.tasks[id].stepKey === "verify");
      return judged ? "VERIFYING" : "SUBMITTED";
    }
    case "READY_FOR_APPROVAL": return t.approvalLevel === "C" ? "NEEDS_FOUNDER_APPROVAL" : "VERIFYING";
    case "APPROVED": return "VERIFYING";
    case "DONE": return "COMPLETED";
    case "BLOCKED": return t.blocker?.class === "FOUNDER" ? "NEEDS_FOUNDER_APPROVAL" : "BLOCKED";
    default: return t.state; // FAILED, CANCELLED, SUPERSEDED
  }
}

// ───────────────────────────────────────────── the loop ─────────────────────────────────────────────

export const LOOP_DEFAULTS = Object.freeze({
  maxDepth: 4, // planner = 1, its assignments = 2, …
  maxTasksPerRequest: 16,
  maxFindingRepeats: 2, // the same finding in this many evaluations → escalate instead of another fix
  maxEvaluationAttempts: 2, // an evaluation with an invalid decision or brief is retried once, then escalated
  costCeilingUsd: 5, // per CEO request, on top of the provider and agent caps
  leaseMs: 30 * 60_000,
  taskTimeoutMs: 6 * 3600_000,
});

const VERIFIER = Object.freeze({ provider: "deterministic", model: "gtp-cc-claim-verifier@1" });

/**
 * @param {{ ledger, adapters: Record<string, object>, config: object, loop?: object, now?: () => string,
 *   checkers?: { commitExists?: (sha) => boolean, urlLooksSourced?: (url) => boolean } }} o
 */
export function createHandoffLoop({ ledger, adapters, config, loop = {}, now = () => new Date().toISOString(), checkers = {} }) {
  const L = { ...LOOP_DEFAULTS, ...loop };
  const workers = [];
  const actor = ORCHESTRATOR;
  const ev = (type, body, key) => ledger.append(type, actor, body, { idempotencyKey: `v3:${key}` }).event;
  const transition = (taskId, to, extra = {}, tag = to) => {
    if (ledger.task(taskId).state === to) return;
    ev("task.transition", { taskId, to, ...extra }, `${taskId}:${tag}`);
  };
  const block = (taskId, code, detail, cls = classifyBlocker(code)) => transition(taskId, "BLOCKED", { blocker: { class: cls, code, detail: String(detail).slice(0, 400) } }, `blocked:${code}`);
  const st = () => ledger.state();
  const later = (ms) => new Date(Date.parse(now()) + ms).toISOString();
  const treeOf = (s, rootId) => s.taskOrder.map((id) => s.tasks[id]).filter((t) => t.rootTaskId === rootId || t.taskId === rootId);
  const open = (t) => !TERMINAL.includes(t.state);

  function spec({ taskId, rootId, objective, agent, stepKey, approvalLevel, depth, costUsd = 1, brief = null, route: r = null, extra = {} }) {
    return {
      taskId, parentProject: "gametimepicks", objective, assignedAgent: agent, stepKey, rootTaskId: rootId, depth,
      approvalLevel, approvalRequirement: APPROVAL_LEVELS[approvalLevel], costBudget: { usd: costUsd, hardStop: true },
      deadline: later(L.taskTimeoutMs), brief, route: r, ...extra,
    };
  }
  const childId = (parentId, tag) => `t-${digestOf({ parentId, tag }).slice(0, 12)}`;

  /** The context a worker gets: the request, its brief, its ancestors' summaries and the relevant project facts. */
  function contextPack(s, t) {
    const root = s.tasks[t.rootTaskId ?? t.taskId];
    const lineage = [];
    for (let id = t.parentTaskId; id && lineage.length < 6; id = s.tasks[id]?.parentTaskId) {
      const a = s.tasks[id];
      const out = a.outputs.at(-1);
      lineage.push({ taskId: a.taskId, step: a.stepKey, agent: agentKey(a.assignedAgent), digest: out?.artifactDigest ?? null, summary: String(out?.artifact?.summary ?? out?.artifact?.ceoSummary ?? out?.artifact?.brief ?? "").slice(0, 400), mode: out?.mode ?? null });
    }
    const tags = [t.brief?.assignee, t.stepKey, ...(t.brief?.requirements ?? []), root?.objective].join(" ");
    return { request: { taskId: root.taskId, objective: root.objective, acceptanceCriteria: root.acceptanceCriteria }, brief: t.brief, lineage, facts: selectFacts(tags) };
  }

  // ── intake ──
  function intake(founder, { objective, acceptanceCriteria = [], priority = "P1", requestKey }) {
    if (founder?.role !== "founder" || founder.authenticated !== true) throw new OrchestrationError("FOUNDER_ONLY", "a CEO request comes from the authenticated founder");
    if (String(objective ?? "").trim().length < 10) throw new OrchestrationError("INVALID_REQUEST", "say what you want done");
    const taskId = `req-${digestOf({ objective, requestKey: requestKey ?? now() }).slice(0, 12)}`;
    const agent = { provider: "founder", seat: "founder", role: "ceo" };
    ev("task.created", { task: { ...spec({ taskId, rootId: taskId, objective, agent, stepKey: "request", approvalLevel: "A", depth: 0, costUsd: L.costCeilingUsd }), acceptanceCriteria, priority, rootTaskId: taskId } }, `create:${taskId}`);
    transition(taskId, "IN_PROGRESS");
    const founderAdapter = adapters.founder ?? { provider: "founder", model: null };
    ledger.recordOutput(taskId, { ...founder }, { adapter: founderAdapter, isLive: isLiveAdapter(founderAdapter), result: { artifact: { brief: objective, acceptanceCriteria, priority, surface: founder.surface ?? null } } }, { idempotencyKey: `v3:${taskId}:brief` });
    return taskId;
  }

  // ── queue workers ──
  /**
   * Register a worker process that claims queued tasks. A worker's submissions are LIVE only when it was built with
   * the hosted Claude credentials present (liveAvailable checks the names only); otherwise they are MOCK.
   */
  function registerWorker({ id, seat = "queue:claude-code", serves = ["claude-engineering", "claude-qa"], model = "mock-claude-code-worker", env = {} }) {
    const live = liveAvailable("anthropic", env).via === "api" && !/^mock/i.test(model);
    const w = Object.freeze({ id, seat, serves: Object.freeze([...serves]), model, live, kind: seat.split(":")[1] });
    workers.push(w);
    return w;
  }

  const depsDone = (s, t) => (t.dependencies ?? []).every((d) => s.tasks[d]?.state === "DONE");

  /** The next queued task this worker may take, claimed and RUNNING, with the exact assignment text. */
  function claimNext(worker) {
    const s = st();
    const t = s.taskOrder.map((id) => s.tasks[id]).find((x) => x.state === "PLANNED" && x.route?.mode === "queue" && x.route.seat === worker.seat
      && worker.serves.includes(x.brief?.assignee) && depsDone(s, x) && !(x.claim && x.claim.leaseUntil > now() && x.claim.worker.id !== worker.id));
    if (!t) return null;
    ev("task.claimed", { taskId: t.taskId, worker: { id: worker.id, kind: worker.kind }, leaseUntil: later(L.leaseMs) }, `${t.taskId}:claim:${worker.id}:${t.history.length}`);
    transition(t.taskId, "IN_PROGRESS");
    const s2 = st();
    return { taskId: t.taskId, assignment: s2.handoffs.find((h) => h.toTaskId === t.taskId)?.instructions ?? t.objective, context: contextPack(s2, s2.tasks[t.taskId]) };
  }

  /** A worker hands back its completion report. It becomes SUBMITTED; the loop verifies and evaluates it. */
  function submit(worker, taskId, report, { usd = 0, estimated = true } = {}) {
    const t = ledger.task(taskId);
    if (t?.claim?.worker.id !== worker.id || t.state !== "IN_PROGRESS") throw new OrchestrationError("NOT_YOUR_TASK", `${taskId} is not running under ${worker.id}`);
    const adapter = { provider: t.assignedAgent.provider, model: worker.model };
    ev("task.attempt", { taskId, provider: adapter.provider, ok: true, code: null, retryable: false }, `${taskId}:attempt:${t.attempts + 1}`);
    ev("task.cost", { taskId, provider: adapter.provider, agent: agentKey(t.assignedAgent), usd: worker.live ? usd : 0, estimated, mode: worker.live ? "LIVE" : "MOCK" }, `${taskId}:cost:${t.attempts + 1}`);
    ledger.recordOutput(taskId, { role: "agent", id: worker.id, surface: "worker" }, { adapter, isLive: worker.live, result: { artifact: report } }, { idempotencyKey: `v3:${taskId}:output:${t.attempts + 1}` });
    afterReport(taskId);
  }

  function afterReport(taskId) {
    const t = ledger.task(taskId);
    const problems = validateReport(ROLES[t.brief?.assignee]?.kind ?? "work", t.outputs.at(-1).artifact);
    if (problems.length) return block(taskId, "INVALID_REPORT", `completion report incomplete: ${problems.slice(0, 5).join("; ")}`, "AGENT");
    transition(taskId, "NEEDS_REVIEW", {}, `submitted:${t.outputs.length}`);
  }

  // ── running a model step ──
  async function callModel(taskId, kind, instructions, schema) {
    const t = ledger.task(taskId);
    const adapter = adapters[t.assignedAgent.provider];
    if (!adapter) { block(taskId, "NO_ADAPTER", `no adapter for ${t.assignedAgent.provider}`); return null; }
    if (t.state === "PLANNED") transition(taskId, "IN_PROGRESS");
    const s = st();
    const inputs = t.inputs.map((d) => ({ digest: d, artifact: s.outputsByDigest[d].artifact, provider: s.outputsByDigest[d].provider, mode: s.outputsByDigest[d].mode }));
    if (isLiveAdapter(adapter) && inputs.some((i) => i.mode !== "LIVE")) { block(taskId, "MOCK_LINEAGE", "a live agent is never called on MOCK inputs"); return null; }
    const req = { task: t, step: { kind, key: t.stepKey, schema }, objective: t.objective, inputs, instructions, context: contextPack(s, t), state: s };
    const worst = adapter.worstCase(req);
    const rootSpend = treeOf(s, t.rootTaskId).reduce((n, x) => n + x.costUsd, 0);
    if (worst > 0 && rootSpend + worst > L.costCeilingUsd) {
      ev("budget.refused", { taskId, code: "BUDGET_HARD_STOP", scope: `request:${t.rootTaskId}`, detail: `request ceiling $${L.costCeilingUsd}` }, `${taskId}:refused:ceiling:${t.attempts}`);
      block(taskId, "BUDGET_HARD_STOP", `request ceiling $${L.costCeilingUsd}: spent $${rootSpend.toFixed(4)} + worst case $${worst.toFixed(4)}`, "FOUNDER");
      return null;
    }
    const chk = checkSpend(s, { task: t, worstCaseUsd: worst, now: now(), config });
    if (!chk.ok) {
      ev("budget.refused", { taskId, code: chk.code, scope: chk.scope, detail: chk.detail }, `${taskId}:refused:${t.attempts}`);
      block(taskId, chk.code, chk.detail, chk.blockerClass);
      return null;
    }
    let result;
    try {
      result = await adapter.run(req);
    } catch (err) {
      const code = err.code ?? "PROVIDER_ERROR";
      ev("task.attempt", { taskId, provider: t.assignedAgent.provider, ok: false, code, retryable: Boolean(err.retryable) }, `${taskId}:attempt:${t.attempts + 1}`);
      block(taskId, code, String(err.detail ?? err.message));
      return null;
    }
    const live = isLiveAdapter(adapter);
    ev("task.attempt", { taskId, provider: t.assignedAgent.provider, ok: true, code: null, retryable: false }, `${taskId}:attempt:${t.attempts + 1}`);
    ev("task.cost", { taskId, provider: t.assignedAgent.provider, agent: agentKey(t.assignedAgent), usd: live ? Number(result.usage?.usd ?? 0) : 0, estimated: Boolean(result.usage?.estimated), mode: live ? "LIVE" : "MOCK" }, `${taskId}:cost:${t.attempts + 1}`);
    ledger.recordOutput(taskId, actor, { adapter, isLive: live, result }, { idempotencyKey: `v3:${taskId}:output:${t.attempts + 1}` });
    return ledger.task(taskId).outputs.at(-1);
  }

  // ── claim verification (our code, not a model) ──
  function verifyClaims(report, kind) {
    const claims = [];
    const add = (claim, status, detail) => claims.push({ claim, status, detail });
    if (kind === "research") {
      for (const f of report.findings ?? []) add(`finding: ${String(f.claim).slice(0, 80)}`, /^https:\/\//.test(f.url) && (checkers.urlLooksSourced?.(f.url) ?? true) ? "SOURCED" : "UNSOURCED", f.url);
    } else {
      for (const c of report.git?.commits ?? []) {
        const known = checkers.commitExists ? checkers.commitExists(c) : null;
        add(`commit ${c}`, known === null ? "UNCHECKED" : known ? "VERIFIED" : "CONTRADICTED", known === null ? "no git checker on this host" : known ? "found in the repository" : "not in the repository");
      }
      const failing = (report.tests ?? []).filter((x) => x.failed > 0);
      add("tests pass", failing.length ? "CONTRADICTED" : (report.tests ?? []).length ? "REPORTED" : "MISSING", failing.length ? `${failing.length} test command(s) report failures` : "the worker's own run; re-run in QA to verify");
      const needsCommit = STAGES.indexOf(report.stage) >= STAGES.indexOf("COMMITTED");
      if (needsCommit && !(report.git?.commits ?? []).length) add(`stage ${report.stage}`, "CONTRADICTED", "a stage past LOCAL names its commits");
      if (STAGES.indexOf(report.stage) >= STAGES.indexOf("DEPLOYED")) add(`stage ${report.stage}`, "UNCHECKED", "deployment and production are verified by the release gate, not by this check");
    }
    const contradicted = claims.filter((c) => ["CONTRADICTED", "UNSOURCED"].includes(c.status));
    return { claims, contradicted: contradicted.length, summary: contradicted.length ? `${contradicted.length} claim(s) contradicted` : "no claim contradicted" };
  }

  function runVerifier(subjectId) {
    const subj = ledger.task(subjectId);
    const id = childId(subjectId, `verify:${subj.outputs.length}`);
    if (!ledger.task(id)) {
      ev("handoff", { handoffId: `ho-${id}`, fromTaskId: subjectId, artifactDigest: latestDigest(subj), instructions: "Check the report's verifiable claims (commits, test results, stage, sources).",
        child: spec({ taskId: id, rootId: subj.rootTaskId, objective: `Verify claims: ${subj.objective.slice(0, 120)}`, agent: { provider: "deterministic", seat: "deterministic", role: "claim-verifier" }, stepKey: "verify", approvalLevel: "A", depth: subj.depth + 1, costUsd: 0 }) }, `handoff:${id}`);
    }
    if (ledger.task(id).state === "DONE") return id;
    transition(id, "IN_PROGRESS");
    const det = adapters.deterministic;
    const artifact = { subjectTaskId: subjectId, ...verifyClaims(subj.outputs.at(-1).artifact, ROLES[subj.brief?.assignee]?.kind ?? "work") };
    if (!ledger.task(id).outputs.length) ledger.recordOutput(id, actor, { adapter: VERIFIER, isLive: Boolean(det && isLiveAdapter(det)), result: { artifact } }, { idempotencyKey: `v3:${id}:output` });
    ev("task.evidence", { taskId: id, name: "claim-verification.json", sha256: latestDigest(ledger.task(id)), kind: "verification" }, `${id}:evidence`);
    transition(id, "DONE", { outcome: { result: "DONE", contradicted: artifact.contradicted } });
    return id;
  }

  // ── evaluation and planning ──
  function evaluationPrompt(s, subject, verification, planning) {
    const root = s.tasks[subject.rootTaskId ?? subject.taskId];
    return [
      planning
        ? "You are the GameTimePicks orchestration agent. Turn the CEO request into the smallest set of implementation-ready assignments."
        : "You are the GameTimePicks orchestration agent. Evaluate this completion report against the original requirements and decide what happens next.",
      `CEO request: ${planning ? subject.objective : root.objective}`,
      planning && subject.taskId !== root.taskId ? `(This redirects the earlier request: ${root.objective})` : null,
      `Request acceptance criteria:\n${(root.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n") || "- (none given)"}`,
      planning ? null : `Assignment being judged:\n${subject.brief ? renderBrief(subject.brief, { taskId: subject.taskId }) : subject.objective}`,
      planning ? null : `Claim verification: ${verification.summary}\n${verification.claims.map((c) => `- ${c.claim}: ${c.status} (${c.detail})`).join("\n")}`,
      "Rules:",
      "- verdict accept only if every requirement is met with evidence; changes if a verified defect remains; not-applicable when planning.",
      "- decision CLOSE when nothing else is needed — do not invent follow-up work. FOLLOW_UP with briefs only for concrete, evidenced next steps. ESCALATE when the founder must decide.",
      "- Every follow-up brief is immediately executable: objective, why it matters, current state, exact requirements, verified code locations (mark unverified ones), acceptance criteria, tests, constraints, deliverables, reporting format, dependencies, permissions.",
      "- A fix for the assignment being judged sets fixesSubject true and goes to the same assignee.",
      "- Never ask for fabricated lines, prices, projections or results; one canonical official forecast per game, player, market and snapshot.",
    ].filter(Boolean).join("\n\n");
  }

  function startEvaluation(subjectId, verifyId, planning) {
    const s = st();
    const subj = s.tasks[subjectId];
    const provider = evaluatorFor(planning ? "founder" : subj.assignedAgent.provider, adapters);
    const id = childId(subjectId, `evaluate:${subj.outputs.length}`);
    if (ledger.task(id)) return id;
    const fromId = planning ? subjectId : verifyId;
    const agent = provider ? { provider, seat: `api:${provider}`, role: planning ? "planner" : "evaluator" } : { provider: "openai", seat: "api:openai", role: planning ? "planner" : "evaluator" };
    const context = planning ? [] : [latestDigest(subj)];
    const instructions = evaluationPrompt(s, subj, planning ? null : s.tasks[verifyId].outputs.at(-1).artifact, planning);
    ev("handoff", { handoffId: `ho-${id}`, fromTaskId: fromId, artifactDigest: latestDigest(s.tasks[fromId]), context, instructions,
      child: spec({ taskId: id, rootId: subj.rootTaskId ?? subjectId, objective: `${planning ? "Plan" : "Evaluate"}: ${subj.objective.slice(0, 140)}`, agent, stepKey: planning ? "plan" : "evaluate", approvalLevel: "A", depth: subj.depth + 1, costUsd: 0.5, extra: { subjectTaskId: subjectId } }) }, `handoff:${id}`);
    ev("notify", { to: agentKey(agent), taskId: id, reason: planning ? "plan" : "evaluate" }, `notify:${id}`);
    if (!provider) block(id, "NO_ADAPTER", "no independent evaluator is available (needs a provider different from the work's)", "TOOL");
    return id;
  }

  /** Which findings has this request already seen, and how often? */
  function findingCounts(s, rootId) {
    const n = {};
    for (const t of treeOf(s, rootId)) if (t.stepKey === "evaluate" && t.state === "DONE" && !t.outcome?.refused) for (const f of t.outputs.at(-1)?.artifact?.findings ?? []) n[findingFingerprint(f)] = (n[findingFingerprint(f)] ?? 0) + 1;
    return n;
  }

  function escalate(rootId, fromTaskId, code, reason) {
    const decisionId = openDecision(rootId, fromTaskId, { escalation: { code, reason } });
    return decisionId;
  }

  /** The founder decision for a request: CLOSE's final summary, or an escalation. Level C. */
  function openDecision(rootId, fromTaskId, { escalation = null } = {}) {
    const id = childId(fromTaskId, escalation ? `escalate:${escalation.code}` : "decision");
    if (ledger.task(id)) return id;
    const from = ledger.task(fromTaskId);
    const agent = { provider: "founder", seat: "founder", role: "ceo" };
    ev("handoff", { handoffId: `ho-${id}`, fromTaskId, artifactDigest: latestDigest(from),
      instructions: escalation ? `Escalated (${escalation.code}): ${escalation.reason}. Approve, reject or redirect.` : "The agents propose closing this request. Approve, reject or redirect.",
      child: spec({ taskId: id, rootId, objective: escalation ? `Founder decision — escalated: ${escalation.code}` : "Founder decision — close the request", agent, stepKey: "decision", approvalLevel: "C", depth: from.depth + 1, costUsd: 0, extra: { meta: { escalation } } }) }, `handoff:${id}`);
    transition(id, "IN_PROGRESS");
    transition(id, "READY_FOR_APPROVAL");
    ev("notify", { to: "founder", taskId: id, reason: escalation ? "escalated" : "close-proposed" }, `notify:${id}`);
    return id;
  }

  /** Apply an evaluation: judge the subject, then route follow-ups, close, or escalate. */
  function applyEvaluation(evalId) {
    const s = st();
    const e = s.tasks[evalId];
    const subj = s.tasks[e.subjectTaskId];
    const rootId = e.rootTaskId;
    const out = e.outputs.at(-1).artifact;
    const planning = e.stepKey === "plan";
    const verification = planning ? null : s.tasks[childId(subj.taskId, `verify:${subj.outputs.length}`)].outputs.at(-1).artifact;

    const problems = validateEvaluation(out);
    const briefs = (out.followUps ?? []).map((b) => ({ b, check: checkBrief(b) }));
    if (out.decision === "CLOSE" && (out.followUps ?? []).length) problems.push("CLOSE with follow-ups");
    if (out.decision === "FOLLOW_UP" && !briefs.length) problems.push("FOLLOW_UP without a brief");
    if (out.decision === "CLOSE" && verification?.contradicted) problems.push("CLOSE over contradicted claims");
    if (out.decision === "CLOSE" && (out.requirementCoverage ?? []).some((r) => r.met !== "yes")) problems.push("CLOSE with unmet requirements");
    if (!planning && out.verdict === "changes" && !briefs.some(({ b }) => b.fixesSubject)) problems.push("changes without a fix brief");
    for (const { b, check } of briefs) if (!check.ok) problems.push(`brief "${String(b.objective).slice(0, 50)}": ${check.problems.join("; ")}`);
    if (problems.length) {
      const tries = treeOf(s, rootId).filter((t) => t.subjectTaskId === subj.taskId && t.stepKey === e.stepKey && t.outputs.length).length;
      if (tries < L.maxEvaluationAttempts) {
        // One more try with the problems named; a second bad answer escalates.
        const retryId = childId(evalId, `retry:${e.attempts}`);
        if (!ledger.task(retryId)) {
          ev("handoff", { handoffId: `ho-${retryId}`, fromTaskId: evalId, artifactDigest: latestDigest(e), context: [...e.inputs], instructions: `${s.handoffs.find((h) => h.toTaskId === evalId).instructions}\n\nYour previous answer was refused: ${problems.join(" | ")}. Answer again.`,
            child: spec({ taskId: retryId, rootId, objective: e.objective, agent: e.assignedAgent, stepKey: e.stepKey, approvalLevel: "A", depth: e.depth, costUsd: 0.5, extra: { subjectTaskId: subj.taskId } }) }, `handoff:${retryId}`);
        }
        transition(evalId, "DONE", { outcome: { result: "DONE", refused: problems, retriedAs: retryId } });
        return;
      }
      transition(evalId, "DONE", { outcome: { result: "DONE", refused: problems } });
      escalate(rootId, evalId, "INVALID_EVALUATION", problems.join(" | "));
      return;
    }

    // Judge the subject (reports only): an independent accept completes it; changes supersede it with the fix.
    if (!planning) {
      ev("review.verdict", { reviewTaskId: evalId, subjectTaskId: subj.taskId, round: subj.outputs.length, verdict: out.verdict === "accept" ? "approve" : "changes", findings: out.findings ?? [] }, `verdict:${evalId}`);
    }
    transition(evalId, "DONE", { outcome: { result: "DONE", decision: out.decision } });

    if (planning && subj.taskId !== rootId && subj.state === "IN_PROGRESS") transition(subj.taskId, "DONE", { outcome: { result: "DONE", plannedBy: evalId } });
    if (out.decision === "ESCALATE") { escalate(rootId, evalId, "AGENT_ESCALATED", out.rationale); return; }

    // Bounds before anything new is created.
    const counts = findingCounts(st(), rootId);
    const repeated = (out.findings ?? []).filter((f) => counts[findingFingerprint(f)] >= L.maxFindingRepeats);
    const tree = treeOf(st(), rootId);
    const created = [];
    const skipped = [];
    const seen = new Set(tree.filter((t) => t.fingerprint && !["CANCELLED", "SUPERSEDED", "FAILED"].includes(t.state)).map((t) => t.fingerprint));
    let escalation = null;
    if (repeated.length) escalation = { code: "REPEATED_FINDING", reason: `the same finding came back ${L.maxFindingRepeats} times: ${repeated.map((f) => f.text).join("; ").slice(0, 200)}` };
    for (const { b } of escalation ? [] : briefs) {
      const fp = briefFingerprint(b);
      if (seen.has(fp)) { skipped.push({ fingerprint: fp, reason: "duplicate brief" }); continue; }
      seen.add(fp);
      if (e.depth + 1 > L.maxDepth) { escalation = { code: "LOOP_DEPTH", reason: `follow-ups would exceed depth ${L.maxDepth}` }; break; }
      if (tree.length + created.length >= L.maxTasksPerRequest) { escalation = { code: "LOOP_TASKS", reason: `request reached ${L.maxTasksPerRequest} tasks` }; break; }
      created.push(createAssignment(rootId, evalId, b, fp));
    }
    for (const x of skipped) ev("notify", { to: "orchestrator", taskId: evalId, reason: `skipped ${x.reason} ${x.fingerprint}` }, `skip:${evalId}:${x.fingerprint}`);

    if (!planning && subj.state === "NEEDS_REVIEW") {
      if (out.verdict === "accept") {
        ledger.append("approval.granted", { role: "agent", id: agentKey(e.assignedAgent), surface: "agent" }, { taskId: subj.taskId, artifactDigest: latestDigest(subj), basis: { reviewTaskId: evalId, subjectTaskId: subj.taskId } }, { idempotencyKey: `v3:approve:${subj.taskId}` });
        transition(subj.taskId, "DONE", { outcome: { result: "DONE", verifiedBy: evalId } });
      } else {
        const fix = created.find((id) => ledger.task(id).brief?.fixesSubject);
        if (fix) transition(subj.taskId, "SUPERSEDED", { outcome: { result: "SUPERSEDED", supersededBy: fix, by: evalId } });
        else if (!escalation) escalation = { code: "NO_FIX_ROUTED", reason: "changes were requested but the fix brief was a duplicate" };
      }
    }
    if (escalation) { escalate(rootId, evalId, escalation.code, escalation.reason); return; }
    if (out.decision === "CLOSE") maybeClose(rootId, evalId);
  }

  function createAssignment(rootId, evalId, b, fp) {
    const id = childId(evalId, `assign:${fp}`);
    if (ledger.task(id)) return id;
    const r = route(b.assignee, { adapters, workers });
    const role = ROLES[b.assignee];
    const agent = { provider: role.provider, seat: r.seat, role: role.role };
    const e = ledger.task(evalId);
    const rootObjective = ledger.task(rootId).objective;
    ev("handoff", { handoffId: `ho-${id}`, fromTaskId: evalId, artifactDigest: latestDigest(e), context: e.inputs.filter((d) => st().outputsByDigest[d]?.provider !== "founder").slice(0, 3), instructions: renderBrief(b, { taskId: id, rootObjective }),
      child: spec({ taskId: id, rootId, objective: b.objective, agent, stepKey: b.assignee, approvalLevel: "B", depth: e.depth + 1, costUsd: 1, brief: b, route: { mode: r.mode, seat: r.seat },
        extra: { acceptanceCriteria: b.acceptanceCriteria, priority: b.priority, fingerprint: fp, expectedOutputs: b.deliverables, permissions: b.permissions } }) }, `handoff:${id}`);
    ev("notify", { to: r.mode === "queue" ? r.seat : agentKey(agent), taskId: id, reason: "assignment" }, `notify:${id}`);
    if (r.mode === "manual" || r.mode === "none") block(id, "NO_WORKER", r.limitation, "TOOL");
    return id;
  }

  function maybeClose(rootId, fromTaskId) {
    const live = treeOf(st(), rootId).filter((t) => open(t) && !["request", "decision"].includes(t.stepKey));
    if (!live.length) openDecision(rootId, fromTaskId);
  }

  // ── timeouts and leases ──
  function sweep() {
    const s = st();
    let n = 0;
    for (const t of s.taskOrder.map((id) => s.tasks[id])) {
      if (t.state === "IN_PROGRESS" && t.claim && t.claim.leaseUntil <= now() && !t.outputs.length) {
        block(t.taskId, "LEASE_EXPIRED", `${t.claim.worker.id} did not report before ${t.claim.leaseUntil}`, "TOOL");
        transition(t.taskId, "PLANNED", {}, `requeue:${t.claim.leaseUntil}`);
        n++;
      } else if (open(t) && t.deadline && t.deadline <= now() && !["READY_FOR_APPROVAL", "NEEDS_REVIEW", "APPROVED"].includes(t.state) && !["request", "decision"].includes(t.stepKey)) {
        if (t.state !== "BLOCKED") block(t.taskId, "TIMEOUT", `passed its deadline ${t.deadline}`, "TOOL");
        transition(t.taskId, "FAILED", { outcome: { result: "FAILED", code: "TIMEOUT", deadline: t.deadline } });
        const from = s.tasks[t.parentTaskId]?.outputs.length ? t.parentTaskId : t.rootTaskId;
        escalate(t.rootTaskId, from, "TIMEOUT", `${t.taskId} passed its deadline ${t.deadline}`);
        n++;
      }
    }
    return n;
  }

  /** One unit of progress. Returns a short description, or null when nothing can move without a worker or the founder. */
  async function step() {
    if (sweep()) return "sweep";
    const s = st();
    for (const t of s.taskOrder.map((id) => s.tasks[id])) {
      // A request with its brief recorded and no plan yet → plan it.
      if (t.stepKey === "request" && t.state === "IN_PROGRESS" && t.outputs.length && !s.taskOrder.some((id) => s.tasks[id].subjectTaskId === t.taskId)) {
        startEvaluation(t.taskId, null, true);
        return `plan ${t.taskId}`;
      }
      // Planner / evaluator ready to run.
      if (["plan", "evaluate"].includes(t.stepKey) && t.state === "PLANNED") {
        const out = await callModel(t.taskId, "evaluate", s.handoffs.find((h) => h.toTaskId === t.taskId).instructions, EVALUATION_SCHEMA);
        if (out) applyEvaluation(t.taskId);
        return `${t.stepKey} ${t.taskId}`;
      }
      // API-routed assignment ready to run.
      if (t.route?.mode === "api" && t.state === "PLANNED" && depsDone(s, t)) {
        const kind = ROLES[t.brief.assignee].kind;
        const out = await callModel(t.taskId, kind === "research" ? "research" : "work", s.handoffs.find((h) => h.toTaskId === t.taskId).instructions, kind === "research" ? RESEARCH_REPORT_SCHEMA : COMPLETION_REPORT_SCHEMA);
        if (out) afterReport(t.taskId);
        return `run ${t.taskId}`;
      }
      // A submitted report → verify it, then evaluate it.
      if (t.state === "NEEDS_REVIEW" && t.brief) {
        const verifyId = childId(t.taskId, `verify:${t.outputs.length}`);
        if (ledger.task(verifyId)?.state !== "DONE") { runVerifier(t.taskId); return `verify ${t.taskId}`; }
        if (!ledger.task(childId(t.taskId, `evaluate:${t.outputs.length}`))) { startEvaluation(t.taskId, verifyId, false); return `evaluate ${t.taskId}`; }
      }
    }
    return null;
  }

  async function runUntilIdle(maxSteps = 200) {
    const log = [];
    for (let i = 0; i < maxSteps; i++) {
      const a = await step();
      if (!a) return log;
      log.push(a);
    }
    throw new OrchestrationError("LOOP_RUNAWAY", `${maxSteps} steps without settling`);
  }

  // ── founder ──
  /** approve (Level C, exact digest), reject (closes the request), or redirect (new instructions → planned again). */
  function founderDecision(founder, taskId, { action, artifactDigest, note = "", objective }) {
    if (founder?.role !== "founder" || founder.authenticated !== true) throw new OrchestrationError("FOUNDER_ONLY", "only the authenticated founder decides");
    const t = ledger.task(taskId);
    if (t?.stepKey !== "decision" || t.state !== "READY_FOR_APPROVAL") throw new OrchestrationError("NOT_AWAITING_DECISION", `${taskId} is not awaiting a founder decision`);
    const rootId = t.rootTaskId;
    if (action === "approve") {
      ledger.append("approval.granted", founder, { taskId, artifactDigest }, { idempotencyKey: `v3:founder:approve:${taskId}` });
      ledger.append("task.transition", founder, { taskId, to: "DONE", outcome: { result: "DONE", approvedBy: founder.id, note } }, { idempotencyKey: `v3:founder:done:${taskId}` });
      ledger.append("task.transition", founder, { taskId: rootId, to: "DONE", outcome: { result: "DONE", closedBy: taskId } }, { idempotencyKey: `v3:founder:root-done:${rootId}` });
      return { closed: true };
    }
    if (action === "reject") {
      ledger.append("task.transition", founder, { taskId, to: "CANCELLED", outcome: { result: "REJECTED", by: founder.id, note } }, { idempotencyKey: `v3:founder:reject:${taskId}` });
      ledger.append("task.transition", founder, { taskId: rootId, to: "CANCELLED", outcome: { result: "REJECTED", closedBy: taskId, note } }, { idempotencyKey: `v3:founder:root-cancel:${rootId}` });
      return { closed: true };
    }
    if (action === "redirect") {
      if (String(objective ?? "").trim().length < 10) throw new OrchestrationError("INVALID_REQUEST", "a redirect says what to do instead");
      const id = childId(taskId, `redirect:${digestOf(objective).slice(0, 8)}`);
      const agent = { provider: "founder", seat: "founder", role: "ceo" };
      ledger.append("task.created", founder, { task: { ...spec({ taskId: id, rootId, objective, agent, stepKey: "request", approvalLevel: "A", depth: t.depth + 1, costUsd: 0 }), parentTaskId: taskId } }, { idempotencyKey: `v3:founder:redirect:${id}` });
      ledger.append("task.transition", founder, { taskId: id, to: "IN_PROGRESS" }, { idempotencyKey: `v3:founder:redirect-run:${id}` });
      const fa = adapters.founder ?? { provider: "founder", model: null };
      ledger.recordOutput(id, founder, { adapter: fa, isLive: isLiveAdapter(fa), result: { artifact: { brief: objective, redirectOf: taskId, note } } }, { idempotencyKey: `v3:${id}:brief` });
      ledger.append("task.transition", founder, { taskId, to: "SUPERSEDED", outcome: { result: "SUPERSEDED", supersededBy: id, by: founder.id, note } }, { idempotencyKey: `v3:founder:redirect-supersede:${taskId}` });
      return { closed: false, redirectTaskId: id };
    }
    throw new OrchestrationError("INVALID_ACTION", "approve | reject | redirect");
  }

  // ── views (small, for the mobile console) ──
  const views = {
    /** CEO Home: one row per request, with open work, cost, the pending decision and the latest summary. */
    home() {
      const s = st();
      return s.taskOrder.map((id) => s.tasks[id]).filter((t) => t.stepKey === "request" && t.taskId === t.rootTaskId).map((r) => {
        const tree = treeOf(s, r.taskId);
        const decision = tree.find((t) => t.stepKey === "decision" && t.state === "READY_FOR_APPROVAL");
        const lastEval = tree.filter((t) => ["evaluate", "plan"].includes(t.stepKey) && t.state === "DONE").at(-1);
        const mock = tree.some((t) => t.outputs.some((o) => o.mode === "MOCK"));
        return {
          taskId: r.taskId, objective: r.objective, status: v3Status(s, r), mode: mock ? "MOCK" : "LIVE",
          open: tree.filter((t) => open(t) && t.taskId !== r.taskId).length, tasks: tree.length,
          costUsd: Number(tree.reduce((n, t) => n + t.costUsd, 0).toFixed(6)),
          decision: decision ? { taskId: decision.taskId, digest: decision.inputs[0], escalation: decision.meta?.escalation ?? null } : null,
          summary: lastEval?.outputs.at(-1)?.artifact?.ceoSummary ?? null,
          nextSteps: tree.flatMap((t) => (t.outputs.at(-1)?.artifact?.suggestedNextSteps ?? []).map((x) => x.title)).slice(0, 5),
        };
      });
    },
    tree(rootId) {
      const s = st();
      return treeOf(s, rootId).map((t) => ({ taskId: t.taskId, parent: t.parentTaskId, step: t.stepKey, agent: agentKey(t.assignedAgent), status: v3Status(s, t), mode: t.outputs.at(-1)?.mode ?? null, depth: t.depth, route: t.route?.mode ?? null }));
    },
    detail(taskId) {
      const s = st();
      const t = s.tasks[taskId];
      if (!t) return null;
      return { ...t, status: v3Status(s, t), assignment: s.handoffs.find((h) => h.toTaskId === taskId)?.instructions ?? null };
    },
    activity(provider) {
      const s = st();
      return s.taskOrder.map((id) => s.tasks[id]).filter((t) => t.assignedAgent.provider === provider && t.rootTaskId).map((t) => ({ taskId: t.taskId, step: t.stepKey, status: v3Status(s, t), mode: t.outputs.at(-1)?.mode ?? null, costUsd: t.costUsd, at: t.updatedAt }));
    },
  };

  return { intake, registerWorker, claimNext, submit, step, runUntilIdle, founderDecision, sweep, views, route: (a) => route(a, { adapters, workers }) };
}
