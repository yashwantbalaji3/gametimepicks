/**
 * DAILY BANK BUILDER / MOONSHOT CANDIDATE ENGINE (P0-E, 2026-10-30). PURE: no fs, no fetch, no clock.
 *
 * ONE path for both products, on the existing machinery:
 *   per leg     eligible-leg/contract.mjs evaluateLeg (registry sport gate, forecast class, LEG_BOUNDS price window,
 *               capture-before-start, staleness, 30-minute cutoff) + this product's own requirements:
 *               a MODEL_VALIDATED probability (recommendation-receipt.mjs; a projection above a line is never one),
 *               cleared participation for player legs, no ESTIMATE family, the product's probability floor, and a
 *               model probability at least the price's implied probability.
 *   per card    correlation.mjs constrainCard (one leg per event, team and participant), the product band
 *               (policy.mjs), payout through parlay-payout.ts payoutFromDecimal on the full-precision decimal.
 *   no card     NO_CANDIDATE with every failed requirement, per leg type. Nothing is forced to fill a card.
 *
 * PRICING HONESTY. Combined odds are arithmetic over the legs' own verified prices. They are labelled ILLUSTRATIVE
 * unless the input carries a verified parlay quote from one book for exactly these legs; legs priced at different
 * books are never presented as one executable parlay.
 *
 * JOINT PROBABILITY. Only legs from distinct events reach a card. The product of their validated marginals is reported
 * with its basis (no shared event, team or participant observed; game script and lineup dependence are not
 * detectable), and the same-event case never gets one because the engine refuses it.
 */
import { evaluateLeg, REASON } from "../eligible-leg/contract.mjs";
import { constrainCard, correlationBetween } from "../correlation.mjs";
import { PROBABILITY_BASIS } from "../recommendation-receipt.mjs";
import { americanToDecimal, decimalToAmerican } from "../../odds-math.ts";
import { payoutFromDecimal } from "../../parlay-payout.ts";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";
import {
  CALIBRATION_STATUS, DAILY_CANDIDATE_SCHEMA, EXAMPLE_STAKE, LEG_TYPE_LABEL, NFL_ESTIMATE_FAMILIES, POLICY, REQUIRED_LEG_TYPES,
} from "./policy.mjs";

/** Codes this engine adds to the shared contract's REASON set. */
export const DAILY_REASON = Object.freeze({
  PROBABILITY_NOT_CALIBRATED: "PROBABILITY_NOT_CALIBRATED",
  ESTIMATE_RESEARCH_ONLY: "ESTIMATE_RESEARCH_ONLY",
  PARTICIPATION_NOT_CLEARED: "PARTICIPATION_NOT_CLEARED",
  BELOW_LEG_PROBABILITY_FLOOR: "BELOW_LEG_PROBABILITY_FLOOR",
  MODEL_BELOW_PRICE: "MODEL_BELOW_PRICE",
});

/** Card-level refusals. */
export const CARD_REASON = Object.freeze({
  TOO_FEW_ELIGIBLE_LEGS: "TOO_FEW_ELIGIBLE_LEGS",
  CORRELATED_ONLY: "CORRELATED_ONLY",
  NO_COMBINATION_IN_BAND: "NO_COMBINATION_IN_BAND",
});

