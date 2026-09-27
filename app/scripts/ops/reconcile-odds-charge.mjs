#!/usr/bin/env node
/**
 * RECONCILE A PROVIDER CHARGE THIS LEDGER NEVER RECORDED.
 *
 * ⚠ THE LEDGER IS NOT HAND-EDITED. This applies `recordReconciledCharge` — the canonical owner —
 *   which stamps `provenance: "RECONCILED"` and refuses a repeat by `reconciliationId`. Editing the
 *   JSON directly would produce an entry indistinguishable from a call we actually observed, in the
 *   one record every budget guard is computed from.
 *
 * Dry by default; `--apply` writes. Re-running with `--apply` is a NO-OP, by construction.
 *
 * Usage:
 *   node app/scripts/ops/reconcile-odds-charge.mjs                # show what would happen
 *   node app/scripts/ops/reconcile-odds-charge.mjs --apply        # write it once
 *
 * EXIT CODES
 *   0  applied, or already reconciled (both are the intended end state)
 *   2  refused — the inputs could not support an auditable entry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { P171_LEDGER_RELPATH, recordReconciledCharge, spentOnPurpose } from "../../src/lib/sports/odds/p171-authorization.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APPLY = process.argv.includes("--apply");
const PHASE_H_PURPOSE = "phase-h in-play";

/*
 * The one known discrepancy, stated as data rather than prose so the script IS the record.
 * Everything here is quotable from the run's own log:
 *   "provider 200 (OK) · charged 3 credit(s) · remaining 10290"
 *   "ReferenceError: Cannot access 'matchEvent' before initialization"
 */
const CHARGE = {
  reconciliationId: "gha-36336729861-phase-h-probe",
  at: "2026-09-27T17:23:49Z",
  purpose: `${PHASE_H_PURPOSE} probe on CAR @ CLE`,
  creditsUsed: 3,
  evidence: "GitHub Actions run 36336729861 · provider 200 · charged 3 credit(s) · x-requests-remaining 10290",
  reason: "paid response succeeded; a TDZ crash while grading it prevented the durable ledger write (fixed in #736)",
};

const ledgerPath = path.join(ROOT, P171_LEDGER_RELPATH);
let ledger;
try {
  ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
} catch (e) {
  console.error(`REFUSED: cannot read the ledger at ${P171_LEDGER_RELPATH} — ${e.message}`);
  process.exit(2);
}

const before = spentOnPurpose(ledger, PHASE_H_PURPOSE);
const out = recordReconciledCharge(ledger, CHARGE);

console.log(`LEDGER          ${P171_LEDGER_RELPATH}`);
console.log(`charge          ${CHARGE.creditsUsed} credit(s) · ${CHARGE.reconciliationId}`);
console.log(`evidence        ${CHARGE.evidence}`);
console.log(`reason          ${CHARGE.reason}`);
console.log(`Phase H before  ${before} spent`);

if (!out.applied) {
  console.log(`\n${out.reason}`);
  /* An already-reconciled ledger is the intended end state, not an error. A genuinely bad input is. */
  process.exit(out.reason.startsWith("REFUSED") ? 2 : 0);
}

const after = spentOnPurpose(out.ledger, PHASE_H_PURPOSE);
console.log(`Phase H after   ${after} spent`);
console.log(`cumulative      ${ledger.cumulativeCredits ?? 0} → ${out.ledger.cumulativeCredits}`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Pass --apply to record it.");
  process.exit(0);
}

fs.writeFileSync(ledgerPath, JSON.stringify(out.ledger, null, 1) + "\n");
console.log(`\napplied — ${out.reason}`);
process.exit(0);
