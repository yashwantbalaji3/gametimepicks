/**
 * Daily-product-ops / forward-coverage panel guards (P211 · Release F) — the builders render their
 * writers' artifacts VERBATIM and type absence as the finding. Synthetic artifact dirs only; the
 * live panel reads the same functions against the real appDir.
 *
 * Run: npx tsx --test src/lib/launch/daily-product-ops.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDailyProductOps, buildForwardCoveragePanel } from "./daily-product-ops.mjs";

function scaffold(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ops-panel-"));
  const appDir = path.join(root, "app");
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(content));
  }
  return appDir;
}

test("a missing receipt or coverage artifact is the finding, never an empty green panel", () => {
  const appDir = scaffold({});
  assert.equal(buildDailyProductOps({ appDir }).present, false);
  assert.match(buildDailyProductOps({ appDir }).finding, /MISSING_DAILY_EVALUATION/);
  assert.equal(buildForwardCoveragePanel({ appDir }).present, false);
});

test("the ops table quotes the receipt verbatim: state, policy, counts, last transition, incident", () => {
  const appDir = scaffold({
    "data/internal/products/receipts/2026-08-26.json": {
      date: "2026-08-26", generatedAt: "g", watchdog: [{ product: "moonshot", kind: "INCIDENT_OPEN", detail: "x" }],
      lifecycleStates: ["EVALUATING"],
      products: [
        {
          product: "bank-builder", label: "Bank Builder", candidatesEvaluated: 4,
          rejections: [{ lane: "A" }, { lane: "B" }], reason: "nothing met policy",
          card: [{ id: "c", exposure: 100 }],
          lifecycle: { state: "NO_PLAY", policyVersion: "bank-builder@1", evidence: { lockAt: null }, transitions: [{ to: "EVALUATING", runId: "open" }, { to: "NO_PLAY", runId: "eval:x" }] },
        },
        { product: "end-zone-vault", label: "Vault" }, // no lifecycle → not a signature-product row
      ],
    },
  });
  const ops = buildDailyProductOps({ appDir });
  assert.equal(ops.present, true);
  assert.equal(ops.products.length, 1, "only lifecycle-typed products render in the ops table");
  const bb = ops.products[0];
  assert.equal(bb.state, "NO_PLAY");
  assert.equal(bb.policyVersion, "bank-builder@1");
  assert.equal(bb.evaluated, 4);
  assert.equal(bb.rejected, 2);
  assert.equal(bb.exposure, 100);
  assert.equal(bb.lastTransition, "NO_PLAY (eval:x)");
  assert.deepEqual(ops.watchdog, [{ product: "moonshot", kind: "INCIDENT_OPEN", detail: "x" }]);
});

test("the newest dated artifact wins; the coverage panel carries counts and findings untouched", () => {
  const sports = [{ sport: "epl", state: "DERIVED", counts: { scheduled: 3, priced: 2, generated: 1, frozen: 0, started: 0 }, findings: ["GENERATION_PENDING:1 x"] }];
  const appDir = scaffold({
    "data/internal/products/forward-coverage/2026-08-25.json": { date: "2026-08-25", generatedAt: "old", sports: [] },
    "data/internal/products/forward-coverage/2026-08-26.json": { date: "2026-08-26", generatedAt: "new", sports },
  });
  const panel = buildForwardCoveragePanel({ appDir });
  assert.equal(panel.date, "2026-08-26");
  assert.deepEqual(panel.sports[0].counts, sports[0].counts);
  assert.deepEqual(panel.sports[0].findings, sports[0].findings);
});
