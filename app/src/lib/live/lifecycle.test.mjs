/**
 * LIVE LIFECYCLE + CACHE + JOIN TESTS (v1.1 · §20.2, §20.3).
 *
 * Every clock in this file is INJECTED. Nothing here reads `Date.now()`, so a test that passes at
 * 2am passes at 2pm and a failure means the contract broke rather than the day did.
 *
 * The two rules under test are the ones Phase 6 bought at the price of a release blocker:
 *   Rule A — a frozen pregame forecast is immutable after kickoff.
 *   Rule B — anything that claims something about the present is recomputed on the reader's clock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DELAYED_MAX_MS, FRESH_MAX_MS, HIDDEN_TAB_MIN_INTERVAL_MS, TTL_SECONDS,
  ageSeconds, effectiveIntervalMs, freshnessOf, refreshPolicyFor,
} from "./freshness.mjs";
import { makeEnvelope, makeCompetitor, isTerminal } from "./contract.mjs";
import * as joinModule from "./forecast-join.mjs";
import { compareToRange, comparisonSentence, joinNflPlayerBoard, projectMlbForecast, COMPARABLE_STATES } from "./forecast-join.mjs";
import { cacheHeaderFor, gatewayDisabled, planRequest, scoreboardTtl, upstreamUrls } from "../../../api/_live-core.mjs";
import { normalizeNflPlayerStats } from "./adapters/espn-nfl.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", n), "utf8"));
const T0 = Date.parse("2026-09-16T02:00:00.000Z");

const envelopeAt = (state, fetchedAt, startTime = null) =>
  makeEnvelope({
    eventId: "1", sport: "NFL", provider: "espn-public", providerEventId: "1",
    state, startTime, fetchedAt,
    competitors: { home: makeCompetitor({ abbr: "A" }), away: makeCompetitor({ abbr: "B" }) },
  });

/* ─────────────────────── §20.2 time / lifecycle ─────────────────────── */

test("LIFE 1 · Rule B — freshness is measured on the READER's clock, not frozen into the payload", () => {
  const e = envelopeAt("LIVE", "2026-09-16T02:00:00.000Z");
  // One envelope, three readers, three different truths — the same object cannot claim one age.
  assert.equal(freshnessOf(e, T0 + 10_000).level, "FRESH");
  assert.equal(freshnessOf(e, T0 + 60_000).level, "DELAYED");
  assert.equal(freshnessOf(e, T0 + 300_000).level, "STALE");
});

test("LIFE 2 · the stale thresholds are exactly the published contract", () => {
  const e = envelopeAt("LIVE", "2026-09-16T02:00:00.000Z");
  assert.equal(freshnessOf(e, T0 + FRESH_MAX_MS - 1).level, "FRESH");
  assert.equal(freshnessOf(e, T0 + FRESH_MAX_MS).level, "DELAYED");
  assert.equal(freshnessOf(e, T0 + DELAYED_MAX_MS - 1).level, "DELAYED");
  assert.equal(freshnessOf(e, T0 + DELAYED_MAX_MS).level, "STALE");
});

test("LIFE 3 · only an in-play event can be stale — a final is not rotting, it is finished", () => {
  for (const s of ["PRE", "FINAL", "POSTPONED", "CANCELLED"]) {
    assert.equal(freshnessOf(envelopeAt(s, "2026-09-15T00:00:00.000Z"), T0).level, "NOT_APPLICABLE", s);
  }
});

test("LIFE 4 · an unparseable fetch stamp is STALE, never 'just now'", () => {
  assert.equal(freshnessOf(envelopeAt("LIVE", "not-a-date"), T0).level, "STALE");
  assert.equal(freshnessOf(envelopeAt("LIVE", null), T0).level, "STALE");
  assert.equal(ageSeconds(null), null, "an unknown age is null, never a confident 0");
});

test("LIFE 5 · polling STOPS at a terminal state — it does not merely slow down", () => {
  for (const s of ["FINAL", "POSTPONED", "CANCELLED"]) {
    const p = refreshPolicyFor(envelopeAt(s, "2026-09-16T02:00:00.000Z"), T0);
    assert.equal(p.clientIntervalMs, null, `${s} must stop the client poll`);
    assert.equal(p.ttlSeconds, TTL_SECONDS.TERMINAL);
    assert.equal(effectiveIntervalMs(p, false), null, "a visible tab does not restart a finished game");
    assert.equal(effectiveIntervalMs(p, true), null);
    assert.equal(isTerminal(s), true);
  }
});

