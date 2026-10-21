/**
 * NBA TEAM-MARKET LEG + BANK BUILDER / MOONSHOT ADMISSION — GATED. Pure: no fs, no fetch; the clock is an argument.
 *
 * WHY A TEAM LEG. Moonshot runs moonshot@2, which is team-markets-only, and bank-builder@1 records team markets as
 * its candidate source. The NBA settlement contract (sports/nba/settlement-contract.mjs) grades moneyline, point
 * spread and total points — and the official NBA snapshot carries ONE team market today: the winner (Elo head,
 * snapshot.game.winner + pHome / pAway). So the NBA leg these products could ever carry first is the official
 * moneyline side.
 *
 * WHAT IT NEVER DOES
 *   · choose a side. The side is the snapshot's published winner side (HOME / AWAY), copied. No price-driven flip.
 *   · compute a probability. `probability` is snapshot.game.pHome / pAway, copied (Object.is). A missing pAway refuses
 *     (NO_PROBABILITY) — it is never derived as 1 − pHome here.
 *   · emit a link. Operator name only; handoff HANDOFF_NOT_AVAILABLE.
 *   · change a frozen policy. bank-builder@1 / moonshot@2 are read through product-tiers.mjs; a new NBA player-leg
 *     policy is a PROPOSED version (./proposed-policies.mjs), never active.
 *
 * GATES (every failure is listed, never only the first)
 *   registry      canEnterPredictionProducts("nba") — REAL by default (HISTORICAL_ONLY ⇒ refuses). An injected
 *                 registry yields provenance TEST_FIXTURE, never OFFICIAL.
 *   snapshot      official schema, NBA, seal intact, PUBLIC, capability admits products, a published winner side.
 *   price         a verified, AUTHORIZED, two-way moneyline quote for the same event: operatorVerified + verifier, an
 *                 NBA odds authorization receipt, home AND away American prices, a capture time not after `now`, not
 *                 older than 12 h, before the lock; the side's price inside LEG_BOUNDS; no link field.
 *   settlement    the NBA settlement contract grades the market (moneyline ✓). Injectable for tests.
 *   time          now before tip − 30 minutes (LEG_BOUNDS.activationCutoffMs).
 */
import { OFFICIAL_SNAPSHOT_SCHEMA, PUBLICATION, sealSnapshot } from "../../consistency/official-snapshot.mjs";
import { MARKETS as NBA_SETTLED_MARKETS } from "../../sports/nba/settlement-contract.mjs";
import { FORECAST_CLASS, LEG_BOUNDS, evaluateLeg } from "../eligible-leg/contract.mjs";
import { legSportEligibility } from "../../daily-portfolio/sport-eligibility.ts";
import { HANDOFF, PROVENANCE, REAL_REGISTRY, REAL_REGISTRY_SOURCE } from "./nba-leg.mjs";
import { tierView } from "./product-tiers.mjs";

export const NBA_TEAM_LEG_SCHEMA = "gtp.products.nba-team-leg@0";
export const NBA_TEAM_MARKET = "moneyline";

