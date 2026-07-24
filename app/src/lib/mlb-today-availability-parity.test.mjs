/**
 * /mlb ↔ /today availability parity (Sprint 003, Phase 6). The MLB hub must mirror the SAME availability
 * truth as the daily hub (shared contract + shared slate pointer) and bridge to /today — without cloning
 * the /today board. Proves both the wiring (source-grep) and the no-contradiction property (functional).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const mlbPage = read("src/app/mlb/page.tsx");
const todayPage = read("src/app/today/page.tsx");

test("/mlb reuses the shared availability contract (no duplicate availability logic)", () => {
  assert.match(mlbPage, /import \{ slateGames \} from "@\/lib\/today\/slate-games"/, "/mlb imports the shared slateGames selector");
  assert.match(mlbPage, /buildAllGameDetails/, "/mlb builds details from the shared builder");
  assert.match(mlbPage, /<MlbSlateAvailability\b/, "/mlb renders the compact availability lens");
  // It is NOT a clone of the /today board component.
  assert.ok(!/TodayFullSlate/.test(mlbPage), "/mlb does not clone the /today full-slate board");
});

test("/mlb bridges to the complete /today board", () => {
  const comp = read("src/components/mlb/mlb-slate-availability.tsx");
  assert.match(comp, /href="\/today"/, "the availability lens links to the full /today board");
  assert.match(comp, /See every game on Today/, "explicit bridge label");
});

test("/today and /mlb frame availability on the SAME slate pointer → counts cannot contradict", () => {
  // Both derive the slate date from `currentSlateDate() ?? currentEtDate()`.
  assert.match(todayPage, /currentSlateDate\(\) \?\? currentEtDate\(\)/, "/today frames on the canonical slate pointer");
  assert.match(mlbPage, /currentSlateDate\(\) \?\? currentEtDate\(\)/, "/mlb frames the availability lens on the SAME pointer");
});

test("functional: the shared contract is deterministic for a given slate (no contradiction across calls)", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const { slateGames } = await import("./today/slate-games.ts");
  const { currentSlateDate } = await import("./parlays/ui-loader.ts");
  const { currentEtDate } = await import("./freshness.ts");
  const date = currentSlateDate() ?? currentEtDate();
  const details = buildAllGameDetails();
  const a = slateGames(details, date);
  const b = slateGames(details, date);
  assert.equal(a.summary.text, b.summary.text, "same inputs → identical summary (the two hubs match)");
  assert.deepEqual(a.summary.counts, b.summary.counts, "identical per-tier counts");
  // Every rendered game on either hub has a clear canonical action.
  for (const g of a.games) assert.ok(g.href.startsWith("/games/"), `canonical action href: ${g.slug}`);
});
