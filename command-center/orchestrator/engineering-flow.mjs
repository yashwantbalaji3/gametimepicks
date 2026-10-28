/**
 * DELEGATED ENGINEERING FLOW (M2) — one real task from a ChatGPT spec to a kept or discarded change.
 *
 *   Prompt Architect (manual:chatgpt) ─ spec ─► G1 ─► Claude Code plan run (read-only) ─ plan ─► G2
 *     ─► Claude Code build run (isolated working copy) ─► Verifier (diff · scope · tests · screenshots)
 *     ─► Chief of Staff report ─► G3 keep (local commit on cc/<task>) | discard (working copy removed)
 *
 * Every gate is a founder-only decision bound to the sha256 of what it approves, and gates run in order: a plan
 * run without an approved G1, a build run without an approved G2, or a keep without verification is refused.
 *
 * Before ANY Claude Code run: the founder's billing attestation must be on record (claude.ai usage credits off or
 * capped), publishing must not be paused, the per-command usage cap must have room, and the preflight must prove
 * subscription authentication. Any failure refuses the run and says why — nothing falls back to something else.
 *
 * Pause cancels running Claude processes (SIGTERM, SIGKILL after the grace period) and blocks new runs; Emergency
 * stop does the same with SIGKILL at once. Gates that would start work are refused while paused.
 */
import path from "node:path";
import { digestOf, shortId, REPO_ROOT } from "../lib/util.mjs";
import { REASON } from "../contracts/index.mjs";
import {
  IMPLEMENTATION_PLAN_SCHEMA, ENGINEERING_RESULT_SCHEMA, RUN_LIMITS, ALLOWED_PREFIXES, validateSchema, planScope,
} from "../contracts/engineering.mjs";
import { parseManualAnswer } from "../providers/manual.mjs";
import { preflight, childEnv, resolveClaudeBin } from "../providers/claude-preflight.mjs";
import { startClaudeRun } from "../providers/claude-code-cli.mjs";
import { createWorkcopy, workcopyChanges, keepWorkcopy, discardWorkcopy, checkoutFingerprint, WORKCOPY_PATHS } from "../engineering/workcopy.mjs";
import { runTests, captureScreens } from "../engineering/verify.mjs";
import { planPrompt, buildPrompt, contextPacket } from "../engineering/prompts.mjs";

