/**
 * THE LIVE SLOT ON A PUBLISHED ROW (Phase 5 · V1).
 *
 * One canonical live state feeds every surface. These pin the two ways that goes wrong: a pregame
 * board growing a live slot it should not have, and an inferred number arriving in one.
 *
 * Run: npx tsx --test src/lib/prediction-presentation/live-slot.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { indexLiveProps, liveRowsFromEnvelope, presentPlayerBoardRow } from "./nfl.ts";

const APP = process.cwd();
const ctx = {
  providerEventId: "401872953", kickoffUtc: "2026-09-27T17:00Z", teams: ["BUF", "LAC"],
  generatedAt: "2026-09-25T17:39:15Z", model: { id: "nfl-regular-season-public-v1", version: 2 },
  families: { player_reception_yds: { state: "PUBLISHED" } },
};
const player = {
  playerId: "nfl-athlete-4379399", name: "James Cook", team: "BUF", participation: "AVAILABLE_ROLE_UNCERTAIN",
  markets: { player_reception_yds: { median: 11, p10: 2, p90: 26, market: { line: 11.5, overOdds: -114, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-25T17:39:15Z" } } },
};
const liveArtifact = (live, settlement) => ({ rows: [{ playerId: player.playerId, family: "player_reception_yds", live, settlement }] });

test("⚠ THE INDEX IS KEYED EXPLICITLY — the two predictionIds are the same parts in a different order", () => {
  /* live artifact: event:player:family · presentation: family:player:event. Comparing them
     directly matches nothing, and a live panel that is simply always empty is the hardest kind of
     bug to notice — it looks exactly like a quiet night. */
  const idx = indexLiveProps(liveArtifact({ phase: "IN_PROGRESS", statValue: 18, clock: "8:42", period: 3, score: { home: 21, away: 17 } }, null));
  assert.equal(idx.size, 1);
  assert.ok(idx.get(`${player.playerId}|player_reception_yds`), "keyed by the two parts that identify the row");
});

test("a PREGAME row gets NO live slot at all", () => {
  const pre = indexLiveProps(liveArtifact({ phase: "PRE", statValue: null, clock: null, period: null, score: null }, { state: "PENDING" }));
  const row = presentPlayerBoardRow(ctx, player, "player_reception_yds", pre);
  assert.ok(row, "the row itself still renders");
  assert.equal(row.live, undefined, "PRE carries no observation, so it carries no slot — a pregame board stays a pregame board");
});

test("a board with no live artifact is untouched", () => {
  const row = presentPlayerBoardRow(ctx, player, "player_reception_yds", undefined);
  assert.equal(row.live, undefined);
  assert.equal(row.market.state, "FROZEN_CAPTURE", "and the frozen market is unaffected either way");
});

test("an IN_PROGRESS row carries the facts, and the frozen block is unchanged beside it", () => {
  const idx = indexLiveProps(liveArtifact({ phase: "IN_PROGRESS", statValue: 18, clock: "8:42", period: 3, score: { home: 21, away: 17 } }, { state: "PENDING" }));
  const row = presentPlayerBoardRow(ctx, player, "player_reception_yds", idx);
  assert.equal(row.live.factual.statValue, 18);
  assert.equal(row.live.factual.period, 3);
  assert.equal(row.live.settlement, undefined, "PENDING is not a settlement and must not render as one");
  assert.equal(row.market.frozen.line, 11.5, "the frozen line is untouched by the live join");
  assert.equal(row.model.predictedValue, 11, "and so is the pregame projection");
});

test("a SETTLED row carries the result; NO_MEASUREMENT carries no grade", () => {
  const settled = indexLiveProps(liveArtifact({ phase: "FINAL", statValue: 34, clock: null, period: null, score: { home: 27, away: 24 } },
    { state: "SETTLED", finalStat: 34, line: 11.5, lineResult: "OVER", forecastResult: "WIN" }));
  const a = presentPlayerBoardRow(ctx, player, "player_reception_yds", settled);
  assert.equal(a.live.settlement.lineResult, "OVER");
  assert.equal(a.live.settlement.forecastResult, "WIN");

  const none = indexLiveProps(liveArtifact({ phase: "FINAL", statValue: null, clock: null, period: null, score: { home: 27, away: 24 } },
    { state: "NO_MEASUREMENT", finalStat: null, line: 11.5, lineResult: null, forecastResult: null }));
  const b = presentPlayerBoardRow(ctx, player, "player_reception_yds", none);
  assert.equal(b.live.settlement.lineResult, null, "⚠ never UNDER because he has no stat");
  assert.equal(b.live.settlement.forecastResult, null);
});

