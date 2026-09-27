/**
 * THE §15 LABEL CLASSIFIER — which of the eleven clocks is a surface actually showing?
 *
 * Extracted from the ops script so it can be tested against synthetic lines instead of against the
 * live codebase: a guard whose fixtures are the repo itself rots the moment the repo changes, and it
 * cannot be probed.
 */
import { CLOCK, CLOCK_DOMAIN } from "./clocks.mjs";

/**
 * Which canonical clock a source expression resolves to.
 *
 * ⚠ ORDER MATTERS AND THE SPECIFIC CASES COME FIRST. `frozenAt` contains neither "generated" nor
 * "built", but a loose /At\b/ rule would have swallowed it — and a loose regex that matches the
 * mention rather than the thing is this repo's most repeated guard defect.
 */
const RESOLVERS = [
  [/\bbuild[-_]?info|buildInfo|builtAt|BUILD_TIME|buildTime/i, CLOCK.PAGE_BUILT_AT],
  [/\bfrozenAt|frozenProjection|frozen[-_]?at/i, CLOCK.FORECAST_FROZEN_AT],
  [/\bcorrectedAt/i, CLOCK.CORRECTED_AT],
  [/\bsettledAt|gradedAt/i, CLOCK.SETTLED_AT],
  [/\bfinalObservedAt|finalAt/i, CLOCK.FINAL_OBSERVED_AT],
  [/\bcapturedAt|captureAt|priceCapturedAt/i, CLOCK.MARKET_CAPTURED_AT],
  [/\bobservedAt|lastObserved|asOfLive/i, CLOCK.LIVE_OBSERVED_AT],
  [/\bfitAt|fittedAt|trainedAt/i, CLOCK.MODEL_FIT_AT],
  [/\bvalidatedAt/i, CLOCK.MODEL_VALIDATED_AT],
  [/\bacquiredAt|fetchedAt|sourceAt/i, CLOCK.SOURCE_OBSERVED_AT],
  [/\bgeneratedAt/i, CLOCK.FORECAST_GENERATED_AT],
];

const resolve = (expr) => {
  for (const [re, clock] of RESOLVERS) if (re.test(expr)) return clock;
  return null;
};


/* A candidate "when" label. Matching this word is NOT enough — see TIME_VALUED. */
const LABEL = /\b(Updated|Last updated|As of|Refreshed|Generated)\b/;

/**
 * Does this line actually render a TIME?
 *
 * ⚠ THE WORD IS NOT THE THING, AND THE FIRST VERSION OF THIS AUDIT PROVED IT. Matching "Generated"
 * alone reported eleven "unresolved clocks", of which most were not clocks at all: "Generated
 * picks" is a COUNT, "Generated slips are never…" is prose, "Generated from…" is a sub-heading. A
 * report where the majority of findings are false is worse than no report — it trains the reader to
 * ignore it. So a label counts only when the line also carries a time-valued expression, and a
 * label without one is reported separately as NOT a clock.
 */
const TIME_VALUED = [
  ...RESOLVERS.map(([re]) => re),
  /\bnew Date\(/,
  /\.format\(/,
  /formatUpdated|formatEtTime|formatEt\b|etKickoff|longDate|ET_STAMP|shortDate|timeAgo|relativeTime|isoToEt/i,
  /\bIso\b|Iso\)|IsoString/,
];

/**
 * A source expression whose OWN NAME is the collapsed word.
 *
 * ⚠ THIS IS THE PUREST FORM OF §15's COMPLAINT and the audit nearly threw it away. `today-mlb-brief`
 * renders `Updated {updated}` from `const updated = formatEtTime(lastUpdatedIso)` — so the value is
 * a real time, but nothing in the code says WHICH of the eleven clocks it is. It is not unresolvable
 * because the audit is weak; it is unresolvable because the codebase never decided. Reporting it as
 * "not a clock" would have hidden the exact defect.
 */
const COLLAPSED_SOURCE = /lastUpdated|updatedAt|\bupdated\b/i;
const isTimeValued = (line) => TIME_VALUED.some((re) => re.test(line));

/**
 * `Updated {updated}` hides the clock behind a local. Resolve one hop by finding that identifier's
 * assignment in the same file — one hop only, because a deeper trace becomes a type-checker and
 * would start guessing.
 */
function traceLocal(lines, expr) {
  const ids = [...expr.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*[}?.]/g)].map((m) => m[1]);
  for (const id of ids) {
    for (const l of lines) {
      if (new RegExp(`(?:const|let|var)\\s+${id}\\b`).test(l)) {
        const clock = resolve(l);
        if (clock) return { clock, via: `${id} = ${l.trim().slice(0, 90)}` };
      }
    }
  }
  return null;
}

