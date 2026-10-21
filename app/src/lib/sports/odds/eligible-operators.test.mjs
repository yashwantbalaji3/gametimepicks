/**
 * The eligible-operator allowlist is FAIL-CLOSED: only listed licensed operators are eligible, by
 * provider key or display title; everything else — offshore, unknown, empty — is not.
 *
 * Run: npx tsx --test src/lib/sports/odds/eligible-operators.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ELIGIBLE_OPERATOR_KEYS, KNOWN_OFFSHORE_KEYS, isEligibleOperator, isEligibleProvider } from "./eligible-operators.mjs";

test("every licensed key is eligible; no offshore key is", () => {
  for (const k of ELIGIBLE_OPERATOR_KEYS) assert.equal(isEligibleOperator(k), true, k);
  for (const k of KNOWN_OFFSHORE_KEYS) assert.equal(isEligibleOperator(k), false, k);
  assert.equal(KNOWN_OFFSHORE_KEYS.some((k) => ELIGIBLE_OPERATOR_KEYS.includes(k)), false, "the two lists never overlap");
});

test("unknown, empty and non-string keys are not eligible (fail-closed)", () => {
  for (const k of ["hardrockbet", "ballybet", "fliff", "", "  ", null, undefined, 42]) assert.equal(isEligibleOperator(k), false, String(k));
});

test("display titles resolve too — the MLB board stores titles, not keys", () => {
  for (const t of ["DraftKings", "FanDuel", "BetMGM", "Caesars", "BetRivers", "Fanatics", "ESPN BET"]) assert.equal(isEligibleProvider(t), true, t);
  for (const t of ["BetOnline.ag", "Bovada", "MyBookie.ag", "BetUS", "LowVig.ag", "Unknown Book", null]) assert.equal(isEligibleProvider(t), false, String(t));
});
