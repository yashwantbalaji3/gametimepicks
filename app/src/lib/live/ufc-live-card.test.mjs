/**
 * UFC Live mount (Oct 10): the gateway's UFC capability and the /ufc panel's join.
 *
 * Every provider payload here is a COMMITTED capture (`fixtures/mma-scoreboard-*.json`, real ESPN
 * cards of 2026-09-19 and 2026-09-26). The "card" each test joins against is re-stated in memory
 * from the same capture's ids, so nothing synthetic is committed and no result is invented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SUPPORTED_SPORTS, memoReset, planRequest, publicSports, ttlForPlan, upstreamUrls } from "../../../api/_live-core.mjs";
import { normalizeMmaScoreboard } from "./adapters/espn-mma.mjs";
import { TTL_SECONDS } from "./freshness.mjs";
import {
  UFC_LIVE_STATUS as S,
  joinUfcBout,
  joinUfcCard,
  ufcKeepPolling,
  ufcLiveWindow,
  ufcStatusText,
} from "./ufc-live-card.mjs";

const FIX = path.join(import.meta.dirname, "fixtures");
const capture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, `mma-scoreboard-${name}.json`), "utf8"));
const FETCHED = "2026-09-26T22:00:00.000Z";

/** The gateway's answer for a capture, exactly as `api/live.mjs` would serve it. */
const served = (name) => ({ schemaVersion: 1, sport: "ufc", fetchedAt: FETCHED, events: normalizeMmaScoreboard(capture(name), FETCHED) });

/** The card's own bouts, re-stated from the capture: bout id, start, and both ESPN athlete ids. */
function cardFrom(name) {
  const out = [];
  for (const e of capture(name).events ?? []) {
    for (const c of e.competitions ?? []) {
      const [a, b] = c.competitors;
      out.push({
        boutId: String(c.id),
        startUtc: c.date ?? e.date,
        red: { name: a.athlete?.displayName, athleteId: String(a.id) },
        blue: { name: b.athlete?.displayName, athleteId: String(b.id) },
      });
    }
  }
  return out;
}

/* ───────────── gateway: capability, permission, date scope ───────────── */

test("UFC-G1 · ufc is a capability, but only a permission when LIVE_PUBLIC_SPORTS names it", () => {
  assert.ok(SUPPORTED_SPORTS.includes("ufc"));
  assert.deepEqual(publicSports({}), ["mlb"], "default stays MLB only");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl" }), ["nfl", "mlb"], "today's Production setting does not open UFC");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" }), ["nfl", "mlb", "ufc"]);
  assert.deepEqual(planRequest({ sport: "ufc", date: "2026-10-10" }, ["mlb", "nfl"]), { ok: false, reason: "UNSUPPORTED_SPORT" });
});

test("UFC-G2 · a UFC request must name the card's date and asks ESPN for exactly that date", () => {
  const allowed = ["ufc"];
  assert.deepEqual(planRequest({ sport: "ufc" }, allowed), { ok: false, reason: "PROVIDER_MALFORMED" }, "undated is refused, never ESPN's 'current'");
  assert.deepEqual(planRequest({ sport: "ufc", date: "2026-10-10", event: "401916276" }, allowed), { ok: false, reason: "EVENT_NOT_FOUND" }, "card-level only");
  const plan = planRequest({ sport: "ufc", date: "2026-10-10" }, allowed);
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, "scoreboard");
  const urls = upstreamUrls(plan);
  assert.equal(urls.scoreboard, "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261010");
  assert.equal(urls.summary, null);
});

test("UFC-G3 · a card about today never takes the one-hour terminal cache", () => {
  const plan = { sport: "ufc", date: "2026-10-10" };
  const duringCard = Date.parse("2026-10-10T23:00:00Z");
  assert.ok(ttlForPlan(plan, TTL_SECONDS.TERMINAL, duringCard) < TTL_SECONDS.TERMINAL);
  const weekLater = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(ttlForPlan(plan, TTL_SECONDS.TERMINAL, weekLater), TTL_SECONDS.TERMINAL, "a past card may cache normally");
});

test("UFC-E2E · the handler serves a UFC card from the ESPN MMA scoreboard, date-scoped", async () => {
  const { default: handler } = await import("../../../api/live.mjs");
  const prev = { en: process.env.LIVE_GATEWAY_ENABLED, sp: process.env.LIVE_PUBLIC_SPORTS, fetch: globalThis.fetch };
  process.env.LIVE_GATEWAY_ENABLED = "1";
  process.env.LIVE_PUBLIC_SPORTS = "mlb,nfl,ufc";
  memoReset();
  const asked = [];
  const body = JSON.stringify(capture("inround"));
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return { ok: true, text: async () => body };
  };
  let payload;
  const res = { setHeader() {}, status() { return this; }, json(b) { payload = b; return this; }, end() { return this; } };
  try {
    await handler({ method: "GET", query: { sport: "ufc", date: "2026-09-26" } }, res);
    assert.deepEqual(asked, ["https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20260926"]);
    assert.equal(payload.sport, "ufc");
    assert.equal(payload.events.length, 1);
    assert.equal(payload.events[0].state, "LIVE");
    assert.equal(payload.events[0].method, null, "the gateway never states a method");
    assert.equal(payload.date, "2026-09-26", "the answer names the card date it describes");

    // Without the setting, the same request is refused before any upstream call.
    process.env.LIVE_PUBLIC_SPORTS = "mlb,nfl";
    asked.length = 0;
    await handler({ method: "GET", query: { sport: "ufc", date: "2026-09-26" } }, res);
    assert.equal(asked.length, 0);
    assert.equal(payload.unavailable, true);
    assert.equal(payload.reason, "UNSUPPORTED_SPORT");
  } finally {
    globalThis.fetch = prev.fetch;
    memoReset();
    if (prev.en === undefined) delete process.env.LIVE_GATEWAY_ENABLED; else process.env.LIVE_GATEWAY_ENABLED = prev.en;
    if (prev.sp === undefined) delete process.env.LIVE_PUBLIC_SPORTS; else process.env.LIVE_PUBLIC_SPORTS = prev.sp;
  }
});

