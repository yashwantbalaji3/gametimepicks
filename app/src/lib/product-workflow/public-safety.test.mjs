/**
 * PUBLIC-SAFETY BOUNDARY — the paper product workflow must be invisible to the public site.
 *
 * Pins: no public page/component imports the product-workflow layer (schema or scripts); paper cards +
 * approvals + ops summaries are NOT web-served (no app/public copy); the Results Trust Center never reads
 * paper cards (the official 19-14 stays isolated); and no public code imports the internal full-game sim
 * (which stays non-driving).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
}));
const publicFiles = [...walk(path.join(app, "src/app")), ...walk(path.join(app, "src/components"))];

test("1 · no public page/component imports the product-workflow layer or its scripts", () => {
  for (const f of publicFiles) {
    const s = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(s, /from\s+["'][^"']*product-workflow/, `${path.relative(app, f)} must not import product-workflow`);
    assert.doesNotMatch(s, /promote-founder-review|settle-paper-product|product-cards\/(paper|approvals|settlements)/, `${path.relative(app, f)} must not reference paper-card internals`);
  }
});

test("2 · the workflow's internal artifacts are NOT web-served", () => {
  // Paper cards, approvals, previews, and the paper ops summary all live under repo-root data/internal.
  // (Note: public/data/ops is a PRE-EXISTING public admin dashboard — unrelated to the paper ops summary.)
  for (const p of ["public/data/product-cards", "public/data/product-previews", "public/data/internal", "public/data/ops/daily-product-summary"]) {
    assert.ok(!fs.existsSync(path.join(app, p)), `${p} must not be web-served`);
  }
});

test("3 · the Results Trust Center never reads the internal paper-card ledger (official 19-14 stays isolated)", () => {
  const resultsFiles = [...walk(path.join(app, "src/app/results")), ...walk(path.join(app, "src/components/results"))];
  for (const f of resultsFiles) {
    const s = fs.readFileSync(f, "utf8");
    // The official record is legitimately a *paper* record; what's forbidden is pulling the INTERNAL
    // product-workflow paper-card ledger into the public trust center.
    assert.doesNotMatch(s, /product-cards\/(paper|approvals|settlements)|from\s+["'][^"']*product-workflow/, `${path.relative(app, f)} must not pull the internal paper-card ledger into official results`);
  }
});

test("4 · no public code imports the internal full-game simulation (stays non-driving)", () => {
  for (const f of publicFiles) {
    const s = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(s, /from\s+["'][^"']*full-game-sim\/mlb/, `${path.relative(app, f)} must not import the internal engine`);
  }
});

test("5 · the workflow scripts declare paper-only + internal-only intent", () => {
  for (const s of ["promote-founder-review-to-paper-card.mjs", "settle-paper-product-cards.mjs", "run-daily-product-ops-summary.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.match(src, /internal|paper/i, `${s} documents its internal/paper intent`);
    assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, `${s} never writes under public/`);
  }
});
