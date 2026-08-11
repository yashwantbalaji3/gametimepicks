/**
 * Work-board guards (Program 153 · Release E).
 *
 * Run: npx tsx --test src/lib/launch/work-board.test.mjs
 */
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

import { buildWorkBoard, BOARD_STATES } from "./work-board.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";

test("the board is a pure function of committed truth — same inputs, same bytes, no clock", () => {
  const a = JSON.stringify(buildWorkBoard());
  const b = JSON.stringify(buildWorkBoard());
  assert.equal(a, b);
});

test("every PARTIAL non-MLB stage is a visible IN_PROGRESS card; BLOCKED_EXTERNAL is a visible blocked card", () => {
  const board = buildWorkBoard();
  const ids = new Set([...Object.values(board.columns).flat(), ...board.founderQueue].map((t) => t.id));
  for (const [sport, a] of Object.entries(SPORT_ASSESSMENTS)) {
    if (sport === "mlb") continue;
    for (const [stage, s] of Object.entries(a.stages)) {
      if (s.status === "PARTIAL" || s.status === "BLOCKED_EXTERNAL") {
        assert.ok(ids.has(`stage-${sport}-${stage}`), `${sport}.${stage} must appear on the board — silent work is unmanaged work`);
      }
    }
  }
});

test("no ticket exists without owner + next action + acceptance; founder cards never sit in engineering columns", () => {
  const board = buildWorkBoard();
  for (const t of [...Object.values(board.columns).flat(), ...board.founderQueue]) {
    assert.ok(t.owner && t.nextAction && t.acceptance, `${t.id}: decoration ticket`);
    assert.ok(BOARD_STATES.includes(t.state), t.id);
  }
  for (const t of Object.values(board.columns).flat()) assert.equal(t.owner, "ENGINEERING");
  for (const t of board.founderQueue) assert.equal(t.owner, "FOUNDER");
});

test("dedup by stable id — one underlying issue, one card (a duplicate throws, never renders twice)", () => {
  assert.throws(() => buildWorkBoard({
    roadmap: [
      { horizon: "NOW", items: [{ outcome: "x", owner: "ENGINEERING", acceptance: "some acceptance text here" }, { outcome: "y", owner: "ENGINEERING", acceptance: "some acceptance text here" }] },
      { horizon: "NOW", items: [] },
    ].map((h, i) => (i === 1 ? { horizon: "NOW", items: [{ outcome: "z", owner: "ENGINEERING", acceptance: "some acceptance text here" }] } : h)),
  }), /duplicate ticket id/);
});

test("there is NO close/done mechanism — closing happens only by receipts changing the inputs", () => {
  const board = buildWorkBoard();
  assert.ok(!("DONE" in board.columns) && !BOARD_STATES.includes("DONE"),
    "a DONE column would invite checkbox-closing; shipped work leaves the board via the roadmap pruning contract");
  const src = String(buildWorkBoard.toString());
  assert.ok(!/Date\.now|new Date\(\)/.test(src), "no clock — age comes from receipts, not render time");
});

test("half-landed cadence escalates to P0; the real board carries none now that receipts are 2/2", () => {
  // Receipts 31396780843 + 31500117960 landed (P161), so no live evidence string may still claim
  // a pending cadence — but the escalation mechanism must survive for the next first-receipt phase.
  const board = buildWorkBoard();
  const pending = Object.values(board.columns).flat().filter((t) => /receipt 1\/2|CADENCE 1\/2/i.test(t.evidence ?? ""));
  assert.deepEqual(pending.map((t) => t.id), [], "an evidence string still claims a half-landed cadence after receipt #2");
  const synth = buildWorkBoard({ assessments: { testsport: { stages: { schedule: { status: "PARTIAL", evidence: "P999 first capture; CADENCE 1/2: run 123 landed, second firing pending" } } } } });
  const t = synth.sprints.today.find((x) => x.id === "stage-testsport-schedule");
  assert.ok(t, "a half-landed cadence must surface on today's sprint as P0");
  assert.equal(t.priority, "P0");
  assert.match(t.nextAction, /second scheduled/);
});

test("the filter component is READ-ONLY presentation — no fetch, no mutation, Reset + zero-state present", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "components", "launch", "board-filters.tsx"), "utf8");
  assert.match(src, /"use client"/);
  assert.match(src, /Reset/);
  assert.match(src, /No cards match/, "zero results explains itself instead of rendering a void");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|localStorage|POST/, "filters can mutate nothing");
  assert.match(src, /aria-pressed/, "filter chips are real toggle buttons");
});

test("SHADOW GAPS on the board (P156-B): every gap once, odds merged to ONE founder card, ids stable", () => {
  const board = buildWorkBoard();
  const all = [...Object.values(board.columns).flat(), ...board.founderQueue];
  const shadow = all.filter((t) => t.department === "shadow-readiness");
  assert.equal(shadow.length, 6, "9 named gaps − 4 odds merged into 1 founder card = exactly 6 cards");
  const odds = shadow.filter((t) => /odds/.test(t.id));
  assert.equal(odds.length, 1, "one underlying odds blocker = one card, never four duplicates");
  assert.equal(odds[0].owner, "FOUNDER");
  assert.match(odds[0].sport, /nfl.*nba.*epl.*ufc|nfl\/nba\/epl\/ufc/, "the merged card names every sport it spans");
  const ufcMethod = shadow.find((t) => t.id === "shadow-ufc-methodRoundFields");
  assert.ok(ufcMethod && ufcMethod.state === "NEW" && ufcMethod.priority === "P2", "UNSUPPORTED inputs are planned work, not ready work");
  for (const t of shadow.filter((x) => x.owner === "ENGINEERING")) assert.notEqual(t.state, "BLOCKED", "engineering shadow work is never blocked by the founder odds decision");
  // Determinism holds with the integration in place.
  assert.equal(JSON.stringify(buildWorkBoard()), JSON.stringify(buildWorkBoard()));
});
