/**
 * PUBLIC LANGUAGE SCAN — the user-visible MLB report components must not carry betting-coded or model-
 * overclaiming labels. Comments are stripped first (they explain intent), then the remaining source — the
 * text a public reader can see — is checked for the forbidden standalone phrases. Identifiers like
 * `edgePct` / `edgeTxt` / `lowerEdge` are safe: `\bedge\b` needs a word boundary, which they don't have.
 * The approved public vocabulary is "model gap" / "model lead" / "watchlist" / "market snapshot".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

// Every component that renders inside the public MLB game report (primary + collapsed advanced detail).
const REPORT_COMPONENTS = [
  "src/components/game/mlb-simulation-report-v2.tsx",
  "src/components/game/game-simulation-runner.tsx",
  "src/components/game/mlb-game-center.tsx",
  "src/components/game/mlb-simulation-result-summary.tsx",
  "src/components/game/report-v2-shell.tsx",
  "src/components/game/answer-first-report.tsx",
];

const FORBIDDEN = /\bedge\b|\block\b|best bet|positive EV|\bguaranteed\b|beat the market|market-beating|sure thing/i;

test("no betting/edge language is visible in any MLB report component (comment-stripped)", () => {
  for (const rel of REPORT_COMPONENTS) {
    const body = stripComments(read(rel));
    const m = body.match(FORBIDDEN);
    assert.ok(!m, `${rel} has forbidden public label ${m ? JSON.stringify(m[0]) : ""} — use "model gap" / "model lead" / "watchlist"`);
  }
});

test("the primary V2.5 report keeps the required honest scaffolding", () => {
  const v2 = read("src/components/game/mlb-simulation-report-v2.tsx");
  assert.match(v2, /player-prop sim/i, "labelled a player-prop simulation");
  assert.match(v2, /market-anchored, not an independent game simulation/i, "market snapshot is market-anchored");
  assert.match(v2, /full-game model[\s\S]*?validating/i, "full-game model shown as validating");
  assert.match(v2, /Player simulation board/i, "the player board section exists");
  assert.match(v2, /Market agreement/i, "the market-agreement section exists");
  assert.doesNotMatch(v2, /projected score of|win probability of \d/i, "no public full-game numbers");
});

test("money untouched (display-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
