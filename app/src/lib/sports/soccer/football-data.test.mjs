import test from "node:test";
import assert from "node:assert/strict";
import { londonToUtcIso, devig, parseFootballData } from "./football-data.mjs";

test("UK kickoff times become the right UTC instant across BST and GMT", () => {
  assert.equal(londonToUtcIso("15/08/2024", "20:00"), "2024-08-15T19:00:00.000Z", "BST = UTC+1");
  assert.equal(londonToUtcIso("15/01/2025", "20:00"), "2025-01-15T20:00:00.000Z", "GMT = UTC+0");
  assert.equal(londonToUtcIso("15/08/24", "12:30"), "2024-08-15T11:30:00.000Z", "two-digit years");
  assert.equal(londonToUtcIso("not a date", "20:00"), null);
});

test("de-vig is proportional and refuses anything that is not a real price", () => {
  const d = devig([2.0, 3.5, 4.0]);
  assert.ok(Math.abs(d.probs.reduce((a, b) => a + b, 0) - 1) < 1e-3);
  assert.ok(d.overround > 0);
  assert.equal(devig([2.0, "", 4.0]), null);
  assert.equal(devig([1.0, 3.0, 4.0]), null, "a price of 1.0 is not a price");
});

test("columns are read BY NAME — the same fields parse wherever they sit", () => {
  const a = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgCH,AvgCD,AvgCA,AvgC>2.5,AvgC<2.5\nSP1,15/08/2024,18:00,Ath Bilbao,Getafe,1,1,D,1.5,4.2,7.5,2.2,1.7";
  const b = "Div,FTAG,AvgCA,HomeTeam,Date,AvgCD,AwayTeam,FTHG,Time,AvgCH,FTR,AvgC<2.5,AvgC>2.5\nSP1,1,7.5,Ath Bilbao,15/08/2024,4.2,Getafe,1,18:00,1.5,D,1.7,2.2";
  const ra = parseFootballData(a, { season: "2024-25" }).rows[0];
  const rb = parseFootballData(b, { season: "2024-25" }).rows[0];
  assert.deepEqual(ra, rb);
  assert.equal(ra.result, "D");
  assert.equal(ra.dateUtc, "2024-08-15T17:00:00.000Z");
  assert.ok(ra.market.close1x2.home > ra.market.close1x2.away, "the favourite keeps the larger probability");
});

test("a fixture with no result yet is skipped, not scored as 0-0", () => {
  const csv = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR\nE0,20/09/2026,15:00,Arsenal,Chelsea,,,";
  const { rows, skipped } = parseFootballData(csv, { season: "2026-27" });
  assert.equal(rows.length, 0);
  assert.equal(skipped.noResult, 1);
});
