/**
 * PARLAY LAB V2 · FOUR-TIER RECOMMENDATION ADAPTER (milestone M4).
 *
 * An ADAPTER, not an engine. It never composes a card: it takes the cards the existing engine already published
 * (the risk ladders, normalised by ./candidates.mjs), re-checks every one against the hard gates below, and answers,
 * for EACH of the four canonical public risk levels (risk-odds-bands.mjs PUBLIC_RISK_TIERS — founder decision D2),
 * either QUALIFIED with the surviving cards or NO_QUALIFYING_PARLAY with the reasons, in plain English, that emptied
 * it. It changes no published record and writes nothing. Pure: inputs and the clock are arguments.
 *
 * HARD GATES (each refusal carries a machine code from REASONS and a plain-English sentence)
 *   per leg   valid mapping (event id, market, selection; a line wherever the market has one)
 *             sport may enter prediction products (sport-capability-registry canEnterPredictionProducts — NBA and
 *               every non-FULL_MODEL sport are excluded)
 *             game not started, start known, and more than 30 minutes away (started-guard + LEG_BOUNDS cutoff)
 *             market family not demoted to market context (card-leg-eligibility; no coverage document ⇒ refused)
 *             participant status not injured / inactive / DNP / scratched, when the data carries a status
 *             price from a VERIFIED operator (./operators.mjs seam — fails closed until PR #1130)
 *             price present, inside LEG_BOUNDS (−650…+400), captured before start and ≤ 12 h before `now`
 *   per card  at least two legs
 *             every leg from a distinct event (D5 · card-events legsFromDistinctEvents)
 *             no conflicting / unknown-scope pair (correlation.ts setCorrelation)
 *             structural decorrelation (parlay-decorrelation evaluateSlipDecorrelation against the tier's
 *               PROPOSED section caps, same-game clamped to 1 by D5)
 *             combined price, from the recorded leg prices, inside the band of the tier the card claims
 *
 * RANKING (only among cards that pass every gate). Never payout, never leg count:
 *   1. leg model-quality coverage, descending — the share of legs whose probability comes from a validated public
 *      model owner (forecastClass VALIDATED_MODEL); a market-priced leg contributes nothing
 *   2. price freshness, ascending — the age of the OLDEST leg price on the card
 *   3. decorrelation margin, descending — the smallest remaining headroom under the tier's same-market /
 *      same-team caps
 *   4. card id, ascending — deterministic tie-break
 *
 * PROBABILITY HONESTY. A card shows the market-implied combined probability (the reciprocal of the product of the
 * recorded decimal prices — a fact about prices, including the books' margin). `modelJointProbability` is always
 * null: there is no validated correlation model in this codebase.
 *
 * NBA LEGS (./nba-source.mjs supplies them; none exist under the real registry). On top of every gate above, an NBA
 * leg needs: a settlement path for its market (sports/nba/settlement-contract.mjs grades team markets only, so a
 * player prop is NO_SETTLEMENT_PATH today; injectable for tests), a verified TWO-WAY price (the evaluator's implied
 * pair was checked against it — a one-sided quote never prices a card), and its provenance (official snapshot id,
 * model version, odds authorization receipt, and the same odds capture instant as the leg).
 *
 * INJECTED SPORT GATE (tests only). `canEnterSport` replaces the registry check so a TEST FIXTURE world can be
 * exercised. It can never launder a real leg: under an injected gate a leg that is not provenance FIXTURE still needs
 * the real registry, and every card holding a FIXTURE leg is labelled FIXTURE_CARD_LABEL.
 */
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS, PUBLIC_RISK_BAND_TEXT, getRiskBucketForCombinedOdds } from "../risk-odds-bands.mjs";
import { LEG_BOUNDS } from "../../products/eligible-leg/contract.mjs";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";
import { legIsMarketContext, marketContextFamilies } from "../card-leg-eligibility.mjs";
import { legHasNotStarted } from "../started-guard.mjs";
import { legsFromDistinctEvents } from "../card-events.mjs";
import { setCorrelation } from "../correlation.ts";
import { evaluateSlipDecorrelation, PROPOSED_SECTION_DECORRELATION_CAPS } from "../../parlay-decorrelation.ts";
import { isVerifiedOperator as seamPredicate, OPERATOR_SEAM } from "./operators.mjs";
import { combinedPrice, eventKeyOf } from "./pricing.mjs";
import { MARKETS as NBA_SETTLED_MARKETS } from "../../sports/nba/settlement-contract.mjs";

