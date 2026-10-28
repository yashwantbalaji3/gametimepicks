/**
 * THE ORCHESTRATOR — the only component that dispatches work, and the only writer of the ledger.
 *
 * A CEO command becomes: a command record → the Chief of Staff's visible plan → tasks (TaskEnvelopes) run one at a
 * time by role → contributions → proposals checked by policy (hop limit, task cap, allowed delegations) → a
 * consolidated report and digest-bound decision requests. Roles never call each other; a proposal the policy
 * refuses becomes a recorded refusal that the CEO sees, not a silent drop.
 *
 * State is event-sourced: everything the console shows is rebuilt from the append-only ledger by state(), and a
 * command still in flight is rebuilt from the ledger too (getRun → rehydrate), so the orchestrator can live in a
 * stateless function or a short-lived worker (H0).
 *
 * EXECUTION MODES
 *   inline  (local console, tests): every step runs in this process, as in Phase 1 / M2.
 *   jobs    (hosted): steps that need the repository, a browser or Claude Code — recap facts/rendering, Claude
 *           plan/build/verify, keep/discard — are recorded as `job` entries and returned by takeOutbox() for the
 *           host to dispatch AFTER its ledger flush commits (an outbox: no job exists that the ledger doesn't).
 *           A worker then calls runJob(jobId) against the same ledger. Light steps (manual seats, fake seats, gates,
 *           pause/stop) still run in the request.
 *
 * Surfaces (console today; Discord and MCP later) call exactly five methods: handleCommand, decide, submitManual,
 * setSeat, state. None of them can publish without a founder approval bound to the exact bundle digest, and the
 * publisher re-checks pause, approval and budget at the send boundary.
 */
import path from "node:path";
import { digestOf, shortId, REPO_ROOT, CC_ROOT } from "../lib/util.mjs";
import { REASON, validateContribution, validateTaskEnvelope } from "../contracts/index.mjs";
import { ROLES, roleTitle } from "../roles/roles.mjs";
import { parseIntent, planFor } from "./intents.mjs";
import { budgetUsd, checkDelegation, checkFounder, MAX_TASKS_PER_COMMAND } from "./policy.mjs";
import { resolveSeat } from "../providers/registry.mjs";
import { parseManualAnswer } from "../providers/manual.mjs";
import { inspectSlate, buildRecapDraft } from "../recap/pipeline.mjs";
import { runIntegrityGate } from "../recap/integrity-gate.mjs";
import { publishAtBoundary } from "../publishers/publisher.mjs";
import { createMockPublisher } from "../publishers/mock.mjs";
import { createEngineeringFlow } from "./engineering-flow.mjs";
import { createTeamFlow, isTeamIntent } from "./team-flow.mjs";
import { apiSeat, executionOf, providerStatus, testProvider } from "../providers/catalog.mjs";
import { specFacts } from "../engineering/prompts.mjs";

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const ZERO_COST = Object.freeze({ tokensIn: 0, tokensOut: 0, usd: 0 });
const DETERMINISTIC_ROLES = new Set(["integrity-reviewer", "creative-renderer"]);
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

/**
 * @param {{ store: object, clock: () => string, env?: object, repoRoot?: string, outDir: string,
 *           stepDelayMs?: number, publisher?: object, slateDate?: string, engineering?: object }} opts
 *   slateDate pins the NFL slate (Eastern date) the recap uses; default is the latest settled one.
 *   engineering configures delegated engineering (repo, claude binary, environment, screenshots) — see
 *   engineering-flow.mjs; tests point it at a throwaway repo and a fake `claude`.
 */
