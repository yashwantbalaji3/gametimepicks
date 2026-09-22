/**
 * The site search index is GENERATED, never committed (P256 · 2026-09-11).
 *
 * Every build rewrites app/public/data/search/index.json, and every bot that commits app/public/data/
 * used to carry its own regenerated copy — so two bots racing over one file produced a merge
 * conflict, and an overnight auto-refresh died on it. The index only matters inside a build: the
 * search overlay fetches it from the built site, and the production build regenerates it first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const REPO = path.join(APP, "..");
const REL = "app/public/data/search/index.json";
const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));

test("the search index is gitignored and not tracked", () => {
  const tracked = execFileSync("git", ["ls-files", "--", REL], { cwd: REPO, encoding: "utf8" }).trim();
  assert.equal(tracked, "", "the generated index must not be committed");
  assert.equal(execFileSync("git", ["check-ignore", REL], { cwd: REPO, encoding: "utf8" }).trim(), REL, "…and ignored, so `git add app/public/data/` can never pick it up");
});

test("every way the site is served generates it first", () => {
  /*
   * The invariant is ORDER: the index is written before `next build` runs, and a failure to write it stops
   * the build. This used to be spelled as adjacency — /build-search-index\.mjs[^&]*&& next build/ — which
   * broke when B5 wrapped each build step in scripts/build/run-phase.mjs, because `next build` stopped
   * sitting immediately after the `&&`. Adjacency was never the requirement; it was a proxy for ordering
   * that happened to hold. Checking positions instead says what is actually meant, and survives any wrapper.
   */
  const build = pkg.scripts.build ?? "";
  const iIndex = build.indexOf("build-search-index.mjs");
  const iNext = build.search(/\bnext build\b/);
  assert.ok(iIndex >= 0, "the production build generates the search index");
  assert.ok(iNext >= 0, "…and runs next build");
  assert.ok(iIndex < iNext, `the index must be generated BEFORE next build (index at ${iIndex}, next build at ${iNext})`);

  // …and the step between them is still a gate, so a failed index generation cannot be walked past
  const between = build.slice(iIndex, iNext);
  assert.match(between, /&&/, "the two steps stay &&-chained");
  assert.doesNotMatch(between, /\|\|\s*true/, "and no step between them is made unconditionally green");
  assert.doesNotMatch(between, /;\s*\S/, "nor sequenced with ';', which would not gate on failure");

  assert.match(pkg.scripts.predev ?? "", /build-search-index\.mjs/, "local dev generates it too");
});