export const RECOMMEND_V2_VERSION = "parlay-lab-v2@1";
export const TIER_STATUS = Object.freeze({ QUALIFIED: "QUALIFIED", NO_QUALIFYING_PARLAY: "NO_QUALIFYING_PARLAY" });

/** Every reason code the adapter can emit, with the sentence a reader sees. */
export const REASONS = Object.freeze({
  INVALID_MAPPING: "A leg is missing its game, market, selection or line, so it could not be settled reliably.",
  SPORT_NOT_ELIGIBLE: "A leg comes from a sport that is not cleared for suggested cards (only fully modelled sports are).",
  START_UNKNOWN: "A leg's start time is unknown, so it cannot be shown to be before the game.",
  EVENT_STARTED: "A leg's game has already started.",
  INSIDE_CUTOFF: "A leg's game starts within 30 minutes, which is too close to start to suggest.",
  MARKET_CONTEXT_FAMILY: "A leg uses a kind of market whose model was demoted to market context.",
  COVERAGE_UNAVAILABLE: "The market-coverage list could not be read, so no leg can be cleared.",
  PARTICIPANT_STATUS: "A leg's player or team is listed as injured, inactive or not playing.",
  OPERATOR_NOT_VERIFIED: "A leg's price is not from a verified sportsbook, or no sportsbook is recorded for it. Price not verified.",
  PRICE_MISSING: "A leg has no recorded price.",
  PRICE_OUT_OF_RANGE: "A leg's price is outside the −650 to +400 range suggested cards use.",
  PRICE_TIME_UNKNOWN: "A leg's price has no capture time, so its freshness cannot be checked.",
  PRICE_STALE: "A leg's price is more than 12 hours old.",
  PRICE_AFTER_START: "A leg's price was captured after its game started.",
  PRICE_MISMATCH: "A leg's price on the card does not match the price on the recorded board.",
  TOO_FEW_LEGS: "A parlay needs at least two legs.",
  SAME_EVENT: "Two legs come from the same game. Same-game legs move together and no validated same-game price exists, so the card is withheld.",
  CORRELATION_CONFLICT: "Two legs work against each other, or their relationship is unknown.",
  DECORRELATION_FAIL: "The legs stack the same market, team or player too heavily for this risk level.",
  OUT_OF_BAND: "The combined price, from the recorded leg prices, falls outside this risk level's band.",
  NO_CANDIDATE: "No card was published for this risk level today.",
  ENGINE_NO_CARD: "The card builder published no card here today.",
  TOO_FEW_EVENTS: "Too few games have prices today to build a card from different games.",
  OPERATOR_SEAM_CLOSED: "The verified-sportsbook list is not connected yet, so no price can be shown as verified.",
  NO_SETTLEMENT_PATH: "A leg's market has no grading rule for its sport yet, so a card holding it could not be settled.",
  PRICE_NOT_TWO_WAY: "A leg has no verified price for both sides of its market, so no fair combined price can be shown.",
  NBA_PROVENANCE_MISSING: "An NBA leg is missing its official forecast snapshot, model version, odds authorization or odds time.",
});

/** Provenance words a leg / card carries (the candidate shape's own, ./candidate.mjs PROVENANCE). */
export const LEG_PROVENANCE = Object.freeze({ FIXTURE: "FIXTURE", PUBLISHED: "PUBLISHED_ARTIFACT" });
export const FIXTURE_CARD_LABEL = "FIXTURE — not real picks, not real prices";