/** Public copy for every code (reader's words; no internal file names). */
export const REASON_COPY = Object.freeze({
  [REASON.SPORT_NOT_ELIGIBLE]: "this sport has not cleared the bar to enter priced products",
  [REASON.SPORT_UNKNOWN]: "this sport is not covered",
  [REASON.MODEL_STATUS_BLOCKED]: "the forecast's model status blocks product use",
  [REASON.FORECAST_PRIVATE_OR_SHADOW]: "the forecast is not a public official forecast",
  [REASON.FORECAST_EXPERIMENTAL]: "the forecast is experimental, not validated",
  [REASON.MARKET_NOT_SUPPORTED]: "the market is not supported",
  [REASON.PRICE_UNAVAILABLE]: "no verified sportsbook price for this exact side",
  [REASON.PRICE_OUT_OF_RANGE]: "the price is outside the product's odds range",
  [REASON.PRICE_CAPTURED_AFTER_START]: "the price was captured after the start",
  [REASON.PRICE_CAPTURED_AFTER_AS_OF]: "the price is newer than the evaluation instant",
  [REASON.STALE]: "the price is more than 12 hours old",
  [REASON.EVENT_STARTED]: "the game has started",
  [REASON.EVENT_INSIDE_CUTOFF]: "the game starts within 30 minutes",
  [REASON.MISSING_IDENTITY]: "the leg is missing its event, market or side",
  [REASON.MISSING_OWNER_REF]: "the leg does not name its official forecast",
  [REASON.SIDE_MISMATCH]: "the side does not match the forecast",
  [REASON.PROBABILITY_INVALID]: "the forecast probability is not a valid probability",
  [DAILY_REASON.PROBABILITY_NOT_CALIBRATED]: "no calibrated outcome probability (a projection above or below a line is not one)",
  [DAILY_REASON.ESTIMATE_RESEARCH_ONLY]: "an ESTIMATE value, shown for research only",
  [DAILY_REASON.PARTICIPATION_NOT_CLEARED]: "the player is not confirmed active",
  [DAILY_REASON.BELOW_LEG_PROBABILITY_FLOOR]: "below the product's per-leg probability floor",
  [DAILY_REASON.MODEL_BELOW_PRICE]: "the model's probability is below what the price already implies",
  [CARD_REASON.TOO_FEW_ELIGIBLE_LEGS]: "fewer eligible legs than the product needs",
  [CARD_REASON.CORRELATED_ONLY]: "every combination shares a game, team or player",
  [CARD_REASON.NO_COMBINATION_IN_BAND]: "no combination prices inside the product's band",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const CLEARED = new Set(["ACTIVE_CONFIRMED", "ACTIVE_EXPECTED"]);
const PLAYER_LEG = (input) => input?.marketFamily === "player_prop";
/** Raw (with-vig) implied probability of an American price. */
export const impliedOf = (american) => (isNum(american) && american !== 0 ? 1 / americanToDecimal(american) : null);
const fmtAm = (a) => (a > 0 ? `+${a}` : `${a}`);

/**
 * Evaluate one input leg for one product. Every failing reason is collected (never only the first).
 * @param {object} input  DailyLegInput (see load.mjs for the shape)
 * @param {{ asOf: string, policy: object }} ctx
 */
export function evaluateDailyLeg(input, { asOf, policy }) {
  const f = input?.forecast ?? {};
  const basis = PROBABILITY_BASIS[f.probabilityBasis] ?? PROBABILITY_BASIS.ABSENT;
  const validated = basis === PROBABILITY_BASIS.MODEL_VALIDATED;
  const legId = input?.sport && input?.eventId && input?.marketKey && input?.side
    ? [input.sport, input.eventId, input.marketKey, input.participantId ?? input.team ?? "-", input.side, input.line ?? "-"].join(":")
    : null;
  const contract = evaluateLeg({
    legId, sport: input?.sport, eventId: input?.eventId, eventStartUtc: input?.eventStartUtc,
    entityIds: [input?.participantId, input?.team].filter(Boolean).map(String),
    marketFamily: input?.marketFamily, marketKey: input?.marketKey, side: input?.side, line: input?.line ?? null,
    forecastOwner: f.owner ?? null, forecastId: f.id ?? null, forecastClass: f.forecastClass ?? null, modelStatus: f.modelStatus ?? null,
    probability: validated ? f.probability : null,
    oddsForSide: input?.price ?? null, sourceReceiptRefs: f.sourceRefs ?? [], publishedAt: f.publishedAt ?? null,
    displayMatchup: input?.eventLabel ?? null, displaySelection: input?.selection ?? null,
  }, { asOf });

  const failures = contract.eligibilityReasonCodes.filter((r) => r !== REASON.MARKET_PRICED_NO_FORECAST);
  if (!validated) failures.push(DAILY_REASON.PROBABILITY_NOT_CALIBRATED);
  if (f.estimate === true || (input?.sport === "nfl" && NFL_ESTIMATE_FAMILIES.includes(input?.family))) failures.push(DAILY_REASON.ESTIMATE_RESEARCH_ONLY);
  if (PLAYER_LEG(input) && !CLEARED.has(input?.availabilityState)) failures.push(DAILY_REASON.PARTICIPATION_NOT_CLEARED);
  const p = validated ? contract.probability : null;
  const implied = impliedOf(input?.price?.american);
  if (p != null && policy?.minLegProbability != null && p < policy.minLegProbability) failures.push(DAILY_REASON.BELOW_LEG_PROBABILITY_FLOOR);
  if (p != null && implied != null && p < implied) failures.push(DAILY_REASON.MODEL_BELOW_PRICE);

  const uniq = [...new Set(failures)];
  return {
    legId: contract.legId,
    legType: input?.legType ?? null,
    eligible: uniq.length === 0,
    failures: uniq,
    probability: p,
    impliedProbability: implied,
    input,
  };
}

/** The receipt-shaped view correlation.mjs reads. */
const corrShape = (e) => ({
  sport: e.input.sport, eventId: e.input.eventId ? `${e.input.sport}:${e.input.eventId}` : null,
  participantId: e.input.participantId ? `${e.input.sport}:${e.input.participantId}` : null,
  team: e.input.team ? `${e.input.sport}:${e.input.team}` : null, opponent: e.input.opponent ? `${e.input.sport}:${e.input.opponent}` : null,
  marketFamily: e.input.marketFamily,
});

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combinations(arr, k, i + 1, acc); acc.pop(); }
}

