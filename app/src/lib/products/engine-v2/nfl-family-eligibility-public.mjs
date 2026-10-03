/**
 * NFL FAMILY ELIGIBILITY — the PUBLIC projection of the family-level product gate (Session 9 · G).
 *
 * The gate (family-gate.mjs) is computed from the slate's own receipts and lives inside the universe, which
 * nothing public may read. Ask must still be able to answer "why isn't NFL in today's Bank Builder?" from
 * the SAME evidence — so this module republishes it in plain public terms: one row per family, each blocker
 * as a public code + the sentence that states it + the condition that would clear it, and the evidence
 * numbers behind it. Nothing is restated by hand: change the gate's evidence and this changes with it.
 *
 * Words the Ask projection refuses (FORBIDDEN_ASK_FIELDS) never appear here; a test pins that.
 */
export const NFL_FAMILY_ELIGIBILITY_SCHEMA = "nfl-family-eligibility@1";

export const FAMILY_LABEL = Object.freeze({
  anytime_td: "Anytime touchdown",
  player_pass_yds: "Passing yards",
  player_rush_yds: "Rushing yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
});

/** gate blocker → { code, says, clearsWhen } in public language. Unknown blockers fail closed (kept, generic). */
export const PUBLIC_BLOCKER = Object.freeze({
  FAMILY_NOT_PUBLISHED: { code: "BELOW_PUBLICATION_BAR", says: "the model for this market has not cleared its own publication bar", clearsWhen: "the model clears its publication bar on fresh evidence" },
  NO_MODEL_PROBABILITY: { code: "PROJECTION_ONLY", says: "GameTimePicks publishes a projected range for this market, not a calibrated probability", clearsWhen: "a calibrated probability model for the market passes its own validation (a projection is never turned into a probability)" },
  MODEL_FORWARD_BREACHED: { code: "FORWARD_TEST_FAILED", says: "the model's live 2026 forward test is outside its bars", clearsWhen: "a new model passes a new forward test" },
  MODEL_FORWARD_ACCUMULATING: { code: "FORWARD_TEST_IN_PROGRESS", says: "the model's live 2026 forward test has not reached its sample size, so it has no verdict yet", clearsWhen: "the forward test reaches its sample size and passes its bars" },
  MODEL_FORWARD_UNREGISTERED: { code: "NO_FORWARD_TEST", says: "the published model has no live forward test registered", clearsWhen: "a forward test is registered and passes" },
  ROLE_CONFIRMATION_UNAVAILABLE: { code: "ROLE_NOT_CONFIRMED", says: "no player's game-day role is positively confirmed before kickoff — being listed as not out is not the same as a confirmed role", clearsWhen: "a pregame source positively confirms each player's role for this market" },
  PRICES_NOT_CAPTURED: { code: "NO_PREGAME_PRICES", says: "no real pre-kickoff sportsbook price is held for this market on this slate", clearsWhen: "real sportsbook prices are captured before kickoff" },
  SETTLEMENT_NOT_PROVEN: { code: "SETTLEMENT_NOT_PROVEN", says: "this market has not yet been graded end to end through the automatic settlement path", clearsWhen: "the automatic post-game settlement grades this market and reaches its final, reconciled state" },
  NO_FOUNDER_GRANT: { code: "NOT_APPROVED_FOR_PRODUCTS", says: "the market has not been approved for official products", clearsWhen: "every other condition clears and the market is explicitly approved for official products" },
});

const PRODUCTS = Object.freeze([
  { key: "bank-builder", label: "Bank Builder" },
  { key: "moonshot", label: "Moonshot" },
  { key: "suggested-parlays", label: "Suggested Parlays" },
]);

const round = (x, d = 3) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function publicBlocker(b) {
  const p = PUBLIC_BLOCKER[b];
  return p ? { ...p } : { code: "OTHER_CONDITION", says: "another product condition is not met", clearsWhen: "that condition clears" };
}

/**
 * @param {object} o
 * @param {Array}  o.gates     deriveNflFamilyGates() rows for the slate
 * @param {{from:string|null, to:string|null, events:number}} o.slate
 * @param {string} o.generatedAt
 * @param {string} o.sportState  the sport registry state (NFL: EXPERIMENTAL_PUBLIC)
 * @param {{capturedAt:string|null, maxAgeHours:number}|null} [o.prices]  the latest pregame prop-price capture and
 *   the product freshness rule. A held price is not a FRESH price: products refuse one older than maxAgeHours at
 *   activation (LEG_BOUNDS), so the record says when prices were captured instead of implying "current".
 */
export function buildPublicFamilyEligibility({ gates, slate, generatedAt, sportState, prices = null }) {
  const families = (gates ?? []).map((g) => {
    const f = g.evidence?.forward ?? null;
    const s = g.evidence?.slate ?? {};
    const eligible = g.state === "PRODUCT_ELIGIBLE";
    return {
      family: g.family,
      label: FAMILY_LABEL[g.family] ?? g.family,
      eligibleForOfficialProducts: eligible,
      gtpProbability: (s.modelProbability ?? 0) > 0,
      blockers: (g.blockers ?? []).map(publicBlocker),
      evidence: {
        forwardTest: f ? { state: f.state, n: f.n ?? null, needed: f.needed ?? null, calibrationLevel: round(f.metrics?.level), ece: round(f.metrics?.ece) } : null,
        slate: { candidates: s.candidates ?? 0, withGtpProbability: s.modelProbability ?? 0, roleConfirmed: s.roleConfirmed ?? 0, priced: s.priced ?? 0 },
        settlementProven: s.settlementProven === true,
      },
    };
  });
  const anyEligible = families.some((f) => f.eligibleForOfficialProducts);
  return {
    schema: NFL_FAMILY_ELIGIBILITY_SCHEMA,
    artifact: "nfl-family-eligibility",
    dataClass: "PUBLIC_DERIVED",
    generatedAt,
    slate,
    prices: prices ? { capturedAt: prices.capturedAt ?? null, maxAgeHoursForProducts: prices.maxAgeHours ?? null } : null,
    sport: {
      state: sportState,
      says: sportState === "FULL_MODEL"
        ? "NFL is admitted to official products sport-wide"
        : "NFL is not admitted to official products sport-wide; a single market may enter only when every condition below clears for it",
    },
    products: PRODUCTS.map((p) => ({ ...p, nflEligible: anyEligible, reason: anyEligible ? "at least one NFL market cleared every condition" : families.length ? "no NFL market has cleared every condition" : "no NFL slate is published yet" })),
    families,
    howToRead: "Each market lists every condition it does not meet, in plain words, with the evidence behind it and what would clear it. A cleared condition simply disappears from the list; nothing here is a pick.",
  };
}