export function createOrchestrator({ store, clock, env = {}, repoRoot = REPO_ROOT, outDir, stepDelayMs = 0, publisher, slateDate, engineering = {}, execution = "inline", runnerId = "local", providerFetch = globalThis.fetch, providerSleep, hosted = false, calendarDataSource = null, queueRender = true, queueTemplate = "v2.1" }) {
  if (!["inline", "jobs"].includes(execution)) throw new Error(`unknown execution mode ${execution}`);
  const pub = publisher ?? createMockPublisher({ clock });
  const mediaDir = path.join(outDir, "media");
  /** commandId → run state for commands still in flight (a cache: getRun() rebuilds from the ledger when absent) */
  const runs = new Map();
  /** Jobs recorded in this session, waiting for the host to dispatch them after it flushes. */
  const outbox = [];
  /** True while this process is executing a job as a worker: everything runs here, nothing is re-dispatched. */
  let inWorker = false;
  const deferHeavy = () => execution === "jobs" && !inWorker;

  function requestJob(job) {
    const jobId = shortId("job", { ...job, at: clock() });
    store.append("job", "orchestrator", { jobId, status: "requested", ...job });
    outbox.push({ jobId, ...job });
    return jobId;
  }

  const flow = createEngineeringFlow({
    store, clock, outDir,
    execution: { deferred: () => deferHeavy(), requestJob: (job) => requestJob(job) },
    helpers: {
      makeTask: (...a) => makeTask(...a),
      contribute: (...a) => contribute(...a),
      refuseTask: (...a) => refuseTask(...a),
      entries: () => entries(),
      isPaused: () => isPaused(),
      report: (run, data) => store.append("report", "chief-of-staff", { commandId: run.commandId, ...data }),
      release: (run) => runs.delete(run.commandId),
    },
  }, engineering);

  const team = createTeamFlow({
    store, clock, env, repoRoot, slateDate, outDir, dataSource: calendarDataSource, queueRender, queueTemplate, fetch: providerFetch, sleep: providerSleep, engineering: flow,
    execution: { deferred: () => deferHeavy(), requestJob: (job) => requestJob(job), jobDone: (id) => jobDone(id) },
    helpers: {
      makeTask: (...a) => makeTask(...a),
      contribute: (...a) => contribute(...a),
      refuseTask: (...a) => refuseTask(...a),
      entries: () => entries(),
      isPaused: () => isPaused(),
      seatOf: (role) => seatOf(role),
      latestStatus: (id) => latestStatus(id),
      report: (run, data) => store.append("report", "chief-of-staff", { commandId: run.commandId, ...data }),
    },
  });

  // ── derived facts from the ledger ────────────────────────────────────────────────────────────────────────────
  const entries = () => store.list();
  const isPaused = () => {
    const last = entries().filter((e) => e.kind === "control").at(-1);
    return Boolean(last?.data?.paused);
  };
  const spentUsd = () => entries().filter((e) => e.kind === "contribution").reduce((s, e) => s + (e.data.cost?.usd ?? 0), 0);
  const seatOf = (role) => {
    const last = entries().filter((e) => e.kind === "seat-change" && e.data.role === role).at(-1);
    return last?.data?.seat ?? ROLES[role].defaultSeat;
  };

  // ── commands ────────────────────────────────────────────────────────────────────────────────────────────────
  async function handleCommand(text, actor) {
    const intent = parseIntent(text);
    if (intent === "pause" || intent === "resume") return setPaused(intent === "pause", actor, text);

    // The same words on the same day are one command — except a content queue, which is rebuilt when the data moves on.
    let key = `command|${etDay(clock())}|${String(text).trim().toLowerCase()}`;
    if (intent === "daily-queue") {
      try { key += `|data:${team.dataSource().commit ?? "working-tree"}`; } catch { /* no data source: the build step refuses */ }
    }
    const commandId = shortId("cmd", key);
    const claim = store.claim(key, { commandId });
    if (!claim.won) return { ok: true, commandId: claim.record.value.commandId, duplicate: true };

    store.append("command", "founder", { commandId, text, intent, surface: actor?.surface ?? "console" });
    if (intent === "status") {
      const s = state();
      store.append("report", "chief-of-staff", {
        commandId,
        headline: "Status",
        lines: [
          `Publishing is ${s.paused ? "PAUSED" : "enabled (mock only)"}.`,
          `${s.decisions.filter((d) => !d.resolution).length} decision(s) waiting for you.`,
          `Spend this period: $${s.budget.spentUsd} of $${s.budget.limitUsd}.`,
        ],
        deliverables: [], refusals: [], warnings: [], decisionsNeeded: [],
      });
      return { ok: true, commandId };
    }

    const plan = planFor(intent);
    store.append("plan", "chief-of-staff", {
      commandId,
      intent,
      steps: plan.map((s, i) => ({ n: i + 1, role: s.role, roleTitle: roleTitle(s.role), title: s.title, seat: s.seat ?? (s.role === "chief-of-staff" ? "fake" : seatOf(s.role)), via: s.via ?? null, after: s.after ?? null, gate: s.gate ?? null })),
      limits: { maxHops: 3, maxTasks: MAX_TASKS_PER_COMMAND, budgetUsd: budgetUsd(env) },
      simulated: true,
    });

    const run = { commandId, text, intent, plan: plan.map((s) => ({ ...s, created: false })), queue: [], tasks: [], doneRoles: new Set(), ctx: {} };
    runs.set(commandId, run);
    if (intent === "engineering-task") {
      // The spec must come from a real assistant you operate: the Prompt Architect sits on a manual seat here,
      // whatever its default, so a simulated spec can never reach Claude Code.
      run.kind = "engineering";
      flow.start(run);
      const seat = seatOf("prompt-architect").startsWith("manual:") ? seatOf("prompt-architect") : "manual:chatgpt";
      enqueue(run, run.plan[0], { hop: 1, parentTaskId: null, seat });
      await drain(run);
      return { ok: true, commandId };
    }
    if (isTeamIntent(intent)) {
      run.kind = "team";
      await team.advance(run);
      return { ok: true, commandId };
    }
    for (const step of run.plan) {
      if (!step.via && !step.after) enqueue(run, step, { hop: 1, parentTaskId: null });
    }
    await drain(run);
    return { ok: true, commandId };
  }

  function enqueue(run, step, opts) {
    const envelope = makeTask(run, step, opts);
    run.queue.push(envelope);
    return envelope;
  }

  /** Create and record a task (QUEUED). The engineering flow runs its tasks directly instead of queueing them. */
  function makeTask(run, step, { hop, parentTaskId, seat = null }) {
    step.created = true;
    const role = step.role;
    const n = run.tasks.length + 1;
    const envelope = {
      taskId: shortId("task", { commandId: run.commandId, role, n }),
      commandId: run.commandId,
      parentTaskId,
      hop,
      ownerRole: role,
      seat: seat ?? step.seat ?? (DETERMINISTIC_ROLES.has(role) ? "deterministic" : role === "chief-of-staff" ? "fake" : seatOf(role)),
      title: step.title,
      inputDigest: digestOf({ text: run.text, role, parentTaskId }),
      expectedArtifactType: step.artifact,
      acceptanceCriteria: acceptanceFor(role),
      budget: { tokens: ROLES[role].budget.tokens, usd: ROLES[role].budget.usd },
    };
    const v = validateTaskEnvelope(envelope);
    if (!v.ok) throw new Error(`invalid task envelope: ${v.errors.join(", ")}`);
    run.tasks.push(envelope);
    store.append("task", "orchestrator", { ...envelope, status: "QUEUED" });
    return envelope;
  }

  /** Run queued tasks until the queue is empty or every remaining task waits on the founder. */
  /** Recap steps that read repository data or render with a browser: worker-only in jobs mode. */
  const isHeavy = (run, task) => run.intent === "nfl-recap" && ["engineering", "integrity-reviewer", "creative-renderer"].includes(task.ownerRole);

  async function drain(run) {
    while (run.queue.length) {
      if (deferHeavy() && isHeavy(run, run.queue[0])) {
        // Everything from here on (facts, gate, render, then social and the report that use them) runs in one worker.
        if (!entries().some((e) => e.kind === "job" && e.data.commandId === run.commandId && e.data.type === "drive" && e.data.status === "requested" && !jobDone(e.data.jobId))) {
          requestJob({ type: "drive", commandId: run.commandId });
        }
        return;
      }
      const task = run.queue.shift();
      await sleep(stepDelayMs);
      store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "RUNNING" });
      try {
        await runTask(run, task);
      } catch (err) {
        store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "FAILED", error: String(err.message ?? err) });
        run.doneRoles.add(task.ownerRole);
      }
      scheduleFollowOns(run);
    }
    const waiting = run.tasks.some((t) => latestStatus(t.taskId) === "AWAITING_INPUT");
    if (!waiting && run.kind !== "engineering") runs.delete(run.commandId);
  }

  const jobDone = (jobId) => entries().some((e) => e.kind === "job" && e.data.jobId === jobId && ["finished", "failed", "cancelled"].includes(e.data.status));

  /** The run for a command: from this process's cache, or rebuilt from the ledger (stateless hosts). */
  function getRun(commandId) {
    if (runs.has(commandId)) return runs.get(commandId);
    const all = entries();
    const cmd = all.find((e) => e.kind === "command" && e.data.commandId === commandId);
    if (!cmd || !planFor(cmd.data.intent)) return null;
    const run = { commandId, text: cmd.data.text, intent: cmd.data.intent, plan: planFor(cmd.data.intent).map((s) => ({ ...s, created: false })), queue: [], tasks: [], doneRoles: new Set(), ctx: {} };
    const latest = new Map();
    for (const e of all) {
      if (e.kind !== "task" || e.data.commandId !== commandId) continue;
      if (e.data.status === "QUEUED" && e.data.ownerRole) {
        const { status, ...envelope } = e.data;
        run.tasks.push(envelope);
      }
      latest.set(e.data.taskId, e.data.status);
    }
    for (const t of run.tasks) {
      const st = latest.get(t.taskId);
      // A task left RUNNING belonged to a worker that was cancelled mid-step; recap steps are deterministic, so redo it.
      if (st === "QUEUED" || (st === "RUNNING" && cmd.data.intent !== "engineering-task")) run.queue.push(t);
      if (["DONE", "REFUSED", "FAILED", "CANCELLED"].includes(st)) run.doneRoles.add(t.ownerRole);
    }
    for (const step of run.plan) {
      step.created = run.tasks.some((t) => t.ownerRole === step.role)
        || all.some((e) => e.kind === "refusal" && e.data.commandId === commandId && e.data.toRole === step.role && e.data.fromRole === step.via);
    }
    if (isTeamIntent(cmd.data.intent)) run.kind = "team";
    if (cmd.data.intent === "engineering-task") {
      run.kind = "engineering";
      flow.rehydrate(run);
      if (run.eng.finished) return null;
    }
    runs.set(commandId, run);
    return run;
  }

  function latestStatus(taskId) {
    return entries().filter((e) => e.kind === "task" && e.data.taskId === taskId).at(-1)?.data?.status;
  }

  /** Plan steps that wait on another role ("after") or are reached through one ("via") become tasks here. */
  function scheduleFollowOns(run) {
    for (const step of run.plan) {
      if (step.created) continue;
      if (step.after && run.doneRoles.has(step.after) && allChainsSettled(run)) {
        enqueue(run, step, { hop: 1, parentTaskId: null });
      } else if (step.via && run.doneRoles.has(step.via)) {
        const from = run.tasks.find((t) => t.ownerRole === step.via);
        delegate(run, from, step.role, "per the Chief of Staff's plan", step);
      }
    }
  }

  /** An "after" step waits until nothing is queued and no task is still waiting on the founder's pasted answer. */
  const allChainsSettled = (run) => run.queue.length === 0 && !run.tasks.some((t) => latestStatus(t.taskId) === "AWAITING_INPUT");

  function delegate(run, fromTask, toRole, why, planStep = null) {
    const d = checkDelegation({ fromRole: fromTask.ownerRole, toRole, hop: fromTask.hop, tasksSoFar: run.tasks.length });
    if (!d.ok) {
      store.append("refusal", "orchestrator", { commandId: run.commandId, taskId: fromTask.taskId, fromRole: fromTask.ownerRole, toRole, code: d.code, detail: d.detail, proposal: why });
      if (planStep) planStep.created = true;
      return null;
    }
    const step = planStep ?? { role: toRole, title: why, artifact: ROLES[toRole].produces[0] };
    return enqueue(run, step, { hop: d.hop, parentTaskId: fromTask.taskId });
  }

  function processProposals(run, task, proposals) {
    for (const p of proposals ?? []) {
      const planStep = run.plan.find((s) => !s.created && s.role === p.toRole && s.via === task.ownerRole) ?? null;
      delegate(run, task, p.toRole, p.why, planStep);
    }
  }

  // ── running one task ────────────────────────────────────────────────────────────────────────────────────────
  async function runTask(run, task) {
    const role = task.ownerRole;
    if (role === "chief-of-staff") return consolidate(run, task);
    if (role === "integrity-reviewer") return reviewIntegrity(run, task);
    if (role === "creative-renderer") return renderDraft(run, task);

    let facts = { intent: run.intent, commandText: run.text };
    if (run.kind === "engineering" && role === "prompt-architect") facts = specFacts(run.text, CC_ROOT);
    if (role === "engineering") facts = engineeringFacts(run);
    if (role === "social-strategy") facts = socialFacts(run);

    const seat = resolveSeat(task.seat, { env, spentUsd: spentUsd() });
    if (!seat.ok) return refuseTask(run, task, seat.code, seat.detail);
    const out = await seat.runner.run({ task, roleTitle: roleTitle(role), facts });
    if (out.awaitingInput) {
      store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "AWAITING_INPUT", prompt: out.prompt, app: seat.runner.app });
      return;
    }
    contribute(run, task, {
      seat: task.seat, provider: out.provider, model: out.model ?? null,
      artifactType: out.artifactType, artifact: out.artifact, summary: out.summary,
      evidence: evidenceFor(run, role), proposedNextSteps: out.proposedNextSteps ?? [], simulated: true,
    });
  }

  function contribute(run, task, c) {
    const contribution = { taskId: task.taskId, role: task.ownerRole, cost: { ...ZERO_COST }, ...c };
    const v = validateContribution(contribution);
    if (!v.ok) return refuseTask(run, task, "INVALID_CONTRIBUTION", v.errors.join(", "));
    store.append("contribution", task.ownerRole, { commandId: run.commandId, ...contribution });
    store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "DONE" });
    run.doneRoles.add(task.ownerRole);
    processProposals(run, task, contribution.proposedNextSteps);
  }

  function refuseTask(run, task, code, detail) {
    store.append("refusal", "orchestrator", { commandId: run.commandId, taskId: task.taskId, role: task.ownerRole, code, detail });
    store.append("task", "orchestrator", { taskId: task.taskId, commandId: run.commandId, status: "REFUSED", code });
    run.doneRoles.add(task.ownerRole);
  }

  function engineeringFacts(run) {
    const slate = inspectSlate({ repoRoot, date: slateDate });
    const eligible = slate.games.filter((g) => g.verdict.pass);
    const chosen = [...eligible].sort((a, b) => b.eventStart.localeCompare(a.eventStart) || b.eventId.localeCompare(a.eventId))[0] ?? null;
    run.ctx.slate = slate;
    run.ctx.chosen = chosen;
    return {
      slateDate: slate.slateDate,
      ledger: slate.ledger,
      games: slate.games.map((g) => ({ eventId: g.eventId, matchup: g.matchup, pass: g.verdict.pass, refusals: g.verdict.refusals.map((r) => r.code) })),
      chosen: chosen ? { eventId: chosen.eventId, matchup: chosen.matchup } : null,
    };
  }

  function socialFacts(run) {
    const games = (run.ctx.slate?.games ?? []).map((g) => {
      const w = g.candidate.winner;
      return {
        eventId: g.eventId, matchup: g.matchup, pass: g.verdict.pass,
        confidence: w?.probability ?? 0,
        pct: w ? `${(Math.round(w.probability * 1000) / 10).toFixed(1)}%` : null,
        result: w?.measurement?.directionalResult ?? null,
      };
    });
    return { games, chosen: run.ctx.chosen ? { eventId: run.ctx.chosen.eventId, matchup: run.ctx.chosen.matchup } : { eventId: "-", matchup: "none" } };
  }

  function evidenceFor(run, role) {
    if (role === "engineering" && run.ctx.slate) return [{ label: "Forecast Ledger", ref: `${run.ctx.slate.ledger.path}@${run.ctx.slate.ledger.sha256.slice(0, 12)}` }];
    return [];
  }

  function reviewIntegrity(run, task) {
    const chosen = run.ctx.chosen;
    if (!chosen) return refuseTask(run, task, REASON.MISSING_CLAIM, "no eligible game on the slate");
    const verdict = runIntegrityGate(chosen.candidate);
    run.ctx.verdict = verdict;
    contribute(run, task, {
      seat: "deterministic", provider: "deterministic", model: null,
      artifactType: "integrity-verdict",
      artifact: { eventId: chosen.eventId, pass: verdict.pass, refusals: verdict.refusals, warnings: verdict.warnings },
      summary: verdict.pass
        ? `PASS for ${chosen.matchup}: published forecast of record, frozen before kickoff, settled CANONICAL. ${verdict.warnings.length} warning(s) carried to your decision.`
        : `REFUSED ${chosen.matchup}: ${verdict.refusals.map((r) => r.code).join(", ")}`,
      evidence: [{ label: "receipt", ref: chosen.candidate.receiptPath }],
      proposedNextSteps: [],
      simulated: false,
    });
  }

  async function renderDraft(run, task) {
    const chosen = run.ctx.chosen;
    if (!chosen || !run.ctx.verdict?.pass) return refuseTask(run, task, REASON.MISSING_CLAIM, "nothing passed the integrity gate");
    const draft = await buildRecapDraft(chosen.candidate, { outDir: mediaDir });
    run.ctx.draft = draft;
    store.append("deliverable", "creative-renderer", {
      commandId: run.commandId, kind: "graphic", eventId: chosen.eventId,
      file: path.basename(draft.media.file), sha256: draft.media.sha256, width: draft.media.width, height: draft.media.height,
      template: draft.media.template, altText: draft.media.altText,
    });
    store.append("deliverable", "creative-renderer", {
      commandId: run.commandId, kind: "captions", eventId: chosen.eventId,
      variants: draft.captionSet.variants.map((v) => ({ ...v, check: draft.captionChecks.find((c) => c.id === v.id) })),
      seat: "fake", simulated: true,
    });
    contribute(run, task, {
      seat: "deterministic", provider: "deterministic", model: null,
      artifactType: "media-artifact",
      artifact: { media: draft.media, factBundleDigest: draft.factBundleDigest, captionSetDigest: draft.captionSetDigest, captionChecks: draft.captionChecks },
      summary: `Rendered ${draft.media.width}×${draft.media.height} ${draft.media.template} for ${chosen.matchup}; 2 template captions, validator ${draft.captionChecks.every((c) => c.ok) ? "green" : "RED"}.`,
      evidence: [{ label: "fact bundle", ref: `sha256:${draft.factBundleDigest.slice(0, 12)}` }],
      proposedNextSteps: [{ toRole: "engineering", why: "Also produce a 1080×1920 vertical variant for Reels/TikTok." }],
      simulated: false,
    });
  }

  function consolidate(run, task) {
    const cmdEntries = entries().filter((e) => e.data?.commandId === run.commandId);
    const contributions = cmdEntries.filter((e) => e.kind === "contribution").map((e) => e.data);
    const refusals = cmdEntries.filter((e) => e.kind === "refusal").map((e) => e.data);
    const draft = run.ctx.draft;
    const lines = contributions.map((c) => `${roleTitle(c.role)} (${c.seat}): ${c.summary}`);
    const decisionsNeeded = [];
    if (draft) {
      const decisionId = shortId("dec", { commandId: run.commandId, event: draft.bundle.eventId });
      const options = draft.captionSet.variants.map((v) => {
        const pb = draft.publishBundles.find((p) => p.bundle.captionId === v.id);
        return { captionId: v.id, tone: v.tone, text: v.text, check: draft.captionChecks.find((c) => c.id === v.id), publishBundle: pb.bundle, digest: pb.digest };
      });
      store.append("decision-request", "chief-of-staff", {
        commandId: run.commandId,
        decisionId,
        kind: "approve-publish",
        question: `Approve one caption with the ${draft.bundle.teams.away.abbr} @ ${draft.bundle.teams.home.abbr} graphic for publishing on X?`,
        publisher: pub.name,
        channel: "x",
        media: { file: path.basename(draft.media.file), sha256: draft.media.sha256, altText: draft.media.altText },
        options,
        recommended: "A",
        warnings: draft.verdict.warnings,
        note: "Phase 1: the publisher is a mock. Approving records a digest-bound approval and returns a mock receipt; nothing leaves this machine.",
      });
      decisionsNeeded.push(`Approve caption A or B for ${draft.headline} (mock publish).`);
    }
    const report = {
      commandId: run.commandId,
      headline: draft ? `Recap draft ready for your review: ${draft.headline}` : `${contributions.length} contribution(s) ready for your review`,
      lines,
      deliverables: draft ? [`Graphic ${path.basename(draft.media.file)} (${draft.media.width}×${draft.media.height})`, "Captions A (factual) and B (narrative), validator green"] : [],
      refusals: refusals.map((r) => `${r.code}: ${r.detail}${r.proposal ? ` (proposal: ${r.proposal})` : ""}`),
      warnings: (draft?.verdict?.warnings ?? []).map((w) => `${w.code}: ${w.detail}`),
      decisionsNeeded,
      cost: { usd: contributions.reduce((s, c) => s + (c.cost?.usd ?? 0), 0), note: "fake, manual and deterministic seats only" },
    };
    store.append("report", "chief-of-staff", report);
    contribute(run, task, {
      seat: "fake", provider: "fake", model: null,
      artifactType: "consolidated-report", artifact: report,
      summary: report.headline, evidence: [], proposedNextSteps: [], simulated: true,
    });
  }

  function acceptanceFor(role) {
    return {
      "prompt-architect": ["Objective, constraints, dependencies, tests and acceptance criteria are all present."],
      "product-strategist": ["A recommendation with rationale and risks."],
      "engineering": ["Every game on the slate is gated; refusals carry reason codes; one game is chosen by a stated rule."],
      "integrity-reviewer": ["Pass only on a published, pregame-frozen, settled CANONICAL forecast of record."],
      "creative-renderer": ["PNG is 1080×1350; both captions pass the validator."],
      "social-strategy": ["Angles come only from games that passed the gate."],
      "chief-of-staff": ["One report: done, blocked, decisions needed."],
      "verifier": ["Diff, scope, tests and screenshots produced by the orchestrator itself, not by the engineer."],
    }[role] ?? ["Artifact matches its contract."];
  }

  // ── founder actions ─────────────────────────────────────────────────────────────────────────────────────────
  function setPaused(paused, actor, text = null) {
    const f = checkFounder(paused ? "pause" : "resume", actor);
    if (!f.ok) return { ok: false, ...f };
    store.append("control", "founder", { paused, text });
    const stopped = paused ? flow.cancelAll({ reason: "Paused by the founder" }) : 0;
    if (!paused && execution === "jobs") resumeJobs();
    return { ok: true, paused, stoppedRuns: stopped, cancelJobs: paused ? activeJobs() : [] };
  }

  /** Emergency stop: pause everything and SIGKILL every running Claude Code process immediately. */
  function emergencyStop(actor) {
    const f = checkFounder("pause", actor);
    if (!f.ok) return { ok: false, ...f };
    store.append("control", "founder", { paused: true, emergency: true, text: "Emergency stop" });
    const stopped = flow.cancelAll({ reason: "Emergency stop", immediate: true });
    return { ok: true, paused: true, stoppedRuns: stopped, cancelJobs: activeJobs() };
  }

  async function decide({ decisionId, verdict, captionId, digest, note, sourcesConfirmed, availabilityConfirmed }, actor) {
    const f = checkFounder(verdict === "approve" ? "approve" : "reject", actor);
    if (!f.ok) return { ok: false, ...f };
    const request = entries().find((e) => e.kind === "decision-request" && e.data.decisionId === decisionId)?.data;
    if (!request) return { ok: false, code: "UNKNOWN_DECISION", detail: decisionId };
    if (request.kind === "gate") return flow.decideGate(request, { verdict, digest }, actor, getRun(request.commandId));
    if (request.kind === "proposal") return team.decideProposal(request, { verdict, digest, note }, actor);
    if (request.kind === "post") return team.decidePost(request, { verdict, captionId, digest, note, sourcesConfirmed, availabilityConfirmed }, actor);

    if (verdict !== "approve") {
      const claim = store.claim(`decision|${decisionId}`, { verdict, note: note ?? null });
      if (claim.won) store.append("decision", "founder", { decisionId, commandId: request.commandId, verdict, note: note ?? null });
      return { ok: true, verdict: claim.record.value.verdict, duplicate: !claim.won };
    }

    const option = request.options.find((o) => o.captionId === captionId);
    if (!option) return { ok: false, code: "UNKNOWN_OPTION", detail: captionId };
    if (digest !== option.digest) {
      store.append("refusal", "orchestrator", { commandId: request.commandId, decisionId, code: REASON.APPROVAL_DIGEST_MISMATCH, detail: "the approval does not match the bundle on record" });
      return { ok: false, code: REASON.APPROVAL_DIGEST_MISMATCH };
    }
    const approval = { verdict: "approve", captionId, approvedExactDigest: option.digest, approvedBy: actor.id ?? "founder", approvedAt: clock(), authentication: actor.authentication ?? "loopback-console (demo-grade)" };
    const claim = store.claim(`decision|${decisionId}`, approval);
    if (claim.won) store.append("decision", "founder", { decisionId, commandId: request.commandId, ...approval });
    const recorded = claim.record.value;
    if (recorded.verdict !== "approve") return { ok: false, code: "ALREADY_DECIDED", detail: recorded.verdict };
    const bound = request.options.find((o) => o.captionId === recorded.captionId);

    const spent = spentUsd();
    const result = await publishAtBoundary({
      provider: pub, store, bundle: bound.publishBundle, approval: recorded,
      paused: isPaused(), budgetRemainingUsd: Math.max(0, budgetUsd(env) - spent),
    });
    if (!result.ok) {
      store.append("refusal", "publisher", { commandId: request.commandId, decisionId, code: result.code, detail: result.detail });
      return { ok: false, code: result.code, detail: result.detail, approved: true };
    }
    if (!result.duplicate) store.append("publish-receipt", "publisher", { commandId: request.commandId, decisionId, ...result.receipt });
    return { ok: true, receipt: result.receipt, duplicate: result.duplicate || !claim.won };
  }

  async function submitManual(taskId, text, actor) {
    const f = checkFounder("change-seat", actor);
    if (!f.ok) return { ok: false, ...f };
    const taskEntry = entries().find((e) => e.kind === "task" && e.data.taskId === taskId && e.data.status === "QUEUED");
    const run = taskEntry ? getRun(taskEntry.data.commandId) : null;
    if (!run || latestStatus(taskId) !== "AWAITING_INPUT") return { ok: false, code: "NOT_AWAITING", detail: taskId };
    const task = run.tasks.find((t) => t.taskId === taskId);
    if (run.kind === "engineering" && task.ownerRole === "prompt-architect") return flow.onSpecPasted(run, task, text);
    if (run.kind === "team") return team.onPasted(run, task, text);
    const parsed = parseManualAnswer(text, task.expectedArtifactType);
    const app = { "manual:chatgpt": "ChatGPT", "manual:claude": "Claude", "manual:grok": "Grok" }[task.seat];
    contribute(run, task, {
      seat: task.seat, provider: "manual", model: `${app} (your subscription, pasted by hand)`,
      artifactType: task.expectedArtifactType, artifact: parsed.artifact,
      summary: parsed.contractValid
        ? `${app} answer pasted back; meets the ${task.expectedArtifactType} contract.`
        : `${app} answer pasted back but does NOT meet the contract: ${parsed.errors.join("; ")}. Recorded as-is.`,
      evidence: [], proposedNextSteps: [], simulated: false,
      contractValid: parsed.contractValid,
    });
    scheduleFollowOns(run);
    await drain(run);
    return { ok: true, contractValid: parsed.contractValid };
  }

  /** Founder: after posting an approved post by hand — schedule it, record its X link (the receipt), or its engagement. */
  function recordPost(body, actor) {
    const f = checkFounder("publish", actor);
    if (!f.ok) return { ok: false, ...f };
    return team.recordPost(body ?? {}, actor);
  }

  /** Founder: approve a graphic design version (template + asset manifest). Never approves a post. */
  function approveDesign(body, actor) {
    const f = checkFounder("approve", actor);
    if (!f.ok) return { ok: false, ...f };
    return team.approveDesign({ template: body?.template, assetManifest: body?.assetManifest }, actor);
  }

  /** Founder: run a provider connection test (free endpoints only) and record the result — never the credential. */
  async function testProviderConnection(seat, actor) {
    const f = checkFounder("change-seat", actor);
    if (!f.ok) return { ok: false, ...f };
    if (!["api:openai", "api:xai"].includes(seat)) return { ok: false, code: "NO_TEST", detail: `${seat} has no connection test` };
    const r = await testProvider(seat, { env, entries: entries(), now: clock(), fetch: providerFetch, sleep: providerSleep });
    store.append("provider-test", "founder", r);
    return { ok: r.ok, ...r };
  }

  function setSeat(role, seat, actor) {
    const f = checkFounder("change-seat", actor);
    if (!f.ok) return { ok: false, ...f };
    if (!ROLES[role]) return { ok: false, code: "UNKNOWN_ROLE" };
    if (seat === "api:openai" || seat === "api:xai") {
      // A metered seat is selectable only once it is configured, capped and tested (providers/catalog.mjs).
      const api = apiSeat(seat, { env, entries: entries(), now: clock() });
      if (!api.ok) return { ok: false, code: REASON.SEAT_NOT_ENABLED, detail: `${api.code}: ${api.detail} — ${api.founderAction}` };
      if (!ROLES[role].seatOptions.includes(seat)) return { ok: false, code: "SEAT_NOT_OFFERED", detail: `${role} offers ${ROLES[role].seatOptions.join(", ")}` };
      store.append("seat-change", "founder", { role, seat });
      return { ok: true };
    }
    const resolved = resolveSeat(seat, { env, spentUsd: spentUsd() });
    if (!resolved.ok) {
      store.append("refusal", "orchestrator", { role, seat, code: resolved.code, detail: resolved.detail });
      return { ok: false, code: resolved.code, detail: resolved.detail };
    }
    if (!ROLES[role].seatOptions.includes(seat)) return { ok: false, code: "SEAT_NOT_OFFERED", detail: `${role} offers ${ROLES[role].seatOptions.join(", ")}` };
    store.append("seat-change", "founder", { role, seat });
    return { ok: true };
  }

  // ── read model ──────────────────────────────────────────────────────────────────────────────────────────────
  function state() {
    const all = entries();
    const byCommand = new Map();
    const commands = [];
    for (const e of all) {
      if (e.kind === "command") {
        const c = { ...e.data, at: e.at, plan: null, tasks: new Map(), contributions: [], refusals: [], deliverables: [], reports: [], progress: [] };
        byCommand.set(e.data.commandId, c);
        commands.push(c);
        continue;
      }
      const c = byCommand.get(e.data?.commandId);
      if (!c) continue;
      if (e.kind === "plan") c.plan = e.data;
      else if (e.kind === "task") c.tasks.set(e.data.taskId, { ...(c.tasks.get(e.data.taskId) ?? {}), ...e.data, updatedAt: e.at });
      else if (e.kind === "contribution") c.contributions.push({ ...e.data, execution: executionOf(e.data.seat), at: e.at });
      else if (e.kind === "refusal") c.refusals.push({ ...e.data, at: e.at });
      else if (e.kind === "deliverable") c.deliverables.push({ ...e.data, at: e.at });
      else if (e.kind === "report") c.reports.push({ ...e.data, at: e.at });
      else if (e.kind === "progress") c.progress.push({ taskId: e.data.taskId, line: e.data.line, at: e.at });
    }
    const decisions = all.filter((e) => e.kind === "decision-request" && e.data.kind !== "post").map((e) => {
      const d = e.data;
      const resolution = all.find((x) => x.kind === "decision" && x.data.decisionId === d.decisionId)?.data ?? null;
      const receipt = all.find((x) => x.kind === "publish-receipt" && x.data.decisionId === d.decisionId)?.data ?? null;
      const blocked = all.filter((x) => x.kind === "refusal" && x.data.decisionId === d.decisionId).at(-1)?.data ?? null;
      return { ...d, at: e.at, resolution, receipt, blocked: receipt ? null : blocked };
    });
    const seats = Object.fromEntries(Object.keys(ROLES).map((r) => [r, { seat: DETERMINISTIC_ROLES.has(r) || r === "publisher" || r === "verifier" ? "deterministic" : seatOf(r), options: ROLES[r].seatOptions, title: ROLES[r].title }]));
    const lastPreflight = all.filter((e) => e.kind === "preflight").at(-1) ?? null;
    const lastControl = all.filter((e) => e.kind === "control").at(-1)?.data ?? null;
    const claudeUsage = all.filter((e) => e.kind === "contribution" && e.data.seat === "cli:claude-code")
      .reduce((a, e) => ({ runs: a.runs + 1, estUsageUsd: a.estUsageUsd + (e.data.cost?.estUsageUsd ?? 0), durationMs: a.durationMs + (e.data.run?.durationMs ?? 0) }), { runs: 0, estUsageUsd: 0, durationMs: 0 });
    return {
      phase: "Phase 1 · local · dry run",
      paused: isPaused(),
      budget: { limitUsd: budgetUsd(env), spentUsd: spentUsd() },
      publisher: { name: pub.name, network: pub.capabilities().network },
      seats,
      providers: providerStatus({ env, entries: all, now: clock(), hosted }),
      commands: commands.map((c) => ({ ...c, tasks: [...c.tasks.values()] })),
      decisions,
      posts: team.posts(),
      design: team.design(),
      inventory: team.inventory(),
      engineering: {
        billing: flow.billing(),
        lastPreflight: lastPreflight ? { ...lastPreflight.data, at: lastPreflight.at } : null,
        activeRuns: flow.activeRuns(),
        activeJobs: activeJobs(),
        execution,
        emergency: Boolean(lastControl?.paused && lastControl?.emergency),
        claudeUsage,
        limits: { plan: "20 turns · $1 est. · 10 min", build: "40 turns · $3 est. · 15 min", perCommand: "$5 est." },
      },
      history: all.map((e) => ({ at: e.at, kind: e.kind, actor: e.actor, line: historyLine(e) })),
    };
  }

  /** Jobs dispatched or started but not finished: what Pause/Stop must cancel on the runner side. */
  function activeJobs() {
    const all = entries();
    const live = new Map();
    for (const e of all) {
      if (e.kind !== "job" || !["dispatched", "started"].includes(e.data.status) || jobDone(e.data.jobId)) continue;
      const prev = live.get(e.data.jobId);
      live.set(e.data.jobId, { jobId: e.data.jobId, runner: e.data.runner ?? prev?.runner ?? null, runId: e.data.runId ?? prev?.runId ?? null });
    }
    return [...live.values()];
  }

  /** The host records where it sent a job (e.g. the GitHub Actions run id) so Stop can cancel it before it starts. */
  function jobDispatched(job, { runner, runId = null, ok = true, detail = null }) {
    store.append("job", "host", { jobId: job.jobId, commandId: job.commandId, type: job.type, status: ok ? "dispatched" : "dispatch-failed", runner, runId, error: ok ? undefined : detail });
  }

  /** After Pause/Stop cancelled a job's runner: it will never report back, so close it in the ledger. */
  function jobCancelled(job, reason) {
    const data = entries().find((e) => e.kind === "job" && e.data.jobId === job.jobId)?.data;
    if (!data || jobDone(job.jobId)) return;
    store.append("job", "host", { jobId: job.jobId, commandId: data.commandId, type: data.type, status: "cancelled", runner: job.runner ?? null, runId: job.runId ?? null, error: reason });
    if (data.type !== "drive" && data.type !== "team") {
      // An engineering step's working copy lived on the cancelled runner: this delegated task ends here, as a paused
      // local run does. Nothing was kept; the founder can send the objective again.
      store.append("report", "chief-of-staff", { commandId: data.commandId, headline: `${reason}: the ${data.type} job was cancelled on its runner. Nothing was kept.`, lines: [], deliverables: [], refusals: [], warnings: [], decisionsNeeded: [], final: true });
    }
  }

  /** Resume (jobs mode): re-request the recap drives and team steps that Pause cancelled. */
  function resumeJobs() {
    const all = entries();
    const cancelled = all.filter((e) => e.kind === "job" && ["drive", "team"].includes(e.data.type) && e.data.status === "cancelled");
    for (const c of cancelled) {
      const later = all.some((e) => e.kind === "job" && e.data.type === c.data.type && e.data.commandId === c.data.commandId && e.data.status === "requested" && e.at >= c.at && !jobDone(e.data.jobId));
      const run = later ? null : getRun(c.data.commandId);
      if (run && c.data.type === "team") requestJob({ type: "team", commandId: c.data.commandId });
      else if (run && run.queue.length) requestJob({ type: "drive", commandId: c.data.commandId });
    }
  }

  /**
   * Execute one recorded job in this process (the worker side of jobs mode). Idempotent: a job can only be
   * started once (a claim), so a duplicated dispatch is harmless.
   * @param {string} jobId
   * @param {{ runId?: string|null }} [meta]   e.g. the GitHub Actions run id, so Stop can cancel it
   */
  async function runJob(jobId, meta = {}) {
    const job = entries().find((e) => e.kind === "job" && e.data.jobId === jobId && e.data.status === "requested")?.data;
    if (!job) return { ok: false, code: "UNKNOWN_JOB", detail: jobId };
    if (jobDone(jobId)) return { ok: false, code: "JOB_ALREADY_DONE", detail: jobId };
    if (isPaused()) {
      // Paused between dispatch and start: close it; Resume re-requests recap drives.
      jobCancelled({ jobId, runner: runnerId, runId: meta.runId ?? null }, "Paused before the job started");
      return { ok: false, code: "PAUSED", detail: jobId };
    }
    const c = store.claim(`job|${jobId}|start`, { runnerId });
    if (!c.won) return { ok: false, code: "JOB_ALREADY_STARTED", detail: jobId };
    store.append("job", "worker", { jobId, commandId: job.commandId, type: job.type, status: "started", runner: runnerId, runId: meta.runId ?? null });
    if (meta.commitStart) {
      // Make the start claim durable before doing any work, so two runners given the same job can't both work.
      try {
        await meta.commitStart();
      } catch (err) {
        if (err.code === "CLAIM_CONFLICT") return { ok: false, code: "JOB_ALREADY_STARTED", detail: jobId };
        throw err;
      }
    }
    inWorker = true;
    try {
      const run = getRun(job.commandId);
      if (!run) throw new Error(`command ${job.commandId} is not active`);
      if (job.type === "drive") await drain(run);
      else if (job.type === "team") await team.advance(run);
      else await flow.executeStep(run, job.type);
      store.append("job", "worker", { jobId, commandId: job.commandId, type: job.type, status: "finished" });
      return { ok: true };
    } catch (err) {
      store.append("job", "worker", { jobId, commandId: job.commandId, type: job.type, status: "failed", error: String(err.message ?? err) });
      return { ok: false, code: "JOB_FAILED", detail: String(err.message ?? err) };
    } finally {
      inWorker = false;
    }
  }

  return {
    handleCommand, decide, recordPost, approveDesign, submitManual, setSeat, testProviderConnection, setPaused, emergencyStop, state, runJob, activeJobs, jobDispatched, jobCancelled,
    /** Jobs recorded by this session; the host dispatches them after its ledger flush commits. */
    takeOutbox: () => outbox.splice(0),
    execution,
    attestBilling: (a, actor) => flow.attestBilling(a, actor),
    runPreflight: () => flow.runPreflight(null),
    whenIdle: () => flow.whenIdle(),
  };
}

