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
  const d = buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board, lineDisplay: { public: true, social: true } });
  const lc = d.events[0].players.find((x) => x.id === String(p.providerAthleteId)).lineComparison;
  assert.deepEqual([lc.pts.direction, lc.pts.side], ["ABOVE", "OVER"]);
  assert.deepEqual([lc.reb.direction, lc.reb.side], ["BELOW", "UNDER"]);
  assert.deepEqual([lc.ast.direction, lc.ast.side], ["EQUAL", "NEUTRAL"]);
  assert.equal(lc.threePm.side, undefined, "an unavailable comparison has no side");
});

test("private (default): no side, no line, no price, no book anywhere in the feed", () => {
  const board = buildNbaLineBoard({ lane, asOf, priceRecords: [rec("pts", "player_points", 1.5)] });
  const json = JSON.stringify(buildNbaSocialDay({ lane, buildEtDate: "2026-10-27", lineBoard: board }));
  assert.doesNotMatch(json, /"side"|fixturebook|"overPrice"|"line":/);
});
