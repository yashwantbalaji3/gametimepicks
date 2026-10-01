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
 *   5. PICK     "GameTime picks / leans / likes …" must restate a pick the evidence actually holds.
 *   6. STATUS   an injury status or a current role must not be asserted unless the evidence says it.
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
import { ASK_ERROR, ASK_FORBIDDEN_EV_COPY, ASK_VERIFY_RULE as RULE,
  ASK_FORBIDDEN_LIVE_SETTLEMENT_COPY, ASK_FORBIDDEN_WAGERING_COPY, ASK_UNSOURCEABLE_STATUS_COPY,
  isApprovedLink } from "./contract.mjs";

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
 * Every violation carries `rule` (ASK_VERIFY_RULE — which check fired) and `claim` (the offending span, short),
 * beside the coarse `code`. The rule is what the retry and the operator log key on.
 *
 * @returns {{ ok: boolean, violations: Array<{code:string,rule:string,claim:string,detail:string}>, repaired?: string }}
 */
export function verifyAnswer(answer, evidence, opts = {}) {
  const text = String(answer ?? "");
  const violations = [];

  /* ── 1. COPY ─────────────────────────────────────────────────────────────────────────────── */
  const lower = text.toLowerCase();
  for (const phrase of ASK_FORBIDDEN_WAGERING_COPY) {
    if (containsAsClaim(lower, phrase)) violations.push({ code: ASK_ERROR.FORBIDDEN_COPY, rule: RULE.FORBIDDEN_WAGERING_COPY, claim: phrase, detail: `wagering copy: "${phrase}"` });
  }
  for (const phrase of ASK_FORBIDDEN_LIVE_SETTLEMENT_COPY) {
    /* A leg is not decided until something settles it, and Ask has no per-leg live tool to read.
       Refused even when the rest of the answer is correct — the same standing as an EV claim. */
    if (containsAsClaim(lower, phrase)) violations.push({ code: ASK_ERROR.FORBIDDEN_COPY, rule: RULE.FORBIDDEN_SETTLEMENT_COPY, claim: phrase, detail: `in-flight settlement claim: "${phrase}"` });
  }
  for (const phrase of ASK_FORBIDDEN_EV_COPY) {
    // An EV claim is refused even when the answer is otherwise correct: GameTime publishes no
    // price-aware expected value, so the vocabulary asserts an owner that does not exist.
    if (containsAsClaim(lower, phrase)) violations.push({ code: ASK_ERROR.FORBIDDEN_COPY, rule: RULE.FORBIDDEN_EV_COPY, claim: phrase, detail: `expected-value claim: "${phrase}"` });
  }

  /* ── 2. LINKS ────────────────────────────────────────────────────────────────────────────── */
  let repaired = text;
  const hrefs = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const bare = [...text.matchAll(/\bhttps?:\/\/[^\s)]+/g)].map((m) => m[0]);
  for (const href of [...hrefs, ...bare]) {
    if (!isApprovedLink(href)) {
      violations.push({ code: ASK_ERROR.UNSUPPORTED_LINK, rule: RULE.UNSUPPORTED_LINK, claim: href.slice(0, 120), detail: href.slice(0, 120) });
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
    /*
     * ⚠ THE WINDOW MUST NOT CROSS A MARKET BOUNDARY. An answer legitimately lists several markets in
     * a row — "Over/Under: paused · Moneyline: GameTime picks MIN" — and a window that only stopped at
     * a full stop ran from one market's name into the next market's pick, flagging a correct answer.
     * `·`, `|`, a newline, a semicolon and a bullet all end a market's clause as surely as a full stop.
     */
    const SEP = "[^.·|;\\n•\\-]";
    const windows = [
      new RegExp(`${escapeRe(market)}(${SEP}{0,70}?)\\b${PICK}\\b`, "gi"),
      new RegExp(`\\b${PICK}\\b(${SEP}{0,70}?)${escapeRe(market)}`, "gi"),
    ];
    let flagged = null;
    for (const re of windows) {
      for (const m of text.matchAll(re)) {
        // A negation anywhere in the window — "publishes no pick", "does not pick" — clears it.
        if (isNegated(m[1]) || isNegated(m[0])) continue;
        flagged = m[0];
        break;
      }
      if (flagged) break;
    }
    if (flagged) violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.PAUSED_MARKET_PICK, claim: flagged.slice(0, 80), detail: `presents the paused market "${market}" as a forecast` });
  }

  /* ── 5. UNSOURCED PICKS ──────────────────────────────────────────────────────────────────── */
  /*
   * ⚠ CHECK 3 NEEDED A SUBJECT, AND THE SLATE DOES NOT ALWAYS PROVIDE ONE (mut-18, 2026-09-27).
   *
   * "GameTime picks the Over/Under over tonight" was rejected only when the evidence happened to hold
   * a PAUSED Over/Under to recognise it against. The night the projection carried no MLB forecast at
   * all, the same sentence was published with `verified: true`: it has no number, no link, no
   * wagering word, and no paused market in context — nothing any check could see.
   *
   * The pause was never the real rule. A pick is a claim, and like a number it must come from the
   * evidence. So a claim clause is supported only when a pick the evidence holds — "Moneyline:
   * GameTime's pick is MIN" — is restated in it; with no pick in evidence, no pick claim is supported.
   * That holds whatever tonight's slate looks like, which is what a safety check has to do.
   */
  for (const clause of pickClaimClauses(text)) {
    if (!pickIsSupported(clause, evidencePicks(evidence.facts))) {
      violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.UNSUPPORTED_PICK, claim: clause.slice(0, 80), detail: `states a GameTime pick the evidence does not hold: "${clause.slice(0, 80)}"` });
    }
  }

  /* ── 6. UNSOURCEABLE STATUS ──────────────────────────────────────────────────────────────── */
  /*
   * An injury status or a current role (§11.2). No tool sources either, so a phrase asserting one is
   * allowed only as a restatement of the evidence — the same answer-key rule the numeric check uses.
   */
  const evidenceLower = evidence.facts.map((f) => String(f.text).toLowerCase()).join("\n");
  for (const phrase of ASK_UNSOURCEABLE_STATUS_COPY) {
    if (containsAsClaim(lower, phrase) && !evidenceLower.includes(phrase)) {
      violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.UNSUPPORTED_STATUS, claim: phrase, detail: `asserts an availability or role status no tool sourced: "${phrase}"` });
    }
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
    if (!allowed.has(m[1])) violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.UNSUPPORTED_DATE, claim: m[1], detail: `the date ${m[1]} is not in the evidence` });
  }

  let scrubbed = text;
  /*
   * IDENTIFIERS FIRST. A slip id such as `opt_2026-09-17_public_medium_mlb_513c61734f51` is a NAME
   * that contains digits. Left in place the numeric scan reads 2026, −17, 513 and 61734 out of it and
   * demands evidence for four numbers nobody claimed. Every identifier the evidence itself emitted is
   * removed before anything is counted.
   */
  for (const ident of evidence.identifiers ?? []) scrubbed = scrubbed.split(ident).join(" ");
  /*
   * ⚠ AN EVIDENCE LINK'S HREF IS A ROUTE, NOT A CLAIM — false-positive class EIGHT (Session 2, real provider).
   *
   * "[Open the NFL game report](/nfl/game/401872964/)" is the link the forecast tool itself issued, and the link
   * check above approves it. The numeric scan then read 401872964 out of the href and refused the answer — and the
   * retry could not help, because the writer was right to keep the link. Two of three real "Steelers game" turns
   * fell back this way on the preview. Only an href the EVIDENCE issued is exempt: a writer-invented
   * "/nfl/game/999999999/" still matches the route pattern, and its id is still refused as an unsupported number.
   */
  const evidenceHrefs = new Set((evidence.links ?? []).map((l) => l.href).filter(Boolean));
  scrubbed = scrubbed.replace(/\]\(([^)\s]+)\)/g, (whole, href) => (evidenceHrefs.has(href) ? "] " : whole));
  /*
   * ⚠ AN EVIDENCE CITATION IS A REFERENCE, NOT A CLAIM — false-positive class SEVEN.
   *
   * Fact ids look like `E1.1`, and a model that cites inline writes "…the Lab's own tool [E1.1]".
   * The numeric scan then read 1.1 straight out of the citation marker and rejected the answer for
   * "the number 1.1 is not in the evidence" — an answer whose only crime was showing its working.
   *
   * The incumbent listed citations in the `citations` array and rarely inline, so this sat unexercised
   * until a model with a different citing habit arrived. It then looked exactly like a grounding
   * problem in that model: five of twenty canary cases, every one a correct answer thrown away for a
   * number nobody claimed. The verifier was wrong, not the writer.
   *
   * Stripped before anything is counted, in both the bare and bracketed forms.
   */
  scrubbed = scrubbed.replace(/\[?\bE\d+(?:\.\d+)?\]?/g, " ");
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
    violations.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.UNSUPPORTED_NUMBER, claim: raw, detail: `the number ${raw} is not in the evidence` });
  }

  /* ── 7. A RECORD BELONGS TO ITS OWNER (E-2, probed) ─────────────────────────────────────── */
  /*
   * Numbers are pooled across the evidence, so "Bank Builder is 4–35" passed on Moonshot's 4–35. A W–L the
   * answer attaches to a named owner must appear in an evidence sentence that names that owner. Only clauses
   * that name one are checked, and each clause is judged on its own, so "Bank Builder is 37–36 and Moonshot is
   * 4–35" binds each record to its own subject.
   */
  for (const v of recordOwnerViolations(text, evidence.facts)) violations.push(v);

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

