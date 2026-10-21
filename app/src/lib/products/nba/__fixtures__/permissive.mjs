/**
 * TEST FIXTURE — NOT REAL PICKS, NOT REAL PRICES, NOT A REAL REGISTRY STATE.
 *
 * Synthetic inputs for the NBA leg adapter tests. The "permissive" snapshot and registry describe a world that does
 * not exist today (NBA is HISTORICAL_ONLY, no NBA price is authorized, every v0.1 family is PRIVATE_SHADOW). They
 * exist only so the tests can prove what the adapter WOULD carry once every gate is genuinely open — and that what
 * it carries is the evaluator's output, verbatim. Nothing outside a test may import this file.
 */
import { evaluateMarket } from "../../../consistency/market-evaluator.mjs";
import { PUBLICATION, nbaOfficialSnapshot, sealSnapshot } from "../../../consistency/official-snapshot.mjs";
import { NBA_ID, nbaSources } from "../../../consistency/__fixtures__/synthetic.mjs";

export const TEST_FIXTURE = "TEST FIXTURE — not real picks, not real prices";
export const NOW = "2026-11-01T13:00:00Z";
export const CAPTURED_AT = "2026-11-01T12:30:00Z";
export { NBA_ID };

/** TEST FIXTURE registry: says NBA may enter products. The real registry says HISTORICAL_ONLY. */
export const PERMISSIVE_REGISTRY = Object.freeze({
  source: "TEST_FIXTURE_REGISTRY",
  canEnterPredictionProducts: (s) => String(s).toLowerCase() === "nba",
  capabilityState: () => "FULL_MODEL (TEST FIXTURE)",
});

/** The real (private) official snapshot built from the consistency suite's synthetic NBA artifact. */
export const realShapeSnapshot = () => nbaOfficialSnapshot(NBA_ID, nbaSources());

/** TEST FIXTURE snapshot: the same snapshot, re-sealed as PUBLIC, product-eligible, every family PUBLISHED. */
export function permissiveSnapshot() {
  const s = realShapeSnapshot();
  const { snapshotId: _drop, ...rest } = s;
  return sealSnapshot({
    ...rest,
    publication: PUBLICATION.PUBLIC,
    capability: { ...s.capability, state: "FULL_MODEL (TEST FIXTURE)", canShowLiveProjections: true, canEnterPredictionProducts: true },
    players: s.players.map((p) => ({ ...p, families: Object.fromEntries(Object.entries(p.families).map(([k, f]) => [k, { ...f, state: "PUBLISHED" }])) })),
  });
}

/** TEST FIXTURE prices (player 11 PTS 23.5: the v0.1 median 23.84 sits above the line; +110 / −130 leans OVER). */
export const PRICE = Object.freeze({ book: "draftkings", overAmerican: 110, underAmerican: -130 });

export function evaluate(snapshot, { playerId = "11", family = "pts", line = 23.5, price = PRICE, capturedAt = CAPTURED_AT, now = NOW } = {}) {
  return evaluateMarket({ snapshot, playerId, family, line, book: price.book, overAmerican: price.overAmerican, underAmerican: price.underAmerican, capturedAt, now });
}

/** TEST FIXTURE verification object, shaped as the operator allowlist (#1130) + an NBA authorization receipt would be. */
export function verificationFor(evaluation, { price = PRICE, ...over } = {}) {
  const id = evaluation.identity;
  return {
    label: TEST_FIXTURE,
    sport: "nba",
    eventId: id.eventId,
    providerAthleteId: id.subjectId,
    family: id.family,
    line: id.line,
    book: price.book,
    operatorName: "DraftKings",
    capturedAt: id.capturedAt,
    overAmerican: price.overAmerican,
    underAmerican: price.underAmerican,
    operatorVerified: true,
    verifier: "eligible-operators@1 (TEST FIXTURE)",
    authorizationReceiptRef: "TEST-FIXTURE-nba-odds-authorization",
    priceReceiptRef: "TEST-FIXTURE-nba-price-capture",
    ...over,
  };
}
