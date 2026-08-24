/**
 * Filter-chip guards (Program 202 · Release C).
 *
 * Filters SELECT from the ranked owner — never re-rank; chip state lives in the URL so back
 * navigation and refresh restore it; a filtered zero is a statement about the filter, never
 * about a sport's product day.
 *
 * Run: npx tsx --test src/lib/today/top-reads-filter.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadTopReads, topBySport, sportsInSet } from "../top-reads.ts";

const app = process.cwd();
const filterSrc = fs.readFileSync(path.join(app, "src/components/today/top-reads-filter.tsx"), "utf8");
const todaySrc = fs.readFileSync(path.join(app, "src/app/today/page.tsx"), "utf8");

test("RANKING CONSERVATION · filtering preserves the owner's relative order", () => {
  const set = loadTopReads();
  const rows = sportsInSet(set).flatMap((s) => topBySport(set, s, 10));
  // Simulate every single-sport and single-market selection the chips can make.
  const selections = [
    ...sportsInSet(set).map((s) => (r) => r.sport === s),
    ...[...new Set(rows.map((r) => r.market))].map((m) => (r) => r.market === m),
  ];
  for (const pred of selections) {
    const filtered = rows.filter(pred);
    const indices = filtered.map((r) => rows.indexOf(r));
    for (let i = 1; i < indices.length; i++) {
      assert.ok(indices[i] > indices[i - 1], "surviving rows keep the owner's relative order — selection, never a re-rank");
    }
  }
  // Structural: the component filters; it never sorts or re-scores.
  assert.match(filterSrc, /reads\.filter\(/, "the chips select");
  assert.ok(!/\.sort\(|score|rerank/i.test(filterSrc), "the chips never re-rank");
});

test("URL-state persistence: chips read and write the query string, no hidden global state", () => {
  assert.match(filterSrc, /useSearchParams/, "state comes from the URL");
  assert.match(filterSrc, /router\.replace/, "state writes back to the URL");
  assert.ok(!/useContext|createContext|localStorage|sessionStorage/.test(filterSrc), "no hidden store just to preserve chips");
});

test("zero-results honesty: the empty state disclaims product-day semantics in words", () => {
  assert.match(filterSrc, /0 reads match this filter/, "a filtered zero names itself");
  assert.match(filterSrc, /not about any sport.{0,10}s\s*product day/s, "and disclaims product state explicitly");
});

test("the chips sit over the same owner /today already consumes — no second data path", () => {
  assert.match(todaySrc, /TopReadsFilter/, "today renders the filter");
  assert.match(todaySrc, /topBySport\(topReadsSet/, "rows come from the ranked owner's selectors");
  assert.match(filterSrc, /aria-pressed/, "chips are real toggles for keyboard and AT users");
  assert.match(filterSrc, /minHeight: 44/, "44px touch targets");
});
