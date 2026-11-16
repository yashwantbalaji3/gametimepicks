/**
 * RENDERED GUARD (phase 2, reads out/) · the built /nfl/trends page prints line content only for a game whose line gate
 * is open — the game page's rule: NFL_LINE_DISPLAY.public AND a readable line artifact (nflPublicLineRecords).
 * With every listed game closed (every CI build: no key) the page carries no Line column, no record against a line, no
 * book name, no BOOK_AVAILABILITY_NOTE and no sentence about sportsbook lines.
 * Run (after a build, from app/): npx tsx --test src/components/nfl/trends-rendered.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NFL_LINE_DISPLAY } from "../../lib/sports/nfl/line-display.mjs";
import { nflPublicLineRecords } from "../../lib/sports/nfl/public-line-records.mjs";
import { BOOK_AVAILABILITY_NOTE } from "../../lib/sports/odds/eligible-operators.mjs";

const APP = process.cwd();
const PAGE = path.join(APP, "out", "nfl", "trends", "index.html");

test("🔴 BUILT · /nfl/trends carries no line content where every listed game's line gate is closed", { skip: !fs.existsSync(PAGE) && "no export at out/nfl/trends" }, () => {
  const html = fs.readFileSync(PAGE, "utf8");
  assert.match(html, /Recent form vs the official projection/, "the built trends page");
  /* the games the page lists: its row links to /nfl/game/<id>/ */
  const games = [...new Set([...html.matchAll(/\/nfl\/game\/(\d+)\/?#recent-form/g)].map((m) => m[1]))];
  const open = games.filter((id) => NFL_LINE_DISPLAY.public && nflPublicLineRecords(id, { appRoot: APP }) != null);
  if (open.length) return; // an authorized build with a readable artifact: line content may show for those games
  assert.doesNotMatch(html, /data-prop-line|nfl-prop-lines|sportsbook line|Not an over\/under market|Official projection not published/);
  assert.doesNotMatch(html, /<th>Line<\/th>|data-book-availability-note|\d\/5 over|partial record|no pre-kickoff capture|hit rate against a line|record against the line|made-up line/i);
  assert.ok(!html.includes(BOOK_AVAILABILITY_NOTE), "no availability note without a printed book");
  assert.doesNotMatch(html, /\\"line\\":\\"[^"\\]+ at [^"\\]+, captured|"line":"[^"]+ at [^"]+, captured/, "no line caption in the client payload");
});
