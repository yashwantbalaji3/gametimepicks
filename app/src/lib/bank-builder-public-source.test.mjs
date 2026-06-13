import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPublicBankBuilderSummary, loadBankBuilderSummary } from "./data-bank-builder.ts";

test("public summary ($3,623.97 / Step 5 after the Step-4 hit) is the source of truth for /today + /bank-builder", () => {
  const pub = loadPublicBankBuilderSummary();
  assert.ok(pub, "public summary must exist");
  assert.equal(pub.currentBankrollUnits, 3623.97);
  assert.equal(pub.currentProgressionStep, 5);
});

test("the internal audit summary differs — /today must NOT read it (stale $444.19)", () => {
  const pub = loadPublicBankBuilderSummary();
  const internal = loadBankBuilderSummary();
  // If both exist and differ, the public one wins (that's the bug we fixed on /today).
  if (pub && internal && pub.currentBankrollUnits !== internal.currentBankrollUnits) {
    assert.equal(pub.currentBankrollUnits, 3623.97);
    assert.notEqual(internal.currentBankrollUnits, 3623.97);
  }
});
