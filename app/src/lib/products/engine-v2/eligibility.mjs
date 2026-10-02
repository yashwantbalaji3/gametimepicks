/**
 * PRODUCT ELIGIBLE LEG V2 — Session 7 · ONE leg gate for Suggested Parlays, Bank Builder and Moonshot.
 *
 * Every gate returns a TYPED exclusion code, and every failing gate is reported (not the first), so a
 * leg that is stale AND gated AND role-uncertain says all three. `eligible` is derived, never set.
 *
 * ── ONE FLOOR, THREE PRODUCTS ──────────────────────────────────────────────────────────────────
 *
 * The products differ in what CARD they build (price band, leg count, ladder objective), not in what
 * counts as a usable LEG. Moonshot may take more variance; it may not take worse data (§37). So the
 * leg floor is one versioned object and the card policies live with the selectors.
 *
 * ── MARKET-IMPLIED LEGS ────────────────────────────────────────────────────────────────────────
 *
 * Founder decision F1 = A (2026-09-22, docs/V17_FOUNDER_DECISION_PACKET.md): market constructions are
 * admitted transitionally with truthful labels. That admission is READ from MARKET_PRICED_LEG_POLICY,
 * never restated here, so the day it changes this floor follows. A market-implied leg carries no model
 * claim, so a family state does not apply to it — but a leg whose side was chosen by a DEMOTED or
 * EXPERIMENTAL model is refused, because then the selection is that model's (the F-1 rule).
 *
 * Imports the registry (.ts) → tsx only. Plain-node readers (api/ask.mjs) read the committed artifact.
 */
import { canEnterPredictionProducts, capabilityState } from "../../sport-capability-registry.ts";
import { LEG_BOUNDS, MARKET_PRICED_LEG_POLICY } from "../eligible-leg/contract.mjs";
import { PRODUCT_CLEARED_FAMILY_STATES, ROLE_CONFIRMED_PARTICIPATION, AVAILABILITY_BLOCKED, SETTLEMENT_SUPPORT } from "../candidate-universe.mjs";
import { PROBABILITY_DETAIL, PROBABILITY_KIND, LEG_CLASS, correlationGroupOf, correlationTagsOf } from "./receipt.mjs";

/** Typed exclusion codes. Public copy maps these; the code never renders them raw. */
export const EXCLUSION = Object.freeze({
  SPORT_GATED: "SPORT_GATED",
  IDENTITY_MISSING: "IDENTITY_MISSING",
  MODEL_NOT_PUBLIC: "MODEL_NOT_PUBLIC",
  MODEL_DEMOTED: "MODEL_DEMOTED",
  FAMILY_NOT_CLEARED: "FAMILY_NOT_CLEARED",
  RUSH_POOL_WITHHELD: "RUSH_POOL_WITHHELD",
  AVAILABILITY_BLOCKED: "AVAILABILITY_BLOCKED",
  ROLE_UNCERTAIN: "ROLE_UNCERTAIN",
  NO_PROBABILITY: "NO_PROBABILITY",
  MARKET_IMPLIED_NOT_ADMITTED: "MARKET_IMPLIED_NOT_ADMITTED",
  MARKET_MISSING: "MARKET_MISSING",
  ODDS_OUT_OF_RANGE: "ODDS_OUT_OF_RANGE",
  ODDS_STALE: "ODDS_STALE",
  ODDS_CAPTURED_AFTER_AS_OF: "ODDS_CAPTURED_AFTER_AS_OF",
  ODDS_CAPTURED_AFTER_START: "ODDS_CAPTURED_AFTER_START",
  EVENT_START_UNKNOWN: "EVENT_START_UNKNOWN",
  EVENT_STARTED: "EVENT_STARTED",
  EVENT_INSIDE_CUTOFF: "EVENT_INSIDE_CUTOFF",
  SETTLEMENT_UNSUPPORTED: "SETTLEMENT_UNSUPPORTED",
});

/** Card-level codes (selectors raise these; a leg alone cannot). */
export const CARD_EXCLUSION = Object.freeze({
  SAME_EVENT_CONFLICT: "SAME_EVENT_CONFLICT",
  SAME_ENTITY_CONFLICT: "SAME_ENTITY_CONFLICT",
  DUPLICATE_LEG: "DUPLICATE_LEG",
});

