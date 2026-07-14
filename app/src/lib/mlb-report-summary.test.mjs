/**
 * MLB above-the-fold simulation-result summary — honest and artifact-only. It surfaces the strongest 10k
 * player-prop leans + an honest recap, never invents a game score / total-runs / margin distribution, and
 * labels a stale slate as Previous slate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const SUMMARY = read("src/components/game/mlb-simulation-result-summary.tsx");
const PAGE = read("src/components/game/game-detail-page.tsx");

test("summary is honest about scope: player-prop sim, full-game markets are de-vigged lines, no invented distributions", () => {
  assert.match(SUMMARY, /player-prop simulation/i, "labels the 10k sim as a player-prop simulation");
  assert.match(SUMMARY, /de-vigged sportsbook lines/i, "full-game markets are de-vigged lines");
  assert.match(SUMMARY, /market-anchored, not an independent game simulation/i, "not an independent game sim");
  assert.match(SUMMARY, /No projected score, total-runs or margin distribution/i, "never claims a game/total/margin distribution");
});

test("summary surfaces the strongest simulated player-prop leans (ranked by edge)", () => {
  assert.match(SUMMARY, /Strongest simulated player-prop leans/);
  assert.match(SUMMARY, /sort\(\(a, b\) => \(b\.edgePct \?\? 0\) - \(a\.edgePct \?\? 0\)\)/, "ranks by edge desc");
  assert.match(SUMMARY, /model .*vs market/i, "shows model vs market probability");
});

test("stale slate is labelled Previous slate; no fabricated team/scoreline copy", () => {
  assert.match(SUMMARY, /Previous slate/, "renders a Previous-slate badge when stale");
  assert.match(PAGE, /mlbIsPreviousSlate = !!detail\.date && detail\.date < currentEtDate\(\)/, "previous-slate derived from the real ET clock");
  // No fabricated scoreline / projected-score copy.
  assert.doesNotMatch(SUMMARY, /projected (final )?score of|simulated scoreline of|expected goals/i, "no fabricated scoreline");
});

test("the summary is wired above the fold in the MLB report (not buried in an accordion)", () => {
  assert.match(PAGE, /<MlbSimulationResultSummary/, "MLB report renders the result summary");
  // It appears BEFORE the "More detail" accordions in mlbReportDetails.
  const idxSummary = PAGE.indexOf("<MlbSimulationResultSummary");
  const idxMoreDetail = PAGE.indexOf("More detail · expand as needed");
  assert.ok(idxSummary > 0 && idxSummary < idxMoreDetail, "summary is above the collapsible detail");
});

test("no forbidden betting claims in the summary", () => {
  const banned = /\block\b|guaranteed|best bet|positive EV|validated edge|sure thing/i;
  assert.doesNotMatch(SUMMARY, banned);
});
