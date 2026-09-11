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
import { assertProtectedLedgerIntact } from "./mr-dub/protected-invariant.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const V2 = read("src/components/game/mlb-simulation-report-v2.tsx");
const PAGE = read("src/components/game/game-detail-page.tsx");

test("MLB report is wired to MlbSimulationReportV2, fed the 10k result summary + fixture props", () => {
  assert.match(PAGE, /const mlbReportDetails = \(\s*<MlbSimulationReportV2/, "MLB post-reveal is the V2 report");
  assert.match(PAGE, /resultSummary=\{mlbResultSummary\}/, "V2 gets the strongest-lean result summary");
  assert.match(PAGE, /playerProps=\{detail\.playerProps\}/, "V2 gets the fixture props");
  assert.match(PAGE, /postReveal=\{mlbGameFirstReport\}/, "gated behind Generate");
});

test("honest scope: player-prop sim + market-anchored snapshot; full-game claims derive from the bundle capability", () => {
  assert.match(V2, /player-prop sim/i, "labelled a player-prop simulation");
  assert.match(V2, /market-anchored, not an independent game simulation/i, "full-game lines are market-anchored");
  // P250: §11 derives from the game's actual bundle — both capability branches must exist, so this tab
  // can never deny a simulation the Overview tab is rendering (the old hardcoded "validating" claim did).
  assert.match(V2, /Full-game simulation · available for this game/, "available branch exists");
  assert.match(V2, /Full-game simulation · not available for this game/, "absent branch exists");
  assert.match(V2, /const fullGameAvailable = !!fullGame\?\.available/, "capability is the single gate");
  // this tab still never renders its own projected score / win probability value
  assert.doesNotMatch(V2, /projected score of|win probability of \d|total-runs distribution:\s*\d/i, "no full-game numbers of its own");
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
  assertProtectedLedgerIntact(APP); // P256: history + crown fixed; bankroll = July base + Rule S fold (was a whole-file md5 pin)
});