/** The versioned leg floor. Bounds are V1's (LEG_BOUNDS), not new numbers. */
export const LEG_FLOOR_V2 = Object.freeze({
  version: "leg-floor@2",
  oddsMin: LEG_BOUNDS.oddsMin,
  oddsMax: LEG_BOUNDS.oddsMax,
  maxPriceAgeMs: LEG_BOUNDS.maxPriceAgeMs,
  activationCutoffMs: LEG_BOUNDS.activationCutoffMs,
  requireSettlement: SETTLEMENT_SUPPORT.PROVEN,
  /* Read, not restated: F1 admits market-implied legs while the policy says so. */
  admitsMarketImplied: MARKET_PRICED_LEG_POLICY.state === "ADMITTED_PENDING_FOUNDER_DECISION" || MARKET_PRICED_LEG_POLICY.state === "ADMITTED",
  marketPricedLegPolicy: MARKET_PRICED_LEG_POLICY,
});

/** Model/publication words a model-backed leg may carry. An ALLOWLIST: a state nobody listed is refused. */
const CLEARED = PRODUCT_CLEARED_FAMILY_STATES;

/**
 * Evaluate one receipt against the leg floor at the publication instant `asOf` (never a wall clock).
 * @returns {{ eligible:boolean, exclusionCodes:string[], correlationGroup:string, correlationTags:string[] }}
 */
export function evaluateReceiptV2(receipt, { asOf, floor = LEG_FLOOR_V2 } = {}) {
  const asOfMs = Date.parse(asOf ?? "");
  if (!Number.isFinite(asOfMs)) throw new Error("evaluateReceiptV2: asOf must be a parseable instant");
  const r = receipt, id = r.identity, m = r.market, f = r.forecast, c = r.context;
  const out = new Set();

  /* 1 · sport — the registry, read here, whatever the artifact says. A sport below FULL_MODEL may enter
         ONE family at a time, and only through an active family grant (family-gate.mjs: a founder grant AND
         zero evidence blockers, derived at build). A grant for one family never admits another. */
  if (!id.sport || !canEnterPredictionProducts(id.sport)) {
    if (!(floor.grantedFamilies instanceof Set && floor.grantedFamilies.has(`${id.sport}:${m.family}`))) out.add(EXCLUSION.SPORT_GATED);
  }

  /* 2 · identity — a leg that cannot be settled cannot be a product leg. */
  if (!id.eventId || !m.family || !m.side || (r.legClass === LEG_CLASS.PLAYER && !id.participantId)) out.add(EXCLUSION.IDENTITY_MISSING);

  /* 3 · model / publication status. */
  switch (f.probabilityDetail) {
    case PROBABILITY_DETAIL.MODEL_DEMOTED: out.add(EXCLUSION.MODEL_DEMOTED); break;
    case PROBABILITY_DETAIL.MODEL_EXPERIMENTAL: out.add(EXCLUSION.MODEL_NOT_PUBLIC); break;
    case PROBABILITY_DETAIL.MARKET_IMPLIED: break; // no model claim; admission is step 5
    default:
      if (!CLEARED.has(String(f.publicationStatus ?? ""))) out.add(EXCLUSION.FAMILY_NOT_CLEARED);
  }
  if (c.withheldReason === "WITHHELD_POOL_OVER_ALLOCATED") out.add(EXCLUSION.RUSH_POOL_WITHHELD);

  /* 4 · availability and role — players only; "AVAILABLE_ROLE_UNCERTAIN" is not a confirmed role. */
  if (r.legClass === LEG_CLASS.PLAYER) {
    const part = String(c.availabilityState ?? "UNKNOWN");
    if (AVAILABILITY_BLOCKED.has(part)) out.add(EXCLUSION.AVAILABILITY_BLOCKED);
    else if (!ROLE_CONFIRMED_PARTICIPATION.has(String(c.roleState ?? part))) out.add(EXCLUSION.ROLE_UNCERTAIN);
  }

  /* 5 · probability — a product needs SOME probability it may read; a market one only under F1. */
  if (f.probabilityKind === PROBABILITY_KIND.MARKET_IMPLIED) {
    /* F1 admitted market CONSTRUCTIONS on team markets. A player prop with only a book price was never
       in that decision, so it is not admitted by extension. */
    if (!floor.admitsMarketImplied || r.legClass !== LEG_CLASS.TEAM) out.add(EXCLUSION.MARKET_IMPLIED_NOT_ADMITTED);
    if (m.marketImpliedProbability == null) out.add(EXCLUSION.NO_PROBABILITY);
  } else if (f.probability == null && f.probabilityDetail !== PROBABILITY_DETAIL.MODEL_DEMOTED && f.probabilityDetail !== PROBABILITY_DETAIL.MODEL_EXPERIMENTAL) {
    out.add(EXCLUSION.NO_PROBABILITY);
  }

  /* 6 · market — a book, a price, a capture time, and a line where the market has one. */
  const capMs = Date.parse(m.marketCapturedAt ?? "");
  const startMs = Date.parse(id.eventStartUtc ?? "");
  const needsLine = !m.binary && m.family !== "team_result" && m.family !== "fight_result";
  if (!m.sportsbook || m.price == null || !Number.isFinite(capMs) || (needsLine && m.line == null)) out.add(EXCLUSION.MARKET_MISSING);
  else {
    if (m.price < floor.oddsMin || m.price > floor.oddsMax) out.add(EXCLUSION.ODDS_OUT_OF_RANGE);
    if (capMs > asOfMs) out.add(EXCLUSION.ODDS_CAPTURED_AFTER_AS_OF);
    if (Number.isFinite(startMs) && capMs >= startMs) out.add(EXCLUSION.ODDS_CAPTURED_AFTER_START);
    if (asOfMs - capMs > floor.maxPriceAgeMs) out.add(EXCLUSION.ODDS_STALE);
  }

  /* 7 · the one fail-closed clock question: unknown start is NOT "has not started". */
  if (!Number.isFinite(startMs)) out.add(EXCLUSION.EVENT_START_UNKNOWN);
  else if (startMs <= asOfMs) out.add(EXCLUSION.EVENT_STARTED);
  else if (startMs - asOfMs < floor.activationCutoffMs) out.add(EXCLUSION.EVENT_INSIDE_CUTOFF);

  /* 8 · settlement — money does not go on a path that has never settled. */
  if (c.settlementSupport !== floor.requireSettlement) out.add(EXCLUSION.SETTLEMENT_UNSUPPORTED);

  const exclusionCodes = [...out].sort();
  return { eligible: exclusionCodes.length === 0, exclusionCodes, correlationGroup: correlationGroupOf(r), correlationTags: correlationTagsOf(r) };
}

