/**
 * SIMULATION VISUAL DEPTH (UX mission, artifacts-only). The reveal now shows a model-vs-market edge bar
 * and a projection-vs-line track — built ONLY from real pick fields (modelProbability / marketProbability /
 * projection / line / side), each null-guarded so a missing field renders NOTHING (never a fabricated
 * chart). Distributions stay gated on real bins. No money change; no banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const runner = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|Monte Carlo|live betting/i;

test("the edge bar (ProbBar) is built ONLY from real model/market probabilities and null-guards a missing value", () => {
  assert.match(runner, /function ProbBar/, "the model-vs-market bar exists");
  assert.match(runner, /if \(model == null \|\| !Number\.isFinite\(model\)\) return null/, "renders nothing without a real model probability (no fabricated bar)");
  assert.match(runner, /model=\{p\.modelProbability\} market=\{p\.marketProbability\}/, "fed by the real pick fields");
});

test("the projection-vs-line track is built ONLY from real projection/line/side and null-guards missing numbers", () => {
  assert.match(runner, /function ProjVsLine/, "the projection-vs-line visual exists");
  assert.match(runner, /projection == null \|\| line == null \|\| !Number\.isFinite\(projection\) \|\| !Number\.isFinite\(line\)/, "renders nothing without real projection + line");
  assert.match(runner, /projection=\{p\.projection\} line=\{p\.line\} side=\{p\.side\}/, "fed by the real pick fields");
});

test("distributions still render ONLY from a real, non-empty artifact block (no fake histogram)", () => {
  assert.match(runner, /view\.distributions && Object\.keys\(view\.distributions\)\.length > 0/, "histograms gated on real bins");
});

test("the strongest lean, model probability, and edge remain visible", () => {
  assert.match(runner, /Strongest lean/, "the strongest lean highlight stays");
  assert.match(runner, /label="Model"/, "model probability visible");
  assert.match(runner, /label="Edge"/, "edge visible");
});

test("paper-only copy present; NO banned copy anywhere in the runner", () => {
  assert.ok(/paper-only|Paper-only/i.test(runner), "paper-only framing present");
  assert.ok(!BANNED.test(runner), "no banned/hype/certainty copy");
});

test("FUNCTIONAL: today's sim picks carry the real fields the visuals read (modelProbability + projection + line)", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const d = buildAllGameDetails().find((x) => x.sport === "mlb" && x.gameLabSimulation?.status === "ready");
  const p = d?.gameLabSimulation?.generatedPicks?.[0];
  assert.ok(p, "a generated pick exists");
  assert.ok(typeof p.modelProbability === "number", "modelProbability is real (feeds the edge bar)");
  assert.ok(typeof p.projection === "number" && typeof p.line === "number", "projection + line are real (feed the line track)");
});

test("the visual depth touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