/** Card pricing label: arithmetic over verified leg prices; executable only with a verified same-book parlay quote. */
export function pricingOf(legs, bookParlayQuote = null) {
  const books = [...new Set(legs.map((l) => l.bookmaker))];
  const sameBook = books.length === 1;
  const quoteOk = Boolean(bookParlayQuote && sameBook && bookParlayQuote.bookmaker === books[0] && isNum(bookParlayQuote.american)
    && Array.isArray(bookParlayQuote.legIds) && bookParlayQuote.legIds.slice().sort().join("|") === legs.map((l) => l.legId).sort().join("|"));
  if (quoteOk) return { kind: "SAME_BOOK_QUOTED", books, executable: true, label: `Parlay price quoted by ${books[0]}.` };
  if (sameBook) return { kind: "SAME_BOOK_ARITHMETIC", books, executable: false, label: `Illustrative: the product of ${books[0]}'s individual leg prices. ${books[0]}'s own parlay price may differ.` };
  return { kind: "MIXED_BOOKS_ILLUSTRATIVE", books, executable: false, label: `Illustrative only: legs are priced at different books (${books.join(", ")}), so this is not one parlay any single book offers.` };
}

/** Full-precision parlay math for a set of priced legs, and the hypothetical example. */
export function parlayMath(legs, stake = EXAMPLE_STAKE) {
  let decimal = 1;
  for (const l of legs) {
    if (!isNum(l.american) || l.american === 0) return null;
    decimal *= americanToDecimal(l.american);
  }
  const payout = payoutFromDecimal(decimal, stake);
  if (!payout) return null;
  return { decimal, american: decimalToAmerican(decimal), example: { stake, grossPayout: payout.totalReturn, netProfit: payout.profit, hypothetical: true } };
}

