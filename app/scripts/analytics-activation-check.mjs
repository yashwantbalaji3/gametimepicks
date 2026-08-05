/**
 * Analytics activation readiness — validator + offline smoke test (Program 138).
 *
 * Everything needed to turn measurement on already exists: the §7 privacy approval is SIGNED
 * (docs/ANALYTICS_ACTIVATION_DECISION.md §7.1, 2026-07-31), the closed-enum contract is guarded, and
 * the first-party collector is implemented at api/collect.mjs. What has never existed is a single
 * command that answers "if the founder sets the variables right now, would this work, and where
 * exactly on the ladder are we?"
 *
 * This runs with NO network and NO paid call. It reads variable NAMES and whether they are set —
 * it never prints a value, and never reads BLOB_READ_WRITE_TOKEN's contents.
 *
 *   node scripts/analytics-activation-check.mjs [--json]
 *
 * Exit 0 always: this reports state, it is not a gate. The launch gate is generated elsewhere.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateCollectPayload, collectorDisabled, MAX_BODY_BYTES } from "../api/_collect-core.mjs";
import { readSinkConfig } from "../src/lib/analytics/sink.ts";
import { resolveMeasurementMode } from "../src/lib/analytics/adoption.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");
const JSON_MODE = process.argv.includes("--json");

/**
 * The four variables, split by WHERE they take effect. This split is the thing most likely to be
 * got wrong during activation: the two NEXT_PUBLIC_* values are baked into the export at BUILD
 * time (so changing them requires a redeploy), while the two server values are read per request
 * by the function (so the kill switch is instant). Setting the client pair without the server pair
 * produces a site that emits events into a 204 void.
 */
const VARIABLES = [
  { name: "NEXT_PUBLIC_ANALYTICS_ENABLED", where: "build", role: "client sink on/off", required: true },
  { name: "NEXT_PUBLIC_ANALYTICS_ENDPOINT", where: "build", role: "where the browser POSTs", required: true },
  { name: "NEXT_PUBLIC_ANALYTICS_MODE", where: "build", role: "force 'staging' for a rehearsal", required: false },
  { name: "ANALYTICS_COLLECTOR_ENABLED", where: "server", role: "collector kill switch (instant, no redeploy)", required: true },
  { name: "BLOB_READ_WRITE_TOKEN", where: "server", role: "durable storage; absent ⇒ STAGING log-only", required: false },
];

const isSet = (env, n) => typeof env[n] === "string" && env[n].trim() !== "";

/** The ladder from docs/ANALYTICS_APPROVED_ENDPOINT_PENDING.md — one place, one vocabulary. */
export function activationState(env, { signed }) {
  if (!signed) return "NOT_APPROVED";
  const clientReady = isSet(env, "NEXT_PUBLIC_ANALYTICS_ENABLED") && isSet(env, "NEXT_PUBLIC_ANALYTICS_ENDPOINT");
  const serverReady = isSet(env, "ANALYTICS_COLLECTOR_ENABLED") && String(env.ANALYTICS_COLLECTOR_ENABLED).trim() !== "0";
  if (!clientReady) return "APPROVED_NOT_CONFIGURED";
  if (!serverReady) return "AUTHORIZED_ENDPOINT_PRESENT";      // browser would emit into a disabled collector
  const mode = resolveMeasurementMode(readSinkConfig(env), env);
  if (mode === "staging") return "STAGING_PROVEN";
  return isSet(env, "BLOB_READ_WRITE_TOKEN") ? "PRODUCTION_ENABLED" : "PRODUCTION_NO_STORE";
}

/**
 * Offline proof that the collector's decisions still hold. These are the guarantees the founder's
 * §7 approval is conditioned on, re-checked at activation time rather than trusted from a doc.
 */
function smokeTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass, detail });

  const good = { schemaVersion: 2, event: "daily_hub_view", dayBucket: "2026-08-05", sport: "mlb" };
  ok("a valid closed-enum event is accepted", validateCollectPayload(good).ok === true, "daily_hub_view");

  ok("an unknown event name is rejected",
    validateCollectPayload({ ...good, event: "user_identified" }).ok === false, "closed enum holds");

  ok("a PII field is rejected",
    validateCollectPayload({ ...good, email: "a@b.com" }).ok === false, "allowlist holds");

  ok("free text is rejected",
    validateCollectPayload({ ...good, note: "hello there" }).ok === false, "no free-text field");

  ok("a precise timestamp is rejected (day granularity only)",
    validateCollectPayload({ ...good, dayBucket: "2026-08-05T14:22:31Z" }).ok === false, "dayBucket stays coarse");

  ok("the kill switch disables collection",
    collectorDisabled({ ANALYTICS_COLLECTOR_ENABLED: "0" }) === true &&
    collectorDisabled({}) === true, "unset or 0 ⇒ disabled");

  ok("the kill switch does NOT disable when explicitly enabled",
    collectorDisabled({ ANALYTICS_COLLECTOR_ENABLED: "1" }) === false, "1 ⇒ enabled");

  ok("the body cap is small enough to bound abuse", MAX_BODY_BYTES <= 4096, `${MAX_BODY_BYTES} bytes`);

  // Fail-closed: half a configuration must never resolve to a live sink.
  const half = readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1" });
  ok("half a configuration resolves OFF", half.enabled !== true || !half.endpoint, "endpoint missing ⇒ NOOP");

  return checks;
}

function signedApproval() {
  try {
    const d = fs.readFileSync(path.join(REPO, "docs/ANALYTICS_ACTIVATION_DECISION.md"), "utf8");
    return /- \[x\] \*\*Approve\*\*/.test(d);
  } catch { return false; }
}

// Only run when invoked directly. Without this the module cannot be imported at all: the top-level
// body executed and called process.exit(0), which silently terminated the test runner after the
// first test — the suite reported "1 pass" for a seven-test file and looked green.
function main() {
const env = process.env;
const signed = signedApproval();
const state = activationState(env, { signed });
const checks = smokeTest();
const variables = VARIABLES.map((v) => ({ ...v, set: isSet(env, v.name) }));   // NAMES and set-ness only
const failed = checks.filter((c) => !c.pass);

if (JSON_MODE) {
  console.log(JSON.stringify({ state, approvalSigned: signed, variables, checks, allChecksPass: failed.length === 0 }, null, 2));
} else {
  console.log(`\n=== analytics activation readiness ===\n`);
  console.log(`  privacy approval (§7): ${signed ? "SIGNED 2026-07-31" : "UNSIGNED"}`);
  console.log(`  ladder state:          ${state}\n`);
  console.log("  configuration (names and set/unset only — no value is ever printed):");
  for (const v of variables) {
    console.log(`    ${v.set ? "SET  " : "unset"}  ${v.name.padEnd(31)} [${v.where}] ${v.role}${v.required ? "" : "  (optional)"}`);
  }
  console.log("\n  offline contract checks:");
  for (const c of checks) console.log(`    ${c.pass ? "ok  " : "FAIL"}  ${c.name} — ${c.detail}`);
  console.log(`\n  ${failed.length === 0 ? "all contract checks pass" : `${failed.length} CHECK(S) FAILED`}`);
  if (state === "APPROVED_NOT_CONFIGURED") {
    console.log("  → the contract is approved and the collector is built; the two NEXT_PUBLIC_* build");
    console.log("    variables and ANALYTICS_COLLECTOR_ENABLED are what remain. See docs/ANALYTICS_ENDPOINT_OPTIONS.md.\n");
  } else {
    console.log("");
  }
}
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
