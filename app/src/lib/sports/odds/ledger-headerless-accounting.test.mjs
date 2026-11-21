/*
 * CONSERVATIVE ACCOUNTING FOR HEADERLESS RESPONSES (founder rule).
 *
 * fetch's headers.get() returns null for an absent header and Number(null) is 0, so before this fix a charged call
 * whose response carried no usage headers (5xx, 401, 429, a 200 without them) was booked as costing 0 and the
 * cumulative ceiling undercounted. A request that may have consumed credits is now booked at its planned worst case
 * and flagged creditsEstimated; a provider-reported 0 and a headerless 422 (not offered) stay 0. Fixtures only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertCallAllowed, ceilingExhausted, classifyProbeOutcome, emptyLedger, isDuplicateRequest, recordRequest, usageHeaderNumber } from "./p171-authorization.mjs";

const APP = path.resolve(new URL("../../../..", import.meta.url).pathname);
const AT = "2026-11-15T17:00:00Z";
/** Exactly what capture-nfl-odds.mjs's get() builds when the provider omits the usage headers. */
const NULL_HEADERS = Object.freeze({ "x-requests-last": null, "x-requests-used": null, "x-requests-remaining": null });
const pick = (o) => [o.outcome, o.class];
const paid = (status, headers, extra = {}) => ({ at: AT, purpose: "bulk", endpoint: "/sports/americanfootball_nfl/odds", status, headers, charged: true, worstCaseCredits: 3, ...extra });

test("usageHeaderNumber: absent / empty / garbage are unknown, a reported 0 is 0", () => {
  for (const v of [null, undefined, "", "  ", "abc", NaN]) assert.equal(usageHeaderNumber(v), null, `${String(v)} is unknown`);
  assert.equal(usageHeaderNumber("0"), 0);
  assert.equal(usageHeaderNumber(0), 0);
  assert.equal(usageHeaderNumber("3"), 3);
});

for (const status of [500, 502, 503, 401, 403, 429, 200]) {
  test(`a ${status} with null usage headers is booked at the planned worst case and flagged estimated (was 0)`, () => {
    const l = recordRequest(emptyLedger("r"), paid(status, NULL_HEADERS));
    assert.equal(l.requests[0].creditsUsed, 3);
    assert.equal(l.requests[0].creditsEstimated, true);
    assert.equal(l.cumulativeCredits, 3);
  });
}

test("a transport failure (status null, no headers) is booked at worst case", () => {
  const l = recordRequest(emptyLedger("r"), paid(null, {}, { resultClass: "TRANSPORT_ERROR" }));
  assert.equal(l.requests[0].creditsUsed, 3);
  assert.equal(l.requests[0].creditsEstimated, true);
  assert.equal(l.cumulativeCredits, 3);
});

test("no worstCaseCredits from the caller keeps the long-standing default of 1, now also for null headers", () => {
  const l = recordRequest(emptyLedger("r"), { at: AT, purpose: "p", endpoint: "e", status: 503, headers: NULL_HEADERS, charged: true });
  assert.equal(l.requests[0].creditsUsed, 1);
  assert.equal(l.requests[0].creditsEstimated, true);
});

test("a provider-reported x-requests-last: 0 is a real zero, not an estimate", () => {
  const l = recordRequest(emptyLedger("r"), paid(200, { "x-requests-last": "0", "x-requests-used": "100", "x-requests-remaining": "900" }));
  assert.equal(l.requests[0].creditsUsed, 0);
  assert.equal("creditsEstimated" in l.requests[0], false);
  assert.equal(l.cumulativeCredits, 0);
});

test("a 422 without headers is the documented not-offered answer: 0, not estimated", () => {
  const l = recordRequest(emptyLedger("r"), paid(422, NULL_HEADERS));
  assert.equal(l.requests[0].creditsUsed, 0);
  assert.equal("creditsEstimated" in l.requests[0], false);
  // ...but a 422 that DOES report a cost is booked at that cost
  assert.equal(recordRequest(emptyLedger("r"), paid(422, { "x-requests-last": "2" })).requests[0].creditsUsed, 2);
});

