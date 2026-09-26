/**
 * P698 — does the learning policy do what it says it did?
 *
 * THE DEFECT. `optimizer/<date>.json` publishes `learningPolicyApplied: true` beside warnings in
 * its own words — "confidence non-predictive — excluded from ranking" and "edge INVERTED at high
 * values — capped, not used to promote" — and neither holds against the same file's rows.
 * Measured across all 89 committed artifacts: 72 carry an unhonoured claim, first on 2026-06-10.
 *
 * WHAT THIS GUARDS. Only whether the artifact's own claim matches the artifact's own numbers.
 * Whether a signal SHOULD be excluded is the learning policy's job. A claim nobody made cannot
 * fail here — which is the property that keeps this from becoming a model opinion in a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { auditPolicyApplication, readWarning, SIGNAL_COMPONENTS } from "./policy-application.mjs";

const leg = (confidence, edgePct, confidenceComponent, edgeComponent) =>
  ({ confidence, edgePct, scoreBreakdown: { confidenceComponent, edgeComponent } });

test("P698 · a signal claimed EXCLUDED that still varies is caught, with its spread", () => {
  const out = auditPolicyApplication({
    policyWarnings: ["confidence non-predictive (spread 4.6pts) — excluded from ranking"],
    legs: [leg("Low", 5, 0.21, 0.1), leg("High", 6, 0.455, 0.12)],
  });
  assert.equal(out.state, "CLAIM_NOT_HONOURED");
  assert.equal(out.rows[0].verdict, "CLAIMED_EXCLUDED_BUT_CONTRIBUTES");
  assert.ok(Math.abs(out.rows[0].spread - 0.245) < 1e-9, "the spread is reported, not just the verdict");
});

test("P698 · a signal genuinely excluded passes — the guard is not simply always red", () => {
  const out = auditPolicyApplication({
    policyWarnings: ["confidence non-predictive — excluded from ranking"],
    legs: [leg("Low", 5, 0, 0.1), leg("High", 6, 0, 0.12)],
  });
  assert.equal(out.state, "HONOURED");
  assert.equal(out.broken, 0);
});

test("P698 · a CAP is not an exclusion — a capped term still promotes below the cap", () => {
  // The exact shape of the live defect: edgeComponent = min(edge,15)/15 × w. Every leg under the
  // cap is promoted in proportion to a signal the same policy calls inverted.
  const out = auditPolicyApplication({
    policyWarnings: ["edge signal is INVERTED at high values — edge capped, not used to promote"],
    legs: [leg("High", 1, 0.4, 0.02), leg("High", 8, 0.4, 0.16), leg("High", 30, 0.4, 0.3)],
  });
  assert.equal(out.rows[0].verdict, "CLAIMED_NEUTRAL_BUT_PROMOTES");
  assert.match(out.rows[0].detail, /rises from 0\.02 .* to 0\.3/);
});

test("P698 · a term that does not increase with its signal honours NOT_PROMOTING", () => {
  const out = auditPolicyApplication({
    policyWarnings: ["edge INVERTED — not used to promote"],
    legs: [leg("High", 1, 0.4, 0.3), leg("High", 30, 0.4, 0.0)],
  });
  assert.equal(out.rows[0].verdict, "HONOURED", "a penalty is the shape the policy asked for");
});

test("P698 · a warning that only REPORTS a measurement claims nothing and is held to nothing", () => {
  // "is inverted" is a finding. Holding a finding to a behaviour would make every honest
  // measurement look like a broken promise, and the producer would stop publishing findings.
  const out = auditPolicyApplication({
    policyWarnings: ["edge signal is INVERTED at high values"],
    legs: [leg("High", 1, 0.4, 0.02), leg("High", 30, 0.4, 0.3)],
  });
  assert.equal(out.rows.length, 0);
  assert.equal(out.state, "NO_CLAIMS");
});

test("P698 · a warning naming no known signal is UNPARSED and counted, never skipped", () => {
  // The vacuous failure mode: wording drifts, nothing matches, the audit reports a clean slate.
  const out = auditPolicyApplication({ policyWarnings: ["some new term was downweighted"], legs: [leg("High", 5, 0.4, 0.1)] });
  assert.equal(out.rows[0].verdict, "UNPARSED");
  assert.equal(out.unparsed, 1);
});

test("P698 · a claim about a component no leg carries is NO_COMPONENT, not HONOURED", () => {
  const out = auditPolicyApplication({
    policyWarnings: ["confidence — excluded from ranking"],
    legs: [{ confidence: "High", edgePct: 5, scoreBreakdown: { edgeComponent: 0.1 } }],
  });
  assert.equal(out.rows[0].verdict, "NO_COMPONENT");
  assert.equal(out.state, "HONOURED", "an unmeasurable claim is not a violation — but it is not a pass for that claim either");
  assert.equal(out.rows.filter((r) => r.verdict === "HONOURED").length, 0, "and it is never counted as honoured");
});

test("P698 · no warnings at all is NO_CLAIMS, never HONOURED", () => {
  assert.equal(auditPolicyApplication({ policyWarnings: [], legs: [] }).state, "NO_CLAIMS");
  assert.equal(auditPolicyApplication({}).state, "NO_CLAIMS");
});

test("P698 · the signal map is explicit, and every entry names a real breakdown field", () => {
  for (const [name, { component, raw }] of Object.entries(SIGNAL_COMPONENTS)) {
    assert.ok(component.length && raw.length, `${name} must name both a component and a raw field`);
  }
  assert.equal(readWarning("edge capped, not used to promote").signal, "edge");
  assert.equal(readWarning("confidence excluded from ranking").claim, "EXCLUDED");
  assert.equal(readWarning("nothing recognisable here").signal, null);
});
