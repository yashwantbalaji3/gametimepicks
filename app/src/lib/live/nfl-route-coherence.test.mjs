/**
 * CROSS-ROUTE LIVE COHERENCE FOR NFL (Phase E).
 *
 * Run: npx tsx --test src/lib/live/nfl-route-coherence.test.mjs
 *
 * THE INVARIANT
 *   Same canonical (event, player, family) + same live snapshot
 *   -> the same factual live stat, the same game state, the same frozen line and the same
 *      settlement state, on every public surface that shows it.
 *
 * The way that invariant dies is not usually a wrong number. It is a SECOND SOURCE: a route that
 * fetches live state for itself, or reads the batch artifact directly, or re-derives a line from a
 * board it happens to have. Then two surfaces are both "right" about different things and neither is
 * obviously broken. So most of what is pinned here is singularity — one owner, one path in — and the
 * numeric agreement is proven on top of it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { indexLiveProps, liveRowsFromEnvelope, presentPlayerBoardFamily, presentPlayerBoardRow } from "../prediction-presentation/nfl.ts";
import { codeOnly } from "./testing/source-scan.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/* Every file that renders, or could render, NFL live state on a public surface. */
const NFL_LIVE_SURFACES = ["src/components/nfl/player-board.tsx"];

/* Every route that renders NFL player predictions at all — whether or not it shows live state. */
const NFL_PREDICTION_ROUTES = [
  "src/app/nfl/game/[eventId]/page.tsx",
  "src/app/nfl/week/[key]/page.tsx",
  "src/app/nfl/page.tsx",
];

