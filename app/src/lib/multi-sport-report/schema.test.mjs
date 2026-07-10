/**
 * MULTI-SPORT FREESIM REPORT CONTRACT — the honesty invariants every sport's report must satisfy.
 *
 * Pins: every report declares a sourceMode; a market-implied soccer/UFC report can't claim an independent
 * sim / 10k runs / EV / model edge; a market-anchored MLB report CAN claim a run count when it has one; a
 * lean must reference an available market; an unavailable report carries no leans; everything is paper-only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateMultiSportGameReport, defaultClaimsFor, SOURCE_MODE_LABEL } from "./schema.ts";

const base = (over = {}) => ({
  schemaVersion: "1.0.0", sport: "soccer", slateDate: "2026-07-10", eventId: "wc-spain-belgium", eventName: "Spain vs Belgium",
  status: "scheduled", sourceMode: "market_implied_simulation", sourceLabel: "Market-implied read",
  publicClaims: defaultClaimsFor("market_implied_simulation"),
  marketSnapshot: { markets: [{ key: "moneyline_90", label: "Match result", available: true, status: "available", impliedProbability: 0.55 }] },
  simulationOutput: { headline: "Market-implied read", sourceMode: "market_implied_simulation", notes: ["Not an independent 10,000-run soccer simulation."] },
  mainRead: { label: "Spain favored", explanation: "…", paperOnly: true },
  topLeans: [{ market: "moneyline_90", selection: "Spain", rationale: "market", settlementSupported: true, sourceMode: "market_implied_simulation" }],
  keyTakeaways: ["Market-implied."],
  details: { methodology: [], unavailableMarkets: ["player_props"], dataGaps: [], settlementNotes: [] },
  ...over,
});

test("1 · a valid market-implied soccer report passes + labels are honest", () => {
  const v = validateMultiSportGameReport(base());
  assert.equal(v.valid, true, v.errors.join("; "));
  assert.equal(SOURCE_MODE_LABEL.market_implied_simulation, "Market-implied read");
});

test("2 · a market-implied report cannot claim an independent sim / 10k runs / EV / model edge", () => {
  assert.equal(validateMultiSportGameReport(base({ publicClaims: { ...defaultClaimsFor("market_implied_simulation"), canClaimIndependentSimulation: true } })).valid, false);
  assert.equal(validateMultiSportGameReport(base({ publicClaims: { ...defaultClaimsFor("market_implied_simulation"), canClaimTenThousandRuns: true } })).valid, false, "no 10k-run claim without a sampled mode + runCount");
  assert.equal(validateMultiSportGameReport(base({ publicClaims: { ...defaultClaimsFor("market_implied_simulation"), canClaimPositiveEV: true } })).valid, false);
  assert.equal(validateMultiSportGameReport(base({ publicClaims: { ...defaultClaimsFor("market_implied_simulation"), canClaimModelEdge: true } })).valid, false);
});

test("3 · a market-anchored MLB report CAN claim a run count when it actually has one", () => {
  const mlb = base({
    sport: "mlb", sourceMode: "market_anchored_simulation", sourceLabel: "Market-anchored simulation",
    publicClaims: { canClaimIndependentSimulation: false, canClaimTenThousandRuns: true, canClaimPositiveEV: false, canClaimModelEdge: false },
    simulationOutput: { headline: "10,000-run", sourceMode: "market_anchored_simulation", runCount: 10000, notes: [] },
  });
  assert.equal(validateMultiSportGameReport(mlb).valid, true, validateMultiSportGameReport(mlb).errors.join("; "));
  // …but not without the run count.
  const noRuns = { ...mlb, simulationOutput: { ...mlb.simulationOutput, runCount: undefined } };
  assert.equal(validateMultiSportGameReport(noRuns).valid, false);
});

test("4 · a lean must reference an AVAILABLE market; unavailable markets can't be leans", () => {
  const bad = base({ topLeans: [{ market: "player_props", selection: "x", rationale: "y", settlementSupported: false, sourceMode: "market_implied_simulation" }] });
  const v = validateMultiSportGameReport(bad);
  assert.equal(v.valid, false, "a lean on a non-available market is rejected");
  assert.match(v.errors.join(" "), /not available in the snapshot/);
});

test("5 · unavailable report carries no leans; everything is paper-only; sourceMode required", () => {
  assert.equal(validateMultiSportGameReport(base({ sourceMode: "unavailable", simulationOutput: { headline: "n/a", sourceMode: "unavailable", notes: [] } })).valid, false, "unavailable + leans ⇒ invalid");
  assert.equal(validateMultiSportGameReport(base({ mainRead: { label: "x", explanation: "y", paperOnly: false } })).valid, false, "paperOnly must be true");
  const { sourceMode, ...noMode } = base();
  assert.equal(validateMultiSportGameReport(noMode).valid, false, "sourceMode required");
});
