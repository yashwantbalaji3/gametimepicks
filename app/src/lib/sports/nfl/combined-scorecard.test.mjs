/**
 * P250 · A15 — ONE player-centric report, one filter scope, no silent caps.
 *
 * The P249 combined receiving table was a separate server-rendered block below the filterable
 * board: the team/player filters did not govern it, it silently capped at 14 rows (current games
 * already reach 13), it carried no availability column beside questionable players, and it rounded
 * yards while the board printed hundredths. These guards pin the consolidation: the combined view
 * lives INSIDE the client board (same filter chain), every eligible player is reachable, absence
 * renders "—" (never a `?? 0` zero), the display-precision policy is shared, and the scoring
 * outlook's shortlist labels its own size.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const board = fs.readFileSync(path.join(APP, "src/components/nfl/player-board.tsx"), "utf8");
const page = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");

test("the combined view is a tab of the ONE filterable board — not a second table stack", () => {
  assert.match(board, /Combined · one row per player/, "the combined tab exists in the client board");
  assert.match(board, /isCombined\s*\?/, "the shared filter chain branches for the combined population");
  assert.match(board, /Receptions \(10th–90th\)/, "combined columns present");
  assert.match(board, /"Availability"/, "availability is a column in every view, combined included");
  // The page no longer renders its own copy of the same numbers.
  assert.ok(!page.includes("Receiving, one row per player"), "the server-rendered duplicate table is gone");
  assert.ok(!/slice\(0,\s*14\)/.test(page), "no silent 14-row cap anywhere on the page");
});

test("absence stays absent — no zero fabricated by a fallback, and one precision policy", () => {
  assert.ok(!/Math\.round\([^)]*\?\?\s*0\)/.test(board), "no `?? 0` inside a display rounding");
  assert.ok(!/\?\?\s*0\)/.test(page.slice(page.indexOf("player-board-h"))), "no `?? 0` in the player section of the page");
  assert.match(board, /const yd = \(v: number \| undefined\) =>.*"—"/, "yards formatter renders a dash for absence");
  assert.match(board, /const ct = \(v: number \| undefined\) =>.*"—"/, "count formatter renders a dash for absence");
  // The old volume tabs share the policy instead of printing raw hundredths beside integers.
  assert.match(board, /family === "player_receptions" \? ct\(m\.median\) : yd\(m\.median\)/, "volume tabs use the shared formatters");
});

test("the scoring outlook labels its shortlist size and points at the full list", () => {
  assert.match(page, /top \{top\.length\} of \{eligible\.length\} by TD chance/, "the cap is declared, never silent");
  assert.match(page, /full list in the board/, "the full population is one tab away and says so");
});

test("the dead preseason player-simulations section stayed dead — removed, not resurrected", () => {
  assert.ok(!page.includes('aria-labelledby="sim-players"'), "the section that could never render is gone");
  assert.ok(!page.includes("game-simulations/latest.json"), "the page no longer reads the retired preseason lane");
});

test("player-family model provenance renders from the artifact's own basis lines", () => {
  assert.match(page, /Player-family model provenance/, "the provenance disclosure exists");
  assert.match(page, /x\.basis \?\? "evaluation basis not recorded on the artifact"/, "basis is artifact-backed with an honest absence state");
});
