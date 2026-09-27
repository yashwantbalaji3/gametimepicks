/**
 * THE MULTI-SPORT CANDIDATE UNIVERSE (Bank Builder / Moonshot) — typed, and honest about zero.
 *
 * 🔴 WHAT THIS EXISTS TO ANSWER. The public Bank Builder and Moonshot pool is MLB-only, and the
 * assumption was that legacy plumbing caused it. The plumbing IS defective, but it is not the binding
 * constraint, and the difference decides what may be fixed tonight.
 *
 * Measured on the frozen 2026-09-27 boards (14 boards, one generatedAt 2026-09-26T23:23:23Z):
 *
 *   NFL player rows carrying a model projection AND a frozen line AND both prices ....... 625
 *   ...of those, in a family whose own published state is PUBLISHED ..................... 360
 *   ...of those, whose player has a CONFIRMED role ........................................ 0
 *
 * Every one of the 280 Sunday NFL players is `AVAILABLE_ROLE_UNCERTAIN` (264) or `QUESTIONABLE` (16).
 * Not one has a confirmed role. So NFL contributes nothing tomorrow — and NOT because of plumbing.
 *
 * ── THE TWO STRUCTURAL DEFECTS, WHICH ARE REAL AND SEPARATE FROM THAT ──────────────────────────
 *
 *   1. `normalize-nfl.mjs` emits ONLY team markets and never reads the player boards, so those 625
 *      priced, projected rows are invisible to the candidate universe. Its own comment and ownerNote
 *      claim "player families publish no line and no price", which was true when written and is now
 *      FALSE — the boards carry `market.line`, `market.overOdds`, `market.underOdds`,
 *      `market.sportsbook` and `market.capturedAt`.
 *   2. The NFL gate applied is the GAME-level `product-eligibility.json`
 *      ("true only for VALIDATED_PICK"), which evaluates the GAME FORECAST. Applying a
 *      game-winner gate to a player-prop leg is a category error: the families carry their OWN
 *      published states in `nfl/model-status.json`, and those were never consulted.
 *
 * Fixing both is model-neutral — it feeds already-published projections and already-captured prices
 * into the existing contract and lets the contract's own gates decide. It does not make NFL eligible.
 *
 * ⚠ THIS MODULE RELAXES NOTHING, AND THE ZERO IS THE POINT. `NO QUALIFYING PLAY` with a typed reason
 * is the correct output. A pool that produced an NFL leg tonight would have had to ignore role
 * certainty, which is the one thing Bank Builder's identity rests on.
 */

/** Exactly the states the founder's report asks for. */
export const CANDIDATE_STATE = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE_MODEL_STATUS: "INELIGIBLE_MODEL_STATUS",
  INELIGIBLE_NO_MODEL_PROBABILITY: "INELIGIBLE_NO_MODEL_PROBABILITY",
  INELIGIBLE_ROLE: "INELIGIBLE_ROLE",
  INELIGIBLE_AVAILABILITY: "INELIGIBLE_AVAILABILITY",
  INELIGIBLE_MARKET: "INELIGIBLE_MARKET",
  INELIGIBLE_SETTLEMENT: "INELIGIBLE_SETTLEMENT",
  INELIGIBLE_FRESHNESS: "INELIGIBLE_FRESHNESS",
  INELIGIBLE_IDENTITY: "INELIGIBLE_IDENTITY",
});

/**
 * Family states that may NOT enter, per the founder's rule: "STOP / REJECTED / PAUSED / HOLDING /
 * UNEVALUATED families may not enter."
 *
 * ⚠ AN ALLOWLIST, NOT A BLOCKLIST. A blocklist admits every state nobody thought of — and this repo
 * has five NFL family states, two of which (`ESTIMATE_BELOW_BAR`, `ROLE_UNCERTAIN`) are plainly
 * below-bar yet appear in no blocklist anywhere. Only states explicitly cleared for product use pass.
 */