test("LIFE 6 · a distant pregame is cheap; an imminent one is not; an UNKNOWN start fails toward noticing kickoff", () => {
  const far = envelopeAt("PRE", "2026-09-16T02:00:00.000Z", "2026-09-20T17:00:00.000Z");
  assert.equal(refreshPolicyFor(far, T0).reason, "PRE_DISTANT");
  assert.equal(refreshPolicyFor(far, T0).ttlSeconds, TTL_SECONDS.PRE_DISTANT);

  const soon = envelopeAt("PRE", "2026-09-16T02:00:00.000Z", "2026-09-16T02:30:00.000Z");
  assert.equal(refreshPolicyFor(soon, T0).reason, "PRE_IMMINENT");

  const unknownStart = envelopeAt("PRE", "2026-09-16T02:00:00.000Z", null);
  assert.equal(refreshPolicyFor(unknownStart, T0).reason, "PRE_IMMINENT",
    "an unknown start must never be treated as distant — that would sleep through kickoff");
});

test("LIFE 7 · a hidden tab backs off; it never speeds up", () => {
  const live = refreshPolicyFor(envelopeAt("LIVE", "2026-09-16T02:00:00.000Z"), T0);
  assert.equal(effectiveIntervalMs(live, false), 30_000);
  assert.equal(effectiveIntervalMs(live, true), HIDDEN_TAB_MIN_INTERVAL_MS);
  const distant = refreshPolicyFor(envelopeAt("PRE", "2026-09-16T02:00:00.000Z", "2026-09-20T17:00:00.000Z"), T0);
  assert.ok(effectiveIntervalMs(distant, true) >= effectiveIntervalMs(distant, false),
    "backing off can only ever lengthen the interval");
});

test("LIFE 8 · Rule A — the join module's whole export surface is read-only", () => {
  // Structural, not behavioural. A future author cannot write a live value into a forecast through
  // this module because no exported function accepts that job — the surface is enumerated here so
  // adding one is a visible test change rather than a quiet capability.
  const surface = Object.keys(joinModule).sort();
  assert.deepEqual(surface, [
    "COMPARABLE_NFL_MARKETS", "COMPARABLE_STATES",
    "compareToRange", "comparisonSentence", "joinNflPlayerBoard", "projectMlbForecast",
  ], "a new export here must be reviewed as a possible write path into frozen truth");
  for (const name of surface) {
    assert.equal(/^(write|save|update|set|persist|merge|apply)/i.test(name), false, `${name} names a mutation`);
  }
});

test("LIFE 9 · a forecast object handed to the join is returned unmutated after kickoff", () => {
  const board = fixtureBoard();
  const before = JSON.stringify(board);
  const live = normalizeNflPlayerStats(fixture("nfl-summary.json"), { eventId: "401872929", fetchedAt: "x" });
  joinNflPlayerBoard(board, live);
  joinNflPlayerBoard(board, live.map((r) => ({ ...r, value: 999 })));
  assert.equal(JSON.stringify(board), before, "the frozen forecast is byte-identical after two joins");
});

/* ───────────────────────── §20.3 cache / cost ───────────────────────── */

test("CACHE 1 · one upstream refresh serves many readers — shared cache yes, private cache no", () => {
  const h = cacheHeaderFor(25);
  assert.match(h, /^public, max-age=0, s-maxage=25, stale-while-revalidate=\d+$/);
  assert.equal(h.includes("private"), false, "a private response would be one upstream call per reader");
  assert.equal(h.includes("no-store"), false, "no-store would defeat the shared cache and the cost model with it");
  // ⚠ The browser must never hold its own copy. A privately cached refusal is indistinguishable from
  // a live one (observed 2026-09-15), so max-age=0 is asserted explicitly rather than assumed.
  assert.match(h, /\bmax-age=0\b/, "the browser must revalidate; only the edge may serve from cache");
  for (const ttl of [25, 60, 300, 3600]) {
    assert.match(cacheHeaderFor(ttl), new RegExp(`\\bmax-age=0\\b.*\\bs-maxage=${ttl}\\b`));
  }
});

