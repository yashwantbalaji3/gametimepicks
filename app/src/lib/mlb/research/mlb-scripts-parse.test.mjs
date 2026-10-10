/**
 * Merge guard: the MLB forecast generator and the research capture scripts must PARSE. A bad merge of two branches
 * that both import from engine.ts produced a duplicate import in generate-mlb-full-game-simulations.mjs (2026-10-10),
 * which no unit test exercised; the workflow would have failed at runtime. `node --check` catches it in CI.
 *
 * Run: npx tsx --test src/lib/mlb/research/mlb-scripts-parse.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPTS = [
  "scripts/generate-mlb-full-game-simulations.mjs",
  "scripts/generate-mlb-predictions.mjs",
  "scripts/mlb/capture-mlb-forward-player-live.mjs",
  "scripts/mlb/capture-mlb-boxscore-outcomes.mjs",
  "scripts/mlb/verify-forward-player-live.mjs",
];
for (const s of SCRIPTS) {
  test(`${s} parses`, () => {
    const r = spawnSync(process.execPath, ["--check", path.join(APP, s)], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
}
