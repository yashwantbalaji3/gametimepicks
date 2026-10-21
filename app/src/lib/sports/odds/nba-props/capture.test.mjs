/**
 * NBA prop capture: spend discipline with a FAKE fetch. No network, no real key, no real receipt.
 * Run: npx tsx --test src/lib/sports/odds/nba-props/capture.test.mjs
 *
 * The receipt text and every provider body are TEST FIXTURES.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { runNbaPropCapture, CAPTURE_STATE } from "./capture.mjs";
import { SCHEDULE, rosterFor, EVENT_1, FETCHED_AT } from "./__fixtures__/event-odds.fixture.mjs";

const NOW = FETCHED_AT; // 2026-10-22T22:00Z, 90 min before the fixture tip
const KEY = "test-key-0123456789abcdef";
const SCHED = SCHEDULE.map((r) => ({ ...r, statusRaw: "STATUS_SCHEDULED" }));
const RECEIPT = (ceiling = 10, expiry = "the ceiling, or 2026-11-20 23:59 ET, whichever comes first") => [
  "TEST FIXTURE receipt — not a founder answer.",
  "Scope: NBA player props only, `basketball_nba`.",
  "Prop markets authorized: `player_points`",
  `Effective cumulative ceiling: ${ceiling} credits`,
  `| Expiry | ${expiry} |`,
  "Do not retry blindly.",
  "Approved by: founder 2026-10-21",
].join("\n");

const LIST = [
  { id: EVENT_1.id, sport_key: "basketball_nba", commence_time: EVENT_1.commence_time, home_team: EVENT_1.home_team, away_team: EVENT_1.away_team },
  { id: "fx-started", sport_key: "basketball_nba", commence_time: "2026-10-22T21:00:00Z", home_team: "Miami Heat", away_team: "Orlando Magic" },
];
const pointsOnly = { ...EVENT_1, bookmakers: EVENT_1.bookmakers.map((b) => ({ ...b, markets: b.markets.filter((m) => m.key === "player_points") })) };

/** A fake provider: records every URL, answers from a table. */
function fakeFetch(answer) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    const { status = 200, body = null, last = null } = answer(url);
    return { status, headers: { get: (h) => (h === "x-requests-last" ? (last == null ? null : String(last)) : null) }, json: async () => body };
  };
  return { impl, urls };
}
const provider = () => fakeFetch((url) => (url.includes("/events?") ? { body: LIST, last: 0 } : { body: pointsOnly, last: 1 }));
const run = (over = {}) => runNbaPropCapture({ now: NOW, receiptText: RECEIPT(), scheduleRows: SCHED, rosterFor, apiKey: KEY, clock: () => NOW, ...over });

test("no receipt, a refused receipt, an expired receipt, or a market off the receipt: zero calls", async () => {
  for (const [label, over] of [
    ["no receipt", { receiptText: null }],
    ["partial receipt", { receiptText: "NBA player props only `basketball_nba`" }],
    ["expired", { now: "2026-11-21T06:00:00Z" }],
    ["rebounds not authorized", { markets: ["player_points", "player_rebounds"] }],
  ]) {
    const f = provider();
    const r = await run({ ...over, apply: true, fetchImpl: f.impl });
    assert.equal(r.state, CAPTURE_STATE.REFUSED, label);
    assert.equal(f.urls.length, 0, `${label}: no network call`);
  }
});

test("default is a dry run: the plan and worst case, zero calls", async () => {
  const f = provider();
  const r = await run({ fetchImpl: f.impl });
  assert.equal(r.state, CAPTURE_STATE.DRY_RUN);
  assert.equal(f.urls.length, 0);
  assert.equal(r.plan.worstCaseCredits, 2, "two in-window fixture games × 1 market × 1 region-unit");
});

