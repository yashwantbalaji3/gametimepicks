/**
 * The expected-work graph, driven against the four real incidents it was built for.
 *
 * Every one of them was a scheduled run that never happened, and three of the four were invisible
 * until a human opened an artifact by hand. Each replay below asks: would this have opened an
 * incident, and would it have done so before the games began?
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DAILY_OWNERS,
  OWNER_STATES,
  evaluateOwner,
  evaluateAll,
  dueAt,
  previousDate,
  worstOf,
} from "./daily-owners.mjs";

const at = (iso) => Date.parse(iso);
const owner = (id) => DAILY_OWNERS.find((o) => o.id === id);

/* ── THE FOUR REPLAYS ─────────────────────────────────────────────────────────────────────────── */

test("REPLAY 2026-08-27 · the dropped band opens an incident BEFORE first pitch", () => {
  /*
   * Five workflows received no scheduled events. The first game was 17:05Z; the board was due 90
   * minutes earlier at 15:35Z with 30 minutes grace, so an incident is open from 16:05Z — an hour
   * before play. In reality nobody noticed until 17:48Z, by which time the first game was gone.
   */
  const ctx = { date: "2026-08-27", earliestStartMs: at("2026-08-27T17:05:00Z"), scheduledCount: 7, receipt: null };

  const beforeDeadline = evaluateOwner(owner("mlb-board"), { ...ctx, nowMs: at("2026-08-27T15:00:00Z") });
  assert.equal(beforeDeadline.state, "NOT_DUE", "a quiet morning is not an incident");

  const inGrace = evaluateOwner(owner("mlb-board"), { ...ctx, nowMs: at("2026-08-27T15:50:00Z") });
  assert.equal(inGrace.state, "DUE");

  const open = evaluateOwner(owner("mlb-board"), { ...ctx, nowMs: at("2026-08-27T16:06:00Z") });
  assert.equal(open.state, "INCIDENT");
  assert.ok(at("2026-08-27T16:06:00Z") < ctx.earliestStartMs, "and it opens before the first game starts");
});

test("REPLAY 2026-08-28 · mlb-daily-production never ran; the board alone looked fine", () => {
  /*
   * The board landed and nothing downstream did, so every board-shaped check passed while the site
   * advertised 15 games beside empty market sections. Separate owners, separate receipts.
   */
  const base = { date: "2026-08-28", earliestStartMs: at("2026-08-28T22:41:00Z"), scheduledCount: 15, nowMs: at("2026-08-28T23:11:00Z") };
  const board = evaluateOwner(owner("mlb-board"), { ...base, receipt: { generatedAt: "2026-08-28T21:34:00Z" } });
  const markets = evaluateOwner(owner("mlb-markets"), { ...base, receipt: null });
  assert.equal(board.state, "HEALTHY");
  assert.equal(markets.state, "INCIDENT", "the missing half is its own owner and its own incident");
});

test("REPLAY 2026-08-28 · nightly-settle dropped, so yesterday stayed unsettled", () => {
  // Its receipt is keyed to the day it settles, not the day it runs.
  const o = owner("settlement");
  assert.equal(o.receipt.path("2026-08-28", previousDate("2026-08-28")), "parlays/lab-settled/2026-08-27.json");
  const v = evaluateOwner(o, {
    date: "2026-08-28", nowMs: at("2026-08-28T14:30:00Z"), earliestStartMs: NaN, scheduledCount: 1, receipt: null,
  });
  assert.equal(v.state, "INCIDENT", "12:00Z plus two hours' grace, and nothing was written");
});

test("REPLAY 2026-08-27 · sport-schedules dropped and the injury feed aged out", () => {
  // Present but old is STALE, not healthy — the feed existed, it was 29 hours past a 24-hour bound.
  const v = evaluateOwner(owner("schedules"), {
    date: "2026-08-27", nowMs: at("2026-08-27T18:00:00Z"), earliestStartMs: NaN, scheduledCount: 1,
    receipt: { generatedAt: "2026-08-26T13:44:00Z" },
  });
  assert.equal(v.state, "STALE");
  assert.match(v.reason, /against a 24h bound/);
});

/* ── THE PROPERTY THAT MAKES IT WORK ──────────────────────────────────────────────────────────── */

