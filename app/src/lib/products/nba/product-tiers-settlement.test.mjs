/**
 * NBA product tiers: the settlement check opens for a player family only with forward-graded evidence.
 * Run: npx tsx --test src/lib/products/nba/product-tiers-settlement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { nbaSettlesFamily, nbaSettlesFamilyWith } from "./product-tiers.mjs";

test("no families passed: identical to the team-contract check (every player family refused)", () => {
  for (const f of ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst", "moneyline", "point_spread", "total_points"]) {
    assert.equal(nbaSettlesFamilyWith()(f), nbaSettlesFamily(f), f);
  }
  assert.equal(nbaSettlesFamily("pts"), false);
});

test("a family graded forward opens for that family only", () => {
  const s = nbaSettlesFamilyWith(["reb"]);
  assert.equal(s("reb"), true);
  assert.equal(s("ast"), false);
  assert.equal(s("moneyline"), true, "team markets are unchanged");
});
