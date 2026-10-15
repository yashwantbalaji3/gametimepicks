/**
 * GTP-13 — the shared roving-tabs model (components/a11y/use-roving-tabs.ts): arrows wrap, Home/End jump, other keys
 * are ignored, and navigation starts from the FOCUSED tab.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nextTabKey } from "../components/a11y/use-roving-tabs.ts";

test("arrow keys wrap, Home/End jump, anything else is ignored", () => {
  const k = ["a", "b", "c"];
  assert.equal(nextTabKey(k, "a", "ArrowRight"), "b");
  assert.equal(nextTabKey(k, "c", "ArrowRight"), "a");
  assert.equal(nextTabKey(k, "a", "ArrowLeft"), "c");
  assert.equal(nextTabKey(k, "b", "Home"), "a");
  assert.equal(nextTabKey(k, "b", "End"), "c");
  assert.equal(nextTabKey(k, "b", "Enter"), null);
  assert.equal(nextTabKey(k, "z", "ArrowRight"), null, "an unknown key moves nothing");
  assert.equal(nextTabKey([], "a", "ArrowRight"), null);
});

test("navigation starts from the focused tab, and every converted tablist uses the shared hook", () => {
  assert.match(fs.readFileSync("src/components/a11y/use-roving-tabs.ts", "utf8"), /refs\.current\.get\(k\) === e\.target/);
  for (const f of ["src/components/results/results-overview.tsx", "src/components/nfl/forecast/family-tabs.tsx", "src/components/nfl/forecast/game-explorer.tsx",
    "src/components/games/sport-selector.tsx", "src/components/ui/sport-shell.tsx", "src/components/game/mlb-full-game-report.tsx", "src/components/live/live-sport-tabs.tsx"]) {
    assert.match(fs.readFileSync(f, "utf8"), /useRovingTabs/, f);
  }
});
