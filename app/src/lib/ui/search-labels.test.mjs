/**
 * P251-F7 — ONE NAME FOR ONE AFFORDANCE, AND EVERY FILTER BOX IS A REAL SEARCH INPUT.
 *
 * Four boards shipped the same control under four labels ("Player name", "Search player…",
 * "Search player or team…", "Search team or player…"), and three of the four were plain text
 * inputs — no clear button, no search keyboard on mobile, and in two cases no accessible name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const BOARDS = [
  "src/components/nfl/player-board.tsx",
  "src/components/ui/player-props-explorer.tsx",
  "src/components/mlb/props-board.tsx",
  "src/components/build-experience.tsx",
];

test("no board types its own search placeholder", () => {
  const offenders = [];
  for (const rel of BOARDS) {
    const s = fs.readFileSync(path.join(APP, rel), "utf8");
    for (const m of s.matchAll(/placeholder="([^"]*)"/g)) {
      // an email field on a signup form is a different affordance and keeps its own words
      if (/@/.test(m[1])) continue;
      offenders.push(`${rel}: "${m[1]}"`);
    }
  }
  assert.deepEqual(offenders, [], `filter placeholders must come from lib/ui/search-labels:\n  ${offenders.join("\n  ")}`);
});

test("every filter box is a search input with an accessible name", () => {
  for (const rel of BOARDS) {
    const s = fs.readFileSync(path.join(APP, rel), "utf8");
    /* JSX attribute values contain braces and ">", so the element is sliced from "<input" to its
       own closing "/>" rather than matched with one expression. */
    const boxes = s.split("<input").slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("/>") + 2))
      .filter((b) => /placeholder=\{SEARCH_/.test(b));
    assert.ok(boxes.length > 0, `${rel} has no filter box using the shared labels`);
    for (const b of boxes) {
      assert.match(b, /type="search"/, `${rel}: a filter box must be type="search"`);
      assert.match(b, /aria-label=\{SEARCH_[A-Z_]*LABEL\}/, `${rel}: a filter box must carry the shared accessible name`);
    }
  }
});

test("the two labels describe two REAL scopes, not one string split in half", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/ui/search-labels.ts"), "utf8");
  assert.match(src, /SEARCH_PLAYERS\s*=/);
  assert.match(src, /SEARCH_PLAYERS_OR_TEAMS\s*=/);
  // A board that carries its own team pills filters players only; a flat pool filters both.
  const nfl = fs.readFileSync(path.join(APP, "src/components/nfl/player-board.tsx"), "utf8");
  assert.match(nfl, /placeholder=\{SEARCH_PLAYERS\}/, "the NFL board has team pills, so its box is player-scoped");
  const build = fs.readFileSync(path.join(APP, "src/components/build-experience.tsx"), "utf8");
  assert.match(build, /placeholder=\{SEARCH_PLAYERS_OR_TEAMS\}/, "the flat leg pool searches both");
});
