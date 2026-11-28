/**
 * RENDERED GUARD (phase 2, reads out/) · the built /nfl/builder page with the line rule closed for every game (every
 * build without the display key) prints no line, price, book, record or tier wording and no scenario card — checked on
 * the page's own content (from its eyebrow to its footer links), not the site navigation around it.
 * A keyed build (some game open) is not checked here: builder-lines.test.mjs covers the open state.
 * Run (after a build, from app/): npx tsx --test src/components/products/builder-rendered.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PAGE = path.join(process.cwd(), "out", "nfl", "builder", "index.html");
const FORBIDDEN = /sportsbook|\bline\b|\blines\b|price|\bbook\b|\d\/5|\b[45] (?:for|of) 5\b|tier|data-scenario|data-leg|data-book-availability-note|hit rate|payout|parlay/i;

test("🔴 BUILT · /nfl/builder with every game's line rule closed: no line content, no card", { skip: !fs.existsSync(PAGE) && "no export at out/nfl/builder" }, (t) => {
  const html = fs.readFileSync(PAGE, "utf8");
  const i = html.indexOf("NFL · Scenarios"), j = html.indexOf("Responsible use", i);
  assert.ok(i >= 0 && j > i, "the builder page's content is in the export");
  if (!html.slice(i, j).includes('data-builder-state="UNAVAILABLE"')) { t.diagnostic("a game's line rule is open in this build: the closed-state guard does not apply"); return; }
  const body = html.slice(i, j).replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(body, FORBIDDEN);
  assert.doesNotMatch(html.slice(i, j), /data-scenario|data-leg|data-book-availability-note/);
});