export const TEAM_REFUSAL = Object.freeze({
  REGISTRY_NOT_PRODUCT_ELIGIBLE: "REGISTRY_NOT_PRODUCT_ELIGIBLE",
  NO_SNAPSHOT: "NO_SNAPSHOT",
  SNAPSHOT_SCHEMA_MISMATCH: "SNAPSHOT_SCHEMA_MISMATCH",
  NOT_NBA_SNAPSHOT: "NOT_NBA_SNAPSHOT",
  SNAPSHOT_SEAL_BROKEN: "SNAPSHOT_SEAL_BROKEN",
  SNAPSHOT_NOT_PUBLIC: "SNAPSHOT_NOT_PUBLIC",
  SNAPSHOT_CAPABILITY_CLOSED: "SNAPSHOT_CAPABILITY_CLOSED",
  NO_PUBLISHED_SIDE: "NO_PUBLISHED_SIDE",
  NO_PROBABILITY: "NO_PROBABILITY",
  NO_VERIFICATION: "NO_VERIFICATION",
  VERIFICATION_NOT_NBA: "VERIFICATION_NOT_NBA",
  VERIFICATION_EVENT_MISMATCH: "VERIFICATION_EVENT_MISMATCH",
  VERIFICATION_MARKET_MISMATCH: "VERIFICATION_MARKET_MISMATCH",
  OPERATOR_NOT_VERIFIED: "OPERATOR_NOT_VERIFIED",
  NO_AUTHORIZATION_RECEIPT: "NO_AUTHORIZATION_RECEIPT",
  NO_TWO_WAY_PRICE: "NO_TWO_WAY_PRICE",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
  PRICE_TIME_UNKNOWN: "PRICE_TIME_UNKNOWN",
  PRICE_FROM_FUTURE: "PRICE_FROM_FUTURE",
  PRICE_STALE: "PRICE_STALE",
  PRICE_AFTER_LOCK: "PRICE_AFTER_LOCK",
  LINK_PRESENT: "LINK_PRESENT",
  NO_SETTLEMENT_PATH: "NO_SETTLEMENT_PATH",
  LOCKED: "LOCKED",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const LINK_FIELDS = /(url|uri|href|link)$/i;
const URLISH = /^[a-z][a-z0-9+.-]*:\/\/|^www\./i;
const hasLink = (o) => !!o && typeof o === "object" && Object.entries(o).some(([k, v]) => (LINK_FIELDS.test(k) && v != null) || (typeof v === "string" && URLISH.test(v.trim())) || (v && typeof v === "object" && hasLink(v)));
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const safe = (fn, d) => { try { return fn(); } catch { return d; } };

/** Does today's NBA settlement contract grade this market? */
export const nbaTeamMarketSettles = (market) => NBA_SETTLED_MARKETS.includes(market);

/**
 * @param {{ snapshot: object, verification: object|null, now: string, registry?: object, settles?: (m: string) => boolean }} input
 * @returns {{ ok: true, leg: object } | { ok: false, refusal: { reasons: string[], registry: object } }}
 */
export function nbaTeamLeg({ snapshot, verification = null, now, registry = REAL_REGISTRY, settles = nbaTeamMarketSettles } = {}) {
  const nowMs = Date.parse(now ?? "");
  if (!Number.isFinite(nowMs)) throw new TypeError("nbaTeamLeg: `now` must be an ISO instant");
  const reasons = [];
  const add = (r) => { if (!reasons.includes(r)) reasons.push(r); };
  const reg = registry ?? REAL_REGISTRY;
  const isReal = reg === REAL_REGISTRY;
  const registryStamp = { source: isReal ? REAL_REGISTRY_SOURCE : `INJECTED(${reg.source ?? "?"})`, state: safe(() => reg.capabilityState("nba"), null) };
  if (safe(() => reg.canEnterPredictionProducts("nba"), false) !== true) add(TEAM_REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE);

  const s = snapshot ?? null;
  const g = s?.game ?? null;
  const side = g?.winner?.side === "HOME" ? "home" : g?.winner?.side === "AWAY" ? "away" : null;
  const probability = side === "home" ? g?.pHome : side === "away" ? g?.pAway : null;
  if (!s?.snapshotId) add(TEAM_REFUSAL.NO_SNAPSHOT);
  else {
    if (s.schema !== OFFICIAL_SNAPSHOT_SCHEMA) add(TEAM_REFUSAL.SNAPSHOT_SCHEMA_MISMATCH);
    if (s.sport !== "NBA") add(TEAM_REFUSAL.NOT_NBA_SNAPSHOT);
    if (safe(() => sealSnapshot(s).snapshotId, null) !== s.snapshotId) add(TEAM_REFUSAL.SNAPSHOT_SEAL_BROKEN);
    if (s.publication !== PUBLICATION.PUBLIC) add(TEAM_REFUSAL.SNAPSHOT_NOT_PUBLIC);
    if (s.capability?.canEnterPredictionProducts !== true) add(TEAM_REFUSAL.SNAPSHOT_CAPABILITY_CLOSED);
    if (!side) add(TEAM_REFUSAL.NO_PUBLISHED_SIDE);
    else if (!isNum(probability) || probability <= 0 || probability >= 1) add(TEAM_REFUSAL.NO_PROBABILITY);
  }

  const lockMs = Date.parse(s?.lockAt ?? "");
  const v = verification ?? null;
  let sidePrice = null;
  if (!v) add(TEAM_REFUSAL.NO_VERIFICATION);
  else {
    if (String(v.sport ?? "").toLowerCase() !== "nba") add(TEAM_REFUSAL.VERIFICATION_NOT_NBA);
    if (!s || String(v.eventId ?? "") !== String(s.eventId ?? "")) add(TEAM_REFUSAL.VERIFICATION_EVENT_MISMATCH);
    if (v.market !== NBA_TEAM_MARKET) add(TEAM_REFUSAL.VERIFICATION_MARKET_MISMATCH);
    if (v.operatorVerified !== true || typeof v.verifier !== "string" || !v.verifier) add(TEAM_REFUSAL.OPERATOR_NOT_VERIFIED);
    if (typeof v.authorizationReceiptRef !== "string" || !v.authorizationReceiptRef) add(TEAM_REFUSAL.NO_AUTHORIZATION_RECEIPT);
    if (hasLink(v)) add(TEAM_REFUSAL.LINK_PRESENT);
    const twoWay = isNum(v.homeAmerican) && isNum(v.awayAmerican) && Math.abs(v.homeAmerican) >= 100 && Math.abs(v.awayAmerican) >= 100;
    if (!twoWay) add(TEAM_REFUSAL.NO_TWO_WAY_PRICE);
    sidePrice = side === "home" ? v.homeAmerican : side === "away" ? v.awayAmerican : null;
    if (isNum(sidePrice) && (sidePrice < LEG_BOUNDS.oddsMin || sidePrice > LEG_BOUNDS.oddsMax)) add(TEAM_REFUSAL.PRICE_OUT_OF_RANGE);
    const capMs = Date.parse(v.capturedAt ?? "");
    if (!Number.isFinite(capMs)) add(TEAM_REFUSAL.PRICE_TIME_UNKNOWN);
    else {
      if (capMs > nowMs) add(TEAM_REFUSAL.PRICE_FROM_FUTURE);
      if (nowMs - capMs > LEG_BOUNDS.maxPriceAgeMs) add(TEAM_REFUSAL.PRICE_STALE);
      if (Number.isFinite(lockMs) && capMs >= lockMs) add(TEAM_REFUSAL.PRICE_AFTER_LOCK);
    }
  }
  if (!safe(() => settles(NBA_TEAM_MARKET), false)) add(TEAM_REFUSAL.NO_SETTLEMENT_PATH);
  if (!Number.isFinite(lockMs) || nowMs >= lockMs - LEG_BOUNDS.activationCutoffMs) add(TEAM_REFUSAL.LOCKED);

  if (reasons.length) return { ok: false, refusal: deepFreeze({ reasons, registry: registryStamp }) };

  const team = s[side]?.abbr ?? null;
  return {
    ok: true,
    leg: deepFreeze({
      schema: NBA_TEAM_LEG_SCHEMA,
      provenance: isReal && !/TEST FIXTURE/i.test(`${v.label ?? ""} ${s.capability?.state ?? ""}`) ? PROVENANCE.OFFICIAL : PROVENANCE.TEST_FIXTURE,
      sport: "nba",
      marketKind: "TEAM",
      snapshotId: s.snapshotId,
      eventId: String(s.eventId),
      matchup: s.matchup ?? null,
      team,
      side,
      market: NBA_TEAM_MARKET,
      family: NBA_TEAM_MARKET,
      line: null,
      probability, // the snapshot's own number, verbatim
      probabilityHead: g.probabilityHead ?? null,
      modelVersion: s.modelVersions?.game ?? null,
      frozenAt: s.frozenAt ?? null,
      lockAt: s.lockAt,
      eventLockAt: new Date(lockMs - LEG_BOUNDS.activationCutoffMs).toISOString(),
      book: v.book ?? null,
      operatorName: v.operatorName ?? v.book ?? null,
      capturedAt: v.capturedAt,
      price: { homeAmerican: v.homeAmerican, awayAmerican: v.awayAmerican, sideAmerican: sidePrice },
      verification: { verifier: v.verifier, authorizationReceiptRef: v.authorizationReceiptRef, priceReceiptRef: v.priceReceiptRef ?? null, operatorVerified: true },
      registry: registryStamp,
      correlationKeys: ["sport:nba", `event:nba:${s.eventId}`, ...(team ? [`team:nba:${team}`] : []), "family:team_result"],
      handoff: { ...HANDOFF, link: null, operatorName: v.operatorName ?? v.book ?? null },
    }),
  };
}

/** The ProductEligibleLegV1 normalizer output for a produced team leg (eligible-leg/contract.mjs evaluateLeg input). */
export function toEligibleLegCandidate(leg, { registryState = null } = {}) {
  const validated = /^FULL_MODEL\b/.test(String(registryState ?? leg.registry?.state ?? ""));
  return {
    sport: "nba", eventId: leg.eventId, eventStartUtc: leg.lockAt, entityIds: leg.team ? [leg.team] : [],
    marketFamily: "team_result", marketKey: "nba_moneyline", side: leg.side, line: null,
    forecastOwner: "consistency/official-snapshot (NBA)", forecastId: leg.snapshotId,
    // FULL_MODEL is the registry's word for a validated model; anything below it is experimental (refused).
    forecastClass: validated ? FORECAST_CLASS.VALIDATED_MODEL : FORECAST_CLASS.EXPERIMENTAL_MODEL,
    modelStatus: "PUBLISHED", probability: leg.probability, marketImpliedProbability: null,
    oddsForSide: { american: leg.price.sideAmerican, bookmaker: leg.book, capturedAt: leg.capturedAt, receipt: leg.verification.priceReceiptRef ?? leg.verification.authorizationReceiptRef },
    publishedAt: leg.frozenAt, sourceReceiptRefs: [`snapshot:${leg.snapshotId}`, `authorization:${leg.verification.authorizationReceiptRef}`],
    displayMatchup: leg.matchup, displaySelection: `${leg.team ?? leg.side} — Moneyline`,
  };
}

export const ADMISSION_PRODUCTS = Object.freeze({ "bank-builder": "bank-builder", moonshot: "moonshot" });

/**
 * Would Bank Builder / Moonshot accept this NBA leg? Four layers, each reported:
 *   leg        a produced leg exists (nbaTeamLeg passed: registry + snapshot + authorized two-way price + settlement)
 *   contract   eligible-leg/contract.mjs evaluateLeg — the REAL registry; under an injected registry its
 *              SPORT_NOT_ELIGIBLE is answered by that registry instead, and the result stays TEST_FIXTURE
 *   tier       product-tiers.mjs tierView for the product's CURRENT frozen policy (bank-builder@1 / moonshot@2)
 *   sportRule  daily-portfolio/sport-eligibility.ts — hand-set NBA_GATED today (the activation PR's last switch)
 * `qualifies` = leg ∧ contract ∧ tier; `admitted` = qualifies ∧ sportRule. Today both are false.
 */
export function nbaProductAdmission({ leg, product, now, registry = REAL_REGISTRY, settles, sportRule = legSportEligibility }) {
  const out = { product, admitted: false, qualifies: false, layers: {}, provenance: leg?.provenance ?? null };
  const rule = sportRule({ sport: "NBA" });
  out.layers.sportRule = { ok: rule.eligible === true, code: rule.code ?? null, reason: rule.reason };
  if (!ADMISSION_PRODUCTS[product]) { out.layers.leg = { ok: false, reasons: ["UNKNOWN_PRODUCT"] }; return out; }
  if (!leg) { out.layers.leg = { ok: false, reasons: ["NO_LEG"] }; return out; }
  out.layers.leg = { ok: true, reasons: [] };
  const reg = registry ?? REAL_REGISTRY;
  const injectedOpen = reg !== REAL_REGISTRY && leg.provenance === PROVENANCE.TEST_FIXTURE && safe(() => reg.canEnterPredictionProducts("nba"), false) === true;
  const evaluated = evaluateLeg(toEligibleLegCandidate(leg), { asOf: now });
  const contractReasons = evaluated.eligibilityReasonCodes.filter((r) => r !== "MARKET_PRICED_NO_FORECAST").filter((r) => !(injectedOpen && r === "SPORT_NOT_ELIGIBLE"));
  out.layers.contract = { ok: contractReasons.length === 0, reasons: contractReasons, registryState: evaluated.registryState };
  const view = tierView(leg, product, { now, ...(settles ? { settles } : {}) });
  out.layers.tier = { ok: view.qualification.qualified, reasons: [...view.qualification.reasons], policy: product };
  out.qualifies = out.layers.leg.ok && out.layers.contract.ok && out.layers.tier.ok;
  out.admitted = out.qualifies && out.layers.sportRule.ok;
  return out;
}
