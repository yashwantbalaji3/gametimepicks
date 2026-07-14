/**
 * World Cup above-the-fold simulation-result summary — a probability center built ONLY from the real
 * market-implied wcGameCenter prices. It frames the de-vigged 90' read as a "simulation result" (3-way bar +
 * total/BTTS/DC/DNB snapshots + no-play/efficient-market explanation) WITHOUT ever claiming an independent
 * soccer model, xG, a projected scoreline, or a 10,000-run count.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const SUMMARY = read("src/components/game/wc-simulation-result-summary.tsx");
const PAGE = read("src/components/game/game-detail-page.tsx");

test("summary is a market-implied 90' read — never an independent soccer sim / xG / scoreline / 10k claim", () => {
  assert.match(SUMMARY, /market-implied/i, "labels the source as market-implied");
  assert.match(SUMMARY, /NOT an independent soccer model/i, "explicitly not an independent soccer model");
  assert.match(SUMMARY, /Extra time and penalties are excluded/i, "90' regulation only");
  // Comment-stripped body must not fabricate the banned soccer-sim claims.
  const body = SUMMARY.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(body, /10[,.]?000|independent soccer sim|projected scoreline of|expected goals\b/i, "no 10k / independent-soccer / projected-scoreline / xG claim in the rendered body");
});

test("surfaces the 3-way win/draw/win probability center + most-likely result", () => {
  assert.match(SUMMARY, /threeWay/, "consumes the 3-way match-result probabilities");
  assert.match(SUMMARY, /Most likely 90′ result/, "names the most-likely result");
  assert.match(SUMMARY, /win/, "labels the win/draw/win bar");
});

test("small/no edge is framed as an efficient-market no-play, not a broken simulation", () => {
  assert.match(SUMMARY, /the market is efficient/i, "efficient-market language");
  assert.match(SUMMARY, /not a broken simulation/i, "reassures a no-play is valid");
});

test("renders total / BTTS / double-chance / draw-no-bet snapshots", () => {
  assert.match(SUMMARY, /Both teams score/i);
  assert.match(SUMMARY, /Double chance/i);
  assert.match(SUMMARY, /Draw no bet/i);
  assert.match(SUMMARY, /Total /);
});

test("the probability center leads the WC report via SoccerSimulationReportV2 (dashboard demoted)", () => {
  // The standalone summary was superseded by SoccerSimulationReportV2, whose section 2 IS the probability center.
  assert.match(PAGE, /<SoccerSimulationReportV2/, "WC report is the V2 simulation report");
  const idxReport = PAGE.indexOf("<SoccerSimulationReportV2");
  const idxAdvanced = PAGE.indexOf("advanced={wcAdvanced}");
  assert.ok(idxReport > 0 && idxReport < idxAdvanced, "V2 report leads; old dashboard demoted into its advanced prop");
});

test("no forbidden betting claims in the summary", () => {
  const banned = /\block\b|guaranteed|best bet|positive EV|validated edge|sure thing|lock of the/i;
  assert.doesNotMatch(SUMMARY, banned);
});