test("CACHE 2 · TTL follows STATE — a live slate is short-lived, a finished one is not", () => {
  const ev = (state) => ({ state });
  assert.equal(scoreboardTtl([ev("FINAL"), ev("FINAL")]), TTL_SECONDS.TERMINAL);
  assert.equal(scoreboardTtl([ev("FINAL"), ev("LIVE")]), TTL_SECONDS.LIVE, "one live game sets the pace for the slate");
  assert.equal(scoreboardTtl([ev("FINAL"), ev("PRE")]), TTL_SECONDS.PRE_IMMINENT);
  assert.equal(scoreboardTtl([]), TTL_SECONDS.UNKNOWN, "an empty slate is not cached as if finished");
});

test("CACHE 3 · the cache key is the request, and the request carries sport + event + mode", () => {
  // Two different events must not be able to produce the same upstream plan.
  const a = planRequest({ sport: "nfl", event: "401872929", players: "1" });
  const b = planRequest({ sport: "nfl", event: "401872930", players: "1" });
  assert.notEqual(upstreamUrls(a).summary, upstreamUrls(b).summary);
  assert.equal(upstreamUrls(planRequest({ sport: "mlb", event: "822762" })).summary, null,
    "MLB serves a single event from the SAME batch call — no per-event upstream");
});

test("CACHE 4 · one provider failure cannot poison another sport — plans are independent", () => {
  assert.match(upstreamUrls(planRequest({ sport: "mlb" })).scoreboard, /statsapi\.mlb\.com/);
  assert.match(upstreamUrls(planRequest({ sport: "nfl" })).scoreboard, /site\.api\.espn\.com/);
});

test("CACHE 5 · player stats are OPT-IN — a hub reader never triggers the heavy summary call", () => {
  assert.equal(upstreamUrls(planRequest({ sport: "nfl" })).summary, null);
  assert.equal(upstreamUrls(planRequest({ sport: "nfl", event: "401872929" })).summary, null,
    "opening an event is not by itself consent to a 567 KB upstream read");
  assert.ok(upstreamUrls(planRequest({ sport: "nfl", event: "401872929", players: "1" })).summary);
});

/* ──────────────────────── gateway validation ──────────────────────── */

test("GATE 1 · the kill switch defaults to OFF — a feature nobody enabled spends nothing", () => {
  assert.equal(gatewayDisabled({}), true);
  assert.equal(gatewayDisabled({ LIVE_GATEWAY_ENABLED: "" }), true);
  assert.equal(gatewayDisabled({ LIVE_GATEWAY_ENABLED: "0" }), true);
  assert.equal(gatewayDisabled({ LIVE_GATEWAY_ENABLED: "false" }), true);
  assert.equal(gatewayDisabled({ LIVE_GATEWAY_ENABLED: "1" }), false);
});

test("GATE 2 · only validated ids reach an upstream URL", () => {
  for (const bad of ["../../etc/passwd", "1 OR 1=1", "abc", "", "1;2", "https://evil.test", "1".repeat(13)]) {
    const p = planRequest({ sport: "nfl", event: bad });
    // An empty id is a legitimate scoreboard request; everything else is refused outright.
    if (bad === "") assert.equal(p.mode, "scoreboard");
    else assert.equal(p.ok, false, `"${bad}" must not reach a provider`);
  }
  assert.equal(planRequest({ sport: "nba" }).reason, "UNSUPPORTED_SPORT");
  assert.equal(planRequest({ sport: "mlb", date: "2026/09/15" }).reason, "PROVIDER_MALFORMED");
});