/* ───────────── the /ufc panel's join, over each captured moment ───────────── */

test("UFC-J1 · scheduled bouts read Upcoming", () => {
  const card = cardFrom("pre");
  const j = joinUfcCard(card, served("pre"));
  assert.equal(j.feedOk, true);
  assert.ok(j.rows.length >= 2);
  for (const r of j.rows) assert.equal(r.status, S.UPCOMING);
  assert.equal(ufcKeepPolling(j), true);
});

test("UFC-J2 · ESPN's 'in' during pre-fight (period 0) is still Upcoming, never Round 0", () => {
  const j = joinUfcCard(cardFrom("live"), served("live"));
  assert.equal(j.rows[0].status, S.UPCOMING);
  assert.equal(ufcStatusText(j.rows[0]), "Upcoming");
});

test("UFC-J3 · a bout in a round shows the provider's round, and no method", () => {
  const j = joinUfcCard(cardFrom("inround"), served("inround"));
  const r = j.rows[0];
  assert.equal(r.status, S.IN_ROUND);
  assert.equal(r.round, 1);
  assert.match(ufcStatusText(r), /^Round 1( · .+)?$/);
  assert.doesNotMatch(ufcStatusText(r), /KO|TKO|SUB|DEC|decision|submission/i);
  assert.equal(ufcKeepPolling(j), true);
});

test("UFC-J4 · a final names the winner the feed names by athlete id, and polling stops", () => {
  const card = cardFrom("settled");
  const j = joinUfcCard(card, served("settled"));
  const r = j.rows[0];
  assert.equal(r.status, S.FINAL);
  const feedWinner = capture("settled").events[0].competitions[0].competitors.find((c) => c.winner === true);
  assert.equal(r.winnerName, feedWinner.athlete.displayName);
  assert.equal(ufcStatusText(r), `Final · ${feedWinner.athlete.displayName} won`);
  assert.equal(ufcKeepPolling(j), false);
});

test("UFC-J5 · a replaced opponent is Unavailable, never another pairing's state", () => {
  const [bout] = cardFrom("settled");
  const replaced = { ...bout, blue: { name: "Someone Else", athleteId: "999999" } };
  const r = joinUfcBout(replaced, served("settled").events);
  assert.equal(r.status, S.UNAVAILABLE);
  assert.equal(r.why, "PAIRING_MISMATCH");
});

test("UFC-J6 · missing ids, a bout not on the feed, a refusal or no answer are all Unavailable", () => {
  const [bout] = cardFrom("settled");
  assert.equal(joinUfcBout({ ...bout, red: { name: bout.red.name, athleteId: null } }, served("settled").events).status, S.UNAVAILABLE);
  assert.equal(joinUfcBout({ ...bout, boutId: "1" }, served("settled").events).why, "NOT_ON_FEED");
  for (const payload of [null, { unavailable: true, reason: "PROVIDER_ERROR" }, { events: "nope" }]) {
    const j = joinUfcCard([bout], payload);
    assert.equal(j.feedOk, false);
    assert.equal(j.rows[0].status, S.UNAVAILABLE);
    assert.equal(ufcStatusText(j.rows[0]), "Unavailable");
    assert.equal(ufcKeepPolling(j), true, "a missing feed keeps checking inside the window");
  }
});

test("UFC-J8 · a body dated for another card is no answer, never that card's state", () => {
  const card = cardFrom("settled");
  const body = { ...served("settled"), date: "2026-09-26" };
  assert.equal(joinUfcCard(card, body, "2026-09-26").feedOk, true);
  const wrong = joinUfcCard(card, { ...body, date: "2026-09-19" }, "2026-09-26");
  assert.equal(wrong.feedOk, false);
  assert.equal(wrong.rows[0].status, S.UNAVAILABLE);
  assert.equal(joinUfcCard(card, served("settled"), "2026-09-26").feedOk, false, "an undated body is not trusted for a dated ask");
});

test("UFC-J7 · a final with no stated winner says so instead of picking one", () => {
  const [bout] = cardFrom("settled");
  const events = served("settled").events.map((e) => ({ ...e, winnerAthleteId: null }));
  const r = joinUfcBout(bout, events);
  assert.equal(r.status, S.FINAL);
  assert.equal(r.winnerName, null);
  assert.equal(ufcStatusText(r), "Final · no winner stated by the feed");
});

test("UFC-W1 · the panel's window is the card's, on the reader's clock", () => {
  const bouts = [{ startUtc: "2026-10-10T21:00Z" }, { startUtc: "2026-10-11T04:00Z" }];
  assert.equal(ufcLiveWindow(bouts, Date.parse("2026-10-10T12:00:00Z")), "BEFORE");
  assert.equal(ufcLiveWindow(bouts, Date.parse("2026-10-10T20:45:00Z")), "OPEN");
  assert.equal(ufcLiveWindow(bouts, Date.parse("2026-10-11T09:00:00Z")), "OPEN");
  assert.equal(ufcLiveWindow(bouts, Date.parse("2026-10-11T10:30:00Z")), "AFTER");
  assert.equal(ufcLiveWindow([{ startUtc: null }], Date.now()), "AFTER", "no readable start → no window, no claim");
});
