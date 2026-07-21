/**
 * SIMULATION RESULT POLISH (UX mission, Phase 3). Pins the stronger final panel in the runner (matchup +
 * model version + freshness) and the honest-language guarantees (N-run only when real, no banned copy,
 * paper-only). The per-pick detail — the edge-ranked strongest lean, the board's core fields, and the
 * "not simulated / never faked" declarations — now lives in the primary V2.5 report
 * (`mlb-simulation-report-v2.tsx`); public copy uses "gap"/"model gap"/"model lead", never a visible
 * "edge" label. No money change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const runner = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");
const v2 = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|Monte Carlo|live betting/i;

test("the final 'Simulation complete' panel is stronger: matchup + model version + freshness", () => {
  assert.match(runner, /Simulation complete/, "the completion badge");
  assert.match(runner, /view\.teams \? \(/, "renders the matchup from view.teams");
  assert.match(runner, /view\.teams\.away/, "shows the away team");
  assert.match(runner, /view\.teams\.home/, "shows the home team");
  assert.match(runner, /freshnessLabel\(view\.generatedAt\)/, "shows artifact freshness");
  assert.match(runner, /Model<\/span> \{dash\(view\.modelVersion\)\}/, "shows the model version");
});

test("the top edge-ranked pick is the strongest lean (V2.5 board + watchlist are edge-ranked)", () => {
  assert.match(v2, /const boardPicks = \[\.\.\.picks\]\.sort\(\(a, b\) => b\.edgePct - a\.edgePct\)/, "the board is edge-ranked (strongest gap first)");
  assert.match(v2, /const watchlist = boardPicks\.filter\(\(p\) => p\.edgePct > 0\)\.slice\(0, 5\)/, "the biggest-leads watchlist takes the top edge-ranked picks");
  assert.ok(v2.includes("Biggest model leads"), "the strongest leans surface as 'Biggest model leads'");
});

test("N-run copy stays gated on a REAL runCount (no fabricated run claim)", () => {
  assert.match(runner, /view\.allowsRunCountClaim && view\.runCount != null/, "run count gated on allowsRunCountClaim");
  // The fallback when a run count is NOT claimable is a neutral label, never a fabricated number.
  assert.match(runner, /: "model simulation"/, "falls back to a plain 'model simulation' label");
});

test("the V2.5 player board shows the core per-pick fields (proj / model / market / gap + product tag)", () => {
  // The board header carries the model-vs-market columns (public copy: no visible 'edge' label — 'Gap').
  for (const col of ['"Proj"', '"Model %"', '"Mkt %"', '"Gap"', '"Product"']) {
    assert.ok(v2.includes(col), `board column present: ${col}`);
  }
  assert.match(v2, /<ProductChip tag=\{tag\} \/>/, "each row carries a product tag");
  // The real per-pick fields drive the cells (never fabricated).
  assert.match(v2, /num1\(p\.projection\)/, "projection cell");
  assert.match(v2, /pct\(p\.modelProbability\)/, "model probability cell");
  assert.match(v2, /pct\(p\.marketProbability\)/, "market probability cell");
});

test("unsupported outputs are declared, never faked; distributions gated on real data (V2.5)", () => {
  // Full-game score is explicitly "Not simulated" (declared, not fabricated).
  assert.match(v2, /label="Full-game score" value="Not simulated"/, "full-game score declared not simulated, never faked");
  // Distributions only render from a real, non-empty artifact block; honest empty state otherwise.
  assert.match(v2, /distEntries\.length > 0 \?/, "histograms only when a real block exists");
  assert.ok(v2.includes("we never fabricate a spread"), "no fabricated distributions");
});

test("paper-only copy present; NO banned copy anywhere in the runner", () => {
  assert.ok(/paper-only|Paper-only/i.test(runner), "paper-only framing present");
  assert.ok(!BANNED.test(runner), "no banned/hype/certainty copy");
});

test("the polish touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
