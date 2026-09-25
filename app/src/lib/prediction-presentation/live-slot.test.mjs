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
import { indexLiveProps, presentPlayerBoardRow } from "./nfl.ts";

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
