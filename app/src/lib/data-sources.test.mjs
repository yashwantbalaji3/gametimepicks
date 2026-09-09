/**
 * P251-F12 — THE PROVENANCE LINE IS ITSELF PROVENANCE.
 *
 * The footer credited "nba_api", "manual schedule overrides" and "manual news overrides" on all
 * 377 pages, months after NBA became a settled archive and long after any operator override fed a
 * live surface. A hand-maintained source list drifts toward whatever was true when someone last
 * edited it, and on this site that line is load-bearing: it is the reader's only statement of
 * where the numbers came from.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { liveDataSources } from "./data-sources.ts";
import { buildProductDays } from "./product-day/product-day.ts";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data");

test("the footer's sources are DERIVED from the sports actually publishing", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/footer.tsx"), "utf8");
  assert.match(src, /liveDataSources\(/, "the footer calls the derived owner");
  assert.doesNotMatch(src, /meta\.dataSources\.filter/, "no hand-filtered legacy list survives on the live path");
});

test("LIVE · every named source belongs to a sport that is actually publishing", () => {
  const live = new Set(
    buildProductDays(DATA)
      .filter((d) => d.state === "LIVE" || d.state === "EVENT_UPCOMING")
      .map((d) => d.sport),
  );
  const names = liveDataSources(DATA).map((s) => s.name);
  assert.ok(names.length > 0, "the list is never empty — the settlement source is always true");
  assert.equal(new Set(names).size, names.length, "no source is listed twice");
  for (const banned of ["nba_api", "manual schedule overrides", "manual news overrides", "demo data"]) {
    assert.ok(!names.includes(banned), `"${banned}" is not a source of anything published today`);
  }
  // MLB's settlement source appears exactly when MLB is publishing (or as the always-true floor).
  if (live.has("mlb")) assert.ok(names.includes("MLB Stats API"), "baseball names its settlement source");
  if (live.has("nfl") || live.has("epl") || live.has("ufc")) {
    assert.ok(names.includes("ESPN public API"), "the ESPN-fed sports name their capture source");
  }
});

test("a dormant sport contributes no source — the list follows the product-day owner", () => {
  const names = liveDataSources(DATA).map((s) => s.name);
  const live = new Set(
    buildProductDays(DATA)
      .filter((d) => d.state === "LIVE" || d.state === "EVENT_UPCOMING")
      .map((d) => d.sport),
  );
  // openfootball is EPL's alone: it may appear only while EPL has an event ahead.
  assert.equal(names.includes("openfootball"), live.has("epl"),
    "the fixture feed appears exactly when its sport does");
});

test("the stale app-version chip is gone from the footer", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/footer.tsx"), "utf8");
  assert.doesNotMatch(src, /version\{" "\}/, "a frozen build number is not a fact a reader can use");
});
