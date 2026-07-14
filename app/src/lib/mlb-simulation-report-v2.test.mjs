/**
 * MLB Simulation Report V2 — the same clean shell as soccer, honest MLB data. It stays a 10,000-run PLAYER-PROP
 * simulation + market-anchored full-game snapshot, never surfaces internal full-game numbers (win prob / score /
 * run distribution), and uses no best-bet/lock/EV/edge language.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const V2 = read("src/components/game/mlb-simulation-report-v2.tsx");
const PAGE = read("src/components/game/game-detail-page.tsx");

test("MLB report is wired to MlbSimulationReportV2, fed the 10k result summary + fixture props", () => {
  assert.match(PAGE, /const mlbReportDetails = \(\s*<MlbSimulationReportV2/, "MLB post-reveal is the V2 report");
  assert.match(PAGE, /resultSummary=\{mlbResultSummary\}/, "V2 gets the strongest-lean result summary");
  assert.match(PAGE, /playerProps=\{detail\.playerProps\}/, "V2 gets the fixture props");
  assert.match(PAGE, /postReveal=\{mlbReportDetails\}/, "gated behind Generate");
});

test("honest scope: player-prop sim + market-anchored full-game snapshot; NO internal full-game numbers", () => {
  assert.match(V2, /player-prop sim/i, "labelled a player-prop simulation");
  assert.match(V2, /market-anchored, not an independent game simulation/i, "full-game lines are market-anchored");
  assert.match(V2, /full-game model[\s\S]*?validating/i, "full-game model shown as validating, no numbers");
  // never renders a projected score / win probability / run distribution value
  assert.doesNotMatch(V2, /projected score of|win probability of \d|total-runs distribution:\s*\d/i, "no internal full-game numbers");
});

test("no best-bet/lock/EV/edge/official-pick language (comment-stripped)", () => {
  const body = V2.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(body, /\block\b|best bet|positive EV|\bedge\b|official pick|guaranteed|sure thing/i);
});

test("the old dense report is DEMOTED into a collapsed block below methodology", () => {
  const idxMethodology = V2.indexOf("Methodology");
  const idxAdvanced = V2.indexOf("{advanced ?");
  assert.ok(idxAdvanced > idxMethodology && idxMethodology > 0, "advanced report is below methodology");
  assert.match(V2, /AdvancedDisclosure/, "collapsed disclosure");
  assert.match(PAGE, /advanced=\{mlbAdvanced\}/, "old accordions go into V2's advanced prop");
});

test("previous-slate badge is driven by the real ET clock", () => {
  assert.match(PAGE, /mlbIsPreviousSlate = !!detail\.date && detail\.date < currentEtDate\(\)/);
  assert.match(V2, /Previous slate/, "V2 shows a previous-slate badge");
});

test("soccer + MLB V2 share ONE shell grammar (Section from report-v2-shell)", () => {
  assert.match(V2, /from "@\/components\/game\/report-v2-shell"/, "MLB V2 imports the shared shell");
  assert.match(read("src/components/game/soccer-simulation-report-v2.tsx"), /from "@\/components\/game\/report-v2-shell"/, "soccer V2 imports the shared shell");
});

test("money untouched (display-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
