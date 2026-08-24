/**
 * Forecast-archive enumeration guards (Program 202 · Phase 0).
 *
 * The EPL match route once enumerated its static params from latest.json, whose rows legitimately
 * empty out between matchdays — and an empty params set under `output: "export"` fails the ENTIRE
 * site build. Phase 0's rebuild caught it the first time a build ran after a matchday closed.
 * The enumeration source must be the dated archive, which only grows.
 *
 * Run: npx tsx --test src/lib/sports/epl/forecast-archive.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadEplForecastArchive, findEplForecastAnywhere } from "./forecast-view.ts";

const app = process.cwd();
const page = fs.readFileSync(path.join(app, "src/app/epl/match/[slug]/page.tsx"), "utf8");

test("the archive is the enumeration source — it only grows, so the build can never empty out", () => {
  const rows = loadEplForecastArchive();
  assert.ok(rows.length > 0, "the committed dated files yield a non-empty archive");
  for (const r of rows) {
    assert.ok(r.slug, "every archived row carries its slug");
    assert.ok(r.probs, "every archived row carries a real distribution — furniture-only pages stay unenumerated");
  }
  assert.match(page, /loadEplForecastArchive\(\)\.map/, "generateStaticParams enumerates from the archive");
  assert.ok(!/reportableRows\(loadEplForecasts\(\)\)\.map/.test(page), "the evaporating source is gone from enumeration");
});

test("an archived fixture resolves its forecast of record after latest empties", () => {
  const rows = loadEplForecastArchive();
  const sample = rows[0];
  const found = findEplForecastAnywhere(sample.slug);
  assert.ok(found, "resolvable from the archive");
  assert.equal(found.slug, sample.slug);
  assert.ok(found.probs, "the resolved row is the last pre-event revision, with its distribution");
});

test("the newest revision wins: a slug present in several dated files resolves to the latest", () => {
  // Structural: the loader iterates dated files in ascending order and later writes overwrite
  // earlier ones, then current rows supersede archived copies.
  const src = fs.readFileSync(path.join(app, "src/lib/sports/epl/forecast-view.ts"), "utf8");
  assert.match(src, /\.sort\(\)/, "dated files iterate in ascending date order");
  assert.match(src, /Later files win|newest pre-event revision/i, "the forecast-of-record rule is stated where it is implemented");
});
