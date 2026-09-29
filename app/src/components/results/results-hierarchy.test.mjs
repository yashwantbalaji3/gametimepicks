/**
 * #794 PR 3 · /results answers before it asks. Source-order guards over the page and the explorer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("🔴 the explorer shows the selected record BEFORE its filter controls", () => {
  const src = strip(read("src/components/results/results-explorer.tsx"));
  const heading = src.indexOf('id="results-explorer-h"');
  const answer = src.indexOf("{rangeLabel}");
  const firstControl = src.indexOf('htmlFor="results-record-type"');
  assert.ok(heading > 0 && answer > 0 && firstControl > 0, "markers found — a guard that finds nothing proves nothing");
  assert.ok(heading < answer && answer < firstControl, "heading → the record → the controls");
});

test("🔴 the page is named before anything asks the reader to filter", () => {
  const page = strip(read("src/app/results/page.tsx"));
  assert.ok(page.indexOf("<h1") > 0 && page.indexOf("<h1") < page.indexOf("<ResultsExplorer"));
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "one H1 on the page");
});
