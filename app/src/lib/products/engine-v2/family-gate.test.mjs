/**
 * Session 8 · B — the NFL family-level product gate. A family enters official products only with a founder
 * grant AND zero evidence blockers, one family never admits another, and every per-leg gate still applies
 * to a granted family. Real receipts from the committed 10-04 boards; each mutation must land.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadNflBoardCandidates } from "./nfl-boards.mjs";
import { receiptFromNflBoardCandidate } from "./sources.mjs";
import { evaluateReceiptV2, LEG_FLOOR_V2, EXCLUSION } from "./eligibility.mjs";
import { deriveFamilyGate, deriveNflFamilyGates, grantedFamilyKeys, FAMILY_BLOCKER, FAMILY_GATE_STATE, FAMILY_PRODUCT_GRANTS } from "./family-gate.mjs";

const APP = process.cwd();
const boards = loadNflBoardCandidates({ dataRoot: path.join(APP, "public/data"), workflowsDir: path.join(APP, "..", ".github/workflows"), date: "2026-10-04" });
const receipts = boards.candidates.map(receiptFromNflBoardCandidate);
const atd = receipts.find((r) => r.market.family === "anytime_td");
const rec = receipts.find((r) => r.market.family === "player_receptions");
const clone = (x) => JSON.parse(JSON.stringify(x));
const ASOF = "2026-10-02T15:00:00Z";
const GRANT = { sport: "nfl", family: "anytime_td", grantedBy: "test", grantedAt: ASOF, decisionRef: "test" };
const CLEAR_SLATE = { candidates: 10, modelProbability: 10, roleConfirmed: 5, priced: 5, settlementProven: true };
const PASSED = { state: "FORWARD_PASSED", n: 1000, needed: 1000, metrics: {} };

/** A leg that would pass every per-leg gate, so a probe isolates the one gate it mutates. */
function cleanAtd() {
  const r = clone(atd);
  Object.assign(r.market, { sportsbook: "draftkings", price: 150, marketCapturedAt: "2026-10-02T13:00:00Z", marketImpliedProbability: 0.38 });
  Object.assign(r.context, { availabilityState: "AVAILABLE_ROLE_CONFIRMED", roleState: "AVAILABLE_ROLE_CONFIRMED", settlementSupport: "PROVEN" });
  return r;
}
const granted = (keys) => ({ ...LEG_FLOOR_V2, grantedFamilies: new Set(keys) });

test("nothing is granted today, and every committed NFL family is GATED with typed blockers", () => {
  assert.deepEqual(FAMILY_PRODUCT_GRANTS, []);
  const gates = deriveNflFamilyGates({ receipts, forwardReceipt: null, familyState: boards.familyState });
  assert.ok(gates.length >= 4);
  for (const g of gates) { assert.equal(g.state, FAMILY_GATE_STATE.GATED); assert.ok(g.blockers.includes(FAMILY_BLOCKER.NO_FOUNDER_GRANT)); }
  assert.equal(grantedFamilyKeys(gates).size, 0);
});

test("ATD receipts carry the board's own model version and generation time (provenance)", () => {
  const atds = receipts.filter((r) => r.market.family === "anytime_td");
  assert.ok(atds.length > 0);
  for (const r of atds) {
    assert.ok(r.forecast.modelVersion, "modelVersion must not be null");
    assert.ok(r.forecast.generatedAt, "generatedAt must not be null");
    assert.equal(r.forecast.probabilityKind, "MODEL");
    assert.equal(r.forecast.probabilityDetail, "MODEL_PUBLISHED");
  }
});

test("a family is PRODUCT_ELIGIBLE only with a grant AND zero blockers", () => {
  const ok = deriveFamilyGate({ sport: "nfl", family: "anytime_td", publicationState: "PUBLISHED", modelVersion: "m", forward: PASSED, slate: CLEAR_SLATE, grants: [GRANT] });
  assert.equal(ok.state, FAMILY_GATE_STATE.PRODUCT_ELIGIBLE);
  const noGrant = deriveFamilyGate({ sport: "nfl", family: "anytime_td", publicationState: "PUBLISHED", modelVersion: "m", forward: PASSED, slate: CLEAR_SLATE, grants: [] });
  assert.deepEqual(noGrant.blockers, [FAMILY_BLOCKER.NO_FOUNDER_GRANT]);
});