test("⚠ NO INFERRED LIVE NUMBER REACHES THE RENDERER", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/prediction/prediction-board.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const banned of ["onTrack", "projectedFinish", "liveProbability", "impliedFinish", "remainingOpportunity", "pace"]) {
    assert.ok(!src.includes(banned), `${banned} is an unvalidated live model — V1 shows facts and lets the reader compare them`);
  }
  /* And the live line must not invent a value where the artifact has none. */
  assert.match(src, /\(settled \? s\?\.finalStat : f\?\.statValue\) \?\? "—"/,
    "an absent stat renders as a dash, never as 0");
});

test("the live line spans the row rather than adding a column", () => {
  /* ⚠ This grid has four template variants that must each agree with the DOM; a sixth column would
     make it eight, for a cell absent on every pregame board. */
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  assert.match(css, /\.gtp-pred-live\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/, "the live line spans whichever template is in force");
  const tsx = fs.readFileSync(path.join(APP, "src/components/prediction/prediction-board.tsx"), "utf8");
  const head = /<div className="gtp-pred-head"[\s\S]*?<\/div>/.exec(tsx);
  assert.ok(head && !/Live/.test(head[0]), "no Live header cell — that would imply a column the templates do not have");
});

/* ── AND THE SLOT MUST BE REACHABLE (Phase B · 2026-09-25) ─────────────────────────────────────── */

