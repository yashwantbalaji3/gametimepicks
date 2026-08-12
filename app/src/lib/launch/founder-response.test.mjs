/**
 * Founder-response schema guards (Program 165 · Release A).
 *
 * Run: npx tsx --test src/lib/launch/founder-response.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FOUNDER_RESPONSE_SCHEMA_VERSION, ALLOWED_CHOICES, validateFounderResponse, transitionFor } from "./founder-response.mjs";
import { SHARED_BLOCKERS, SHARED_BLOCKERS_VERSION } from "./shared-blockers.mjs";

const CLEAN = () => ({
  schemaVersion: FOUNDER_RESPONSE_SCHEMA_VERSION,
  blockersVersion: SHARED_BLOCKERS_VERSION,
  answers: {
    "blocker-legal-section3": { choice: "ANSWERS_PROVIDED_SEE_DECISIONS", details: "answers recorded in the packet edit" },
    "blocker-support": { choice: "DEDICATED_MONITORED_INBOX", externalConfigurationComplete: false },
    "blocker-analytics": { choice: "FIRST_PARTY_COLLECTOR", externalConfigurationComplete: false },
    "blocker-beta-cohort": { choice: "COHORT_APPROVED_SEE_DETAILS", details: "size 8, allowlist, September window" },
    "blocker-odds": { choice: "AUTHORIZE_ONE_NFL_CANARY_MAX_5" },
    "blocker-nba-lineup-rights": { choice: "defer" },
    "blocker-admin-access": { choice: "OPTION_1_PROTECTED_INTERNAL_DEPLOYMENT", externalConfigurationComplete: false },
  },
});

test("every registry blocker has an enumerated choice set with the recommended option first; the clean form validates", () => {
  assert.deepEqual(new Set(Object.keys(ALLOWED_CHOICES)), new Set(SHARED_BLOCKERS.map((b) => b.id)), "exactly the seven blockers, no more, no less");
  const v = validateFounderResponse(CLEAN());
  assert.deepEqual(v.errors, []);
  assert.equal(v.valid, true);
});

test("refusals: stale version, unknown blocker, unknown field, bad enum, duplicate handling, incomplete form", () => {
  assert.ok(!validateFounderResponse({ ...CLEAN(), schemaVersion: 0 }).valid, "stale schema refuses");
  assert.ok(!validateFounderResponse({ ...CLEAN(), blockersVersion: 99 }).valid, "registry version mismatch refuses");
  const unknown = CLEAN(); unknown.answers["blocker-made-up"] = { choice: "YES" };
  assert.ok(validateFounderResponse(unknown).errors.some((e) => /not a registry blocker/.test(e)));
  const widened = CLEAN(); widened.answers["blocker-odds"].apiKey = "x";
  assert.ok(validateFounderResponse(widened).errors.some((e) => /unknown field/.test(e)));
  const badEnum = CLEAN(); badEnum.answers["blocker-support"].choice = "JUST_USE_MY_GMAIL";
  assert.ok(validateFounderResponse(badEnum).errors.some((e) => /not in the enumerated set/.test(e)));
  const missing = CLEAN(); delete missing.answers["blocker-admin-access"];
  assert.ok(validateFounderResponse(missing).errors.some((e) => /missing — the form is answered once/.test(e)));
});

test("secret and PII shapes refuse anywhere in an answer; licensed-feed demands a plain vendor slug", () => {
  const email = CLEAN(); email.answers["blocker-beta-cohort"].details = "invite pal@example.com";
  assert.ok(validateFounderResponse(email).errors.some((e) => /PII never enters/.test(e)));
  const secret = CLEAN(); secret.answers["blocker-odds"].details = "key is sk-abcdef1234567890";
  assert.ok(validateFounderResponse(secret).errors.some((e) => /secret-shaped/.test(e)));
  const feedOk = CLEAN(); feedOk.answers["blocker-nba-lineup-rights"].choice = "licensed-feed:sportradar";
  assert.equal(validateFounderResponse(feedOk).valid, true);
  const feedBad = CLEAN(); feedBad.answers["blocker-nba-lineup-rights"].choice = "licensed-feed:";
  assert.ok(!validateFounderResponse(feedBad).valid);
});

test("transitions are mechanical and NEVER produce CLOSED: choice→PROVIDED, +external config→VERIFYING, defer honest", () => {
  assert.equal(transitionFor("blocker-odds", { choice: "AUTHORIZE_ONE_NFL_CANARY_MAX_5" }).state, "FOUNDER_ACTION_PROVIDED");
  assert.equal(transitionFor("blocker-support", { choice: "DEDICATED_MONITORED_INBOX", externalConfigurationComplete: true }).state, "VERIFYING");
  assert.equal(transitionFor("blocker-nba-lineup-rights", { choice: "defer" }).state, "FOUNDER_ACTION_PROVIDED");
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "launch", "founder-response.mjs"), "utf8");
  assert.ok(!/state: "CLOSED"/.test(src), "closure comes only from the real acceptance receipt, structurally");
});

test("the committed machine template validates and contains placeholders only (no secrets, no PII, no real values)", () => {
  const t = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "docs", "founder-response.template.json"), "utf8"));
  const v = validateFounderResponse(t);
  assert.equal(v.valid, true, v.errors.join(" | "));
  const raw = JSON.stringify(t);
  assert.ok(!/@|sk-|Bearer/.test(raw), "placeholders only");
});
