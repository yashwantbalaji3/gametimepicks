/**
 * Soccer Simulation Report V2 — the clean, reorganized World Cup report. Verifies the SimTheGame-style flow is
 * wired, honest (market-implied, no fake scoreline / no 10k / no internal numbers / no best-bet language), player
 * props are fixture-specific + settlement-pending + product-ineligible, and the old dashboard is demoted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const V2 = read("src/components/game/soccer-simulation-report-v2.tsx");
const PAGE = read("src/components/game/game-detail-page.tsx");

test("the WC report uses SoccerSimulationReportV2, fed the fixture's own player props", () => {
  assert.match(PAGE, /const wcReport = \(\s*<SoccerSimulationReportV2/, "WC post-reveal is the V2 report");
  assert.match(PAGE, /playerProps=\{detail\.playerProps\}/, "V2 gets the fixture-scoped player props (not a global pool)");
  assert.match(PAGE, /postReveal=\{wcReport\}/, "V2 is gated behind Generate (postReveal)");
});

test("no 'Generate Market Dashboard' anywhere; runner CTA stays 'Generate Simulation Report'", () => {
  const runner = read("src/components/game/wc-simulation-runner.tsx");
  assert.doesNotMatch(PAGE, /Generate Market Dashboard/);
  assert.doesNotMatch(V2, /Generate Market Dashboard/);
  assert.doesNotMatch(runner, /Generate Market Dashboard/);
});

test("old advanced report / market dashboard is DEMOTED below the main result, collapsed", () => {
  // In V2, the advanced block renders inside a <details> AFTER methodology.
  const idxMethodology = V2.indexOf("Methodology");
  const idxAdvanced = V2.indexOf("{advanced ?");
  assert.ok(idxAdvanced > idxMethodology && idxMethodology > 0, "advanced dashboard is below methodology");
  assert.match(V2, /AdvancedDisclosure/, "advanced dashboard is a collapsed disclosure");
  const shell = read("src/components/game/report-v2-shell.tsx");
  assert.match(shell, /<details/, "the shared AdvancedDisclosure is a <details> (collapsed)");
  // wiring: the old FreeSim shell + WcGameCenter go into V2's advanced prop, not the primary flow.
  assert.match(PAGE, /advanced=\{wcAdvanced\}/);
});

test("player props section: fixture-specific, settlement-pending, product-ineligible", () => {
  assert.match(V2, /Player props/, "player props section present");
  assert.match(V2, /[Ss]ettlement pending/, "labelled settlement-pending");
  assert.match(V2, /product-ineligible/i, "labelled product-ineligible");
  assert.match(V2, /Anytime goalscorer|goalscorer/i, "goalscorer market");
});

test("honest: no fake 10k soccer claim, no projected scoreline, no independent-model claim", () => {
  const body = V2.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""); // strip comments
  // No POSITIVE fake claim ("Expected goals (xG)" / "NOT an independent soccer model" appear only as honest
  // unavailable/disclaimer copy, which is desirable).
  assert.doesNotMatch(body, /10[,.]?000|projected (final )?score of/i, "no 10k / projected-score claim");
  assert.match(V2, /\b(not|never)\b[\s\S]{0,15}independent[\s\S]{0,15}model/i, "explicitly disclaims being an independent model");
  assert.match(V2, /scoreline model[\s\S]*?validating/i, "score center says scoreline model validating, not a fake score");
  assert.match(V2, /market-implied/i, "labelled market-implied");
});

test("no internal engine numbers surfaced; no best-bet/lock/EV/edge/official-pick language (comment-stripped)", () => {
  const body = V2.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""); // strip comments — check the RENDERED copy
  const banned = /\block\b|best bet|positive EV|\bedge\b|official pick|guaranteed|sure thing/i;
  assert.doesNotMatch(body, banned);
  assert.match(V2, /watchlist/i, "leans are framed as a market watchlist");
  // no internal backtest / brier / logloss numbers leaked into the public component
  assert.doesNotMatch(body, /brier|log ?loss|internal_soccer_projection|0\.59\d/i, "no internal model metrics in the public report");
});

test("bracket impact renders and final/third-place stay TBD (no fabricated opponent)", () => {
  assert.match(V2, /WorldCupBracketImpactCard/, "bracket-impact card in section 8");
  const bracket = read("src/components/world-cup/wc-bracket-impact-card.tsx");
  assert.match(bracket, /TBD/, "final / third-place opponent stays TBD");
});

test("coming-soon section lists the genuinely-unsupported markets, lower in the flow", () => {
  assert.match(V2, /Coming soon/i);
  for (const m of ["Correct score", "xG", "Corners", "Cards", "lineups"]) assert.match(V2, new RegExp(m, "i"), `${m} listed as coming soon`);
  const idxResult = V2.indexOf("Simulation result");
  const idxComing = V2.indexOf("Coming soon");
  assert.ok(idxResult > 0 && idxResult < idxComing, "supported result leads; coming-soon is lower");
});

test("money untouched (this is a display-only report change)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
