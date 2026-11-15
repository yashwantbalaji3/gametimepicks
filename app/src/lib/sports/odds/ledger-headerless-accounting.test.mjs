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
import { assertCallAllowed, ceilingExhausted, emptyLedger, recordRequest, recordReconciledCharge, usageHeaderNumber } from "./p171-authorization.mjs";

const APP = path.resolve(new URL("../../../..", import.meta.url).pathname);
const AT = "2026-11-15T17:00:00Z";
/** Exactly what capture-nfl-odds.mjs's get() builds when the provider omits the usage headers. */
const NULL_HEADERS = Object.freeze({ "x-requests-last": null, "x-requests-used": null, "x-requests-remaining": null });
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

test("reconcile: the provider's next usage counter lowers a single estimate to what it can have cost", () => {
  let l = emptyLedger("r");
  l = recordRequest(l, { at: AT, purpose: "free index", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "100" }, charged: false });
  l = recordRequest(l, paid(503, NULL_HEADERS));
  assert.equal(l.cumulativeCredits, 3);
  // next response: used 101 including its own cost 0 → the estimated call cost at most 1
  l = recordRequest(l, { at: "2026-11-15T17:05:00Z", purpose: "free index", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "101" }, charged: false });
  const e = l.requests[1];
  assert.equal(e.creditsUsed, 1);
  assert.equal(e.creditsEstimated, false);
  assert.deepEqual(e.creditsReconciled, { estimatedCredits: 3, providerBound: 1, at: "2026-11-15T17:05:00Z" });
  assert.equal(l.cumulativeCredits, 1);
  assert.equal(l.cumulativeCredits, l.requests.reduce((n, r) => n + r.creditsUsed, 0), "cumulative stays the sum of entries");
});

test("reconcile: a counter delta of 0 proves the failed call was free", () => {
  let l = emptyLedger("r");
  l = recordRequest(l, { at: AT, purpose: "i", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "100" }, charged: false });
  l = recordRequest(l, paid(500, NULL_HEADERS));
  l = recordRequest(l, paid(200, { "x-requests-last": "3", "x-requests-used": "103" }));
  assert.equal(l.requests[1].creditsUsed, 0);
  assert.equal(l.cumulativeCredits, 3);
});

test("reconcile never raises an estimate, and never guesses across several estimates or a backwards counter", () => {
  const anchor = (l) => recordRequest(l, { at: AT, purpose: "i", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "100" }, charged: false });
  // shared key: another sport spent 20 in between → delta 20 ≥ estimate 3 → estimate stands
  let a = recordRequest(recordRequest(anchor(emptyLedger("r")), paid(503, NULL_HEADERS)), paid(200, { "x-requests-last": "3", "x-requests-used": "123" }));
  assert.equal(a.requests[1].creditsUsed, 3);
  assert.equal(a.requests[1].creditsEstimated, true);
  assert.equal(a.cumulativeCredits, 6);
  // two estimates in the gap → cannot split one counter delta between them
  let b = recordRequest(recordRequest(recordRequest(anchor(emptyLedger("r")), paid(503, NULL_HEADERS)), paid(503, NULL_HEADERS)), paid(200, { "x-requests-last": "0", "x-requests-used": "101" }));
  assert.deepEqual(b.requests.slice(1, 3).map((r) => [r.creditsUsed, r.creditsEstimated]), [[3, true], [3, true]]);
  // counter went backwards (different key / reset) → no attribution
  let c = recordRequest(recordRequest(anchor(emptyLedger("r")), paid(503, NULL_HEADERS)), paid(200, { "x-requests-last": "0", "x-requests-used": "50" }));
  assert.equal(c.requests[1].creditsUsed, 3);
  // no earlier usage reading at all → nothing to anchor on
  let d = recordRequest(recordRequest(emptyLedger("r"), paid(503, NULL_HEADERS)), paid(200, { "x-requests-last": "0", "x-requests-used": "1" }));
  assert.equal(d.requests[0].creditsUsed, 3);
  // an out-of-band RECONCILED repair in the gap → no attribution
  let e = recordRequest(anchor(emptyLedger("r")), paid(503, NULL_HEADERS));
  e = recordReconciledCharge(e, { at: AT, purpose: "x", creditsUsed: 2, evidence: "ev", reason: "why", reconciliationId: "rid" }).ledger;
  e = recordRequest(e, paid(200, { "x-requests-last": "0", "x-requests-used": "100" }));
  assert.equal(e.requests[1].creditsUsed, 3);
});

test("recordRequest does not mutate the ledger it is given", () => {
  let l = recordRequest(emptyLedger("r"), { at: AT, purpose: "i", endpoint: "/sports/", status: 200, headers: { "x-requests-last": "0", "x-requests-used": "100" }, charged: false });
  l = recordRequest(l, paid(503, NULL_HEADERS));
  const snapshot = JSON.stringify(l);
  recordRequest(l, paid(200, { "x-requests-last": "0", "x-requests-used": "100" }));
  assert.equal(JSON.stringify(l), snapshot);
});

test("capture-nfl-odds.mjs books every non-422 probe answer and transport failures conservatively", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  assert.match(src, /catch \(e\) \{\s*return \{ status: null, headers: \{\}, body: null, transportError:/, "a transport failure returns to the ledger write instead of throwing past it");
  assert.doesNotMatch(src, /charged: probeRes\.status === 200/, "a 5xx/401/429 probe must not be declared free");
  assert.match(src, /headers: probeRes\.headers,[\s\S]{0,400}charged: true, worstCaseCredits: probeWorstCase/);
  assert.match(src, /charged: true, worstCaseCredits: bulkWorstCase/);
});
