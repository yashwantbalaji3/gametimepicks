/**
 * SIMULATION VISUAL DEPTH (UX mission, artifacts-only). The depth now lives in the primary V2.5 report
 * (`mlb-simulation-report-v2.tsx`): a model-vs-market agreement visual, a projection column, and the
 * biggest-model-leads leans — each built ONLY from real pick fields (modelProbability / marketProbability /
 * projection), null-guarded so a missing field renders an em dash, never a fabricated chart. Distributions
 * stay gated on real, non-empty bins. Public copy uses "gap"/"model gap"/"model lead" (no visible "edge"
 * label). No money change; no banned copy.
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

test("the model-vs-market gap is built ONLY from real model/market probabilities (no fabricated bar)", () => {
  // The priced set (which powers the agreement bars) requires BOTH probabilities to be finite — a missing
  // value is excluded, never charted.
  assert.match(v2, /const priced = picks\.filter\(\(p\) => Number\.isFinite\(p\.modelProbability\) && Number\.isFinite\(p\.marketProbability\)\)/, "priced set requires real model + market probabilities");
  // The per-market agreement bars are drawn only from that priced-derived mean gap.
  assert.match(v2, /width: `\$\{Math\.min\(100, r\.mean \* 400\)\}%`/, "agreement bars are drawn from the real mean gap");
});

test("the projection is shown ONLY from a real projection value, null-guarded (never fabricated)", () => {
  // num1 renders a finite projection or an em dash — never a fabricated number.
  assert.match(v2, /const num1 = \(n: number \| null \| undefined\) => \(typeof n === "number" && Number\.isFinite\(n\) \? n\.toFixed\(1\) : "—"\)/, "projection formatter null-guards a missing value");
  assert.match(v2, /num1\(p\.projection\)/, "the board reads the real projection field");
});

test("distributions still render ONLY from a real, non-empty artifact block (no fake histogram)", () => {
  assert.match(v2, /const distEntries = distributions \? Object\.entries\(distributions\)\.filter\(\(\[, d\]\) => d && Array\.isArray\(d\.bins\) && d\.bins\.length > 0\) : \[\]/, "only non-empty bins are charted");
  assert.match(v2, /distEntries\.length > 0 \?/, "histogram section gated on real bins");
  assert.ok(v2.includes("we never fabricate a spread"), "explicit no-fabrication empty state");
});

test("the strongest lean, model probability, and model gap remain visible (in the V2.5 report)", () => {
  assert.ok(v2.includes("Biggest model leads"), "the biggest model leads (strongest leans) section stays");
  assert.match(v2, /Model <span[\s\S]{0,120}?\{pct\(p\.modelProbability\)\}/, "model probability visible");
  assert.match(v2, /\+\{p\.edgePct\.toFixed\(0\)\} pt lead/, "the model gap (lead) is visible");
});

test("paper-only copy present; NO banned copy anywhere in the runner", () => {
  assert.ok(/paper-only|Paper-only/i.test(runner), "paper-only framing present");
  assert.ok(!BANNED.test(runner), "no banned/hype/certainty copy");
});

test("FUNCTIONAL: today's sim picks carry the real fields the visuals read (modelProbability + projection + line)", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const mlb = buildAllGameDetails().filter((x) => x.sport === "mlb");
  // MLB All-Star break (Jul 13–16): 0 MLB games on the active slate is a valid honest empty state — there
  // are no sim picks to inspect. Assert the pick fields only when the slate carries a ready MLB sim.
  if (mlb.length === 0) return;
  const d = mlb.find((x) => x.gameLabSimulation?.status === "ready");
  const p = d?.gameLabSimulation?.generatedPicks?.[0];
  assert.ok(p, "a generated pick exists");
  assert.ok(typeof p.modelProbability === "number", "modelProbability is real (feeds the edge bar)");
  assert.ok(typeof p.projection === "number" && typeof p.line === "number", "projection + line are real (feed the line track)");
});

test("the visual depth touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
