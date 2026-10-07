/**
 * LV-1..3 · MLB Live truth repair — today's date, today's roster, honest freshness.
 *
 * The defect (independent audit, 2026-10-07): the MLB hub asked StatsAPI with no date, received
 * yesterday's all-final slate after midnight ET, stopped polling for good, and kept claiming the
 * feed was "updated N sec ago". Every test below is behavioural and pins its own instant; none
 * asserts a slate size or a total.
 *
 * Fixtures: the captured, sanitized StatsAPI schedule (`fixtures/mlb-schedule.json`) is reused and
 * re-stated IN MEMORY only (states and dates rewritten per scenario). Nothing synthetic is committed
 * as if it were a real slate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { cacheHeaderFor, memoReset, planRequest, scoreboardTtl, ttlForPlan, upstreamUrls } from "../../../api/_live-core.mjs";
import { TTL_SECONDS } from "./freshness.mjs";
import {
  MOVING_INTERVAL_MS,
  TODAY_MAX_TTL_SECONDS,
  WAITING_INTERVAL_MS,
  etDateAt,
  nextSlatePollMs,
  scopeSlate,
  slateFeedStatus,
} from "./slate-scope.mjs";
import { HIDDEN_TAB_MIN_INTERVAL_MS } from "./freshness.mjs";
import { normalizeMlbSchedule } from "./adapters/mlb-statsapi.mjs";

const APP = path.resolve(import.meta.dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const MLB_ONLY = ["mlb"];
const BOTH = ["mlb", "nfl"];

/** 00:30 ET on Oct 8 — the window where an undated StatsAPI read can still be Oct 7's finals. */
const AFTER_MIDNIGHT_ET = Date.parse("2026-10-08T04:30:00Z");
/** 23:30 ET on Oct 7 — UTC has already rolled to Oct 8. */
const LATE_EVENING_ET = Date.parse("2026-10-08T03:30:00Z");

const fixture = JSON.parse(read("src/lib/live/fixtures/mlb-schedule.json"));
/** The captured slate with every game forced to one abstract state (in memory only). */
function slateAll(abstractGameState, codedGameState) {
  const copy = structuredClone(fixture);
  for (const d of copy.dates) for (const g of d.games) g.status = { ...g.status, abstractGameState, codedGameState, statusCode: codedGameState };
  return copy;
}
const FINAL_SLATE = normalizeMlbSchedule(slateAll("Final", "F"), "2026-10-08T04:30:00.000Z");
const FIXTURE_IDS = FINAL_SLATE.map((e) => e.eventId);

/* ───────────── LV-1 · the request always names today's ET date ───────────── */

test("LV-1a · the ET date is the America/New_York calendar day, not the UTC day", () => {
  assert.equal(etDateAt(LATE_EVENING_ET), "2026-10-07", "23:30 ET is still Oct 7 although UTC is Oct 8");
  assert.equal(etDateAt(AFTER_MIDNIGHT_ET), "2026-10-08");
});

