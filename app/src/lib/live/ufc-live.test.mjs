/**
 * UFC-001 · UFC LIVE — gateway capability, default-closed gate, bout live-state contract, frozen-pick
 * join, and the hidden /live tab.
 *
 * Fixtures only. The five Sep 26 / Sep 19 fixtures are sanitized REAL captures (pre, walkouts, in
 * round, provider final, completed card); `mma-scoreboard-20261010-pre.json` is tonight's real card
 * before it started. Nothing here simulates a live event against the network, and nothing reads the
 * recorder's scratch directory.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SUPPORTED_SPORTS, memoReset, planRequest, publicSports, ttlForPlan, upstreamUrls } from "../../../api/_live-core.mjs";
import { mmaBoutEnvelope, normalizeMmaBout, normalizeMmaEnvelopes } from "./adapters/espn-mma.mjs";
import { normalizeNflScoreboard } from "./adapters/espn-nfl.mjs";
import { TTL_SECONDS } from "./freshness.mjs";
import { slateRequestPlan } from "./slate-scope.mjs";
import { UFC_LIVE_STATE, deriveUfcBoutState, envelopeMatchesBout, groupUfcBouts } from "./ufc-live.mjs";
import { codeOnly, jsxElement, renderedStrings } from "./testing/source-scan.mjs";

/* The components compile to the classic JSX runtime under tsx. */
globalThis.React = React;
const { buildUfcRosterFrom } = await import("./ufc-hub-data.ts");
const { UfcBoutCard } = await import("../../components/live/ufc-live-hub.tsx");