test("NO WORKFLOW IS EVER CONSULTED — that is the whole point", () => {
  /*
   * cron-slot-watchdog asks GitHub which runs exist. It cannot see a slot that produced no run
   * object, and on 2026-08-27 it was itself a scheduled job inside the dead band. A receipt-based
   * check needs none of that, and this pins that it stays that way.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/ops/daily-owners.mjs"), "utf8");
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  for (const forbidden of ["gh run", "execSync", "conclusion", "workflow_run", "fetch("]) {
    assert.ok(!code.includes(forbidden), `the evaluator must not reach for ${forbidden}`);
  }
});

test("a healthy day is HEALTHY and says nothing more", () => {
  const v = evaluateOwner(owner("mlb-board"), {
    date: "2026-08-28", nowMs: at("2026-08-28T23:00:00Z"), earliestStartMs: at("2026-08-28T22:41:00Z"),
    scheduledCount: 15, receipt: { generatedAt: "2026-08-28T21:34:00Z" },
  });
  assert.equal(v.state, "HEALTHY");
});

test("a genuinely empty day is NO_WORK, never an incident", () => {
  const v = evaluateOwner(owner("mlb-board"), {
    date: "2026-12-25", nowMs: at("2026-12-25T20:00:00Z"), earliestStartMs: NaN, scheduledCount: 0, receipt: null,
  });
  assert.equal(v.state, "NO_WORK");
});

test("REFUSAL · an unknown schedule is UNKNOWN, and UNKNOWN is never green", () => {
  const v = evaluateOwner(owner("mlb-board"), {
    date: "2026-08-28", nowMs: at("2026-08-28T23:00:00Z"), earliestStartMs: NaN, scheduledCount: null, receipt: null,
  });
  assert.equal(v.state, "UNKNOWN");
  assert.notEqual(v.state, "NO_WORK");
});

test("REFUSAL · no receipt AND no derivable deadline cannot be judged as fine", () => {
  // Guessing a deadline would let a dropped run sit at NOT_DUE forever.
  const v = evaluateOwner(owner("mlb-board"), {
    date: "2026-08-28", nowMs: at("2026-08-28T23:00:00Z"), earliestStartMs: NaN, scheduledCount: 15, receipt: null,
  });
  assert.equal(v.state, "UNKNOWN");
});

test("an empty receipt is not a receipt", () => {
  // A green run that wrote a file with nothing in it is a failure mode this repository has seen.
  const v = evaluateOwner(owner("mlb-board"), {
    date: "2026-08-28", nowMs: at("2026-08-29T02:00:00Z"), earliestStartMs: at("2026-08-28T22:41:00Z"),
    scheduledCount: 15, receipt: { generatedAt: "2026-08-28T21:34:00Z", hasContent: false },
  });
  assert.equal(v.state, "INCIDENT");
});

test("the deadline comes from the day's first event, not from a fixed hour", () => {
  const early = dueAt(owner("mlb-board"), { earliestStartMs: at("2026-08-28T17:05:00Z"), date: "2026-08-28" });
  const late = dueAt(owner("mlb-board"), { earliestStartMs: at("2026-08-29T02:15:00Z"), date: "2026-08-28" });
  assert.equal(new Date(early).toISOString(), "2026-08-28T15:35:00.000Z");
  assert.equal(new Date(late).toISOString(), "2026-08-29T00:45:00.000Z");
});

/* ── THE GRAPH ────────────────────────────────────────────────────────────────────────────────── */

test("every owner declares a workflow, a receipt and a derivable deadline", () => {
  for (const o of DAILY_OWNERS) {
    assert.ok(o.id && o.label && o.workflow, `${o.id}: incomplete`);
    assert.equal(typeof o.receipt.path, "function", `${o.id}: a receipt must be an artifact path`);
    assert.ok(["earliest-start", "clock"].includes(o.dueFrom), `${o.id}: unknown deadline source`);
    if (o.dueFrom === "clock") assert.equal(typeof o.dueUtcHour, "number", `${o.id}: a clock deadline needs its hour`);
  }
});

test("a broken dependency is named but never excuses the dependent's own state", () => {
  /*
   * The risk ladder genuinely has no receipt whether or not the markets ran. Collapsing it into
   * "someone else's fault" is how one root cause hides four real gaps.
   */
  const out = evaluateAll({
    date: "2026-08-28",
    nowMs: at("2026-08-29T02:00:00Z"),
    earliestStartMs: at("2026-08-28T22:41:00Z"),
    earliestStartBySport: { mlb: at("2026-08-28T22:41:00Z") },
    scheduledBySport: { mlb: 15 },
    receipts: { "mlb-board": { generatedAt: "2026-08-28T21:34:00Z" } },
  });
  const ladder = out.rows.find((r) => r.id === "risk-ladder");
  assert.equal(ladder.state, "INCIDENT", "it has no receipt of its own");
  assert.deepEqual(ladder.blockedUpstream, ["mlb-markets"], "and its blocked dependency is named");
});

test("the roll-up is WORST-OF and every state is in the closed vocabulary", () => {
  assert.equal(worstOf(["HEALTHY", "HEALTHY", "INCIDENT"]), "INCIDENT");
  assert.equal(worstOf(["HEALTHY", "STALE"]), "STALE");
  assert.equal(worstOf(["INCIDENT", "UNKNOWN"]), "UNKNOWN", "not knowing outranks a known incident");
  const out = evaluateAll({ date: "2026-08-28", nowMs: at("2026-08-28T23:00:00Z"), scheduledBySport: {}, receipts: {} });
  for (const r of out.rows) assert.ok(OWNER_STATES.includes(r.state), `${r.id}: ${r.state} outside the vocabulary`);
});
