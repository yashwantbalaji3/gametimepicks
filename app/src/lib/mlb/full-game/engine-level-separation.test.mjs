/**
 * P317 SEPARATION (Phase 5F). ENGINE_LEVEL_PASS may change the simulation's scoring environment only through its registered
 * adoption path; nothing in the app may react to the shadow, and nothing may unpause an MLB call from it. The live-record
 * gate reading the scorecard is the ONLY path that pauses or lifts a public MLB call.
 * Run: npx tsx --test src/lib/mlb/full-game/engine-level-separation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) out.push(p); } return out; };
const src = walk(path.join(APP, "src"));
const rel = (p) => path.relative(APP, p);

test("only the generator and the candidates module know the engine-level candidate; the prediction, gate, market and product layers never do", () => {
  const importers = src.filter((p) => /engine-candidates|engine-level-shadow|ENGINE_LEVEL_(PASS|FAIL)|engineParamsFor/.test(fs.readFileSync(p, "utf8"))).map(rel);
  assert.deepEqual(importers.sort(), ["src/lib/mlb/full-game/engine-candidates.ts"], `unexpected readers of the shadow: ${importers.join(", ")}`);
  const scripts = fs.readdirSync(path.join(APP, "scripts")).filter((f) => f.endsWith(".mjs") && /engine-candidates/.test(fs.readFileSync(path.join(APP, "scripts", f), "utf8")));
  assert.deepEqual(scripts, ["generate-mlb-full-game-simulations.mjs"], "only the full-game generator runs the candidate, as a second run beside the public one");
});

test("the public simulation is built without engine params, and the pause/lift of an MLB call reads the scorecard only", () => {
  const gen = fs.readFileSync(path.join(APP, "scripts/generate-mlb-full-game-simulations.mjs"), "utf8");
  assert.match(gen, /const games = inputs\.map\(\(input\) => simulateFullGame\(input, \{ \.\.\.opts, generatedAt \}\)\);/, "the public artifact's simulate call carries no engine override");
  assert.doesNotMatch(gen.split("P317 ENGINE-LEVEL SHADOW")[0], /engine: shadowCandidate/, "the candidate is only used after the public artifact is built");
  const gate = fs.readFileSync(path.join(APP, "src/lib/ops/live-record-gate.mjs"), "utf8");
  assert.match(gate, /GATED_FAMILIES/, "the gate names its families");
  assert.doesNotMatch(gate, /engine-level|ENGINE_LEVEL|receipt\.json/, "the gate never reads a research receipt");
  for (const f of ["src/lib/mlb/prediction/decision.ts", "src/lib/markets/pairing.ts", "src/lib/command-center/featured.ts", "src/lib/today/market-coverage.ts"]) {
    const p = path.join(APP, f); if (!fs.existsSync(p)) continue;
    assert.doesNotMatch(fs.readFileSync(p, "utf8"), /engine-level|ENGINE_LEVEL|engine-candidates/, `${f} never reads the shadow`);
  }
});
