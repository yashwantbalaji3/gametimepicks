/**
 * LiveTrackedForecast — the five meanings of "no value", kept apart (v1.8 · L1, INTERNAL).
 *
 * `joinNflPlayerBoard` returns `value: null` for five different situations. This suite pins that each
 * now has its own state, and pins the three invariants that make live tracking safe to build on at all:
 * a live value never reaches a forecast artifact, a provider FINAL never settles, and an untrackable
 * market produces no row rather than an empty one.
 *
 * Run: cd app && npx tsx --test src/lib/live/tracked-forecast.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildLiveTrackedForecasts, marketIsTrackable, TRACKING_STATES as S } from "./tracked-forecast.mjs";
import { makeEnvelope, makeCompetitor } from "./contract.mjs";

const NOW = Date.parse("2026-09-25T01:30:00Z");

/** A board whose three families are PUBLISHED, plus one that is not. */
const board = {
  providerEventId: "401872948",
  generatedAt: "2026-09-22T23:30:30Z",
  families: {
    player_rush_yds: { state: "PUBLISHED", label: "Rushing yards" },
    player_reception_yds: { state: "PUBLISHED", label: "Receiving yards" },
    player_receptions: { state: "PUBLISHED", label: "Receptions" },
    player_pass_yds: { state: "ESTIMATE", label: "Passing yards" },
    anytime_td: { state: "HOLDING", label: "Anytime TD" },
  },
};

const envelope = (state, { fetchedAt = "2026-09-25T01:29:40Z", period = 4, clock = "8:42" } = {}) =>
  makeEnvelope({
    eventId: "401872948", sport: "NFL", provider: "espn-nfl", providerEventId: "401872948",
    state, fetchedAt, period,
    situation: { displayClock: clock },
    competitors: [makeCompetitor({ abbr: "ATL", score: 17 }), makeCompetitor({ abbr: "GB", score: 20 })],
  });

const row = (over = {}) => ({
  playerId: "nfl-athlete-4430807", name: "Bijan Robinson", team: "ATL",
  market: "player_rush_yds", label: "Rushing yards", modelState: "PUBLISHED",
  median: 63.7, rangeLow: 18.9, rangeHigh: 153.2, value: null, position: null, ...over,
});

const build = (q) => buildLiveTrackedForecasts({ board, nowMs: NOW, ...q });

/* ── the five meanings of null ─────────────────────────────────────────────────────────────────── */

test("a live value is TRACKING, and carries the game clock with it", () => {
  const { rows, gameState } = build({ envelope: envelope("LIVE"), joined: [row({ value: 68, position: "INSIDE" })] });
  assert.equal(gameState, "LIVE");
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.trackingState, S.TRACKING);
  assert.equal(r.currentValue, 68);
  assert.equal(r.position, "INSIDE");
  assert.equal(r.period, 4);
  assert.equal(r.clock, "8:42");
  assert.equal(r.forecastId, "401872948:nfl-athlete-4430807:player_rush_yds");
});

test("before kickoff, absence is AWAITING_KICKOFF — not a zero and not a missing stat", () => {
  const { rows } = build({ envelope: envelope("PRE"), joined: [row()] });
  assert.equal(rows[0].trackingState, S.AWAITING_KICKOFF);
  assert.equal(rows[0].currentValue, null, "null, never 0 — the game has not happened");
});

test("in play with nothing recorded is NO_STAT_YET — the distinction the product exists to respect", () => {
  const { rows } = build({ envelope: envelope("LIVE"), joined: [row({ value: null })] });
  assert.equal(rows[0].trackingState, S.NO_STAT_YET);
  assert.equal(rows[0].currentValue, null, '"has not recorded a carry" is not "recorded 0"');
});

test("a RECORDED zero is a zero, and still TRACKING", () => {
  /* The other half of the rule. If the feed states 0, that is a fact and must survive. */
  const { rows } = build({ envelope: envelope("LIVE"), joined: [row({ value: 0, position: "BELOW" })] });
  assert.equal(rows[0].trackingState, S.TRACKING);
  assert.equal(rows[0].currentValue, 0);
});

test("a forecast with no canonical id is IDENTITY_UNRESOLVED, whatever the game is doing", () => {
  const { rows } = build({ envelope: envelope("LIVE"), joined: [row({ playerId: null, value: 68 })] });
  assert.equal(rows[0].trackingState, S.IDENTITY_UNRESOLVED);
  assert.equal(rows[0].currentValue, null, "an unidentified forecast must never borrow another player's number");
  assert.equal(rows[0].entityId, null);
});