/** Like traceLocal, but returns the definition whatever it says — the caller decides. */
function traceLocalAny(lines, expr) {
  const ids = [...expr.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*[}?.]/g)].map((m) => m[1]);
  for (const id of ids) {
    for (const l of lines) {
      if (new RegExp(`(?:const|let|var)\\s+${id}\\b`).test(l)) return { def: l.trim(), via: `${id} = ${l.trim().slice(0, 90)}` };
    }
  }
  return null;
}

/**
 * Classify one source line.
 *
 * @param line   the source line
 * @param lines  the whole file, for a ONE-HOP local trace
 * @returns {{kind: "CLOCK"|"NOT_A_CLOCK", word?, clock?, domain?, unresolved?, collapsedSource?, buildClockAsHeadline?, via?}}
 */
export function classifyLabelLine(line, lines = []) {
  if (!LABEL.test(line)) return { kind: "NOT_A_CLOCK", why: "no label word" };
  const trimmed = line.trim();
  /*
   * A sentence ABOUT a label is not a label, and the interesting case is a block comment whose
   * CLOSE lands on the same line as the word.
   *
   * THE DIRECTION IS THE OPPOSITE OF THE OBVIOUS GUESS, and I had it backwards first. When the
   * closing marker appears AFTER the word, that is precisely what proves the word was INSIDE the
   * comment: the line began mid-comment. A closing marker BEFORE the word means the comment had
   * already ended and the word is real code. Checking only the text before the word caught neither.
   *
   * (Writing that marker literally in this very comment closed it early and broke the file — twice.
   * Which is the same class of defect, one level up.)
   */
  const before = trimmed.split(LABEL)[0] ?? "";
  const after = trimmed.slice(before.length);

  /*
   * Is the WORD inside a block comment? Two independent ways, and a single regex gets both wrong:
   *
   *   (a) an OPEN marker before the word that is never closed before it;
   *   (b) no marker before the word at all, and the first marker after it is a CLOSE — which means
   *       the line began mid-comment.
   *
   * Testing only for a close marker after the word over-excluded two shapes of REAL label, and a
   * false negative here is worse than a false positive: it hides work rather than adding noise.
   *       <span>Updated {row.generatedAt}</span> \/* keep this *\/   ← code with a trailing comment
   *       \/* note *\/ <span>Updated {row.generatedAt}</span>       ← code after a closed comment
   */
  const lastOpen = before.lastIndexOf("/*");
  const lastClose = before.lastIndexOf("*/");
  const unclosedBefore = lastOpen > lastClose;
  const nextOpen = after.indexOf("/*");
  const nextClose = after.indexOf("*/");
  const beganMidComment =
    lastOpen === -1 && lastClose === -1 && nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen);

  /* A leading block-comment OPEN is deliberately NOT in this list: `unclosedBefore` already decides
     it correctly, and testing the prefix as well excluded a line whose comment closed before the
     word and was followed by real code. Line comments and jsdoc continuations have no such nuance. */
  if (/^(\/\/|\*)/.test(trimmed) || unclosedBefore || beganMidComment) {
    return { kind: "NOT_A_CLOCK", why: "comment" };
  }
  const word = line.match(LABEL)[1];

  if (!isTimeValued(line)) {
    const traced = traceLocal(lines, line);
    if (!traced) {
      const anyLocal = traceLocalAny(lines, line);
      if (anyLocal && isTimeValued(anyLocal.def)) {
        return {
          kind: "CLOCK", word, clock: null, domain: null, unresolved: true,
          collapsedSource: COLLAPSED_SOURCE.test(anyLocal.def), buildClockAsHeadline: false, via: anyLocal.via,
        };
      }
      return { kind: "NOT_A_CLOCK", why: "renders no time", word };
    }
    return {
      kind: "CLOCK", word, clock: traced.clock, domain: CLOCK_DOMAIN[traced.clock],
      unresolved: false, collapsedSource: false,
      buildClockAsHeadline: traced.clock === CLOCK.PAGE_BUILT_AT, via: traced.via,
    };
  }

  const clock = resolve(line) ?? traceLocal(lines, line)?.clock ?? null;
  return {
    kind: "CLOCK", word, clock, domain: clock ? CLOCK_DOMAIN[clock] : null,
    unresolved: clock === null,
    collapsedSource: clock === null && COLLAPSED_SOURCE.test(line),
    buildClockAsHeadline: clock === CLOCK.PAGE_BUILT_AT,
  };
}

export { LABEL, RESOLVERS, COLLAPSED_SOURCE, isTimeValued, resolve };
