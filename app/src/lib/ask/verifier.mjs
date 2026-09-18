/**
 * THE GROUNDING VERIFIER — the last thing between a fluent sentence and a published falsehood.
 *
 * WHY A DETERMINISTIC CHECK AND NOT A SECOND MODEL. Asking a model to check a model shares the failure
 * mode you are trying to catch: both are fluent, both are confident, and neither has the evidence in
 * front of it as data. This runs on the finished text with the evidence index as an answer key, so
 * "the writer changed 87 to 88" is caught by arithmetic rather than by judgement (§147).
 *
 * WHAT IT CHECKS
 *   1. NUMERIC  every sports-looking number in the answer appears in the evidence index, or came from
 *               the user, or is one of a small set of unmistakably non-sports numbers.
 *   2. LINKS    every href matches the approved route registry. The model refers to links by id; it
 *               never writes a URL, and one that appears anyway is removed.
 *   3. COPY     no guarantee language, no loss-chasing, no expected-value claim. Checked on OUTPUT
 *               rather than instructed in a prompt, because a prompt is a request and this is a rule.
 *   4. PAUSE    a market the evidence says is PAUSED must not be described with a pick.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not attempt full NLP. It has no opinion on whether a
 * sentence is well-argued, and it does not try to parse claims into logic. It is a conservative net
 * over the categories where being wrong is expensive, and §15 says exactly that: use a conservative
 * evidence map, do not expect perfect NLP, and never ship an unsupported number because the model
 * probably knows.
 *
 * A NOTE ON FALSE POSITIVES. A verifier that fires on correct answers gets switched off. So years,
 * clock times, ordinals, percentages already in evidence, list numbering and the numbers the user
 * themselves supplied are all explicitly allowed. Every exemption here is narrow and named.
 */
import { ASK_ERROR, ASK_FORBIDDEN_EV_COPY, ASK_FORBIDDEN_WAGERING_COPY, isApprovedLink } from "./contract.mjs";

/**
 * Numbers that are never a sports claim, scrubbed before the numeric scan.
 *
 * ⚠ ORDER IS LOAD-BEARING, and getting it wrong produces a guard that fires on correct answers.
 * The first version of this list put the YEAR pattern before the ISO-DATE pattern, so "2026-09-17"
 * had its year removed first and left "-09-17" behind — which the numeric scanner then read as the
 * number −17, absent from the evidence, and every correct answer containing a date was rejected and
 * replaced by the deterministic fallback. The most specific pattern must run first.
 */
const SAFE_CONTEXT = [
  /\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g,     // an ISO date or timestamp — checked separately below
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,           // a clock time
  /\b(?:19|20)\d{2}\b/g,                    // a bare year
  /\b(?:first|second|third|1st|2nd|3rd|\d+(?:th))\b/gi,
];

/**
 * Verify one finished answer against the evidence bundle.
 *
 * @param {string} answer            the writer's markdown
 * @param {{numbers: Set<string>, facts: Array, links: Array, items: Array}} evidence
 * @param {{ userNumbers?: number[], wagering?: boolean }} [opts]
 * @returns {{ ok: boolean, violations: Array<{code:string,detail:string}>, repaired?: string }}
 */