function cardFrom(combo, policy, bookParlayQuote) {
  const legs = combo.map((e) => ({
    legId: e.legId, legType: e.legType, sport: e.input.sport, eventId: String(e.input.eventId), eventLabel: e.input.eventLabel ?? null,
    eventStartUtc: e.input.eventStartUtc, selection: e.input.selection ?? null, side: e.input.side, line: e.input.line ?? null,
    marketKey: e.input.marketKey, participantId: e.input.participantId ?? null, participantName: e.input.participantName ?? null,
    american: e.input.price.american, bookmaker: e.input.price.bookmaker, capturedAt: e.input.price.capturedAt, priceReceipt: e.input.price.receipt,
    probability: e.probability, probabilityBasis: PROBABILITY_BASIS.MODEL_VALIDATED,
    forecastOwner: e.input.forecast.owner, forecastId: e.input.forecast.id ?? null,
  }));
  const math = parlayMath(legs);
  const pairs = [];
  for (let i = 0; i < combo.length; i++) for (let j = i + 1; j < combo.length; j++) pairs.push(correlationBetween(corrShape(combo[i]), corrShape(combo[j])));
  const constraint = constrainCard(combo.map(corrShape), policy.correlation);
  const joint = combo.every((e) => isNum(e.probability)) ? combo.reduce((a, e) => a * e.probability, 1) : null;
  return {
    policy: policy.id,
    legs,
    combined: math ? { decimal: math.decimal, american: math.american } : null,
    example: math?.example ?? null,
    pricing: pricingOf(legs, bookParlayQuote),
    jointProbability: joint == null ? null : {
      value: joint,
      basis: "Product of each leg's validated probability. Legs are from different games with no shared team or player; game-script and lineup links between games are not measurable, so this is not a measured joint probability.",
    },
    correlation: { allowed: constraint.allowed, pairs: pairs.map((p) => ({ kinds: p.kinds, dependence: p.dependence })), unconstrained: constraint.unconstrained },
    firstStartUtc: legs.map((l) => l.eventStartUtc).sort()[0],
  };
}

/**
 * Per leg type: which requirements failed, with counts. Always lists the four founder leg types, so a leg type with no
 * input at all still says why (its source note).
 */
export function legTypeBreakdown(evals, sourceNotes = {}) {
  const types = [...new Set([...REQUIRED_LEG_TYPES, ...evals.map((e) => e.legType).filter(Boolean)])];
  const out = {};
  for (const t of types) {
    const rows = evals.filter((e) => e.legType === t);
    const failureCounts = {};
    for (const e of rows) for (const r of e.failures) failureCounts[r] = (failureCounts[r] ?? 0) + 1;
    const sport = t.split("_")[0];
    const cal = CALIBRATION_STATUS[t] ?? null;
    out[t] = {
      label: LEG_TYPE_LABEL[t] ?? t,
      considered: rows.length,
      eligible: rows.filter((e) => e.eligible).length,
      failureCounts,
      requirements: [
        { key: "sport_gate", text: "Sport cleared to enter priced products", pass: canEnterPredictionProducts(sport), detail: canEnterPredictionProducts(sport) ? null : `${String(sport).toUpperCase()} forecasts have not yet passed the validation bars that priced products require.` },
        { key: "calibrated_probability", text: "Calibrated outcome probability from the official forecast", pass: cal ? cal.calibrated : rows.some((e) => !e.failures.includes(DAILY_REASON.PROBABILITY_NOT_CALIBRATED)), detail: cal?.detail ?? null },
        { key: "verified_price", text: "Verified sportsbook price for the exact side (odds, line, quote time)", pass: rows.length ? rows.some((e) => !e.failures.includes(REASON.PRICE_UNAVAILABLE)) : sourceNotes[t]?.pricesReadable === true, detail: sourceNotes[t]?.price ?? null },
        { key: "forecast_published", text: "Today's official forecast published before the start", pass: rows.length > 0 || sourceNotes[t]?.forecastPublished === true, detail: sourceNotes[t]?.forecast ?? null },
      ],
    };
  }
  return out;
}

