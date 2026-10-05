/**
 * Session 13 · Phase F — the Simulation Center V2 presentation is INTERNAL until the founder/model gate: guarded in
 * source, pruned from the export, and it reads no market number (the receipt carries none).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const page = fs.readFileSync(path.join(APP, "src/app/preview/simulation-v2/page.tsx"), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("the Simulation Center preview is internal: guarded in source and pruned with /preview", () => {
  assert.match(strip(page), /guardInternalRoute\(\)/, "the page must 404 in the production export");
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune.match(/const INTERNAL_ROUTES = \[([^\]]*)\]/)?.[1] ?? "", /"preview"/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("it labels representative runs and shows no market number (probe: a market read is caught)", () => {
  const MARKET = /marketComparison|moneyline|impliedProbability|overOdds|yesOdds|sportsbook line/;
  assert.ok(!MARKET.test(strip(page)), "control: no market field is read");
  assert.ok(MARKET.test("r.marketComparison.marketHomeWinPct"), "probe");
  assert.match(page, /g\.label/, "the representative-run label comes from the receipt (REPRESENTATIVE SIMULATED GAME)");
  assert.match(page, /illustrations, not the forecast/);
});
