import { test } from "node:test";
import assert from "node:assert/strict";

import { classifySource, normalizeSourceParam, classifyReferrerHost, withSource, SOURCE_BUCKETS } from "./source.ts";

test("an approved ?source= param wins and maps through aliases", () => {
  assert.equal(classifySource({ sourceParam: "x" }), "x");
  assert.equal(classifySource({ sourceParam: "twitter" }), "x");
  assert.equal(classifySource({ sourceParam: "IG" }), "instagram");
  assert.equal(classifySource({ sourceParam: "  Discord " }), "discord");
  assert.equal(classifySource({ sourceParam: "tt" }), "tiktok");
});

test("junk / oversized / unknown source params are ignored (not trusted)", () => {
  assert.equal(normalizeSourceParam("utm_campaign=blah"), null);
  assert.equal(normalizeSourceParam("x".repeat(40)), null);
  assert.equal(normalizeSourceParam(123), null);
  assert.equal(normalizeSourceParam(""), null);
  // unknown param + no referrer → direct
  assert.equal(classifySource({ sourceParam: "myspace" }), "direct");
});

test("coarse referrer host classifies social + search; never the full URL", () => {
  assert.equal(classifyReferrerHost("t.co"), "x");
  assert.equal(classifyReferrerHost("www.instagram.com"), "instagram");
  assert.equal(classifyReferrerHost("google.com"), "organic");
  assert.equal(classifyReferrerHost("news.ycombinator.com"), null); // external-but-unknown
});

test("deterministic fallback: same-origin=direct; external-unknown=referral; nothing=direct", () => {
  assert.equal(classifySource({ sameOrigin: true, referrerHost: "x.com" }), "direct"); // internal nav wins over ref
  assert.equal(classifySource({ referrerHost: "news.ycombinator.com" }), "referral");
  assert.equal(classifySource({ referrerHost: "" }), "direct");
  assert.equal(classifySource({}), "direct");
});

test("every classified value is a member of the closed bucket set", () => {
  const cases = [{ sourceParam: "x" }, { sourceParam: "junk" }, { referrerHost: "discord.gg" }, { referrerHost: "foo.bar" }, {}];
  for (const c of cases) assert.ok(SOURCE_BUCKETS.includes(classifySource(c)), JSON.stringify(c));
});

test("withSource tags first-party paths coarsely, is idempotent, and leaves direct/canonical paths clean", () => {
  assert.equal(withSource("/today", "x"), "/today?source=x");
  assert.equal(withSource("/games/mlb/a-vs-b-2026-07-24-101", "discord"), "/games/mlb/a-vs-b-2026-07-24-101?source=discord");
  assert.equal(withSource("/results?tab=mlb", "instagram"), "/results?tab=mlb&source=instagram");
  assert.equal(withSource("/today?source=x", "discord"), "/today?source=x", "idempotent — never double-tags");
  assert.equal(withSource("/today", "direct"), "/today", "direct links stay parameter-free");
  // canonical path is still valid WITHOUT the param (the param is additive only)
  assert.ok(withSource("/today", "x").startsWith("/today"));
});