test("a call the caller declares free stays 0 without headers (documented-free index endpoints)", () => {
  const l = recordRequest(emptyLedger("r"), { at: AT, purpose: "free index", endpoint: "/sports/", status: 200, headers: NULL_HEADERS, charged: false });
  assert.equal(l.requests[0].creditsUsed, 0);
  assert.equal("creditsEstimated" in l.requests[0], false);
});

test("headers present → exactly the header value, entry shape unchanged (no estimate flag)", () => {
  for (const [status, charged] of [[200, true], [500, true], [429, true], [200, false]]) {
    const l = recordRequest(emptyLedger("r"), { ...paid(status, { "x-requests-last": "7", "x-requests-used": "1207", "x-requests-remaining": "17993" }), charged });
    const e = l.requests[0];
    assert.equal(e.creditsUsed, 7);
    assert.equal(e.providerRequestsUsed, 1207);
    assert.equal(e.providerRequestsRemaining, 17993);
    assert.deepEqual(Object.keys(e), ["at", "purpose", "endpoint", "events", "markets", "regions", "status", "resultClass", "fingerprint", "creditsUsed", "providerRequestsUsed", "providerRequestsRemaining"]);
  }
});

test("the cumulative ceiling gate and exhaustion check read the conservative figures", () => {
  const auth = { ok: true, ceiling: 10 };
  let l = emptyLedger("r");
  l = recordRequest(l, paid(200, { "x-requests-last": "3", "x-requests-used": "3" }));
  l = recordRequest(l, paid(503, NULL_HEADERS));
  l = recordRequest(l, paid(null, {}));
  assert.equal(l.cumulativeCredits, 9, "3 reported + 3 estimated + 3 estimated (the old code read 3)");
  assert.equal(assertCallAllowed({ authorization: auth, ledger: l, worstCaseCredits: 3, purpose: "bulk" }).ok, false, "9 + 3 crosses 10");
  assert.equal(assertCallAllowed({ authorization: auth, ledger: l, worstCaseCredits: 1, purpose: "bulk" }).ok, true);
  assert.equal(ceilingExhausted({ authorization: auth, ledger: l, cheapestPaidCredits: 3 }).exhausted, true);
});

test("no automatic reconciliation: a later usage counter never lowers an estimate (billing resets, two keys)", () => {
  // the reviewer's case: anchor used=480, estimate 5, after a billing reset used=482 last=1 — must stay 5
  let l = recordRequest(emptyLedger("r"), { at: AT, purpose: "i", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "480" }, charged: false });
  l = recordRequest(l, paid(503, NULL_HEADERS, { worstCaseCredits: 5 }));
  l = recordRequest(l, paid(200, { "x-requests-last": "1", "x-requests-used": "482" }));
  assert.equal(l.requests[1].creditsUsed, 5);
  assert.equal(l.requests[1].creditsEstimated, true);
  assert.equal("creditsReconciled" in l.requests[1], false);
  assert.equal(l.cumulativeCredits, 6);
  assert.equal(l.cumulativeCredits, l.requests.reduce((n, r) => n + r.creditsUsed, 0));
});

test("an estimate is never 0 (a 0 or missing planned worst case books 1), so it always counts for the duplicate breaker", () => {
  for (const worstCaseCredits of [0, -2, null, undefined, "x"]) {
    const l = recordRequest(emptyLedger("r"), paid(503, NULL_HEADERS, { worstCaseCredits, fingerprint: "fp" }));
    assert.equal(l.requests[0].creditsUsed, 1, `worstCaseCredits=${String(worstCaseCredits)}`);
    assert.equal(isDuplicateRequest(l, { fingerprint: "fp", nowIso: "2026-11-15T17:10:00Z", freshnessMinutes: 30 }).duplicate, true);
  }
});

test("recordRequest does not mutate the ledger it is given", () => {
  const l = recordRequest(emptyLedger("r"), paid(503, NULL_HEADERS));
  const snapshot = JSON.stringify(l);
  recordRequest(l, paid(200, { "x-requests-last": "0", "x-requests-used": "100" }));
  assert.equal(JSON.stringify(l), snapshot);
});

