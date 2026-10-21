/**
 * NBA product tiers: the settlement check opens for a player family only with forward-graded evidence.
 * Run: npx tsx --test src/lib/products/nba/product-tiers-settlement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { nbaSettlesFamily, nbaSettlesFamilyWith } from "./product-tiers.mjs";
import { nbaPropSettlementGate, nbaPropSettlementReadiness } from "../../sports/nba/prop-settlement-readiness.mjs";
import { VERDICT } from "../../sports/nba/champion-challenger.mjs";

/** TEST FIXTURE gate: reb graded forward (synthetic ledger) and promoted (synthetic founder record). */
const REB_GATE = nbaPropSettlementGate({
  readiness: nbaPropSettlementReadiness([{ schema: "nba-prop-shadow-grade@1", seq: 1, key: "d|e|p|reb", date: "2026-10-20", eventId: "e", playerId: "p", family: "reb", state: "GRADED" }]),
  promotionRecord: { records: [{ seq: 1, kind: "PROMOTION", family: "v0.1", version: "nba-preseason-experimental-v0.1", market: "player_rebounds", date: "2026-11-20", decidedAt: "2026-11-20T15:00:00Z", metrics: { n: { value: 1, n: 1 } }, reason: "TEST FIXTURE — not a founder decision", approver: "Test Founder", evidence: { verdict: VERDICT.READY_FOR_FOUNDER_REVIEW, report: "r.json", market: "player_rebounds" } }] },
});

test("no families passed: identical to the team-contract check (every player family refused)", () => {
  for (const f of ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst", "moneyline", "point_spread", "total_points"]) {
    assert.equal(nbaSettlesFamilyWith()(f), nbaSettlesFamily(f), f);
  }
  assert.equal(nbaSettlesFamily("pts"), false);
});

test("a family the gate opens (graded forward AND founder-promoted) opens for that family only", () => {
  assert.equal(nbaSettlesFamilyWith(["reb"])("reb"), false, "a bare family list is not a gate");
  const s = nbaSettlesFamilyWith(REB_GATE);
  assert.equal(s("reb"), true);
  assert.equal(s("ast"), false);
  assert.equal(s("moneyline"), true, "team markets are unchanged");
});
