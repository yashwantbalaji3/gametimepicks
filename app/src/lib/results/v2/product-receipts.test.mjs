/**
 * Results V2 · G-4 — a product's receipts are on the day page: each lane's result and every leg with its official
 * score and the owner's grade, read verbatim; a leg the owner has not graded is pending, never a loss.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { productReceiptsFor, productReceiptDates } = await import("./product-receipts.ts");
const { default: ProductReceipts } = await import("../../../components/results/product-receipts.tsx");

test("🔴 the day's receipts are read verbatim — lane results, official scores, owner grades; pending stays pending", () => {
  const dates = productReceiptDates();
  if (!dates.length) { console.log("# no product receipts on disk — announced vacuous"); return; }
  for (const d of dates.slice(0, 10)) {
    const day = productReceiptsFor(d);
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/mr-dub/settled", `${d}.json`), "utf8"));
    assert.equal(day.lanes.length, (raw.lanes ?? []).length, `${d}: every lane`);
    day.lanes.forEach((l, i) => l.legs.forEach((g, j) => {
      const rg = raw.lanes[i].legs[j];
      assert.equal(g.result, String(rg.result ?? "pending"), `${d}: leg grade verbatim`);
      assert.equal(g.official, rg.official != null ? String(rg.official) : null, `${d}: official verbatim`);
    }));
  }
});

test("render: lane, legs, official, grade — and a pending leg is never a loss", () => {
  const html = renderToStaticMarkup(React.createElement(ProductReceipts, { day: { date: "2031-09-23", settledAt: "x", source: "MLB Stats API official box score", lanes: [
    { product: "moonshot", lane: "A", result: "active", legs: [{ matchup: "TOR @ BAL", selection: "Over 7", market: "Total Runs", official: null, result: "pending" }, { matchup: "MIL @ PHI", selection: "MIL -1.5", market: "Run Line", official: "4-1", result: "won" }] },
  ] } }));
  assert.match(html, /Moonshot · lane A/);
  assert.match(html, /Open — a leg is still pending/);
  assert.match(html, /Over 7<span class="m"> · TOR @ BAL/);
  assert.match(html, /Pending — not settled yet/);
  assert.doesNotMatch(html, /Over 7[^<]*<\/td><td>—<\/td><td class="r"><span class="o">Lost/, "a pending leg is not a loss");
  assert.match(html, /Source: MLB Stats API official box score\./);
  assert.equal(renderToStaticMarkup(React.createElement(ProductReceipts, { day: null })), "");
});

test("the day page renders the receipts and generates a page for every receipt day", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/results/date/[date]/page.tsx"), "utf8");
  assert.match(page, /<ProductReceipts day=\{productReceiptsFor\(date\)\} \/>/);
  assert.match(page, /\.\.\.productReceiptDates\(\)\]\)\)\.sort\(\)/);
});
