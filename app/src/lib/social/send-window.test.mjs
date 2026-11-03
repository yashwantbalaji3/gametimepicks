import assert from "node:assert/strict";
import test from "node:test";

import { shortPricedWindow } from "./send-window.mjs";

const asOf = "2026-11-02T22:13:00Z";

test("a priced rebuild whose quote expires within the approval window is reported", () => {
  assert.equal(shortPricedWindow({ containsMarketData: true, window: { closesAt: "2026-11-02T23:25:49Z" } }, asOf), 1.2);
});

test("an unpriced package, or one with time left, passes", () => {
  assert.equal(shortPricedWindow({ containsMarketData: false, window: { closesAt: "2026-11-02T23:25:49Z" } }, asOf), null);
  assert.equal(shortPricedWindow({ containsMarketData: true, window: { closesAt: "2026-11-03T03:00:00Z" } }, asOf), null);
});
