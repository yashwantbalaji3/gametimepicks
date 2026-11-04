import assert from "node:assert/strict";
import test from "node:test";

import { etClockUtc, NBA_LEAD, nbaTodayRecommended } from "../../../scripts/social/render-social-pack.mjs";
import { recommendedPostTime } from "./social-package.mjs";

test("NBA publish suggestions: winner tip - 60, stats tip - 57, NBA Today 17:00 ET (founder 2026-11-04)", () => {
  assert.deepEqual([NBA_LEAD.winnerMin, NBA_LEAD.statsMin, NBA_LEAD.todayEt], [60, 57, "17:00"]);
  const g = [{ kickoffUtc: "2026-11-05T00:30:00Z" }];
  const asOf = "2026-11-04T07:00:00Z";
  assert.equal(recommendedPostTime({ games: g, afterEtDate: "2026-11-03", asOf, leadMs: 60 * 60e3 }).recommendedAt, "2026-11-04T23:30:00Z");
  assert.equal(recommendedPostTime({ games: g, afterEtDate: "2026-11-03", asOf, leadMs: 57 * 60e3 }).recommendedAt, "2026-11-04T23:33:00Z");
  assert.equal(recommendedPostTime({ games: g, afterEtDate: "2026-11-03", asOf }).recommendedAt, "2026-11-04T22:30:00Z", "default lead unchanged for other sports");
  assert.equal(new Date(etClockUtc("2026-11-04", "17:00")).toISOString(), "2026-11-04T22:00:00.000Z", "EST");
  assert.equal(new Date(etClockUtc("2026-10-20", "17:00")).toISOString(), "2026-10-20T21:00:00.000Z", "EDT");
  const first = Date.parse("2026-11-05T00:00:00Z");
  assert.equal(nbaTodayRecommended({ date: "2026-11-04", firstMs: first, asOf }).recommendedAt, "2026-11-04T22:00:00Z");
  assert.equal(nbaTodayRecommended({ date: "2026-11-04", firstMs: Date.parse("2026-11-04T21:30:00Z"), asOf }).recommendedAt, "2026-11-04T20:30:00Z", "early tip: never at or after the first tip");
  assert.equal(nbaTodayRecommended({ date: "2026-11-04", firstMs: first, asOf: "2026-11-04T22:00:00Z" }), null, "past: no suggestion");
  assert.equal(recommendedPostTime({ games: g, afterEtDate: "2026-11-03", asOf: "2026-11-04T23:40:00Z", leadMs: 57 * 60e3 }), null);
});
