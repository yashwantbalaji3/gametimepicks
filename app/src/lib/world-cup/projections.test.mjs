import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtAmerican } from "./projections.ts";

test("fmtAmerican signs positive odds", () => {
  assert.equal(fmtAmerican(185), "+185");
  assert.equal(fmtAmerican(750), "+750");
});

test("fmtAmerican keeps negative odds", () => {
  assert.equal(fmtAmerican(-140), "-140");
});

test("fmtAmerican handles null/undefined", () => {
  assert.equal(fmtAmerican(null), "—");
  assert.equal(fmtAmerican(undefined), "—");
});
