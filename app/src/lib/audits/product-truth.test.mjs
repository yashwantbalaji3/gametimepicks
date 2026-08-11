/**
 * Product-truth audit guards (Program 160 · Release A).
 * Run: npx tsx --test src/lib/audits/product-truth.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildProductTruthAudit, KNOWN_EXCEPTIONS } from "./product-truth.mjs";

const APP = process.cwd();
// NOW derives from the artifacts on disk: the daily cadence moves capture stamps forward, so a
// frozen literal here goes stale and fires false capture-future P0s (receipt-#2 lesson, P161).
const STAMP_MAX = Math.max(...["nfl", "nba", "ufc"].map((s) => Date.parse(JSON.parse(fs.readFileSync(path.join(APP, "public", "data", s, "schedule", "latest.json"), "utf8")).generatedAt)));
const NOW = new Date(STAMP_MAX + 3_600_000).toISOString();
const FIXTURE_STAMP = new Date(STAMP_MAX).toISOString();

test("the committed audit reconciles every repeated figure with zero contradictions", () => {
  const audit = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "data", "internal", "audits", "product-truth-v1.json"), "utf8"));
  assert.equal(audit.dataClass, "PRIVATE_AUDIT");
  assert.equal(audit.totals.p0, 0, JSON.stringify(audit.contradictions.slice(0, 3)));
  assert.equal(audit.totals.contradictions, 0);
  assert.ok(audit.totals.facts >= 8, "record, bankroll, crown, exposure, capture ages, EPL state — all owned");
  const owners = new Set(audit.facts.map((f) => f.owner));
  assert.ok(owners.has("portfolio.json"), "the protected portfolio is the money authority");
});

test("DETERMINISM · same inputs produce identical bytes", () => {
  const a = JSON.stringify(buildProductTruthAudit({ now: NOW, appRoot: APP }));
  const b = JSON.stringify(buildProductTruthAudit({ now: NOW, appRoot: APP }));
  assert.equal(a, b);
});

test("CONTRADICTIONS fire fail-closed on corrupted copies — and exceptions never excuse a figure mismatch", () => {
  const real = buildProductTruthAudit({ now: NOW, appRoot: APP });
  assert.equal(real.totals.p0, 0);
  const base = {
    portfolio: { record: { wins: 19, losses: 14, voids: 0, pending: 0 }, currentBankroll: 19065.4, crownBankroll: 20465.4, openExposure: 0 },
    dailyPortfolio: { date: "2026-08-10", activeBankroll: 19065.4, crownBankroll: 20465.4, openExposure: 0 },
    ledger: null, newestBoardDate: "2026-08-10",
    captures: {
      nfl: { generatedAt: FIXTURE_STAMP },
      nba: { generatedAt: FIXTURE_STAMP },
      ufc: { generatedAt: FIXTURE_STAMP },
      eplResults: { state: "PRESEASON", rows: [] },
    },
  };
  const run = (over) => buildProductTruthAudit({ now: NOW, appRoot: APP, artifacts: { ...base, ...over } });
  assert.ok(run({ dailyPortfolio: { ...base.dailyPortfolio, activeBankroll: 19000 } }).contradictions.some((c) => c.id === "bankroll-mismatch"), "a drifted bankroll copy is a P0");
  assert.ok(run({ dailyPortfolio: { ...base.dailyPortfolio, crownBankroll: 1 } }).contradictions.some((c) => c.id === "crown-mismatch"));
  assert.ok(run({ portfolio: { ...base.portfolio, openExposure: 500 } }).contradictions.some((c) => c.id === "exposure-without-pending"), "exposure with zero pending is internally incoherent");
  // A one-day lead is the documented morning window; anything beyond is still fabrication.
  const lead1 = run({ dailyPortfolio: { ...base.dailyPortfolio, date: "2026-08-11" } });
  assert.equal(lead1.contradictions.length, 0);
  assert.ok(lead1.exceptionsApplied.some((e) => e.id === "products-precede-morning-board"));
  const lead2 = run({ dailyPortfolio: { ...base.dailyPortfolio, date: "2026-08-12" } });
  assert.ok(lead2.contradictions.some((c) => c.id === "money-ahead-of-board"), "a two-day future money state stays P0 — the morning-window exception refuses to stretch");
  // The documented lag exception applies ONLY to its own class, within its bound.
  const lag1 = run({ dailyPortfolio: { ...base.dailyPortfolio, date: "2026-08-09" } });
  assert.equal(lag1.contradictions.length, 0);
  assert.ok(lag1.exceptionsApplied.some((e) => e.id === "money-lags-newest-board"));
  const lag3 = run({ dailyPortfolio: { ...base.dailyPortfolio, date: "2026-08-07" } });
  assert.ok(lag3.contradictions.some((c) => c.id === "slate-date-lag-exceeded"), "beyond the documented bound the exception refuses to stretch");
});

test("every known exception carries id, rationale, evidence, and a review condition", () => {
  for (const ex of KNOWN_EXCEPTIONS) {
    assert.ok(ex.id && ex.matches && ex.rationale && ex.evidence && ex.review, ex.id);
  }
});

test("PUBLIC EXCLUSION · no product-truth audit content under public data", () => {
  const pub = path.join(APP, "public", "data");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith(".json") && /"artifact":\s*"product-truth-audit"/.test(fs.readFileSync(path.join(d, x.name), "utf8")) ? [x.name] : []);
  assert.deepEqual(walk(pub), []);
});
