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
  assert.match(pkg.scripts.build, /build-search-index\.mjs[^&]*&& next build/, "the production build writes the index before next build");
  assert.match(pkg.scripts.predev ?? "", /build-search-index\.mjs/, "local dev generates it too");
});
