/**
 * STAGE 4 · THE CANONICAL PRODUCT ELIGIBILITY / MATURITY CONTRACT (schema 1, founder-decided 2026-10-07 03:21Z).
 * Slice 4A ships it unwired (a test pins the importer list); 4B–4D move readers onto it.
 *
 * ONE ANSWER TO "WHAT IS THIS FORECAST FAMILY, AND MAY THIS PRODUCT USE IT?"
 *
 * Today that answer is assembled separately by at least eight owners, each with its own vocabulary:
 * the sport capability registry, the market-coverage registry (demoted families), the MLB calibration
 * verdicts, the live-record pause gate, the family product gate, the eligible-leg contract (v1), the
 * engine-v2 leg floor, and the command-center public model states. See
 * protocol/lane-c/stage4/CALL_SITE_INVENTORY.md.
 *
 * This module does not replace any of them. It COMPOSES their outputs, which the caller passes in, into
 * one record:
 *   { maturity, displayable, eligible, reasonCode, reasonCodes, reasonText, freshness, availability,
 *     sportState, familyState, probability: { gtp, marketImplied }, decidedAt, frozenPregame }
 *
 * WHAT IS SETTLED HERE (invariants already in force; each one has a test):
 *   · Missing or ambiguous critical metadata fails CLOSED for promoted products (protocol §18).
 *   · A demoted, paused, experimental, research or retired family is never product-eligible
 *     (roadmap §10 "Do not").
 *   · A market-implied probability is never reported as a GameTimePicks probability.
 *   · Every refusal carries ALL its reason codes (no first-fail), one primary code, and public text.
 *   · No identity is inferred (Stage 3 Q5 EXCLUDE): missing identity refuses, it is never filled in.
 *   · A decision used for later evaluation is taken before the start and never after (Stage 3 Q1/Q3).
 *   · Forecasting continues regardless: `displayable` is decided separately from `eligible`.
 *
 * FOUNDER DECISIONS (Yash, 2026-10-07 03:21Z, Founder Decision Packet P0+P1, Stage 4 Q1–Q9):
 *   Q1 YES   `displayable` (may be shown) is separate from `eligible` (may be used in this product).
 *   Q2 YES   Five maturity words; the LEAST mature applicable layer wins (MATURITY_FROM_SOURCE). Research or
 *            Experimental never stops forecasting: forecast broadly, promote cautiously.
 *   Q3 CLOSED  Unreadable authoritative status (coverage) → promoted products refuse (COVERAGE_UNKNOWN).
 *   Q4 SPLIT   Missing/stale scorecard: display degrades gracefully (no verdict, no pause); promotion refuses.
 *   Q5 PER-PRODUCT  One central freshness table (FRESHNESS): money/promoted products strict, paper/research
 *            cards looser. Live odds are NOT covered: they will need minutes-scale, event-state freshness.
 *   Q6 EXPERIMENTAL  UFC's sport row is corrected to experimental (slice 4D, with the UFC department); that never
 *            makes UFC product-eligible on its own.
 *   Q7 ALL   A fresh BREACHED verdict maps to Paused on every sport.
 *   Q8 MODEL-ONLY  The scorecard speaks only for legs that carry a GameTimePicks model probability; a paused call
 *            does not remove price-only legs that do not consume it.
 *   Q9 DISPLAY  A Top Board is a ranked DISPLAY of forecasts, not a product. Its verdict is computed on its own
 *            and never grants eligibility to any product; predictions reach products only through this contract.
 * Market-priced legs (F1 = A, 2026-09-22): admission is product policy, passed in as `marketImpliedAdmitted`.
 *
 * Pure: no fs, no clock (asOf is an argument), no imports.
 */

export const PRODUCT_STATUS_SCHEMA_VERSION = 1; // founder-decided 2026-10-07 (Q1–Q9)

