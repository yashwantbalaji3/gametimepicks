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

import { cacheHeaderFor, memoReset, planRequest, scoreboardTtl, selectMlbDateGroup, ttlForPlan, upstreamUrls } from "../../../api/_live-core.mjs";
import { TTL_SECONDS } from "./freshness.mjs";
import {
  MOVING_INTERVAL_MS,
  TODAY_MAX_TTL_SECONDS,
  WAITING_INTERVAL_MS,
  acceptSlateBody,
  etDateAt,
  initialUnrosteredDate,
  nextUnrosteredDate,
  priorEtDate,
  nextSlatePollMs,
  scopeSlate,
  slateFeedStatus,
  slateRequestPlan,
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
const base = { enabled: true, rosterSize: 5, unavailable: null, loading: false, matched: 5, settled: false, freshnessLevel: "FRESH", ageSecs: 3 };

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

test("LV-1e · the slate hook puts the planned date in the request URL itself on every poll", () => {
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /const plan = slateRequestPlan\(\{ sport, roster, nowMs: Date\.now\(\), activeDate: activeDate\.current \}\);/,
    "planned on the reader's clock at poll time");
  assert.match(hook, /const date = plan\.date;/);
  assert.match(hook, /liveUrl\(\{\s*sport,\s*date\s*\}\)/);
});

test("G3 · ⚠ every MLB caller's URL carries a date — the CDN keys on the URL, not the gateway default", async () => {
  // Hub and My GameTime (through the hook's plan).
  // (Just after midnight a roster-less reader first looks at the prior day — see LATE-2.)
  assert.equal(slateRequestPlan({ sport: "mlb", roster: null, nowMs: AFTER_MIDNIGHT_ET }).date, "2026-10-07");
  assert.equal(slateRequestPlan({ sport: "mlb", roster: null, nowMs: Date.parse("2026-10-08T16:00:00Z") }).date, "2026-10-08");
  assert.equal(slateRequestPlan({ sport: "mlb", roster: { rosterIds: ["1"], rosterDate: "2026-10-08" }, nowMs: AFTER_MIDNIGHT_ET }).date, "2026-10-08");
  // NFL: unchanged, no date.
  assert.equal(slateRequestPlan({ sport: "nfl", roster: null, nowMs: AFTER_MIDNIGHT_ET }).date, undefined);

  // Ask's MLB live transport.
  const { originLiveFetch } = await import("../ask/tools/live.mjs");
  const prev = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, text: async () => "{}" }; };
  try {
    await originLiveFetch("https://example.test")("mlb");
    await originLiveFetch("https://example.test")("nfl");
  } finally {
    globalThis.fetch = prev;
  }
  assert.match(asked[0], /[?&]sport=mlb&date=\d{4}-\d{2}-\d{2}$/, `Ask's MLB URL is dated: ${asked[0]}`);
  assert.equal(/date=/.test(asked[1]), false, "Ask's NFL URL is unchanged");
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