/** Candidate market keys → the NBA settlement contract's market names. Player props map to nothing (no grader). */
const NBA_MARKET_TO_SETTLED = Object.freeze({ moneyline: "moneyline", h2h: "moneyline", spreads: "point_spread", point_spread: "point_spread", totals: "total_points", total_points: "total_points" });
/** Does today's NBA settlement contract grade this leg's market? */
export const nbaContractSettles = (leg) => NBA_SETTLED_MARKETS.includes(NBA_MARKET_TO_SETTLED[String(leg?.market ?? "")] ?? "");

const HOUR = 3_600_000;
export const PARTICIPANT_STATUS_FLAG = /^(out|injured|injury|inactive|dnp|did not play|scratch|scratched|doubtful|questionable|suspended|il|ir|day-to-day|not playing)\b/i;
/** Markets settled without a line (moneyline / result / winner). Everything else must carry a numeric line. */
export const LINELESS_MARKET = /moneyline|h2h|match_result|result|winner|fight|to_win|method|double_chance|btts|both_teams/i;

const scopeFor = (sport) => (/epl|soccer|ligue|mls/.test(sport) ? "90_minutes" : sport === "ufc" ? "full_fight" : "full_game");

/**
 * @typedef {object} V2Leg
 * @property {string} sport @property {string|number|null} eventId @property {string|null} eventLabel
 * @property {string|null} startUtc @property {string|null} market @property {string|null} marketLabel
 * @property {string|null} selection   human selection label, e.g. "Zack Gelof — Hits Over"
 * @property {string|null} side        verbatim side (Over/Under/home/away…)
 * @property {number|null} line @property {string|null} participant @property {string|null} team
 * @property {string|null} book @property {number|null} price @property {string|null} capturedAt
 * @property {string|null} participantStatus @property {string|null} forecastClass @property {boolean} [priceMismatch]
 * @property {string[]} receipts
 */

/** The leg-level gates. Returns the reason codes (empty ⇒ the leg passes). */
export function legReasons(leg, ctx) {
  const r = [];
  const sport = String(leg?.sport ?? "").toLowerCase();
  const lineRequired = !LINELESS_MARKET.test(String(leg?.market ?? ""));
  if (!leg?.eventId || !leg?.market || !leg?.selection || (lineRequired && !Number.isFinite(leg?.line))) r.push("INVALID_MAPPING");
  const enter = ctx.canEnterSport ?? canEnterPredictionProducts;
  const fixtureLeg = leg?.provenance === LEG_PROVENANCE.FIXTURE;
  if (!enter(sport) || (ctx.sportGateInjected && !fixtureLeg && !canEnterPredictionProducts(sport))) r.push("SPORT_NOT_ELIGIBLE");
  if (sport === "nba") {
    if (!(ctx.settlesNba ?? nbaContractSettles)(leg)) r.push("NO_SETTLEMENT_PATH");
    if (leg?.twoWay?.verified !== true || !Number.isFinite(leg?.twoWay?.otherAmerican) || leg?.twoWay?.sideAmerican !== leg?.price) r.push("PRICE_NOT_TWO_WAY");
    const ev = leg?.evidence ?? null;
    if (!ev?.snapshotId || !ev?.modelVersion || !ev?.authorizationReceiptRef || ev?.capturedAt !== leg?.capturedAt) r.push("NBA_PROVENANCE_MISSING");
  }

  const start = Date.parse(leg?.startUtc ?? "");
  if (!Number.isFinite(start)) r.push("START_UNKNOWN");
  else if (!legHasNotStarted({ gameId: "x" }, new Map([["x", start]]), ctx.nowMs)) r.push("EVENT_STARTED");
  else if (start - ctx.nowMs < LEG_BOUNDS.activationCutoffMs) r.push("INSIDE_CUTOFF");

  if (!ctx.families) r.push("COVERAGE_UNAVAILABLE");
  else if (legIsMarketContext({ sport, market: leg?.market }, ctx.families)) r.push("MARKET_CONTEXT_FAMILY");

  if (typeof leg?.participantStatus === "string" && PARTICIPANT_STATUS_FLAG.test(leg.participantStatus.trim())) r.push("PARTICIPANT_STATUS");

  if (!ctx.isVerifiedOperator(leg?.book)) r.push("OPERATOR_NOT_VERIFIED");
  if (!Number.isFinite(leg?.price) || leg.price === 0) r.push("PRICE_MISSING");
  else if (leg.price < LEG_BOUNDS.oddsMin || leg.price > LEG_BOUNDS.oddsMax) r.push("PRICE_OUT_OF_RANGE");
  if (leg?.priceMismatch) r.push("PRICE_MISMATCH");
  const cap = Date.parse(leg?.capturedAt ?? "");
  if (!Number.isFinite(cap)) r.push("PRICE_TIME_UNKNOWN");
  else {
    if (ctx.nowMs - cap > LEG_BOUNDS.maxPriceAgeMs) r.push("PRICE_STALE");
    if (Number.isFinite(start) && cap >= start) r.push("PRICE_AFTER_START");
  }
  return r;
}

