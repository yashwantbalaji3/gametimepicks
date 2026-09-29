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
      /* 2026-09-29: an off day (09-28, the day after the regular season) writes a report whose buckets are
         EMPTY objects. Selecting it on field presence made the anti-vacuity check below fail on the calendar,
         not on the code. "With bucket splits" means splits exist: the newest report with at least one bucket. */
      if (j?.byMarket && j?.byConfidence && Object.keys(j.byMarket).length > 0) best = { file: f, report: j };
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

/**
 * The producer stores the HEADLINE rate rounded to 4dp and the BUCKET rates at full precision.
 * Verified across every committed report: 106 of 107 headline rates do NOT equal `wins / decisive`
 * within 1e-9, going back to the first report in May.
 */
const round4 = (x) => Math.round(x * 1e4) / 1e4;

test("🔴 §6 · the headline reconciles, and `decisive` is wins + losses", { skip: !found }, () => {
  const r = found.report;
  assert.equal(r.decisive, r.wins + r.losses, "decisive must be the two-sided outcomes only");
  assert.equal(r.settled, r.wins + r.losses + r.pushes + r.voids, "settled must account for every row");
  if (r.decisive === 0) return;

  /*
   * 🔴 THIS ASSERTION WAS PASSING ON LUCK, AND IT COST A RED MAIN ON ACCEPTANCE DAY.
   *
   * It demanded `|hitRate - wins/decisive| < 1e-9`, but the producer ROUNDS the headline to 4dp. So it
   * could only pass when the true rate happened to be exactly representable in 4dp — and across 107
   * committed reports exactly ONE is (2026-09-25, whose rate was precisely 0.5). That was yesterday's
   * newest report. Today's settlement wrote 2026-09-26 at 271/474 = 0.5717299578…, stored as 0.5717,
   * and the suite went red on a producer behaviour that has been identical since May.
   *
   * The DEFECT this test exists to catch is a rate divided by the wrong denominator — `settled` (523)
   * instead of `decisive` (474). That error is ~0.05; the rounding is ~3e-5. Comparing against the
   * correctly-ROUNDED exact value separates them without inventing a tolerance: it accepts precisely
   * what the producer emits and still rejects the wrong denominator outright.
   */
  assert.equal(r.hitRate, round4(r.wins / r.decisive),
    `headline ${r.hitRate} != round4(${r.wins}/${r.decisive}) = ${round4(r.wins / r.decisive)}`);

  /* And the guard is not vacuous: the wrong denominator must produce a DIFFERENT rounded value. */
  if (r.settled !== r.decisive) {
    assert.notEqual(round4(r.wins / r.settled), round4(r.wins / r.decisive),
      "with these counts the two denominators round to the same rate, so this guard cannot tell them apart");
  }
});

test("🔴 §6 · the headline is rounded but the BUCKETS are not — one field, two precisions", () => {
  /*
   * Recorded as a finding, not fixed here: correcting the producer would change published MLB Results
   * numbers, which is a founder decision and not something to do on acceptance day. Per the precision
   * convention this repo already adopted for payouts — full precision internally, round only at the
   * display — a stored artifact field should carry full precision, so the HEADLINE is the odd one out.
   *
   * This asserts the inconsistency so that fixing it is a deliberate act that updates this test,
   * rather than a silent change nobody notices.
   */
  if (!found) return;
  const r = found.report;
  if (!r.decisive) return;
  const headlineIsRounded = Math.abs(r.hitRate - r.wins / r.decisive) > 1e-9;
  const buckets = Object.values(r.byMarket ?? {}).filter((b) => b.wins + b.losses > 0);
  if (!buckets.length) return;
  const bucketsAreExact = buckets.every((b) => Math.abs(b.hitRate - b.wins / (b.wins + b.losses)) < 1e-9);
  assert.ok(bucketsAreExact, "bucket rates were exact when measured; if they are now rounded too, the producer changed");
  /* Headline rounding is expected but not guaranteed — a rate that divides evenly is not rounded. */
  if (!headlineIsRounded) {
    assert.equal(r.hitRate, round4(r.wins / r.decisive), "an evenly-dividing rate is consistent either way");
  }
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
