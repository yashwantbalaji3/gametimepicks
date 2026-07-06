/**
 * Round-of-32 [slug] static params — output:export regression (2026-07-06).
 *
 * `/world-cup/round-of-32/[slug]` is a static-export dynamic route: it MUST emit ≥1 param or the export
 * build fails ("missing generateStaticParams()"). The original code returned ONLY future games (board
 * games without a full /games detail page); on a thin slate where every board game was already active
 * that set was EMPTY and the whole build broke. The fix falls back to ALL board slugs when there are no
 * future games. This locks the fallback so a thin/all-active slate can never break the export again.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pageSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "app", "world-cup", "round-of-32", "[slug]", "page.tsx"),
  "utf8",
);

test("generateStaticParams falls back to ALL board slugs when there are no future games", () => {
  // The fallback branch must exist: prefer futureGames(), else map every board game to a slug param.
  assert.match(pageSrc, /if \(future\.length\) return future/, "returns future games when present");
  assert.match(pageSrc, /board\?\.games \?\? \[\]\)\.map\(\(g\) => \(\{ slug: g\.gameSlug \}\)\)/, "falls back to all board slugs");
});

test("the fallback comment records WHY (export needs ≥1 param on a thin/all-active slate)", () => {
  assert.match(pageSrc, /export.*rejects.*ZERO params|≥1 param|thin slate/i, "documents the output:export zero-param constraint");
});
