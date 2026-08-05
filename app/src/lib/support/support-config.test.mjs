/**
 * Support configuration guards (Program 137).
 *
 * The property under test is a REFUSAL. Anyone can write a resolver that returns a support address;
 * the value here is that it declines to publish one that would leave a user shouting into a void.
 * Every case below is a way the honest default could be lost by an ordinary future edit.
 *
 * Run: npx tsx --test src/lib/support/support-config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSupportConfig, supportGateEvidence, SUPPORT_STATES } from "./support-config.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const GOOD = {
  GTP_SUPPORT_DESTINATION: "mailto:help@gametimepicks.com",
  GTP_SUPPORT_OWNER: "founder",
  GTP_SUPPORT_RESPONSE: "We read every message and reply within two business days.",
};

test("THE DEFAULT · no configuration means no support UI, and that is not an error", () => {
  const c = resolveSupportConfig({});
  assert.equal(c.state, SUPPORT_STATES.NOT_CONFIGURED);
  assert.equal(c.enabled, false);
  assert.equal(c.destination, null);
  assert.equal(c.responseExpectation, null, "an unset SLA must never be defaulted into existence");
});

test("a complete, real configuration enables the entry point and passes values through verbatim", () => {
  const c = resolveSupportConfig(GOOD);
  assert.equal(c.state, SUPPORT_STATES.CONFIGURED);
  assert.equal(c.enabled, true);
  assert.equal(c.kind, "email");
  assert.equal(c.destination, GOOD.GTP_SUPPORT_DESTINATION);
  assert.equal(c.responseExpectation, GOOD.GTP_SUPPORT_RESPONSE, "published verbatim — never reworded or inferred");
  assert.deepEqual(c.problems, []);
});

test("PARTIAL configuration is INVALID, not 'good enough' — and still renders nothing", () => {
  for (const missing of ["GTP_SUPPORT_DESTINATION", "GTP_SUPPORT_OWNER", "GTP_SUPPORT_RESPONSE"]) {
    const env = { ...GOOD };
    delete env[missing];
    const c = resolveSupportConfig(env);
    assert.equal(c.state, SUPPORT_STATES.INVALID, `${missing} missing must be INVALID`);
    assert.equal(c.enabled, false, `${missing} missing must not enable the surface`);
    assert.ok(c.problems.some((p) => p.startsWith(missing)), `the problem must name ${missing}`);
  }
});

test("placeholder destinations are refused — a dead address is worse than no address", () => {
  for (const bad of [
    "mailto:test@example.com",
    "mailto:your-email@domain.com",
    "https://example.com/support",
    "mailto:noreply@gametimepicks.com",
    "mailto:TODO",
  ]) {
    const c = resolveSupportConfig({ ...GOOD, GTP_SUPPORT_DESTINATION: bad });
    assert.equal(c.enabled, false, `${bad} must not enable support`);
    assert.equal(c.state, SUPPORT_STATES.INVALID);
  }
});

test("a plaintext http:// destination is refused — support traffic carries personal detail", () => {
  const c = resolveSupportConfig({ ...GOOD, GTP_SUPPORT_DESTINATION: "http://support.gametimepicks.com" });
  assert.equal(c.enabled, false);
  assert.ok(c.problems.some((p) => /https/.test(p)));
});

test("a placeholder response expectation cannot smuggle in an SLA", () => {
  const c = resolveSupportConfig({ ...GOOD, GTP_SUPPORT_RESPONSE: "TBD" });
  assert.equal(c.enabled, false);
  assert.equal(c.responseExpectation, null);
});

test("the gate reports PARTIAL while unconfigured, and never PASS on config alone", () => {
  const unset = supportGateEvidence({});
  assert.equal(unset.gate, "PARTIAL");
  assert.ok(unset.blocker, "an unconfigured channel must name its blocker");

  // Even fully configured, the gate stops short of PASS: config proves intent, not delivery.
  const set = supportGateEvidence(GOOD);
  assert.equal(set.gate, "PASS_PENDING_DELIVERY_TEST");
  assert.notEqual(set.gate, "PASS", "configuration alone is not a delivered message");
});

test("PRODUCTION TRUTH · the repository ships no support destination, so no support UI is exported", () => {
  // If someone later hardcodes an address into a component, this fails — which is the point. The
  // address must arrive through configuration, where the validation above can refuse a bad one.
  const out = path.join(APP, "out");
  if (!fs.existsSync(out)) return;                       // no build in this run — nothing to check

  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) {
        const html = fs.readFileSync(p, "utf8");
        const m = html.match(/mailto:[^"'\s<>]+/g);
        if (m) offenders.push(`${path.relative(out, p)}: ${[...new Set(m)].join(", ")}`);
      }
    }
  };
  walk(out);
  assert.deepEqual(offenders, [], `exported HTML contains mailto: links with no support contract behind them:\n${offenders.join("\n")}`);
});
