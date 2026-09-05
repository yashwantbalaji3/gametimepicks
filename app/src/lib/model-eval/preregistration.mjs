/**
 * PREREGISTERED CANDIDATE EVALUATION — Program 234 · Release H.
 *
 * P233 named the gap: a reproducible candidate-versus-incumbent comparison on the same eligible
 * events with a locked window. The comparison itself already exists — `model-learning-audit.mjs`
 * does a temporal split over 37,958 settled rows and scores raw model, de-vigged market, Platt and
 * isotonic on Brier and log loss. What did not exist is the part that makes a comparison mean
 * anything: terms fixed BEFORE the numbers are seen, and something that stops a candidate promoting
 * itself because it happened to win.
 *
 * THE HONESTY THIS MODULE IS BUILT AROUND. The isotonic result is already known. A "preregistration"
 * written today for a window that has already been scored is not a preregistration, and calling it
 * one would be the exact dishonesty the mechanism exists to prevent. So a registration carries a
 * `state`:
 *
 *   PRIOR_OBSERVATION — the window was scored before the terms were fixed. Reportable as context,
 *                       never as a test. It cannot yield PROMOTION_EARNED, no matter the numbers.
 *   PREREGISTERED     — the terms were fixed before the evaluation window opened. Only these can
 *                       earn anything.
 *
 * AND NOTHING HERE PROMOTES ANYTHING. `decide()` returns a verdict and its reasons. Promotion is a
 * governed act performed by a person against that readout; there is no code path from a good score
 * to a live model. The incumbent continues by default, including when the candidate wins.
 *
 * Pure module: no fs, no clock, no network. Every input is passed in, so the same cohort always
 * reproduces the same verdict.
 */

export const VERDICTS = Object.freeze([
  "INVALID",            // the registration itself is malformed — no verdict is possible
  "WINDOW_NOT_OPEN",    // the cohort ends before the registration's window begins — nothing to test yet
  "LEAKED",             // the evaluation window overlaps the training window
  "INSUFFICIENT_SAMPLE",
  "INSUFFICIENT_COVERAGE",
  "REJECTED",           // ran cleanly, did not meet the frozen bar
  "INCONCLUSIVE",       // ran cleanly, moved the metric the right way by less than the frozen margin
  "PROMOTION_EARNED",   // met every frozen condition — a RECOMMENDATION, never an action
]);

/** Metrics where a LOWER value is better. Extend deliberately; an unknown metric is invalid. */
const LOWER_IS_BETTER = new Set(["brier", "logLoss"]);

/**
 * Every field a registration must carry before it can be evaluated. Each one is something that,
 * left open, would let the result be chosen after the fact.
 */
const REQUIRED = Object.freeze([
  "id", "sport", "state", "candidateVersion", "incumbentVersion",
  "trainingCutoff", "evaluationOpensAt", "featureSources", "eligibility",
  "metric", "minimumDecisiveRows", "minimumCoverage", "requiredImprovement", "registeredAt",
]);

/**
 * Is this registration complete and internally coherent?
 * @returns {{ ok: true } | { ok: false, problems: string[] }}
 */