/**
 * Build today's candidate for one product.
 * @param {{ product: "bank-builder"|"moonshot", productDay: string, asOf: string, inputs: object[], sourceNotes?: object, bookParlayQuotes?: object[] }} a
 */
export function buildDailyCandidate({ product, productDay, asOf, inputs, sourceNotes = {}, bookParlayQuotes = [] }) {
  const policy = POLICY[product];
  if (!policy) throw new Error(`unknown product ${product}`);
  const evals = (inputs ?? []).map((i) => evaluateDailyLeg(i, { asOf, policy }));
  const eligible = evals.filter((e) => e.eligible)
    .sort((a, b) => (b.probability - a.probability) || String(a.legId).localeCompare(String(b.legId)))
    .slice(0, 24);

  const cardReasons = [];
  let best = null;
  let correlatedRefusals = 0;
  let pricedCombos = 0;
  if (eligible.length < policy.minLegs) cardReasons.push(CARD_REASON.TOO_FEW_ELIGIBLE_LEGS);
  else {
    for (let k = policy.minLegs; k <= policy.maxLegs; k++) {
      for (const combo of combinations(eligible, k)) {
        if (!constrainCard(combo.map(corrShape), policy.correlation).allowed) { correlatedRefusals++; continue; }
        const math = parlayMath(combo.map((e) => ({ american: e.input.price.american })));
        if (!math) continue;
        pricedCombos++;
        const band = policy.combinedAmerican;
        if (math.american < band.lo || (band.hi != null && math.american > band.hi)) continue;
        const joint = combo.reduce((a, e) => a * e.probability, 1);
        const key = [band.target != null ? Math.abs(math.american - band.target) : k, -joint, combo.map((e) => e.legId).join("|")];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key, combo };
      }
    }
    if (!best) cardReasons.push(pricedCombos === 0 && correlatedRefusals > 0 ? CARD_REASON.CORRELATED_ONLY : CARD_REASON.NO_COMBINATION_IN_BAND);
  }

  const quoteFor = (combo) => bookParlayQuotes.find((q) => Array.isArray(q?.legIds) && q.legIds.slice().sort().join("|") === combo.map((e) => e.legId).sort().join("|")) ?? null;
  const card = best ? cardFrom(best.combo, policy, quoteFor(best.combo)) : null;
  return {
    schema: DAILY_CANDIDATE_SCHEMA,
    product, productLabel: policy.label, policy: policy.id, productDay, asOf,
    status: card ? "CANDIDATE" : "NO_CANDIDATE",
    card,
    cardReasons,
    legTypes: legTypeBreakdown(evals, sourceNotes),
    counts: { considered: evals.length, eligible: evals.filter((e) => e.eligible).length, correlatedCombosRefused: correlatedRefusals },
    bandText: policy.combinedAmerican.hi != null ? `${fmtAm(policy.combinedAmerican.lo)} to ${fmtAm(policy.combinedAmerican.hi)}` : `${fmtAm(policy.combinedAmerican.lo)} or longer`,
  };
}

/**
 * NO FABRICATED LEGS. Every card leg must be an input leg verbatim: same event, side, line, price, book and capture
 * instant. Returns the list of mismatches (empty = clean). The receipt writer refuses a card that fails this.
 */
export function fabricatedLegs(result, inputs) {
  const bad = [];
  for (const l of result?.card?.legs ?? []) {
    const src = (inputs ?? []).find((i) => String(i.eventId) === l.eventId && i.side === l.side && (i.line ?? null) === l.line && i.marketKey === l.marketKey && i.sport === l.sport && (i.participantId ?? null) === l.participantId);
    if (!src) { bad.push(`${l.legId}: no input leg`); continue; }
    const p = src.price ?? {};
    if (p.american !== l.american || p.bookmaker !== l.bookmaker || p.capturedAt !== l.capturedAt || p.receipt !== l.priceReceipt) bad.push(`${l.legId}: price differs from its input`);
  }
  return bad;
}