/** The registry word for a sport, for reports. */
export const sportState = (sport) => capabilityState(sport);

/**
 * The coverage table §12 asks for: per sport × family, how many candidates carry a GameTimePicks model
 * probability (any status / cleared), a market-only probability, or none — and how many are eligible.
 */
export function coverageTable(rows) {
  const t = new Map();
  for (const { receipt: r, evaluation: e } of rows) {
    const k = `${r.identity.sport}/${r.market.family}`;
    const row = t.get(k) ?? { sport: r.identity.sport, family: r.market.family, candidates: 0, gtpProbabilityAny: 0, gtpProbabilityUsable: 0, marketOnly: 0, noProbability: 0, priced: 0, eligible: 0, sportState: sportState(r.identity.sport) };
    row.candidates += 1;
    if (r.forecast.probabilityKind === PROBABILITY_KIND.MODEL) row.gtpProbabilityAny += 1;
    if (r.forecast.probability != null) row.gtpProbabilityUsable += 1;
    if (r.forecast.probabilityKind === PROBABILITY_KIND.MARKET_IMPLIED) row.marketOnly += 1;
    if (r.forecast.probabilityKind === PROBABILITY_KIND.NONE) row.noProbability += 1;
    if (r.market.price != null) row.priced += 1;
    if (e.eligible) row.eligible += 1;
    t.set(k, row);
  }
  return [...t.values()].sort((a, b) => a.sport.localeCompare(b.sport) || a.family.localeCompare(b.family));
}

/** Count every exclusion code (a leg can carry several — a first-fail count would mislead). */
export function exclusionCounts(rows) {
  const out = {};
  for (const { evaluation: e } of rows) for (const code of e.exclusionCodes) out[code] = (out[code] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
