/**
 * Phase A-3 · the MLB hub: one nav strip, the model's forecasts right after the events, the Simulation Center
 * strip beside the simulations, and the game read in words (never a guessed translation).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { humanizeMlbPredictionLine } from "./adapters.ts";
import { HUB_SECTIONS } from "../sports/hub-sections.ts";

const code = fs.readFileSync(path.join(process.cwd(), "src/app/mlb/page.tsx"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("the prediction line reads in words; an unknown segment keeps the model's own line", () => {
  assert.equal(humanizeMlbPredictionLine("NYY · BOS +1.5"), "NYY to win · BOS +1.5 run line");
  assert.equal(humanizeMlbPredictionLine("NYM · UNDER 8 · SF +1.5"), "NYM to win · Under 8 runs · SF +1.5 run line");
  assert.equal(humanizeMlbPredictionLine("NYM · something new"), "NYM · something new", "never guesses");
});

test("🔴 one nav strip: the route tabs are gone from the hub, their destinations are in the shared strip", () => {
  assert.doesNotMatch(code, /<MlbSectionTabs/);
  const targets = HUB_SECTIONS.mlb.map((s) => s.target);
  for (const t of ["/mlb/board", "/mlb/power", "/build", "/results/picks/mlb"]) assert.ok(targets.includes(t), `strip offers ${t}`);
});

test("🔴 events → forecasts (board) → Simulation Center strip → simulations → results → model health", () => {
  const at = (s) => { const i = code.indexOf(s); assert.ok(i > -1, `renders ${s}`); return i; };
  const order = [at('id="mlb-games"'), at('id="mlb-board"'), at('id="mlb-overview"'), at('id="mlb-sims"'), at("<GradedPicksSection"), at("<ModelStatusPanel collapsed")];
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] < order[i], `section ${i} is in order`);
});
