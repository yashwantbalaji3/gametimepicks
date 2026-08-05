/**
 * Analytics activation-ladder guards (Program 138).
 *
 * A readiness reporter that always answers "APPROVED_NOT_CONFIGURED" would look correct today and
 * be worthless on the day it matters. These prove each rung is actually reachable, and — more
 * importantly — that the two half-configured states are distinguished, because those are the two
 * ways activation silently produces nothing:
 *
 *   client set, server unset  → the browser POSTs into a collector that answers 204 and discards
 *   server set, client unset  → the collector is live and no browser ever calls it
 *
 * Run: npx tsx --test src/lib/analytics/activation-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { activationState } from "../../../scripts/analytics-activation-check.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const CLIENT = { NEXT_PUBLIC_ANALYTICS_ENABLED: "1", NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://gametimepicks.yashwantbalaji.com/api/collect" };
const SERVER = { ANALYTICS_COLLECTOR_ENABLED: "1" };

test("unsigned approval outranks every amount of configuration", () => {
  assert.equal(activationState({ ...CLIENT, ...SERVER }, { signed: false }), "NOT_APPROVED");
});

test("signed but unconfigured is APPROVED_NOT_CONFIGURED — today's real state", () => {
  assert.equal(activationState({}, { signed: true }), "APPROVED_NOT_CONFIGURED");
});

test("client configured but collector disabled is caught, not reported as live", () => {
  assert.equal(activationState(CLIENT, { signed: true }), "AUTHORIZED_ENDPOINT_PRESENT");
  // Explicitly disabled is the same as absent — the kill switch must not be satisfiable by "0".
  assert.equal(activationState({ ...CLIENT, ANALYTICS_COLLECTOR_ENABLED: "0" }, { signed: true }), "AUTHORIZED_ENDPOINT_PRESENT");
});

test("server configured but client unset never reads as production", () => {
  const s = activationState(SERVER, { signed: true });
  assert.equal(s, "APPROVED_NOT_CONFIGURED");
  assert.notEqual(s, "PRODUCTION_ENABLED");
});

test("a non-production endpoint host is STAGING however the flags are set", () => {
  for (const endpoint of [
    "https://gametime-picks-abc123.vercel.app/api/collect",
    "http://localhost:3000/api/collect",
    "https://staging.gametimepicks.com/api/collect",
  ]) {
    assert.equal(
      activationState({ ...CLIENT, ...SERVER, NEXT_PUBLIC_ANALYTICS_ENDPOINT: endpoint }, { signed: true }),
      "STAGING_PROVEN",
      `${endpoint} must not read as production`,
    );
  }
});

test("full production configuration WITHOUT a store is reported distinctly, not as enabled", () => {
  // Without BLOB_READ_WRITE_TOKEN the collector logs and discards. That is a real, easy-to-miss
  // half-activation: events look accepted, nothing is ever queryable.
  assert.equal(activationState({ ...CLIENT, ...SERVER }, { signed: true }), "PRODUCTION_NO_STORE");
  assert.equal(activationState({ ...CLIENT, ...SERVER, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }, { signed: true }), "PRODUCTION_ENABLED");
});

test("the §7 approval this all rests on is really signed in the repository", () => {
  const doc = fs.readFileSync(path.join(REPO, "docs/ANALYTICS_ACTIVATION_DECISION.md"), "utf8");
  assert.match(doc, /- \[x\] \*\*Approve\*\*/, "§7 must be signed Approve");
  assert.match(doc, /cookieless/, "the approval's constraints must remain recorded verbatim");
  assert.match(doc, /no odds, lines, picks, stakes, bankroll, wager, or exposure details/,
    "the money/picks exclusion is part of what was approved and must not be edited away");
});
