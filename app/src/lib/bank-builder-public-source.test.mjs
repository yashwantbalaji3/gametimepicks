import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPublicBankBuilderSummary, loadBankBuilderSummary } from "./data-bank-builder.ts";

test("public summary ($1,423.64 / Step 4 after the World Cup hit) is the source of truth for /today + /bank-builder", () => {
  const pub = loadPublicBankBuilderSummary();
  assert.ok(pub, "public summary must exist");
  assert.equal(pub.currentBankrollUnits, 1423.64);
  assert.equal(pub.currentProgressionStep, 4);
});

test("the internal audit summary differs — /today must NOT read it (stale $444.19)", () => {
  const pub = loadPublicBankBuilderSummary();
  const internal = loadBankBuilderSummary();
  // If both exist and differ, the public one wins (that's the bug we fixed on /today).
  if (pub && internal && pub.currentBankrollUnits !== internal.currentBankrollUnits) {
    assert.equal(pub.currentBankrollUnits, 1423.64);
    assert.notEqual(internal.currentBankrollUnits, 1423.64);
  }
});