export const PRODUCT_CLEARED_FAMILY_STATES = Object.freeze(new Set(["PUBLISHED", "VALIDATED_PICK", "ADOPTED"]));

/**
 * Participation states that establish a CONFIRMED role.
 *
 * ⚠ ALSO AN ALLOWLIST, AND THE REASON IS THE WHOLE FINDING. `AVAILABLE_ROLE_UNCERTAIN` contains the
 * word AVAILABLE, so an availability check passes it while the role is explicitly unknown.
 * Availability is not role — a player can be certain to play and uncertain to carry the ball.
 */
export const ROLE_CONFIRMED_PARTICIPATION = Object.freeze(new Set(["AVAILABLE_ROLE_CONFIRMED", "STARTER", "CONFIRMED"]));
/** Participation states that are an availability problem in their own right. */
export const AVAILABILITY_BLOCKED = Object.freeze(new Set(["QUESTIONABLE", "DOUBTFUL", "OUT", "INACTIVE", "SUSPENDED", "UNKNOWN"]));

/**
 * Settlement support is a TRI-STATE, and flattening it to a boolean overstated the gap.
 *
 * ⚠ "PROVE IT ONCE" IS NOT "BUILD IT". `settle-nfl-live-props.mjs` exists and is scheduled with
 * `--write` in two workflows, so the machinery is armed — it has simply never graded a prop, because
 * props went live on 2026-09-25 and no NFL slate has completed since. Reporting that as
 * INELIGIBLE_SETTLEMENT alongside a family that has no settler at all would tell a founder the two
 * are the same problem. They are one slate apart and a rebuild apart respectively.
 *
 * SCHEDULED_UNPROVEN still blocks: money does not go on a settlement path that has never settled.
 * But it is typed so the distinction survives.
 */
export const SETTLEMENT_SUPPORT = Object.freeze({
  PROVEN: "PROVEN",
  SCHEDULED_UNPROVEN: "SCHEDULED_UNPROVEN",
  UNSUPPORTED: "UNSUPPORTED",
});

/** Precedence for the single `primaryState`. Earlier wins. Availability outranks role: a player who
 *  may not play at all is not usefully described as "role uncertain". */
const PRECEDENCE = Object.freeze([
  CANDIDATE_STATE.INELIGIBLE_IDENTITY,
  CANDIDATE_STATE.INELIGIBLE_MODEL_STATUS,
  CANDIDATE_STATE.INELIGIBLE_MARKET,
  CANDIDATE_STATE.INELIGIBLE_FRESHNESS,
  CANDIDATE_STATE.INELIGIBLE_AVAILABILITY,
  CANDIDATE_STATE.INELIGIBLE_ROLE,
  CANDIDATE_STATE.INELIGIBLE_NO_MODEL_PROBABILITY,
  CANDIDATE_STATE.INELIGIBLE_SETTLEMENT,
]);

/**
 * Evaluate one candidate. Returns EVERY failing gate, not just the first.
 *
 * ⚠ ALL GATES, DELIBERATELY. A first-fail report makes a leg look one fix away from eligible when it
 * is four. The founder is deciding whether NFL can compete; "role" alone would have hidden that these
 * legs also carry no model probability.
 *
 * @param maxPriceAgeMs REQUIRED — staleness has no safe default.
 */
