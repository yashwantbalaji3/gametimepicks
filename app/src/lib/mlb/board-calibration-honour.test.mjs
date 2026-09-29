/**
 * P2-A · /mlb/board honours the MLB calibration owner (lib/mlb/model-calibration-status.ts):
 * DISABLE_PREDICTION markets leave the lists and counts; DEMOTE_TO_MARKET_CONTEXT markets are framed as
 * model-vs-market gaps with the owner's disclosure — never as "signals", "clean edge" or confidence.
 * Source guards on the one wiring + a rendered check over the built export when present.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isPredictionDisabled, isCalibrationFailed, MLB_CALIBRATION_DISCLOSURE } from "./model-calibration-status.ts";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("the owner still says what this board must honour", () => {
  assert.equal(isPredictionDisabled("batter_total_bases"), true);
  for (const m of ["pitcher_strikeouts", "batter_hits", "batter_hits_runs_rbis"]) assert.equal(isCalibrationFailed(m), true, m);
  assert.ok(MLB_CALIBRATION_DISCLOSURE.length > 40);
});

test("🔴 the board filters disabled markets once and feeds every list and count from that set", () => {
  const body = code("src/components/mlb/mlb-board-body.tsx");
  assert.match(body, /const leans = \(board\.leans \?\? \[\]\)\.filter\(\(l\) => !isPredictionDisabled\(l\.marketKey\)\);/);
  assert.match(body, /<MlbTopLeansStrip leans=\{leans\}/);
  assert.match(body, /leans=\{leans\}/, "the client lists receive the filtered set");
  assert.doesNotMatch(body, /"batter_total_bases",/, "no by-market chip for a disabled market");
  assert.match(body, /\{MLB_CALIBRATION_DISCLOSURE\}/, "the owner's disclosure is rendered on the board");
});

test("🔴 no 'signal', 'clean edge' or confidence wording is rendered for demoted markets", () => {
  for (const rel of ["src/components/mlb/mlb-board-body.tsx", "src/components/mlb/mlb-top-leans-strip.tsx", "src/components/mlb/mlb-lean-row.tsx"]) {
    const c = code(rel);
    assert.doesNotMatch(c, /Stronger signals?|clean edge|Top clean leans|High &amp; Medium/, `${rel} renders signal/confidence wording`);
    assert.doesNotMatch(c, /label: "(High|Medium|Low)"/, `${rel} labels a tier as confidence`);
  }
  assert.doesNotMatch(code("src/components/mlb/mlb-top-leans-strip.tsx"), /\{lean\.confidence\}/, "the raw tier word is never printed");
});

test("the built board (when present) carries the disclosure and no signal wording", () => {
  const f = path.join(process.cwd(), "out", "mlb", "board", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>")).replace(/<[^>]+>/g, " ");
  assert.match(main, /Market context, not picks\./);
  assert.doesNotMatch(main, /Stronger signals|clean edge ≥ 5 pp|Top clean leans/);
});