test("GATE 3 · no upstream URL is ever taken from the request", () => {
  for (const sport of ["nfl", "mlb"]) {
    const u = upstreamUrls(planRequest({ sport, event: "12345", players: "1", url: "https://evil.test" }));
    assert.match(u.scoreboard, /^https:\/\/(statsapi\.mlb\.com|site\.api\.espn\.com)\//);
    if (u.summary) assert.match(u.summary, /^https:\/\/site\.api\.espn\.com\//);
    assert.equal(JSON.stringify(u).includes("evil.test"), false);
  }
});

/* ───────────────────────── forecast join ───────────────────────── */

function fixtureBoard() {
  return JSON.parse(fs.readFileSync(path.join(here, "..", "..", "..", "public/data/nfl/player-board/401872929.json"), "utf8"));
}

test("JOIN 1 · comparison is arithmetic on two published numbers, nothing more", () => {
  assert.equal(compareToRange(57, 52, 82), "INSIDE");
  assert.equal(compareToRange(40, 52, 82), "BELOW");
  assert.equal(compareToRange(90, 52, 82), "ABOVE");
  assert.equal(compareToRange(52, 52, 82), "INSIDE", "the band is inclusive at both ends");
  assert.equal(compareToRange(82, 52, 82), "INSIDE");
  assert.equal(compareToRange(null, 52, 82), null, "no live value means no comparison, not a guess");
  assert.equal(compareToRange(57, null, 82), null);
});

test("JOIN 2 · the accessible sentence states fact vs frozen forecast and implies no probability", () => {
  const s = comparisonSentence({ name: "Terry McLaurin", market: "player_reception_yds", label: "Receiving yards", value: 57, rangeLow: 52, rangeHigh: 82, position: "INSIDE" });
  assert.ok(s.includes("57 yards so far"));
  assert.ok(s.includes("GameTime pregame range 52 to 82"));
  assert.ok(s.includes("inside the pregame range"));
  assert.ok(s.includes("frozen"));
  for (const banned of ["on pace", "chance", "likely", "probability", "%", "lock", "safe"]) {
    assert.equal(s.toLowerCase().includes(banned), false, `"${banned}" must not appear in live comparison copy`);
  }
});

test("JOIN 3 · a real board joins to a real box score by identity alone", () => {
  const board = fixtureBoard();
  const live = normalizeNflPlayerStats(fixture("nfl-summary.json"), { eventId: "401872929", fetchedAt: "x" });
  const { rows } = joinNflPlayerBoard(board, live);
  assert.ok(rows.length > 0, "the board and the box score share an id space");
  const withLive = rows.filter((r) => r.value !== null);
  assert.ok(withLive.length > 0, "at least one forecast player recorded a stat");
  for (const r of withLive) {
    assert.ok(["BELOW", "INSIDE", "ABOVE"].includes(r.position));
    assert.equal(typeof r.rangeLow, "number");
  }
});

test("JOIN 4 · ⚠ the gate reads the family state from THIS board, not from a constant", () => {
  // The state genuinely varies by board: on the week-2 board below `player_rush_yds` is ESTIMATE,
  // while the week-3 board publishes it. Hard-coding either answer would let a demoted family
  // render on the week it was demoted, so the row set is derived from the board in hand.
  const board = fixtureBoard();
  assert.equal(board.families.player_pass_yds.state, "ESTIMATE");
  const published = Object.entries(board.families)
    .filter(([, f]) => f.state === "PUBLISHED")
    .map(([k]) => k);
  const nonPublished = Object.entries(board.families)
    .filter(([, f]) => f.state !== "PUBLISHED")
    .map(([k]) => k);
  assert.ok(published.length > 0 && nonPublished.length > 0, "the fixture exercises both sides of the gate");

  const { rows } = joinNflPlayerBoard(board, [], { markets: [...published, ...nonPublished] });
  for (const m of nonPublished) {
    assert.equal(rows.some((r) => r.market === m), false, `${m} is ${board.families[m].state} and must produce no row`);
  }
  assert.ok(rows.length > 0, "a PUBLISHED family still produces rows");
  for (const r of rows) assert.equal(r.modelState, "PUBLISHED");

  // Mutation probe: demote every family and the entire comparison disappears.
  const demoted = structuredClone(board);
  for (const f of Object.values(demoted.families)) f.state = "PAUSED";
  assert.deepEqual(joinNflPlayerBoard(demoted, []).rows, [], "every family paused ⇒ no live comparison at all");
  assert.deepEqual([...COMPARABLE_STATES], ["PUBLISHED"]);
});

test("JOIN 5 · a player who has recorded nothing shows null, never 0", () => {
  const board = fixtureBoard();
  const { rows } = joinNflPlayerBoard(board, []);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.value, null, "no feed value means no value — 0 would be a claim the feed did not make");
    assert.equal(r.position, null);
  }
});

