/**
 * THE QUESTIONS ASK OFFERS — starters and follow-ups — from ONE allowlist (Session 3).
 *
 * STARTERS ARE PROMISES (Session 2). Each one is a question the grounded pipeline was asked on Production and answered
 * from an owner; nothing here advertises a capability Ask does not have.
 *
 * ⚠ FOLLOW-UPS WERE NOT (Session 2 backlog, Session 3 Production). The writer wrote them freely, so they offered
 * questions Ask cannot answer ("results for MLB player-prop leans", a market-context family it never lists), statements
 * that are not questions ("Check live MLB game statuses."), and — the founder's "duplicate action" — the link chip
 * restated as a follow-up ("Open the MLB game report" beside the "Open the MLB game report" link). A follow-up is now
 * picked from this same verified list by what the reader just asked, and never repeats the question.
 */
export const ASK_STARTER_GROUPS = Object.freeze([
  { label: "Today", prompts: ["What are today's GameTime forecasts?", "Which MLB games are live right now?"] },
  { label: "How it went", prompts: ["How did GameTimePicks do yesterday?", "What is Bank Builder's record?"] },
  { label: "Dig in", prompts: ["Compare the Yankees and the Red Sox", "Build me a medium-risk card"] },
]);

const Q = Object.freeze({
  forecasts: "What are today's GameTime forecasts?",
  live: "Which MLB games are live right now?",
  yesterday: "How did GameTimePicks do yesterday?",
  bankBuilder: "What is Bank Builder's record?",
  card: "Build me a medium-risk card",
});

/* What a reader plausibly wants NEXT, by what they just asked. Every entry is a starter above. */
const NEXT_BY_INTENT = Object.freeze({
  PUBLISHED_FORECAST: [Q.live, Q.yesterday],
  LIVE_STATUS: [Q.forecasts, Q.yesterday],
  RESULTS_PRODUCT_RECORD: [Q.yesterday, Q.forecasts],
  RESULTS_FORECAST_RECORD: [Q.bankBuilder, Q.forecasts],
  RESULTS_RECENT: [Q.bankBuilder, Q.forecasts],
  RESULTS_PENDING: [Q.yesterday, Q.forecasts],
  PARLAY_REQUEST: [Q.bankBuilder, Q.forecasts],
  BANKROLL_PARLAY_REQUEST: [Q.bankBuilder, Q.forecasts],
  TEAM_COMPARE: [Q.forecasts, Q.live],
  PLAYER_COMPARE: [Q.forecasts, Q.yesterday],
});
const DEFAULT_NEXT = Object.freeze([Q.forecasts, Q.yesterday]);

const fold = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * @param {string|null|undefined} intent  the planner's intent
 * @param {string} question  what the reader just asked — never offered back to them
 * @returns {string[]}
 */
export function supportedFollowUps(intent, question) {
  const asked = fold(question);
  return (NEXT_BY_INTENT[intent] ?? DEFAULT_NEXT).filter((q) => fold(q) !== asked).slice(0, 2);
}

/** Every question Ask may offer, for the guard that keeps follow-ups inside the starters. */
export const ASK_OFFERED_QUESTIONS = Object.freeze(ASK_STARTER_GROUPS.flatMap((g) => g.prompts));
