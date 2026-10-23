/**
 * Two gates, said per product (sprint 2026-10-23 follow-up). The product eligible universe (capability registry →
 * eligible-leg builder) decides Bank Builder and Moonshot; the Parlay Center's suggested-card lanes follow the lab
 * lane gate (prices + official settlement + depth, behind the registry's may-show rule). Wording must name which.
 * Run: npx tsx --test src/lib/products/eligibility-wording-scope.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: EligibleUniverse } = await import("../../components/products/eligible-universe.tsx");

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
const AV = { date: "2026-10-22", asOf: "2026-10-22T12:00:00Z", totalEligible: 0, sports: [
  { sport: "mlb", label: "MLB", eligibleLegs: 0, events: 0, marketFamilies: 0, reason: "no events", marketPricedOnly: false },
  { sport: "epl", label: "Premier League", eligibleLegs: 0, events: 0, marketFamilies: 0, reason: "not eligible for prediction products", marketPricedOnly: false },
] };

test("a scoped universe names the products it decides and points to the Parlay Center's own rule", () => {
  const html = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: AV, compact: true, scope: "Bank Builder" }));
  assert.match(html, /Eligible universe for Bank Builder · evaluated/);
  assert.match(html, /Parlay Center&#x27;s suggested-card lanes use their own rule/);
  const plain = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: AV, compact: true }));
  assert.match(plain, /Eligible universe · evaluated/, "unscoped use is unchanged");
});

test("Bank Builder and Moonshot pass the scope; the Parlay Center pages do not use the product universe", () => {
  // Each page names itself (the same product gate decides both; Bank Builder's page never surfaces Moonshot).
  assert.match(read("src/app/bank-builder/page.tsx"), /<EligibleUniverse availability=\{loadProductAvailability\(\)\} compact scope="Bank Builder" \/>/);
  assert.match(read("src/app/moonshot/page.tsx"), /<EligibleUniverse availability=\{loadProductAvailability\(\)\} compact scope="Moonshot" \/>/);
  for (const f of ["src/app/build/page.tsx", "src/app/build/custom/page.tsx", "src/components/parlays/empty-tier-context.tsx"]) assert.doesNotMatch(read(f), /<EligibleUniverse/, f);
});

test("the cross-sport lane sentence names lanes and the separate product gate, in both producers", () => {
  for (const f of ["scripts/parlays/lab-eligibility.mjs", "src/lib/parlays/lab-record.ts"]) {
    const s = read(f);
    assert.match(s, /a cross-sport card needs two sports with an open suggested-card lane; .*'s lane is open` : "no lane is open"\} \(Bank Builder and Moonshot use a separate, stricter gate\)/, f);
    assert.doesNotMatch(s, /needs two live sports; \$\{/, `${f}: the ambiguous "cleared" sentence is gone`);
  }
});
