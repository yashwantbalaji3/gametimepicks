/**
 * Overnight 10-28 (W5) · explainers: /methodology folds its long reference sections without dropping any; About's
 * May snapshot sits in a dated History disclosure; soccer is described one way (World Cup = market-implied archive,
 * Premier League / Ligue 1 = the match model) on every explainer.
 *
 * Run: cd app && npx tsx --test src/app/methodology/explainer-clarity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("🔴 /methodology: the long reference sections are folded, the disclosures stay open, nothing is dropped", () => {
  const src = code(read("src/app/methodology/page.tsx"));
  const folded = [...src.matchAll(/<Folded title="([^"]+)"[^>]*id="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(folded.map((x) => x[1]).sort(), ["coverage", "inputs", "math", "model-status", "terms"], "five folded sections, each deep-linkable");
  assert.ok(folded.some(([, id]) => id === "model-status"), "the #model-status anchor the status chips link to survives");
  for (const kept of ["By sport — what is published", "Data integrity", "Standing limitations", "The daily workflow"]) {
    assert.match(src, new RegExp(`<Section title="${kept}"`), `${kept} stays open in the reading path`);
  }
  assert.match(src, /title="The market is still the better estimate"/, "the standing limitation is kept");
  assert.match(src, /<MoreDisclosure title=\{title\} summary=\{summary\} id=\{id\}>/, "folded through the shared MoreDisclosure");
  const coverage = src.indexOf('id="coverage"');
  assert.ok(coverage > 0 && src.indexOf("<SimulationCoverageMatrix />", coverage) > coverage, "the coverage matrix is inside its fold");
  for (const block of ["01 · American odds", "07 · Parlay odds", "The prediction-time rule", "PUBLIC_TERM_MEANING[t]", "PUBLIC_STATE_MEANING[k]"]) assert.ok(src.includes(block), `${block} is still on the page`);
});

test("🔴 /about: the May 2026 watchlist is kept word for word inside a dated History disclosure", () => {
  const src = read("src/app/about/page.tsx");
  const open = src.indexOf("data-about-history");
  const close = src.indexOf("</details>", open);
  assert.ok(open > 0 && close > open, "a History disclosure exists");
  const inside = src.slice(open, close);
  assert.match(inside, /History · the model watchlist as it read on May 24, 2026/, "dated in its summary");
  for (const kept of ["Model watchlist — archived snapshot (May 24, 2026)", "8-4 (66.7% on 12)", "6-44 (12.0% on 50)", "No 80%-accuracy"]) assert.ok(inside.includes(kept), `${kept} is kept inside`);
  assert.equal((src.match(/Model watchlist — archived snapshot/g) ?? []).length, 1, "and nowhere else");
  assert.doesNotMatch(src.slice(0, open), /\bopen\b=\{?true|<details open/, "collapsed by default");
});

test("🔴 soccer is described one way: the World Cup is the market-implied archive; EPL and Ligue 1 use the match model", async () => {
  const { COVERAGE_SPORTS } = await import("../../lib/market-coverage.ts");
  const soccer = COVERAGE_SPORTS.find((s) => s.key === "soccer");
  assert.match(soccer.label, /World Cup/, "the market-implied group is named for what it covers");
  assert.match(soccer.note, /Premier League and Ligue 1 forecasts come from their own match model/);
  const { glossaryTerm } = await import("../../lib/glossary.ts");
  const mi = glossaryTerm("market-implied");
  assert.match(mi.long, /World Cup/);
  assert.match(mi.long, /Premier League and Ligue 1 forecasts are different/);
  assert.doesNotMatch(mi.long, /^For soccer and/, "never 'soccer' unqualified as market-implied");
  const { publicSport } = await import("../../lib/public-registry.ts");
  assert.match(publicSport("epl").method, /match model/, "the registry's EPL method is the match model these sentences point to");
  assert.match(publicSport("ligue-1").method, /Premier League match model/);
  const learn = read("src/app/learn/page.tsx");
  assert.match(learn, /name: "Ligue 1", note: `\$\{officialForecastCoverage\("ligue-1"\)/, "/learn lists Ligue 1 from the registry");
});
