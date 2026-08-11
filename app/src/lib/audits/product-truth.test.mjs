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
const NOW = "2026-08-11T03:45:00Z";

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
      nfl: { generatedAt: "2026-08-11T02:00:00Z" },
      nba: { generatedAt: "2026-08-11T02:00:00Z" },
      ufc: { generatedAt: "2026-08-11T02:00:00Z" },
      eplResults: { state: "PRESEASON", rows: [] },
    },
  };
  const run = (over) => buildProductTruthAudit({ now: NOW, appRoot: APP, artifacts: { ...base, ...over } });
  assert.ok(run({ dailyPortfolio: { ...base.dailyPortfolio, activeBankroll: 19000 } }).contradictions.some((c) => c.id === "bankroll-mismatch"), "a drifted bankroll copy is a P0");
  assert.ok(run({ dailyPortfolio: { ...base.dailyPortfolio, crownBankroll: 1 } }).contradictions.some((c) => c.id === "crown-mismatch"));
  assert.ok(run({ portfolio: { ...base.portfolio, openExposure: 500 } }).contradictions.some((c) => c.id === "exposure-without-pending"), "exposure with zero pending is internally incoherent");
  assert.ok(run({ dailyPortfolio: { ...base.dailyPortfolio, date: "2026-08-11" } }).contradictions.some((c) => c.id === "money-ahead-of-board"), "a future money state is fabrication");
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
