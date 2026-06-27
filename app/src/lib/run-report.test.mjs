/**
 * Daily product-refresh pipeline — the committed report's consistency checks must all hold, so a future
 * pipeline run that breaks money/exposure invariants trips a loud failure instead of shipping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "public", "data");
const report = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "daily-refresh-report.json"), "utf8")); } catch { return null; } })();

test("daily-refresh report exists, is dated, and lists generated products", () => {
  assert.ok(report, "daily-refresh-report.json present");
  assert.match(report.date, /^\d{4}-\d{2}-\d{2}$/, "report is dated");
  const ids = report.generated.map((g) => g.product);
  for (const p of ["bank-builder", "moonshot", "wc-specials", "homer-nukes"]) assert.ok(ids.includes(p), `${p} in the refresh report`);
});

test("daily-refresh consistency checks ALL pass (money frozen, exposure math, no stale-as-active)", () => {
  if (!report) return;
  const c = report.consistency;
  assert.equal(c.canonicalMoneyFrozen, true, "canonical bankroll/crown frozen");
  assert.equal(c.exposureMatchesActiveSeeds, true, "open exposure = Σ active-lane seeds");
  assert.equal(c.availableEqualsActiveMinusExposure, true, "available = active − exposure");
  assert.equal(c.noStaleProductCarriesExposure, true, "no stale product carries exposure");
  // No consistency check is reported as failed.
  assert.ok(!report.warnings.some((w) => /consistency check FAILED/.test(w)), "no failed consistency checks in warnings");
});

test("daily-refresh report settlement is fail-closed (never fabricated)", () => {
  if (!report) return;
  for (const s of report.settled) {
    assert.ok(["official_bundle_present", "awaiting_official_results"].includes(s.status), "settlement status is gated on official results");
  }
});