test("JOIN 6 · live rows that match no forecast are COUNTED, never fuzzy-matched", () => {
  const board = fixtureBoard();
  const live = normalizeNflPlayerStats(fixture("nfl-summary.json"), { eventId: "401872929", fetchedAt: "x" });
  const { unjoinedLiveRows } = joinNflPlayerBoard(board, live);
  assert.ok(unjoinedLiveRows > 0, "the box score carries players the board does not forecast");
  // A renamed player must drop out entirely rather than be matched by name.
  const renamed = live.map((r) => ({ ...r, playerId: `nfl-athlete-999${r.providerPlayerId}` }));
  const { rows } = joinNflPlayerBoard(board, renamed);
  assert.equal(rows.every((r) => r.value === null), true, "an id that does not match joins to nothing");
});

test("JOIN 7 · ⚠ MLB totals stay PAUSED — the projection exposes no combined total", () => {
  const sim = {
    gamePk: 824307, status: "ready",
    winProbability: { away: 0.537, home: 0.463 },
    runs: { away: { mean: 5.28, median: 5, p10: 1, p90: 10 }, home: { mean: 4.66, median: 4, p10: 1, p90: 9 } },
    totalRuns: { mean: 9.94, median: 9, p10: 5, p90: 16, distribution: [{ value: 9, probability: 0.12 }] },
  };
  const p = projectMlbForecast(sim);
  const serialized = JSON.stringify(p);
  assert.equal(serialized.includes("totalRuns"), false, "the paused totals market must not reach the live module");
  assert.equal(serialized.includes("distribution"), false);
  assert.equal(p.runs.home.rangeHigh, 9);
  assert.equal(p.runs.away.rangeLow, 1);
});

test("JOIN 8 · an MLB game with no ready simulation yields no forecast block, not an empty one", () => {
  assert.equal(projectMlbForecast({ gamePk: 1, status: "unavailable", runs: null }), null);
  assert.equal(projectMlbForecast({ gamePk: 1, status: "ready", runs: { home: null, away: null } }), null);
  assert.equal(projectMlbForecast(null), null);
});

/* ─────────────── ET-date slate scoping (found in preview, 2026-09-15) ─────────────── */

test("SCOPE 1 · ⚠ the NFL slate is scoped by the event's ET date, not its UTC date", async () => {
  const { etDateOf } = await import("./client.ts");
  // DET @ BUF kicks off 2026-09-18T00:15Z. ESPN returns it for dates=20260917 and returns ZERO
  // events for 20260918, because the parameter is the ET date. Using the UTC date would lose every
  // late-evening game — which is most of the nationally televised ones.
  assert.equal(etDateOf("2026-09-18T00:15Z"), "2026-09-17");
  assert.equal(etDateOf("2026-09-20T17:00Z"), "2026-09-20");
  assert.equal(etDateOf("2026-09-16T03:30Z"), "2026-09-15", "a late West-Coast game stays on its ET day");
  assert.equal(etDateOf(null), undefined);
  assert.equal(etDateOf("not-a-date"), undefined);
});

test("SCOPE 2 · a dated NFL request asks for that slate; an undated one takes the current week", () => {
  const dated = upstreamUrls(planRequest({ sport: "nfl", event: "401872932", date: "2026-09-17" }));
  assert.match(dated.scoreboard, /\?dates=20260917$/, "the hyphens are stripped for ESPN's parameter");
  const undated = upstreamUrls(planRequest({ sport: "nfl", event: "401872932" }));
  assert.equal(undated.scoreboard.includes("dates="), false);
  // Two dates must not collapse to one cached response.
  const other = upstreamUrls(planRequest({ sport: "nfl", event: "401872933", date: "2026-09-20" }));
  assert.notEqual(dated.scoreboard, other.scoreboard);
});

test("SCOPE 3 · a malformed date never reaches a provider URL", () => {
  for (const bad of ["20260917", "2026-9-17", "'; DROP", "2026-09-17T00:00Z"]) {
    assert.equal(planRequest({ sport: "nfl", date: bad }).ok, false, `${bad} must be refused`);
  }
  assert.equal(planRequest({ sport: "nfl", date: "2026-09-17" }).ok, true);
});
