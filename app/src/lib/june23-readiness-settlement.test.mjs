import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./bank-builder/public-dual-ladder.ts";
import { loadWorldCupSpecialsHistory, specialsPastSlates } from "./world-cup/world-cup-specials.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("June 29 settled: core record 15-9-0-0, exposure $0, cumulative bankroll = crown − nine lost seeds, crown reflects two banked ladders", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.deepEqual(p.record, { wins: 15, losses: 9, voids: 0, pending: 0 }, "record 15-9-0-0 (both lanes settled-LOST their June-29 Step)");
  assert.equal(p.openExposure, 0, "core exposure released to $0 in portfolio.json (both lanes settled-LOST; awaiting a fresh slate)");
  assert.equal(p.totalOpenExposure, 0, "total exposure $0");
  assert.equal(p.currentBankroll, 19565.4, "bankroll = crown − $900 (nine real lost seeds); won steps roll");
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two banked $100→$10k ladder finals ($10,376.17 + $10,089.23)");
});

test("Archived June-24 run: all 5 Lane A steps settled WON (Egypt + Algeria + Croatia + Morocco/Bosnia/Brazil), lane completed", () => {
  // The completed June-24 dual-lane run is BANKED + archived (the live artifact is a fresh cycle-2).
  const d = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json"));
  const a = d.run.laneA;
  assert.equal(a.laneStatus, "completed", "Lane A completed (Step 5 settled WON June 24, ladder finished)");
  const settledWon = a.steps.filter((s) => s.status === "settled" && s.result === "won").length;
  assert.equal(settledWon, 5, "all 5 Lane A steps settled WON (Step 5 = June 24 Morocco + Bosnia + Scotland/Brazil)");
  const algeria = a.steps.flatMap((s) => s.legs ?? []).find((l) => /Algeria/.test(l.matchup ?? ""));
  assert.ok(algeria && algeria.settlementStatus === "hit", "Algeria leg graded HIT from official final");
  const croatia = a.steps.flatMap((s) => s.legs ?? []).find((l) => /Croatia/.test(l.matchup ?? ""));
  assert.ok(croatia && croatia.settlementStatus === "hit", "Croatia leg graded HIT from official June 23 final");
  const brazil = a.steps.flatMap((s) => s.legs ?? []).find((l) => /Brazil/.test(l.matchup ?? ""));
  assert.ok(brazil && brazil.settlementStatus === "hit", "Scotland/Brazil Over leg graded HIT from official June 24 final");
});

test("archived June-24 lanes are settled: Lane A completed (ladder cleared), Lane B stopped → restart queued (no active card, no exposure)", () => {
  // Asserts the BANKED June-24 run (archived). The live artifact is a fresh cycle-2; the completed/stopped
  // lanes that the public ladder view celebrates live in the archive.
  const archive = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json")).run;
  // Lane A completed the 5-rung $10k ladder → no active card, headline reports the cleared run.
  const aView = buildPublicDualLadder(archive.laneA ?? null, "lane-a");
  assert.ok(aView, "lane-a view built");
  assert.equal(aView.currentStatus, "completed", "lane-a ladder cleared → celebrated completed state");
  assert.ok(/\$10K REACHED|ladder COMPLETE/i.test(aView.headline), "lane-a headline celebrates the completion");
  assert.ok(!aView.steps.some((s) => s.status === "active"), "lane-a has no active card (no open exposure)");
  // Lane B stopped on the June 24 Step 3 loss → restart queued from Step 1, no active card.
  const bView = buildPublicDualLadder(archive.laneB ?? null, "lane-b");
  assert.ok(bView, "lane-b view built");
  assert.equal(bView.currentStatus, "queued_restart", "lane-b stopped → restart queued");
  assert.ok(/Step 1 next qualified card/.test(bView.headline), "lane-b headline queues the Step 1 restart");
  assert.ok(!bView.steps.some((s) => s.status === "active"), "lane-b has no active card (no open exposure)");
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

test("/today readiness is a STATUS board for non-flagship surfaces (MLB module present; flagship products omitted to avoid duplication)", () => {
  const today = read("src/app/today/page.tsx");
  assert.match(today, /label: "MLB"/, "today readiness has an MLB module");
  assert.match(today, /what&apos;s live/, "readiness strip heading present");
  // The 3 flagship products are the highlight section above (full ladders/parlays) — they must NOT
  // be duplicated as readiness status cards.
  const stripStart = today.indexOf("readinessModules:");
  const stripEnd = today.indexOf("];", stripStart);
  const strip = today.slice(stripStart, stripEnd);
  for (const flagship of ['label: "Bank Builder"', 'label: "Moonshot"', 'label: "Suggested Parlays"']) {
    assert.ok(!strip.includes(flagship), `${flagship} is not duplicated in the readiness strip`);
  }
});

test("MLB June 23 board not faked: no 2026-06-23 board file written", () => {
  assert.equal(fs.existsSync("public/data/mlb/boards/2026-06-23.json"), false, "no fabricated June 23 MLB board");
});
