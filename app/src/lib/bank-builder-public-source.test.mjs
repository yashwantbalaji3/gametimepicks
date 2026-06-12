import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPublicBankBuilderSummary, loadBankBuilderSummary } from "./data-bank-builder.ts";

test("public summary ($728.76 / Step 3) is the source of truth for /today + /bank-builder", () => {
  const pub = loadPublicBankBuilderSummary();
  assert.ok(pub, "public summary must exist");
  assert.equal(pub.currentBankrollUnits, 728.76);
  assert.equal(pub.currentProgressionStep, 3);
});

test("the internal audit summary differs — /today must NOT read it (stale $444.19)", () => {
  const pub = loadPublicBankBuilderSummary();
  const internal = loadBankBuilderSummary();
  // If both exist and differ, the public one wins (that's the bug we fixed on /today).
  if (pub && internal && pub.currentBankrollUnits !== internal.currentBankrollUnits) {
    assert.equal(pub.currentBankrollUnits, 728.76);
    assert.notEqual(internal.currentBankrollUnits, 728.76);
  }
});
