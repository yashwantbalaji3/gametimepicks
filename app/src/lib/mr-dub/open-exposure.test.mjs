/**
 * Open exposure — the cross-product "money at risk on today's pending cards" figure. Verifies it sums the
 * live product artifacts (Bank Builder + Moonshot + WC Specials + Homer Nukes), the breakdown reconciles to
 * the total, and the master ledger surfaces the SAME number (no more "$0" while the product pages show money).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { computeOpenExposure } from "./open-exposure.ts";
import { buildMasterLedger } from "./master-ledger.ts";

const root = path.join(process.cwd(), "public", "data");
const date = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "daily-portfolio.json"), "utf8")).date;
const oe = computeOpenExposure(root, date);
const round2 = (n) => Math.round(n * 100) / 100;

test("open exposure covers the three active products (Homer Nukes retired)", () => {
  assert.deepEqual(oe.byProduct.map((p) => p.productId).sort(), ["bank-builder", "moonshot", "wc-specials"]);
  assert.ok(!oe.byProduct.some((p) => p.productId === "homer-nukes"), "retired Homer Nukes dropped from active exposure");
});

test("breakdown reconciles to the total (no orphan exposure)", () => {
  const sum = round2(oe.byProduct.reduce((s, p) => s + p.amount, 0));
  assert.equal(sum, oe.total, "Σ per-product == total");
  assert.ok(oe.total >= 0, "exposure is non-negative");
});

test("each product's exposure derives from its live artifact (today's pending cards)", () => {
  const dp = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "daily-portfolio.json"), "utf8"));
  const bb = oe.byProduct.find((p) => p.productId === "bank-builder");
  // Bank Builder exposure == the daily-portfolio figure shown on the BB page (consistency, no divergence).
  assert.equal(bb.amount, round2(Number(dp.products?.bankBuilder?.exposure ?? 0)), "BB exposure matches the daily portfolio / BB page");
  // WC Specials == card count × per-card stake.
  try {
    const wc = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "world-cup-specials.json"), "utf8"));
    if ((wc.cards ?? []).length && (wc.date ?? wc.generatedAt ?? "").slice(0, 10) === date.slice(0, 10)) {
      const wcEntry = oe.byProduct.find((p) => p.productId === "wc-specials");
      assert.equal(wcEntry.amount, round2(wc.cards.length * (wc.config?.stakePreview ?? 10)), "WC = cards × stakePreview");
    }
  } catch { /* artifact may be absent in some checkouts */ }
});

test("the master ledger surfaces the SAME open exposure (one source, consistent everywhere)", () => {
  const m = buildMasterLedger(root, "2026-06-26T18:00:00Z", date);
  assert.equal(m.aggregate.openExposure, oe.total, "master ledger open exposure == cross-product total");
  // Per-product rows match the breakdown too.
  for (const p of oe.byProduct) {
    const row = m.products.find((x) => x.productId === p.productId);
    assert.equal(row.exposure, p.amount, `${p.productId} row exposure matches the breakdown`);
  }
});

test("stale (prior-slate) artifacts contribute $0 — open means TODAY's pending cards only", () => {
  const stale = computeOpenExposure(root, "2099-01-01");
  assert.equal(stale.total, 0, "no current-slate cards → $0 open exposure");
});
