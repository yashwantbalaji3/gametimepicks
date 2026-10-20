/**
 * NBA PRODUCT LEG ADAPTER — INERT. Nothing in a build, a page or a workflow imports this module; only its tests and
 * the NBA product exposure invariant do (that invariant fails if anything else starts to).
 *
 * WHAT IT DOES
 *   evaluateMarket result (consistency/market-evaluator.mjs, the ONLY lean source)
 *   + the official NBA snapshot it was evaluated on (consistency/official-snapshot.mjs nbaOfficialSnapshot)
 *   + a verified price object (operator allowlist + NBA odds authorization receipt)
 *   → ONE product leg candidate, or a typed refusal that lists EVERY reason (never the first only).
 *
 * WHAT IT NEVER DOES
 *   · decide or reverse a lean. The leg's side is the evaluator's `lean`, copied.
 *   · recompute a number. pOver / pUnder / pPush / decisive / implied / edge / ev are the evaluator's objects, copied
 *     verbatim; the adapter only CHECKS the verified price against the evaluator's implied numbers (a mismatch refuses).
 *   · emit a link. Terms (legal/texts.mjs): the Site does not "link to or partner with any sportsbook". A leg carries
 *     the operator NAME only; handoff is HANDOFF_NOT_AVAILABLE with link null. A verification object carrying any
 *     url / deep-link field refuses.
 *   · call a leg safe, guaranteed, or anything like it. Risk words are relative (see product-tiers.mjs).
 *
 * GATES (all must hold; each failure is a REFUSAL code)
 *   registry      canEnterPredictionProducts("nba") — the REAL registry by default. NBA is HISTORICAL_ONLY today, so
 *                 every real call refuses. A caller may inject a registry for tests; a leg produced under an injected
 *                 registry is stamped provenance TEST_FIXTURE and can never be mistaken for an official leg.
 *   evaluation    from this evaluator version; qualified (no withheld reason at all); lean OVER or UNDER; a PLAYER
 *                 market in a family the official NBA snapshot carries and books price (minutes is not a product market).
 *   snapshot      the official NBA snapshot schema; the same snapshotId / eventId the evaluation names; PUBLIC; its own
 *                 capability stamp lets NBA enter products.
 *   verification  present; operatorVerified true by a named verifier policy; an NBA odds authorization receipt ref; the
 *                 same event / athlete / family / line / book / capture instant as the evaluation; both American prices
 *                 reproduce the evaluator's raw implied pair exactly; the leg side's price inside LEG_BOUNDS; no link.
 *
 * Pure: no fs, no fetch, no clock.
 */
import { EVALUATOR_VERSION, LEAN } from "../../consistency/market-evaluator.mjs";
import { NBA_PLAYER_FAMILIES, OFFICIAL_SNAPSHOT_SCHEMA, PUBLICATION, sealSnapshot } from "../../consistency/official-snapshot.mjs";
import { canEnterPredictionProducts, capabilityState } from "../../sport-capability-registry.ts";
import { americanToImpliedRaw } from "../../projection-framework.ts";
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";

export const NBA_LEG_SCHEMA = "gtp.products.nba-leg@0";
export const NBA_LEG_REFUSAL_SCHEMA = "gtp.products.nba-leg-refusal@0";
export const NBA_LEG_ADAPTER_STATE = Object.freeze({ state: "INERT", note: "no build, page or workflow calls this adapter; activation is the sequence in docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md" });

export const PROVENANCE = Object.freeze({ OFFICIAL: "OFFICIAL_SNAPSHOT", TEST_FIXTURE: "TEST_FIXTURE" });
export const REAL_REGISTRY_SOURCE = "sport-capability-registry";
export const HANDOFF = Object.freeze({ status: "HANDOFF_NOT_AVAILABLE", prefill: "UNSUPPORTED", reason: "the Terms forbid linking to any sportsbook; a leg names its operator only" });

/** Families a book prices as an over/under player prop. `minutes` is in the snapshot but is not a product market. */
export const NBA_PRODUCT_FAMILIES = Object.freeze(NBA_PLAYER_FAMILIES.filter((f) => f !== "minutes"));