test("LV-1b · ⚠ an undated MLB request is pinned to TODAY's ET date upstream — never sent bare", () => {
  const plan = planRequest({ sport: "mlb" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  assert.equal(plan.ok, true);
  assert.equal(plan.date, "2026-10-08");
  const url = upstreamUrls(plan).scoreboard;
  assert.match(url, /statsapi\.mlb\.com\/api\/v1\/schedule\?/);
  assert.match(url, /[?&]date=2026-10-08(&|$)/, "the upstream schedule call names today's date");

  // Event mode shares the same dated slate call.
  const evt = planRequest({ sport: "mlb", event: "822762" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  assert.equal(upstreamUrls(evt).scoreboard, url);

  // Mutation probe: a bare upstream URL is exactly what this guard exists to catch.
  assert.equal(/[?&]date=/.test("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team"), false);
});

test("LV-1c · an explicit date is honoured, and a malformed one is still refused", () => {
  const plan = planRequest({ sport: "mlb", date: "2026-10-05" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  assert.match(upstreamUrls(plan).scoreboard, /date=2026-10-05/);
  assert.equal(planRequest({ sport: "mlb", date: "10/08/2026" }, MLB_ONLY, AFTER_MIDNIGHT_ET).ok, false);
});

test("LV-1d · NFL is untouched: ESPN keeps its current-week default when no date is sent", () => {
  const plan = planRequest({ sport: "nfl" }, BOTH, AFTER_MIDNIGHT_ET);
  assert.equal(plan.date, null);
  assert.equal(/dates=/.test(upstreamUrls(plan).scoreboard), false);
});

test("LV-1e · the slate hook sends today's ET date for MLB on every poll", () => {
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /const date = sport === "mlb" \? etDateAt\(Date\.now\(\)\) : undefined;/,
    "the date is computed from the reader's clock at poll time, so a page left open past midnight moves on");
  assert.match(hook, /liveUrl\(\{\s*sport,\s*date\s*\}\)/);
});

/* ───────────── LV-2 · only today's roster counts ───────────── */

test("LV-2a · ⚠ yesterday's all-final slate is NOT today's slate: nothing joins, polling continues", () => {
  const todaysRoster = ["900000001", "900000002", "900000003"]; // ids that are not in yesterday's feed
  const scoped = scopeSlate(FINAL_SLATE, todaysRoster);
  assert.equal(scoped.matched, 0, "no stale row joins today's roster");
  assert.equal(scoped.outside, FINAL_SLATE.length);
  assert.deepEqual(scoped.byGamePk, {});

  const next = nextSlatePollMs({ states: scoped.states, rosterSize: todaysRoster.length, hidden: false });
  assert.notEqual(next, null, "the poll must not stop on another day's finals");
  assert.equal(next, WAITING_INTERVAL_MS);

  assert.equal(
    slateFeedStatus({ enabled: true, rosterIsToday: true, rosterSize: 3, unavailable: null, loading: false, matched: scoped.matched, settled: false, freshnessLevel: "FRESH", ageSecs: 2 }),
    "NO_TODAY_DATA",
    "with nothing joined the hub says so, even though the response itself is seconds old",
  );
});

test("LV-2b · the poll stops only when EVERY roster game is in the feed and terminal", () => {
  const all = FIXTURE_IDS;
  assert.equal(nextSlatePollMs({ states: scopeSlate(FINAL_SLATE, all).states, rosterSize: all.length, hidden: false }), null);

  // One roster game has not reached the feed yet: some finals are not a finished day.
  const extra = [...all, "900000009"];
  assert.equal(nextSlatePollMs({ states: scopeSlate(FINAL_SLATE, extra).states, rosterSize: extra.length, hidden: false }), WAITING_INTERVAL_MS);

  // Any live or upcoming roster game keeps the live cadence; a hidden tab backs off.
  const states = ["FINAL", "LIVE"];
  assert.equal(nextSlatePollMs({ states, rosterSize: 2, hidden: false }), MOVING_INTERVAL_MS);
  assert.equal(nextSlatePollMs({ states, rosterSize: 2, hidden: true }), HIDDEN_TAB_MIN_INTERVAL_MS);
  assert.equal(nextSlatePollMs({ states: ["PRE"], rosterSize: 1, hidden: false }), MOVING_INTERVAL_MS);

  // Nothing on today's roster: nothing to track.
  assert.equal(nextSlatePollMs({ states: [], rosterSize: 0, hidden: false }), null);
});

test("LV-2c · callers without a roster (NFL hub, My GameTime) keep the earlier cadence", () => {
  assert.equal(nextSlatePollMs({ states: [], rosterSize: null, hidden: false }), MOVING_INTERVAL_MS);
  assert.equal(nextSlatePollMs({ states: ["FINAL", "FINAL"], rosterSize: null, hidden: false }), null);
  assert.equal(scopeSlate(FINAL_SLATE, null).matched, FINAL_SLATE.length, "no roster ⇒ the dated slate is used whole");
});

test("LV-2d · a row for today's roster game joins by gamePk; a foreign row does not", () => {
  const [a, b] = FIXTURE_IDS;
  const scoped = scopeSlate(FINAL_SLATE, [a]);
  assert.deepEqual(Object.keys(scoped.byGamePk), [a]);
  assert.equal(b in scoped.byGamePk, false);
});

test("LV-2e · the MLB hub passes its roster and date, and hides another day's roster", () => {
  const hub = read("src/components/live/live-hub.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hub, /rosterIds: roster\.games\.map\(\(g\) => g\.gamePk\), rosterDate: roster\.etDate/);
  assert.match(hub, /useLiveSlate\("mlb", scope\)/);
  assert.match(hub, /rosterIsToday === false \? null/, "a roster for another day is not painted as today");
  const hook = read("src/components/live/use-live-slate.ts");
  assert.match(hook, /roster\.rosterDate !== date/, "the hook refuses to join a roster that is not today's");
});

/* ───────────── honest feed line ───────────── */

const base = { enabled: true, rosterIsToday: true, rosterSize: 5, unavailable: null, loading: false, matched: 5, settled: false, freshnessLevel: "FRESH", ageSecs: 3 };

test("LV-HONEST · the feed line claims a recent update only while one is being measured", () => {
  assert.equal(slateFeedStatus(base), "FRESH");
  assert.equal(slateFeedStatus({ ...base, settled: true, ageSecs: null, freshnessLevel: "NOT_APPLICABLE" }), "ALL_FINAL",
    "a settled slate states the last-checked time, never an age that stopped ticking");
  assert.equal(slateFeedStatus({ ...base, matched: 0 }), "NO_TODAY_DATA");
  assert.equal(slateFeedStatus({ ...base, rosterIsToday: false }), "NOT_TODAY");
  assert.equal(slateFeedStatus({ ...base, rosterSize: 0 }), "NO_GAMES");
  assert.equal(slateFeedStatus({ ...base, unavailable: { reason: "PROVIDER_ERROR" } }), "UNAVAILABLE");
  assert.equal(slateFeedStatus({ ...base, loading: true }), "CHECKING");
  assert.equal(slateFeedStatus({ ...base, freshnessLevel: "STALE", ageSecs: 400 }), "STALE");
  assert.equal(slateFeedStatus({ ...base, enabled: false }), "OFF");

  const hub = read("src/components/live/live-hub.tsx");
  assert.ok(hub.includes("No live data for today's games yet"), "the honest empty state is rendered copy");
  assert.ok(hub.includes("All of today's games are final"));
  // The ticker can no longer stop while an age is on screen.
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /if \(!fetchedAt \|\| settled\) return;/);
  assert.match(hook, /fetchedAt && !settled\s*\?\s*freshnessOf/);
});

/* ───────────── LV-3 · no terminal one-hour cache for today ───────────── */

test("LV-3a · ⚠ an all-final MLB slate for TODAY is never cached for an hour", () => {
  const plan = planRequest({ sport: "mlb" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  const raw = scoreboardTtl(FINAL_SLATE);
  assert.equal(raw, TTL_SECONDS.TERMINAL, "precondition: the slate alone would earn the terminal TTL");
  const ttl = ttlForPlan(plan, raw, AFTER_MIDNIGHT_ET);
  assert.ok(ttl <= TODAY_MAX_TTL_SECONDS, `today's TTL ${ttl}s must be ≤ ${TODAY_MAX_TTL_SECONDS}s`);
  assert.match(cacheHeaderFor(ttl), new RegExp(`s-maxage=${ttl}\\b`));
});

test("LV-3b · a past MLB date keeps the terminal TTL; shorter TTLs and NFL are unchanged", () => {
  const past = planRequest({ sport: "mlb", date: "2026-10-06" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  assert.equal(ttlForPlan(past, TTL_SECONDS.TERMINAL, AFTER_MIDNIGHT_ET), TTL_SECONDS.TERMINAL);
  const today = planRequest({ sport: "mlb" }, MLB_ONLY, AFTER_MIDNIGHT_ET);
  assert.equal(ttlForPlan(today, TTL_SECONDS.LIVE, AFTER_MIDNIGHT_ET), TTL_SECONDS.LIVE);
  const nfl = planRequest({ sport: "nfl" }, BOTH, AFTER_MIDNIGHT_ET);
  assert.equal(ttlForPlan(nfl, TTL_SECONDS.TERMINAL, AFTER_MIDNIGHT_ET), TTL_SECONDS.TERMINAL);
});

/* ───────────── end to end through the gateway handler (stubbed upstream) ───────────── */

test("LV-E2E · the gateway asks StatsAPI for today and serves today's finals with a short cache", async () => {
  const { default: handler } = await import("../../../api/live.mjs");
  const prevEnabled = process.env.LIVE_GATEWAY_ENABLED;
  const prevSports = process.env.LIVE_PUBLIC_SPORTS;
  const prevFetch = globalThis.fetch;
  process.env.LIVE_GATEWAY_ENABLED = "1";
  delete process.env.LIVE_PUBLIC_SPORTS;
  memoReset();
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const body = JSON.stringify(slateAll("Final", "F"));
    return { ok: true, text: async () => body };
  };
  const headers = {};
  let payload;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status() { return this; },
    json(b) { payload = b; return this; },
    end() { return this; },
  };
  try {
    const before = etDateAt(Date.now());
    await handler({ method: "GET", query: { sport: "mlb" } }, res);
    const after = etDateAt(Date.now());
    assert.equal(asked.length, 1);
    const m = asked[0].match(/[?&]date=(\d{4}-\d{2}-\d{2})/);
    assert.ok(m, `upstream was asked without a date: ${asked[0]}`);
    assert.ok(m[1] === before || m[1] === after, "the date is today's ET date");
    assert.ok(Array.isArray(payload?.events) && payload.events.every((e) => e.state === "FINAL"));
    const sMax = Number(/s-maxage=(\d+)/.exec(headers["Cache-Control"])?.[1]);
    assert.ok(sMax <= TODAY_MAX_TTL_SECONDS, `today's all-final slate cached ${sMax}s`);
  } finally {
    globalThis.fetch = prevFetch;
    memoReset();
    if (prevEnabled === undefined) delete process.env.LIVE_GATEWAY_ENABLED; else process.env.LIVE_GATEWAY_ENABLED = prevEnabled;
    if (prevSports !== undefined) process.env.LIVE_PUBLIC_SPORTS = prevSports;
  }
});
