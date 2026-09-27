import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { recordReconciledCharge, recordRequest, spentOnPurpose } from "./p171-authorization.mjs";

const APP = path.resolve(new URL("../../../..", import.meta.url).pathname);
const base = () => ({ cumulativeCredits: 10, requests: [{ at: "2026-09-01T00:00:00Z", purpose: "bulk", creditsUsed: 10 }] });
const CHARGE = {
  reconciliationId: "gha-36336729861-phase-h-probe",
  at: "2026-09-27T17:23:49Z",
  purpose: "phase-h in-play probe on CAR @ CLE",
  creditsUsed: 3,
  evidence: "GitHub Actions run 36336729861 · provider 200 · charged 3 credit(s)",
  reason: "paid response succeeded; a TDZ crash prevented the durable write",
};

test("a reconciled charge reaches the budget, because the money genuinely left", () => {
  const { ledger, applied } = recordReconciledCharge(base(), CHARGE);
  assert.equal(applied, true);
  assert.equal(ledger.cumulativeCredits, 13);
  assert.equal(spentOnPurpose(ledger, "phase-h in-play"), 3, "the Phase H sub-budget is the binding one");
});

test("🔴 it is IDEMPOTENT — a repeat is a no-op, never a second charge", () => {
  /*
   * Reconciliation is exactly the kind of thing that gets run twice: a rerun, a retry, a second
   * pair of hands. Double-counting spend is as wrong as losing it.
   */
  const once = recordReconciledCharge(base(), CHARGE);
  const twice = recordReconciledCharge(once.ledger, CHARGE);
  assert.equal(twice.applied, false);
  assert.match(twice.reason, /ALREADY RECONCILED/);
  assert.equal(twice.ledger.cumulativeCredits, 13, "a repeat must not move the total");
  assert.equal(spentOnPurpose(twice.ledger, "phase-h in-play"), 3);
  /* Ten times is still three. */
  let l = base();
  for (let i = 0; i < 10; i++) l = recordReconciledCharge(l, CHARGE).ledger;
  assert.equal(spentOnPurpose(l, "phase-h in-play"), 3);
});

test("it is never mistakable for a call we observed", () => {
  const { ledger } = recordReconciledCharge(base(), CHARGE);
  const entry = ledger.requests.at(-1);
  assert.equal(entry.provenance, "RECONCILED");
  assert.equal(entry.evidence, CHARGE.evidence);
  assert.ok(entry.reconciliationReason);
  /* An observed call carries provider counters; a reconciled one cannot and must not invent them. */
  assert.equal(entry.providerRequestsRemaining, null);
  assert.equal(entry.status, null);
  const observed = recordRequest(base(), { at: "x", purpose: "p", endpoint: "e", status: 200, headers: { "x-requests-last": "3", "x-requests-remaining": "9" } });
  assert.equal(observed.requests.at(-1).provenance, undefined, "an ordinary request must NOT be stamped");
  assert.equal(observed.requests.at(-1).providerRequestsRemaining, 9);
});

test("it refuses anything it cannot audit, rather than guessing", () => {
  for (const bad of [
    { ...CHARGE, creditsUsed: 0 }, { ...CHARGE, creditsUsed: -1 }, { ...CHARGE, creditsUsed: "three" },
    { ...CHARGE, creditsUsed: undefined }, { ...CHARGE, evidence: "" }, { ...CHARGE, reason: "  " },
    { ...CHARGE, reconciliationId: "" }, { ...CHARGE, at: undefined }, { ...CHARGE, purpose: "" },
  ]) {
    const r = recordReconciledCharge(base(), bad);
    assert.equal(r.applied, false, `${JSON.stringify(bad).slice(0, 70)} must be refused`);
    assert.match(r.reason, /^REFUSED/);
    assert.equal(r.ledger.cumulativeCredits, 10, "a refusal must not move the ledger");
  }
});

test("the ledger is written by the owner, never hand-edited", () => {
  const script = fs.readFileSync(path.join(APP, "scripts/ops/reconcile-odds-charge.mjs"), "utf8");
  assert.match(script, /recordReconciledCharge\(/, "the script must go through the canonical owner");
  /* It may write the file the owner produced, but must not construct an entry itself. */
  assert.equal(/requests:\s*\[/.test(script), false, "the script must not build a ledger entry by hand");
  assert.equal(/cumulativeCredits:\s*\d/.test(script), false, "nor set the total directly");
  assert.match(script, /--apply/, "writing must be explicit");
  assert.match(script, /DRY RUN/, "and dry by default");
});