test("LV-2e · the MLB hub passes its roster and date", () => {
  const hub = read("src/components/live/live-hub.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hub, /rosterIds: roster\.games\.map\(\(g\) => g\.gamePk\), rosterDate: roster\.etDate/);
  assert.match(hub, /useLiveSlate\("mlb", scope\)/);
});

test("G1 · ⚠ 2 of today's 4 games returned, both final: the other 2 stay unresolved and polling continues", () => {
  const next = nextSlatePollMs({ states: ["FINAL", "FINAL"], rosterSize: 4, hidden: false });
  assert.notEqual(next, null, "partial coverage never stops the poll");
  // The hook marks the slate settled only when the poll stops, and the hub says "final" only then.
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /if \(next === null\) \{\s*setSettled\(states\.length > 0\);/);
  assert.equal(slateFeedStatus({ ...base, matched: 2, settled: false }), "FRESH", "not ALL_FINAL while unresolved");
});

test("G2 · ⚠ a body for another date, or with no date, fails closed", () => {
  assert.equal(acceptSlateBody({ date: "2026-10-08", events: [] }, "2026-10-08"), true);
  assert.equal(acceptSlateBody({ date: "2026-10-07", events: [] }, "2026-10-08"), false, "another day's slate");
  assert.equal(acceptSlateBody({ events: [] }, "2026-10-08"), false, "an undated (old cached) body");
  assert.equal(acceptSlateBody({ events: [] }, undefined), true, "NFL asks for no date and accepts its body");
  // In the hook the refusal branch comes BEFORE the branch that replaces the slate and its fetchedAt.
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const reject = hook.indexOf("!acceptSlateBody(body, date)");
  const accept = hook.indexOf("setFetchedAt(body.fetchedAt");
  assert.ok(reject > 0 && accept > reject, "a wrong-date body can neither replace the slate nor advance freshness");
});

test("G6 · an off-day empty roster makes no live request", () => {
  const plan = slateRequestPlan({ sport: "mlb", roster: { rosterIds: [], rosterDate: "2026-10-08" }, nowMs: AFTER_MIDNIGHT_ET });
  assert.equal(plan.fetch, false);
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const skip = hook.indexOf("if (!plan.fetch)");
  assert.ok(skip > 0 && skip < hook.indexOf("await fetch("), "the skip precedes the only fetch");
});

test("G7 · a roster built before midnight ET keeps its own date for the join, and is labelled", () => {
  const roster = { rosterIds: FIXTURE_IDS, rosterDate: "2026-10-07" };
  const plan = slateRequestPlan({ sport: "mlb", roster, nowMs: AFTER_MIDNIGHT_ET });
  assert.equal(plan.date, "2026-10-07", "yesterday's cards are joined to yesterday's feed, never today's");
  assert.equal(plan.rosterIsToday, false);
  assert.equal(slateRequestPlan({ sport: "mlb", roster, nowMs: LATE_EVENING_ET }).rosterIsToday, true);
  const hub = read("src/components/live/live-hub.tsx");
  assert.match(hub, /rosterIsToday === false \?/);
  assert.ok(hub.includes("Today's slate has not been published here yet."), "the label states it is not today's slate");
});

/* ───────────── honest feed line ───────────── */


test("LV-HONEST · the feed line claims a recent update only while one is being measured", () => {
  assert.equal(slateFeedStatus(base), "FRESH");
  assert.equal(slateFeedStatus({ ...base, settled: true, ageSecs: null, freshnessLevel: "NOT_APPLICABLE" }), "ALL_FINAL",
    "a settled slate states the last-checked time, never an age that stopped ticking");
  assert.equal(slateFeedStatus({ ...base, matched: 0 }), "NO_TODAY_DATA");
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

/* ───────────── G5 · the provider's date group, not each game's UTC instant ───────────── */

/** The captured slate as StatsAPI groups it: `dates[{ date, games }]` (group date added in memory). */
function grouped(groups) {
  return { dates: groups.map(([date, games]) => ({ date, games })) };
}

test("G5 · ⚠ the slate is chosen by `dates[].date`, so a late ET game past midnight UTC is kept", () => {
  const games = structuredClone(fixture.dates[0].games);
  // A 10:10 PM ET first pitch on Oct 7 is 02:10Z on Oct 8: its UTC day is the NEXT day.
  games[0] = { ...games[0], gameDate: "2026-10-08T02:10:00Z" };
  const decoy = { ...structuredClone(games[1]), gamePk: 900000777 };
  const payload = grouped([["2026-10-07", games], ["2026-10-06", [decoy]]]);

  const kept = normalizeMlbSchedule(selectMlbDateGroup(payload, "2026-10-07"), "2026-10-08T03:00:00.000Z");
  assert.equal(kept.length, games.length, "every game in the requested group survives, the late one included");
  assert.ok(kept.some((e) => e.eventId === String(games[0].gamePk)), "the late game is not lost to its UTC date");
  assert.equal(kept.some((e) => e.eventId === "900000777"), false, "another day's group is dropped");

  // A group with no date is not trusted.
  assert.equal(selectMlbDateGroup({ dates: [{ games }] }, "2026-10-07").dates.length, 0);
});

/* ───────────── end to end through the gateway handler (stubbed upstream) ───────────── */

test("LV-E2E · the gateway asks StatsAPI for today, keeps only today's group, dates the body, short cache", async () => {
  const { default: handler } = await import("../../../api/live.mjs");
  const prevEnabled = process.env.LIVE_GATEWAY_ENABLED;
  const prevSports = process.env.LIVE_PUBLIC_SPORTS;
  const prevFetch = globalThis.fetch;
  process.env.LIVE_GATEWAY_ENABLED = "1";
  delete process.env.LIVE_PUBLIC_SPORTS;
  memoReset();
  const asked = [];
  const today = etDateAt(Date.now());
  const finals = slateAll("Final", "F").dates[0].games;
  const decoy = { ...structuredClone(fixture.dates[0].games[0]), gamePk: 900000777 };
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    // The requested day's finals plus a decoy group for another day.
    const body = JSON.stringify(grouped([[today, finals], ["1999-01-01", [decoy]]]));
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
    assert.ok(Array.isArray(payload?.events) && payload.events.length === finals.length);
    assert.ok(payload.events.every((e) => e.state === "FINAL"));
    assert.equal(payload.events.some((e) => e.eventId === "900000777"), false, "another day's group never reaches a reader");
    assert.equal(payload.date, m[1], "the body names the date it describes, so a reader can refuse another day's");
    const sMax = Number(/s-maxage=(\d+)/.exec(headers["Cache-Control"])?.[1]);
    assert.ok(sMax <= TODAY_MAX_TTL_SECONDS, `today's all-final slate cached ${sMax}s`);
  } finally {
    globalThis.fetch = prevFetch;
    memoReset();
    if (prevEnabled === undefined) delete process.env.LIVE_GATEWAY_ENABLED; else process.env.LIVE_GATEWAY_ENABLED = prevEnabled;
    if (prevSports !== undefined) process.env.LIVE_PUBLIC_SPORTS = prevSports;
  }
});

/* ───────────── LATE · a game that began before midnight ET stays until it ends (Yash 14:48Z) ───────────── */

const T_2355 = Date.parse("2026-10-08T03:55:00Z"); // 11:55 PM ET Oct 7
const T_0005 = Date.parse("2026-10-08T04:05:00Z"); // 12:05 AM ET Oct 8
const T_0050 = Date.parse("2026-10-08T04:50:00Z"); // 12:50 AM ET Oct 8
const LATE_PK = "900000555";

test("LATE-1 · /live: 11:55 PM active → 12:05 AM still active, visible, polling, labelled → Final → only then terminal", () => {
  const roster = { rosterIds: [LATE_PK], rosterDate: "2026-10-07" };
  const live = [{ eventId: LATE_PK, state: "LIVE" }];

  const p1 = slateRequestPlan({ sport: "mlb", roster, nowMs: T_2355 });
  assert.equal(p1.date, "2026-10-07");
  assert.equal(p1.rosterIsToday, true);
  assert.equal(nextSlatePollMs({ states: scopeSlate(live, roster.rosterIds).states, rosterSize: 1, hidden: false }), MOVING_INTERVAL_MS);

  const p2 = slateRequestPlan({ sport: "mlb", roster, nowMs: T_0005 });
  assert.equal(p2.date, "2026-10-07", "after midnight the request still follows the roster's date, not the wall clock");
  assert.equal(p2.rosterIsToday, false, "and the hub labels it as Oct 7's slate, never as the new day's");
  const s2 = scopeSlate(live, roster.rosterIds);
  assert.equal(s2.matched, 1, "the game stays visible");
  assert.equal(nextSlatePollMs({ states: s2.states, rosterSize: 1, hidden: false }), MOVING_INTERVAL_MS, "and polling");
  assert.equal(slateFeedStatus({ ...base, rosterSize: 1, matched: 1, settled: false }), "FRESH");

  const fin = scopeSlate([{ eventId: LATE_PK, state: "FINAL" }], roster.rosterIds);
  assert.equal(nextSlatePollMs({ states: fin.states, rosterSize: 1, hidden: false }), null, "only Final ends it");
});

test("LATE-2 · /my (no roster): the same game holds the prior date while in play, then hands over to today", () => {
  // Page open since 11:55 PM: following Oct 7.
  assert.equal(initialUnrosteredDate(T_2355), "2026-10-07");
  assert.equal(nextUnrosteredDate({ activeDate: "2026-10-07", today: etDateAt(T_2355), states: ["LIVE"] }), "2026-10-07");
  // 12:05 AM: still in play → still Oct 7, still polling.
  assert.equal(slateRequestPlan({ sport: "mlb", roster: null, nowMs: T_0005, activeDate: "2026-10-07" }).date, "2026-10-07");
  assert.equal(nextUnrosteredDate({ activeDate: "2026-10-07", today: etDateAt(T_0005), states: ["LIVE"] }), "2026-10-07");
  assert.equal(nextSlatePollMs({ states: ["LIVE"], rosterSize: null, hidden: false }), MOVING_INTERVAL_MS);
  // A fresh load at 12:05 AM looks at Oct 7 first, so the late game is not lost on a reload either.
  assert.equal(initialUnrosteredDate(T_0005), "2026-10-07");
  // Final: Oct 7 is done; the reader moves to Oct 8 rather than stopping on Oct 7's finals.
  assert.equal(nextUnrosteredDate({ activeDate: "2026-10-07", today: etDateAt(T_0050), states: ["FINAL"] }), "2026-10-08");
  // Daytime: no prior-day probe at all.
  assert.equal(initialUnrosteredDate(Date.parse("2026-10-08T16:00:00Z")), "2026-10-08");
  assert.equal(priorEtDate("2026-11-02"), "2026-11-01", "DST-safe day arithmetic");
  // A wrong-date body never reaches the transition: the hook only passes accepted bodies.
  assert.equal(acceptSlateBody({ date: "2026-10-08", events: [] }, "2026-10-07"), false);
  const hook = read("src/components/live/use-live-slate.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /if \(sport === "mlb" && !roster && accepted && date\) \{/);
  assert.match(hook, /activeDate: activeDate\.current/);
});

test("LATE-3 · Ask: a late game keeps Ask on the prior date; once Final, Ask reads today; wrong dates fail closed", async () => {
  const { originLiveFetch, getLiveSlate } = await import("../ask/tools/live.mjs");
  const prev = globalThis.fetch;
  let bodies;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const d = /date=(\d{4}-\d{2}-\d{2})/.exec(String(url))?.[1];
    const body = JSON.stringify(bodies[d] ?? { date: d, events: [] });
    return { ok: true, text: async () => body };
  };
  try {
    bodies = { "2026-10-07": { date: "2026-10-07", fetchedAt: "x", events: [{ eventId: LATE_PK, state: "LIVE" }] } };
    const held = await originLiveFetch("https://example.test", { now: () => T_0005 })("mlb");
    assert.equal(held.date, "2026-10-07");
    assert.deepEqual(asked.map((u) => /date=([\d-]+)/.exec(u)[1]), ["2026-10-07"]);
    const tool = await getLiveSlate({ sport: "mlb" }, { liveFetch: async () => held });
    assert.equal(tool.date, "2026-10-07", "Ask reports the slate's own date, not the new day");
    assert.equal(tool.liveCount, 1);

    asked.length = 0;
    bodies = {
      "2026-10-07": { date: "2026-10-07", events: [{ eventId: LATE_PK, state: "FINAL" }] },
      "2026-10-08": { date: "2026-10-08", events: [{ eventId: "900000556", state: "PRE" }] },
    };
    const moved = await originLiveFetch("https://example.test", { now: () => T_0050 })("mlb");
    assert.equal(moved.date, "2026-10-08");
    assert.deepEqual(asked.map((u) => /date=([\d-]+)/.exec(u)[1]), ["2026-10-07", "2026-10-08"]);

    bodies = { "2026-10-07": { date: "2026-10-08", events: [{ eventId: LATE_PK, state: "LIVE" }] } };
    const wrong = await originLiveFetch("https://example.test", { now: () => T_0005 })("mlb");
    assert.equal(wrong.unavailable, true, "a body for another date than asked fails closed");
  } finally {
    globalThis.fetch = prev;
  }
});
