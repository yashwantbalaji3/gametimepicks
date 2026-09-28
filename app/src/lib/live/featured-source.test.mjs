/**
 * The two selection sources must agree, or membership would change at kickoff.
 *
 * Before any capture a card selects from rows derived from the frozen board; after the first capture
 * it selects from the live-props record. Proved against the PRODUCER'S OWN FUNCTION (`buildLiveRows`)
 * on a synthetic board, so the guard does not depend on which games tonight's slate happens to hold.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildLiveRows } from "../sports/nfl/live-prop-state.mjs";
import { featuredForecasts } from "./featured-forecasts.mjs";
import { featuredRowsFromBoard, featuredSelectionRows } from "./featured-source.mjs";

const EID = "900000001";
const vol = (median, line) => ({ mean: median + 2, p10: median / 3, median, p90: median * 2, market: { line, overOdds: -110, underOdds: -110, sportsbook: "draftkings", capturedAt: "2026-10-04T15:00:00Z" } });
const td = (probability) => ({ probability, market: { sportsbook: "draftkings", capturedAt: "2026-10-04T15:00:00Z" } });

/* Board order puts running backs first — the order that starved receptions and touchdowns in V2A. */
const BOARD = {
  providerEventId: EID, generatedAt: "2026-10-04T14:00:00Z", kickoffUtc: "2026-10-04T17:00:00Z",
  families: {
    player_rush_yds: { state: "PUBLISHED" }, player_reception_yds: { state: "PUBLISHED" },
    player_receptions: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" }, player_pass_yds: { state: "ESTIMATE" },
  },
  players: [
    { playerId: "nfl-athlete-1", name: "RB One", team: "AAA", markets: { player_rush_yds: vol(70, 65.5), player_reception_yds: vol(20, 18.5), player_receptions: vol(3, 2.5), anytime_td: td(0.55) } },
    { playerId: "nfl-athlete-2", name: "RB Two", team: "BBB", markets: { player_rush_yds: vol(60, 58.5), player_reception_yds: vol(15, 14.5), player_receptions: vol(2, 2.5), anytime_td: td(0.48) } },
    { playerId: "nfl-athlete-3", name: "WR One", team: "AAA", markets: { player_reception_yds: vol(80, 74.5), player_receptions: vol(6, 5.5), anytime_td: td(0.4) } },
    { playerId: "nfl-athlete-4", name: "QB One", team: "BBB", markets: { player_pass_yds: vol(240, 235.5), player_rush_yds: vol(20, 18.5), anytime_td: td(0.2) } },
    { playerId: "not-an-espn-id", name: "Unmappable", team: "AAA", markets: { player_rush_yds: vol(10, 9.5) } },
    { playerId: "nfl-athlete-5", name: "TE One", team: "BBB", markets: { player_reception_yds: vol(40, 38.5), player_receptions: vol(4, 3.5), anytime_td: td(0.3) } },
  ],
};

const produced = () => buildLiveRows({ providerEventId: EID, kickoffUtc: BOARD.kickoffUtc, board: BOARD, summary: null, prior: null, observedAt: "2026-10-04T16:00:00Z" }).rows;

test("board-derived rows are the rows the producer first freezes — same ids, same order", () => {
  const fromBoard = featuredRowsFromBoard(BOARD, EID);
  const fromProducer = produced();
  assert.ok(fromProducer.length > 10, "anti-vacuity: the producer must have built rows");
  assert.deepEqual(fromBoard.map((r) => r.predictionId), fromProducer.map((r) => r.predictionId));
  assert.deepEqual(fromBoard.map((r) => r.familyState), fromProducer.map((r) => r.familyState));
  /* The frozen claim the selector reads is identical, field for field. */
  for (let i = 0; i < fromBoard.length; i += 1) {
    assert.deepEqual(fromBoard[i].frozen.projection, fromProducer[i].frozen.projection, fromBoard[i].predictionId);
    assert.deepEqual(fromBoard[i].frozen.market, fromProducer[i].frozen.market, fromBoard[i].predictionId);
  }
});

test("🔴 the featured five are identical before and after the first capture", () => {
  const pre = featuredForecasts({ rows: featuredRowsFromBoard(BOARD, EID), phase: "PRE" }).map((f) => f.predictionId);
  const post = featuredForecasts({ rows: produced(), phase: "IN_PROGRESS" }).map((f) => f.predictionId);
  assert.equal(pre.length, 5);
  assert.deepEqual(post, pre, "membership must not change when the source switches from board to record");
});

test("a committed record takes precedence over the board — the frozen record is the truth", () => {
  const frozenWithoutProbability = produced().map((r) => (r.family === "anytime_td"
    ? { ...r, frozen: { ...r.frozen, projection: { ...r.frozen.projection, probability: null } } } : r));
  const sel = featuredSelectionRows({ board: BOARD, artifact: { rows: frozenWithoutProbability } });
  assert.equal(sel.source, "live-props");
  /* The board carries touchdown probabilities; the frozen record does not — so no TD is featured. */
  const f = featuredForecasts({ rows: sel.rows });
  assert.equal(f.some((x) => x.family === "anytime_td"), false, "a probability absent from the frozen record must not be taken from the board");
  assert.equal(featuredSelectionRows({ board: BOARD, artifact: { rows: [] } }).source, "board", "an empty record is not a record");
  assert.equal(featuredSelectionRows({ board: BOARD, artifact: null }).source, "board");
});
