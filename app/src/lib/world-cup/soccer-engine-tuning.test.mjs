/**
 * Soccer engine tuning — honesty + internal-only guards. Tuning did NOT beat the defaults out-of-sample, so:
 * defaults are unchanged, every tuned/diagnostic artifact is internal-only and publicReady:false, and nothing
 * leaks to app/public or out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectMatch } from "./internal-soccer-projection-engine.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

test("engine DEFAULTS are unchanged (tuning was not adopted): supremacy 0.0035, no draw inflation", () => {
  // A known matchup must give the untuned probabilities; adopting the tuned config would change these.
  const p = projectMatch({ homeFifaPoints: 1700, awayFifaPoints: 1500 }).matchResult90;
  assert.ok(Math.abs(p.homeWin - 0.5381) < 1e-3, `default homeWin ~0.538, got ${p.homeWin.toFixed(4)}`);
  assert.ok(Math.abs(p.draw - 0.2451) < 1e-3, `default draw ~0.245, got ${p.draw.toFixed(4)}`);
});

test("grid-search artifact: internal-only, CV + bootstrap recorded, gain not robust", () => {
  const g = read("data/internal/world-cup/projection-engine/tuning/2022-wc-grid-search.json");
  assert.equal(g.public, false);
  assert.equal(g.internalOnly, true);
  assert.equal(g.webServed, false);
  assert.equal(g.officialMoneyRecordAffected, false);
  assert.ok(g.crossValidation && typeof g.crossValidation.cvImprovement === "number", "CV recorded");
  assert.ok(g.bootstrap && g.bootstrap.gainLogLoss_untunedMinusTuned, "bootstrap CI recorded");
  // The honest finding: CV improvement is negative (overfits) OR bootstrap not robust.
  assert.ok(g.crossValidation.cvImprovement < 0 || g.bootstrap.robust95 === false, "tuning does not robustly beat default");
});

test("tuned backtest artifact: internal-only and NOT public-ready", () => {
  const t = read("data/internal/world-cup/projection-engine/backtests/2022-wc-tuned.json");
  assert.equal(t.public, false);
  assert.equal(t.internalOnly, true);
  assert.equal(t.webServed, false);
  assert.equal(t.verdict.publicReady, false, "never public-ready without a market baseline");
  assert.equal(t.marketBaseline.available, false, "2022 market baseline honestly unavailable");
});

test("semis diagnostic: internal-only, notForProducts, tuned shown as reference-only", () => {
  const d = read("data/internal/world-cup/projection-engine/diagnostics/2026-semis-tuned-vs-market.json");
  assert.equal(d.public, false);
  assert.equal(d.internalOnly, true);
  assert.equal(d.notForProducts, true);
  assert.equal(d.webServed, false);
  assert.ok(d.fixtures.every((f) => f.market && f.untuned && f.tunedRefOnly), "market/untuned/tunedRefOnly present");
});

test("NO leak: tuned/diagnostic soccer artifacts are not under app/public", () => {
  for (const dir of ["public/data/world-cup/projection-engine", "public/data/world-cup/tuning"]) {
    assert.ok(!fs.existsSync(path.join(APP, dir)), `${dir} must not exist under app/public`);
  }
});
