/**
 * SIMULATION RESULT POLISH (UX mission, Phase 3). Pins the stronger final panel (matchup + model version +
 * freshness), the "Strongest lean" highlight on the top edge-ranked pick, and the honest-language guarantees
 * (N-run only when real, no banned copy, paper-only, unsupported modules never faked). No money change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const runner = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|Monte Carlo|live betting/i;

test("the final 'Simulation complete' panel is stronger: matchup + model version + freshness", () => {
  assert.match(runner, /Simulation complete/, "the completion badge");
  assert.match(runner, /view\.teams \? \(/, "renders the matchup from view.teams");
  assert.match(runner, /view\.teams\.away/, "shows the away team");
  assert.match(runner, /view\.teams\.home/, "shows the home team");
  assert.match(runner, /freshnessLabel\(view\.generatedAt\)/, "shows artifact freshness");
  assert.match(runner, /Model<\/span> \{dash\(view\.modelVersion\)\}/, "shows the model version");
});

test("the top edge-ranked pick gets a 'Strongest lean' highlight (list is edge-ranked)", () => {
  assert.match(runner, /top=\{i === 0\}/, "the first (highest-edge) pick is flagged top");
  assert.match(runner, /Strongest lean/, "the top pick is highlighted as the strongest lean");
});

test("N-run copy stays gated on a REAL runCount (no fabricated run claim)", () => {
  assert.match(runner, /view\.allowsRunCountClaim && view\.runCount != null/, "run count gated on allowsRunCountClaim");
  // The fallback when a run count is NOT claimable is a neutral label, never a fabricated number.
  assert.match(runner, /: "model simulation"/, "falls back to a plain 'model simulation' label");
});

test("generated pick cards show the core fields (proj / model / market / edge / conf + reasons)", () => {
  for (const label of ["Proj", "Model", "Market", "Edge", "Conf"]) {
    assert.match(runner, new RegExp(`label="${label}"`), `pick card shows ${label}`);
  }
  assert.match(runner, /p\.reasonBullets\.map/, "renders reason bullets");
});

test("unsupported modules are shown as 'not generated', never fabricated; distributions gated on real data", () => {
  assert.match(runner, /not generated/i, "unavailable modules are declared, not faked");
  assert.match(runner, /view\.distributions && Object\.keys\(view\.distributions\)\.length > 0/, "histograms only when a real block exists");
});

test("paper-only copy present; NO banned copy anywhere in the runner", () => {
  assert.ok(/paper-only|Paper-only/i.test(runner), "paper-only framing present");
  assert.ok(!BANNED.test(runner), "no banned/hype/certainty copy");
});

test("the polish touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
