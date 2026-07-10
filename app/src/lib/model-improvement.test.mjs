/**
 * MODEL-IMPROVEMENT LOOP + MARKET COVERAGE MATRIX — internal research artifacts, money-walled + honest.
 *
 * Pins: the daily model-improvement recommendations never auto-apply + never touch money; small samples
 * are flagged not-meaningful; the coverage matrix never lets an unavailable market claim a pick; both are
 * internal-only + not imported by public code; and their builders never write a money/public artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const repo = path.join(app, "..");
const readJsonIf = (rel) => { const p = path.join(repo, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
}));

test("1 · model-improvement is founder-gated, never auto-applied, never money", () => {
  const j = readJsonIf("data/internal/model-improvement/latest.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.officialMoneyRecordAffected, false);
  assert.equal(j.safeToAutoApply, false);
  assert.equal(j.requiresFounderApproval, true);
  // A tiny paper sample must not be claimed meaningful.
  if ((j.inputs?.paperTrackRecord?.settledCards ?? 0) < 10) assert.equal(j.sampleMeaningful, false);
  // Raw model performance is labelled research-only, never the official record.
  if (j.inputs?.rawModelPerformance) assert.match(j.inputs.rawModelPerformance.note, /research only|not.*official/i);
});

test("2 · the coverage matrix never lets an unavailable market claim a pick", () => {
  const j = readJsonIf("data/internal/market-readiness/coverage-matrix.json");
  if (!j) return;
  assert.equal(j.public, false);
  for (const r of j.rows) {
    // provider_needed / coming_soon rows must not claim pick generation or product use.
    if (["provider_needed", "coming_soon"].includes(r.status)) {
      assert.equal(r.canGeneratePick, false, `${r.sport} ${r.market} must not generate a pick`);
      assert.equal(r.canUseInProduct, false);
    }
    // A product-eligible market must be settleable.
    if (r.canUseInProduct) assert.notEqual(r.settlementSource, "none", `${r.sport} ${r.market} in a product must settle`);
  }
  assert.match(j.guarantee, /NEVER produces a fabricated pick/i);
});

test("3 · the builders never write a money/public artifact", () => {
  for (const s of ["run-daily-model-improvement.mjs", "build-market-coverage-matrix.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.doesNotMatch(src, /writeFileSync\([^)]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, `${s}: no money write`);
    assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, `${s}: never writes under public/`);
  }
});

test("4 · no public page/component imports the internal research artifacts", () => {
  for (const dir of ["src/app", "src/components"]) {
    for (const f of walk(path.join(app, dir))) {
      const s = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(s, /model-improvement|market-readiness\/coverage/, `${path.relative(app, f)} must not read internal research`);
    }
  }
});

test("5 · the new internal research is NOT web-served", () => {
  for (const d of ["model-improvement", "market-readiness"]) assert.ok(!fs.existsSync(path.join(app, "public/data", d)), `${d} not under app/public`);
});
