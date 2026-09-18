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
import { deterministicAnswer, forbiddenCopyIn, verifyAnswer } from "./verifier.mjs";

/**
 * @param {object} input   { messages, context, preferences, priorEntities }
 * @param {object} deps    { provider, turn, now, liveFetch, signal, onEvent }
 */
/**
 * What ships when a clarification asks the reader how they would like to chase a loss.
 *
 * It names the boundary rather than deflecting, and it offers the thing GameTime does own, so the
 * refusal is useful instead of merely safe.
 */
export const SAFE_STAKING_REFUSAL = [
  "I can't help with stake sizing, and GameTime has no staking policy — that includes raising a stake after a loss, which is the most reliable way to turn a bad night into a worse one.",
  "",
  "What I can do is show you what GameTime's own research and published forecasts say about tonight's games, with each one's status and confidence. Ask me about a matchup, a team or a player and I'll pull the recorded data.",
].join("\n");

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
    planningPasses: 1,
    totalMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
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
    return { ok: false, code: planned.code, detail: planned.detail ?? null, providerStatus: planned.status ?? null, providerType: planned.type ?? null, providerExplain: planned.explain ?? null, providerErrorName: planned.errorName ?? null, receipt };
  }

  const plan = planned.plan;
  receipt.intent = plan.intent;

  /*
   * A CLARIFICATION IS AN ANSWER, AND IT SHORT-CIRCUITS EVERYTHING BELOW.
   *
   * No tools run, no evidence is built and the writer is never called — so a clarification costs one
   * model call and carries no numbers.
   *
   * ⚠ THAT USED TO END: "…which is why it needs no verification." It was wrong, and the sentence shows
   * exactly how: it reasons from "carries no numbers" to "needs no checking", as though numeric
   * faithfulness were the only rule. The responsible-wagering rule applies to ANY text a reader sees,
   * and a clarification is text a reader sees.
   *
   * Asked to chase a $2,000 loss, a model returned a clarification offering to "double the stake
   * across all bets" or use "recovery staking" — published verbatim, marked `verified: true`, because
   * this path skipped the check. The incumbent never phrased a clarification that way, so the hole sat
   * open behind a model that happened not to walk into it. It is provider-independent and always was.
   *
   * A clarification that breaks the copy rule is not published. There is nothing to fall back to from
   * evidence here — there is no evidence — so what ships is a fixed refusal that answers the question
   * the reader actually asked: whether GameTime will help them stake.
   */
  if (plan.needsClarification) {
    const forbidden = forbiddenCopyIn(plan.clarification);
    const text = forbidden.length ? SAFE_STAKING_REFUSAL : plan.clarification;
    receipt.verifierStatus = forbidden.length ? "CLARIFICATION_REFUSED" : "N/A_CLARIFICATION";
    if (forbidden.length) receipt.verifierViolations = forbidden;
    receipt.totalMs = Date.now() - t0;
    emit({ type: "answer_delta", text });
    return {
      ok: true,
      answer: { answerMarkdown: text, citations: [], followUps: [], links: [] },
      intent: plan.intent,
      clarification: true,
      verified: true,
      entities: state.resolvedEntities,
      receipt,
    };
  }

  /* ── EXECUTE ──────────────────────────────────────────────────────────────────────────────── */
  const toolStart = Date.now();
  let envelopes = await runPlanWithResolution(plan, executor, state, emit);
  receipt.planningPasses = 1;

  /*
   * THE SECOND PLANNING PASS — budgeted in §17 and, until the canary, never actually implemented.
   *
   * A real planner asked "what does GameTime forecast for tonight?" correctly begins with
   * getGameTimeNow, because it is told to. Then it stops: it has planned the step it was instructed
   * to plan, and the substantive call never happens. Every date-bearing question came back with the
   * clock and nothing else.
   *
   * One re-plan fixes it properly, and it is a re-plan rather than a retry: the model is called again
   * WITH what the first pass learned, so it can now name the tool it actually wanted. The trigger is
   * narrow — a plan whose calls were all PREPARATORY (the clock, an entity resolution) for an intent
   * that plainly needs more. A clarification, a genuinely single-tool answer and a refusal all skip it.
   */
  const PREPARATORY = new Set(["getGameTimeNow", "resolveEntity"]);
  const substantive = envelopes.filter((e) => !PREPARATORY.has(e.tool));
  const wantsMore = !["SITE_HELP", "NAVIGATION_HELP", "AMBIGUOUS", "UNSUPPORTED_DATA"].includes(plan.intent);

  if (!substantive.length && envelopes.length && wantsMore) {
    emit({ type: "status", text: "Checking GameTime…" });
    const again = await planWithRepair({ ...state, intent: plan.intent }, deps, receipt, { priorEvidence: buildEvidence(envelopes) });
    receipt.planningPasses = 2;
    if (again.ok && again.plan.calls.length) {
      const more = await runPlanWithResolution(again.plan, executor, state, emit);
      envelopes = [...envelopes, ...more];
    }
  }

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
async function planWithRepair(state, deps, receipt, opts = {}) {
  const system = plannerSystemPrompt();
  const user = plannerUserMessage(state, opts.priorEvidence);

  for (let attempt = 0; attempt <= ASK_BUDGET.maxLlmRetries; attempt += 1) {
    const res = await deps.provider.plan({
      system,
      // The repair instruction is APPENDED rather than replacing the prompt, so the second attempt is
      // the same request with a stricter closing line — not a different question.
      user: attempt === 0 ? user : `${user}\n\nYour previous reply could not be parsed. Reply with ONE JSON object and no other text.`,
      signal: deps.signal,
    });

    if (!res.ok) return { ok: false, code: res.code, detail: res.detail ?? null, status: res.status ?? null, type: res.type ?? null, explain: res.explain ?? null, errorName: res.errorName ?? null };
    receipt.inputTokens += res.usage?.inputTokens ?? 0;
    receipt.outputTokens += res.usage?.outputTokens ?? 0;
    /*
     * REASONING TOKENS ARE BILLED AND INVISIBLE. On a reasoning model most of a turn's output can be
     * thinking the reader never sees. They are already inside `outputTokens`, so they are not added to
     * the cost again — they are recorded separately so a cost receipt can say where the money went,
     * and so a cheap model whose real expense is reasoning cannot look cheap by accident.
     */
    receipt.reasoningTokens += res.usage?.reasoningTokens ?? 0;
    /* Which request shape the vendor actually accepted — see the Gemini adapter's shape ladder. */
    if (res.shape) receipt.providerShape = res.shape;
    receipt.cachedInputTokens += res.usage?.cachedInputTokens ?? 0;

    const parsed = parsePlan(res.text);
    if (parsed.ok) return parsed;

    // Only a MALFORMED plan is worth retrying. An unknown tool or a blown budget is a decision the
    // model made clearly and would very likely make again; retrying it just spends another call.
    if (parsed.code !== ASK_ERROR.MALFORMED_PLAN) return parsed;
  }
  return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: "the planner did not return a usable plan" };
}

