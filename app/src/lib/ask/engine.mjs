/**
 * THE ASK ENGINE — one user turn, from question to verified answer.
 *
 * Pure orchestration over injected capabilities: a provider, an asset loader turn, a clock, a live
 * transport. It opens no socket and reads no file of its own, so the entire pipeline can be driven
 * offline by the fake provider and a fixture loader, and the code exercised in CI is the code that
 * runs in production.
 *
 * THE SHAPE, AND WHY EACH STAGE IS SEPARATE
 *
 *   reduce      bounded conversation state, structured — never a generated summary
 *   plan        the model chooses intent + tools, and nothing else
 *   execute     the server re-derives permission for every call and runs it
 *   evidence    tool output becomes labelled sentences with a numeric index
 *   verify      the finished answer is checked against that index
 *   write       the model composes from evidence only
 *
 * The stages are separate because each one is a place a different thing can go wrong, and a pipeline
 * whose stages are welded together can only be tested end to end — which means its failure modes can
 * only be observed, never asserted.
 *
 * THE ONE RE-PLAN (§17). A plan is allowed a second pass, and only for a reason that a second pass can
 * actually fix: a tool answered AMBIGUOUS or UNSUPPORTED, so a different tool or a clarification is
 * now the right move. It is not a retry loop, and there is no third pass.
 */
import { ASK_BUDGET, ASK_ERROR, ASK_PROMPT_VERSION, ASK_STATUS } from "./contract.mjs";
import { registryFingerprint } from "./registry.mjs";
import { makeExecutor } from "./executor.mjs";
import { buildEvidence } from "./evidence.mjs";
import { harvestEntities, reduceConversation } from "./conversation.mjs";
import { parsePlan, plannerSystemPrompt } from "./planner.mjs";
import { parseAnswer, sanitiseMarkdown, writerSystemPrompt, writerUserMessage } from "./writer.mjs";
import { deterministicAnswer, verifyAnswer } from "./verifier.mjs";

/**
 * @param {object} input   { messages, context, preferences, priorEntities }
 * @param {object} deps    { provider, turn, now, liveFetch, signal, onEvent }
 */
export async function runAskTurn(input, deps) {
  const t0 = Date.now();
  const emit = deps.onEvent ?? (() => {});
  const receipt = {
    promptVersion: ASK_PROMPT_VERSION,
    registry: registryFingerprint(),
    provider: deps.provider?.id ?? null,
    model: deps.provider?.model ?? null,
    intent: null,
    toolCalls: [],
    toolStatuses: [],
    plannerMs: 0,
    toolsMs: 0,
    writerMs: 0,
    verifierStatus: null,
    totalMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    errorCode: null,
  };

  const state = reduceConversation(input);
  const executor = makeExecutor({ turn: deps.turn, now: deps.now, liveFetch: deps.liveFetch });

  /* ── PLAN ─────────────────────────────────────────────────────────────────────────────────── */
  emit({ type: "status", text: "Working out what you need…" });
  const planStart = Date.now();
  const planned = await planWithRepair(state, deps, receipt);
  receipt.plannerMs = Date.now() - planStart;

  if (!planned.ok) {
    receipt.errorCode = planned.code;
    receipt.totalMs = Date.now() - t0;
    // The upstream status travels with the refusal so an operator can tell a bad key from a bad model.
    return { ok: false, code: planned.code, detail: planned.detail ?? null, providerStatus: planned.status ?? null, providerType: planned.type ?? null, providerExplain: planned.explain ?? null, receipt };
  }

  const plan = planned.plan;
  receipt.intent = plan.intent;

  /*
   * A CLARIFICATION IS AN ANSWER, AND IT SHORT-CIRCUITS EVERYTHING BELOW.
   *
   * No tools run, no evidence is built and the writer is never called — so a clarification costs one
   * model call, and it carries no numbers at all, which is why it needs no verification.
   */
  if (plan.needsClarification) {
    receipt.verifierStatus = "N/A_CLARIFICATION";
    receipt.totalMs = Date.now() - t0;
    emit({ type: "answer_delta", text: plan.clarification });
    return {
      ok: true,
      answer: { answerMarkdown: plan.clarification, citations: [], followUps: [], links: [] },
      intent: plan.intent,
      clarification: true,
      entities: state.resolvedEntities,
      receipt,
    };
  }

  /* ── EXECUTE ──────────────────────────────────────────────────────────────────────────────── */
  const toolStart = Date.now();
  const envelopes = await runPlanWithResolution(plan, executor, state, emit);
  receipt.toolsMs = Date.now() - toolStart;
  receipt.toolCalls = envelopes.map((e) => e.tool);
  receipt.toolStatuses = envelopes.map((e) => e.status);

  /* ── EVIDENCE ─────────────────────────────────────────────────────────────────────────────── */
  const evidence = buildEvidence(envelopes);

  /*
   * NOTHING USABLE CAME BACK. The honest answer is the deterministic one built from the refusals, not
   * a generated paragraph explaining an absence it would have to invent the shape of (§85).
   */
  if (!evidence.facts.length || envelopes.every((e) => e.status === ASK_STATUS.ERROR || e.status === ASK_STATUS.UNSUPPORTED)) {
    receipt.verifierStatus = "DETERMINISTIC_FALLBACK";
    receipt.totalMs = Date.now() - t0;
    const answer = deterministicAnswer(evidence, { intent: plan.intent });
    emit({ type: "answer_delta", text: answer.answerMarkdown });
    return { ok: true, answer, intent: plan.intent, entities: harvestEntities(envelopes), receipt, evidence: publicEvidence(evidence) };
  }

  /* ── WRITE + VERIFY ───────────────────────────────────────────────────────────────────────── */
  emit({ type: "status", text: "Putting the answer together…" });
  const writeStart = Date.now();
  const written = await writeWithVerification({ state, evidence, plan }, deps, receipt, emit);
  receipt.writerMs = Date.now() - writeStart;
  receipt.totalMs = Date.now() - t0;

  return {
    ok: true,
    answer: written.answer,
    intent: plan.intent,
    verified: written.verified,
    entities: harvestEntities(envelopes),
    receipt,
    evidence: publicEvidence(evidence),
  };
}

