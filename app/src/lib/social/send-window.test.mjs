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

test("NFL Week 9 snapshot: only the 19:01:50Z capture runs to the last Week 9 kickoff; others keep 12 h", async () => {
  const { sendWindow } = await import("./send-window.mjs");
  const { nflSocialLineMaxAgeHours } = await import("../odds/display-authorization.mjs");
  const w9 = sendWindow({ sport: "nfl", firstStartUtc: "2026-11-08T18:00:00Z", quoteTimes: ["2026-11-05T19:01:50Z"] });
  assert.equal(w9.latestValidSendUtc, "2026-11-08T18:00:00Z");
  const mnf = sendWindow({ sport: "nfl", firstStartUtc: "2026-11-10T01:15:00Z", quoteTimes: ["2026-11-05T19:01:50Z"] });
  assert.equal(mnf.latestValidSendUtc, "2026-11-10T01:15:00Z");
  const other = sendWindow({ sport: "nfl", firstStartUtc: "2026-11-08T18:00:00Z", quoteTimes: ["2026-11-05T19:01:51Z"] });
  assert.equal(other.latestValidSendUtc, "2026-11-06T07:01:51Z");
  assert.equal(nflSocialLineMaxAgeHours("2026-11-05T19:01:50Z", "2026-11-10T01:15:00Z", 12), 12, "at or after the last kickoff: standard");
  assert.equal(sendWindow({ sport: "nba", firstStartUtc: "2026-11-08T18:00:00Z", quoteTimes: ["2026-11-05T19:01:50Z"] }).maxAgeHours, 6);
});
