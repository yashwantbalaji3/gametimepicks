/**
 * MLB MODEL-PERFORMANCE LEDGER (Chunk 9A, 2026-07-09) — operational guarantees.
 *
 * 9A operationalized the money-INDEPENDENT MLB projection-grading ledger: fixed
 * the grader docstring (3→4 markets), added `mlb:grade-results` /
 * `mlb:export-results` npm scripts (idempotent, tested), gave `/mlb/results` an
 * explicit "not the product-card record" separation, and documented the manual
 * pipeline + dormant automation. The by-edge calibration itself already exists
 * and is computed live from the CURRENT settled corpus (`buildMlbAudit`), so
 * these checks pin: money + product-record untouched, the grader lists all four
 * graded markets, the npm scripts are present and correct, the by-edge
 * calibration reconciles exactly to an independent pass over the settled leans
 * (no fabrication), the separation disclaimer is present, and no banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { buildMlbAudit } from "./results-audit-notes.ts";
import { getMlbSettledLeans } from "./data-mlb-results.ts";

const app = process.cwd();
const repo = path.join(app, "..");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
const grader = readRepo("pipeline/mlb/settle_mlb_results.py");
const pkg = JSON.parse(read("package.json"));
const mlbResultsPage = read("src/app/mlb/results/page.tsx");
const doc = readRepo("docs/MLB_MODEL_PERFORMANCE_LEDGER.md");

const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free|easy money/i;
const stripSafeArea = (s) => s.replace(/safe-area-inset/gi, "").replace(/safe-area/gi, "");
const stripComments = (s) =>
  s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── 1. money md5 unchanged ───────────────────────────────────────────────
test("1 · canonical money md5 unchanged", () => {
  const md5 = crypto
    .createHash("md5")
    .update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});

// ── 2. official product-card record untouched ────────────────────────────
test("2 · official product-card record unchanged (19-14)", () => {
  assert.equal(portfolio.record.wins, 19);
  assert.equal(portfolio.record.losses, 14);
});

// ── 3. grader docstring lists all four graded markets ────────────────────
test("3 · grader docstring lists all four graded markets", () => {
  for (const m of [
    "pitcher_strikeouts",
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
  ]) {
    assert.match(grader, new RegExp("- " + m), `docstring lists ${m}`);
  }
});

// ── 4. npm scripts present + correct ─────────────────────────────────────
test("4 · mlb grade/export npm scripts present and correct", () => {
  assert.ok(pkg.scripts["mlb:grade-results"], "mlb:grade-results exists");
  assert.match(pkg.scripts["mlb:grade-results"], /settle_mlb_results/);
  assert.ok(pkg.scripts["mlb:export-results"], "mlb:export-results exists");
  assert.match(pkg.scripts["mlb:export-results"], /export_mlb_results/);
});

// ── 5. by-edge calibration wired from the current settled corpus ─────────
test("5 · MLB by-edge calibration is live over the current settled corpus", () => {
  const summary = buildMlbAudit();
  assert.ok(summary.byEdgeBand.length >= 3, "multiple edge bands present");
  for (const b of summary.byEdgeBand) {
    assert.ok(b.decisive > 0);
    assert.ok(b.hitRate !== null && b.hitRate >= 0 && b.hitRate <= 1);
    assert.equal(b.decisive, b.wins + b.losses, "pushes excluded from decisive");
  }
});

// ── 6. aggregation reconciles to an independent pass (no fabrication) ─────
test("6 · edge-band aggregation matches an independent recount of the settled leans", () => {
  const rows = getMlbSettledLeans();
  const dec = rows.filter((r) => r.outcome === "Win" || r.outcome === "Loss");
  // Replicate lib/results-audit-notes.ts edgeBandLabel exactly (|edge|, pp bands).
  const edgeBand = (e) => {
    if (typeof e !== "number" || Number.isNaN(e)) return "unknown";
    const a = Math.abs(e);
    if (a < 5) return "0–5pp";
    if (a < 10) return "5–10pp";
    if (a < 15) return "10–15pp";
    if (a < 25) return "15–25pp";
    return "25pp+";
  };
  const exp = {};
  for (const r of dec) {
    const k = edgeBand(r.edgePct);
    exp[k] = exp[k] ?? { w: 0, l: 0 };
    if (r.outcome === "Win") exp[k].w++;
    else exp[k].l++;
  }
  const summary = buildMlbAudit();
  assert.equal(summary.totalDecisive, dec.length, "decisive count matches raw corpus");
  assert.ok(summary.byEdgeBand.length >= 1);
  for (const row of summary.byEdgeBand) {
    const e = exp[row.label];
    assert.ok(e, `band ${row.label} exists in the independent recount`);
    assert.equal(row.wins, e.w, `${row.label} wins reconcile`);
    assert.equal(row.losses, e.l, `${row.label} losses reconcile`);
    const expHit = e.w + e.l > 0 ? e.w / (e.w + e.l) : null;
    assert.equal(row.hitRate, expHit, `${row.label} hit rate reconciles`);
  }
});

// ── 7. explicit product-record separation on /mlb/results ────────────────
test("7 · /mlb/results carries an explicit product-record separation", () => {
  assert.match(mlbResultsPage, /Model-performance ledger/i);
  assert.match(mlbResultsPage, /not<\/strong>\s+the official/i);
  assert.match(mlbResultsPage, /never combined/i);
  // Links back to the /results trust center for the official record.
  assert.match(mlbResultsPage, /href="\/results\/"/);
});

// ── 8. no banned copy in the changed surfaces ────────────────────────────
test("8 · no banned copy in the changed MLB surfaces", () => {
  assert.doesNotMatch(stripSafeArea(stripComments(mlbResultsPage)), BANNED);
  assert.doesNotMatch(stripSafeArea(doc), BANNED);
});