test("⚠ THE BOARD MUST ACTUALLY PASS A LIVE INDEX — the adapter accepted one and nobody supplied it", () => {
  /*
   * THE DEFECT THESE TESTS COULD NOT SEE. Every assertion above hands `presentPlayerBoardRow` a
   * synthetic artifact, so they proved the JOIN worked for the whole of Phase 5 while the only real
   * caller — `components/nfl/player-board.tsx` — called `presentPlayerBoardFamily(ctx, rows, family)`
   * with the fourth argument omitted. `liveIndex` was `undefined` on every page, every lookup missed,
   * and the live slot could not appear anywhere. An empty live panel looks exactly like a quiet night.
   *
   * Source-read on purpose, and narrowly: the wiring is a fact about a React component's arguments,
   * and there is no rendered NFL player board in the export to exercise (the live half is
   * client-fetched and the flag is off in this build), so a behavioural test here would assert
   * nothing. It reads the CALL, not the formatting around it.
   */
  const src = fs.readFileSync(path.join(APP, "src/components/nfl/player-board.tsx"), "utf8");

  const call = /presentPlayerBoardFamily\(([^)]*)\)/.exec(src);
  assert.ok(call, "the board still renders through presentPlayerBoardFamily");
  const args = call[1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.equal(args.length, 4, `the live index is the 4th argument and must be passed — saw (${call[1]})`);
  assert.match(args[3], /liveIndex/, "and it must be the live index, not some other value");

  // The index has to come from the canonical gateway envelope, through the one polling loop.
  assert.match(src, /useLiveEvent\(\s*"nfl"/, "the live half comes from the gateway's single poller");
  assert.match(src, /liveRowsFromEnvelope\(live\.envelope\)/, "and is adapted from its envelope");

  // A second poller, or a read of the producer's committed artifact from the component, would be a
  // competing source of truth for the same fact.
  assert.ok(!/fetch\(/.test(src), "the board never fetches directly — the hook owns every request");
  assert.ok(!src.includes("live-props/"), "and never reads the batch artifact as a second live source");
});

test("the envelope adapter speaks ONE phase vocabulary, and refuses states it cannot express", () => {
  const env = (state, over = {}) => ({
    state,
    period: { number: 3, clock: "8:42" },
    competitors: { home: { score: 17 }, away: { score: 21 } },
    playerStats: [{ playerId: "nfl-athlete-4379399", market: "player_reception_yds", value: 163 }],
    ...over,
  });

  // The gateway says LIVE / DELAYED; the row type says IN_PROGRESS. One field, one vocabulary.
  for (const s of ["LIVE", "DELAYED"]) {
    const [row] = liveRowsFromEnvelope(env(s));
    assert.equal(row.live.phase, "IN_PROGRESS", `${s} is in play`);
    assert.equal(row.live.statValue, 163);
    assert.equal(row.live.clock, "8:42");
    assert.equal(row.live.period, 3);
    assert.deepEqual(row.live.score, { home: 17, away: 21 });
  }

  // FINAL keeps the stat and the score and drops the clock — "0:00" reads as a live clock.
  const [fin] = liveRowsFromEnvelope(env("FINAL"));
  assert.equal(fin.live.phase, "FINAL");
  assert.equal(fin.live.statValue, 163);
  assert.equal(fin.live.clock, null, "a finished game has no clock");
  assert.equal(fin.live.period, null);

  // A state we cannot express as a factual observation yields NO ROW rather than a chosen phase.
  for (const s of ["PRE", "POSTPONED", "CANCELLED", "UNKNOWN", "", null, undefined]) {
    assert.deepEqual(liveRowsFromEnvelope(env(s)), [], `${String(s)} must not produce a live row`);
  }
  assert.deepEqual(liveRowsFromEnvelope(null), [], "and neither does no envelope at all");
});

test("⚠ the adapter never turns an absence into a number", () => {
  const base = { state: "LIVE", period: { number: 2, clock: "1:00" }, competitors: { home: { score: 7 }, away: { score: 3 } } };

  // A null stat stays null. This is the value that becomes a settled UNDER if it is allowed to be 0.
  const [nul] = liveRowsFromEnvelope({ ...base, playerStats: [{ playerId: "nfl-athlete-1", market: "player_rush_yds", value: null }] });
  assert.equal(nul.live.statValue, null, "no measurement is not zero");

  // A measured zero survives, because it IS a result.
  const [zero] = liveRowsFromEnvelope({ ...base, playerStats: [{ playerId: "nfl-athlete-1", market: "player_rush_yds", value: 0 }] });
  assert.equal(zero.live.statValue, 0, "a measured zero is a result and must not be discarded");

  // Half a score is not a score.
  const [half] = liveRowsFromEnvelope({ ...base, competitors: { home: { score: 7 }, away: { score: null } }, playerStats: [{ playerId: "nfl-athlete-1", market: "player_rush_yds", value: 5 }] });
  assert.equal(half.live.score, null, "'7 - null' is not a scoreline");

  // A player the gateway could not identify cannot be joined, so it contributes no row.
  assert.deepEqual(
    liveRowsFromEnvelope({ ...base, playerStats: [{ playerId: null, market: "player_rush_yds", value: 40 }] }), [],
    "an unjoinable stat has nothing to say on a prop line",
  );
  assert.deepEqual(
    liveRowsFromEnvelope({ ...base, playerStats: [{ playerId: "nfl-athlete-1", market: null, value: 40 }] }), [],
    "and neither does a stat with no family",
  );
});

test("the gateway maps only PUBLISHED families, and does not fake anytime touchdown", () => {
  const adapter = fs.readFileSync(path.join(APP, "src/lib/live/adapters/espn-nfl.mjs"), "utf8");
  /*
   * Verified against event 401872948 (ATL @ GB): the box score's groups are passing / rushing /
   * receiving / fumbles / defensive / interceptions / kickReturns / puntReturns / kicking / punting.
   */
  for (const [key, family] of [
    ['"receiving:YDS"', "player_reception_yds"],
    ['"receiving:REC"', "player_receptions"],
    ['"rushing:YDS"', "player_rush_yds"],
  ]) {
    assert.match(adapter, new RegExp(`${key}:\\s*"${family}"`), `${key} must map to ${family}`);
  }
  /*
   * ⚠ AND PASSING YARDS MUST STAY OUT. The column is right there and trivially mappable; mapping it
   * was tried in this very change and `adapters.test.mjs` NFL 8 caught it. `player_pass_yds` is an
   * ESTIMATE family and P318 is STOP, so there is no published range for a live value to sit against.
   */
  assert.ok(!adapter.replace(/\/\*[\s\S]*?\*\//g, " ").includes("player_pass_yds"),
    "an ESTIMATE family must not reach the live view — P318 is STOP");
  /*
   * ATD MUST STAY ABSENT UNTIL A FEED NAMES THE SCORER BY ID. Touchdowns are spread across six
   * columns, `defensive:TD` and `interceptions:TD` both count a pick-six, and `passing:TD` is TDs
   * thrown. `scoringPlays[].athletesInvolved` is empty on the real payload, so the exact fix is not
   * available without name matching. A single mapped TD column would be a wrong count, quietly.
   */
  const body = adapter.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.ok(!/:TD"\s*:/.test(body), "no TD column is mapped — the count would be wrong and unattributable");
  assert.ok(!body.includes("player_anytime_td"), "ATD is not served from box-score columns");
});