const capsFor = (tier) => ({ ...(PROPOSED_SECTION_DECORRELATION_CAPS[tier] ?? PROPOSED_SECTION_DECORRELATION_CAPS.longshot), maxSameGame: 1 });

/** Evaluate one candidate card. Returns `{ ok, tier, reasons, legReasons, view|null }`. */
export function evaluateCard(card, ctx) {
  const legs = card?.legs ?? [];
  const price = combinedPrice(legs);
  const band = price.available ? getRiskBucketForCombinedOdds(price.american) : null;
  const tier = PUBLIC_RISK_TIERS.includes(card?.tier) ? card.tier : band;
  const perLeg = legs.map((l) => legReasons(l, ctx));
  const reasons = new Set(perLeg.flat());

  if (legs.length < 2) reasons.add("TOO_FEW_LEGS");
  if (!legsFromDistinctEvents(legs, eventKeyOf)) reasons.add("SAME_EVENT");

  const corr = setCorrelation(legs.map((l, i) => ({
    legId: `${i}`, sport: l.sport, eventId: eventKeyOf(l) ?? `unknown:${i}`, gameId: eventKeyOf(l) ?? `unknown:${i}`,
    marketType: String(l.market ?? ""), marketScope: l.marketScope ?? scopeFor(String(l.sport ?? "")),
    side: typeof l.side === "string" ? l.side.toLowerCase() : null, participantName: l.participant ?? "",
    correlationTags: l.team ? [`team:${l.team}`] : [], line: l.line ?? null,
  })));
  if (corr.anyConflict || corr.anyUnknown) reasons.add("CORRELATION_CONFLICT");

  const caps = capsFor(tier ?? "longshot");
  const dec = evaluateSlipDecorrelation(legs.map((l) => ({
    gameId: eventKeyOf(l), market: l.market ?? null, side: l.side ?? null, team: l.team ?? null, playerName: l.participant ?? null,
  })), caps);
  // Same-game is already its own reason (D5); only the market/team/player stacking is "decorrelation".
  const nonGameFailures = dec.failures.filter((f) => !/in one game/.test(f));
  if (nonGameFailures.length) reasons.add("DECORRELATION_FAIL");

  if (!tier || !price.available || band !== tier) reasons.add("OUT_OF_BAND");

  const margins = [caps.maxSameMarket - dec.profile.maxLegsInOneMarket, caps.maxSameTeam - dec.profile.maxLegsInOneTeam].filter(Number.isFinite);
  const capturedMs = legs.map((l) => Date.parse(l.capturedAt ?? "")).filter(Number.isFinite);
  const ranking = {
    modelQualityCoverage: legs.length ? legs.filter((l) => l.forecastClass === "VALIDATED_MODEL").length / legs.length : 0,
    oldestPriceAgeMinutes: capturedMs.length === legs.length && legs.length ? Math.round((ctx.nowMs - Math.min(...capturedMs)) / 60000) : null,
    decorrelationMargin: margins.length ? Math.min(...margins) : 0,
  };

  const ok = reasons.size === 0;
  return {
    ok, tier, cardId: String(card?.cardId ?? ""), reasons: [...reasons].sort(), legReasons: perLeg,
    view: ok ? cardView(card, price, ranking, tier) : null,
  };
}

