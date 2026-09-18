/**
 * THE WRITER CONTRACT — what the answering model is given, what it may return, and why its input is
 * sentences rather than data.
 *
 * The writer receives the EVIDENCE BUNDLE: a numbered list of explicit, already-interpreted statements
 * ("E3.2 · on 2026-09-15 the New York Mets scored 5 and allowed 7 against the Baltimore Orioles — a
 * loss"). It does not receive tuples, raw rows, or the tool payloads. That is the single most
 * load-bearing decision in the whole writing stage: a model handed `["NYM",5,7,"L"]` must decide what
 * those positions mean, and it will decide fluently and sometimes wrongly. A model handed a sentence
 * has nothing left to infer — it has something to restate.
 *
 * It also receives no conversation history beyond the reduced state, no system internals, no prompts
 * from other stages, and no tool schemas. There is nothing in its context to leak.
 */
import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { extractJson } from "./planner.mjs";

/**
 * @typedef {object} WriteOutput
 * @property {string}   answerMarkdown   a small, safe markdown subset
 * @property {string[]} citations        evidence fact ids the answer rests on
 * @property {string[]} followUps        at most three suggested next questions
 * @property {string[]} linkIds          ids from the evidence's own link list — never URLs
 */

/** Validate the writer's structured output. Returns the normalised answer or a refusal. */
export function parseAnswer(text, evidence) {
  const parsed = extractJson(text);
  if (!parsed) return { ok: false, code: ASK_ERROR.MALFORMED_ANSWER, detail: "no JSON object in the response" };

  const answerMarkdown = typeof parsed.answerMarkdown === "string" ? parsed.answerMarkdown.trim() : "";
  if (!answerMarkdown) return { ok: false, code: ASK_ERROR.MALFORMED_ANSWER, detail: "empty answer" };
  if (answerMarkdown.length > 8000) return { ok: false, code: ASK_ERROR.MALFORMED_ANSWER, detail: "answer too long" };

  const factIds = new Set((evidence?.facts ?? []).map((f) => f.id));
  const citations = (Array.isArray(parsed.citations) ? parsed.citations : [])
    .filter((c) => typeof c === "string" && factIds.has(c))
    .slice(0, 20);

  /*
   * LINKS ARE RESOLVED BY ID, NEVER ACCEPTED AS URLS (§59, §99). The model names a link the evidence
   * already carries; the href comes from the evidence. A model that emits an href instead of an id
   * simply gets no link — there is no code path that turns model-authored text into an anchor.
   */
  const byId = new Map((evidence?.links ?? []).map((l) => [l.id, l]));
  let links = (Array.isArray(parsed.linkIds) ? parsed.linkIds : [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 5);

  /*
   * IF THE MODEL NAMED NO LINK, ATTACH THE EVIDENCE'S OWN.
   *
   * The production smoke caught the parlay answer shipping with no "Open in Parlay Lab" — not because
   * the link was unavailable, but because the model simply did not list its id that time. It did on the
   * next identical request. A reader's route into the underlying product should not depend on the model
   * remembering to mention it.
   *
   * These are the links the TOOLS returned, already approved by the same registry the validator
   * checks, so attaching them adds nothing the answer was not entitled to — it just stops a useful
   * thing being dropped at random. De-duplicated by href, because several tools legitimately point at
   * the same page.
   */
  if (!links.length && (evidence?.links ?? []).length) {
    const seen = new Set();
    links = evidence.links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))).slice(0, 3);
  }

  const followUps = (Array.isArray(parsed.followUps) ? parsed.followUps : [])
    .filter((f) => typeof f === "string" && f.trim().length > 0 && f.length < 120)
    .map((f) => f.trim())
    .slice(0, ASK_BUDGET.maxFollowUps);

  return { ok: true, answer: { answerMarkdown, citations, followUps, links } };
}

/**
 * THE WRITER SYSTEM PROMPT.
 *
 * Every rule below is also enforced by the verifier or by a contract. That redundancy is deliberate and
 * the ordering matters: the prompt makes the first attempt right, the code makes the published answer
 * right. Neither is trusted alone, and the prompt is never the last line of defence (§56, §147).
 */