const RECORD_RE = /\b(\d{1,3})\s?[–-]\s?(\d{1,3})(?:\s?[–-]\s?(\d{1,3}))?\b/g;
const dash = (s) => String(s).replace(/\s?[–-]\s?/g, "–");
/* Capitalised words that name nothing: function words, record vocabulary, calendar words. */
const NOT_AN_OWNER = new Set(("GameTime Ask The A An It Its This That These Those In On At Of Over Under And But So With For Since Across All Each " +
  "Their They He She His Her Record Records Season Seasons Win Wins Loss Losses Push Pushes Void Picks Pick Current Overall Total Today Yesterday Tonight " +
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December " +
  "Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec Week Game Games Paper Settled Graded " +
  /* sentence-opening adverbs and time-zone labels are not owners (eval, E-2: "Within that record, …", "… ET") */
  "Within Separately However Also Meanwhile Overall Currently Here There As By From To Across Before After During Including " +
  "ET UTC EST EDT PT PST PDT GMT").split(" "));
/* A date or a clock time is not a record: "2026-09-16" holds "09-16", and 19:05 is not a score. Blanked first. */
const noDates = (t) => String(t).replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ");
const ASK_VERIFY_RULE_RECORD = RULE.UNSUPPORTED_RECORD;
/* GameTime (or its model) as the subject of a record verb: "GameTime is 4–1", "the model went 3-2", "GTP's record is". */
const GTP_RECORD_CLAIM = /\b(?:GameTime|GTP|[Tt]he model|[Oo]ur model|[Ww]e)(?:['’]s?)?(?:\s+(?:model|engine|picks?|forecasts?))?\s+(?:record\b|hit rate\b|is\b|are\b|was\b|were\b|went\b|has gone\b|have gone\b|stands?\b|sits?\b|has a\b)/;
function recordOwnerViolations(text, facts) {
  const out = [];
  facts = facts.map((f) => ({ ...f, text: noDates(f.text) }));
  const clauses = noDates(text).split(/(?<!\d)\.(?!\d)|[;\n•|·!?:,]|\band\b|\bwhile\b|\bbut\b|\bwhereas\b/);
  for (const clause of clauses) {
    for (const m of clause.matchAll(RECORD_RE)) {
      const rec = dash(m[0]);
      const withIt = facts.filter((f) => dash(f.text).includes(rec));
      if (!withIt.length) {
        /*
         * ⚠ A GAMETIME RECORD THE EVIDENCE NEVER STATES (Session 2, probed). "GameTime is 4–1 on Warren's line", built
         * from recent form ("40+ yards in 4 of his last 5"), was refused only by luck: the numeric check reads 4 and
         * 1 separately, and any evidence carrying a "1" anywhere let the invented record through. Recent form is the
         * PLAYER's history; GameTime's record comes only from the results owner. A W–L given to GameTime or its model
         * must appear AS a record in the evidence. Scoped to record verbs so a projected score is not caught here.
         */
        if (GTP_RECORD_CLAIM.test(clause)) {
          out.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: ASK_VERIFY_RULE_RECORD, claim: clause.trim().slice(0, 80), detail: `the record ${m[0]} is given to GameTime, but no evidence states that record` });
        }
        continue; // otherwise the numeric check owns an absent number
      }
      const caps = [...clause.matchAll(/\b[A-Z][A-Za-z'’.]+\b/g)];
      // A lone capitalised word opening the clause is sentence case, not a name ("Separately, …").
      const opener = caps[0] && clause.slice(0, caps[0].index).trim() === "" && !(caps[1] && caps[1].index === caps[0].index + caps[0][0].length + 1) ? caps[0][0] : null;
      const owners = [...new Set(caps.map((m) => m[0]).filter((w) => w !== opener).map((w) => w.replace(/['’]s?$/, "")).filter((w) => w.length > 1 && !NOT_AN_OWNER.has(w)))];
      if (!owners.length) continue;
      if (!withIt.some((f) => owners.every((w) => f.text.includes(w)))) {
        out.push({ code: ASK_ERROR.UNSUPPORTED_CLAIM, rule: RULE.UNSUPPORTED_RECORD, claim: `${owners.join(" ")} ${m[0]}`.slice(0, 80), detail: `the record ${m[0]} is attached to ${owners.join(" ")}, but the evidence gives it to someone else` });
      }
    }
  }
  return out;
}

/*
 * A PICK CLAIM: GameTime (or "we") as the subject of a directional verb, or "GameTime's pick is …".
 *
 * ⚠ THE BRAND IS "GameTime Picks". With a capital P it is the product's NAME — "GameTime Picks is an
 * educational analytics project" — and read case-insensitively it is also "GameTime picks", the claim.
 * So the capitalised brand is collapsed to "GameTime" first, and only a lower-case "picks" is a verb.
 * "forecasts" is deliberately not a verb here: "12 GameTime forecasts match" is a count, not a pick.
 */
const PICK_CLAIM = new RegExp([
  /\bGameTime(?:['’]s?)?(?:\s+(?:model|engine))?\s+(?:picks|picked|is picking|leans|is leaning|likes)\b/.source,
  /\bGameTime['’]s?\s+(?:model['’]s\s+)?pick\s+(?:is\b|:)/.source,
  /\b[Ww]e\s+(?:like|pick|lean|are picking|are leaning)\b/.source,
  /* E-2 (probed): other directional verbs made the same claim unchecked — "The model favors Arsenal". */
  /\b(?:GameTime|[Tt]he model|[Oo]ur model|[Tt]he forecast)(?:['’]s?)?(?:\s+(?:model|engine|forecast))?\s+(?:favors|favours|favored|favoured|backs|is backing)\b/.source,
  /* ⚠ NOT "predicted": results evidence restates graded HISTORY as "GameTime predicted HOME, the actual result was
     HOME" — a past, graded forecast, not a live pick. Flagging it rejected faithful results answers (eval, E-2). */
  /\b(?:GameTime|[Tt]he model|[Oo]ur model)(?:['’]s?)?(?:\s+(?:model|engine))?\s+(?:expects|projects|has)\s+[^.;\n:]{1,40}?\s+to\s+(?:win|beat|cover)\b/.source,
  /\bis\s+(?:GameTime['’]s|the model['’]s|our)\s+pick\b|\bis the pick\b/.source,
].join("|"), "g");
/* A clause ends at a sentence stop (not a decimal point), or a market separator the evidence uses. */
const CLAUSE_END = /(?<!\d)\.(?!\d)|[;\n•|·!?]|:(?!\d)/;

/** Every affirmative pick-claim clause in the answer. A negated clause ("GameTime's pick is none") is not a claim. */
function pickClaimClauses(text) {
  const normalised = text.replace(/\bGameTime\s?Picks\b/g, "GameTime");
  const clauses = [];
  for (const m of normalised.matchAll(PICK_CLAIM)) {
    const before = normalised.slice(0, m.index).split(CLAUSE_END).at(-1);
    const after = normalised.slice(m.index).split(CLAUSE_END)[0];
    const clause = `${before}${after}`.trim();
    /*
     * ⚠ A NEGATION GOVERNS WHAT FOLLOWS IT, NOT WHAT PRECEDES IT (Session 2, probed). The whole clause used to be
     * searched, so "GameTime likes Pittsburgh, not Cleveland" was cleared by the "not" that CONTRASTS the pick and
     * published the pick. A pick claim is denied only by a negation BEFORE the verb ("Neither GameTime nor …",
     * "Nothing says GameTime picks …"), or by an empty answer straight after it ("GameTime's pick is none").
     */
    const tail = after.slice(m[0].length);
    if (isNegated(`${before}${m[0]}`) || /^\s*(?:none|nothing|not stated|unavailable|no one|no pick|no side)\b/i.test(tail)) continue;
    clauses.push(clause);
  }
  return clauses;
}

/**
 * The picks the evidence actually holds, as {label, value}. Two sentence shapes carry one
 * (evidence.mjs, getPublishedForecasts): "· Moneyline: GameTime's pick is MIN at …, model …" and
 * the headline form "its Moneyline pick is MIN, confidence …". "none stated" is the absence of a pick.
 */
function evidencePicks(facts) {
  const picks = [];
  for (const f of facts) {
    const t = String(f.text);
    for (const m of t.matchAll(/(?:·\s*([^·:]+?):\s*)?GameTime['’]s pick is (.+?)(?=\s+at\s+[-+]?\d|,|;|$)/g)) picks.push({ label: m[1] ?? "", value: m[2] });
    for (const m of t.matchAll(/\bits\s+([^,;]+?)\s+pick is (.+?)(?=,|;|$)/g)) picks.push({ label: m[1], value: m[2] });
  }
  return picks.filter((p) => p.value && !/^(?:none\b|unavailable\b|null\b)/i.test(p.value.trim()));
}

/**
 * A claim is supported when some evidence pick's VALUE appears in it as a word, once that pick's own
 * market label is removed — otherwise "Over" would be found inside "Over/Under" and every Over/Under
 * sentence would support itself.
 */
function pickIsSupported(clause, picks) {
  const lowerClause = clause.toLowerCase();
  return picks.some(({ label, value }) => {
    const rest = label ? lowerClause.split(label.toLowerCase().trim()).join(" ") : lowerClause;
    return new RegExp(`(?:^|[^\\w])${escapeRe(value.toLowerCase().trim())}(?:[^\\w]|$)`).test(rest);
  });
}

/**
 * Words that flip a phrase from a claim into its denial, within a short window before it.
 *
 * ⚠ "NOTHING", "NONE" AND "NEITHER" WERE MISSING (Session 1 finding, probed in Session 2). "Nothing in the evidence
 * says he is out with an injury" and "None of the forecasts is GameTime's pick" were read as the claims they deny,
 * and a writer that honestly explained an ABSENCE was refused for it — the class that makes a guard get switched
 * off. They are denials only as pronoun-subjects; the idioms in which they intensify ("nothing but", "second to
 * none", "none other than") are stripped first, like "no doubt".
 */
const NEGATION = /\b(?:no|not|never|without|cannot|can't|does not|doesn't|don't|isn't|is not|are not|aren't|nothing|none|neither)\b/i;
/*
 * ⚠ IDIOMS THAT CONTAIN A NEGATION WORD AND DENY NOTHING (Phase E · E-2, probed). "No doubt about it: GameTime
 * picks Arsenal", "There is no question this is a sure thing", "Not surprisingly, Lamar Jackson is out" — each
 * passed, because any negation word earlier in the sentence cleared the claim. These phrases INTENSIFY the claim;
 * they are removed before a negation is looked for.
 */
const NEGATION_IDIOMS = /\b(?:no doubt|no question|not surprisingly|unsurprisingly|no wonder|not only|without (?:a |any )?doubt|without question|no matter|make no mistake|no two ways|nothing but|nothing short of|nothing less than|none other than|second to none|none too|neither here nor there)\b/gi;
const isNegated = (segment) => NEGATION.test(String(segment).replace(NEGATION_IDIOMS, " "));

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
    if (!isNegated(lower.slice(start, i))) return true;
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
 * What a CLARIFICATION may not say (E-2). A clarifying question runs no tool, so it has no evidence to restate:
 * besides the wagering and EV copy, an in-flight settlement claim or an availability/role status in it can only
 * be invented. The old check stopped at forbiddenCopyIn and let both through.
 */
export function clarificationCopyIn(text) {
  const lower = String(text ?? "").toLowerCase();
  const hits = forbiddenCopyIn(text);
  for (const phrase of ASK_FORBIDDEN_LIVE_SETTLEMENT_COPY) if (containsAsClaim(lower, phrase)) hits.push(phrase);
  for (const phrase of ASK_UNSOURCEABLE_STATUS_COPY) if (containsAsClaim(lower, phrase)) hits.push(phrase);
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
    /* Session 3 · reader copy, not pipeline copy (the old lead was "Here is what GameTime's own tools returned:"). */
    lines.push("From GameTimePicks' own data:");
    lines.push("");
    for (const f of supported.slice(0, 12)) lines.push(`- ${capitalise(f.text)}`);
  }

  /*
   * ⚠ NO TOOL NAMES, NO ERROR CODES. This line used to read "GameTimePicks does not currently hold
   * that data (runGameFinder: INVALID_ARGUMENT)" — accurate, and a tool name plus an enum in a chat
   * bubble is not an answer. The same fix was already made to the evidence sentences; this path was
   * missed because it composes its own text rather than reusing them.
   *
   * The evidence sentence ALREADY says what is unavailable, in product words, so the fallback simply
   * does not repeat it. The code stays in the receipt, where an operator can read it.
   */
  if ((evidence.unsupported ?? []).length && !supported.length) {
    lines.push("");
    lines.push("GameTimePicks does not currently hold data that answers that.");
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