export function verifyAnswer(answer, evidence, opts = {}) {
  const text = String(answer ?? "");
  const violations = [];

  /* ── 1. COPY ─────────────────────────────────────────────────────────────────────────────── */
  const lower = text.toLowerCase();
  for (const phrase of ASK_FORBIDDEN_WAGERING_COPY) {
    if (containsAsClaim(lower, phrase)) violations.push({ code: ASK_ERROR.FORBIDDEN_COPY, detail: `wagering copy: "${phrase}"` });
  }
  for (const phrase of ASK_FORBIDDEN_EV_COPY) {
    // An EV claim is refused even when the answer is otherwise correct: GameTime publishes no
    // price-aware expected value, so the vocabulary asserts an owner that does not exist.
    if (containsAsClaim(lower, phrase)) violations.push({ code: ASK_ERROR.FORBIDDEN_COPY, detail: `expected-value claim: "${phrase}"` });
  }

  /* ── 2. LINKS ────────────────────────────────────────────────────────────────────────────── */
  let repaired = text;
  const hrefs = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const bare = [...text.matchAll(/\bhttps?:\/\/[^\s)]+/g)].map((m) => m[0]);
  for (const href of [...hrefs, ...bare]) {
    if (!isApprovedLink(href)) {
      violations.push({ code: ASK_ERROR.UNSUPPORTED_LINK, detail: href.slice(0, 120) });
      // Repaired by removing the LINK but keeping its text: a reader loses a hop, not a sentence.
      repaired = repaired.replace(new RegExp(`\\]\\(${escapeRe(href)}\\)`, "g"), "]").replace(href, "");
    }
  }

  /* ── 3. PAUSED MARKETS ───────────────────────────────────────────────────────────────────── */
  const pausedFacts = evidence.facts.filter((f) => / is PAUSED by GameTime/.test(f.text));
  for (const f of pausedFacts) {
    const market = f.text.match(/· ([^·]+) is PAUSED/)?.[1]?.trim();
    if (!market) continue;
    /*
     * "GameTime picks the over" beside a paused over/under is the failure this catches — but the
     * PAUSE SENTENCE ITSELF says "publishes no pick", and a naive search for the word "pick" near the
     * market name fires on that, rejecting the correct answer for containing the correct explanation.
     * So the window must be affirmative: a negation between the market and the verb clears it.
     */
    /*
     * BOTH DIRECTIONS. English puts the verb either side of the market: "the Over/Under: GameTime
     * picks over" and "GameTime picks the Over/Under over". Checking only market-then-verb missed the
     * second, which is the more natural sentence and therefore the likelier failure.
     */
    const PICK = "(?:pick|picks|forecasts?|leans?|takes?|likes|recommends?)";
    const windows = [
      new RegExp(`${escapeRe(market)}([^.]{0,80}?)\\b${PICK}\\b`, "gi"),
      new RegExp(`\\b${PICK}\\b([^.]{0,80}?)${escapeRe(market)}`, "gi"),
    ];
    let flagged = false;
    for (const re of windows) {
      for (const m of text.matchAll(re)) {
        // A negation anywhere in the window — "publishes no pick", "does not pick" — clears it.
        if (NEGATION.test(m[1]) || NEGATION.test(m[0])) continue;
        flagged = true;
        break;
      }
      if (flagged) break;
    }
    if (flagged) violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, detail: `presents the paused market "${market}" as a forecast` });
  }

  /* ── 4. NUMERIC ──────────────────────────────────────────────────────────────────────────── */
  const allowed = new Set(evidence.numbers);
  for (const n of opts.userNumbers ?? []) {
    // A number the USER supplied — a bankroll, a stake — is theirs to state and is not a sports claim.
    allowed.add(String(n));
    allowed.add(String(Math.round(n)));
  }

  /*
   * A DATE IS A CLAIM. "the Mets beat the Orioles on 2026-09-15" is a factual assertion about when,
   * and a writer that shifts a date has changed the fact as surely as one that shifts a score. So
   * dates are checked against the evidence in their own right BEFORE being scrubbed from the numeric
   * scan — scrubbing alone would have exempted them entirely.
   */
  for (const m of text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) {
    if (!allowed.has(m[1])) violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, detail: `the date ${m[1]} is not in the evidence` });
  }

  let scrubbed = text;
  /*
   * IDENTIFIERS FIRST. A slip id such as `opt_2026-09-17_public_medium_mlb_513c61734f51` is a NAME
   * that contains digits. Left in place the numeric scan reads 2026, −17, 513 and 61734 out of it and
   * demands evidence for four numbers nobody claimed. Every identifier the evidence itself emitted is
   * removed before anything is counted.
   */
  for (const ident of evidence.identifiers ?? []) scrubbed = scrubbed.split(ident).join(" ");
  scrubbed = scrubbed.replace(/\b[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+){2,}\b/g, " ");
  for (const re of SAFE_CONTEXT) scrubbed = scrubbed.replace(re, " ");
  // Markdown list numbering ("1. ", "2. ") is structure, not a claim.
  scrubbed = scrubbed.replace(/^\s*\d{1,2}[.)]\s/gm, " ");

  const unsupportedNumbers = [];
  for (const m of scrubbed.matchAll(/[-+]?\$?\d[\d,]*(?:\.\d+)?%?/g)) {
    const raw = m[0];
    const norm = raw.replace(/[$,%+]/g, "");
    const value = Number(norm);
    if (!Number.isFinite(value)) continue;

    if (isAllowedNumber(value, raw, allowed)) continue;
    unsupportedNumbers.push(raw);
  }

  for (const raw of [...new Set(unsupportedNumbers)]) {
    violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, detail: `the number ${raw} is not in the evidence` });
  }

  return {
    ok: violations.length === 0,
    violations,
    repaired: violations.length && repaired !== text ? repaired : undefined,
    checked: { numbers: unsupportedNumbers.length, links: hrefs.length + bare.length, pausedMarkets: pausedFacts.length },
  };
}

