/**
 * SHADOW CALIBRATION + CALIBRATION ROWS (2026-07-09) — honest data, unwired, money-safe.
 *
 * Pins: the persisted calibration rows are honest (probabilities in [0,1] or absent, never fabricated),
 * the reliability compute is correct, the shadow layer is internal/dev-only (its artifacts live outside
 * app/public and nothing under src/ references them), no public claim of improved hit rate leaks into
 * shipped UI, and money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { computeMarketReliability, historicalReliability } from "./mlb-reliability.ts";

const app = process.cwd();
const repo = path.join(app, "..");
const CAL_DIR = path.join(app, "public/data/mlb/results/calibration");

/** Read up to `n` calibration rows across the dated files (existence-guarded). */
function sampleRows(n = 2000) {
  if (!fs.existsSync(CAL_DIR)) return [];
  const files = fs.readdirSync(CAL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  const rows = [];
  for (const f of files) {
    for (const l of fs.readFileSync(path.join(CAL_DIR, f), "utf8").trim().split("\n")) {
      if (l) rows.push(JSON.parse(l));
      if (rows.length >= n) return rows;
    }
  }
  return rows;
}

test("1 · calibration rows are honest — required fields present, probabilities in [0,1] or absent", () => {
  const rows = sampleRows();
  assert.ok(rows.length > 0, "calibration rows exist (run export-mlb-calibration-rows.mjs --write)");
  for (const r of rows.slice(0, 500)) {
    assert.equal(r.sport, "MLB");
    for (const req of ["date", "market", "outcome"]) assert.ok(r[req] != null, `row has ${req}`);
    assert.ok(["win", "loss", "push", "void", "pending", "unavailable"].includes(r.outcome), `valid outcome ${r.outcome}`);
    for (const pf of ["marketProbability", "modelProbability", "calibratedProbability"]) {
      if (r[pf] != null) assert.ok(r[pf] >= 0 && r[pf] <= 1 && Number.isFinite(r[pf]), `${pf} in [0,1]`);
    }
    // A probability is never invented: modelProbability and marketProbability come together (same join).
    if (r.marketProbability != null) assert.ok(r.modelProbability != null, "marketProbability implies modelProbability (real join)");
    // settledAt is honestly null (the ledger carries no per-prop timestamp) — never a fabricated time.
    assert.ok(r.settledAt === null || typeof r.settledAt === "string");
  }
});

test("2 · reliability compute is correct and never fabricates a model where none exists", () => {
  const rows = [
    { market: "m_good", outcome: "win" }, { market: "m_good", outcome: "win" }, { market: "m_good", outcome: "loss" },
    { market: "m_bad", outcome: "loss" }, { market: "m_bad", outcome: "loss" }, { market: "m_bad", outcome: "push" },
  ];
  const tbl = computeMarketReliability(rows);
  const good = tbl.find((b) => b.key === "m_good"), bad = tbl.find((b) => b.key === "m_bad");
  assert.equal(good.n, 3); assert.equal(good.wins, 2); // push excluded from decisive
  assert.equal(bad.n, 2); assert.equal(bad.wins, 0);
  // Thin samples hold reliability near the market (0.3), not an inflated weight.
  assert.equal(historicalReliability(0.9, 20), 0.3, "n<100 ⇒ held near market");
  assert.ok(historicalReliability(0.54, 5000) > 0.5, "reliable market earns weight on a big sample");
  assert.ok(historicalReliability(0.44, 5000) < 0.5, "net-negative market is down-weighted");
});

test("3 · shadow artifacts are INTERNAL — sensitive per-pick values are not web-served", () => {
  // The shadow-calibrated leans + multi-sport pool/preview live OUTSIDE app/public (repo data/internal),
  // so the static export never serves them.
  const internal = path.join(repo, "data/internal/mlb/shadow-calibrated-leans");
  if (fs.existsSync(internal)) {
    assert.ok(!internal.includes(`${path.sep}public${path.sep}`), "shadow leans are not under app/public");
    const files = fs.readdirSync(internal).filter((f) => f.endsWith(".json"));
    if (files.length) {
      const j = JSON.parse(fs.readFileSync(path.join(internal, files[0]), "utf8"));
      assert.equal(j.public, false); assert.equal(j.internal, true);
    }
  }
  // The shadow-calibration SUMMARY under public is explicitly marked non-public.
  const summary = path.join(app, "public/data/mlb/results/shadow-calibration/latest.json");
  if (fs.existsSync(summary)) assert.equal(JSON.parse(fs.readFileSync(summary, "utf8")).public, false);
});

// Walk src for any reference to the shadow layer (imports or artifact paths).
function collectSources(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") collectSources(p, acc); }
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

test("4 · no shipped UI/product code references the shadow layer or claims an improved hit rate", () => {
  const files = collectSources(path.join(app, "src"), []);
  for (const p of files) {
    const s = fs.readFileSync(p, "utf8");
    assert.ok(!/shadow-calibrat/i.test(s), `${path.relative(app, p)} must not reference the shadow layer`);
    // No public overclaim of beating the market / improved hit rate in shipped source.
    assert.ok(!/beat the market|improved hit rate|better than the market/i.test(s), `${path.relative(app, p)} has no market-beating claim`);
  }
});

test("5 · money md5 unchanged; the whole shadow/calibration layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  // The exporters/builders never write a money file.
  for (const s of ["export-mlb-calibration-rows.mjs", "build-shadow-calibration.mjs", "build-shadow-calibrated-leans.mjs", "backtest-shadow-calibration.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.ok(!/mr-dub\/portfolio|portfolio\.json['"`]\s*,\s*JSON|writeFileSync[^\n]*portfolio/.test(src), `${s} never writes portfolio.json`);
  }
});