test("an authorized capture: free listing, then only joined, not-started events; ledger at the provider's figure; records parse", async () => {
  const f = provider();
  const r = await run({ apply: true, fetchImpl: f.impl });
  assert.equal(r.state, CAPTURE_STATE.CAPTURED, r.stoppedBecause ?? "");
  assert.equal(f.urls.length, 2, "listing + one event-odds call");
  assert.ok(f.urls[1].includes(`/events/${EVENT_1.id}/odds?`) && f.urls[1].includes("markets=player_points") && f.urls[1].includes("oddsFormat=american"));
  assert.ok(!f.urls[1].includes("regions="), "bookmakers, never a region");
  assert.ok(r.skipped.some((s) => s.oddsEventId === "fx-started"), "a started or unjoined game is never priced");
  assert.equal(r.ledger.cumulativeCredits, 1, "the free listing costs 0; the event call is charged at x-requests-last");
  assert.ok(r.records.length > 0, "the parser produced price records");
  assert.ok(r.records.every((x) => x.family === "pts"));
  assert.doesNotMatch(JSON.stringify(r), new RegExp(KEY), "the key is never in the result");
  assert.doesNotMatch(JSON.stringify(r.ledger), /apiKey=(?!REDACTED)/);
});

test("the ceiling stops the run BEFORE a call that could cross it", async () => {
  const f = provider();
  const ledger = { schemaVersion: 1, sport: "nba", requests: [], cumulativeCredits: 10 };
  const r = await run({ apply: true, fetchImpl: f.impl, ledger });
  assert.equal(r.state, CAPTURE_STATE.CEILING_REACHED);
  assert.equal(f.urls.length, 1, "only the free listing was called");
  assert.ok(r.skipped.some((s) => s.reason === "CEILING_REACHED"));
});

test("provider failures stop the run and are never retried; an empty market costs 0 and continues", async () => {
  for (const [status, cls] of [[401, "AUTHORIZATION_FAILED"], [429, "RATE_OR_CREDIT_LIMITED"], [503, "PROVIDER_INCIDENT"], [422, "QUARANTINED"]]) {
    const f = fakeFetch((url) => (url.includes("/events?") ? { body: LIST, last: 0 } : { status, body: { message: "x" }, last: 0 }));
    const r = await run({ apply: true, fetchImpl: f.impl });
    assert.equal(r.state, CAPTURE_STATE.STOPPED, String(status));
    assert.match(r.stoppedBecause, new RegExp(cls));
    assert.equal(f.urls.length, 2, `${status}: no retry`);
  }
  const empty = fakeFetch((url) => (url.includes("/events?") ? { body: LIST, last: 0 } : { body: { ...pointsOnly, bookmakers: [] }, last: 0 }));
  const e = await run({ apply: true, fetchImpl: empty.impl });
  assert.equal(e.state, CAPTURE_STATE.CAPTURED);
  assert.equal(e.ledger.cumulativeCredits, 0, "an empty response costs 0 at the provider's own figure");
  assert.equal(e.calls.at(-1).resultClass, "NO_MARKET");
});

test("a transport error is recorded as charged (unaccounted spend is the failure mode) and stops the run", async () => {
  const impl = async (url) => {
    if (url.includes("/events?")) return { status: 200, headers: { get: () => "0" }, json: async () => LIST };
    throw Object.assign(new Error("socket hang up"), { name: "TypeError" });
  };
  const r = await run({ apply: true, fetchImpl: impl });
  assert.equal(r.state, CAPTURE_STATE.STOPPED);
  assert.equal(r.ledger.cumulativeCredits, 1);
  assert.equal(r.ledger.requests.at(-1).resultClass, "TRANSPORT_ERROR");
});

test("a repeated purchase inside 30 minutes is skipped", async () => {
  const first = await run({ apply: true, fetchImpl: provider().impl });
  const f = provider();
  const again = await run({ apply: true, fetchImpl: f.impl, ledger: first.ledger });
  assert.equal(f.urls.length, 1, "only the free listing");
  assert.ok(again.skipped.some((s) => s.reason === "DUPLICATE_WITHIN_30_MIN"));
  assert.equal(again.ledger.cumulativeCredits, 1);
});
