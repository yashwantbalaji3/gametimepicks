/**
 * The NFL adapter over the sport-neutral contract (§6, §7).
 *
 * Synthetic boards, deliberately: a real Sunday board is a LIVE artifact and pinning one as a
 * fixture is how a test starts passing for a reason that has nothing to do with the code. The real
 * board is what the adapter was MEASURED against; these are what keep it honest afterwards.
 *
 * Run: cd app && npx tsx --test src/lib/live/adapters/nfl-tracked.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MEASUREMENT_STATES as M, RAIL_STATE as R, MARKET_KIND, FINALITY,
  railStateOf, isResultState, buildTrackedPredictions,
} from "../tracked-prediction.mjs";
import {
  nflTrackedRows, frozenSideOf, nflMarketKind,
  LIVE_MEASURABLE_NFL_MARKETS, PUBLISHED_NOT_LIVE_MEASURABLE,
} from "./nfl-tracked.mjs";
import { joinNflPlayerBoard } from "../forecast-join.mjs";

const KICK = "2026-09-27T20:25:00Z";

/** A board shaped exactly like the committed artifact — `players[].markets[family]`. */
const board = (o = {}) => ({
  providerEventId: "401872960", matchup: "BAL @ DAL", kickoffUtc: KICK,
  generatedAt: "2026-09-26T16:50:00Z",
  families: {
    player_reception_yds: { label: "Receiving yards", state: "PUBLISHED" },
    player_rush_yds: { label: "Rushing yards", state: "PUBLISHED" },
    player_receptions: { label: "Receptions", state: "PUBLISHED" },
    anytime_td: { label: "Anytime touchdown", state: "PUBLISHED" },
    player_pass_yds: { label: "Passing yards", state: "ESTIMATE" },
  },
  players: [{
    playerId: "nfl-athlete-3043078", name: "Derrick Henry", team: "BAL",
    markets: {
      player_reception_yds: {
        mean: 14.7, p10: 0, median: 9.73, p90: 37.31,
        market: { line: 9.5, overOdds: -113, underOdds: -111, sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z" },
      },
      anytime_td: { probability: 0.7516, market: { yesOdds: -255, sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z" } },
      player_pass_yds: { median: 250, p10: 180, p90: 320 },
    },
  }],
  ...o,
});

const rowsFor = (b, envelope = null, nowMs = Date.parse("2026-09-26T19:00:00Z")) =>
  nflTrackedRows({ board: b, envelope, joined: joinNflPlayerBoard(b, []).rows, settlement: null, nowMs });

test("§5.1 · the frozen sportsbook block survives — line, BOTH prices, book and capture instant", () => {
  /*
   * ⚠ THE DEFECT THIS PINS, measured on board 401872960 on 2026-09-26. `joinNflPlayerBoard`
   * projects a forecast down to rangeLow/rangeHigh/position, and `tracked-forecast.mjs` then reads
   * `j.median`, which the join does not emit — so all 34 rows carried `frozenProjection: null`
   * while a real DraftKings line sat in the artifact, unread. §5.1 requires both.
   */
  const f = frozenSideOf(board(), board().players[0], "player_reception_yds");
  assert.equal(f.modelPrediction, 9.73, "the model's median must reach the row");
  assert.deepEqual(f.modelRange, { low: 0, high: 37.31 });
  assert.equal(f.line, 9.5);
  assert.equal(f.sportsbook, "draftkings");
  assert.equal(f.overPrice, -113);
  assert.equal(f.underPrice, -111);
  assert.equal(f.capturedAt, "2026-09-26T16:49:46Z");
  assert.ok(Date.parse(f.capturedAt) < Date.parse(KICK), "the capture must be provable as pre-kickoff");
});

test("§3 · capturedAt comes from the MARKET block, never borrowed from the board's own timestamp", () => {
  /* A board `generatedAt` is when we wrote a file. Presenting it as when a price was observed is a
     provenance claim we cannot support. No market block ⇒ no capture instant. */
  const b = board();
  b.players[0].markets.player_receptions = { median: 4, p10: 2, p90: 7 }; // published family, no market block
  const f = frozenSideOf(b, b.players[0], "player_receptions");
  assert.equal(f.line, null);
  assert.equal(f.sportsbook, null);
  assert.equal(f.capturedAt, null, "a missing price may not inherit the board's write time");
});

test("§7 · three families are live-measurable; anytime_td is published and is not", () => {
  assert.deepEqual([...LIVE_MEASURABLE_NFL_MARKETS].sort(),
    ["player_reception_yds", "player_receptions", "player_rush_yds"]);
  assert.deepEqual(Object.keys(PUBLISHED_NOT_LIVE_MEASURABLE), ["anytime_td"]);
  assert.equal(nflMarketKind("anytime_td"), MARKET_KIND.BINARY);
  assert.equal(nflMarketKind("player_rush_yds"), MARKET_KIND.ADDITIVE);
});

test("anytime_td is PRESENT and labelled NOT_LIVE_TRACKABLE — not dropped, and never a zero", () => {
  const rows = rowsFor(board());
  const td = rows.find((r) => r.marketFamily === "anytime_td");
  assert.ok(td, "a published prediction a reader is following must not vanish from the card");
  assert.equal(td.live.measurementState, M.MARKET_UNSUPPORTED);
  assert.equal(td.live.currentValue, null, "'no feed can see this' must never render as 'he has not scored'");
  assert.equal(railStateOf(td), R.NOT_LIVE_TRACKABLE);
  assert.notEqual(railStateOf(td), R.NOT_YET_RECORDED);
  assert.notEqual(railStateOf(td), R.PRE, "a PRE badge would promise a live number that never arrives");
  // Its frozen side is still fully real.
  assert.equal(td.pregame.modelProbability, 0.7516);
  assert.equal(td.pregame.overPrice, -255);
});

test("an ESTIMATE family contributes NO row at all — the other kind of refusal", () => {
  const rows = rowsFor(board());
  assert.equal(rows.some((r) => r.marketFamily === "player_pass_yds"), false,
    "a rejected model beside a live number reads as the market returning");
});

test("a published family whose state drops below PUBLISHED stops emitting its unmeasurable row", () => {
  const b = board();
  b.families.anytime_td = { label: "Anytime touchdown", state: "ESTIMATE" };
  assert.equal(rowsFor(b).some((r) => r.marketFamily === "anytime_td"), false);
});

test("before kickoff every live-measurable row is PRE with provable frozen provenance", () => {
  const rows = rowsFor(board()).filter((r) => r.marketFamily !== "anytime_td");
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.live.measurementState, M.AWAITING_EVENT);
    assert.equal(r.live.currentValue, null);
    assert.equal(railStateOf(r), R.PRE);
    assert.equal(isResultState(railStateOf(r)), false);
  }
});

test("§6 · the adapter is reachable through the registry, not only by direct import", () => {
  const out = buildTrackedPredictions("nfl", {
    board: board(), envelope: null, joined: joinNflPlayerBoard(board(), []).rows,
    settlement: null, nowMs: Date.parse("2026-09-26T19:00:00Z"),
  });
  assert.equal(out.refused, null);
  assert.ok(out.rows.length > 0);
  assert.equal(out.counts[M.MARKET_UNSUPPORTED], 1);
});

test("a provider FINAL does not settle an NFL row", () => {
  const rows = rowsFor(board());
  for (const r of rows) {
    assert.notEqual(r.final.finality, FINALITY.FINAL_CANONICAL);
    assert.equal(isResultState(railStateOf(r)), false);
  }
});
