/**
 * THE RESULTS COHORT MUST RECONCILE, AND THE PAGE MUST SHOW THE DENOMINATOR IT DIVIDES BY.
 *
 * 🔴 THE DEFECT, reproduced on the committed artifact (comparison_report_2026-09-25):
 *
 *     batter_hits        total 197 · wins 100 · losses 76 · pushes 0 · voids 21 · rate 56.8%
 *     rendered as        "100–76 · 197 dec · 56.8%"
 *
 * A reader who divides 100 by 197 gets 50.8% and concludes the RATE is wrong. It is not — the rate
 * is 100/176, and the DATA reconciles at every level: headline, byMarket and byConfidence all
 * satisfy `total = wins + losses + pushes + voids`. The display contradicted correct data, which is
 * the harder defect to notice and the same loss of trust. Three of four markets were affected.
 *
 * ⚠ AND THE TYPE HAD DROPPED `voids`. The producer has always written it; `MlbBucket` did not
 * declare it, so no consumer could render it. Twenty-one rows of batter_hits were invisible.
 *
 * Run: cd app && npx tsx --test src/lib/mlb-results-cohort.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const Breakdown = (await import("../components/mlb/mlb-results-breakdown.tsx")).default;

const APP = process.cwd();
const DIR = path.join(APP, "public/data/mlb/results");

/** The newest committed comparison report that carries bucket splits. */
function newestReport() {
  let best = null;
  for (const f of fs.readdirSync(DIR).sort()) {
    if (!f.startsWith("comparison_report_") || !f.endsWith(".json")) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      if (j?.byMarket && j?.byConfidence) best = { file: f, report: j };
    } catch { /* a malformed archive row is not this test's subject */ }
  }
  return best;
}

const found = newestReport();

test("a committed comparison report with bucket splits exists — otherwise this suite is vacuous", () => {
  assert.ok(found, `no comparison_report_*.json with byMarket/byConfidence under ${DIR}`);
  assert.ok(Object.keys(found.report.byMarket).length > 0);
});

test("🔴 §6 · every bucket reconciles: total = wins + losses + pushes + voids", { skip: !found }, () => {
  const { report } = found;
  for (const setName of ["byMarket", "byConfidence"]) {
    for (const [key, b] of Object.entries(report[setName])) {
      assert.equal(
        b.total, b.wins + b.losses + b.pushes + b.voids,
        `${setName}.${key}: total ${b.total} != ${b.wins}+${b.losses}+${b.pushes}+${b.voids}`,
      );
    }
  }
});

test("🔴 §6 · the headline reconciles, and `decisive` is wins + losses", { skip: !found }, () => {
  const r = found.report;
  assert.equal(r.decisive, r.wins + r.losses, "decisive must be the two-sided outcomes only");
  assert.equal(r.settled, r.wins + r.losses + r.pushes + r.voids, "settled must account for every row");
  if (r.decisive > 0) assert.ok(Math.abs(r.hitRate - r.wins / r.decisive) < 1e-9,
    "the headline rate must be computed over decisive");
});

test("🔴 §6 · every bucket's rate is over ITS decisive count, never over its total", { skip: !found }, () => {
  for (const setName of ["byMarket", "byConfidence"]) {
    for (const [key, b] of Object.entries(found.report[setName])) {
      const dec = b.wins + b.losses;
      if (dec === 0) { assert.equal(b.hitRate, null, `${key}: an empty cohort has no rate`); continue; }
      assert.ok(Math.abs(b.hitRate - b.wins / dec) < 1e-9,
        `${setName}.${key}: rate ${b.hitRate} != ${b.wins}/${dec}`);
      /* The thing that was actually wrong: a rate over `total` would be a different number. */
      if (b.total !== dec) {
        assert.ok(Math.abs(b.hitRate - b.wins / b.total) > 1e-9,
          `${key}: the rate happens to equal wins/total — this test cannot tell the two apart here`);
      }
    }
  }
});

test("🔴 §6 · the RENDERED row shows the decisive denominator the rate divides by", { skip: !found }, () => {
  const html = renderToStaticMarkup(React.createElement(Breakdown, { report: found.report }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  let checked = 0;
  for (const [key, b] of Object.entries(found.report.byMarket)) {
    const dec = b.wins + b.losses;
    if (b.total === dec) continue;           // nothing to distinguish on this row
    checked += 1;
    assert.match(text, new RegExp(`${dec} dec`),
      `${key}: the page must print "${dec} dec", the denominator of its own rate`);
    assert.equal(new RegExp(`${b.total} dec`).test(text), false,
      `${key}: the page printed "${b.total} dec" — that is the bucket total, not the decisive count`);
  }
  assert.ok(checked > 0, "no market has voids today, so this assertion proved nothing — widen the fixture");
});

test("🔴 voided rows are NAMED, not absorbed into a total nobody can explain", { skip: !found }, () => {
  const html = renderToStaticMarkup(React.createElement(Breakdown, { report: found.report }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let checked = 0;
  for (const [key, b] of Object.entries(found.report.byMarket)) {
    if (b.voids === 0) continue;
    checked += 1;
    assert.match(text, new RegExp(`${b.voids} void`), `${key}: ${b.voids} voided rows are invisible`);
  }
  assert.ok(checked > 0, "no voids in today's artifact — this assertion proved nothing");
});

test("a bucket with no decisive outcomes shows no rate rather than 0%", { skip: !found }, () => {
  const empty = { label: "empty_market", total: 3, wins: 0, losses: 0, pushes: 0, voids: 3, hitRate: null };
  const html = renderToStaticMarkup(React.createElement(Breakdown, {
    report: { ...found.report, byMarket: { empty_market: empty }, byConfidence: {} },
  }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.match(text, /0 dec/);
  assert.match(text, /3 void/);
  /*
   * ⚠ SCOPED TO THE BUCKET ROW. The first cut searched the whole page for /0\.0%/ and matched the
   * headline's "50.0%" — my regex, not the component's defect. The claim is about THIS row.
   */
  const row = text.slice(text.indexOf("empty_market"));
  const upTo = row.slice(0, 80);
  assert.match(upTo, /—/, "an empty cohort shows a dash, not a percentage");
  assert.equal(/\b0\.0%/.test(upTo), false, "an empty cohort must not read as 0-for-N performance");
});
