/**
 * THE PLANNER CONTRACT — what a model is allowed to have decided, and how a malformed decision is
 * turned into a refusal rather than into a guess.
 *
 * The planner's whole job is ROUTING: which intent is this, which canonical entities are involved, and
 * which approved tools answer it. It produces no sports values and reads no data, so the worst a bad
 * plan can do is call the wrong tool — which the executor will then validate anyway. That containment
 * is the reason planning is allowed to be a language-model task at all.
 *
 * MALFORMED OUTPUT IS EXPECTED, NOT EXCEPTIONAL (§91). Models emit trailing prose around JSON, fence
 * it in markdown, invent a key, or return a tool name that does not exist. `parsePlan` handles the
 * mechanical cases (fences, surrounding text) and REFUSES the semantic ones. There is no `eval`, no
 * permissive coercion, and no "best effort" repair that turns an unknown tool into a nearby one.
 */
import { ASK_BUDGET, ASK_ERROR, ASK_INTENTS } from "./contract.mjs";
import { ASK_TOOL_NAMES, providerToolList } from "./registry.mjs";

/**
 * @typedef {object} PlanOutput
 * @property {string}  intent                one of ASK_INTENTS
 * @property {boolean} needsClarification    true only when a missing input CHANGES the tool call
 * @property {string|null} clarification     the single question to ask, when it does
 * @property {Array<{id:string,name:string,arguments:object,after:string[]}>} calls
 */

/**
 * Extract a JSON object from whatever the model actually returned.
 *
 * Deliberately narrow: strip a markdown fence, then take the outermost balanced `{…}`. It does not try
 * to repair broken JSON — a model that produced invalid JSON produced an unreliable plan, and the
 * correct response is one retry with a stricter instruction, not a heuristic reconstruction of what it
 * might have meant.
 */
export function extractJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const start = unfenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i += 1) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(unfenced.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Validate a parsed plan. Returns the NORMALISED plan or a refusal — never the model's object.
 *
 * Tool ARGUMENTS are not validated here. That is the executor's job, and doing it in one place means
 * there is exactly one answer to "is this call permitted", reached by exactly one piece of code, on
 * every path including the ones that bypass the planner.
 */
export function validatePlan(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: "not an object" };
  }

  const intent = String(parsed.intent ?? "").toUpperCase();
  if (!ASK_INTENTS.includes(intent)) {
    return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: `unknown intent ${intent.slice(0, 40)}` };
  }

  const needsClarification = parsed.needsClarification === true;
  const clarification = needsClarification && typeof parsed.clarification === "string"
    ? parsed.clarification.trim().slice(0, 400)
    : null;
  if (needsClarification && !clarification) {
    return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: "clarification requested without a question" };
  }

  const rawCalls = Array.isArray(parsed.calls) ? parsed.calls : [];
  if (rawCalls.length > ASK_BUDGET.maxToolCalls) {
    return { ok: false, code: ASK_ERROR.BUDGET_EXCEEDED, detail: `${rawCalls.length} calls > ${ASK_BUDGET.maxToolCalls}` };
  }

  const seen = new Set();
  const calls = [];
  for (const [i, c] of rawCalls.entries()) {
    if (!c || typeof c !== "object") return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: `call ${i} is not an object` };
    const name = String(c.name ?? "");
    // An unknown tool is refused HERE TOO, before the executor, so the refusal names the plan rather
    // than presenting as a mysterious empty result. Both checks exist; neither is redundant.
    if (!ASK_TOOL_NAMES.includes(name)) return { ok: false, code: ASK_ERROR.UNKNOWN_TOOL, detail: name.slice(0, 40) };

    const id = typeof c.id === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(c.id) ? c.id : `c${i}`;
    if (seen.has(id)) return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: `duplicate call id ${id}` };
    seen.add(id);

    const after = Array.isArray(c.after) ? c.after.filter((d) => typeof d === "string").slice(0, 4) : [];
    const args = c.arguments && typeof c.arguments === "object" && !Array.isArray(c.arguments) ? c.arguments : {};
    calls.push({ id, name, arguments: args, after });
  }

  // A dependency naming a call that does not exist would silently never become ready, and the executor
  // would stop with that call unrun. Refuse the plan instead of half-executing it.
  for (const c of calls) {
    for (const d of c.after) {
      if (!seen.has(d)) return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: `call ${c.id} depends on unknown ${d}` };
    }
  }

  if (!needsClarification && calls.length === 0 && intent !== "SITE_HELP" && intent !== "AMBIGUOUS" && intent !== "UNSUPPORTED_DATA") {
    /*
     * A FACTUAL INTENT WITH NO TOOL CALL IS THE TOOL-FIRST VIOLATION ITSELF (§9). It is the shape a
     * plan takes when the model has decided it already knows the answer. Refused at the contract, so
     * the violation cannot reach the writer at all.
     */
    return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: `intent ${intent} produced no tool call` };
  }

  return { ok: true, plan: { intent, needsClarification, clarification, calls } };
}

