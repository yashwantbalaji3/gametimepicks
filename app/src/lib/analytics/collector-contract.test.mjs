/**
 * Collector contract proofs (Program 092-095 §13):
 *   - forbidden field rejected · free text rejected · kill switch works ·
 *   - name/key parity with event-contract.ts cannot drift · oversize rejected
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  validateCollectPayload,
  collectorDisabled,
  EVENT_NAMES,
  ALLOWED_KEYS,
} from "../../../api/_collect-core.mjs";

const good = () => ({
  schemaVersion: 2,
  event: "daily_hub_view",
  dayBucket: "2026-07-31",
  sport: "mlb",
});

test("a valid closed-enum, day-bucketed event is accepted and normalized verbatim", () => {
  const r = validateCollectPayload(good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.event, good());
});

test("forbidden keys are rejected (email, userId, ip, odds, stake, referrer)", () => {
  for (const k of ["email", "userId", "ipaddr", "oddsLine", "stakeAmount", "referrerUrl"]) {
    const p = { ...good(), [k]: "x" };
    const r = validateCollectPayload(p);
    assert.equal(r.ok, false, `${k} must reject`);
  }
});

test("free text cannot pass: long values, URLs, emails, multi-space prose all reject", () => {
  for (const v of [
    "x".repeat(41),
    "https://tracking.example/path",
    "someone@example.com",
    "this is  free text prose",
  ]) {
    assert.equal(validateCollectPayload({ ...good(), cta: v }).ok, false, JSON.stringify(v));
  }
});

test("unknown event names and wrong schema versions reject", () => {
  assert.equal(validateCollectPayload({ ...good(), event: "made_up_event" }).ok, false);
  assert.equal(validateCollectPayload({ ...good(), schemaVersion: 1 }).ok, false);
});

test("precise timestamps cannot enter: only dayBucket, strictly YYYY-MM-DD", () => {
  assert.equal(validateCollectPayload({ ...good(), dayBucket: "2026-07-31T18:22:01Z" }).ok, false);
});

test("kill switch: unset or 0 disables; only explicit 1/true enables", () => {
  assert.equal(collectorDisabled({}), true);
  assert.equal(collectorDisabled({ ANALYTICS_COLLECTOR_ENABLED: "0" }), true);
  assert.equal(collectorDisabled({ ANALYTICS_COLLECTOR_ENABLED: "1" }), false);
  assert.equal(collectorDisabled({ ANALYTICS_COLLECTOR_ENABLED: "true" }), false);
});

test("PARITY · collector enums exactly equal event-contract.ts (drift fails the suite)", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/analytics/event-contract.ts"),
    "utf8",
  );
  const block = (name) =>
    (src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`)) ?? [])[1] ?? "";
  const names = [...block("EVENT_TYPES").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const keys = [...block("ALLOWED_PROPERTY_KEYS").matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...EVENT_NAMES], names, "EVENT_NAMES must equal event-contract EVENT_TYPES");
  assert.deepEqual([...ALLOWED_KEYS], keys, "ALLOWED_KEYS must equal ALLOWED_PROPERTY_KEYS");
});

test("the public export cannot contain the api directory (boundary)", () => {
  // Static export output must never include the collector source; Vercel builds it separately.
  const out = path.resolve(process.cwd(), "out/api");
  assert.equal(fs.existsSync(out), false, "out/api must not exist in the static export");
});
