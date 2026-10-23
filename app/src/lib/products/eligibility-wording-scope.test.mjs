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
const { default: EligibleUniverse, universeRowReason } = await import("../../components/products/eligible-universe.tsx");
const { SPORT_CAPABILITIES, canEnterModelSuggestions } = await import("../sport-capability-registry.ts");
const { levelASportsShown } = await import("./level-a/model.mjs");
const { levelASuggestions } = await import("./level-a/suggestions.mjs");

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
const AV = { date: "2026-10-22", asOf: "2026-10-22T12:00:00Z", totalEligible: 0, sports: [
  { sport: "mlb", label: "MLB", eligibleLegs: 0, events: 0, marketFamilies: 0, reason: "no events", marketPricedOnly: false },
  { sport: "epl", label: "Premier League", eligibleLegs: 0, events: 0, marketFamilies: 0, reason: "not eligible for prediction products", marketPricedOnly: false },
] };

test("a scoped universe names the products it decides and points to the Parlay Center's own rule", () => {
  const html = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: AV, compact: true, scope: "Bank Builder" }));
  assert.match(html, /Priced-card universe \(Level B\) for Bank Builder · evaluated/);
  assert.match(html, /Parlay Center&#x27;s suggested-card lanes use their own rule/);
  const plain = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: AV, compact: true }));
  assert.match(plain, /Priced-card universe \(Level B\) · evaluated/, "unscoped use is unchanged");
});

test("Bank Builder and Moonshot pass the scope; the Parlay Center pages do not use the product universe", () => {
  // Each page names itself (the same product gate decides both; Bank Builder's page never surfaces Moonshot).
  assert.match(read("src/app/bank-builder/page.tsx"), /<EligibleUniverse availability=\{loadProductAvailability\(\)\} compact scope="Bank Builder" levelASports=\{levelAModel \? levelASportsShown\(levelAModel, "bank-builder"\) : null\} \/>/);
  assert.match(read("src/app/moonshot/page.tsx"), /<EligibleUniverse availability=\{loadProductAvailability\(\)\} compact scope="Moonshot" levelASports=\{levelAModel \? levelASportsShown\(levelAModel, "moonshot"\) : null\} \/>/);
  for (const f of ["src/app/build/page.tsx", "src/app/build/custom/page.tsx", "src/components/parlays/empty-tier-context.tsx"]) assert.doesNotMatch(read(f), /<EligibleUniverse/, f);
});

test("the cross-sport lane sentence names lanes and the separate product gate, in both producers", () => {
  for (const f of ["scripts/parlays/lab-eligibility.mjs", "src/lib/parlays/lab-record.ts"]) {
    const s = read(f);
    assert.match(s, /a cross-sport card needs two sports with an open suggested-card lane; .*'s lane is open` : "no lane is open"\} \(Bank Builder and Moonshot use a separate, stricter gate\)/, f);
    assert.doesNotMatch(s, /needs two live sports; \$\{/, `${f}: the ambiguous "cleared" sentence is gone`);
  }
});

test("TWO LEVELS: where Level A is OPEN, no row says a bare \"not eligible for prediction products\"; each names the priced level and points to Level A", () => {
  const sports = [...SPORT_CAPABILITIES.map((c) => c.key), "unknown-sport"];
  const av = { ...AV, sports: sports.map((k) => ({ sport: k, label: k.toUpperCase(), eligibleLegs: 0, events: 0, marketFamilies: 0, reason: "not eligible for prediction products", marketPricedOnly: false })) };
  const ALL = sports;
  for (const shown of [ALL, null]) {
    const levelA = shown != null;
    const html = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: av, compact: true, scope: "Bank Builder", levelASports: shown }));
    assert.doesNotMatch(html, /eligible for prediction products/, `levelA=${levelA}: the bare Level B verdict never renders`);
    assert.match(html, /Priced-card universe \(Level B\)/);
    for (const k of sports) {
      const row = universeRowReason(k, "not eligible for prediction products", shown);
      assert.match(row, /^not eligible for priced cards/, k);
      assert.equal(/model suggestions \(Level A\) below/.test(row), levelA && canEnterModelSuggestions(k), `${k}: the Level A pointer follows the registry's Level A axis, and only when that section is on the page`);
    }
  }
  const other = universeRowReason("nba", "no events", ["nba"]);
  assert.equal(other, "no events · model suggestions (Level A) below", "other reasons are kept verbatim");
});

test("TWO LEVELS: no page or component prints the bare Level B verdict itself", () => {
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) { const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); if (/not eligible for prediction products/.test(src) && !f.endsWith("eligible-universe.tsx")) hits.push(path.relative(process.cwd(), f)); } } };
  for (const d of ["src/app", "src/components"]) walk(path.resolve(process.cwd(), d));
  assert.deepEqual(hits, [], "the availability reason reaches a page only through EligibleUniverse, which qualifies it");
});

test("POINTER ONLY WHERE SHOWN: Level A on and the sport OPEN, but no pick for it on this page → no pointer", () => {
  const html = renderToStaticMarkup(React.createElement(EligibleUniverse, { availability: AV, compact: true, scope: "Bank Builder", levelASports: ["nba"] }));
  assert.match(html, /Premier League/);
  assert.doesNotMatch(html, /not eligible for priced cards · model suggestions/, "EPL is OPEN for Level A but this page shows no EPL pick");
  assert.equal(canEnterModelSuggestions("epl"), true);
  assert.equal(universeRowReason("epl", "not eligible for prediction products", ["nba"]), "not eligible for priced cards");
  assert.equal(universeRowReason("epl", "not eligible for prediction products", ["epl", "nba"]), "not eligible for priced cards · model suggestions (Level A) below");
  assert.equal(universeRowReason("epl", "not eligible for prediction products", []), "not eligible for priced cards", "Level A on, nothing shown at all");
  /* FIXTURE answer: one EPL-only Moonshot-sized pool, no Bank Builder card, one untiered NBA side. */
  const sel = (o) => ({ sport: "epl", eventId: `fx-${Math.random()}`, eventLabel: "H v A", startUtc: "2026-10-23T19:00:00Z", market: "1x2", selection: { code: "home", label: "H to win" }, probability: 0.45, forecast: { owner: "fx", modelId: null, stampedAt: "2026-10-23T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [], settlement: { grader: "x", market: "1x2", side: "home" }, ...o });
  const model = levelASuggestions({ selections: [sel(), sel(), sel(), sel({ sport: "nba", market: "winner", probability: null })], now: "2026-10-23T14:00:00Z", productDay: "2026-10-23" });
  assert.equal(model.bankBuilder.card, null);
  assert.deepEqual(levelASportsShown(model, "bank-builder"), ["nba"], "Bank Builder shows no card today, only the untiered NBA side");
  assert.deepEqual(levelASportsShown(model, "moonshot"), ["epl", "nba"]);
  assert.deepEqual(levelASportsShown({ ...model, untiered: [] }, "bank-builder"), [], "a day with no NBA games: no NBA pointer");
  assert.deepEqual(levelASportsShown(null, "moonshot"), []);
});