const PLAN_TOOLS = { allowed: ["Read", "Grep", "Glob"], disallowed: ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Agent"] };
const BUILD_TOOLS = {
  allowed: ["Read", "Grep", "Glob", ...ALLOWED_PREFIXES.flatMap((p) => [`Edit(${p}**)`, `Write(${p}**)`])],
  disallowed: ["Bash", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Agent"],
};
const MAX_PROGRESS_LINES = 400;
const GATE_ORDER = { G1: null, G2: "G1", G3: "G2" };

/**
 * @param {object} ctx  { store, clock, outDir, helpers: { makeTask, contribute, refuseTask, entries, isPaused, report } }
 * @param {object} cfg  { repoRoot, claudeBin, claudeEnv, home, screens, workcopyPaths, nodeModulesFrom, limits }
 */
export function createEngineeringFlow(ctx, cfg = {}) {
  const { store, clock, outDir, helpers: h } = ctx;
  const repoRoot = cfg.repoRoot ?? REPO_ROOT;
  const claudeEnv = cfg.claudeEnv ?? process.env;
  const bin = cfg.claudeBin ?? resolveClaudeBin(claudeEnv);
  const limits = cfg.limits ?? RUN_LIMITS;
  const screensOn = cfg.screens ?? true;
  /** taskId → { handle, commandId } for Claude processes that are running now */
  const active = new Map();
  const jobs = new Set();

  // ── attestation, preflight, caps ────────────────────────────────────────────────────────────────────────────
  const billing = () => h.entries().filter((e) => e.kind === "attestation" && e.data.subject === "claude-billing").at(-1)?.data ?? null;

  function attestBilling({ usageCredits, capUsd = null }, actor) {
    if (actor?.role !== "founder") return { ok: false, code: REASON.NOT_FOUNDER };
    if (!["off", "capped"].includes(usageCredits)) return { ok: false, code: "INVALID_ATTESTATION", detail: "usageCredits must be off or capped" };
    if (usageCredits === "capped" && !(Number(capUsd) >= 0)) return { ok: false, code: "INVALID_ATTESTATION", detail: "a cap needs a dollar amount" };
    const data = {
      subject: "claude-billing", usageCredits, capUsd: usageCredits === "capped" ? Number(capUsd) : null,
      statement: usageCredits === "off"
        ? "Founder confirms claude.ai usage credits (extra usage) are OFF: hitting a Max limit stops the run instead of billing."
        : `Founder confirms claude.ai usage credits are capped at $${Number(capUsd)} per month.`,
    };
    store.append("attestation", "founder", data);
    return { ok: true, ...data };
  }

  function runPreflight(commandId = null) {
    const r = preflight({ env: claudeEnv, bin, home: cfg.home });
    store.append("preflight", "orchestrator", { commandId, ok: r.ok, code: r.code ?? null, detail: r.detail ?? null, evidence: { ...r.evidence, checkedAt: clock() } });
    return r;
  }

  const estUsage = (run) => h.entries()
    .filter((e) => e.kind === "contribution" && e.data.commandId === run.commandId && e.data.seat === "cli:claude-code")
    .reduce((s, e) => s + (e.data.cost?.estUsageUsd ?? 0), 0);

  /** Every check that must pass before a real Claude Code process starts. */
  function canRun(run, mode) {
    const b = billing();
    if (!b) return { ok: false, code: REASON.BILLING_NOT_CONFIRMED, detail: "Confirm in Controls that claude.ai usage credits are off or capped before Claude Code can run." };
    if (h.isPaused()) return { ok: false, code: REASON.PAUSED, detail: "Paused — resume to let Claude Code run." };
    const next = limits[mode].maxBudgetUsd;
    if (estUsage(run) + next > limits.commandMaxEstUsageUsd) {
      return { ok: false, code: REASON.USAGE_CAP, detail: `estimated usage ${estUsage(run).toFixed(2)} + ${next} would exceed the $${limits.commandMaxEstUsageUsd} per-command cap` };
    }
    const pf = runPreflight(run.commandId);
    if (!pf.ok) return { ok: false, code: pf.code, detail: pf.detail, preflight: pf.evidence };
    return { ok: true, preflight: pf.evidence };
  }

  // ── gates ───────────────────────────────────────────────────────────────────────────────────────────────────
  function requestGate(run, gate, { subjectType, subject, question, keepAllowed = true, approveAllowed = true, warnings = [] }) {
    const decisionId = shortId("gate", { commandId: run.commandId, gate });
    const options = gate === "G3"
      ? [{ id: "keep", label: "Keep changes (local commit on the cc/ branch)", allowed: keepAllowed }, { id: "discard", label: "Discard changes", allowed: true }]
      : [{ id: "approve", label: gate === "G1" ? "Approve spec" : "Approve implementation", allowed: approveAllowed }, { id: "reject", label: "Reject", allowed: true }];
    store.append("decision-request", "chief-of-staff", {
      commandId: run.commandId, decisionId, kind: "gate", gate, question, subjectType, subject,
      subjectDigest: digestOf(subject), options, warnings,
    });
    run.eng.gates[gate] = { decisionId, subjectDigest: digestOf(subject) };
  }

  async function decideGate(request, { verdict, digest }, actor, run) {
    if (actor?.role !== "founder") return { ok: false, code: REASON.NOT_FOUNDER };
    if (!run) return { ok: false, code: "RUN_NOT_ACTIVE", detail: "this command is no longer running in this console process" };
    const option = request.options.find((o) => o.id === verdict);
    if (!option) return { ok: false, code: "UNKNOWN_OPTION", detail: verdict };
    if (!option.allowed) return { ok: false, code: request.gate === "G3" ? REASON.OUT_OF_SCOPE : REASON.PLAN_OUT_OF_SCOPE, detail: `${option.label} is not available for this ${request.gate}` };
    if (digest !== request.subjectDigest) return { ok: false, code: REASON.APPROVAL_DIGEST_MISMATCH, detail: "the decision does not match what is on record" };
    const prev = GATE_ORDER[request.gate];
    if (prev) {
      const prevDecision = h.entries().find((e) => e.kind === "decision" && e.data.commandId === request.commandId && e.data.gate === prev);
      if (prevDecision?.data?.verdict !== "approve") return { ok: false, code: REASON.GATE_ORDER, detail: `${request.gate} needs ${prev} approved first` };
    }
    const startsWork = verdict === "approve" || verdict === "keep";
    if (startsWork && h.isPaused()) return { ok: false, code: REASON.PAUSED, detail: "resume before approving work" };

    const claim = store.claim(`gate|${request.decisionId}`, { verdict });
    if (!claim.won) return { ok: true, duplicate: true, verdict: claim.record.value.verdict };
    store.append("decision", "founder", {
      decisionId: request.decisionId, commandId: request.commandId, gate: request.gate, verdict,
      approvedExactDigest: request.subjectDigest, approvedBy: actor.id ?? "founder", approvedAt: clock(),
      authentication: actor.authentication ?? "loopback-console (demo-grade)",
    });

    if (verdict === "reject") {
      job(run, async () => finishRun(run, `Stopped at ${request.gate}: you rejected the ${request.gate === "G1" ? "spec" : "plan"}. Nothing further runs.`, { discard: true }));
    } else if (request.gate === "G1") job(run, () => runPlan(run));
    else if (request.gate === "G2") job(run, () => runBuild(run));
    else if (verdict === "keep") job(run, () => keep(run));
    else job(run, () => finishRun(run, "Discarded at G3: the working copy and its branch were removed. Nothing was kept.", { discard: true }));
    return { ok: true, verdict, started: true };
  }

  // ── spec (Prompt Architect, manual seat) ────────────────────────────────────────────────────────────────────
  function onSpecPasted(run, task, text) {
    const parsed = parseManualAnswer(text, "engineering-spec");
    if (!parsed.contractValid) {
      store.append("refusal", "orchestrator", { commandId: run.commandId, taskId: task.taskId, code: REASON.SPEC_CONTRACT_INVALID, detail: `the pasted spec does not match the format — paste a corrected answer: ${parsed.errors.slice(0, 6).join("; ")}` });
      return { ok: false, code: REASON.SPEC_CONTRACT_INVALID, errors: parsed.errors };
    }
    const app = { "manual:chatgpt": "ChatGPT", "manual:claude": "Claude", "manual:grok": "Grok" }[task.seat];
    h.contribute(run, task, {
      seat: task.seat, provider: "manual", model: `${app} (your app, pasted)`,
      artifactType: "engineering-spec", artifact: parsed.artifact,
      summary: `${app} wrote the engineering spec (pasted back by you): ${parsed.artifact.objective}`,
      evidence: [{ label: "spec sha256", ref: digestOf(parsed.artifact) }], proposedNextSteps: [], simulated: false, contractValid: true,
    });
    run.eng.spec = parsed.artifact;
    run.eng.specTaskId = task.taskId;
    requestGate(run, "G1", {
      subjectType: "engineering-spec", subject: parsed.artifact,
      question: "G1 · Approve this ChatGPT spec for Claude Code to plan against?",
      warnings: billing() ? [] : [{ code: REASON.BILLING_NOT_CONFIRMED, detail: "Claude Code cannot run until you confirm usage credits in Controls." }],
    });
    return { ok: true, contractValid: true };
  }

  // ── Claude Code runs ────────────────────────────────────────────────────────────────────────────────────────
  function progress(run, task, line) {
    run.eng.progressCount = (run.eng.progressCount ?? 0) + 1;
    if (run.eng.progressCount > MAX_PROGRESS_LINES) return;
    store.append("progress", "engineering", { commandId: run.commandId, taskId: task.taskId, line });
  }

  async function claudeStep(run, task, mode, prompt, schema) {
    const gate = canRun(run, mode);
    if (!gate.ok) {
      h.refuseTask(run, task, gate.code, gate.detail);
      return null;
    }
    store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "RUNNING" });
    progress(run, task, `Preflight OK · Claude Code ${gate.preflight.cliVersion} · ${gate.preflight.authMethod} · ${gate.preflight.subscriptionType} subscription · no API key`);
    const lim = limits[mode];
    const tools = mode === "plan" ? PLAN_TOOLS : BUILD_TOOLS;
    const handle = startClaudeRun({
      bin, cwd: run.eng.wc.dir, env: childEnv(claudeEnv), prompt, schema,
      allowedTools: tools.allowed, disallowedTools: tools.disallowed,
      maxTurns: lim.maxTurns, maxBudgetUsd: lim.maxBudgetUsd, timeoutMs: lim.timeoutMs, killGraceMs: limits.killGraceMs,
      model: lim.model ?? null, effort: lim.effort ?? null, tools: mode === "plan" ? ["Read", "Grep", "Glob"] : ["Read", "Grep", "Glob", "Edit", "Write"],
      rawLogFile: path.join(outDir, "runs", `${task.taskId}.jsonl`),
      onProgress: (line) => progress(run, task, line),
    });
    active.set(task.taskId, { handle, commandId: run.commandId });
    progress(run, task, `Claude Code started (${mode === "plan" ? "read-only plan run" : "build run"}) · pid ${handle.pid} · model ${lim.model ?? "CLI default"}, effort ${lim.effort ?? "default"} · limits ${lim.maxTurns} turns, $${lim.maxBudgetUsd} est., ${Math.round(lim.timeoutMs / 60000)} min`);
    const res = await handle.done;
    active.delete(task.taskId);
    const runRecord = {
      mode, sessionId: res.sessionId, model: res.model, requestedModel: res.requestedModel, effort: res.effort,
      durationMs: res.durationMs, numTurns: res.numTurns, subtype: res.subtype, lookups: res.lookups, structuredAttempts: res.structuredAttempts,
      exitCode: res.exitCode, signal: res.signal, endedBy: res.endedBy, rawLog: `runs/${task.taskId}.jsonl`,
      preflight: gate.preflight, billedTo: "Claude subscription (claude.ai login; no API key in the run's environment)",
    };
    const cost = { tokensIn: res.usage?.inputTokens ?? 0, tokensOut: res.usage?.outputTokens ?? 0, usd: 0, estUsageUsd: res.estUsageUsd ?? 0 };
    if (!res.ok) {
      const code = res.endedBy === "AUTH_FAILED" ? REASON.SUBSCRIPTION_AUTH_NOT_CONFIRMED : res.endedBy ?? REASON.RUN_FAILED;
      // A structured answer Claude produced before the run failed is kept for diagnosis ONLY: it is labelled,
      // validated, and never becomes a contribution, a gate, or an input to the next step.
      const partialOutput = res.lastStructuredAttempt ? {
        diagnosticOnly: true,
        note: "Produced before the run failed. Not approved, not used, and cannot advance to the next gate.",
        attempts: res.structuredAttempts,
        schemaValid: validateSchema(schema, res.lastStructuredAttempt).ok,
        schemaErrors: validateSchema(schema, res.lastStructuredAttempt).errors.slice(0, 5),
        artifact: res.lastStructuredAttempt,
      } : null;
      const why = res.subtype === "error_max_budget_usd"
        ? `the $${lim.maxBudgetUsd} estimated-usage cap was reached after ${res.numTurns} turns (est. $${(res.estUsageUsd ?? 0).toFixed(2)}; ${res.lookups} file lookups; ${res.structuredAttempts} structured-output attempt(s))`
        : `Claude Code ended with ${res.subtype ?? `exit ${res.exitCode}`}`;
      store.append("refusal", "orchestrator", { commandId: run.commandId, taskId: task.taskId, code, detail: res.endedDetail ?? `${why}${res.stderrTail ? `: ${res.stderrTail.slice(-300)}` : ""}`, run: runRecord, cost, partialOutput });
      store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: code === REASON.RUN_CANCELLED ? "CANCELLED" : "FAILED", code });
      run.eng.lastUsage = cost;
      return null;
    }
    const v = validateSchema(schema, res.structured);
    if (!v.ok) {
      h.refuseTask(run, task, REASON.RUN_FAILED, `structured output did not match the schema: ${v.errors.slice(0, 5).join("; ")}`);
      return null;
    }
    return { structured: res.structured, runRecord, cost };
  }

  async function runPlan(run) {
    const task = h.makeTask(run, { role: "engineering", title: "Plan the change (Claude Code, read-only)", artifact: "implementation-plan" }, { hop: 2, parentTaskId: run.eng.specTaskId, seat: "cli:claude-code" });
    if (!run.eng.wc) {
      // Unique per run (command id + time) so a rerun never collides with a branch an earlier run kept.
      const wcId = `${run.commandId.replace(/^cmd-/, "").slice(0, 8)}-${Date.now().toString(36)}`;
      run.eng.wc = createWorkcopy({ repoRoot, taskId: wcId, paths: cfg.workcopyPaths ?? WORKCOPY_PATHS, nodeModulesFrom: cfg.nodeModulesFrom });
      progress(run, task, `Isolated working copy ready: ${path.relative(path.dirname(repoRoot), run.eng.wc.dir)} on branch ${run.eng.wc.branch} (base ${run.eng.wc.base.slice(0, 10)})`);
    }
    const specDigest = digestOf(run.eng.spec);
    const packet = contextPacket(run.eng.wc.dir);
    progress(run, task, `Context packet: approved spec + ${packet.excerpts.length} code excerpt(s) + ${packet.inventory.length} file(s) listed (${Math.round(packet.chars / 1000)}k chars), so Claude needn't explore`);
    const out = await claudeStep(run, task, "plan", planPrompt({ spec: run.eng.spec, specDigest, packet }), IMPLEMENTATION_PLAN_SCHEMA);
    if (!out) return finishRun(run, "The plan run did not complete, so nothing was implemented.", { discard: true });
    const plan = out.structured;
    const scope = planScope(plan);
    h.contribute(run, task, {
      seat: "cli:claude-code", provider: "anthropic", model: out.runRecord.model, artifactType: "implementation-plan", artifact: plan,
      summary: `Claude Code planned ${plan.files.length} file change(s): ${plan.summary}`,
      evidence: [{ label: "Claude Code session", ref: out.runRecord.sessionId }], proposedNextSteps: [], simulated: false,
      cost: out.cost, run: out.runRecord,
    });
    run.eng.plan = plan;
    run.eng.planTaskId = task.taskId;
    requestGate(run, "G2", {
      subjectType: "implementation-plan", subject: { plan, specDigest },
      question: "G2 · Approve Claude Code's plan and let it implement it in the isolated working copy?",
      approveAllowed: scope.ok,
      warnings: scope.ok ? [] : [{ code: REASON.PLAN_OUT_OF_SCOPE, detail: `the plan touches files outside the allowed paths: ${scope.outside.join(", ")}` }],
    });
  }

  async function runBuild(run) {
    const task = h.makeTask(run, { role: "engineering", title: "Implement in the isolated working copy (Claude Code)", artifact: "engineering-result" }, { hop: 2, parentTaskId: run.eng.planTaskId, seat: "cli:claude-code" });
    const prompt = buildPrompt({ spec: run.eng.spec, specDigest: digestOf(run.eng.spec), plan: run.eng.plan, planDigest: digestOf({ plan: run.eng.plan, specDigest: digestOf(run.eng.spec) }), packet: contextPacket(run.eng.wc.dir) });
    const out = await claudeStep(run, task, "build", prompt, ENGINEERING_RESULT_SCHEMA);
    if (out) {
      h.contribute(run, task, {
        seat: "cli:claude-code", provider: "anthropic", model: out.runRecord.model, artifactType: "engineering-result", artifact: out.structured,
        summary: `Claude Code reports: ${out.structured.summary}`,
        evidence: [{ label: "Claude Code session", ref: out.runRecord.sessionId }], proposedNextSteps: [], simulated: false,
        cost: out.cost, run: out.runRecord,
      });
    }
    return verify(run, { buildOk: Boolean(out) });
  }

  async function verify(run, { buildOk }) {
    const task = h.makeTask(run, { role: "verifier", title: "Verify independently: diff, scope, tests, screenshots", artifact: "verification" }, { hop: 2, parentTaskId: run.eng.planTaskId, seat: "deterministic" });
    store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "RUNNING" });
    progress(run, task, "Verifier: reading the working copy's changes");
    const changes = workcopyChanges(run.eng.wc);
    progress(run, task, `Verifier: ${changes.files.length} file(s) changed, ${changes.outOfScope.length} out of scope. Running the test suite…`);
    const tests = await runTests(run.eng.wc.dir);
    progress(run, task, `Verifier: tests ${tests.ok ? "passed" : "FAILED"} (${tests.pass} pass, ${tests.fail} fail, ${Math.round(tests.durationMs / 1000)} s)`);
    let screenshots = [];
    let screenError = null;
    if (screensOn && changes.files.length) {
      progress(run, task, "Verifier: capturing desktop, iPhone 390 and iPhone 430 screenshots of the working copy's console");
      try {
        screenshots = await captureScreens(run.eng.wc.dir, { outDir: path.join(outDir, "media"), prefix: `verify-${task.taskId}` });
      } catch (err) {
        screenError = String(err.message ?? err);
      }
    }
    const checkoutUnchanged = run.eng.fingerprint ? run.eng.fingerprint === checkoutFingerprint(repoRoot) : null;
    const verification = {
      buildOk, files: changes.files, outOfScope: changes.outOfScope,
      diff: changes.diff.length > 60_000 ? `${changes.diff.slice(0, 60_000)}\n… (truncated)` : changes.diff,
      tests: { ok: tests.ok, exitCode: tests.exitCode, pass: tests.pass, fail: tests.fail, failing: tests.failing, durationMs: tests.durationMs, tail: tests.tail, timedOut: tests.timedOut },
      screenshots, screenError, checkoutUnchanged,
      workcopy: { branch: run.eng.wc.branch, base: run.eng.wc.base, dir: path.relative(path.dirname(repoRoot), run.eng.wc.dir) },
    };
    h.contribute(run, task, {
      seat: "deterministic", provider: "deterministic", model: null, artifactType: "verification", artifact: verification,
      summary: `Independent check: ${changes.files.length} file(s) changed${changes.outOfScope.length ? `, ${changes.outOfScope.length} OUT OF SCOPE` : ", all in scope"}; tests ${tests.ok ? `passed (${tests.pass})` : `FAILED (${tests.fail} failing)`}; ${screenshots.length} screenshot(s)${screenError ? ` — screenshots failed: ${screenError.slice(0, 120)}` : ""}; your checkout ${checkoutUnchanged === false ? "CHANGED" : "unchanged"}.`,
      evidence: [], proposedNextSteps: [], simulated: false,
    });
    // Keep needs everything green: a completed build, at least one change, all of it in scope, the orchestrator's
    // own test run passing, and the founder's checkout untouched. Anything else offers Discard only.
    const keepAllowed = buildOk && changes.files.length > 0 && changes.outOfScope.length === 0 && tests.ok && checkoutUnchanged !== false;
    const warnings = [
      ...(!buildOk ? [{ code: REASON.RUN_FAILED, detail: "the build run did not complete; only Discard is offered" }] : []),
      ...(changes.outOfScope.length ? [{ code: REASON.OUT_OF_SCOPE, detail: `changed outside the allowed paths: ${changes.outOfScope.join(", ")}` }] : []),
      ...(!tests.ok ? [{ code: "TESTS_FAILED", detail: `${tests.fail} failing (Keep is unavailable): ${tests.failing.slice(0, 5).join("; ")}` }] : []),
      ...(!changes.files.length ? [{ code: "NO_CHANGES", detail: "the working copy has no changes" }] : []),
      ...(checkoutUnchanged === false ? [{ code: "CHECKOUT_CHANGED", detail: "your own checkout changed during the run, so Keep is unavailable; discard and run again" }] : []),
    ];
    report(run, verification);
    requestGate(run, "G3", {
      subjectType: "verification", subject: { verificationDigest: digestOf(verification), files: changes.files, branch: run.eng.wc.branch },
      question: "G3 · Keep these changes (a local commit on the cc/ branch, never pushed) or discard them?",
      keepAllowed, warnings,
    });
  }

  function report(run, verification) {
    const contributions = h.entries().filter((e) => e.kind === "contribution" && e.data.commandId === run.commandId).map((e) => e.data);
    const refusals = h.entries().filter((e) => e.kind === "refusal" && e.data.commandId === run.commandId).map((e) => e.data);
    const runs = contributions.filter((c) => c.run);
    h.report(run, {
      headline: verification
        ? `Delegated engineering ready for G3: ${verification.files.length} file(s) changed, tests ${verification.tests.ok ? "passing" : "FAILING"}`
        : "Delegated engineering stopped",
      lines: contributions.map((c) => `${c.role} (${c.seat}): ${c.summary}`),
      deliverables: verification ? [
        `Diff: ${verification.files.map((f) => `${f.status} ${f.file}`).join(", ") || "none"}`,
        `Tests: ${verification.tests.pass} pass, ${verification.tests.fail} fail (run by the orchestrator, not Claude)`,
        `Screenshots: ${verification.screenshots.map((s) => s.name).join(", ") || "none"}`,
        `Working copy: ${verification.workcopy.dir} on ${verification.workcopy.branch}`,
      ] : [],
      refusals: refusals.map((r) => `${r.code}: ${r.detail}`),
      warnings: [],
      decisionsNeeded: verification ? ["G3: keep the change as a local commit, or discard it."] : [],
      usage: {
        claudeRuns: runs.length,
        estUsageUsd: Number(runs.reduce((s, c) => s + (c.cost?.estUsageUsd ?? 0), 0).toFixed(4)),
        durationS: Math.round(runs.reduce((s, c) => s + (c.run?.durationMs ?? 0), 0) / 1000),
        note: "Estimated usage is Claude Code's API-equivalent figure for your Max allowance, not a charge. Cash spent: $0.",
      },
      cost: { usd: 0, note: "manual ChatGPT seat, Claude Code on your subscription, deterministic verification" },
    });
  }

  async function keep(run) {
    const task = h.makeTask(run, { role: "chief-of-staff", title: "Keep the change (local commit)", artifact: "consolidated-report" }, { hop: 1, parentTaskId: null, seat: "fake" });
    try {
      const sha = keepWorkcopy(run.eng.wc, { message: `command-center: ${run.eng.spec.objective.slice(0, 60)}\n\nDelegated via the CEO Command Center (${run.commandId}). Spec by ChatGPT (G1), plan and implementation by Claude Code (G2), verified and kept by the founder (G3). Local only; not pushed.` });
      store.append("deliverable", "chief-of-staff", { commandId: run.commandId, kind: "kept", branch: run.eng.wc.branch, commit: sha, dir: path.relative(path.dirname(repoRoot), run.eng.wc.dir) });
      store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "DONE" });
      finishRun(run, `Kept: commit ${sha.slice(0, 10)} on local branch ${run.eng.wc.branch}. Not pushed, not merged into your branch.`, { discard: false });
    } catch (err) {
      h.refuseTask(run, task, REASON.OUT_OF_SCOPE, String(err.message ?? err));
    }
  }

  function finishRun(run, headline, { discard }) {
    if (discard && run.eng.wc) {
      discardWorkcopy({ repoRoot, wc: run.eng.wc });
      store.append("deliverable", "chief-of-staff", { commandId: run.commandId, kind: "discarded", branch: run.eng.wc.branch });
    }
    h.report(run, { headline, lines: [], deliverables: [], refusals: [], warnings: [], decisionsNeeded: [], final: true });
    run.eng.finished = true;
    h.release(run);
  }

  // ── jobs, pause, stop ───────────────────────────────────────────────────────────────────────────────────────
  function job(run, fn) {
    const p = (async () => {
      try {
        await fn();
      } catch (err) {
        store.append("refusal", "orchestrator", { commandId: run.commandId, code: REASON.RUN_FAILED, detail: String(err.message ?? err) });
      }
    })();
    jobs.add(p);
    p.finally(() => jobs.delete(p));
    return p;
  }

  async function whenIdle() {
    while (jobs.size) await Promise.allSettled([...jobs]);
  }

  /** Stop every running Claude process. Pause: graceful (SIGTERM, then SIGKILL after the grace). Emergency: SIGKILL now. */
  function cancelAll({ immediate = false, reason }) {
    const n = active.size;
    for (const { handle } of active.values()) handle.cancel(reason, { immediate });
    return n;
  }

  return {
    attestBilling, billing, runPreflight, onSpecPasted, decideGate, cancelAll, whenIdle,
    activeRuns: () => [...active.entries()].map(([taskId, a]) => ({ taskId, commandId: a.commandId, pid: a.handle.pid })),
    start(run) {
      run.eng = { gates: {}, fingerprint: safeFingerprint(repoRoot) };
    },
  };
}

function safeFingerprint(repoRoot) {
  try {
    return checkoutFingerprint(repoRoot);
  } catch {
    return null;
  }
}
