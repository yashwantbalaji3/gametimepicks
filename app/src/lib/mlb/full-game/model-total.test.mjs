/**
 * MODEL-IMPLIED TOTAL — shown from the same simulated games as the winner, score and run line; never a pick.
 * Run: npx tsx --test src/lib/mlb/full-game/model-total.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { modelImpliedTotal, modelTotalCopy } from "./model-total.ts";
import { pauseMlbTotal, MLB_TOTAL_FAMILY } from "../../ops/live-record-gate.mjs";

const app = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
// Pinned to a fixed committed slate (never "today"), so the test does not move with the bots.
const artifact = JSON.parse(fs.readFileSync(path.join(app, "public/data/mlb/full-game-simulations/2026-10-06.json"), "utf8"));
const games = artifact.games.filter((g) => g.status !== "unavailable");

test("the fixture slate has simulated games to check", () => {
  assert.ok(games.length >= 1);
});

test("winner, score, run line and total all come from the same simulated games", () => {
  for (const g of games) {
    const t = modelImpliedTotal(g);
    assert.ok(t, `${g.slug}: a valid distribution must be readable`);
    // Every histogram accounts for every simulated game.
    assert.equal(t.worlds, g.runCount);
    const diffBins = g.runDifferential.distribution;
    assert.equal(diffBins.reduce((s, b) => s + b.count, 0), g.runCount);
    // Winner: home wins are the margins above zero, in the same games (no ties exist).
    const homeWins = diffBins.filter((b) => b.value > 0).reduce((s, b) => s + b.count, 0);
    const ties = diffBins.filter((b) => b.value === 0).reduce((s, b) => s + b.count, 0);
    assert.equal(ties, 0, `${g.slug}: a finished baseball game cannot be tied`);
    assert.equal(Math.round((homeWins / g.runCount) * 1000) / 1000, g.winProbability.home);
    // Run line: home −1.5 covers are the margins of two or more, in the same games.
    const homeBy2 = diffBins.filter((b) => b.value >= 2).reduce((s, b) => s + b.count, 0);
    assert.equal(Math.round((homeBy2 / g.runCount) * 1000) / 1000, g.runLine.find((r) => r.line === 1.5).homeCover);
    // Total: its mean is the sum of the two team means (to the artifact's 2-decimal rounding).
    assert.ok(Math.abs(t.mean - (g.runs.away.mean + g.runs.home.mean)) <= 0.011, `${g.slug}: total mean ${t.mean} vs team means`);
    // Over + under + push is every game.
    if (t.line != null) {
      assert.ok(Math.abs(t.over + t.under + t.push - 1) < 1e-12);
      if (!Number.isInteger(t.line)) assert.equal(t.push, 0);
    }
  }
});

test("over/under is counted from the total distribution, not from adding the two medians", () => {
  const g = {
    status: "degraded", runCount: 10,
    runs: { away: { mean: 4.2, median: 4, p10: 1, p90: 8 }, home: { mean: 4.2, median: 4, p10: 1, p90: 8 } },
    totalRuns: { mean: 8.4, median: 8, p10: 5, p90: 12, distribution: [
      { value: 5, label: "5", count: 1, probability: 0.1 }, { value: 7, label: "7", count: 2, probability: 0.2 },
      { value: 8, label: "8", count: 1, probability: 0.1 }, { value: 9, label: "9", count: 3, probability: 0.3 },
      { value: 11, label: "11", count: 2, probability: 0.2 }, { value: 21, label: "21+", count: 1, probability: 0.1 },
    ] },
    market: { bookmaker: "book", capturedAt: "2026-10-07T09:00:00Z", total: { line: 8, over: 0.5 } },
  };
  const t = modelImpliedTotal(g);
  assert.equal(t.over, 0.6);
  assert.equal(t.under, 0.3);
  assert.equal(t.push, 0.1);
  const half = modelImpliedTotal({ ...g, market: { ...g.market, total: { line: 7.5 } } });
  assert.equal(half.push, 0);
  assert.equal(half.over, 0.7);
});

test("a broken or missing distribution is never shown as a number", () => {
  assert.equal(modelImpliedTotal(null), null);
  assert.equal(modelImpliedTotal({ status: "unavailable" }), null);
  const g = games[0];
  assert.equal(modelImpliedTotal({ ...g, runCount: g.runCount + 1 }), null);
  // A line at or past the open-ended top bin cannot be split honestly: total shown, no over/under.
  const deep = modelImpliedTotal({ ...g, market: { ...g.market, total: { line: 30.5 } } });
  assert.equal(deep.line, null);
  assert.equal(deep.over, null);
});

test("the wording names the model view and the product pause, and makes no edge claim", () => {
  const t = modelImpliedTotal(games[0]);
  const paused = modelTotalCopy(t, { productPaused: true, modelVersion: "mlb-fullgame-2026.08-pa-v2" });
  const all = Object.values(paused).flat().join(" \n ");
  assert.match(paused.eyebrow, /Model-implied total/);
  assert.match(paused.status, /Totals product currently paused/);
  assert.match(all, /simulated games/);
  assert.doesNotMatch(all, /\b(edge|value|validated|market-beating|lock|strong|confiden)/i);
  assert.doesNotMatch(all, /Unavailable/);
  if (t.line != null) assert.match(paused.splits[0], new RegExp(`of ${t.worlds.toLocaleString("en-US")} simulated games`));
  assert.doesNotMatch(modelTotalCopy(t, { productPaused: false }).status, /paused/i);
});

test("the display reader is not a pick: no pick, no strength, and the pause still blanks the decision", () => {
  const t = modelImpliedTotal(games[0]);
  for (const k of ["pick", "strengthLabel", "simulationProbability", "overProbability"]) assert.ok(!(k in t), `reader must not carry ${k}`);
  const decision = { total: { line: 8, pick: "OVER", overProbability: 0.6, underProbability: 0.4, pushProbability: 0, strengthLabel: "LEAN" } };
  const paused = pauseMlbTotal(decision, new Set([MLB_TOTAL_FAMILY]));
  assert.equal(paused.total.pick, "UNAVAILABLE");
  assert.equal(paused.total.overProbability, null);
});

test("only the game report reads the model-implied total — no board, parlay, Bank Builder or Moonshot path", () => {
  const src = path.join(app, "src");
  const importers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !e.name.endsWith(".test.mjs") && !p.endsWith(path.join("full-game", "model-total.ts"))) {
        if (/full-game\/model-total/.test(fs.readFileSync(p, "utf8"))) importers.push(path.relative(src, p));
      }
    }
  };
  walk(src);
  assert.deepEqual(importers, [path.join("components", "game", "mlb-full-game-report.tsx")]);
});