export function evaluateCandidate(c, { asOf, maxPriceAgeMs } = {}) {
  if (!Number.isFinite(maxPriceAgeMs)) throw new Error("evaluateCandidate: maxPriceAgeMs is required — staleness has no safe default");
  const now = Date.parse(asOf ?? "");
  if (!Number.isFinite(now)) throw new Error("evaluateCandidate: asOf must be a parseable instant — never a wall clock in here");

  const failures = [];

  if (!c.participantId || !c.eventId || !c.sport) failures.push(CANDIDATE_STATE.INELIGIBLE_IDENTITY);
  if (!PRODUCT_CLEARED_FAMILY_STATES.has(String(c.familyState ?? ""))) failures.push(CANDIDATE_STATE.INELIGIBLE_MODEL_STATUS);

  /* A binary market has no line; a numeric one must have both. Absence is a market gap, not a zero. */
  const priced = c.binary ? c.price != null : (c.line != null && c.price != null);
  if (!priced) failures.push(CANDIDATE_STATE.INELIGIBLE_MARKET);

  const capturedMs = Date.parse(c.marketCapturedAt ?? "");
  if (priced) {
    if (!Number.isFinite(capturedMs)) failures.push(CANDIDATE_STATE.INELIGIBLE_FRESHNESS);
    else if (now - capturedMs > maxPriceAgeMs) failures.push(CANDIDATE_STATE.INELIGIBLE_FRESHNESS);
  }

  const part = String(c.participation ?? "UNKNOWN");
  if (AVAILABILITY_BLOCKED.has(part)) failures.push(CANDIDATE_STATE.INELIGIBLE_AVAILABILITY);
  else if (!ROLE_CONFIRMED_PARTICIPATION.has(part)) failures.push(CANDIDATE_STATE.INELIGIBLE_ROLE);

  /*
   * ⚠ A DISTRIBUTION IS NOT A PROBABILITY, AND CONVERTING ONE HERE WOULD BE A MODEL CHANGE.
   * The NFL player families publish mean/p10..p90. P(over line) is derivable only under a
   * distributional assumption, which is a gated modelling step (§20's neighbourhood), not plumbing.
   * So a projection without a published probability fails this gate rather than acquiring one.
   * Market-implied probability is explicitly NOT a substitute.
   */
  if (c.modelProbability == null) failures.push(CANDIDATE_STATE.INELIGIBLE_NO_MODEL_PROBABILITY);

  if (c.settlementSupport !== SETTLEMENT_SUPPORT.PROVEN) failures.push(CANDIDATE_STATE.INELIGIBLE_SETTLEMENT);

  const primaryState = PRECEDENCE.find((s) => failures.includes(s)) ?? CANDIDATE_STATE.ELIGIBLE;
  return {
    ...c,
    states: failures.length ? failures : [CANDIDATE_STATE.ELIGIBLE],
    primaryState,
    eligible: failures.length === 0,
    priceAgeMs: Number.isFinite(capturedMs) ? now - capturedMs : null,
    /* Carried through so a report can separate "one slate away" from "not built". */
    settlementSupport: c.settlementSupport ?? SETTLEMENT_SUPPORT.UNSUPPORTED,
  };
}

/** Fold a universe into the report shape, by sport and by family. */
export function foldUniverse(evaluated) {
  const bySport = {}, byFamily = {}, byPrimary = {};
  let eligible = 0;
  for (const e of evaluated) {
    const s = e.sport ?? "(unknown)";
    bySport[s] = bySport[s] ?? { total: 0, eligible: 0, byPrimary: {} };
    bySport[s].total += 1;
    bySport[s].byPrimary[e.primaryState] = (bySport[s].byPrimary[e.primaryState] ?? 0) + 1;
    const f = `${s}/${e.marketFamily ?? "(none)"}`;
    byFamily[f] = byFamily[f] ?? { total: 0, eligible: 0, familyState: e.familyState ?? null };
    byFamily[f].total += 1;
    byPrimary[e.primaryState] = (byPrimary[e.primaryState] ?? 0) + 1;
    if (e.eligible) { eligible += 1; bySport[s].eligible += 1; byFamily[f].eligible += 1; }
  }
  return {
    total: evaluated.length,
    eligible,
    rejected: evaluated.length - eligible,
    /* ⚠ Zero eligible is a RESULT. NO QUALIFYING PLAY is a valid product output. */
    verdict: eligible > 0 ? "CANDIDATES_AVAILABLE" : "NO_QUALIFYING_PLAY",
    byPrimary, bySport, byFamily,
  };
}