/** Every refusal code. */
export const REFUSAL = Object.freeze({
  SNAPSHOT_SEAL_BROKEN: "SNAPSHOT_SEAL_BROKEN",
  REGISTRY_NOT_PRODUCT_ELIGIBLE: "REGISTRY_NOT_PRODUCT_ELIGIBLE",
  NO_EVALUATION: "NO_EVALUATION",
  EVALUATOR_VERSION_MISMATCH: "EVALUATOR_VERSION_MISMATCH",
  EVALUATION_NOT_QUALIFIED: "EVALUATION_NOT_QUALIFIED",
  LEAN_NONE: "LEAN_NONE",
  NOT_PLAYER_MARKET: "NOT_PLAYER_MARKET",
  FAMILY_NOT_PRODUCT_MARKET: "FAMILY_NOT_PRODUCT_MARKET",
  NO_PLAYER_ID: "NO_PLAYER_ID",
  NO_SNAPSHOT: "NO_SNAPSHOT",
  SNAPSHOT_SCHEMA_MISMATCH: "SNAPSHOT_SCHEMA_MISMATCH",
  NOT_NBA_SNAPSHOT: "NOT_NBA_SNAPSHOT",
  SNAPSHOT_ID_MISMATCH: "SNAPSHOT_ID_MISMATCH",
  SNAPSHOT_EVENT_MISMATCH: "SNAPSHOT_EVENT_MISMATCH",
  SNAPSHOT_NOT_PUBLIC: "SNAPSHOT_NOT_PUBLIC",
  SNAPSHOT_CAPABILITY_CLOSED: "SNAPSHOT_CAPABILITY_CLOSED",
  NO_VERIFICATION: "NO_VERIFICATION",
  OPERATOR_NOT_VERIFIED: "OPERATOR_NOT_VERIFIED",
  NO_AUTHORIZATION_RECEIPT: "NO_AUTHORIZATION_RECEIPT",
  VERIFICATION_NOT_NBA: "VERIFICATION_NOT_NBA",
  VERIFICATION_IDENTITY_MISMATCH: "VERIFICATION_IDENTITY_MISMATCH",
  VERIFICATION_PRICE_MISMATCH: "VERIFICATION_PRICE_MISMATCH",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
  LINK_PRESENT: "LINK_PRESENT",
});

/** The real registry, read at call time (never cached), so a registry move is seen on the next call. */
export const REAL_REGISTRY = Object.freeze({
  source: REAL_REGISTRY_SOURCE,
  canEnterPredictionProducts: (sport) => canEnterPredictionProducts(sport),
  capabilityState: (sport) => capabilityState(sport),
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** Field names that would carry an outbound link (any key ending in url / uri / href / link, any case). Refuses. */
const LINK_FIELDS = /(url|uri|href|link)$/i;
const URLISH = /^[a-z][a-z0-9+.-]*:\/\/|^www\./i;

function linkFields(obj, path = "") {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (LINK_FIELDS.test(k) && v != null) out.push(p);
    else if (typeof v === "string" && URLISH.test(v.trim())) out.push(p);
    else if (v && typeof v === "object") out.push(...linkFields(v, p));
  }
  return out;
}

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};
/** A verbatim structural copy (no arithmetic happens here; every number is the evaluator's own value). */
const copy = (v) => (v == null ? null : structuredClone(v));

/** Relationship keys a card checker reads. Derived from ids only, never names. */
export function nbaCorrelationKeys({ eventId, providerAthleteId, team, family, lockAt }) {
  const keys = ["sport:nba", `event:nba:${eventId}`, `entity:nba:${providerAthleteId}`, `family:${family}`];
  if (team) keys.push(`team:nba:${team}`);
  const t = Date.parse(lockAt ?? "");
  if (Number.isFinite(t)) keys.push(`start:${Math.floor(t / (30 * 60 * 1000))}`);
  return keys;
}

/**
 * @param {{ evaluation: object, snapshot: object, verification: object|null,
 *           registry?: { source: string, canEnterPredictionProducts: (s: string) => boolean, capabilityState: (s: string) => string } }} input
 * @returns {{ ok: true, leg: object } | { ok: false, refusal: { schema: string, reasons: string[], evaluatorReasons: string[], identity: object|null, registry: object } }}
 */