/** The roadmap's maturity words (roadmap §2.1, protocol §16) plus the fail-closed UNKNOWN. */
export const MATURITY = Object.freeze({
  RESEARCH: "RESEARCH",
  EXPERIMENTAL: "EXPERIMENTAL",
  ESTABLISHED: "ESTABLISHED",
  PAUSED: "PAUSED",
  RETIRED: "RETIRED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Products a status can be asked about. "forecast" is the plain published forecast (display); the rest
 * are PROMOTED products, where missing metadata fails closed. TOP_BOARD and LAB_CARD are displays (Q9; paper/research
 * cards): they follow display rules plus their own pregame, availability and freshness checks, and never promote.
 */
export const PRODUCT = Object.freeze({
  FORECAST: "forecast",
  TOP_BOARD: "top_board",
  SUGGESTED_PARLAY: "suggested_parlay",
  BANK_BUILDER: "bank_builder",
  MOONSHOT: "moonshot",
  BUILD_YOUR_OWN: "build_your_own",
  LAB_CARD: "lab_card",
});
const PROMOTED = new Set([PRODUCT.SUGGESTED_PARLAY, PRODUCT.BANK_BUILDER, PRODUCT.MOONSHOT, PRODUCT.BUILD_YOUR_OWN]);

const H = 3600e3;
/**
 * Q5 PER-PRODUCT · THE one pregame freshness table. Price age: money/promoted products 12 h (the leg floor's
 * LEG_BOUNDS.maxPriceAgeMs), paper lab cards 3 days (card-leg-eligibility PRICE_MAX_AGE_DAYS). Top Boards rank
 * forecasts and use no price. Scorecard age: 72 h (live-record-gate maxAgeHours). Slice 4C points the two existing
 * constants at this table. LIVE odds are deliberately absent: they need minutes-scale, event-state freshness and
 * must never inherit a pregame number from here.
 */
export const FRESHNESS = Object.freeze({
  priceMaxAgeMs: Object.freeze({
    [PRODUCT.SUGGESTED_PARLAY]: 12 * H, [PRODUCT.BANK_BUILDER]: 12 * H, [PRODUCT.MOONSHOT]: 12 * H, [PRODUCT.BUILD_YOUR_OWN]: 12 * H,
    [PRODUCT.LAB_CARD]: 3 * 24 * H,
  }),
  scorecardMaxAgeMs: 72 * H,
});

/**
 * Canonical reason codes. Names are REUSED from engine-v2 EXCLUSION wherever one exists, so adopting this
 * contract renames as little as possible. Crosswalk to v1 REASON / CANDIDATE_STATE / FAMILY_BLOCKER is
 * in CONTRACT_OPTIONS.md §3.
 */
export const REASON = Object.freeze({
  SPORT_UNKNOWN: "SPORT_UNKNOWN",
  SPORT_GATED: "SPORT_GATED",
  IDENTITY_MISSING: "IDENTITY_MISSING",
  COVERAGE_UNKNOWN: "COVERAGE_UNKNOWN",
  MODEL_DEMOTED: "MODEL_DEMOTED",
  MODEL_PAUSED: "MODEL_PAUSED",
  MODEL_RETIRED: "MODEL_RETIRED",
  MODEL_NOT_PUBLIC: "MODEL_NOT_PUBLIC", // research / shadow / private
  MODEL_EXPERIMENTAL: "MODEL_EXPERIMENTAL",
  MATURITY_UNKNOWN: "MATURITY_UNKNOWN",
  HEALTH_UNKNOWN: "HEALTH_UNKNOWN",
  MARKET_IMPLIED_NOT_ADMITTED: "MARKET_IMPLIED_NOT_ADMITTED",
  NO_PROBABILITY: "NO_PROBABILITY",
  AVAILABILITY_BLOCKED: "AVAILABILITY_BLOCKED",
  ROLE_UNCERTAIN: "ROLE_UNCERTAIN",
  MARKET_MISSING: "MARKET_MISSING",
  ODDS_STALE: "ODDS_STALE",
  ODDS_CAPTURED_AFTER_START: "ODDS_CAPTURED_AFTER_START",
  EVENT_START_UNKNOWN: "EVENT_START_UNKNOWN",
  EVENT_STARTED: "EVENT_STARTED",
  SETTLEMENT_UNSUPPORTED: "SETTLEMENT_UNSUPPORTED",
});

/** Primary-code precedence: identity and existence first, then model standing, then the leg's own data. */
const PRECEDENCE = [
  REASON.SPORT_UNKNOWN, REASON.IDENTITY_MISSING, REASON.EVENT_START_UNKNOWN, REASON.EVENT_STARTED,
  REASON.COVERAGE_UNKNOWN, REASON.MATURITY_UNKNOWN, REASON.HEALTH_UNKNOWN,
  REASON.MODEL_RETIRED, REASON.MODEL_PAUSED, REASON.MODEL_DEMOTED, REASON.MODEL_NOT_PUBLIC, REASON.MODEL_EXPERIMENTAL,
  REASON.SPORT_GATED, REASON.MARKET_IMPLIED_NOT_ADMITTED, REASON.NO_PROBABILITY,
  REASON.AVAILABILITY_BLOCKED, REASON.ROLE_UNCERTAIN,
  REASON.MARKET_MISSING, REASON.ODDS_CAPTURED_AFTER_START, REASON.ODDS_STALE, REASON.SETTLEMENT_UNSUPPORTED,
];

/** Public text per code. Plain words; never a raw code on a page. Stage 2 tone; copy-reviewed with the 4D slice. */
export const REASON_TEXT = Object.freeze({
  SPORT_UNKNOWN: "This sport is not covered.",
  SPORT_GATED: "This sport's forecasts are published as experimental and do not enter promoted products.",
  IDENTITY_MISSING: "We could not confirm exactly which game or player this is, so it is left out.",
  COVERAGE_UNKNOWN: "Its status could not be read, so it is left out until it can.",
  MODEL_DEMOTED: "The model behind this market lost to the sportsbook on past results, so it is shown as market context, not a GameTimePicks call.",
  MODEL_PAUSED: "This call is paused: its live record is below its floor. It is still made and graded.",
  MODEL_RETIRED: "This model is retired; its history stays published.",
  MODEL_NOT_PUBLIC: "This is research output and does not power a public product.",
  MODEL_EXPERIMENTAL: "This forecast is experimental: published and graded, not yet established.",
  MATURITY_UNKNOWN: "Its model status could not be confirmed, so it is left out.",
  HEALTH_UNKNOWN: "Its live record could not be confirmed as current, so it is left out of promoted products.",
  MARKET_IMPLIED_NOT_ADMITTED: "Only a sportsbook price exists here, and this product does not use price-only legs.",
  NO_PROBABILITY: "No usable probability exists for this one.",
  AVAILABILITY_BLOCKED: "The player's availability is not confirmed.",
  ROLE_UNCERTAIN: "The player's role is not confirmed.",
  MARKET_MISSING: "No usable price was captured.",
  ODDS_STALE: "The captured price is too old.",
  ODDS_CAPTURED_AFTER_START: "The price was captured after the start.",
  EVENT_START_UNKNOWN: "The start time is unknown.",
  EVENT_STARTED: "It has already started.",
  SETTLEMENT_UNSUPPORTED: "We cannot yet grade this market from official results.",
});

/**
 * DECIDED (Q2 YES, 2026-10-07). Source-vocabulary word → maturity, as tabled in CONTRACT_OPTIONS.md §2.
 * Keys are `<vocabulary>:<word>`. Anything unlisted maps to UNKNOWN, which fails closed for promotion.
 */
export const MATURITY_FROM_SOURCE = Object.freeze({
  // sport capability registry (sport-capability-registry.ts)
  "registry:FULL_MODEL": MATURITY.ESTABLISHED,
  "registry:EXPERIMENTAL_PUBLIC": MATURITY.EXPERIMENTAL,
  "registry:RESEARCH_ONLY": MATURITY.RESEARCH,
  "registry:HISTORICAL_ONLY": MATURITY.RETIRED,
  "registry:SCAFFOLD_ONLY": MATURITY.RESEARCH,
  // coverage registry (market-coverage.ts MarketStatus) + its demoted-family join
  "coverage:supported": MATURITY.ESTABLISHED,
  "coverage:conditional": MATURITY.ESTABLISHED,
  "coverage:experimental": MATURITY.EXPERIMENTAL,
  "coverage:demoted": MATURITY.RESEARCH, // DEMOTE_TO_MARKET_CONTEXT: still forecast + graded, never promoted
  // live-record scorecard (admin/model-health.json)
  "health:BREACHED": MATURITY.PAUSED,
  // command-center PublicModelState
  "public:VALIDATED": MATURITY.ESTABLISHED,
  "public:EXPERIMENTAL": MATURITY.EXPERIMENTAL,
  "public:FORWARD_TEST": MATURITY.EXPERIMENTAL,
  "public:ESTIMATE": MATURITY.EXPERIMENTAL,
  "public:SHADOW": MATURITY.RESEARCH,
  "public:PAUSED": MATURITY.PAUSED,
});

/**
 * Q8 MODEL-ONLY (decided 2026-10-07). The live-record scorecard grades GameTimePicks calls, so it speaks only for legs
 * that carry a GameTimePicks model probability. A price-only leg (F1 market construction) is not paused by it and
 * does not need it.
 */
export const LIVE_RECORD_SCOPE = "MODEL_ONLY";

const RANK = { RETIRED: 0, PAUSED: 1, UNKNOWN: 2, RESEARCH: 3, EXPERIMENTAL: 4, ESTABLISHED: 5 };

/**
 * The family's maturity is the LEAST mature of the layers that speak about it. A sport at FULL_MODEL
 * cannot lift a demoted family; a passing family cannot lift an experimental sport.
 */
export function deriveMaturity(sourceWords) {
  const mapped = (sourceWords ?? []).filter(Boolean).map((w) => MATURITY_FROM_SOURCE[w] ?? MATURITY.UNKNOWN);
  if (!mapped.length) return MATURITY.UNKNOWN;
  return mapped.reduce((lo, m) => (RANK[m] < RANK[lo] ? m : lo));
}

/**
 * Participation crosswalk (Product Engine, 2026-10-07; part of the Q1/Q2 contract). The repo has ~12 availability / role / lineup
 * vocabularies (NFL participation, NFL role evidence + confirmation, the injury feed in title case, the cross-sport
 * lineup contract, MLB lowercase lineup words, FPL, NBA minutes, UFC bout states). The first prototype matched three
 * upper-case words and let an availability word stand in for a role, so OFFICIAL_LINEUP, ROLE_CONFIRMED and MLB
 * "confirmed" were refused as ROLE_UNCERTAIN and CONFIRMED_OUT / Injured Reserve as ROLE_UNCERTAIN instead of
 * AVAILABILITY_BLOCKED. Matching is case-insensitive. Anything unlisted is UNCERTAIN (fails closed), never CONFIRMED.
 *   BLOCKED   → AVAILABILITY_BLOCKED (the player may not play)
 *   CONFIRMED → passes (an official lineup or an explicitly confirmed role)
 *   UNCERTAIN → ROLE_UNCERTAIN (expected, projected, probable, stale or unknown)
 */
export const PARTICIPATION = Object.freeze({ BLOCKED: "BLOCKED", CONFIRMED: "CONFIRMED", UNCERTAIN: "UNCERTAIN" });
const P = PARTICIPATION;
export const PARTICIPATION_FROM_SOURCE = Object.freeze({
  // blocked: out, inactive, injured, suspended, not on roster, bout off
  OUT: P.BLOCKED, CONFIRMED_OUT: P.BLOCKED, INACTIVE: P.BLOCKED, DOUBTFUL: P.BLOCKED, QUESTIONABLE: P.BLOCKED,
  "INJURED RESERVE": P.BLOCKED, SUSPENSION: P.BLOCKED, SUSPENDED: P.BLOCKED, INJURED: P.BLOCKED, UNAVAILABLE: P.BLOCKED,
  NOT_ON_ROSTER: P.BLOCKED, AVAILABILITY_BLOCKED: P.BLOCKED, "DAY-TO-DAY": P.BLOCKED,
  BOUT_CANCELLED: P.BLOCKED, REPLACEMENT_PENDING: P.BLOCKED,
  // confirmed: an official lineup or an explicitly confirmed role
  OFFICIAL_LINEUP: P.CONFIRMED, CONFIRMED: P.CONFIRMED, POSTED: P.CONFIRMED, ROLE_CONFIRMED: P.CONFIRMED,
  AVAILABLE_ROLE_CONFIRMED: P.CONFIRMED, ACTIVE_CONFIRMED: P.CONFIRMED, STARTER: P.CONFIRMED,
  // everything else, including EXPECTED_STARTER, PROJECTED_DEPTH_STARTER (the role gate does not accept these
  // today, role-confirmation.mjs:39), LIMITED, DEPTH_ONLY, SOURCE_STALE, PROJECTED_LINEUP, ACTIVE (injury feed
  // "Active" says only "not on the report"), falls to UNCERTAIN by omission.
});
export function participationOf(word) {
  if (word == null || word === "") return P.UNCERTAIN;
  return PARTICIPATION_FROM_SOURCE[String(word).trim().toUpperCase()] ?? P.UNCERTAIN;
}

/** Price checks shared by promoted products and lab cards; age limit from FRESHNESS unless a test overrides it. */
function priceChecks(i, codes, { asOfMs, startMs }) {
  const maxAge = Number.isFinite(i.maxPriceAgeMs) ? i.maxPriceAgeMs : FRESHNESS.priceMaxAgeMs[i.product];
  const capMs = Date.parse(i.market?.capturedAt ?? "");
  if (i.market?.price == null || !Number.isFinite(capMs)) { codes.add(REASON.MARKET_MISSING); return; }
  if (Number.isFinite(startMs) && capMs >= startMs) codes.add(REASON.ODDS_CAPTURED_AFTER_START);
  if (!Number.isFinite(maxAge) || asOfMs - capMs > maxAge) codes.add(REASON.ODDS_STALE);
}

/**
 * Resolve one status record.
 *
 * @param {object} i
 * @param {string} i.product                 PRODUCT value
 * @param {string} i.asOf                    the decision instant (never a wall clock)
 * @param {string|null} i.sport
 * @param {string|null} i.family             the sport's family key (e.g. batter_hits, nfl_winner)
 * @param {string|null} i.eventId
 * @param {string|null} i.eventStartUtc      rescheduled canonical start when postponed (Stage 3 Q1)
 * @param {string|null} i.registryState      sport capability registry state, or null when unknown
 * @param {{status:string, demoted:boolean}|null} i.coverage   coverage row for the family; null = unreadable
 * @param {{state:string|null, generatedAt:string|null}|null} i.health  scorecard entry; null = no entry
 * @param {string|null} [i.publicState]      command-center PublicModelState, when one exists
 * @param {boolean} [i.familyGranted]        an active founder family grant with zero blockers
 * @param {"MODEL"|"MARKET_IMPLIED"|"NONE"} i.probabilityKind
 * @param {number|null} [i.gtpProbability]
 * @param {number|null} [i.marketImpliedProbability]
 * @param {boolean} [i.marketImpliedAdmitted] F1 product policy for this product, passed in
 * @param {boolean} [i.isPlayer]
 * @param {string|null} [i.availabilityState]
 * @param {string|null} [i.roleState]
 * @param {{price:number|null, capturedAt:string|null}|null} [i.market]
 * @param {number} [i.maxPriceAgeMs]          override for tests/replay only; defaults to FRESHNESS (Q5)
 * @param {number} [i.maxHealthAgeMs]         override for tests/replay only; defaults to FRESHNESS (Q4)
 * @param {boolean} [i.settlementProven]
 */
export function resolveProductStatus(i) {
  const asOfMs = Date.parse(i?.asOf ?? "");
  if (!Number.isFinite(asOfMs)) throw new Error("resolveProductStatus: asOf must be a parseable instant");
  if (!Object.values(PRODUCT).includes(i.product)) throw new Error(`resolveProductStatus: unknown product ${i.product}`);
  const promoted = PROMOTED.has(i.product);
  const codes = new Set();

  // 1 · identity: never inferred (Stage 3 Q5).
  if (!i.sport) codes.add(REASON.SPORT_UNKNOWN);
  if (!i.sport || !i.family || !i.eventId) codes.add(REASON.IDENTITY_MISSING);

  // 2 · clock: unknown start is not "not started"; a decision is pregame or it is not a decision.
  const startMs = Date.parse(i.eventStartUtc ?? "");
  if (!Number.isFinite(startMs)) codes.add(REASON.EVENT_START_UNKNOWN);
  else if (asOfMs >= startMs) codes.add(REASON.EVENT_STARTED);

  // 3 · maturity: least mature of every layer that speaks; unreadable layers are UNKNOWN, not "fine".
  const words = [];
  if (i.registryState) words.push(`registry:${i.registryState}`);
  else codes.add(REASON.SPORT_UNKNOWN);
  if (i.coverage == null) { if (promoted) codes.add(REASON.COVERAGE_UNKNOWN); }
  else words.push(i.coverage.demoted ? "coverage:demoted" : `coverage:${i.coverage.status}`);
  if (i.publicState) words.push(`public:${i.publicState}`);

  // 3b · live record (Q4 SPLIT, Q7 ALL, Q8 MODEL-ONLY). Display: no current verdict → no pause. Promotion: a
  //      model-probability leg needs a CURRENT verdict; a fresh BREACHED verdict pauses it on every sport.
  const healthApplies = i.probabilityKind === "MODEL";
  const maxHealthAgeMs = Number.isFinite(i.maxHealthAgeMs) ? i.maxHealthAgeMs : FRESHNESS.scorecardMaxAgeMs;
  const hAt = Date.parse(i.health?.generatedAt ?? "");
  const healthFresh = Number.isFinite(hAt) && asOfMs - hAt <= maxHealthAgeMs && hAt - asOfMs <= 3600e3;
  if (healthApplies && i.health?.state === "BREACHED" && healthFresh) words.push("health:BREACHED");
  if (healthApplies && promoted && (!i.health || !healthFresh)) codes.add(REASON.HEALTH_UNKNOWN);

  const maturity = deriveMaturity(words);
  if (maturity === MATURITY.UNKNOWN) codes.add(REASON.MATURITY_UNKNOWN);
  if (maturity === MATURITY.RETIRED) codes.add(REASON.MODEL_RETIRED);
  if (maturity === MATURITY.PAUSED) codes.add(REASON.MODEL_PAUSED);
  if (i.coverage?.demoted) codes.add(REASON.MODEL_DEMOTED);
  if (maturity === MATURITY.RESEARCH && !i.coverage?.demoted) codes.add(REASON.MODEL_NOT_PUBLIC);

  // 4 · promotion gates. A family below ESTABLISHED may enter only through an explicit founder grant.
  if (promoted) {
    if (maturity === MATURITY.EXPERIMENTAL) {
      if (!i.familyGranted) codes.add(REASON.MODEL_EXPERIMENTAL);
      if (i.registryState !== "FULL_MODEL" && !i.familyGranted) codes.add(REASON.SPORT_GATED);
    }

    // probability: a market price is never a GameTimePicks number, and is admitted only by product policy.
    if (i.probabilityKind === "MARKET_IMPLIED") {
      if (!i.marketImpliedAdmitted) codes.add(REASON.MARKET_IMPLIED_NOT_ADMITTED);
      if (i.marketImpliedProbability == null) codes.add(REASON.NO_PROBABILITY);
    } else if (i.probabilityKind !== "MODEL" || i.gtpProbability == null) codes.add(REASON.NO_PROBABILITY);

    if (i.isPlayer) {
      // Either word blocking blocks. A role is confirmed only by a role/lineup word; an availability word never
      // stands in for a role (except the single combined word some producers write in both fields).
      const a = participationOf(i.availabilityState), r = participationOf(i.roleState);
      if (a === P.BLOCKED || r === P.BLOCKED) codes.add(REASON.AVAILABILITY_BLOCKED);
      else if (r !== P.CONFIRMED) codes.add(REASON.ROLE_UNCERTAIN);
    }

    priceChecks(i, codes, { asOfMs, startMs });
    if (i.settlementProven !== true) codes.add(REASON.SETTLEMENT_UNSUPPORTED);
  } else if (i.product === PRODUCT.TOP_BOARD || i.product === PRODUCT.LAB_CARD) {
    // Displays with their own checks (Q9): a ruled-out player is never ranked; a lab card prices its legs.
    if (i.isPlayer && (participationOf(i.availabilityState) === P.BLOCKED || participationOf(i.roleState) === P.BLOCKED)) codes.add(REASON.AVAILABILITY_BLOCKED);
    if (i.product === PRODUCT.LAB_CARD) priceChecks(i, codes, { asOfMs, startMs });
  }

  const reasonCodes = PRECEDENCE.filter((c) => codes.has(c));
  // Display: forecasting continues. Only identity, retirement and research-only output stay off public
  // forecast surfaces; experimental, demoted (as market context) and paused (call withdrawn, evidence kept)
  // still display with their label.
  const displayBlockers = new Set([REASON.SPORT_UNKNOWN, REASON.IDENTITY_MISSING, REASON.MODEL_RETIRED, REASON.MODEL_NOT_PUBLIC, REASON.MATURITY_UNKNOWN]);
  const displayable = !reasonCodes.some((c) => displayBlockers.has(c));
  // For the plain forecast, a PAUSED family keeps its evidence on the page but its CALL is withdrawn
  // (live-record-gate.mjs), so the call itself is not eligible. A Top Board or lab card also needs the event not to
  // have started (membership is frozen pregame), a known start, and its own checks above.
  const displayOnlyBlockers = [REASON.MODEL_PAUSED, REASON.AVAILABILITY_BLOCKED, REASON.MARKET_MISSING, REASON.ODDS_STALE, REASON.ODDS_CAPTURED_AFTER_START];
  const pregameDisplay = i.product === PRODUCT.TOP_BOARD || i.product === PRODUCT.LAB_CARD;
  const eligible = promoted
    ? reasonCodes.length === 0
    : displayable && !displayOnlyBlockers.some((c) => codes.has(c)) && !(pregameDisplay && (codes.has(REASON.EVENT_STARTED) || codes.has(REASON.EVENT_START_UNKNOWN)));
  const reasonCode = eligible ? null : (reasonCodes[0] ?? REASON.MATURITY_UNKNOWN);

  return {
    schemaVersion: PRODUCT_STATUS_SCHEMA_VERSION,
    product: i.product,
    sport: i.sport ?? null,
    family: i.family ?? null,
    eventId: i.eventId ?? null,
    maturity,
    displayable,
    eligible,
    reasonCode,
    reasonCodes,
    reasonText: reasonCode ? REASON_TEXT[reasonCode] : null,
    sportState: i.registryState ?? null,
    familyState: i.coverage ? (i.coverage.demoted ? "DEMOTED_TO_MARKET_CONTEXT" : i.coverage.status) : null,
    freshness: {
      health: !healthApplies ? "NOT_APPLICABLE" : i.health ? (healthFresh ? "FRESH" : "STALE") : "MISSING",
      price: i.market?.capturedAt ? (codes.has(REASON.ODDS_STALE) ? "STALE" : "FRESH") : "MISSING",
    },
    availability: i.isPlayer ? String(i.availabilityState ?? "UNKNOWN") : "NOT_APPLICABLE",
    probability: {
      gtp: i.probabilityKind === "MODEL" ? (i.gtpProbability ?? null) : null,
      marketImplied: i.marketImpliedProbability ?? null,
    },
    decidedAt: i.asOf,
    frozenPregame: Number.isFinite(startMs) && asOfMs < startMs,
  };
}

/**
 * Read-time check for a STORED status (Stage 3 Q1/Q3 alignment): a decision used for later evaluation must
 * have been taken before the start, and a record cannot be re-decided after it.
 */
export function assertFrozenPregame(record, eventStartUtc) {
  const d = Date.parse(record?.decidedAt ?? ""), s = Date.parse(eventStartUtc ?? "");
  if (!Number.isFinite(d) || !Number.isFinite(s) || d >= s) throw new Error(`product-status: decision for ${record?.eventId ?? "?"} was not frozen pregame`);
  return true;
}
