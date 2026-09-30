/**
 * S1 (2026-09-30) · what a page leads with. /today used to open with the scorecard change log and the
 * market-coverage provenance above every game; both now follow the slate. Pinned as source ORDER over
 * the page's own JSX, so a later edit that moves them back to the top goes red.
 *
 * Run: npx tsx --test src/lib/uiux/s1-first-viewport-order.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/app/today/page.tsx"), "utf8");
const at = (tag) => { const i = src.indexOf(`<${tag}`); assert.ok(i > 0, `${tag} is mounted on /today`); return i; };

test("/today · the games come before the change log and the market-coverage provenance", () => {
  for (const games of ["TodayGamePredictions", "TodayFullSlate"]) {
    assert.ok(at(games) < at("GameTimeBrief"), `${games} before the change log`);
    assert.ok(at(games) < at("TodayMarketCoverage"), `${games} before market coverage`);
  }
  assert.ok(at("TodayDailySlateHeader") < at("TodayGamePredictions"), "the header still opens the page");
});
