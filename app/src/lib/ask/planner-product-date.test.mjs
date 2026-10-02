/**
 * Session 7 — the planner is told today's ET product date, so a year-less date is never planned in a past year.
 * Production 2026-10-02: "Show me the official Suggested Parlays cards from September 25" → date 2025-09-25 →
 * NOT PUBLISHED for a day that WAS published. Run: npx tsx --test src/lib/ask/planner-product-date.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannerUserMessage } from "./engine.mjs";
import { plannerSystemPrompt } from "./planner.mjs";

const state = { question: "Show me the official cards from September 25", history: [], resolvedEntities: [], wagering: {} };

test("the planner message states today's ET product date (ET, not UTC)", () => {
  /* 03:00Z on Oct 3 is still Oct 2 in New York. */
  const msg = plannerUserMessage(state, null, () => new Date("2026-10-03T03:00:00Z"));
  assert.match(msg, /^TODAY'S PRODUCT DATE \(ET\): 2026-10-02$/m);
  assert.ok(msg.indexOf("TODAY'S PRODUCT DATE") < msg.indexOf("QUESTION:"));
});

test("no clock → no date line (never an invented date)", () => {
  assert.doesNotMatch(plannerUserMessage(state, null, null), /TODAY'S PRODUCT DATE/);
});

test("the planner rule resolves a year-less date to the most recent one on or before today", () => {
  assert.match(plannerSystemPrompt(), /WITHOUT a year[^"]*most recent such date on or before TODAY'S PRODUCT DATE/);
});
