/**
 * Program 171 authorization guards (Release D): the receipt parses fail-closed, the ceiling
 * refuses BEFORE spend, charged failures still count, secrets can never leak into artifacts,
 * and the capture script keeps its dry-run-by-default + NFL-only + no-retry structure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  parseAuthorizationReceipt, emptyLedger, assertCallAllowed, recordRequest, assertNoSecretLeak,
} from "./p171-authorization.mjs";

const ROOT = path.join(process.cwd(), "..");
const receiptText = fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_P171.md"), "utf8");

test("the committed founder receipt parses to exactly the authorized terms", () => {
  const r = parseAuthorizationReceipt(receiptText);
  assert.equal(r.ok, true, r.errors?.join("; "));
  assert.equal(r.ceiling, 3000);
  assert.equal(r.floor, 0);
  assert.equal(r.sport, "nfl");
  assert.equal(r.sportKey, "americanfootball_nfl");
});

test("receipt parsing is fail-closed: any missing operative term refuses", () => {
  assert.equal(parseAuthorizationReceipt("").ok, false);
  assert.equal(parseAuthorizationReceipt(receiptText.replace(/3,000/g, "")).ok, false, "no ceiling → refuse");
  const noFloor = receiptText.replace(/\*\*NONE[^|]*/g, "").replace(/There is no minimum remaining-balance floor\.?/g, "");
  assert.equal(parseAuthorizationReceipt(noFloor).ok, false, "no no-floor term → the legacy floor stays in force");
  assert.equal(parseAuthorizationReceipt(receiptText.replace(/americanfootball_nfl/g, "basketball_nba")).ok, false, "scope must be NFL");
  // the blockquote case that actually bit: a term split across quoted lines must still be found
  assert.equal(parseAuthorizationReceipt(receiptText.replace("do not retry\n> blindly", "do not retry\n> blindly")).ok, true);
});

test("assertCallAllowed refuses BEFORE the ceiling is crossed, never after", () => {
  const auth = parseAuthorizationReceipt(receiptText);
  let ledger = emptyLedger("docs/receipts/ODDS_AUTHORIZATION_P171.md");
  assert.equal(assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: 8, purpose: "capture" }).ok, true);
  ledger = { ...ledger, cumulativeCredits: 2995 };
  const refusal = assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: 8, purpose: "capture" });
  assert.equal(refusal.ok, false);
  assert.match(refusal.errors.join(" "), /2995 \+ worst-case 8/);
  assert.equal(assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: 5, purpose: "capture" }).ok, true, "exactly-at-ceiling is allowed; crossing is not");
  assert.equal(assertCallAllowed({ authorization: { ok: false }, ledger, worstCaseCredits: 1 }).ok, false, "no parsed receipt, no spend");
});

test("recordRequest: charged calls with unreadable headers cost 1 (never 0); endpoints are redacted", () => {
  let ledger = emptyLedger("x");
  ledger = recordRequest(ledger, { at: "2026-08-13T07:00:00Z", purpose: "bulk", endpoint: "/sports/americanfootball_nfl/odds?apiKey=SECRETVALUE123&regions=us", status: 500, headers: {}, charged: true });
  assert.equal(ledger.cumulativeCredits, 1, "a failed-but-charged call still counts, and unaccounted spend defaults to 1");
  assert.match(ledger.requests[0].endpoint, /apiKey=REDACTED/);
  assert.doesNotMatch(ledger.requests[0].endpoint, /SECRETVALUE123/);
  ledger = recordRequest(ledger, { at: "2026-08-13T07:00:01Z", purpose: "free index", endpoint: "/sports", status: 200, headers: { "x-requests-last": "0", "x-requests-remaining": "15829" }, charged: false });
  assert.equal(ledger.cumulativeCredits, 1, "a free call with header cost 0 adds nothing");
  assert.equal(ledger.requests[1].providerRequestsRemaining, 15829);
  ledger = recordRequest(ledger, { at: "2026-08-13T07:00:02Z", purpose: "bulk", endpoint: "/odds", status: 200, headers: { "x-requests-last": "3" }, charged: true });
  assert.equal(ledger.cumulativeCredits, 4, "provider-reported cost wins over the default");
});

test("assertNoSecretLeak: raw keys and unredacted apiKey params refuse the write", () => {
  assert.equal(assertNoSecretLeak('{"url":"/odds?apiKey=REDACTED"}', ["SECRETVALUE123"]).ok, true);
  assert.equal(assertNoSecretLeak('{"k":"SECRETVALUE123"}', ["SECRETVALUE123"]).ok, false);
  assert.equal(assertNoSecretLeak('{"url":"/odds?apiKey=abc123def456"}', []).ok, false);
});

test("capture script structure: dry-run precedes any network call; NFL-only; no retries; leak-guarded writes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  const dryRunIdx = src.indexOf("if (!AUTHORIZED)");
  const firstCallIdx = src.indexOf("await get(");
  assert.ok(dryRunIdx > 0 && firstCallIdx > 0 && dryRunIdx < firstCallIdx, "the dry-run exit must sit BEFORE the first network call");
  assert.doesNotMatch(src, /basketball_nba|soccer_epl|mma_mixed|baseball_mlb/, "no other sport key can appear in an NFL-only capture");
  assert.doesNotMatch(src, /Promise\.all/, "no fan-out — calls are sequential and individually gated");
  assert.doesNotMatch(src, /maxRetries|backoff|attempt\s*<|while\s*\(\s*true\s*\).*get\(|for\s*\(\s*let\s+attempt/is, "no retry-loop construct exists to repeat a failed paid call");
  assert.ok(src.indexOf("assertNoSecretLeak(payload") < src.indexOf("fs.writeFileSync(p, payload)"), "every artifact write passes the leak-guard first");
  assert.match(src, /assertCallAllowed/, "every paid call clears the cumulative gate");
  assert.match(src, /secretState\.state !== "PRESENT"/, "the key gate accepts exactly the contract's healthy state — the first CI run failed on an imagined 'OK'");
  const canary = fs.readFileSync(path.join(process.cwd(), "scripts/ops/odds-canary.mjs"), "utf8");
  assert.match(canary, /parsed\.sport !== SPORT/, "the canary refuses a receipt whose scope differs from --sport");
  assert.match(canary, /const FLOOR = 50;/, "the legacy default floor literal survives the extension");
});