/* ─────────────────────────────────────  stages  ───────────────────────────────────── */

/** One plan, plus at most one repair when the model returned something unparseable (§91). */
async function planWithRepair(state, deps, receipt) {
  const system = plannerSystemPrompt();
  const user = plannerUserMessage(state);

  for (let attempt = 0; attempt <= ASK_BUDGET.maxLlmRetries; attempt += 1) {
    const res = await deps.provider.plan({
      system,
      // The repair instruction is APPENDED rather than replacing the prompt, so the second attempt is
      // the same request with a stricter closing line — not a different question.
      user: attempt === 0 ? user : `${user}\n\nYour previous reply could not be parsed. Reply with ONE JSON object and no other text.`,
      signal: deps.signal,
    });

    if (!res.ok) return { ok: false, code: res.code, detail: res.detail ?? null, status: res.status ?? null, type: res.type ?? null, explain: res.explain ?? null };
    receipt.inputTokens += res.usage?.inputTokens ?? 0;
    receipt.outputTokens += res.usage?.outputTokens ?? 0;

    const parsed = parsePlan(res.text);
    if (parsed.ok) return parsed;

    // Only a MALFORMED plan is worth retrying. An unknown tool or a blown budget is a decision the
    // model made clearly and would very likely make again; retrying it just spends another call.
    if (parsed.code !== ASK_ERROR.MALFORMED_PLAN) return parsed;
  }
  return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: "the planner did not return a usable plan" };
}

function plannerUserMessage(state) {
  const lines = [];
  if (state.history.length) {
    lines.push("EARLIER IN THIS CONVERSATION (the user's own turns):");
    for (const h of state.history) lines.push(`- ${h}`);
    lines.push("");
  }
  if (state.resolvedEntities.length) {
    lines.push("ALREADY RESOLVED (use these ids directly — do not resolve these names again):");
    for (const e of state.resolvedEntities) lines.push(`- ${e.label ?? e.id}: ${e.id} (${e.sport ?? "?"} ${e.kind})`);
    lines.push("");
  }
  if (state.wagering.riskProfile || state.wagering.entertainmentBankroll) {
    lines.push("THE USER HAS STATED:");
    if (state.wagering.riskProfile) lines.push(`- risk style ${state.wagering.riskProfile}`);
    if (state.wagering.entertainmentBankroll) lines.push(`- entertainment bankroll ${state.wagering.entertainmentBankroll}`);
    lines.push("");
  }
  lines.push(`QUESTION: ${state.question}`);
  return lines.join("\n");
}

/**
 * Run the plan, substituting resolved ids into the calls that depend on a resolution.
 *
 * A planner cannot know an id before `resolveEntity` returns one, so it writes a placeholder and an
 * `after` edge. This fills the placeholder from the resolution — and when the resolution came back
 * AMBIGUOUS it leaves the dependent call UNRUN rather than picking a candidate, so the answer asks
 * which person was meant instead of confidently describing the wrong one (§19, §118).
 */