const evidenceProbes = [
  ["forward accumulating", { forward: { state: "ACCUMULATING", n: 524, needed: 1000 } }, FAMILY_BLOCKER.MODEL_FORWARD_ACCUMULATING],
  ["forward breached", { forward: { state: "FORWARD_BREACHED", n: 400 } }, FAMILY_BLOCKER.MODEL_FORWARD_BREACHED],
  ["no forward receipt", { forward: null }, FAMILY_BLOCKER.MODEL_FORWARD_UNREGISTERED],
  ["no confirmed role on the slate", { slate: { ...CLEAR_SLATE, roleConfirmed: 0 } }, FAMILY_BLOCKER.ROLE_CONFIRMATION_UNAVAILABLE],
  ["no real prices", { slate: { ...CLEAR_SLATE, priced: 0 } }, FAMILY_BLOCKER.PRICES_NOT_CAPTURED],
  ["settlement SCHEDULED_UNPROVEN treated as proven", { slate: { ...CLEAR_SLATE, settlementProven: false } }, FAMILY_BLOCKER.SETTLEMENT_NOT_PROVEN],
  ["projection-only family", { slate: { ...CLEAR_SLATE, modelProbability: 0 } }, FAMILY_BLOCKER.NO_MODEL_PROBABILITY],
  ["family not published", { publicationState: "ESTIMATE_BELOW_BAR" }, FAMILY_BLOCKER.FAMILY_NOT_PUBLISHED],
];
for (const [name, patch, code] of evidenceProbes) {
  test(`a granted family with ${name} stays GATED (${code})`, () => {
    const g = deriveFamilyGate({ sport: "nfl", family: "anytime_td", publicationState: "PUBLISHED", modelVersion: "m", forward: PASSED, slate: CLEAR_SLATE, grants: [GRANT], ...patch });
    assert.equal(g.state, FAMILY_GATE_STATE.GATED);
    assert.ok(g.blockers.includes(code));
  });
}

test("mutation: an NFL family enters without the family gate → SPORT_GATED", () => {
  assert.ok(evaluateReceiptV2(cleanAtd(), { asOf: ASOF }).exclusionCodes.includes(EXCLUSION.SPORT_GATED));
  // with the grant active the clean leg clears — proving the probe isolates the sport/family gate
  assert.deepEqual(evaluateReceiptV2(cleanAtd(), { asOf: ASOF, floor: granted(["nfl:anytime_td"]) }).exclusionCodes, []);
});

test("mutation: a grant for anytime TD never launders another family", () => {
  const r = clone(rec);
  assert.ok(evaluateReceiptV2(r, { asOf: ASOF, floor: granted(["nfl:anytime_td"]) }).exclusionCodes.includes(EXCLUSION.SPORT_GATED));
});

const legProbes = [
  ["role uncertain enters", (r) => { r.context.roleState = "AVAILABLE_ROLE_UNCERTAIN"; r.context.availabilityState = "AVAILABLE_ROLE_UNCERTAIN"; }, EXCLUSION.ROLE_UNCERTAIN],
  ["OUT player enters", (r) => { r.context.availabilityState = "OUT"; }, EXCLUSION.AVAILABILITY_BLOCKED],
  ["price captured after kickoff", (r) => { r.market.marketCapturedAt = "2026-10-04T13:31:00Z"; }, EXCLUSION.ODDS_CAPTURED_AFTER_START],
  ["missing price becomes -110", (r) => { r.market.price = null; r.market.sportsbook = null; }, EXCLUSION.MARKET_MISSING],
  ["market probability placed into model probability", (r) => { r.forecast.probability = null; }, EXCLUSION.NO_PROBABILITY],
  ["settlement SCHEDULED_UNPROVEN treated as PROVEN", (r) => { r.context.settlementSupport = "SCHEDULED_UNPROVEN"; }, EXCLUSION.SETTLEMENT_UNSUPPORTED],
  ["started event", (r) => { r.identity.eventStartUtc = "2026-10-02T14:00:00Z"; }, EXCLUSION.EVENT_STARTED],
  ["stale market", (r) => { r.market.marketCapturedAt = "2026-09-30T13:00:00Z"; }, EXCLUSION.ODDS_STALE],
];
for (const [name, mutate, code] of legProbes) {
  test(`mutation (granted family): ${name} → ${code}`, () => {
    const base = cleanAtd(); const r = clone(base); mutate(r);
    assert.notDeepEqual(r, base, "probe did not land");
    assert.ok(evaluateReceiptV2(r, { asOf: ASOF, floor: granted(["nfl:anytime_td"]) }).exclusionCodes.includes(code));
  });
}
