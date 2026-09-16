/**
 * SINCE YOUR LAST VISIT — built-export guards (v1.1.4). Reads out/ (post-build phase).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { expandLedgers } from "./saved-settlements.mjs";

const OUT = path.join(process.cwd(), "out");

test("SB1 · the saved-settlement projection survives the /data sweep and expands to ledgers", () => {
  const file = path.join(OUT, "data/my/saved-settlements.json");
  assert.ok(fs.existsSync(file), "out/data/my/saved-settlements.json exists");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const ledgers = expandLedgers(doc);
  assert.ok(ledgers && ledgers.mlbGames.length > 100, "real graded rows are present");
  assert.ok(fs.statSync(file).size < 64_000, `${fs.statSync(file).size} B`);
});

test("SB2 · ⚠ /my stays noindex, out of the sitemap, and its static HTML carries no observation state", () => {
  const html = fs.readFileSync(path.join(OUT, "my/index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.equal(/gtp\.observation|"committedAt"|"followedIds"/.test(html), false, "the export is identical for every reader");
  const sitemap = fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
  for (const route of ["/my", "/following", "/saved"]) {
    assert.equal(new RegExp(`${route}/?</loc>`).test(sitemap), false, `${route} is not in the sitemap`);
  }
  assert.match(sitemap, /\/live\/?<\/loc>/, "positive control: a public route is listed");
});
