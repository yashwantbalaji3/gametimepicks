/**
 * THE PERFORMANCE READ MODEL — Program 233 · Release B.
 *
 * Run: npx tsx --test src/lib/results/read-model.test.mjs
 *
 * Five ledgers were already correct and already separate. What did not exist was any way for a
 * reader to ask a question of them: `/results` shipped zero filter controls — no record-type
 * selector, no sport filter, no date range, no risk tier — so every number on it was a headline with
 * no path to the rows underneath.
 *
 * This model projects; it never computes. The tests below are mostly about what it must REFUSE to
 * do, because the dangerous operations here are all additions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildResultRows, filterRows, poolRows, rate, interval, RECORD_TYPES, RISK_TIERS,
} from "./read-model.mjs";

const APP = process.cwd();
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8")); } catch { return null; } };

const sources = {
  labLedger: read("parlays/lab-ledger.json"),
  gradedBySport: Object.fromEntries(
    ["mlb", "ufc", "epl", "nfl"].map((s) => [s, read(`${s}/graded-picks.json`)]).filter(([, v]) => v),
  ),
  portfolio: read("mr-dub/portfolio.json"),
  moonshot: read("product-ledger/moonshot.json"),
};
const rows = buildResultRows(sources);

test("ZERO DECISIVE IS UNAVAILABLE — never 0%, never 100%", () => {
  /*
   * The single most misleading number this page could render. A tier with no settled cards has no
   * hit rate; 0% there reads as "this strategy loses every time" when nothing has been graded.
   */
  const empty = rate(0, 0);
  assert.equal(empty.value, null);
  assert.equal(empty.available, false);
  assert.match(empty.reason, /no settled/);

  for (const r of rows) {
    if (r.decisive === 0) {
      assert.equal(r.hitRate.value, null, `${r.recordType}/${r.sport}/${r.tier}: a rate over zero decisive selections`);
      assert.equal(r.interval, null, "and no interval either");
    }
  }
});

test("REFUSAL · pooling across record types throws", () => {
  /*
   * A suggested paper slip and a single model pick are different populations. A combined total would
   * imply one record where there are three, and it is how a losing lane disappears into a winning
   * one. This is a throw, not a warning.
   */
  const mixed = [
    ...filterRows(rows, { recordType: RECORD_TYPES.SUGGESTED_PARLAY }).slice(0, 1),
    ...filterRows(rows, { recordType: RECORD_TYPES.MODEL_PICK }).slice(0, 1),
  ];
  if (mixed.length === 2) {
    assert.throws(() => poolRows(mixed), /refusing to pool across record types/);
  }
});

test("pooling adds WINS AND LOSSES, never averages rates", () => {
  /*
   * Averaging per-tier percentages weights a two-card tier the same as a forty-card one. The check:
   * a hand-computed pool must equal the model's.
   */
  const tiers = filterRows(rows, { recordType: RECORD_TYPES.SUGGESTED_PARLAY, sport: "mlb" }).filter((r) => r.tier);
  if (tiers.length < 2) return;
  const pooled = poolRows(tiers);
  const manualW = tiers.reduce((n, r) => n + r.wins, 0);
  const manualL = tiers.reduce((n, r) => n + r.losses, 0);
  assert.equal(pooled.wins, manualW);
  assert.equal(pooled.losses, manualL);
  assert.ok(Math.abs(pooled.hitRate.value - manualW / (manualW + manualL)) < 1e-12);

  /* And the average-of-rates answer must be DIFFERENT, or this test proves nothing. */
  const decisiveTiers = tiers.filter((t) => t.hitRate.available);
  if (decisiveTiers.length > 1) {
    const avgOfRates = decisiveTiers.reduce((n, t) => n + t.hitRate.value, 0) / decisiveTiers.length;
    assert.ok(Math.abs(avgOfRates - pooled.hitRate.value) > 1e-9,
      "the two methods coincide on this data, so this fixture cannot detect the mistake");
  }
});

test("LIVE · a sport's pooled tiers reconcile to its own stream record", () => {
  /*
   * Source-to-view agreement, recomputed by hand from the ledger rather than trusted. If the
   * projection dropped or double-counted a tier this is where it shows.
   */
  const lab = sources.labLedger;
  if (!lab) return;
  for (const s of lab.streams ?? []) {
    const tiers = filterRows(rows, { recordType: RECORD_TYPES.SUGGESTED_PARLAY, sport: s.id }).filter((r) => r.tier);
    if (!tiers.length) continue;
    const pooled = poolRows(tiers);
    assert.equal(pooled.wins, s.record.wins, `${s.id}: tier wins must sum to the stream record`);
    assert.equal(pooled.losses, s.record.losses, `${s.id}: tier losses must sum to the stream record`);
    assert.deepEqual(
      RISK_TIERS.filter((t) => tiers.some((r) => r.tier === t)).sort(),
      tiers.map((r) => r.tier).sort(),
      `${s.id}: every projected tier is a known risk tier`,
    );
  }
});

test("REFUSAL · a calibration record carries no money fields", () => {
  /*
   * Model picks are NON_MONEY. A `staked` column appearing on one would make it summable with the
   * paper products one artifact down — the failure the ledger separation exists to prevent.
   */
  for (const r of filterRows(rows, { recordType: RECORD_TYPES.MODEL_PICK })) {
    assert.equal(r.staked, null, `${r.sport}: a model-pick record must not carry a stake`);
    assert.equal(r.returned, null, `${r.sport}: nor a return`);
  }
});

test("a filter that matches nothing returns nothing — it does not widen", () => {
  /* A filter that quietly ignores itself shows a reader the wrong population under the right label. */
  assert.deepEqual(filterRows(rows, { sport: "not-a-sport" }), []);
  assert.deepEqual(filterRows(rows, { recordType: "not-a-type" }), []);
});

test("the interval is a real band and narrows with n", () => {
  const small = interval(1, 1);
  const large = interval(100, 100);
  assert.ok(small.high - small.low > large.high - large.low, "more evidence, tighter band");
  for (const b of [small, large]) {
    assert.ok(b.low >= 0 && b.high <= 1 && b.low < b.high);
  }
});

test("LIVE · pending is reported, never folded into the denominator", () => {
  for (const r of filterRows(rows, { recordType: RECORD_TYPES.MODEL_PICK })) {
    assert.equal(r.decisive, r.wins + r.losses, `${r.sport}: decisive counts only wins and losses`);
    assert.ok(r.pending >= 0, `${r.sport}: pending is reported`);
    assert.ok(!Number.isNaN(r.settled));
  }
});
