/* gtp-social-nba@1 additive `side` (founder P0 2026-10-29): readers see OVER / UNDER / NEUTRAL; `direction` keeps its
   internal ABOVE / BELOW / EQUAL. Committed 10-27 lane + SYNTHETIC price records (no real prices). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildNbaSocialDay } from "./nba-social.mjs";
import { buildNbaLineBoard } from "../sports/nba/line-board.mjs";

const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-27.json"), "utf8"));
const g = lane.games[0], p = g.players.away[0];
const cap = new Date(Date.parse(g.tipUtc) - 2 * 3600_000).toISOString();
const rec = (family, providerMarketKey, line) => ({ schema: "gtp.nba.prop-price@1", eventId: String(g.providerEventId), providerAthleteId: String(p.providerAthleteId), family, providerMarketKey, line, book: "fixturebook", overAmerican: -111, underAmerican: -109, capturedAt: cap });
const asOf = new Date(Date.parse(g.tipUtc) - 3600_000).toISOString();

test("authorized: each COMPARED row carries side OVER / UNDER / NEUTRAL next to the unchanged direction", () => {
  const board = buildNbaLineBoard({ lane, asOf, priceRecords: [rec("pts", "player_points", p.medians.pts - 1), rec("reb", "player_rebounds", p.medians.reb + 1), rec("ast", "player_assists", p.medians.ast)] });
  // as if every family were direction-qualified (a test gate); the committed gate is asserted in the next test
  const d = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board, lineDisplay: { public: true, social: true }, lineDirections: { scope: "public", shows: () => true } });
  const lc = d.events[0].players.find((x) => x.id === String(p.providerAthleteId)).lineComparison;
  assert.deepEqual([lc.pts.direction, lc.pts.side], ["ABOVE", "OVER"]);
  assert.deepEqual([lc.reb.direction, lc.reb.side], ["BELOW", "UNDER"]);
  assert.deepEqual([lc.ast.direction, lc.ast.side], ["EQUAL", "NEUTRAL"]);
  assert.equal(lc.threePm.side, undefined, "an unavailable comparison has no side");
});

test("authorized feed, committed direction gate (no family qualified): DIRECTION_WITHHELD — line and capture time, never a side or difference", () => {
  const board = buildNbaLineBoard({ lane, asOf, priceRecords: [rec("pts", "player_points", p.medians.pts - 1), rec("reb", "player_rebounds", p.medians.reb + 1)] });
  const d = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board, lineDisplay: { public: true, social: true } });
  const lc = d.events[0].players.find((x) => x.id === String(p.providerAthleteId)).lineComparison;
  for (const f of ["pts", "reb"]) {
    assert.equal(lc[f].status, "DIRECTION_WITHHELD", f);
    assert.ok(!("side" in lc[f]) && !("direction" in lc[f]) && !("difference" in lc[f]), f);
    assert.match(lc[f].reasonText, /has not met our calibration standard/);
  }
  assert.doesNotMatch(JSON.stringify(d), /"side"/);
});

test("private (default): no side, no line, no price, no book anywhere in the feed", () => {
  const board = buildNbaLineBoard({ lane, asOf, priceRecords: [rec("pts", "player_points", 1.5)] });
  const json = JSON.stringify(buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board }));
  assert.doesNotMatch(json, /"side"|fixturebook|"overPrice"|"line":/);
});