function cardView(card, price, ranking, tier) {
  const fixture = card.legs.some((l) => l.provenance === LEG_PROVENANCE.FIXTURE);
  return {
    cardId: String(card.cardId),
    tier,
    sport: card.sport ?? null,
    composition: [...new Set(card.legs.map((l) => String(l.sport ?? "").toLowerCase()))].sort(),
    provenance: fixture ? LEG_PROVENANCE.FIXTURE : LEG_PROVENANCE.PUBLISHED,
    label: fixture ? FIXTURE_CARD_LABEL : null,
    legs: card.legs.map((l) => ({
      sport: l.sport, eventId: String(l.eventId), game: l.eventLabel ?? null, startUtc: l.startUtc ?? null,
      market: l.market ?? null, marketLabel: l.marketLabel ?? null, selection: l.selection, side: l.side ?? null,
      line: l.line ?? null, book: l.book, price: l.price, capturedAt: l.capturedAt,
      // carried verbatim when the source supplies them (NBA legs: the official projection and its provenance)
      participant: l.participant ?? null, team: l.team ?? null,
      // Smart Betslip comparison identity (Lane E, PR 1165): {sport, eventId, playerId, family|market, side, line}
      playerId: l.playerId ?? null, family: l.family ?? null,
      modelProbability: l.modelProbability ?? null, evidence: l.evidence ?? null, twoWay: l.twoWay ?? null,
      provenance: l.provenance ?? null,
    })),
    combinedAmerican: price.american,
    combinedDecimal: price.decimal,
    combinedPriceText: price.text,
    marketImpliedProbability: price.marketImpliedProbability,
    marketImpliedLabel: price.marketImpliedLabel,
    modelJointProbability: null,
    modelJointProbabilityReason: price.modelJointProbabilityReason,
    dependenceNote: "Legs are from different games and are priced as independent. Real outcomes can still be related (weather, travel, a shared opponent), and that is not modelled.",
    ...(card.notes?.length ? { notes: [...card.notes] } : {}),
    source: { artifact: card.source?.artifact ?? null, generatedAt: card.source?.generatedAt ?? null, receipts: [...new Set(card.legs.flatMap((l) => l.receipts ?? []))].sort() },
    ranking,
  };
}