test("an in-play envelope older than the live window is SOURCE_STALE, and says so beside the value", () => {
  const stale = envelope("LIVE", { fetchedAt: "2026-09-25T01:25:00Z" }); // 5 min old
  const { rows } = build({ envelope: stale, joined: [row({ value: 68 })] });
  assert.equal(rows[0].trackingState, S.SOURCE_STALE);
  assert.equal(rows[0].freshness, "STALE");
  assert.equal(rows[0].currentValue, 68, "the observation was real; staleness is about recency, not truth");
});

test("a postponed game is GAME_NOT_TRACKABLE — nothing will arrive", () => {
  const { rows, gameState } = build({ envelope: envelope("POSTPONED"), joined: [row({ value: 68 })] });
  assert.equal(gameState, "POSTPONED");
  assert.equal(rows[0].trackingState, S.GAME_NOT_TRACKABLE);
  assert.equal(rows[0].currentValue, null);
});

/* ── the three invariants ──────────────────────────────────────────────────────────────────────── */

test("INVARIANT · a provider FINAL never settles — it is FINAL_PENDING_SETTLEMENT", () => {
  const { rows, gameState } = build({ envelope: envelope("FINAL"), joined: [row({ value: 91 })] });
  assert.equal(gameState, "FINAL_PENDING_SETTLEMENT", "the provider saw a final; settlement has not spoken");
  assert.equal(rows[0].settlementStatus, null, "settlement owns this field and this module never fills it");
  assert.equal(rows[0].finalValue, null);
  // POSITIVE CONTROL: with a real settlement present, the state does change — so the above is not just inertia.
  const settled = build({ envelope: envelope("FINAL"), joined: [row({ value: 91 })], settlement: { graded: true } });
  assert.equal(settled.gameState, "SETTLED");
});

test("INVARIANT · an untrackable market produces NO ROW, not an empty one", () => {
  const joined = [
    row({ market: "player_pass_yds", label: "Passing yards" }),   // ESTIMATE
    row({ market: "anytime_td", label: "Anytime TD" }),           // HOLDING
    row({ market: "player_tackles" }),                            // not mapped at all
    row({ market: "player_rush_yds", value: 68 }),                // PUBLISHED
  ];
  const { rows } = build({ envelope: envelope("LIVE"), joined });
  assert.deepEqual(rows.map((r) => r.market), ["player_rush_yds"],
    "a live number beside an ESTIMATE or HOLDING market would read as the market quietly returning");
  assert.equal(marketIsTrackable(board, "player_pass_yds"), false);
  assert.equal(marketIsTrackable(board, "player_rush_yds"), true, "positive control: a PUBLISHED family IS trackable");
});

test("INVARIANT · the module exposes nothing that could write to a forecast", () => {
  /* Rule A kept by absence, the same way forecast-join.mjs keeps it. A grep is the honest check here:
     there is no writer to call, so no discipline is required to avoid calling one. */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/live/tracked-forecast.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /writeFile|appendFile|mkdir|rmSync|fetch\(/, "no IO of any kind belongs on this path");
  assert.match(src, /writes/, "positive control: the phrase appears in the prose, so stripping is what makes the check meaningful");
});

test("no probability, pace or projection is derived anywhere", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/live/tracked-forecast.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const banned of [/onTrack/i, /\bpace\b/i, /probabilit/i, /expectedRemaining/i, /liveEv\b/i]) {
    assert.doesNotMatch(code, banned, `${banned} must not appear in executable code`);
  }
  const { rows } = build({ envelope: envelope("LIVE"), joined: [row({ value: 68, position: "INSIDE" })] });
  assert.deepEqual(
    Object.keys(rows[0]).filter((k) => /prob|pace|track$|expect/i.test(k)), [],
    "no field may imply a forecast of the outcome",
  );
});

test("counts summarise the slate without hiding any state", () => {
  const { counts } = build({
    envelope: envelope("LIVE"),
    joined: [row({ value: 68 }), row({ market: "player_receptions", value: null }), row({ playerId: null })],
  });
  assert.deepEqual(counts, { [S.TRACKING]: 1, [S.NO_STAT_YET]: 1, [S.IDENTITY_UNRESOLVED]: 1 });
});