/**
 * Which tools actually ANSWER each intent, as opposed to preparing for one. Derived from the registry's
 * own division of labour, not from a model's opinion, and used only as a hint on the second pass.
 */
const SUBSTANTIVE_FOR_INTENT = Object.freeze({
  FACTUAL_GAME_QUERY: ["runGameFinder"],
  FACTUAL_PLAYER_QUERY: ["getPlayerRecentGames", "runPlayerResearchQuery"],
  SEASON_QUERY: ["getSeasonExplorer"],
  TEAM_COMPARE: ["getTeamComparison"],
  PLAYER_COMPARE: ["getPlayerComparison"],
  MATCHUP_CONTEXT: ["getMatchupContext"],
  PUBLISHED_FORECAST: ["getPublishedForecasts"],
  LIVE_STATUS: ["getLiveSlate"],
  PARLAY_REQUEST: ["getParlayCandidates"],
  BANKROLL_PARLAY_REQUEST: ["getParlayCandidates"],
});

function plannerUserMessage(state, priorEvidence = null) {
  const lines = [];
  if (priorEvidence?.facts?.length) {
    /*
     * The second pass is given what the first pass LEARNED, as facts — so "today is 2026-09-17" is
     * already answered and the model can spend this plan on the question rather than on the date.
     */
    lines.push("ALREADY ESTABLISHED THIS TURN (do not call these tools again):");
    for (const f of priorEvidence.facts.slice(0, 12)) lines.push(`- ${f.text}`);
    lines.push("", "Now plan the tool call(s) that actually answer the question. Do NOT call resolveEntity or getGameTimeNow again — that work is done, and its results are above. Name the tool that produces the answer itself.");
    /*
     * THE INTENT ALREADY NAMES THE ANSWERING TOOLS, SO SAY SO.
     *
     * This is not the engine guessing a call — it picks nothing, passes no arguments and overrides
     * no decision. It restates a mapping the registry already fixes: a FACTUAL_GAME_QUERY is answered
     * by runGameFinder, and there is no second candidate. The model still chooses, and the executor
     * still validates whatever it chooses.
     *
     * It exists because the FIRST re-plan instruction was not enough for a small model: told only
     * "name the tool that produces the answer", it returned an empty plan and the reader got an honest
     * refusal to a question the product can answer perfectly well.
     */
    const expected = SUBSTANTIVE_FOR_INTENT[state.intent];
    if (expected?.length) lines.push(`For this question the tool that answers it is one of: ${expected.join(", ")}.`);
    lines.push("");
  }
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
  /* label → id, so a planner that wrote the NAME instead of the id can still be served. */
  const labels = new Map(state.resolvedEntities.filter((e) => e.id && e.label).map((e) => [`${e.kind}:${String(e.label).toLowerCase()}`, e.id]));
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
        if (!/^(team|player|opponent|game).*Id$/i.test(k) || typeof v !== "string") continue;
        const kind = /player/i.test(k) ? "player" : /team/i.test(k) ? "team" : null;
        if (!kind) continue;

        const isPlaceholder = v === "RESOLVED" || v === "${resolved}";
        /*
         * THE SAFETY NET. A planner that has not yet seen a resolution cannot know an id, so it is told
         * to write "RESOLVED". It will also sometimes write the NAME — "New York Mets" — which the slug
         * validator refuses, and the whole question then fails with INVALID_ARGUMENT for a reason the
         * reader cannot act on. When the value is plainly a name rather than an id, and this turn has
         * resolved an entity whose LABEL matches it, the id is substituted. An unmatched name still
         * fails: the point is to use a resolution that exists, never to guess one.
         */
        const looksLikeName = /\s/.test(v) || !/^[a-z]+-[a-z]+-/i.test(v);
        if (!isPlaceholder && !looksLikeName) continue;

        const byLabel = !isPlaceholder ? labels.get(`${kind}:${v.toLowerCase()}`) : null;
        const id = byLabel ?? resolved.get(kind);
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
      if (e.tool === "resolveEntity" && e.data?.entity) {
        resolved.set(e.data.entity.kind, e.data.entity.id);
        labels.set(`${e.data.entity.kind}:${String(e.data.entity.label).toLowerCase()}`, e.data.entity.id);
      }
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
  let lastRejected = null;
  let writerProviderFailure = null;
  for (let attempt = 0; attempt <= ASK_BUDGET.maxLlmRetries; attempt += 1) {
    const user = attempt === 0
      ? base
      : `${base}\n\nYour previous answer was rejected for: ${lastViolations.map((v) => v.detail).join("; ")}. Rewrite it using ONLY the evidence above. Do not include any number that is not in the evidence.`;

    const res = await deps.provider.write({ system, user, signal: deps.signal });
    if (!res.ok) {
      /*
       * ⚠ THE WRITER'S PROVIDER FAILED — WHICH IS NOT A GROUNDING FAILURE.
       *
       * This was a bare `break`, and everything below it then reported the turn as
       * `UNSUPPORTED_CLAIM` with an empty violations list. Three unrelated causes — the provider
       * refused the call, the writer returned unparseable output, the answer failed grounding — all
       * arrived at the reader and the operator wearing the label of the third.
       *
       * It sent this migration's analysis the wrong way for a while: Gemini looked like a model whose
       * WRITING fails verification a quarter of the time, when the turns in question had never
       * reached the verifier at all. Same class as the PROVIDER_ERROR that hid an unguarded property
       * read: a code that can name the wrong cause will, and every measurement taken afterwards
       * inherits the mistake.
       */
      writerProviderFailure = { code: res.code, status: res.status ?? null, type: res.type ?? null };
      break;
    }
    receipt.inputTokens += res.usage?.inputTokens ?? 0;
    receipt.outputTokens += res.usage?.outputTokens ?? 0;
    /*
     * REASONING TOKENS ARE BILLED AND INVISIBLE. On a reasoning model most of a turn's output can be
     * thinking the reader never sees. They are already inside `outputTokens`, so they are not added to
     * the cost again — they are recorded separately so a cost receipt can say where the money went,
     * and so a cheap model whose real expense is reasoning cannot look cheap by accident.
     */
    receipt.reasoningTokens += res.usage?.reasoningTokens ?? 0;
    /* Which request shape the vendor actually accepted — see the Gemini adapter's shape ladder. */
    if (res.shape) receipt.providerShape = res.shape;
    receipt.cachedInputTokens += res.usage?.cachedInputTokens ?? 0;

    const parsed = parseAnswer(res.text, evidence);
    if (!parsed.ok) {
      /*
       * TRUNCATION IS NOT DISOBEDIENCE. A writer cut off at max_tokens produces the same
       * "no JSON object" as one that wrote prose — but the fix is room, not a stricter instruction,
       * and telling a truncated model to "reply with ONE JSON object" makes the next attempt fail the
       * same way. The stop reason is recorded so the retry knows which problem it is solving.
       */
      const truncated = res.stopReason === "max_tokens";
      lastViolations = [{ code: parsed.code, detail: truncated ? `${parsed.detail} (stopped at max_tokens — the answer was cut off)` : parsed.detail }];
      receipt.writerTruncated = truncated || receipt.writerTruncated || false;
      continue;
    }

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
    lastRejected = clean;
  }

  /*
   * NAME THE CAUSE THAT ACTUALLY OCCURRED. The deterministic answer ships either way — that part was
   * always right — but what the receipt CALLS the failure decides where the next hour of diagnosis
   * goes.
   */
  receipt.verifierStatus = writerProviderFailure
    ? "FAILED_WRITER_PROVIDER"
    : lastViolations.length
      ? "FAILED_DETERMINISTIC_FALLBACK"
      : "FAILED_NO_WRITER_OUTPUT";
  receipt.errorCode = writerProviderFailure?.code ?? lastViolations[0]?.code ?? ASK_ERROR.UNSUPPORTED_CLAIM;
  if (writerProviderFailure) {
    receipt.writerProviderStatus = writerProviderFailure.status;
    receipt.writerProviderType = writerProviderFailure.type;
  }
  /* Why the writer's answer was rejected. Without this a grounding failure is a dead end. */
  receipt.verifierViolations = lastViolations.slice(0, 6).map((v) => `${v.code}: ${v.detail}`);
  /* The text that was refused. Without it "unsupported claim" names a problem nobody can see. */
  receipt.rejectedAnswer = lastRejected ? String(lastRejected).slice(0, 600) : null;
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
