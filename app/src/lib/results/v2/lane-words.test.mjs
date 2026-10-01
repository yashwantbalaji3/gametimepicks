/**
 * Session 3 · Phase B — lane and leg words (lane-words.mjs), on the REAL committed receipts.
 *
 * A no-card lane is "No card placed", never "Pending — not settled yet"; a pending leg of a decided lane is "Not graded —
 * lane already decided". Results, Ask's evidence and Ask's cards read the same words. No grade, no money changes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { LANE_WORD, laneState, legState } from "./lane-words.mjs";
import { productReceiptsFor } from "./product-receipts.ts";
import { buildEvidence } from "../../ask/evidence.mjs";
import { buildAnswerDisplay } from "../../ask/display.mjs";
import { legBadge, laneBadge } from "../../ask/answer-view.mjs";

const receipt = (d) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/mr-dub/settled", `${d}.json`), "utf8"));

test("🔴 a lane the receipt records as awaiting with NO legs is 'No card placed' — never pending", () => {
  const raw = receipt("2026-09-29");
  assert.ok(raw.lanes.every((l) => l.status === "awaiting" && l.legs.length === 0 && l.result === "pending"), "fixture: 09-29 placed no card");
  const day = productReceiptsFor("2026-09-29");
  assert.deepEqual(day.lanes.map((l) => l.result), ["awaiting", "awaiting", "awaiting", "awaiting"]);
  assert.equal(LANE_WORD.awaiting, "No card placed");
  // 09-30: only Moonshot A placed no card; the other three settled normally
  assert.deepEqual(productReceiptsFor("2026-09-30").lanes.map((l) => `${l.product}:${l.lane}:${l.result}`),
    ["bank-builder:A:lost", "bank-builder:B:won", "moonshot:A:awaiting", "moonshot:B:won"]);
});

test("🔴 only an awaiting lane with no legs is no-card — a pending lane WITH legs stays pending, an active lane stays open", () => {
  assert.equal(laneState({ status: "awaiting", result: "pending", legs: [] }), "awaiting");
  assert.equal(laneState({ status: "awaiting", result: "pending", legs: [{ result: "pending" }] }), "pending");
  assert.equal(laneState({ status: "active", result: "pending", legs: [] }), "pending");
  assert.equal(laneState({ status: "lost", result: "lost", legs: [] }), "lost");
  assert.equal(laneState({ result: "active", legs: [{}] }), "active");
});

test("🔴 a pending leg of a DECIDED lane is 'Not graded — lane already decided'; of an open lane it stays pending", () => {
  const b = productReceiptsFor("2026-09-23").lanes.find((l) => l.product === "bank-builder" && l.lane === "B");
  assert.equal(b.result, "lost");
  assert.deepEqual(b.legs.map((g) => legState(g.result, b.result)), ["lost", "not-graded"]);
  assert.equal(LANE_WORD["not-graded"], "Not graded — lane already decided");
  for (const decided of ["won", "lost", "void", "push"]) assert.equal(legState("pending", decided), "not-graded");
  for (const open of ["pending", "active", "awaiting"]) assert.equal(legState("pending", open), "pending", "an undecided lane's leg is still pending");
  assert.equal(legState("won", "lost"), "won", "a graded leg keeps its own grade");
});

test("🔴 Ask says the same: evidence and cards use the lane words, never 'pending' for a no-card lane", () => {
  const day = productReceiptsFor("2026-09-30");
  const env = { tool: "getResultsDay", status: "OK", data: { date: "2026-09-30", isYesterday: true, lanes: day.lanes, events: {}, sportsWithout: [] }, links: [] };
  const text = buildEvidence([env]).facts.map((f) => f.text).join("\n");
  assert.match(text, /Moonshot lane A was not played — no card was placed/);
  assert.doesNotMatch(text, /Moonshot lane A was pending/);
  const d = buildAnswerDisplay([env], []);
  assert.equal(d.lanes.find((l) => l.product === "Moonshot" && l.lane === "A").result, "awaiting");
  assert.deepEqual(laneBadge("awaiting"), { label: "No card", tone: "neutral" });
  assert.equal(legBadge("pending", "lost").label, "Not graded");
  assert.equal(legBadge("pending", "active").label, "Pending");
  // 09-23: the decided lane's pending leg
  const d23 = productReceiptsFor("2026-09-23");
  const ev23 = buildEvidence([{ tool: "getResultsDay", status: "OK", data: { date: "2026-09-23", lanes: d23.lanes, events: {} }, links: [] }]).facts.map((f) => f.text).join("\n");
  assert.match(ev23, /Bank Builder lane B leg · [^\n]*: not graded — the lane was already decided/);
});