const here = path.dirname(new URL(import.meta.url).pathname);
const APP = path.join(here, "..", "..", "..");
const REPO = path.join(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8"));
const CARD = JSON.parse(read("public/data/ufc/card-latest.json"));
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/ufc/model-vs-market/snapshot-202610091844.json"), "utf8"));
const TONIGHT = fixture("mma-scoreboard-20261010-pre.json");

/* ───────────────────────── gateway harness (stubbed upstream) ───────────────────────── */

async function callGateway(query, { env = {}, upstream = null } = {}) {
  const { default: handler } = await import("../../../api/live.mjs");
  const keys = ["LIVE_GATEWAY_ENABLED", "LIVE_PUBLIC_SPORTS"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const prevFetch = globalThis.fetch;
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  memoReset();
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (!upstream) throw new Error("no upstream in this test");
    return upstream(String(url));
  };
  const headers = {};
  let payload;
  let status = 200;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status(c) { status = c; return this; },
    json(b) { payload = b; return this; },
    end() { return this; },
  };
  try {
    await handler({ method: "GET", query }, res);
  } finally {
    globalThis.fetch = prevFetch;
    memoReset();
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { status, payload, headers, asked };
}
const okBody = (json) => async () => ({ ok: true, text: async () => JSON.stringify(json) });
const ON_UFC = { LIVE_GATEWAY_ENABLED: "1", LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" };

/** Every key anywhere in a value — for "no probability travels here" scans. */
function allKeys(x, out = new Set()) {
  if (Array.isArray(x)) for (const v of x) allKeys(v, out);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { out.add(k); allKeys(v, out); }
  return out;
}
const PROBABILITY_KEY = /prob|chance|odds|forecast|projection|pick|edge|price/i;

/* ───────────────────────── 1 · capability is not permission ───────────────────────── */

test("UFC-GW 1 · ufc is a CAPABILITY; every default (and Production's mlb,nfl) still refuses it", () => {
  assert.ok(SUPPORTED_SPORTS.includes("ufc"), "the adapter exists");
  assert.deepEqual(publicSports({}), ["mlb"], "unset is MLB only");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "" }), ["mlb"], "empty is MLB only");
  assert.equal(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl" }).includes("ufc"), false, "the current Production setting does not open UFC");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "ufc2,mma,UFC-live" }), [], "lookalikes open nothing");
  assert.equal(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" }).includes("ufc"), true, "the deliberate setting opens it");

  for (const env of [{}, { LIVE_PUBLIC_SPORTS: "mlb" }, { LIVE_PUBLIC_SPORTS: "mlb,nfl" }]) {
    for (const q of [{ sport: "ufc" }, { sport: "UFC" }, { sport: "ufc", event: "401916276", date: "2026-10-10" }]) {
      const plan = planRequest(q, publicSports(env));
      assert.equal(plan.ok, false, `${JSON.stringify(q)} under ${JSON.stringify(env)} must be refused`);
      assert.equal(plan.reason, "UNSUPPORTED_SPORT");
    }
  }
});

test("UFC-GW 2 · a refused UFC request never reaches ESPN — no upstream call is made", async () => {
  const off = await callGateway({ sport: "ufc" }, { env: { LIVE_GATEWAY_ENABLED: "1" }, upstream: okBody(TONIGHT) });
  assert.equal(off.payload?.unavailable, true);
  assert.equal(off.payload?.reason, "UNSUPPORTED_SPORT");
  assert.equal(off.asked.length, 0, "a default deployment spends nothing on UFC");

  const prod = await callGateway({ sport: "ufc" }, { env: { LIVE_GATEWAY_ENABLED: "1", LIVE_PUBLIC_SPORTS: "mlb,nfl" }, upstream: okBody(TONIGHT) });
  assert.equal(prod.payload?.reason, "UNSUPPORTED_SPORT");
  assert.equal(prod.asked.length, 0);

  const killed = await callGateway({ sport: "ufc" }, { env: { LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" }, upstream: okBody(TONIGHT) });
  assert.equal(killed.payload?.reason, "FEATURE_DISABLED", "the kill switch still outranks the allowlist");
  assert.equal(killed.asked.length, 0);
});

/* ───────────────────────── 2 · NFL and MLB are unchanged ───────────────────────── */

test("UFC-GW 3 · NFL and MLB request plans, URLs and TTLs are exactly what they were", () => {
  const allowed = publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" });
  const now = Date.parse("2026-10-10T18:00:00Z");
  const nfl = planRequest({ sport: "nfl" }, allowed, now);
  assert.deepEqual(nfl, { ok: true, sport: "nfl", mode: "scoreboard", eventId: null, date: null, withPlayers: false });
  assert.deepEqual(upstreamUrls(nfl), { scoreboard: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", summary: null });
  const nflEvent = planRequest({ sport: "nfl", event: "401872932", players: "1", date: "2026-09-17" }, allowed, now);
  assert.deepEqual(upstreamUrls(nflEvent), {
    scoreboard: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260917",
    summary: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872932",
  });
  assert.equal(ttlForPlan(nfl, TTL_SECONDS.TERMINAL, now), TTL_SECONDS.TERMINAL, "NFL keeps the terminal TTL");

  const mlb = planRequest({ sport: "mlb" }, allowed, now);
  assert.equal(mlb.date, "2026-10-10");
  assert.deepEqual(upstreamUrls(mlb), { scoreboard: "https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team&date=2026-10-10", summary: null });
  assert.equal(ttlForPlan(mlb, TTL_SECONDS.TERMINAL, now), TTL_SECONDS.PRE_DISTANT);

  // The slate hook's plan: NFL still sends no date; MLB still sends the roster's.
  const roster = { rosterIds: ["1"], rosterDate: "2026-10-10" };
  assert.equal(slateRequestPlan({ sport: "nfl", roster, nowMs: now }).date, undefined);
  assert.equal(slateRequestPlan({ sport: "mlb", roster, nowMs: now }).date, "2026-10-10");
  assert.equal(slateRequestPlan({ sport: "ufc", roster, nowMs: now }).date, "2026-10-10", "UFC names its card's date");
});

test("UFC-GW 4 · the NFL handler answer is byte-for-byte the NFL adapter's, with UFC enabled beside it", async () => {
  const nflFixture = fixture("nfl-scoreboard.json");
  const r = await callGateway({ sport: "nfl" }, { env: ON_UFC, upstream: okBody(nflFixture) });
  assert.equal(r.asked.length, 1);
  assert.equal(r.asked[0], "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  assert.deepEqual(r.payload.events, normalizeNflScoreboard(nflFixture, r.payload.fetchedAt));
  assert.equal("date" in r.payload, false, "NFL bodies still carry no date");
});

/* ───────────────────────── 3 · the UFC request plan and handler ───────────────────────── */

test("UFC-GW 5 · when enabled, UFC asks ONE dated ESPN MMA scoreboard call — never undated, never the summary", () => {
  const allowed = publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl,ufc" });
  const now = Date.parse("2026-10-10T18:00:00Z");
  const plan = planRequest({ sport: "ufc" }, allowed, now);
  assert.deepEqual(plan, { ok: true, sport: "ufc", mode: "scoreboard", eventId: null, date: "2026-10-10", withPlayers: false });
  assert.deepEqual(upstreamUrls(plan), {
    scoreboard: "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261010&limit=1000",
    summary: null,
  });
  const ev = planRequest({ sport: "ufc", event: "401916276", players: "1" }, allowed, now);
  assert.equal(ev.mode, "event");
  assert.equal(ev.withPlayers, false, "no per-event heavy call exists for UFC");
  assert.equal(upstreamUrls(ev).summary, null, "the MMA summary 404s for this card; it is never asked");
  assert.equal(planRequest({ sport: "ufc", event: "401916276x" }, allowed, now).ok, false, "a non-digit id never reaches a URL");
  assert.equal(planRequest({ sport: "ufc", date: "20261010" }, allowed, now).ok, false, "a malformed date is refused");
  // An all-final card today is not pinned for an hour.
  assert.equal(ttlForPlan(plan, TTL_SECONDS.TERMINAL, now), TTL_SECONDS.PRE_DISTANT);
});

test("UFC-GW 6 · tonight's REAL pre-card scoreboard → one envelope per BOUT, dated, no round, nothing probabilistic", async () => {
  const r = await callGateway({ sport: "ufc", date: "2026-10-10" }, { env: ON_UFC, upstream: okBody(TONIGHT) });
  assert.equal(r.asked.length, 1);
  assert.match(r.asked[0], /\/mma\/ufc\/scoreboard\?dates=20261010&limit=1000$/);
  assert.equal(r.payload.sport, "ufc");
  assert.equal(r.payload.date, "2026-10-10", "the body names its card date, so a reader can refuse another day's");
  assert.equal(r.payload.events.length, 12);
  const cardIds = new Set(CARD.bouts.map((b) => String(b.boutId)));
  for (const e of r.payload.events) {
    assert.ok(cardIds.has(e.eventId), `${e.eventId} is a bout id on the card — the BOUT is the event unit`);
    assert.equal(e.cardEventId, "600061541");
    assert.equal(e.state, "PRE");
    assert.equal(e.period, null, "a scheduled bout carries no round and no clock");
    assert.equal(e.competitors.fighters.length, 2);
    assert.equal(e.winnerAthleteId, null, "winner:false on a scheduled bout is a default, not a result");
    assert.equal(e.method, null);
  }
  const leaked = [...allKeys(r.payload)].filter((k) => PROBABILITY_KEY.test(k));
  assert.deepEqual(leaked, [], "the gateway carries no probability, pick or price");
  const sMax = Number(/s-maxage=(\d+)/.exec(r.headers["Cache-Control"])?.[1]);
  assert.ok(sMax > 0 && sMax <= TTL_SECONDS.PRE_DISTANT, `cached ${sMax}s`);
});

test("UFC-GW 7 · event mode selects ONE bout from the batch", async () => {
  const r = await callGateway({ sport: "ufc", event: "401916276", date: "2026-10-10" }, { env: ON_UFC, upstream: okBody(TONIGHT) });
  assert.equal(r.asked.length, 1, "the same batch call — never a per-bout upstream request");
  assert.equal(r.payload.event.eventId, "401916276");
  assert.equal(r.payload.policy.reason.startsWith("PRE"), true);
  const missing = await callGateway({ sport: "ufc", event: "999999999", date: "2026-10-10" }, { env: ON_UFC, upstream: okBody(TONIGHT) });
  assert.equal(missing.payload.reason, "EVENT_NOT_FOUND");
});

test("UFC-GW 8 · a failed or malformed provider answer is a typed refusal, never an empty card", async () => {
  const down = await callGateway({ sport: "ufc" }, { env: ON_UFC, upstream: async () => ({ ok: false, status: 503 }) });
  assert.equal(down.payload.unavailable, true);
  assert.equal(down.payload.reason, "PROVIDER_ERROR");
  assert.match(down.headers["Cache-Control"], /s-maxage=30/, "an outage is cached briefly, not retried per reader");

  const threw = await callGateway({ sport: "ufc" }, { env: ON_UFC, upstream: async () => { throw new Error("socket"); } });
  assert.equal(threw.payload.reason, "PROVIDER_ERROR");

  const junk = await callGateway({ sport: "ufc" }, { env: ON_UFC, upstream: okBody({ code: 404, message: "Error invoking GET" }) });
  assert.equal(junk.payload.reason, "PROVIDER_MALFORMED", "a body with no events array is unreadable, not an empty card");
  assert.throws(() => normalizeMmaEnvelopes(null, "x"));
});

/* ───────────────────────── 4 · the bout live-state contract ───────────────────────── */

/* One real bout through its whole lifecycle (Sep 26: Demopoulos vs Jauregui, ESPN 401914472). */
const FIX = {
  pre: fixture("mma-scoreboard-pre.json"),
  walkouts: fixture("mma-scoreboard-live.json"),
  inround: fixture("mma-scoreboard-inround.json"),
  providerFinal: fixture("mma-scoreboard-settled.json"),
};
const AT = "2026-09-26T21:15:00.000Z";
const envOf = (payload, fetchedAt = AT, boutId = "401914472") =>
  normalizeMmaEnvelopes(payload, fetchedAt).find((e) => e.eventId === boutId) ?? null;
const PREGAME = Object.freeze({ pickName: "Yazmin Jauregui", pickAthleteId: "5063403", opponentName: "Vanessa Demopoulos", winChance: 0.61, modelId: "test-model", publishedAt: "2026-09-26T14:00:00Z" });
const bout = (settlement = null) => ({
  boutId: "401914472",
  canonicalBoutKey: "2026-09-26:vanessa demopoulos|yazmin jauregui",
  href: "/ufc/bout/401914472/",
  position: "Bout 3 of 12",
  startUtc: "2026-09-26T21:00Z",
  weightClass: "Flyweight",
  scheduledRounds: 3,
  titleFight: false,
  red: { athleteId: "4683395", name: "Vanessa Demopoulos", record: null, photoUrl: null },
  blue: { athleteId: "5063403", name: "Yazmin Jauregui", record: null, photoUrl: null },
  pregame: PREGAME,
  unmodelledReason: null,
  settlement,
});
const NOW_FRESH = Date.parse(AT) + 10_000;

test("UFC-ST 1 · scheduled → UPCOMING, with no round, no clock, no result", () => {
  const v = deriveUfcBoutState({ bout: bout(), envelope: envOf(FIX.pre), feed: "OK", nowMs: NOW_FRESH });
  assert.equal(v.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(v.group, "UPCOMING");
  assert.equal(v.label, "Scheduled");
  assert.equal(v.round, null);
  assert.equal(v.clock, null);
  assert.equal(v.result, null);
  assert.equal(v.outcome, null);
});

test("UFC-ST 2 · ⚠ walkouts (ESPN state `in`, period 0, clock '-') are NOT live — never R0", () => {
  const e = envOf(FIX.walkouts);
  assert.equal(e.state, "PRE");
  assert.equal(e.period, null);
  const v = deriveUfcBoutState({ bout: bout(), envelope: e, feed: "OK", nowMs: NOW_FRESH });
  assert.equal(v.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(v.round, null);
  assert.equal(v.clock, null);
});

test("UFC-ST 3 · in a round → LIVE, with exactly the round and clock the provider stated", () => {
  const v = deriveUfcBoutState({ bout: bout(), envelope: envOf(FIX.inround), feed: "OK", nowMs: NOW_FRESH });
  assert.equal(v.state, UFC_LIVE_STATE.LIVE);
  assert.equal(v.group, "LIVE");
  assert.equal(v.round, 1);
  assert.equal(v.clock, "3:58");
  assert.equal(v.providerDetail, "End R1", "the provider's own words travel verbatim");
  assert.equal(v.stale, false);
  assert.equal(v.freshness.level, "FRESH");

  // A LIVE envelope whose provider stated neither carries neither — no default round, no 0:00.
  const bare = { ...envOf(FIX.inround), period: null };
  const vb = deriveUfcBoutState({ bout: bout(), envelope: bare, feed: "OK", nowMs: NOW_FRESH });
  assert.equal(vb.state, UFC_LIVE_STATE.LIVE);
  assert.equal(vb.round, null);
  assert.equal(vb.clock, null);
});

test("UFC-ST 4 · ⚠ a provider FINAL is FINAL_PROVISIONAL: winner REPORTED, pick NOT graded", () => {
  const v = deriveUfcBoutState({ bout: bout(), envelope: envOf(FIX.providerFinal), feed: "OK", nowMs: NOW_FRESH });
  assert.equal(v.state, UFC_LIVE_STATE.FINAL_PROVISIONAL);
  assert.equal(v.group, "AWAITING_OFFICIAL_RESULT");
  assert.deepEqual(v.result, { source: "PROVIDER", winnerAthleteId: "5063403", winnerName: "Yazmin Jauregui", round: 1, clock: "1:02" });
  assert.equal(v.outcome, null, "the pick matched the reported winner, and is still not marked correct");
  assert.equal(v.round, null, "a live round is not shown on a finished bout");
});

test("UFC-ST 5 · FINAL_CANONICAL comes ONLY from a settlement record — and then the outcome may show", () => {
  const hit = deriveUfcBoutState({ bout: bout({ winnerName: "Yazmin Jauregui", hit: true, asOf: "2026-09-27T13:00:00Z" }), envelope: envOf(FIX.providerFinal), feed: "OK" });
  assert.equal(hit.state, UFC_LIVE_STATE.FINAL_CANONICAL);
  assert.equal(hit.group, "FINAL");
  assert.equal(hit.outcome, "HIT");
  assert.equal(hit.result.source, "SETTLEMENT");
  assert.equal(hit.result.winnerAthleteId, "5063403");

  const miss = deriveUfcBoutState({ bout: bout({ winnerName: "Vanessa Demopoulos", hit: false, asOf: null }), envelope: null, feed: "NOT_ASKED" });
  assert.equal(miss.state, UFC_LIVE_STATE.FINAL_CANONICAL, "the ledger owns the final even with no feed");
  assert.equal(miss.outcome, "MISS");

  const voided = deriveUfcBoutState({ bout: bout({ winnerName: null, hit: null, asOf: null }), envelope: null });
  assert.equal(voided.state, UFC_LIVE_STATE.FINAL_CANONICAL);
  assert.equal(voided.outcome, null, "a settled bout with no graded outcome states none");
});

test("UFC-ST 6 · exhaustive: with no settlement, NO fixture in ANY feed state reaches FINAL_CANONICAL or an outcome", () => {
  const all = [
    ...Object.values(FIX).flatMap((p) => normalizeMmaEnvelopes(p, AT)),
    ...normalizeMmaEnvelopes(fixture("mma-scoreboard-final.json"), AT),
    ...normalizeMmaEnvelopes(TONIGHT, AT),
    null,
  ];
  let checked = 0;
  for (const envelope of all) {
    for (const feed of ["NOT_ASKED", "OK", "REFUSED"]) {
      const b = envelope ? { ...bout(), boutId: envelope.eventId, red: { ...bout().red, athleteId: envelope.competitors.fighters[0].athleteId }, blue: { ...bout().blue, athleteId: envelope.competitors.fighters[1].athleteId } } : bout();
      const v = deriveUfcBoutState({ bout: b, envelope, feed, nowMs: NOW_FRESH });
      assert.notEqual(v.state, UFC_LIVE_STATE.FINAL_CANONICAL);
      assert.equal(v.outcome, null);
      checked++;
    }
  }
  assert.ok(checked > 40, `checked ${checked} combinations`);
});

test("UFC-ST 7 · stale and failed feeds degrade honestly", () => {
  // A live bout whose last read is 200 s old: still LIVE (never regressed), flagged stale, round kept as last confirmed.
  const old = envOf(FIX.inround, new Date(NOW_FRESH - 200_000).toISOString());
  const s = deriveUfcBoutState({ bout: bout(), envelope: old, feed: "REFUSED", nowMs: NOW_FRESH });
  assert.equal(s.state, UFC_LIVE_STATE.LIVE, "a provider failure never turns a known-live bout back into scheduled");
  assert.equal(s.stale, true);
  assert.equal(s.freshness.level, "STALE");
  assert.equal(s.round, 1);

  // Asked, refused, nothing held: "Status unknown" — never "Scheduled".
  const refused = deriveUfcBoutState({ bout: bout(), envelope: null, feed: "REFUSED", nowMs: NOW_FRESH });
  assert.equal(refused.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(refused.label, "Status unknown");

  // The feed answered and this bout is absent (how ESPN shows a replaced bout): said as an observation.
  const absent = deriveUfcBoutState({ bout: bout(), envelope: null, feed: "OK", nowMs: NOW_FRESH });
  assert.equal(absent.label, "Not in the live feed");
  assert.equal(absent.notInFeed, true);
  assert.equal(/cancel/i.test(absent.label), false, "an absence is never reported as a cancellation");

  // Live off: the page is a forecast page.
  assert.equal(deriveUfcBoutState({ bout: bout(), envelope: null, feed: "NOT_ASKED" }).label, "Scheduled");
});

test("UFC-ST 8 · ⚠ an envelope for DIFFERENT fighters under the same bout id is never attached", () => {
  const e = envOf(FIX.providerFinal);
  const swapped = { ...e, competitors: { fighters: [e.competitors.fighters[0], { ...e.competitors.fighters[1], athleteId: "9999999" }] } };
  assert.equal(envelopeMatchesBout(swapped, bout()), false);
  const v = deriveUfcBoutState({ bout: bout(), envelope: swapped, feed: "OK", nowMs: NOW_FRESH });
  assert.equal(v.identityMismatch, true);
  assert.equal(v.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(v.label, "Live feed lists different fighters");
  assert.equal(v.result, null, "another pairing's result is never shown against this pick");
  assert.equal(envelopeMatchesBout({ ...e, eventId: "401914473" }, bout()), false, "nor another bout id");
});

test("UFC-ST 9 · ⚠ no in-fight probability: the pregame pick passes through BY REFERENCE in every state", () => {
  const before = JSON.stringify(PREGAME);
  const envs = [envOf(FIX.pre), envOf(FIX.walkouts), envOf(FIX.inround), envOf(FIX.providerFinal), null];
  for (const settlement of [null, { winnerName: "Yazmin Jauregui", hit: true, asOf: null }]) {
    for (const envelope of envs) {
      const b = bout(settlement);
      const v = deriveUfcBoutState({ bout: b, envelope, feed: "OK", nowMs: NOW_FRESH });
      assert.equal(v.pregame, b.pregame, "the same object — not a copy, not a recomputation");
      const { pregame, ...rest } = v;
      const leaked = [...allKeys(rest)].filter((k) => PROBABILITY_KEY.test(k));
      assert.deepEqual(leaked, [], `state ${v.state} carries a probability-shaped field outside the frozen pick`);
    }
  }
  assert.equal(JSON.stringify(PREGAME), before, "the frozen pick is unchanged after every derivation");
  // And the module has no arithmetic on a probability anywhere.
  const src = codeOnly(read("src/lib/live/ufc-live.mjs"));
  assert.equal(/winChance\s*[*+\-/]|probability/i.test(src), false, "ufc-live.mjs never touches a probability");
});

/* ───────────────────────── 5 · the roster: frozen pick joined by bout id ───────────────────────── */

test("UFC-RO 1 · tonight's card → 12 bouts in card order, both portraits, 11 frozen picks, Frye–Harris unmodelled", () => {
  const r = buildUfcRosterFrom({ card: CARD, graded: null, etDate: CARD.event.slateDate });
  assert.equal(r.bouts.length, CARD.bouts.length);
  assert.deepEqual(r.bouts.map((b) => b.boutId), CARD.bouts.map((b) => String(b.boutId)), "the card's own order, main event first");
  assert.equal(r.bouts[0].position, "Main event");
  for (const b of r.bouts) {
    assert.ok(b.red.photoUrl && b.blue.photoUrl, `${b.boutId} carries both portraits`);
    assert.ok(b.red.athleteId && b.blue.athleteId, `${b.boutId} carries both ESPN athlete ids`);
    assert.equal(b.settlement, null);
  }
  const unmodelled = r.bouts.filter((b) => b.pregame === null);
  assert.equal(r.bouts.length - unmodelled.length, CARD.bouts.filter((b) => b.prediction && !b.unmodelledReason).length);
  for (const b of unmodelled) assert.ok(b.unmodelledReason, `${b.boutId} states why it has no pick`);
});

test("UFC-RO 2 · ⚠ every roster pick IS the frozen pre-card snapshot's pick, joined by bout id", () => {
  const r = buildUfcRosterFrom({ card: CARD, graded: null, etDate: CARD.event.slateDate });
  if (CARD.event.providerEventId !== "600061541") return; // the card has moved on; this pins tonight's record only
  const frozen = new Map(SNAPSHOT.rows.map((row) => [String(row.providerBoutId), row]));
  let joined = 0;
  for (const b of r.bouts) {
    const row = frozen.get(b.boutId);
    if (!b.pregame) {
      assert.equal(row, undefined, `${b.boutId} has no pick and no frozen row`);
      assert.ok(SNAPSHOT.skipped.some((s) => String(s.boutId) === b.boutId), "the snapshot records why it skipped it");
      continue;
    }
    assert.ok(row, `${b.boutId} has a frozen row`);
    assert.equal(b.pregame.pickName, row.pick);
    assert.equal(b.pregame.winChance, row.modelProbability);
    assert.equal(b.pregame.modelId, row.modelId);
    assert.equal(b.canonicalBoutKey, row.boutId, "the settlement key is the one the snapshot minted");
    assert.ok(b.pregame.pickAthleteId === b.red.athleteId || b.pregame.pickAthleteId === b.blue.athleteId);
    joined++;
  }
  assert.equal(joined, SNAPSHOT.rows.length, "every frozen row is on the roster");
  // The internal snapshot's market price never reaches the public roster.
  assert.equal(/marketProbability|impliedSum|books/.test(JSON.stringify(r)), false);
});

test("UFC-RO 3 · ⚠ tonight's REAL feed joins all 12 bouts by bout id AND both athlete ids", () => {
  const r = buildUfcRosterFrom({ card: CARD, graded: null, etDate: CARD.event.slateDate });
  if (CARD.event.providerEventId !== "600061541") return;
  const byId = Object.fromEntries(normalizeMmaEnvelopes(TONIGHT, "2026-10-10T18:40:20Z").map((e) => [e.eventId, e]));
  for (const b of r.bouts) assert.equal(envelopeMatchesBout(byId[b.boutId], b), true, `${b.boutId} joins the real feed`);
  const g = groupUfcBouts(r.bouts, byId, { feed: "OK", nowMs: Date.parse("2026-10-10T18:41:00Z") });
  assert.equal(g.UPCOMING.length, 12);
  assert.ok(g.UPCOMING.every(({ view }) => view.label === "Scheduled"));
});

test("UFC-RO 4 · a card for another day yields NO bouts (so no tab); a settlement attaches only to OUR pick", () => {
  assert.equal(buildUfcRosterFrom({ card: CARD, graded: null, etDate: "1999-01-01" }).bouts.length, 0);
  assert.equal(buildUfcRosterFrom({ card: null, graded: null, etDate: "2026-10-10" }).cardPresent, false);

  const date = CARD.event.slateDate;
  const roster = buildUfcRosterFrom({ card: CARD, graded: null, etDate: date });
  const b = roster.bouts.find((x) => x.pregame);
  const other = b.pregame.pickName === b.red.name ? b.blue.name : b.red.name;
  const graded = (predicted, market = "Fight winner") => ({
    generatedAt: "2026-10-11T13:00:00Z",
    picks: [{ eventId: b.canonicalBoutKey, when: date, market, predicted, actual: other, hit: false }],
  });
  const ok = buildUfcRosterFrom({ card: CARD, graded: graded(b.pregame.pickName), etDate: date }).bouts.find((x) => x.boutId === b.boutId);
  assert.deepEqual(ok.settlement, { winnerName: other, hit: false, asOf: "2026-10-11T13:00:00Z" });
  const wrongPick = buildUfcRosterFrom({ card: CARD, graded: graded(other), etDate: date }).bouts.find((x) => x.boutId === b.boutId);
  assert.equal(wrongPick.settlement, null, "a ledger row about a different pick is not our settlement");
  const wrongMarket = buildUfcRosterFrom({ card: CARD, graded: graded(b.pregame.pickName, "Method"), etDate: date }).bouts.find((x) => x.boutId === b.boutId);
  assert.equal(wrongMarket.settlement, null);
});

/* ───────────────────────── 6 · the hidden /live tab ───────────────────────── */

test("UFC-UI 1 · the client gate is closed by default and opens only when NEXT_PUBLIC_LIVE_SPORTS names ufc", async () => {
  const { liveReadyFor, liveSportEnabled } = await import("./client.ts");
  const saved = { en: process.env.NEXT_PUBLIC_LIVE_ENABLED, sp: process.env.NEXT_PUBLIC_LIVE_SPORTS };
  try {
    process.env.NEXT_PUBLIC_LIVE_ENABLED = "1";
    for (const v of [undefined, "", "mlb", "mlb,nfl", "ufc2"]) {
      if (v === undefined) delete process.env.NEXT_PUBLIC_LIVE_SPORTS; else process.env.NEXT_PUBLIC_LIVE_SPORTS = v;
      assert.equal(liveSportEnabled("ufc"), false, `NEXT_PUBLIC_LIVE_SPORTS=${v} must not open UFC`);
      assert.equal(liveReadyFor("ufc"), false);
    }
    process.env.NEXT_PUBLIC_LIVE_SPORTS = "mlb,nfl,ufc";
    assert.equal(liveSportEnabled("ufc"), true);
    assert.equal(liveReadyFor("ufc"), true);
    process.env.NEXT_PUBLIC_LIVE_ENABLED = "0";
    assert.equal(liveReadyFor("ufc"), false, "the master switch still outranks the allowlist");
  } finally {
    if (saved.en === undefined) delete process.env.NEXT_PUBLIC_LIVE_ENABLED; else process.env.NEXT_PUBLIC_LIVE_ENABLED = saved.en;
    if (saved.sp === undefined) delete process.env.NEXT_PUBLIC_LIVE_SPORTS; else process.env.NEXT_PUBLIC_LIVE_SPORTS = saved.sp;
  }
});

test("UFC-UI 2 · no tab when not enabled or with no roster — and a default build ships no UFC roster at all", () => {
  const page = read("src/app/live/page.tsx");
  assert.match(page, /const ufc = liveSportEnabled\("ufc"\) \? buildUfcHubRoster\(\) : null;/, "the roster is built only when this build enables UFC");
  const tabsEl = jsxElement(page, "LiveSportTabs");
  assert.ok(tabsEl && /ufc=\{ufc\}/.test(tabsEl), "the page passes that (possibly null) roster to the tabs");
  assert.match(page, /title: "Live · NFL and MLB scores/, "the metadata does not advertise UFC Live");

  const tabs = read("src/components/live/live-sport-tabs.tsx");
  assert.match(tabs, /const hasUfc = Boolean\(ufc && ufc\.bouts\.length > 0 && liveSportEnabled\("ufc"\)\);/);
  assert.match(tabs, /\.\.\.\(hasUfc \? \[\{ key: "UFC", label: "UFC" \}\] : \[\]\)/, "the tab exists only when hasUfc");
  assert.match(tabs, /const showUfc = \(active === "ALL" \|\| active === "UFC"\) && hasUfc;/);
  assert.ok(jsxElement(tabs, "UfcLiveHub"), "the hub is mounted — otherwise this guard is vacuous");
  assert.match(tabs, /\{showUfc && ufc \? \(/, "and mounted only behind showUfc");
});

test("UFC-UI 3 · the UFC hub asks once, in batch, for its own sport; no per-bout fetch, no timer announcements", () => {
  const hub = read("src/components/live/ufc-live-hub.tsx");
  const code = codeOnly(hub);
  assert.equal((code.match(/useLiveSlate\(/g) || []).length, 1, "exactly one slate hook on the hub");
  assert.match(hub, /= useLiveSlate\("ufc", scope\);/, "and it asks for UFC, scoped to the roster");
  assert.equal(/useLiveSlate\("(nfl|mlb)"/.test(hub), false);
  assert.equal(/\bfetch\s*\(/.test(code), false, "a card must not fetch");
  assert.equal(/useLiveEvent/.test(code), false);
  assert.equal(/aria-live/.test(code), false, "no scoreboard that re-announces itself");
  assert.match(hub, /<PlayerAvatar photoUrl=\{f\.photoUrl\}/, "fighters use the shared avatar with the card's portrait");
  assert.match(hub, /import \{ StateChip \} from "\.\/live-hub"/, "the shared Live chip, not a new design system");
});

const BANNED = [
  /\bon pace\b/i, /\bon track\b/i, /\blive win probability\b/i, /\bchance to hit\b/i, /\block\b(?!ed|s\b)/i,
  /\bsafe bet\b/i, /\bmodel (?:has )?(?:changed|updated)\b/i, /\bguaranteed\b/i,
  /\b(?:live|in-fight|updated) (?:odds|win chance|probability)\b/i, /\bwinning\b/i, /\bprojected\b/i,
];

test("UFC-UI 4 · no banned live phrase and no provider host in any UFC live source", () => {
  let scanned = 0;
  for (const rel of ["src/components/live/ufc-live-hub.tsx", "src/lib/live/ufc-live.mjs", "src/lib/live/ufc-hub-data.ts"]) {
    const body = read(rel);
    assert.ok(body.length > 400, `${rel} is real`);
    const copy = renderedStrings(body);
    scanned += copy.length;
    for (const rx of BANNED) assert.equal(rx.test(copy), false, `${rel} renders ${rx}`);
    assert.equal(/https?:\/\/(?:statsapi\.mlb\.com|site\.api\.espn\.com)/.test(body), false, `${rel} names a provider host`);
  }
  assert.ok(scanned > 800, "the scan read real rendered copy");
});

const render = (b, envelope, feed, nowMs) =>
  renderToStaticMarkup(React.createElement(UfcBoutCard, { bout: b, view: deriveUfcBoutState({ bout: b, envelope, feed, nowMs }) }));

test("UFC-UI 5 · RENDERED: every state says only what it knows", () => {
  const stale = render(bout(), envOf(FIX.inround, new Date(NOW_FRESH - 200_000).toISOString()), "REFUSED", NOW_FRESH);
  assert.match(stale, /Live · feed delayed/);
  assert.match(stale, /last confirmed R1 · 3:58/);
  assert.match(stale, /showing the last confirmed state from 200 sec ago/);

  const walk = render(bout(), envOf(FIX.walkouts), "OK", NOW_FRESH);
  assert.equal(/\bR0\b|\bR1\b/.test(walk), false, "walkouts render no round");
  assert.match(walk, /Scheduled/);

  const prov = render(bout(), envOf(FIX.providerFinal), "OK", NOW_FRESH);
  assert.match(prov, /ESPN reports Yazmin Jauregui won \(R1 · 1:02\)\. Official result pending — the pick is not graded yet\./);
  assert.match(prov, /Reported winner/);
  assert.match(prov, /Method of victory is not reported by the live feed\./);

  const canon = render(bout({ winnerName: "Yazmin Jauregui", hit: true, asOf: null }), envOf(FIX.providerFinal), "OK", NOW_FRESH);
  assert.match(canon, /Official result: Yazmin Jauregui won\./);
  assert.match(canon, /Pick correct/);

  for (const html of [stale, walk, prov]) {
    assert.equal(/Pick correct|Pick missed/.test(html), false, "no outcome before a settlement");
  }
  for (const html of [stale, walk, prov, canon]) {
    assert.match(html, /Yazmin Jauregui · 61% win chance/, "the frozen pick is on the card in every state");
    assert.equal((html.match(/\d+% /g) || []).every((m) => m === "61% "), true, "no other percentage appears");
  }
});
