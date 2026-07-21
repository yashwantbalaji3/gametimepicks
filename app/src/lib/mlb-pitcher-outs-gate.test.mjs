/**
 * MLB pitcher_outs PUBLIC-GATE LOCK (2026-07-21).
 *
 * pitcher_outs was built + backtested against official box scores and REJECTED (the recency-form model loses
 * to the market on Brier + log loss over 255 settled starts). Per the honesty gate it stays market-context-only.
 * These checks pin that decision so a future refresh can't silently promote it to a public model:
 *   1. The candidate model's backtest verdict is the rejection (evidence committed, public:false, leakage-safe).
 *   2. pitcher_outs is NOT a modeled market on the live board (the board still models exactly the 4 supported).
 *   3. pitcher_outs is NOT product-eligible (never enters a Bank Builder / Moonshot card).
 *   4. Money md5 unchanged.
 *
 * Run: npx tsx --test src/lib/mlb-pitcher-outs-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const MODELED = new Set(["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]);

test("1 · the pitcher_outs backtest verdict is the rejection (market-context-only), leakage-safe, public:false", () => {
  const report = readJson(path.join(repo, "data/internal/mlb/reference/mlb-pitcher-outs-backtest.json"));
  if (!report) { console.log("  (skip — backtest report not present in this checkout)"); return; }
  assert.equal(report.public, false, "the backtest report is internal (never web-served)");
  assert.equal(report.market, "pitcher_outs");
  assert.equal(report.leakageChecks.passed, true, "the backtest is leakage-safe");
  assert.ok(report.sampleSize >= 60, "sufficient sample");
  assert.equal(report.gate.beatsMarket, false, "the model does NOT beat the market");
  assert.match(report.gate.verdict, /market-context-only/, "verdict keeps pitcher_outs market-context-only");
  // the market wins on both metrics
  assert.ok(report.metrics.brier.market <= report.metrics.brier.model, "market Brier ≤ model Brier");
  assert.ok(report.metrics.logloss.market <= report.metrics.logloss.model, "market logloss ≤ model logloss");
});

test("2 · pitcher_outs is NOT a modeled market on the live board (still exactly the 4 supported)", () => {
  // find the newest board
  const boardsDir = path.join(app, "public/data/mlb/boards");
  const files = fs.existsSync(boardsDir) ? fs.readdirSync(boardsDir).filter((f) => f.endsWith(".json")).sort() : [];
  assert.ok(files.length > 0, "at least one board exists");
  const board = readJson(path.join(boardsDir, files[files.length - 1]));
  const marketsWithModel = new Set((board.leans ?? []).filter((l) => Number.isFinite(l.projection) && Number.isFinite(l.sigma)).map((l) => l.marketKey));
  assert.ok(!marketsWithModel.has("pitcher_outs"), "pitcher_outs is not a modeled board market");
  for (const m of marketsWithModel) assert.ok(MODELED.has(m), `board only models supported markets (got ${m})`);
});

test("3 · pitcher_outs is NOT product-eligible (not in the report's deterministic-settle product set)", () => {
  const report = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
  // the report's product-eligibility uses DETERMINISTIC_SETTLE = keys of MARKET_LABEL; pitcher_outs must NOT be
  // a modeled/eligible market. The coverage note names it market-context, not product-eligible.
  assert.match(report, /Pitcher outs[\s\S]{0,120}market context only|market context only[\s\S]{0,160}not product-eligible/, "report frames outs as market-context, not product-eligible");
  // and pitcher_outs is not in the modeled MARKET_LABEL order that drives eligibility
  assert.ok(!/MLB_MARKET_ORDER = \[[^\]]*Outs recorded[^\]]*\]/.test(report), "pitcher_outs is not in the modeled market order");
});

test("4 · money md5 unchanged (the whole exercise is analysis-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