const ctx = {
  providerEventId: "401872953",
  kickoffUtc: "2026-09-27T17:00Z",
  teams: ["BUF", "LAC"],
  generatedAt: "2026-09-27T14:02:00Z",
  model: { id: "nfl-regular-season-public-v1", version: 2 },
  families: { player_reception_yds: { state: "PUBLISHED" }, player_receptions: { state: "PUBLISHED" } },
};
const player = (over = {}) => ({
  playerId: "nfl-athlete-4379399", name: "James Cook", team: "BUF", participation: "AVAILABLE",
  markets: {
    player_reception_yds: { median: 57, p10: 23, p90: 113, market: { line: 45.5, overOdds: -114, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-27T16:31:00Z" } },
    player_receptions: { median: 4, p10: 2, p90: 7, market: { line: 3.5, overOdds: -120, underOdds: -105, sportsbook: "draftkings", capturedAt: "2026-09-27T16:31:00Z" } },
  },
  ...over,
});

const envelope = (over = {}) => ({
  state: "LIVE",
  period: { number: 3, clock: "8:42" },
  competitors: { home: { score: 21 }, away: { score: 17 } },
  playerStats: [
    { playerId: "nfl-athlete-4379399", market: "player_reception_yds", value: 61 },
    { playerId: "nfl-athlete-4379399", market: "player_receptions", value: 5 },
  ],
  ...over,
});

/* ── ONE OWNER ─────────────────────────────────────────────────────────────────────────────────── */

test("⚠ EXACTLY ONE NFL LIVE OWNER — no surface fetches live state for itself", () => {
  for (const rel of NFL_LIVE_SURFACES) {
    const body = codeOnly(read(rel));
    assert.match(body, /useLiveEvent\(/, `${rel} must take live state from the single poller`);
    assert.equal(/\bfetch\(/.test(body), false, `${rel} must not fetch — the hook owns every request`);
    assert.equal(/EventSource|WebSocket|setInterval\s*\(/.test(body), false, `${rel} must not open a second loop`);
  }
});

test("⚠ NO ROUTE READS THE BATCH ARTIFACT AS A SECOND LIVE SOURCE", () => {
  /*
   * `public/data/nfl/live-props/<eventId>.json` is the producer's durable record and the input to the
   * settlement ledger. It is NOT a page input: it is rewritten on a cadence the page does not know,
   * and a surface reading it would show a different "now" from the surface reading the gateway.
   */
  for (const rel of [...NFL_LIVE_SURFACES, ...NFL_PREDICTION_ROUTES]) {
    const body = codeOnly(read(rel));
    assert.equal(body.includes("live-props/"), false, `${rel} must not read the batch artifact`);
    assert.equal(body.includes("prop-settlement"), false, `${rel} must not read the settlement ledger`);
  }
});

test("⚠ A LATER SPORTSBOOK LINE MAY NOT BE SUBSTITUTED FOR THE FROZEN ONE", () => {
  /*
   * The frozen block is the line and price a reader was actually shown before kickoff. A route that
   * re-read a current price and rendered it in the same slot would be answering a different question
   * — "what is the line now" — in the place where "what was the line" is being claimed.
   *
   * The presentation contract is the only thing that builds that slot, and it takes the market from
   * the row it was handed. No NFL surface may reach for a price by any other route.
   */
  for (const rel of [...NFL_LIVE_SURFACES, ...NFL_PREDICTION_ROUTES]) {
    const body = codeOnly(read(rel));
    assert.equal(/odds-api|the-odds-api|\/odds\/|oddsapi/i.test(body), false, `${rel} must not reach for a live price`);
    assert.equal(/nfl\/markets\//.test(body), false, `${rel} must not read the market artifact directly`);
  }
});

/* ── ONE ANSWER ────────────────────────────────────────────────────────────────────────────────── */

test("the same (event, player, family) and the same snapshot give the same answer, however it is reached", () => {
  const index = indexLiveProps({ rows: liveRowsFromEnvelope(envelope()) });

  // Route A: the row on its own. Route B: the row through the family-level renderer.
  const direct = presentPlayerBoardRow(ctx, player(), "player_reception_yds", index);
  const [viaFamily] = presentPlayerBoardFamily(ctx, [player()], "player_reception_yds", index);

  assert.deepEqual(direct, viaFamily, "two ways in, one answer");

  // And the answer is the snapshot's, not a derivation of it.
  assert.equal(direct.live.factual.statValue, 61);
  assert.equal(direct.live.factual.phase, "IN_PROGRESS");
  assert.equal(direct.live.factual.clock, "8:42");
  assert.equal(direct.live.factual.period, 3);
  assert.deepEqual(direct.live.factual.score, { home: 21, away: 17 });

  // The frozen half is the board's, untouched by anything live.
  assert.equal(direct.market.state, "FROZEN_CAPTURE");
  assert.equal(direct.market.frozen.line, 45.5);
  assert.equal(direct.market.frozen.sportsbook, "draftkings");
  assert.equal(direct.market.frozen.capturedAt, "2026-09-27T16:31:00Z", "the instant it was captured, before kickoff");
  assert.equal(direct.model.predictedValue, 57);
});

test("⚠ TWO FAMILIES OF ONE PLAYER DO NOT CROSS", () => {
  /*
   * The join key is `playerId|family`. Keying on the player alone would put his receptions where his
   * receiving yards belong — a wrong number that looks entirely plausible, which is the worst kind.
   */
  const index = indexLiveProps({ rows: liveRowsFromEnvelope(envelope()) });
  const yds = presentPlayerBoardRow(ctx, player(), "player_reception_yds", index);
  const rec = presentPlayerBoardRow(ctx, player(), "player_receptions", index);

  assert.equal(yds.live.factual.statValue, 61, "receiving yards");
  assert.equal(rec.live.factual.statValue, 5, "receptions — not 61");
  assert.notEqual(yds.market.frozen.line, rec.market.frozen.line, "and each keeps its own frozen line");
  assert.equal(yds.market.frozen.line, 45.5);
  assert.equal(rec.market.frozen.line, 3.5);
});

test("⚠ TWO PLAYERS DO NOT CROSS, AND AN ABSENT ONE STAYS ABSENT", () => {
  const index = indexLiveProps({
    rows: liveRowsFromEnvelope(envelope({
      playerStats: [{ playerId: "nfl-athlete-OTHER", market: "player_reception_yds", value: 999 }],
    })),
  });
  const r = presentPlayerBoardRow(ctx, player(), "player_reception_yds", index);
  assert.equal(r.live, undefined, "another player's stat is not this player's — and no slot is invented");
  assert.equal(r.market.frozen.line, 45.5, "the frozen half is unaffected by the absence of a live half");
});

test("finality cannot differ between surfaces — it travels on the row, not on the route", () => {
  const settled = indexLiveProps({
    rows: [{
      playerId: "nfl-athlete-4379399", family: "player_reception_yds",
      live: { phase: "FINAL", statValue: 61, clock: null, period: null, score: { home: 24, away: 20 } },
      settlement: { state: "SETTLED", finalStat: 61, line: 45.5, lineResult: "OVER", forecastResult: "WIN" },
    }],
  });
  const a = presentPlayerBoardRow(ctx, player(), "player_reception_yds", settled);
  const [b] = presentPlayerBoardFamily(ctx, [player()], "player_reception_yds", settled);
  assert.deepEqual(a.live, b.live, "one row, one settlement state");
  assert.equal(a.live.settlement.lineResult, "OVER");
  assert.equal(a.live.factual.phase, "FINAL");
});

test("⚠ A PRE SNAPSHOT PRODUCES NO LIVE SLOT ON ANY SURFACE", () => {
  /*
   * A pregame board must stay a pregame board. PRE carries no stat and no score by design, so the
   * adapter emits no row at all and the contract has nothing to fill the slot with.
   */
  for (const state of ["PRE", "POSTPONED", "CANCELLED", "UNKNOWN"]) {
    const index = indexLiveProps({ rows: liveRowsFromEnvelope(envelope({ state })) });
    const r = presentPlayerBoardRow(ctx, player(), "player_reception_yds", index);
    assert.equal(r.live, undefined, `${state} must not grow a live slot`);
    assert.equal(r.market.frozen.line, 45.5, `${state} still shows the frozen line`);
  }
});

test("a surface with NO live index renders the frozen row unchanged — live is additive, never required", () => {
  const withoutLive = presentPlayerBoardRow(ctx, player(), "player_reception_yds", undefined);
  const withEmpty = presentPlayerBoardRow(ctx, player(), "player_reception_yds", indexLiveProps({ rows: [] }));
  assert.deepEqual(withoutLive, withEmpty);
  assert.equal(withoutLive.live, undefined);
  assert.equal(withoutLive.market.frozen.line, 45.5);
  assert.equal(withoutLive.model.predictedValue, 57);
});

/* ── GAME-LEVEL LIVE TRACKING (Phase G) ────────────────────────────────────────────────────────── */

test("⚠ THE FROZEN WIN CHANCE IS A PREGAME NUMBER AND CANNOT MOVE WITH THE SCORE", () => {
  /*
   * The whole risk of putting a live score beside a forecast is that someone later makes the forecast
   * respond to it. A win probability that moved with the score would be a LIVE MODEL, and no live
   * model here has cleared any bar — a number that looks like a forecast is read as one however it is
   * labelled. So the panel's NFL forecast is a plain prop computed on the server from the committed
   * artifact, and nothing in the component may derive it from the envelope.
   */
  const panel = codeOnly(read("src/components/live/live-panel.tsx"));

  // The forecast region must not read the live envelope at all.
  const region = panel.slice(panel.indexOf("nflForecast ? ("), panel.indexOf(") : playerBoard ? ("));
  assert.ok(region.length > 100, "the NFL forecast region exists — otherwise this guard is vacuous");
  assert.equal(/envelope/.test(region), false, "the frozen region must not touch the live envelope");
  assert.equal(/score|statValue|period|clock/.test(region.replace(/winPct|projected/g, "")), false,
    "and must not derive anything from live state");

  // No live-model vocabulary anywhere in the panel.
  for (const banned of ["liveWinProbability", "updatedWinProbability", "inGameWinProb", "onTrack", "projectedFinish", "impliedFinish"]) {
    assert.equal(panel.includes(banned), false, `${banned} would be an unvalidated live model`);
  }
});

test("the NFL game page mounts the game-level panel WITHOUT the player board", () => {
  /*
   * The per-prop live lines are owned by the player board on the same page. Passing `playerBoard`
   * here too would render the same (player, family) twice on one page and give a reader two things to
   * reconcile — a coherence failure that is not a wrong number, which is the kind that survives.
   */
  /*
   * Read RAW here, not through `codeOnly`: it blanks string-literal contents, so `sport="nfl"` would
   * read as `sport=""` and the assertion would be about nothing. The mount block itself carries no
   * comments — the explanation sits above it — so slicing the raw source is safe.
   */
  const page = read("src/app/nfl/game/[eventId]/page.tsx");
  const mount = page.slice(page.indexOf("<LivePanel"), page.indexOf("/>", page.indexOf("<LivePanel")) + 2);
  assert.ok(mount.length > 80 && mount.length < 1200, `the mount block should be one element, got ${mount.length} chars`);
  assert.ok(mount.includes("sport=\"nfl\""), "it is the NFL panel");
  assert.ok(mount.includes("nflForecast"), "and it carries the frozen game forecast");
  assert.equal(mount.includes("playerBoard"), false, "it must NOT also render the prop rows");

  // The player board is still mounted separately — the prop rows have exactly one home.
  assert.match(page, /<NflPlayerBoard/, "the player board still owns the per-prop live lines");
});

test("the panel self-gates per sport, so NFL off costs nothing on this page", () => {
  const panel = codeOnly(read("src/components/live/live-panel.tsx"));
  assert.match(panel, /liveReadyFor\(\s*sport\s*\)/, "gated on the sport it was asked for, not on the master flag");
  assert.equal(/\bliveEnabled\(\)/.test(panel), false, "a sport-blind gate would render a panel the gateway then refuses");
});

test("⚠ THE PANEL'S OWN COPY FOLLOWS THE SPORT — 'first pitch' on a football page is a false statement", () => {
  /*
   * Caught on the Preview deployment, not in a test: the explanatory sentence was written when MLB
   * was the only sport that reached this panel, and Phase G mounted it on NFL pages. It read "the
   * GameTime forecast made before first pitch" above an ATL @ GB game. Small, and still a page
   * telling a reader something untrue about its own sport.
   */
  const panel = read("src/components/live/live-panel.tsx");
  const body = codeOnly(panel);
  assert.match(panel, /sport === "nfl" \? "kickoff" : "first pitch"/, "the word must follow the sport");

  // And no baseball noun may be hard-coded anywhere the NFL arm can reach.
  const nflArm = body.slice(body.indexOf("nflForecast ? ("), body.indexOf(") : playerBoard ? ("));
  for (const baseballism of ["first pitch", "inning", "runs", "pitcher"]) {
    assert.equal(nflArm.toLowerCase().includes(baseballism), false, `"${baseballism}" must not reach an NFL page`);
  }
});

test("⚠ A LIVE VALUE ONLY ATTACHES TO A PUBLISHED FAMILY — and the state is PER GAME", () => {
  /*
   * A row renders for PUBLISHED *and* ESTIMATE, because an estimate is a real number shown with the
   * bar it failed. A live stat beside it is a different claim: it invites the reader to compare an
   * actual against a forecast that did not clear — the comparison the ESTIMATE label exists to
   * withhold.
   *
   * ⚠ KEEPING `player_pass_yds` OUT AT THE GATEWAY IS NOT ENOUGH. That is a global decision, and the
   * state is per game: `player_rush_yds` is PUBLISHED on 32 committed boards and ESTIMATE on 16. The
   * same family is publishable in one game and not the next, so only a per-row check separates them.
   * Without it, a live rushing number would have appeared beside an estimate the first time a board
   * downgraded that family — and 16 of 48 boards do.
   */
  const index = indexLiveProps({ rows: liveRowsFromEnvelope(envelope()) });

  const published = presentPlayerBoardRow(
    { ...ctx, families: { player_reception_yds: { state: "PUBLISHED" } } },
    player(), "player_reception_yds", index,
  );
  assert.equal(published.live.factual.statValue, 61, "a PUBLISHED family carries its live value");

  for (const state of ["ESTIMATE", "WITHHELD", "PAUSED", undefined]) {
    const row = presentPlayerBoardRow(
      { ...ctx, families: { player_reception_yds: { state } } },
      player(), "player_reception_yds", index,
    );
    if (state === "ESTIMATE") {
      assert.ok(row, "an ESTIMATE row still RENDERS — the number is real and carries its caveat");
      assert.equal(row.live, undefined, "but it must not grow a live comparison");
      assert.equal(row.model.predictedValue, 57, "and the forecast itself is untouched");
    } else {
      assert.equal(row, null, `${state} does not render a row at all`);
    }
  }
});
