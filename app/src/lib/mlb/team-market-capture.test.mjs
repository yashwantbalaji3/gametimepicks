import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { capturedPregame, carryPregameCaptures, pregameGamesOnly } from "./team-market-capture.mjs";

test("THE INCIDENT · Rays @ Braves captured 88 minutes after first pitch is refused", () => {
  const g = { homeTeam: "Atlanta Braves", awayTeam: "Tampa Bay Rays", commenceTime: "2026-09-10T16:16:28Z", total: { line: 2.5 } };
  assert.equal(capturedPregame(g, "2026-09-10T17:43:29.022Z"), false);
});

test("a game captured before its start is kept", () => {
  assert.equal(capturedPregame({ commenceTime: "2026-09-10T23:05:00Z" }, "2026-09-10T17:43:29Z"), true);
});

test("no start or no capture moment → not evidence of a pregame price", () => {
  assert.equal(capturedPregame({}, "2026-09-10T17:43:29Z"), false);
  assert.equal(capturedPregame({ commenceTime: "2026-09-10T23:05:00Z" }, undefined), false);
});

test("REAL DATA · the committed 2026-09-10 file loses exactly its in-game capture", () => {
  const a = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data/mlb/team-markets/2026-09-10.json"), "utf8"));
  const { games, dropped } = pregameGamesOnly(a);
  assert.ok(dropped.some((d) => /Braves/.test(d.matchup)), "the 2.5 total is dropped");
  for (const g of Object.values(games)) assert.ok(g.total == null || g.total.line >= 5, `${g.awayTeam} @ ${g.homeTeam}: a pregame MLB total, not ${g.total?.line}`);
});

test("GENERIC · no committed team-markets file publishes a total under 5 through the filter", () => {
  const dir = path.resolve(process.cwd(), "public/data/mlb/team-markets");
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const { games } = pregameGamesOnly(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    for (const g of Object.values(games)) if (g.total?.line != null) assert.ok(g.total.line >= 5, `${f} ${g.awayTeam} @ ${g.homeTeam}: total ${g.total.line}`);
  }
});

test("THE REWRITE · a started game keeps its genuine MORNING line instead of vanishing", () => {
  const morning = { generatedAt: "2026-09-10T14:00:00Z", games: { e1: { gameId: "e1", commenceTime: "2026-09-10T16:15:00Z", total: { line: 8 } } } };
  const carried = carryPregameCaptures(morning, ["e1"]);
  assert.equal(carried.e1.total.line, 8, "the pregame 8, not the live 2.5");
  assert.equal(carried.e1.capturedAt, "2026-09-10T14:00:00Z", "stamped with when it was really taken");
  assert.equal(capturedPregame(carried.e1, "2026-09-10T17:43:29Z"), true, "and it passes the reader filter on its own capture moment");
});

test("a started game the earlier file ALSO caught late is not carried — a live line never survives", () => {
  const late = { generatedAt: "2026-09-10T17:00:00Z", games: { e1: { gameId: "e1", commenceTime: "2026-09-10T16:15:00Z", total: { line: 2.5 } } } };
  assert.deepEqual(carryPregameCaptures(late, ["e1"]), {});
  assert.deepEqual(carryPregameCaptures(null, ["e1"]), {});
});