export function writerSystemPrompt() {
  return [
    "You are Ask GameTime, the analyst inside the GameTimePicks sports research product.",
    "",
    "You are given EVIDENCE: numbered statements produced by GameTime's own tools. Write the answer from that evidence and nothing else.",
    "",
    "HARD RULES",
    "- Every number you write must appear in the evidence. Do not compute, estimate, round beyond the evidence, or recall a figure. If a number is not in the evidence, do not write it.",
    "- Do not add a sports fact, score, statistic, date or result that the evidence does not state. You have no knowledge of sport outside this evidence.",
    "- Keep GameTime FORECASTS and RECORDED FACTS separate, and say which you are giving.",
    "- If the evidence says a market is PAUSED, you may explain the pause. You must not give a pick for it.",
    "- If the evidence says a forecast is EXPERIMENTAL, say so.",
    "- If a tool could not answer, say plainly that GameTimePicks does not have that data, and offer what it does have. Never fill the gap from memory and never suggest searching the web.",
    "- Never claim expected value, profitability, an edge over the book, or that anything is guaranteed, safe, a lock or free money. GameTime publishes no price-aware expected value.",
    "- Never advise recovering a loss, increasing a stake after losses, borrowing, or any staking amount. GameTime has no staking policy.",
    "- If the evidence says correlation is not modelled for a candidate, do not describe its legs as independent.",
    "- Never write a URL. Reference links by their evidence link id in `linkIds`.",
    "",
    "STYLE",
    "- Lead with the answer. Be direct, sports-literate and concise. No preamble, no 'As an AI', no long disclaimers before the useful part.",
    "- State a limitation once, where it matters, and move on.",
    "- Include the data's own 'as of' time when the evidence gives one and the question is about the present.",
    "",
    "Reply with ONE JSON object and nothing else:",
    '{"answerMarkdown":"…","citations":["E1.1"],"followUps":["…"],"linkIds":["E1:lab"]}',
  ].join("\n");
}

/** Render the evidence bundle as the writer's user message. Bounded, and sentences only. */
export function writerUserMessage({ question, evidence, state }) {
  const lines = [`QUESTION: ${question}`];

  if (state?.resolvedEntities?.length) {
    lines.push("", "ESTABLISHED IN THIS CONVERSATION:");
    for (const e of state.resolvedEntities.slice(0, 6)) lines.push(`- ${e.label} (${e.sport} ${e.kind}, id ${e.id})`);
  }
  if (state?.wagering?.riskProfile || state?.wagering?.entertainmentBankroll) {
    lines.push("", "THE USER STATED:");
    if (state.wagering.riskProfile) lines.push(`- risk style: ${state.wagering.riskProfile}`);
    if (state.wagering.entertainmentBankroll) lines.push(`- entertainment bankroll: ${state.wagering.entertainmentBankroll} (their own figure — keep suggestions inside it, never recommend a stake)`);
  }

  lines.push("", "EVIDENCE:");
  for (const f of evidence.facts.slice(0, ASK_BUDGET.maxEvidenceRows)) lines.push(`${f.id} · ${f.text}`);

  if (evidence.unsupported?.length) {
    lines.push("", "WHAT GAMETIME COULD NOT ANSWER:");
    for (const u of evidence.unsupported) lines.push(`- ${u.tool}: ${u.error}${u.detail ? ` — ${u.detail}` : ""}`);
  }

  if (evidence.links?.length) {
    lines.push("", "LINKS YOU MAY REFERENCE BY ID:");
    for (const l of dedupe(evidence.links).slice(0, 8)) lines.push(`${l.id} · ${l.label}`);
  }

  return lines.join("\n");
}

function dedupe(links) {
  const seen = new Set();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
}

/**
 * SANITISE THE RENDERED MARKDOWN (§98).
 *
 * The browser renders a small safe subset, but the string is sanitised here too, on the server, before
 * it is ever streamed. Raw HTML, script tags and `javascript:` hrefs are stripped rather than escaped,
 * because a model has no legitimate reason to emit any of them and passing them through to be handled
 * "safely" downstream is one client-side mistake away from being executed.
 */
export function sanitiseMarkdown(md) {
  return String(md ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .slice(0, 8000);
}