function historyLine(e) {
  const d = e.data ?? {};
  switch (e.kind) {
    case "command": return `CEO: "${d.text}" → intent ${d.intent}`;
    case "plan": return `Plan: ${d.steps.map((s) => s.roleTitle).join(" → ")}`;
    case "task": return `${d.status}${d.ownerRole ? ` ${roleTitle(d.ownerRole)} (hop ${d.hop}, seat ${d.seat})` : ""} ${d.taskId}${d.code ? ` [${d.code}]` : ""}${d.error ? `: ${d.error}` : ""}`;
    case "contribution": return `${roleTitle(d.role)} → ${d.artifactType} [${d.seat}, $${d.cost?.usd ?? 0}]`;
    case "refusal": return `REFUSED ${d.code}: ${d.detail}`;
    case "deliverable": return `Deliverable: ${d.kind}${d.file ? ` ${d.file}` : ""}${d.commit ? ` ${d.branch} @ ${d.commit.slice(0, 10)}` : ""}`;
    case "decision-request": return `Decision requested: ${d.question}`;
    case "decision": return `Founder ${d.verdict}${d.gate ? ` at ${d.gate}` : ""}${d.postId ? ` post ${d.postId}` : ""}${d.captionId ? ` caption ${d.captionId}` : ""}${d.approvedExactDigest ? ` (digest ${d.approvedExactDigest.slice(0, 12)})` : ""}${d.note ? `: “${d.note}”` : ""}`;
    case "publish-receipt": return d.provider === "manual-handoff" ? `Founder posted on X by hand: ${d.canonicalUrl} (${d.postId})` : `Published (${d.provider}): ${d.providerPostId}`;
    case "post-status": return `Founder scheduled ${d.postId} for ${d.scheduledFor} (in X)`;
    case "engagement": return `Engagement for ${d.postId} (founder-entered): ${Object.entries(d.metrics ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}`;
    case "design-approval": return `Founder approved the graphic design ${d.template} (${d.assetManifest}) — design only, no post`;
    case "post-verification": return `After kickoff, ${d.postId}: ${d.status} — ${d.reasons?.[0] ?? ""}`;
    case "control": return d.emergency ? "EMERGENCY STOP by founder: all Claude Code runs killed, everything paused" : `${d.paused ? "PAUSED" : "RESUMED"} by founder (publishing and Claude Code runs)`;
    case "progress": return `· ${d.line}`;
    case "preflight": return d.ok ? `Preflight OK: Claude Code ${d.evidence?.cliVersion} · ${d.evidence?.authMethod} · ${d.evidence?.subscriptionType}` : `Preflight REFUSED: ${d.detail}`;
    case "attestation": return `Founder attestation: ${d.statement}`;
    case "job": return `Job ${d.type} ${d.status}${d.runner ? ` on ${d.runner}` : ""}${d.error ? `: ${d.error}` : ""}`;
    case "auth": return `Auth: ${d.event}${d.detail ? ` (${d.detail})` : ""}`;
    case "provider-test": return `Provider test ${d.integration}: ${d.ok ? "OK" : "FAILED"} (${d.detail})`;
    case "report": return `Report: ${d.headline}`;
    case "seat-change": return `Seat: ${roleTitle(d.role)} → ${d.seat}`;
    default: return e.kind;
  }
}
