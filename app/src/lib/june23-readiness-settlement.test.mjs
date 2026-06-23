import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./bank-builder/public-dual-ladder.ts";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { loadWorldCupSpecialsHistory, specialsPastSlates } from "./world-cup/world-cup-specials.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("Lane A settled WON: core record 10-2-0-0, exposure $0, bankroll + crown unchanged", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.deepEqual(p.record, { wins: 10, losses: 2, voids: 0, pending: 0 }, "record 10-2-0-0 after Lane A WON");
  assert.equal(p.openExposure, 0, "core exposure released to $0 (both lanes settled WON)");
  assert.equal(p.totalOpenExposure, 0, "total exposure $0");
  assert.equal(p.currentBankroll, 10176.17, "bankroll unchanged (won step rolls)");
  assert.equal(p.crownBankroll, 10376.17, "crown untouched");
});

test("Lane A artifact: all 3 steps settled WON (Egypt + Algeria), lane advanced", () => {
  const d = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json"));
  const a = d.run.laneA;
  assert.equal(a.laneStatus, "advanced", "Lane A advanced");
  const settledWon = a.steps.filter((s) => s.status === "settled" && s.result === "won").length;
  assert.equal(settledWon, 3, "all 3 Lane A steps settled WON");
  const algeria = a.steps.flatMap((s) => s.legs ?? []).find((l) => /Algeria/.test(l.matchup ?? ""));
  assert.ok(algeria && algeria.settlementStatus === "hit", "Algeria leg graded HIT from official final");
});

test("both lanes show 'awaiting next qualified card' once cleared (no stale pending, no exposure)", () => {
  const bb = loadTodaySlate().bankBuilderPreview;
  for (const laneId of ["lane-a", "lane-b"]) {
    const lane = laneId === "lane-a" ? bb.laneA : bb.laneB;
    const view = buildPublicDualLadder(lane ?? null, laneId);
    assert.ok(view, `${laneId} view built`);
    assert.equal(view.currentStatus, "awaiting_next_card", `${laneId} awaiting next qualified card`);
    assert.ok(/awaiting next qualified card/.test(view.headline), `${laneId} headline invites next card`);
    assert.ok(!view.steps.some((s) => s.status === "active"), `${laneId} has no active card (no open exposure)`);
  }
});

test("Bank Builder board renders the 'Awaiting next card' lane status label", () => {
  const board = read("src/components/bank-builder/dual-ladder-board.tsx");
  assert.match(board, /awaiting_next_card.*Awaiting next card/, "board labels awaiting_next_card cleanly");
});

test("World Cup Specials history persists across days (June 22 + June 23), separate, $0 exposure", () => {
  const h = loadWorldCupSpecialsHistory();
  assert.equal(h.version, "world-cup-specials-history-v1", "history v1");
  const dates = h.days.map((d) => d.date);
  assert.ok(dates.includes("2026-06-22"), "June 22 archived");
  assert.ok(dates.includes("2026-06-23"), "June 23 archived");
  for (const day of h.days) {
    assert.ok(day.cardCount > 0 && day.cards.length === day.cardCount, `${day.date} has cards`);
    for (const c of day.cards) assert.ok(Array.isArray(c.legs), "each card has legs (compact, no fabricated outcomes)");
  }
  // past slates excludes the current day so the tracker doesn't double-show today.
  const past = specialsPastSlates(h, "2026-06-23");
  assert.ok(!past.some((d) => d.date === "2026-06-23"), "current day excluded from past slates");
  assert.ok(past.some((d) => d.date === "2026-06-22"), "June 22 is a past slate");
});

test("specials history is SEPARATE from core: portfolio record/exposure unaffected", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.openExposure, 0, "core exposure unaffected by specials history");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate (0-1)");
});

test("Moonshot stays READY (not activated): 2 candidates, $0 exposure, record separate", () => {
  const lane = loadMoonshotLane();
  assert.ok(Array.isArray(lane.candidates) && lane.candidates.length === 2, "2 candidates present");
  for (const c of lane.candidates) assert.equal(c.activated, false, "candidate not activated (no exposure placed)");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.moonshot.exposure, 0, "moonshot exposure $0 (kept ready, not activated)");
});

test("/today readiness reflects both lanes WON + $0 exposure + MLB module", () => {
  const today = read("src/app/today/page.tsx");
  assert.match(today, /Both lanes WON/, "shows both lanes WON when cleared");
  assert.match(today, /awaiting next card · \$0 exposure/, "shows $0 exposure / awaiting next card");
  assert.match(today, /label: "MLB"/, "today readiness has an MLB module");
});

test("MLB June 23 board not faked: no 2026-06-23 board file written", () => {
  assert.equal(fs.existsSync("public/data/mlb/boards/2026-06-23.json"), false, "no fabricated June 23 MLB board");
});