export function validateRegistration(reg) {
  const problems = [];
  if (!reg || typeof reg !== "object") return { ok: false, problems: ["not an object"] };
  for (const f of REQUIRED) {
    if (reg[f] === undefined || reg[f] === null || reg[f] === "") problems.push(`missing ${f}`);
  }
  if (reg.state && !["PRIOR_OBSERVATION", "PREREGISTERED"].includes(reg.state)) {
    problems.push(`unknown state ${reg.state}`);
  }
  if (reg.metric && !LOWER_IS_BETTER.has(reg.metric)) {
    problems.push(`metric ${reg.metric} has no declared direction — an undirected metric can be read either way after the fact`);
  }
  if (typeof reg.minimumDecisiveRows === "number" && reg.minimumDecisiveRows < 1) {
    problems.push("minimumDecisiveRows must be at least 1");
  }
  if (typeof reg.requiredImprovement === "number" && reg.requiredImprovement <= 0) {
    problems.push("requiredImprovement must be positive — a bar of zero promotes noise");
  }
  /* The evaluation window must open AFTER the training cutoff, or the test has seen its own answer. */
  if (reg.trainingCutoff && reg.evaluationOpensAt && reg.evaluationOpensAt <= reg.trainingCutoff) {
    problems.push(`evaluation opens ${reg.evaluationOpensAt}, on or before the training cutoff ${reg.trainingCutoff}`);
  }
  /* Terms fixed after the window opened are not terms fixed in advance. */
  if (reg.state === "PREREGISTERED" && reg.registeredAt && reg.evaluationOpensAt && reg.registeredAt > reg.evaluationOpensAt) {
    problems.push(`registered ${reg.registeredAt}, after the window opened ${reg.evaluationOpensAt} — that is not a preregistration`);
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}

/**
 * Apply a registration to an observation. PURE — same inputs, same verdict, always.
 *
 * @param {object} reg
 * @param {{ evaluationFrom: string, evaluationTo: string, decisiveRows: number,
 *           eligibleRows: number, candidate: Record<string, number>,
 *           incumbent: Record<string, number> }} obs
 * @returns {{ verdict: string, reasons: string[], delta: number|null, coverage: number|null }}
 */
export function decide(reg, obs) {
  const v = validateRegistration(reg);
  if (!v.ok) return { verdict: "INVALID", reasons: v.problems, delta: null, coverage: null };
  if (!obs || typeof obs !== "object") {
    return { verdict: "INVALID", reasons: ["no observation supplied"], delta: null, coverage: null };
  }

  const reasons = [];

  /*
   * NOT YET, versus CONTAMINATED. Both are refusals and neither may produce a metric, but they call
   * for different actions and so must not share a word. A cohort that ends before the registration's
   * window opens is simply early — the forward test has nothing to score yet, which is the expected
   * state on the day the terms are written. A cohort that reaches back across the training cutoff
   * has scored the model on rows it was fitted to, and every number after that is meaningless.
   */
  if (!obs.evaluationFrom) {
    return { verdict: "INVALID", reasons: ["the observation names no evaluation window"], delta: null, coverage: null };
  }
  if (obs.evaluationTo && obs.evaluationTo < reg.evaluationOpensAt) {
    return {
      verdict: "WINDOW_NOT_OPEN",
      reasons: [`this cohort ends ${obs.evaluationTo} and the registration's window opens ${reg.evaluationOpensAt} — there is nothing to score yet`],
      delta: null, coverage: null,
    };
  }
  if (obs.evaluationFrom <= reg.trainingCutoff) {
    return {
      verdict: "LEAKED",
      reasons: [`the cohort opens ${obs.evaluationFrom} and the candidate was trained through ${reg.trainingCutoff} — it has been scored on rows it was fitted to`],
      delta: null, coverage: null,
    };
  }

  /* A DENOMINATOR IS REQUIRED. Absent or zero eligible rows is not a coverage of 100%. */
  const eligible = obs.eligibleRows;
  if (!Number.isFinite(eligible) || eligible <= 0) {
    return { verdict: "INSUFFICIENT_COVERAGE", reasons: ["no eligible-row denominator was supplied — coverage cannot be computed"], delta: null, coverage: null };
  }
  const decisive = Number.isFinite(obs.decisiveRows) ? obs.decisiveRows : 0;
  const coverage = decisive / eligible;

  if (decisive < reg.minimumDecisiveRows) {
    return {
      verdict: "INSUFFICIENT_SAMPLE",
      reasons: [`${decisive} decisive rows against a frozen minimum of ${reg.minimumDecisiveRows}`],
      delta: null, coverage,
    };
  }
  if (coverage < reg.minimumCoverage) {
    return {
      verdict: "INSUFFICIENT_COVERAGE",
      reasons: [`${(coverage * 100).toFixed(1)}% of eligible events were scored, against a frozen floor of ${(reg.minimumCoverage * 100).toFixed(1)}% — the missing events are not assumed to resemble the scored ones`],
      delta: null, coverage,
    };
  }

  const cand = obs.candidate?.[reg.metric];
  const inc = obs.incumbent?.[reg.metric];
  if (!Number.isFinite(cand) || !Number.isFinite(inc)) {
    return { verdict: "INVALID", reasons: [`${reg.metric} is missing from the candidate or the incumbent`], delta: null, coverage };
  }

  /* Lower is better for every metric this module accepts, so improvement is incumbent − candidate. */
  const delta = inc - cand;

  if (delta <= 0) {
    reasons.push(`${reg.metric} ${cand.toFixed(6)} against the incumbent's ${inc.toFixed(6)} — no improvement`);
    return { verdict: "REJECTED", reasons, delta, coverage };
  }
  if (delta < reg.requiredImprovement) {
    reasons.push(`${reg.metric} improved by ${delta.toFixed(6)}, below the frozen bar of ${reg.requiredImprovement}`);
    return { verdict: "INCONCLUSIVE", reasons, delta, coverage };
  }

  /*
   * THE LAST GATE, AND THE POINT OF THE WHOLE MODULE. A window scored before its terms were fixed
   * cannot earn a promotion however good the number is — otherwise the terms are chosen to fit the
   * result, which is what preregistration exists to prevent.
   */
  if (reg.state !== "PREREGISTERED") {
    reasons.push(`${reg.metric} improved by ${delta.toFixed(6)}, past the bar — but this window was scored before its terms were fixed, so it is context and not a test`);
    return { verdict: "INCONCLUSIVE", reasons, delta, coverage };
  }

  reasons.push(`${reg.metric} improved by ${delta.toFixed(6)} on ${decisive} decisive rows at ${(coverage * 100).toFixed(1)}% coverage, meeting every frozen condition`);
  reasons.push("This is a RECOMMENDATION. Promotion is a separate governed act; the incumbent continues until a person performs it.");
  return { verdict: "PROMOTION_EARNED", reasons, delta, coverage };
}

/** Does this verdict permit anything to change? Exactly one does, and only as a recommendation. */
export const isRecommendation = (verdict) => verdict === "PROMOTION_EARNED";
