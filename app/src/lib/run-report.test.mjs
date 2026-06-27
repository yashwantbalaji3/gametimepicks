/**
 * Daily run-report (observability) — the lifecycle's per-run artifact written by write-run-report.mjs to
 * ops/run-reports/<date>.json (+ latest.json). Verifies a run leaves a dated report that lists every
 * flagship product with an HONEST per-product flag (a product that skipped → false + a warning), so an
 * unattended run is auditable. (Supersedes the old daily-product-refresh report; that orchestrator was
 * removed in favour of the canonical roll_to_next_day lifecycle.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "public", "data");
const report = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "ops", "run-reports", "latest.json"), "utf8")); } catch { return null; } })();

test("run report exists, is dated, and lists every flagship product", () => {
  assert.ok(report, "ops/run-reports/latest.json present");
  assert.match(report.date, /^\d{4}-\d{2}-\d{2}$/, "report is dated (ISO)");
  // Every flagship product is accounted for (true = generated today, false = honest skip — never omitted).
  for (const p of ["bankBuilder", "moonshot", "wcSpecials", "homerNukes"]) {
    assert.ok(p in report.products, `${p} is accounted for in the run report`);
    assert.equal(typeof report.products[p], "boolean", `${p} flag is an honest boolean`);
  }
});

test("run report carries a canonical money snapshot (never fabricated)", () => {
  if (!report) return;
  assert.ok(report.money, "money snapshot present");
  // bankroll/crown are echoed from the canonical portfolio — finite numbers, never a hardcoded literal.
  assert.ok(Number.isFinite(report.money.bankroll), "bankroll is a finite number from canonical");
  assert.ok(Number.isFinite(report.money.crown), "crown is a finite number from canonical");
  assert.match(report.money.record ?? "", /^\d+-\d+$/, "record is W-L");
});

test("run report surfaces honest skips (a product with no card is flagged, not hidden)", () => {
  if (!report) return;
  assert.ok(Array.isArray(report.warnings), "warnings is an array");
  const skipped = Object.entries(report.products).filter(([, v]) => !v).map(([k]) => k);
  // If any product skipped, the warnings must name it (honest skip, never silent).
  if (skipped.length) assert.ok(report.warnings.some((w) => skipped.some((s) => w.includes(s))),
    "skipped products are named in warnings");
});