/**
 * Is this number supported?
 *
 * The allowed set already carries several spellings of every evidence value (rounded, as a percentage,
 * as a probability), so a match on any of them is a faithful restatement rather than a new claim.
 *
 * ⚠ THERE IS NO "SMALL COUNTING NUMBER" EXEMPTION, AND THERE MUST NOT BE.
 *
 * The first version allowed any integer 0–10 on the reasoning that "three candidates" and "2 legs" are
 * the answer describing its own structure. A mutation probe showed what that actually buys: in a
 * product whose main sport is baseball, almost every number that matters — runs, innings, hits, leg
 * counts, wins — is an integer under ten. The exemption made "the Mets scored 8" indistinguishable
 * from "the Mets scored 5" when the evidence said 5. It exempted precisely the claims most worth
 * checking.
 *
 * Removing it costs nothing measurable: the evidence builder registers every number appearing in its
 * own sentences, so a structural count ("3 are described here") is already supported, and a count
 * spelled as a word ("three candidates") is not a numeral at all. The golden set passes 91/91 without
 * the exemption.
 */
function isAllowedNumber(value, raw, allowed) {
  if (allowed.has(String(value))) return true;
  if (allowed.has(String(Math.abs(value)))) return true;
  if (allowed.has(String(Number(value.toFixed(4)).valueOf()))) return true;
  return false;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words that flip a phrase from a claim into its denial, within a short window before it. */
const NEGATION = /\b(?:no|not|never|without|cannot|can't|does not|doesn't|don't|isn't|is not|are not|aren't)\b/i;

/**
 * Does the text make this phrase as a CLAIM, rather than deny it?
 *
 * Ask's own honest sentences contain the forbidden vocabulary by necessity — "GameTime does not
 * publish a price-aware expected value", "GameTime publishes no guarantees and no locks", "Ask will
 * not tell you which candidate is the highest-EV or the most profitable". A substring match rejects
 * every one of them, which would mean the answer that correctly refuses to make a claim is refused
 * for saying so.
 *
 * ⚠ THE SCOPE IS THE SENTENCE, NOT A CHARACTER COUNT. The first version looked back a fixed 40
 * characters and still rejected the corpus's own disclaimer, because "will not tell you which
 * candidate is the highest-EV or the" is 50 characters long. A negation governs its clause however
 * long that clause runs, so the window is the text from the start of the sentence up to the phrase.
 */
export function containsAsClaim(lower, phrase) {
  let from = 0;
  for (;;) {
    const i = lower.indexOf(phrase, from);
    if (i === -1) return false;
    // Back to the previous sentence boundary — a full stop, a semicolon, or a newline.
    const start = Math.max(
      lower.lastIndexOf(".", i - 1),
      lower.lastIndexOf(";", i - 1),
      lower.lastIndexOf("\n", i - 1),
    ) + 1;
    if (!NEGATION.test(lower.slice(start, i))) return true;
    from = i + phrase.length;
  }
}

/**
 * The product's own copy rule, exported so the eval harness checks the SAME rule the runtime enforces.
 * A second implementation in a test is a second rule, and the two disagree the first time either moves.
 */
export function forbiddenCopyIn(text) {
  const lower = String(text ?? "").toLowerCase();
  const hits = [];
  for (const phrase of ASK_FORBIDDEN_WAGERING_COPY) if (containsAsClaim(lower, phrase)) hits.push(phrase);
  for (const phrase of ASK_FORBIDDEN_EV_COPY) if (containsAsClaim(lower, phrase)) hits.push(phrase);
  return hits;
}

/**
 * THE DETERMINISTIC FALLBACK (§69, §15).
 *
 * When verification fails twice, the answer is not published. What ships instead is composed from the
 * evidence itself: the facts, unchanged, with their links. It reads plainer than a generated answer
 * and it is guaranteed to contain nothing that is not evidence, because it IS the evidence.
 *
 * The alternative — publishing an unverified answer with a disclaimer — is worse in the only way that
 * matters: a reader who sees a number remembers the number, not the disclaimer.
 */
export function deterministicAnswer(evidence, { intent } = {}) {
  const lines = [];
  const supported = evidence.facts.filter((f) => !/could not answer/.test(f.text));

  if (!supported.length) {
    lines.push("I could not find anything in GameTimePicks that answers that.");
  } else {
    lines.push("Here is what GameTime's own tools returned:");
    lines.push("");
    for (const f of supported.slice(0, 12)) lines.push(`- ${capitalise(f.text)}`);
  }

  for (const u of evidence.unsupported ?? []) {
    lines.push("");
    lines.push(`GameTimePicks does not currently hold that data (${u.tool}: ${u.error}).`);
  }

  const links = dedupeLinks(evidence.links ?? []).slice(0, 4);
  if (links.length) {
    lines.push("");
    for (const l of links) lines.push(`- [${l.label}](${l.href})`);
  }

  return { answerMarkdown: lines.join("\n"), citations: supported.slice(0, 12).map((f) => f.id), links, intent: intent ?? null, deterministic: true };
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
}

const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