export function nbaLegFromEvaluation({ evaluation, snapshot, verification = null, registry = REAL_REGISTRY } = {}) {
  const reasons = [];
  const add = (r) => { if (!reasons.includes(r)) reasons.push(r); };
  const reg = registry ?? REAL_REGISTRY;
  // Provenance is decided by IDENTITY, never by the registry's self-declared `source` string: an injected registry
  // that names itself "sport-capability-registry" is still injected.
  const isRealRegistry = reg === REAL_REGISTRY;
  const registryStamp = { source: isRealRegistry ? REAL_REGISTRY_SOURCE : `INJECTED(${reg.source ?? "?"})`, state: safeState(reg) };

  // 1 · registry
  let regOk = false;
  try { regOk = reg.canEnterPredictionProducts("nba") === true; } catch { regOk = false; }
  if (!regOk) add(REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE);

  // 2 · evaluation
  const ev = evaluation ?? null;
  const id = ev?.identity ?? null;
  if (!ev || !id) add(REFUSAL.NO_EVALUATION);
  else {
    if (ev.version !== EVALUATOR_VERSION) add(REFUSAL.EVALUATOR_VERSION_MISMATCH);
    if (ev.eligibility?.qualified !== true || (ev.withheldReasons ?? []).length > 0) add(REFUSAL.EVALUATION_NOT_QUALIFIED);
    if (ev.lean !== LEAN.OVER && ev.lean !== LEAN.UNDER) add(REFUSAL.LEAN_NONE);
    if (id.subjectType !== "PLAYER") add(REFUSAL.NOT_PLAYER_MARKET);
    if (!NBA_PRODUCT_FAMILIES.includes(id.family)) add(REFUSAL.FAMILY_NOT_PRODUCT_MARKET);
    if (id.subjectType === "PLAYER" && !/^\d+$/.test(String(id.subjectId ?? ""))) add(REFUSAL.NO_PLAYER_ID);
  }

  // 3 · snapshot
  const s = snapshot ?? null;
  if (!s?.snapshotId) add(REFUSAL.NO_SNAPSHOT);
  else {
    if (s.schema !== OFFICIAL_SNAPSHOT_SCHEMA) add(REFUSAL.SNAPSHOT_SCHEMA_MISMATCH);
    if (s.sport !== "NBA" || (id && id.sport !== "NBA")) add(REFUSAL.NOT_NBA_SNAPSHOT);
    if (id && id.snapshotId !== s.snapshotId) add(REFUSAL.SNAPSHOT_ID_MISMATCH);
    if (id && String(id.eventId) !== String(s.eventId)) add(REFUSAL.SNAPSHOT_EVENT_MISMATCH);
    // the seal must still hold: an edited copy ({...snapshot, publication: "PUBLIC"}) keeps its old id but not its hash
    let sealed = false;
    try { sealed = sealSnapshot(s).snapshotId === s.snapshotId; } catch { sealed = false; }
    if (!sealed) add(REFUSAL.SNAPSHOT_SEAL_BROKEN);
    if (s.publication !== PUBLICATION.PUBLIC) add(REFUSAL.SNAPSHOT_NOT_PUBLIC);
    if (s.capability?.canEnterPredictionProducts !== true) add(REFUSAL.SNAPSHOT_CAPABILITY_CLOSED);
  }

  // 4 · verification (operator allowlist + authorization receipt + identity + price parity)
  const v = verification ?? null;
  if (!v) add(REFUSAL.NO_VERIFICATION);
  else {
    if (v.operatorVerified !== true || typeof v.verifier !== "string" || !v.verifier) add(REFUSAL.OPERATOR_NOT_VERIFIED);
    if (typeof v.authorizationReceiptRef !== "string" || !v.authorizationReceiptRef) add(REFUSAL.NO_AUTHORIZATION_RECEIPT);
    if (String(v.sport ?? "").toLowerCase() !== "nba") add(REFUSAL.VERIFICATION_NOT_NBA);
    if (linkFields(v).length) add(REFUSAL.LINK_PRESENT);
    if (id) {
      const same = String(v.eventId ?? "") === String(id.eventId ?? "")
        && String(v.providerAthleteId ?? "") === String(id.subjectId ?? "")
        && v.family === id.family && v.line === id.line && v.book === id.book && v.capturedAt === id.capturedAt;
      if (!same) add(REFUSAL.VERIFICATION_IDENTITY_MISMATCH);
    }
    const rawOver = americanToImpliedRaw(v.overAmerican);
    const rawUnder = americanToImpliedRaw(v.underAmerican);
    if (rawOver == null || rawUnder == null || !ev?.implied || ev.implied.rawOver !== rawOver || ev.implied.rawUnder !== rawUnder) add(REFUSAL.VERIFICATION_PRICE_MISMATCH);
    const sidePrice = ev?.lean === LEAN.OVER ? v.overAmerican : ev?.lean === LEAN.UNDER ? v.underAmerican : null;
    if (isNum(sidePrice) && (sidePrice < LEG_BOUNDS.oddsMin || sidePrice > LEG_BOUNDS.oddsMax)) add(REFUSAL.PRICE_OUT_OF_RANGE);
  }

  if (reasons.length) {
    return {
      ok: false,
      refusal: deepFreeze({
        schema: NBA_LEG_REFUSAL_SCHEMA,
        reasons: reasons.slice(),
        evaluatorReasons: [...(ev?.withheldReasons ?? [])],
        identity: id ? copy(id) : null,
        registry: registryStamp,
      }),
    };
  }

  const player = s.players?.find((p) => p.playerId === id.subjectId) ?? null;
  const over = ev.lean === LEAN.OVER;
  const lockMs = Date.parse(s.lockAt ?? "");
  const leg = {
    schema: NBA_LEG_SCHEMA,
    // OFFICIAL only under the real registry AND with no TEST FIXTURE marker on the verification or the snapshot
    provenance: isRealRegistry && !/TEST FIXTURE/i.test(`${v.label ?? ""} ${s.capability?.state ?? ""}`) ? PROVENANCE.OFFICIAL : PROVENANCE.TEST_FIXTURE,
    sport: "nba",
    // identity — ids only
    snapshotId: s.snapshotId,
    eventId: String(s.eventId),
    providerAthleteId: id.subjectId,
    team: player?.team ?? null,
    family: id.family,
    line: id.line,
    side: ev.lean, // the evaluator's lean, copied — never re-derived
    book: id.book,
    operatorName: v.operatorName ?? id.book,
    capturedAt: id.capturedAt,
    price: { overAmerican: v.overAmerican, underAmerican: v.underAmerican, sideAmerican: over ? v.overAmerican : v.underAmerican },
    // model stamps
    modelVersion: ev.modelVersion,
    frozenAt: s.frozenAt,
    lockAt: s.lockAt,
    eventLockAt: Number.isFinite(lockMs) ? new Date(lockMs - LEG_BOUNDS.activationCutoffMs).toISOString() : null,
    // the evaluator's numbers, verbatim
    evaluator: { version: ev.version, rule: ev.rule, identityKey: id.key, evaluatedAt: ev.evaluatedAt ?? null, probabilityMethod: ev.probabilityMethod ?? null },
    pOver: ev.pOver,
    pUnder: ev.pUnder,
    pPush: ev.pPush,
    decisive: copy(ev.decisive),
    implied: copy(ev.implied),
    edge: copy(ev.edge),
    ev: copy(ev.ev),
    // provenance of the gates
    verification: { verifier: v.verifier, authorizationReceiptRef: v.authorizationReceiptRef, priceReceiptRef: v.priceReceiptRef ?? null, operatorVerified: true },
    registry: registryStamp,
    correlationKeys: nbaCorrelationKeys({ eventId: s.eventId, providerAthleteId: id.subjectId, team: player?.team ?? null, family: id.family, lockAt: s.lockAt }),
    handoff: { ...HANDOFF, link: null, operatorName: v.operatorName ?? id.book },
  };
  return { ok: true, leg: deepFreeze(leg) };
}

function safeState(reg) {
  try { return reg.capabilityState ? reg.capabilityState("nba") : null; } catch { return null; }
}