async function runPlanWithResolution(plan, executor, state, emit) {
  const resolved = new Map(state.resolvedEntities.filter((e) => e.id).map((e) => [e.kind, e.id]));
  const out = [];
  const done = new Set();
  let guard = 0;

  while (done.size < plan.calls.length) {
    if ((guard += 1) > ASK_BUDGET.maxToolCalls + 2) break;
    const ready = plan.calls
      .filter((c) => !done.has(c.id) && (c.after ?? []).every((d) => done.has(d)))
      .slice(0, ASK_BUDGET.maxParallelTools);
    if (!ready.length) break;

    const prepared = [];
    for (const call of ready) {
      const args = { ...call.arguments };
      let blocked = false;
      for (const [k, v] of Object.entries(args)) {
        if (v !== "RESOLVED" && v !== "${resolved}") continue;
        const kind = /player/i.test(k) ? "player" : /team/i.test(k) ? "team" : null;
        const id = kind ? resolved.get(kind) : null;
        if (!id) { blocked = true; break; }
        args[k] = id;
      }
      done.add(call.id);
      if (blocked) {
        // The dependency did not produce an identity. Skipping is the correct outcome: the evidence
        // will carry the ambiguity, and the writer will ask.
        continue;
      }
      prepared.push({ ...call, arguments: args });
    }

    for (const c of prepared) emit({ type: "tool_start", tool: c.name, text: toolStatusCopy(c.name) });
    const wave = await Promise.all(prepared.map((c) => executor.run(c)));
    for (const e of wave) {
      emit({ type: "tool_complete", tool: e.tool, status: e.status });
      if (e.tool === "resolveEntity" && e.data?.entity) resolved.set(e.data.entity.kind, e.data.entity.id);
    }
    out.push(...wave);
  }
  return out;
}

/** Safe, human status copy. Never a tool's arguments, and never anything resembling reasoning (§51). */
function toolStatusCopy(name) {
  return {
    getGameTimeNow: "Checking today's date…",
    resolveEntity: "Looking that up…",
    runGameFinder: "Checking Game Finder…",
    runPlayerResearchQuery: "Reading the player's recorded games…",
    getSeasonExplorer: "Checking season records…",
    getPlayerRecentGames: "Reading recent games…",
    getTeamComparison: "Comparing teams…",
    getPlayerComparison: "Comparing players…",
    getMatchupContext: "Gathering matchup context…",
    getPublishedForecasts: "Loading published forecasts…",
    getParlayCandidates: "Checking GameTime parlay candidates…",
    getLiveSlate: "Checking live games…",
    searchGameTimeHelp: "Checking the GameTime guide…",
    calculate: "Working out the numbers…",
  }[name] ?? "Checking GameTime…";
}

/**
 * Write, verify, and — if verification fails — write once more under a stricter instruction. If it
 * fails again, publish the deterministic answer instead.
 *
 * NOTHING UNVERIFIED IS EVER EMITTED, which is also why the answer is buffered rather than streamed
 * token by token (§52). Streaming an invented number and retracting it afterwards is worse than a
 * slightly later answer: the reader has already read the number.
 */
async function writeWithVerification({ state, evidence, plan }, deps, receipt, emit) {
  const system = writerSystemPrompt();
  const base = writerUserMessage({ question: state.question, evidence, state: { resolvedEntities: state.resolvedEntities, wagering: state.wagering } });

  let lastViolations = [];
  for (let attempt = 0; attempt <= ASK_BUDGET.maxLlmRetries; attempt += 1) {
    const user = attempt === 0
      ? base
      : `${base}\n\nYour previous answer was rejected for: ${lastViolations.map((v) => v.detail).join("; ")}. Rewrite it using ONLY the evidence above. Do not include any number that is not in the evidence.`;

    const res = await deps.provider.write({ system, user, signal: deps.signal });
    if (!res.ok) break;
    receipt.inputTokens += res.usage?.inputTokens ?? 0;
    receipt.outputTokens += res.usage?.outputTokens ?? 0;

    const parsed = parseAnswer(res.text, evidence);
    if (!parsed.ok) { lastViolations = [{ code: parsed.code, detail: parsed.detail }]; continue; }

    const clean = sanitiseMarkdown(parsed.answer.answerMarkdown);
    const check = verifyAnswer(clean, evidence, { userNumbers: state.userNumbers });

    if (check.ok) {
      receipt.verifierStatus = attempt === 0 ? "PASS" : "PASS_ON_RETRY";
      const answer = { ...parsed.answer, answerMarkdown: clean };
      emit({ type: "answer_delta", text: clean });
      for (const l of answer.links) emit({ type: "citation", link: l });
      return { answer, verified: true };
    }
    lastViolations = check.violations;
  }

  receipt.verifierStatus = "FAILED_DETERMINISTIC_FALLBACK";
  receipt.errorCode = lastViolations[0]?.code ?? ASK_ERROR.UNSUPPORTED_CLAIM;
  const answer = deterministicAnswer(evidence, { intent: plan.intent });
  emit({ type: "answer_delta", text: answer.answerMarkdown });
  return { answer, verified: false, violations: lastViolations };
}

/** What the client may see of the evidence: labels and links, never tool arguments or raw payloads. */
function publicEvidence(evidence) {
  return {
    facts: evidence.facts.length,
    sources: [...new Set(evidence.items.map((i) => i.tool))],
    links: evidence.links.map((l) => ({ id: l.id, label: l.label, href: l.href })),
    unsupported: evidence.unsupported.map((u) => ({ tool: u.tool, error: u.error })),
  };
}
