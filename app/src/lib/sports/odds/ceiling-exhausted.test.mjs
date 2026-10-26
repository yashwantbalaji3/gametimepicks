/**
 * A SPENT ALLOWANCE IS A DECISION OWED, NOT A BROKEN JOB.
 *
 * Run: npx tsx --test src/lib/sports/odds/ceiling-exhausted.test.mjs
 *
 * The NFL receipt's ceiling was reached on 2026-10-11 (ledger cumulative = ceiling). From then on every event window with
 * games in it ran the free steps, then refused the paid call (exit 5), failed the job and fired the ops alert: 68 of the
 * 100 nfl-event-window runs from 2026-10-12 to 2026-10-25 were red for a state no rerun can change. The expired half of
 * the receipt was already handled this way (authorization-expiry.test.mjs); this is the ceiling half.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ceilingExhausted, assertCallAllowed, emptyLedger, parseAuthorizationReceipt, P171_LEDGER_RELPATH } from "./p171-authorization.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const SCRIPT = fs.readFileSync(path.join(APP, "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
const auth = { ok: true, ceiling: 1160 };
const at = (n) => ({ ...emptyLedger("r"), cumulativeCredits: n });

test("exhausted exactly when the ceiling cannot cover the cheapest planned paid call — and assertCallAllowed agrees", () => {
  for (const [cum, cheapest, want] of [[1160, 3, true], [1158, 3, true], [1157, 3, false], [0, 3, false], [1155, 5, false], [1156, 5, true]]) {
    const r = ceilingExhausted({ authorization: auth, ledger: at(cum), cheapestPaidCredits: cheapest });
    assert.equal(r.exhausted, want, `cumulative ${cum}, cheapest ${cheapest}`);
    assert.equal(r.remaining, 1160 - cum);
    /* The early exit may never stop a call the gate would have allowed: exhausted ⇔ the gate refuses that call. */
    assert.equal(assertCallAllowed({ authorization: auth, ledger: at(cum), worstCaseCredits: cheapest, purpose: "x" }).ok, !want);
  }
});

test("never 'exhausted' without a parsed receipt or a planned paid call — those fail or exit on their own paths", () => {
  assert.equal(ceilingExhausted({ authorization: { ok: false, errors: ["malformed"] }, ledger: at(5000), cheapestPaidCredits: 3 }).exhausted, false);
  assert.equal(ceilingExhausted({ authorization: null, ledger: at(5000), cheapestPaidCredits: 3 }).exhausted, false);
  assert.equal(ceilingExhausted({ authorization: auth, ledger: at(1160), cheapestPaidCredits: 0 }).exhausted, false);
});

test("THE CAPTURE STOPS ON A SPENT ALLOWANCE BEFORE ANY NETWORK CALL, WRITES NOTHING, AND DOES NOT FAIL ITS WORKFLOW", () => {
  const i = SCRIPT.indexOf("if (spent.exhausted)");
  assert.ok(i > 0, "the capture has no spent-allowance path");
  assert.ok(i > SCRIPT.indexOf("if (!AUTHORIZED)"), "the dry run still exits first");
  assert.ok(i > SCRIPT.indexOf("const expiryOnly"), "a malformed or expired receipt is still decided on its own path first");
  assert.ok(i < SCRIPT.indexOf("classifyOddsSecret(process.env)"), "before the key check");
  assert.ok(i < SCRIPT.indexOf("await get("), "before the first network call, free or paid");
  const block = SCRIPT.slice(i, SCRIPT.indexOf("process.exit(0);", i) + "process.exit(0);".length);
  assert.match(block, /BUDGET_EXHAUSTED/, "a distinct, greppable status");
  assert.match(block, /::warning title=NFL odds allowance spent::/, "visible on the run, not silent");
  assert.doesNotMatch(block, /ledgerPath|recordRequest|writeFileSync/, "nothing written: no ledger line, no artifact");
  assert.match(block, /process\.exit\(0\);$/,"a clean exit: the chain continues on the last committed capture");
  /* The per-call gate is untouched: if the early exit were ever wrong, the paid call would still be refused. */
  assert.match(SCRIPT, /const gateBulk = assertCallAllowed\(/);
});

test("REAL STATE: the committed NFL ledger and receipt — the spent path is what today's windows take", () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, P171_LEDGER_RELPATH), "utf8"));
  const receipt = parseAuthorizationReceipt(fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md"), "utf8"));
  assert.equal(receipt.ok, true, `the committed NFL receipt must parse: ${receipt.errors?.join("; ")}`);
  const r = ceilingExhausted({ authorization: receipt, ledger, cheapestPaidCredits: 3 });
  /* Whatever the ledger holds when this runs, the early exit and the gate must agree on it. A renewed receipt flips both. */
  assert.equal(r.exhausted, !assertCallAllowed({ authorization: receipt, ledger, worstCaseCredits: 3, purpose: "bulk" }).ok);
});