/** The documented order. Exported so the test can pin it. */
export function compareCards(a, b) {
  const ra = a.ranking, rb = b.ranking;
  if (rb.modelQualityCoverage !== ra.modelQualityCoverage) return rb.modelQualityCoverage - ra.modelQualityCoverage;
  const fa = ra.oldestPriceAgeMinutes ?? Infinity, fb = rb.oldestPriceAgeMinutes ?? Infinity;
  if (fa !== fb) return fa - fb;
  if (rb.decorrelationMargin !== ra.decorrelationMargin) return rb.decorrelationMargin - ra.decorrelationMargin;
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

/** The evaluation context recommendTiers builds — exported so a card source can pre-check with the SAME gates. */
export function recommendCtx({ nowMs, coverage = null, isVerifiedOperator = seamPredicate, canEnterSport = null, settlesNba = null }) {
  return {
    nowMs, families: coverage ? marketContextFamilies(coverage) : null, isVerifiedOperator,
    canEnterSport: canEnterSport ?? canEnterPredictionProducts, sportGateInjected: canEnterSport != null,
    settlesNba: settlesNba ?? nbaContractSettles,
  };
}

const reasonEntry = (code, count, detail = null) => ({ code, text: REASONS[code] ?? code, count, ...(detail ? { detail } : {}) });

/**
 * The four-tier answer.
 * @param {object} input
 * @param {ReadonlyArray<object>} input.candidates        normalised candidate cards (./candidates.mjs)
 * @param {string} input.now                              ISO instant
 * @param {object|null} input.coverage                    the committed coverage projection (null ⇒ fail closed)
 * @param {(label: unknown) => boolean} [input.isVerifiedOperator]  defaults to the seam (closed until #1130)
 * @param {ReadonlyArray<{tier: string, sport: string, text: string}>} [input.engineNotes]  ladder skip reasons
 * @param {ReadonlyArray<{code: string, detail?: string}>} [input.poolNotes]  slate-wide notes applied to every tier
 * @param {number} [input.maxCardsPerTier]
 * @param {((sport: string) => boolean)|null} [input.canEnterSport]  TESTS ONLY — replaces the registry check (header)
 * @param {((leg: object) => boolean)|null} [input.settlesNba]       TESTS ONLY — replaces the NBA settlement check
 * @param {ReadonlyArray<object>} [input.sportNotes]   per-sport source states (./nba-source.mjs nbaSourceStatus)
 */
export function recommendTiers({ candidates = [], now, coverage = null, isVerifiedOperator = seamPredicate, engineNotes = [], poolNotes = [], maxCardsPerTier = 3, canEnterSport = null, settlesNba = null, sportNotes = [] }) {
  const nowMs = Date.parse(now ?? "");
  if (!Number.isFinite(nowMs)) throw new TypeError("recommendTiers: `now` must be an ISO instant");
  const ctx = recommendCtx({ nowMs, coverage, isVerifiedOperator, canEnterSport, settlesNba });
  const seamClosed = isVerifiedOperator === seamPredicate && OPERATOR_SEAM.state !== "CONNECTED";

  const evaluated = candidates.map((c) => evaluateCard(c, ctx));
  const tiers = PUBLIC_RISK_TIERS.map((tier) => {
    const mine = evaluated.filter((e) => e.tier === tier);
    const cards = mine.filter((e) => e.ok).map((e) => e.view).sort(compareCards).slice(0, maxCardsPerTier);
    const base = { tier, label: PUBLIC_RISK_LABELS[tier], bandText: PUBLIC_RISK_BAND_TEXT[tier], candidatesChecked: mine.length };
    if (cards.length) return { ...base, status: TIER_STATUS.QUALIFIED, reasons: [], cards };

    const counts = new Map();
    for (const e of mine) for (const code of e.reasons) counts.set(code, (counts.get(code) ?? 0) + 1);
    const reasons = [...counts.entries()].map(([code, n]) => reasonEntry(code, n));
    const notes = engineNotes.filter((x) => x.tier === tier);
    if (!mine.length && !notes.length) reasons.push(reasonEntry("NO_CANDIDATE", 0));
    for (const n of notes) reasons.push(reasonEntry("ENGINE_NO_CARD", 0, `${String(n.sport).toUpperCase()}: ${n.text}`));
    for (const p of poolNotes) reasons.push(reasonEntry(p.code, 0, p.detail ?? null));
    if (seamClosed) reasons.push(reasonEntry("OPERATOR_SEAM_CLOSED", 0));
    reasons.sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || String(a.detail ?? "").localeCompare(String(b.detail ?? "")));
    return { ...base, status: TIER_STATUS.NO_QUALIFYING_PARLAY, reasons, cards: [] };
  });

  return {
    version: RECOMMEND_V2_VERSION,
    evaluatedAt: new Date(nowMs).toISOString(),
    operatorSeam: { state: seamClosed ? OPERATOR_SEAM.state : "INJECTED", note: seamClosed ? OPERATOR_SEAM.note : null },
    sportGate: canEnterSport != null ? "INJECTED" : "REGISTRY",
    provenance: tiers.some((t) => t.cards.some((c) => c.provenance === LEG_PROVENANCE.FIXTURE)) ? LEG_PROVENANCE.FIXTURE : LEG_PROVENANCE.PUBLISHED,
    sportNotes: sportNotes.map((n) => ({ ...n })),
    tiers,
    // Refused cards are reported by id and code only — never their legs, books or prices.
    rejected: evaluated.filter((e) => !e.ok).map((e) => ({ cardId: e.cardId, tier: e.tier, reasons: e.reasons })),
  };
}