test("classifyProbeOutcome: only a 422 is NOT_OFFERED; every other failure STOPS with the classifier's class", () => {
  assert.deepEqual(pick(classifyProbeOutcome({ status: 422, headers: NULL_HEADERS })), ["NOT_OFFERED", "NOT_OFFERED"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: null, headers: {}, body: null, transportError: "TimeoutError" })), ["STOP", "TRANSPORT_ERROR"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 401 })), ["STOP", "AUTHORIZATION_FAILED"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 403 })), ["STOP", "AUTHORIZATION_FAILED"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 429 })), ["STOP", "RATE_OR_CREDIT_LIMITED"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 500 })), ["STOP", "PROVIDER_INCIDENT"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 503 })), ["STOP", "PROVIDER_INCIDENT"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 404 })), ["STOP", "QUARANTINED"]);
  assert.deepEqual(pick(classifyProbeOutcome({ status: 200, body: { bookmakers: [{ markets: [] }] } })), ["ANSWER", "OK"]);
  for (const s of [null, 401, 403, 429, 500, 503, 404]) assert.notEqual(classifyProbeOutcome({ status: s, transportError: s == null ? "Error" : null }).class, "NOT_OFFERED");
});

test("capture-nfl-odds.mjs books every non-422 probe answer and transport failures conservatively", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  assert.match(src, /catch \(e\) \{\s*return \{ status: null, headers: \{\}, body: null, transportError:/, "a transport failure returns to the ledger write instead of throwing past it");
  assert.doesNotMatch(src, /charged: probeRes\.status === 200/, "a 5xx/401/429 probe must not be declared free");
  assert.match(src, /headers: probeRes\.headers,[\s\S]{0,400}charged: true, worstCaseCredits: probeWorstCase, resultClass: probeClass\.class/);
  assert.match(src, /charged: true, worstCaseCredits: bulkWorstCase/);
});

test("capture-nfl-odds.mjs: a STOP outcome ends the sweep before anything lands in perEvent; only NOT_OFFERED writes absent families", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  const stop = src.slice(src.indexOf('if (probeClass.outcome === "STOP") {'), src.indexOf('if (probeClass.outcome === "NOT_OFFERED") {'));
  assert.ok(stop.length > 0, "the STOP branch precedes the NOT_OFFERED branch");
  assert.doesNotMatch(stop, /perEvent\.push|absentMarkets/, "a failed call is never recorded as families NOT_OFFERED");
  assert.match(stop, /resultClass: probeClass\.class/);
  assert.match(stop, /refusal = `\$\{probeClass\.class\}/);
  assert.match(stop, /\bbreak;/, "the sweep stops");
  assert.match(src, /state: "PROVIDER_FAILURE", resultClass: probeStop\.resultClass/, "a failure before any answer is its own state, not NO_MARKET");
  assert.match(src, /\.\.\.\(probeStop \? \{ stoppedBy: probeStop \} : \{\}\)/, "a mid-sweep failure is named on the PROBED probe");
  assert.doesNotMatch(src, /charged: probeRes\.status === 200|probeRes\.status !== 200\) \{/);
});

test("callers pass their planned worst case to recordRequest", () => {
  const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
  assert.match(read("scripts/nfl/capture-nfl-live-odds.mjs"), /charged: true, worstCaseCredits: WORST_CASE,/);
  assert.match(read("scripts/nfl/probe-nfl-live-odds.mjs"), /charged: true, worstCaseCredits: WORST_CASE,/);
  assert.match(read("scripts/epl/capture-epl-odds.mjs"), /worstCaseCredits: WORST_CASE_CREDITS,/);
  assert.match(read("scripts/ufc/capture-ufc-odds.mjs"), /worstCaseCredits: WORST_CASE_CREDITS,/);
  assert.equal((read("src/lib/sports/odds/nba-props/capture.mjs").match(/charged: [^,]+, worstCaseCredits: worst, fingerprint/g) ?? []).length, 2);
});
