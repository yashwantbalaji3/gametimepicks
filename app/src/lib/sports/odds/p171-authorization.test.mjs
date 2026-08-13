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
  classifyProviderResult, isDuplicateRequest,
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
  // P172: ONE allowance spans both programs — a second program never re-issues the ceiling
  assert.deepEqual(r.coveredPrograms, ["P171", "P172"]);
  assert.equal(r.program, "P171-172");
});

test("P172 · provider result classes never collapse into one 'failed' bucket", () => {
  assert.equal(classifyProviderResult({ status: 401 }).class, "AUTHORIZATION_FAILED");
  assert.equal(classifyProviderResult({ status: 403 }).class, "AUTHORIZATION_FAILED");
  assert.equal(classifyProviderResult({ status: 429 }).class, "RATE_OR_CREDIT_LIMITED");
  assert.equal(classifyProviderResult({ status: 503 }).class, "PROVIDER_INCIDENT");
  assert.equal(classifyProviderResult({ status: 200, body: [] }).class, "NO_MARKET");
  assert.equal(classifyProviderResult({ status: 200, body: null }).class, "QUARANTINED");
  assert.equal(classifyProviderResult({ status: 200, body: [{ id: "x" }] }).class, "OK");
  assert.equal(classifyProviderResult({ status: 418 }).class, "QUARANTINED", "an unmodelled status quarantines rather than assumes");
  // none is retryable: a blind retry is exactly what the authorization forbids
  for (const s of [401, 429, 503, 200]) assert.equal(classifyProviderResult({ status: s, body: [] }).retryable, false);
  assert.match(classifyProviderResult({ status: 200, body: [] }).action, /absence is evidence/);
  assert.match(classifyProviderResult({ status: 503 }).action, /never overwrite with an empty slate/);
});

test("P172 · the duplicate circuit breaker refuses re-buying inside the freshness window", () => {
  let ledger = emptyLedger("r");
  ledger = recordRequest(ledger, { at: "2026-08-13T12:00:00Z", purpose: "bulk", endpoint: "/odds", status: 200, headers: { "x-requests-last": "3" }, charged: true, fingerprint: "bulk:nfl_pre:h2h,spreads,totals:us" });
  const soon = isDuplicateRequest(ledger, { fingerprint: "bulk:nfl_pre:h2h,spreads,totals:us", nowIso: "2026-08-13T12:20:00Z", freshnessMinutes: 45 });
  assert.equal(soon.duplicate, true);
  assert.match(soon.reason, /refusing to re-buy/);
  const later = isDuplicateRequest(ledger, { fingerprint: "bulk:nfl_pre:h2h,spreads,totals:us", nowIso: "2026-08-13T13:00:00Z", freshnessMinutes: 45 });
  assert.equal(later.duplicate, false, "outside the window a refresh is allowed");
  const other = isDuplicateRequest(ledger, { fingerprint: "bulk:nfl_reg:h2h:us", nowIso: "2026-08-13T12:20:00Z", freshnessMinutes: 45 });
  assert.equal(other.duplicate, false, "a different request is not a duplicate");
  // a FREE call never blocks a later paid one
  let freeLedger = recordRequest(emptyLedger("r"), { at: "2026-08-13T12:00:00Z", purpose: "index", endpoint: "/sports", status: 200, headers: { "x-requests-last": "0" }, charged: false, fingerprint: "f" });
  assert.equal(isDuplicateRequest(freeLedger, { fingerprint: "f", nowIso: "2026-08-13T12:05:00Z" }).duplicate, false);
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

test("P173 REGRESSION · a duplicate-skipped run can never overwrite a good capture with an empty slate", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  // THE DEFECT (live at 2026-08-13T16:03Z): the duplicate breaker `continue`d past the fetch, the
  // run fell through with zero rows, and the public artifact was rewritten with eventCount 0 —
  // the price table vanished from /nfl. Two independent defences must both be present.
  const emptyGuard = src.indexOf("PRESERVED_LAST_KNOWN_GOOD");
  const writeIdx = src.indexOf("const outputs = [");
  assert.ok(emptyGuard > 0, "defence 1: a run that fetched nothing must exit before writing");
  assert.ok(emptyGuard < writeIdx, "defence 1 must sit BEFORE the artifact writer");
  const replaceGuard = src.indexOf("refusing to overwrite a good artifact with an empty slate");
  assert.ok(replaceGuard > 0, "defence 2: replacing a non-empty capture with an empty one must refuse");
  assert.ok(replaceGuard < writeIdx, "defence 2 must also precede the writer");
  // and the ordering that caused it: the duplicate `continue` must come before the empty check
  assert.ok(src.indexOf("dup.duplicate") < emptyGuard, "the skip path is what falls into the empty check");
});

test("P173 REGRESSION · the committed public capture is non-empty and pre-kickoff", () => {
  const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/markets/latest.json"), "utf8"));
  assert.ok(m.eventCount > 0, "an empty committed capture means the last-known-good was destroyed again");
  assert.equal(m.rows.length, m.eventCount, "eventCount must match the rows actually carried");
  for (const r of m.rows) {
    assert.ok(m.capturedAt < r.kickoffUtc, `${r.away.abbr}@${r.home.abbr}: capture must precede its own kickoff`);
    assert.ok(r.books.length > 0, "a published row carries real book prices");
  }
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