/** Parse + validate in one step. */
export function parsePlan(text) {
  const parsed = extractJson(text);
  if (!parsed) return { ok: false, code: ASK_ERROR.MALFORMED_PLAN, detail: "no JSON object in the response" };
  return validatePlan(parsed);
}

/**
 * THE PLANNER SYSTEM PROMPT.
 *
 * Kept operational and short (§92). It does not contain the architecture, the tool schemas (those are
 * passed as structured tool definitions) or any sports data. Every rule here is ALSO enforced in code
 * somewhere downstream — the prompt exists to make the model's first attempt correct, not to be the
 * thing that keeps it correct.
 */
export function plannerSystemPrompt() {
  return [
    ...plannerPromptHead(),
    "",
    "YOUR TOOLS — these are the only tools that exist. There are no others.",
    ...renderToolCatalogue(),
    "",
    "Reply with ONE JSON object and nothing else:",
    '{"intent":"…","needsClarification":false,"clarification":null,"calls":[{"id":"c0","name":"…","arguments":{…},"after":[]}]}',
  ].join("\n");
}

/**
 * THE TOOL CATALOGUE, RENDERED INTO THE PROMPT.
 *
 * ⚠ THIS WAS THE BUG THE CANARY FOUND. `providerToolList()` was written, exported, and never called:
 * the prompt instructed the model to "never plan a call to a tool that is not in your tool list", and
 * the model was never given a list. Asked for recorded games it invented `getSeasonStats`; asked for
 * recent player form, `getPlayerRecentPerformance`; asked for parlays, `getParlayRecommendations`.
 * Every one was refused by the executor — the boundary held perfectly — but the answer was a refusal
 * instead of an answer, on six of twenty canary cases.
 *
 * No offline test could catch it. The fake provider is a keyword router that never reads a catalogue,
 * so it routed correctly while the real model was guessing at names.
 *
 * Generated from the registry, so the names and arguments the model is shown are by construction the
 * ones the executor enforces.
 */
function renderToolCatalogue() {
  return providerToolList().map((t) => {
    const args = Object.entries(t.input_schema.properties);
    const required = new Set(t.input_schema.required ?? []);
    const params = args.length
      ? args.map(([k, p]) => `${k}${required.has(k) ? "*" : ""}: ${p.enum ? p.enum.join("|") : p.type}`).join(", ")
      : "no arguments";
    return `- ${t.name}(${params})\n    ${t.description}`;
  });
}

function plannerPromptHead() {
  return [
    "You are the planner for Ask GameTime, the assistant inside the GameTimePicks sports research product.",
    "",
    "Your ONLY job is to decide: the intent, whether a clarification is genuinely needed, and which approved tools to call.",
    "You never state a sports fact, a score, a statistic, a forecast, a probability or a price. You produce a plan.",
    "",
    "RULES",
    "- Any question about a real game, player, team, season, forecast, live state, parlay candidate or the product itself requires a tool call. You do not know these things.",
    "- Questions containing 'today', 'tonight', 'now', 'current' or 'this weekend' start with getGameTimeNow, AND then also call the tool that actually answers the question in the SAME plan. getPublishedForecasts, getParlayCandidates and getLiveSlate default to today's product date on their own — you do not need the date before calling them.",
    "- A team or player NAME must go through resolveEntity before any tool that takes an id. Use `after` to sequence it.",
    "- Ask for clarification ONLY when the missing input changes which tool you call or which entity you mean. Never ask a question you could answer by calling a tool.",
    "- If the user asks for parlays and has stated no risk preference, set needsClarification and ask for their risk style (Low, Medium, High or Longshot) and, optionally, an entertainment bankroll. Do not demand a bankroll.",
    "- If the product cannot answer something (EPL club results, UFC numeric stats, NFL live state, NFL 2026 player logs), choose intent UNSUPPORTED_DATA and call searchGameTimeHelp so the answer can explain the gap.",
    "- Never plan a call to a tool that is not in your tool list. There are no other tools.",
    "",
    `INTENTS: ${ASK_INTENTS.join(", ")}`,
  ];
}

/** The structured tool list, generated from the registry so the model and the server cannot disagree. */
export const plannerTools = providerToolList;
