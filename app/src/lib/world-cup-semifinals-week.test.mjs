/**
 * World Cup semifinal week (2026-07-14/15) — the predictions are REAL (from soccer_fifa_world_cup odds),
 * and the final + third-place stay TBD (no fabricated matchups). Pins the honest state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8"));

test("July-14 WC projection carries BOTH real semifinals with supported markets", () => {
  const proj = readJson("public/data/world-cup/projections/2026-07-14.json");
  const fixtures = new Set((proj.matches || []).map((m) => `${m.homeTeam} vs ${m.awayTeam}`));
  assert.ok(fixtures.has("France vs Spain"), "France vs Spain (SF1) present");
  assert.ok(fixtures.has("England vs Argentina"), "England vs Argentina (SF2) present");
  // Supported team markets only — no fabricated player props required.
  const markets = new Set((proj.matches || []).map((m) => m.market));
  assert.ok(markets.has("moneyline_90") || markets.has("match_result"), "match-result market present");
});

test("NO fabricated final or third-place fixtures (teams TBD until semifinals finish)", () => {
  const proj = readJson("public/data/world-cup/projections/2026-07-14.json");
  const stages = new Set((proj.matches || []).map((m) => m.stage));
  assert.ok(!stages.has("final"), "no final fixture fabricated");
  assert.ok(!stages.has("3p") && !stages.has("third_place"), "no third-place fixture fabricated");
  const badDates = (proj.matches || []).filter((m) => {
    const d = String(m.matchDate || m.date || "").slice(0, 10);
    return d === "2026-07-18" || d === "2026-07-19";
  });
  assert.equal(badDates.length, 0, "no July-18/19 (3rd-place/final) fixtures fabricated");
});

test("the current semifinal game-report page exists in the build (if a build is present)", () => {
  const dir = path.join(APP, "out/games/world-cup");
  if (!fs.existsSync(dir)) return;
  const slugs = fs.readdirSync(dir);
  // Slate advanced to 2026-07-15: England vs Argentina is the only fixture on the current slate. France
  // vs Spain (07-14) has dropped and no longer builds a report, so it is not required here.
  assert.ok(slugs.some((s) => s.startsWith("england-vs-argentina")), "England vs Argentina report built");
});

test("no July-14 MLB board (All-Star Game is an exhibition, not a real slate)", () => {
  assert.ok(!fs.existsSync(path.join(APP, "public/data/mlb/boards/2026-07-14.json")), "no July-14 MLB board");
});
