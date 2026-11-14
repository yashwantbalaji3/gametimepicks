/**
 * The player board's filter form on a phone (2026-11-14): two columns with Matchup on its own row, instead of five
 * stacked fields (365px before the first player row). Layout only — every field, label and 44px target stays.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./projection-board.tsx", import.meta.url)), "utf8");

test("the filter form is two columns on a phone, with Matchup spanning both", () => {
  assert.match(src, /<form className=\{`grid gap-2 grid-cols-2 \$\{hasPositions \? "lg:grid-cols-5" : "lg:grid-cols-4"\} min-w-0`\} role="search" aria-label="Filter the player board"/);
  assert.match(src, /<label className=\{`\$\{FIELD\} col-span-2 sm:col-span-1`\} htmlFor=\{`\$\{uid\}-m`\}/);
});

test("every filter keeps its label, accessible name and 44px target", () => {
  for (const name of ["Filter by game", "Filter by team", "Search players by name", "Filter by position", "Choose which stats to show"]) {
    assert.ok(src.includes(`aria-label="${name}"`), name);
  }
  assert.match(src, /const INPUT = "w-full min-w-0 min-h-\[44px\]/);
  assert.equal(src.split("className={INPUT}").length - 1, 5);
});
