/**
 * FOUNDER DECISION CARDS — the five open gates, answerable in one sitting (P199 · Release D).
 *
 * Queue-zero left exactly five FOUNDER_DECISION items, and a decision nobody can answer in under
 * a minute is a decision that waits a month. Each card carries the closed set of ANSWER TOKENS
 * (copy-paste, no free text to misparse), what each answer does, what engineering has already
 * completed while waiting, and the exact validation command that proves the answer landed.
 *
 * DERIVED, NOT PARALLEL: every card names the closure-packet queue item it answers, and the guard
 * proves the two sets match one-to-one — a card without a queue item is an invented decision, a
 * queue item without a card is a decision nobody can answer. Answers are decisions, never
 * secrets: no token here is a credential, and the never-share rule is printed on the box.
 */

export const FOUNDER_DECISIONS_VERSION = 1;

/** Dependency order: earlier answers unlock more. Each `queueItem` is `${sport}:${stage}`. */
export const FOUNDER_DECISIONS = Object.freeze([
  {
    id: "decision-nfl-participation-rights",
    queueItem: "nfl:products",
    sport: "nfl",
    title: "NFL actives / depth-chart rights",
    question: "May we license an official actives/inactives + depth-chart source, and which?",
    answerTokens: ["APPROVE:<provider-name>", "DEFER", "REJECT"],
    expectedTime: "20-40 min of terms reading, or one word: DEFER",
    consequence: "APPROVE names the provider; engineering wires the completed source-neutral adapter (fields, freshness, cutoff, refusal already built — participation.mjs) and End Zone Vault's ACTIVE branch becomes reachable. DEFER keeps products at typed NO_PLAY (a valid product answer). REJECT parks the ACTIVE branch for the season.",
    engineeringComplete: "source-neutral participation interface with typed states; ACTIVE_CONFIRMED unreachable without the source (guarded); Vault writes dated NO_PLAY receipts daily; regular-season input matrix carries the cap as a design fact",
    validation: "npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nfl-participation-rights --token <answer>",
    neverShare: "no credentials in the answer — a provider NAME only; keys move through the secrets channel, never this box",
  },
  {
    id: "decision-nba-markets-authorization",
    queueItem: "nba:markets",
    sport: "nba",
    title: "NBA odds authorization",
    question: "Authorize an NBA-scoped Odds API receipt (sport key, markets, credit ceiling, validity window)?",
    answerTokens: ["AUTHORIZE:h2h:<ceiling-credits>", "DEFER"],
    expectedTime: "5 min (plan check + one authorization)",
    consequence: "AUTHORIZE creates the NBA receipt on the UFC/EPL pattern (bulk-only, own ledger, own ceiling — another sport's receipt cannot serve, in both directions). DEFER keeps markets PARTIAL with the adapter and cost guards waiting.",
    engineeringComplete: "provider-neutral adapter + no-vig snapshot contract, sanitized fixtures, dry-run default, hard ceiling machinery, per-sport ledger isolation — the first call is planned before it happens",
    validation: "npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nba-markets-authorization --token <answer>",
    neverShare: "the ceiling is a number, not a key; ODDS_API_KEY already lives in secrets and is never restated here",
  },
  {
    id: "decision-nba-model-investment",
    queueItem: "nba:model",
    sport: "nba",
    title: "NBA model investment under the stopping rule",
    question: "Proceed with NBA model R&D under the MLB stopping rule, or defer?",
    answerTokens: ["PROCEED", "DEFER"],
    expectedTime: "one decision; the stopping rule does the rest",
    consequence: "PROCEED unlocks fitting AFTER a preregistered evaluation contract is frozen (see the calibration card — that plan comes first, by rule). DEFER keeps the versioned baseline and model card as private research with activation OFF.",
    engineeringComplete: "corpus + baseline evaluation + model card versioned in the shared registry (HISTORICAL_REPLAY enforced, publicActivation OFF asserted); the NFL regular-season contract is the committed template for the bar",
    validation: "npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nba-model-investment --token <answer>",
    neverShare: "n/a — a one-word decision",
  },
  {
    id: "decision-nba-calibration-plan",
    queueItem: "nba:calibration",
    sport: "nba",
    title: "NBA preregistered calibration plan",
    question: "Approve the preregistered evaluation plan (frozen bars before any fit), or defer?",
    answerTokens: ["APPROVE_PLAN", "DEFER"],
    expectedTime: "10 min reading the template",
    consequence: "APPROVE_PLAN has engineering freeze an NBA evaluation contract in the sport's own terms (walk-forward, minimum sample, coverage bands, market comparison reported, stopping rule inherited) in its own commit with the sha recorded. DEFER leaves calibration BLOCKED_EXTERNAL — the honest current state.",
    engineeringComplete: "the contract TEMPLATE exists and is proven (NFL regular-season contract, sha 3451d1a0d6bd593c); corruption guards for evaluation artifacts already fire",
    validation: "npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nba-calibration-plan --token <answer>",
    neverShare: "n/a",
  },
  {
    id: "decision-nba-publication-scope",
    queueItem: "nba:publication",
    sport: "nba",
    title: "NBA publication scope",
    question: "Confirm the public scope: schedule-only (current), private research, or future public beta?",
    answerTokens: ["SCHEDULE_ONLY", "PRIVATE_RESEARCH_ONLY", "PLAN_PUBLIC_BETA"],
    expectedTime: "one decision",
    consequence: "SCHEDULE_ONLY confirms today's state as policy (the /sports section stays the surface). PLAN_PUBLIC_BETA queues hub work BEHIND the model/calibration gates — a page cannot precede its evidence. PRIVATE_RESEARCH_ONLY removes nothing public (nothing model-ish is public today).",
    engineeringComplete: "tier derivation refuses to read private research as a public surface (SCHEDULE_ONLY derived); the first-event activation checklist names the publication order; forbidden-claims list pinned in tests",
    validation: "npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nba-publication-scope --token <answer>",
    neverShare: "n/a",
  },
]);

/** The one-to-one law: cards ↔ founder queue items. Both directions checked; returns problems. */
export function reconcileDecisionsWithQueue(founderQueueItems) {
  const cardItems = new Set(FOUNDER_DECISIONS.map((d) => d.queueItem));
  const queueItems = new Set(founderQueueItems.map((q) => `${q.sport}:${q.stage}`));
  const problems = [];
  for (const c of cardItems) if (!queueItems.has(c)) problems.push(`card for ${c} has no founder-queue item — an invented decision`);
  for (const q of queueItems) if (!cardItems.has(q)) problems.push(`founder-queue item ${q} has no card — a decision nobody can answer`);
  return problems;
}
