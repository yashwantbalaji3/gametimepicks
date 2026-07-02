/**
 * Games-board card signal — the honest "what's the board's headline read?" line on /games cards.
 * Pure functions over already-loaded data; synthetic fixtures exercise selection + fallback + null safety.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scriptSignal, topPropSignal } from "./games-board-signal.ts";

// ── scriptSignal (World Cup game-script → card signal) ──────────────────────────────────────────
test("scriptSignal maps an available game-script to a card signal", () => {
  const s = scriptSignal({ available: true, winner: "England", scoreLean: "England 2–0 DR Congo", totalLean: "Under 2.5", bttsLean: "BTTS No", confidence: "High" });
  assert.equal(s.kind, "script");
  assert.equal(s.pick, "England");
  assert.equal(s.sub, "England 2–0 DR Congo");
  assert.equal(s.confidence, "High");
});

test("scriptSignal falls back to total lean, then BTTS, when no scoreline", () => {
  assert.equal(scriptSignal({ available: true, winner: "Draw", scoreLean: null, totalLean: "Over 2.5", bttsLean: "BTTS Yes", confidence: "Low" }).sub, "Over 2.5");
  assert.equal(scriptSignal({ available: true, winner: "Draw", scoreLean: null, totalLean: null, bttsLean: "BTTS Yes", confidence: "Low" }).sub, "BTTS Yes");
  assert.equal(scriptSignal({ available: true, winner: "Draw", scoreLean: null, totalLean: null, bttsLean: null, confidence: "Low" }).sub, null);
});

test("scriptSignal is null when unavailable, null, or has no winner", () => {
  assert.equal(scriptSignal(null), null);
  assert.equal(scriptSignal(undefined), null);
  assert.equal(scriptSignal({ available: false, winner: "England" }), null);
  assert.equal(scriptSignal({ available: true, winner: null }), null);
});

// ── topPropSignal (MLB / NBA highest MARKET-implied prop → card signal) ─────────────────────────
const proj = (name, prob, pickLabel = "Over 1.5", marketLabel = "Total bases") => ({
  matchId: "1", player: name ? { name } : null, pickLabel, marketLabel, marketProbability: prob, gameLabel: "WSH @ BOS",
});

test("topPropSignal picks the single highest market-implied prop", () => {
  const s = topPropSignal([proj("A", 0.51), proj("B", 0.68), proj("C", 0.44)]);
  assert.equal(s.kind, "prop");
  assert.equal(s.pick, "B Over 1.5");
  assert.equal(s.sub, "Total bases");
  assert.equal(Math.round(s.prob * 100), 68);
});

test("topPropSignal ignores null / >1 / <=0 probabilities (no anomaly or bad data)", () => {
  const s = topPropSignal([proj("A", null), proj("B", 1.4), proj("C", 0), proj("D", 0.55)]);
  assert.equal(s.pick, "D Over 1.5");
  assert.equal(Math.round(s.prob * 100), 55);
});

test("topPropSignal is null when nothing carries a usable probability", () => {
  assert.equal(topPropSignal([]), null);
  assert.equal(topPropSignal([proj("A", null), proj("B", 0), proj("C", 2)]), null);
});

test("topPropSignal falls back to gameLabel when a prop has no player name", () => {
  const s = topPropSignal([proj(null, 0.6, "Over 8.5", "Total")]);
  assert.equal(s.pick, "WSH @ BOS Over 8.5");
});
