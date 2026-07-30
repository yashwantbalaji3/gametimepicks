/**
 * MARKET DISAGREEMENT EXPLORER — the arithmetic and the words.
 *
 * Two classes of failure are pinned here.
 *
 * STATISTICAL. A rate with no denominator, a rate over a withheld slate, a 0% that is really "no
 * observations", a market whose predictions are switched off appearing in a magnitude-ordered list.
 * Each of those has a specific precedent in this codebase, and each is cheap to reintroduce by moving
 * one line of arithmetic into a component where no test can reach it. So the numbers are asserted from
 * the library that produces them, including against the shipped artifact.
 *
 * EDITORIAL. The copy is scanned as RENDERED STRINGS, not as source text. Grepping a `.tsx` file finds
 * the words a developer typed; scanning the output of the copy functions finds the words a reader
 * actually gets, including the ones assembled at runtime from three fragments.
 *
 * Run: npx tsx --test src/lib/research/disagreement-explorer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAP_BUCKETS,
  brierScore,
  bucketForGap,
  buildGapBucketTable,
  largestGapCaution,
  noVigProbability,
  orderByEventTime,
  rankByGap,
  wilsonInterval,
} from "./disagreement-buckets.ts";
import {
  EXPLORER_ELIGIBILITY_NOTE,
  EXPLORER_INTRO,
  EXPLORER_PROBABILITY_NOTE,
  EXPLORER_TITLE,
  SETTLEMENT_LABEL,
  analyticsMarketFamily,
  bucketSentence,
  buildExplorerRows,
  explorerUnavailableReason,
  marketPolicy,
  orderExplorerRows,
  settlementStateOf,
  toExplorerRowViews,
  toGapBucketViews,
} from "./disagreement-explorer.ts";
import { loadExplorer, loadGapHistory } from "./disagreement-explorer-loader.ts";
import { COVERAGE_LABEL, COVERAGE_MEANING } from "./row-lineage.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.cwd();

const histRow = (over = {}) => ({
  date: "2026-07-25",
  marketKey: "batter_hits",
  gapPp: 6,
  statedProbability: 0.6,
  won: true,
  countsTowardRates: true,
  ...over,
});

// ── the arithmetic ─────────────────────────────────────────────────────────────

test("the Wilson interval matches its closed form and refuses an empty denominator", () => {
  const ci = wilsonInterval(50, 100);
  assert.ok(Math.abs(ci.low - 0.4038) < 0.001, `low was ${ci.low}`);
  assert.ok(Math.abs(ci.high - 0.5962) < 0.001, `high was ${ci.high}`);
  assert.equal(wilsonInterval(0, 0), null, "an interval around no observations is not a wide interval");
  const tight = wilsonInterval(5000, 10000);
  assert.ok(tight.high - tight.low < ci.high - ci.low, "more rows must narrow the interval");
});

test("the Brier score is the mean squared error, and null on an empty set", () => {
  assert.equal(brierScore([]), null);
  assert.equal(brierScore([{ statedProbability: 1, won: true }]), 0);
  assert.equal(brierScore([{ statedProbability: 0, won: true }]), 1);
  assert.equal(
    brierScore([{ statedProbability: 0.6, won: true }, { statedProbability: 0.6, won: false }]),
    (0.16 + 0.36) / 2,
  );
});

test("de-vigging needs both sides", () => {
  assert.equal(noVigProbability(0.42, 0.6429, "over").toFixed(4), "0.3951");
  assert.equal(noVigProbability(0.42, null, "over"), null, "a one-sided price is not a probability");
});

test("bucket edges are contiguous and half-open", () => {
  assert.equal(bucketForGap(-2).id, "neg-2-to-2");
  assert.equal(bucketForGap(1.999).id, "neg-2-to-2");
  assert.equal(bucketForGap(2).id, "2-to-5");
  assert.equal(bucketForGap(20).id, "gte-20");
  assert.equal(bucketForGap(-100).id, "lte-neg-2");
  assert.equal(bucketForGap(null), null);
  assert.equal(bucketForGap(Number.NaN), null);
});

// ── the suppression rules ──────────────────────────────────────────────────────

test("a bucket with no observations reports no rate, not a zero", () => {
  const table = buildGapBucketTable([histRow({ gapPp: 6 })]);
  const empty = table.buckets.find((b) => b.bucket.id === "gte-20");
  assert.equal(empty.n, 0);
  assert.equal(empty.observedRate, null, "0% would read as a measured result");
  assert.equal(empty.brier, null);
  assert.equal(empty.interval, null);
  assert.equal(empty.window, null);
  assert.ok(empty.suppressedReason);
  assert.match(bucketSentence(empty), /no rate to report/);
});

test("withheld rows leave every denominator and are counted separately", () => {
  const table = buildGapBucketTable([
    histRow({ gapPp: 6, won: true }),
    histRow({ gapPp: 6, won: false, countsTowardRates: false }),
    histRow({ gapPp: 6, won: false, countsTowardRates: false }),
  ]);
  const b = table.buckets.find((x) => x.bucket.id === "5-to-10");
  assert.equal(b.n, 1, "a quarantined row must never reach a denominator");
  assert.equal(b.observedRate, 1);
  assert.equal(table.excludedRows, 2, "the count of what was dropped travels with the table");
  assert.equal(table.totalRows, 1);
});

test("a range made only of withheld rows produces no rate at all", () => {
  const table = buildGapBucketTable([
    histRow({ gapPp: 25, won: true, countsTowardRates: false }),
    histRow({ gapPp: 25, won: true, countsTowardRates: false }),
  ]);
  const b = table.buckets.find((x) => x.bucket.id === "gte-20");
  assert.equal(b.n, 0);
  assert.equal(b.observedRate, null, "a withheld slate must never acquire a hit rate");
  assert.equal(table.excludedRows, 2);
  assert.equal(table.window, null);
});

test("every reported rate carries its denominator, window and interval", () => {
  const table = buildGapBucketTable([
    histRow({ date: "2026-05-16", gapPp: 6, won: true }),
    histRow({ date: "2026-07-27", gapPp: 6, won: false }),
  ]);
  const b = table.buckets.find((x) => x.bucket.id === "5-to-10");
  assert.equal(b.n, 2);
  assert.deepEqual(b.window, { from: "2026-05-16", to: "2026-07-27" });
  assert.ok(b.interval.low < b.observedRate && b.observedRate < b.interval.high);
  const s = bucketSentence(b);
  assert.match(s, /2 settled rows/);
  assert.match(s, /2026-05-16 and 2026-07-27/);
  assert.match(s, /95% interval/);
  assert.match(s, /Brier/);
});

// ── ordering ───────────────────────────────────────────────────────────────────

test("the default ordering is event time and never the difference", () => {
  const rows = [
    { rowId: "b", marketKey: "batter_hits", startTime: "2026-07-25T23:00:00Z", gapPp: 40 },
    { rowId: "a", marketKey: "batter_hits", startTime: "2026-07-25T17:00:00Z", gapPp: 1 },
  ];
  assert.deepEqual(orderByEventTime(rows).map((r) => r.rowId), ["a", "b"]);
});

test("a prediction-disabled market is excluded from the difference ordering, with the reason", () => {
  const rows = [
    { rowId: "tb", marketKey: "batter_total_bases", startTime: "2026-07-25T17:00:00Z", gapPp: 40 },
    { rowId: "hits", marketKey: "batter_hits", startTime: "2026-07-25T17:00:00Z", gapPp: 10 },
    { rowId: "k", marketKey: "pitcher_strikeouts", startTime: "2026-07-25T17:00:00Z", gapPp: 20 },
  ];
  const { ranked, notRankable } = rankByGap(rows);
  assert.deepEqual(ranked.map((r) => r.rowId), ["k", "hits"]);
  assert.equal(notRankable.length, 1);
  assert.equal(notRankable[0].row.rowId, "tb");
  assert.match(notRankable[0].reason, /disabled/);
  assert.ok(
    !ranked.some((r) => r.marketKey === "batter_total_bases"),
    "the largest difference on the board must not be a market whose predictions are switched off",
  );
});

test("a row with no comparable price is not ranked either", () => {
  const { ranked, notRankable } = rankByGap([
    { rowId: "x", marketKey: "batter_hits", startTime: null, gapPp: null },
  ]);
  assert.equal(ranked.length, 0);
  assert.match(notRankable[0].reason, /no comparable market price/);
});

test("the difference ordering is only offered with a caution derived from the data", () => {
  assert.equal(largestGapCaution(buildGapBucketTable([])), null, "no history means no sort");
  assert.equal(largestGapCaution(buildGapBucketTable([histRow()])), null, "one range cannot support a comparison");

  // The measured shape: the widest range scores a WORSE Brier than the narrowest.
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => histRow({ gapPp: 0.5, statedProbability: 0.52, won: i % 2 === 0 })),
    ...Array.from({ length: 40 }, (_, i) => histRow({ gapPp: 30, statedProbability: 0.85, won: i % 2 === 0 })),
  ];
  const caution = largestGapCaution(buildGapBucketTable(rows));
  assert.match(caution, /ranks nothing/);
  assert.match(caution, /Brier/);
  assert.match(caution, /least accurate/);
});

// ── rows + policy ──────────────────────────────────────────────────────────────

const table = buildGapBucketTable([
  ...Array.from({ length: 200 }, (_, i) => histRow({ gapPp: 6, won: i % 2 === 0 })),
  ...Array.from({ length: 100 }, (_, i) => histRow({ gapPp: 12, won: i % 3 === 0 })),
]);

const rowInput = (over = {}) => ({
  rowId: "r1",
  marketKey: "batter_hits",
  startTime: "2026-07-25T17:10:00Z",
  gapPp: 6,
  date: "2026-07-25",
  player: "Cole Young",
  marketLabel: "Hits",
  line: 0.5,
  side: "over",
  matchup: "KC @ DET",
  marketProbability: 0.6672,
  capturedNoVigProbability: 0.6672,
  rawProbability: 0.7211,
  calibratedProbability: 0.5793,
  displayedProbability: 0.5793,
  displayedSource: "calibrated",
  outcome: "Win",
  coverageState: "PROVEN_SIDECAR",
  registryStatus: "RECALIBRATE",
  capturedAt: "2026-07-25T12:02:10.065Z",
  eventStart: "2026-07-25T17:10:00Z",
  settlementSourceRef: "https://statsapi.mlb.com/api/v1.1/game/824244/feed/live",
  eventId: "mlb:detroit-tigers-v-kansas-city-royals:20260725t1710",
  ...over,
});

test("a row states all three probabilities and reads its bucket back", () => {
  const [row] = buildExplorerRows({ rows: [rowInput()], table });
  assert.equal(row.gapDirection, "above");
  assert.equal(row.settlementState, "WIN");
  assert.equal(row.bucket.n, 200);
  assert.match(row.interpretation, /66\.7%/, "the sportsbook figure");
  assert.match(row.interpretation, /72\.1%/, "the simulation's own output");
  assert.match(row.interpretation, /57\.9%/, "the calibrated figure");
  assert.match(row.interpretation, /\+6\.0 pp above the market/);
  assert.match(row.interpretation, /200 settled rows/);
});

test("total bases carries its disabled status in the row, not only in a footnote", () => {
  const [row] = buildExplorerRows({ rows: [rowInput({ marketKey: "batter_total_bases", marketLabel: "Total Bases" })], table });
  assert.equal(row.policy.predictionDisabled, true);
  assert.match(row.interpretation, /switched off/);
  assert.match(row.interpretation, /never placed in a difference-ordered list/);
  const ordered = orderExplorerRows([row], "largest_gap");
  assert.equal(ordered.rows.length, 0);
  assert.equal(ordered.notRankable.length, 1);
});

test("a withheld row shows as withheld rather than as a result", () => {
  const [row] = buildExplorerRows({ rows: [rowInput({ coverageState: "QUARANTINED", outcome: "Win" })], table });
  assert.equal(row.settlementState, "WITHHELD");
  assert.equal(SETTLEMENT_LABEL[row.settlementState], "Withheld");
});

test("a one-sided market says so instead of showing a difference", () => {
  const [row] = buildExplorerRows({ rows: [rowInput({ marketProbability: null, gapPp: null })], table });
  assert.equal(row.gapDirection, null);
  assert.match(row.interpretation, /Only one side of this market was captured/);
});

test("settlement states and market families map to the closed enums", () => {
  assert.equal(settlementStateOf("Win"), "WIN");
  assert.equal(settlementStateOf("Void"), "VOID");
  assert.equal(settlementStateOf(null), "PENDING");
  assert.equal(settlementStateOf("something new"), "PENDING", "an unknown outcome is never a result");
  assert.equal(analyticsMarketFamily("batter_total_bases"), "total_bases");
  assert.equal(analyticsMarketFamily("h2h"), "moneyline");
  assert.equal(analyticsMarketFamily("who_knows"), "other");
});

test("the client view keeps the numbers and drops the infinite bucket edges", () => {
  const [view] = toExplorerRowViews(buildExplorerRows({ rows: [rowInput()], table }));
  assert.equal(view.bucketN, 200);
  assert.equal(view.bucketLabel, "5–10 pp above the market");
  assert.equal(JSON.parse(JSON.stringify(view)).bucketN, 200, "the view must survive JSON round-tripping");
  const buckets = toGapBucketViews(table);
  assert.equal(buckets.length, GAP_BUCKETS.length, "every range is carried, including the empty ones");
  assert.ok(buckets.every((b) => JSON.stringify(b).includes('"n"')));
});

// ── the shipped surface ────────────────────────────────────────────────────────

test("the loader lists only rows whose provenance is proven and pregame", () => {
  const view = loadExplorer();
  assert.ok(view.table, "gap-history.json must be present — run the exporter");
  assert.ok(view.date, "at least one slate must have provable row-level lineage");
  assert.ok(view.rows.length > 0);
  for (const r of view.rows) {
    assert.ok(
      r.coverageState === "PROVEN_SIDECAR" || r.coverageState === "PROVEN_STAMPED",
      `${r.rowId} is ${r.coverageState} and must not be listed individually`,
    );
    assert.ok(r.capturedAt && r.eventStart, "a listed row must state when the price was seen");
    assert.ok(Date.parse(r.capturedAt) < Date.parse(r.eventStart), "and that must precede first pitch");
  }
  assert.ok(view.coverage.listed <= view.coverage.total);
  assert.ok(view.coverage.total > view.coverage.listed, "the page must show how many rows it is NOT listing");
});

test("no rate on the shipped table lacks a denominator, and no empty range invents one", () => {
  const t = loadGapHistory();
  for (const b of t.buckets) {
    if (b.n === 0) {
      assert.equal(b.observedRate, null, `${b.bucket.id} has no rows and must show no rate`);
      assert.equal(b.brier, null);
      assert.equal(b.interval, null);
      assert.ok(b.suppressedReason);
    } else {
      assert.ok(b.observedRate != null && b.interval && b.window);
    }
  }
  assert.ok(t.totalRows > 0);
});

test("the shipped difference ordering excludes total bases and keeps its caution", () => {
  const view = loadExplorer();
  assert.ok(view.largestGapCaution, "the sort must not be offered without the measured caution");
  const ordered = orderExplorerRows(view.rows, "largest_gap");
  assert.ok(
    !ordered.rows.some((r) => r.marketKey === "batter_total_bases"),
    "a prediction-disabled market must not appear in a magnitude-ordered list",
  );
  assert.ok(ordered.notRankable.length > 0);
  for (let i = 1; i < ordered.rows.length; i += 1) {
    assert.ok(ordered.rows[i - 1].gapPp >= ordered.rows[i].gapPp);
  }
});

// ── the words a reader actually gets ───────────────────────────────────────────

/**
 * Every phrase here either has appeared in this codebase and been removed, or names the product this
 * one deliberately is not. `\bunits?\b` is included because a stake unit is how a research surface
 * starts quietly quoting a return.
 */
const PROHIBITED = [
  /\bwager(s|ed|ing)?\b/i,
  /\bstake[sd]?\b/i,
  /\bbet(s|ting|tor)?\b/i,
  /\bROI\b/i,
  /\bbankroll\b/i,
  /\bedges?\b/i,
  /\block(s|ed)?\b/i,
  /\bvalue\b/i,
  /\badvantages?\b/i,
  /\bguarantee(d|s)?\b/i,
  /\bpayouts?\b/i,
  /\bprofit(able|ability|s)?\b/i,
  /\bunits?\b/i,
  /\bbest bet\b/i,
  /\bsure thing\b/i,
  /\bbeat(s|ing)? the (market|sportsbook|book)\b/i,
  /\bmarket[- ]beating\b/i,
  /\bout-?predicts? the (market|sportsbook)\b/i,
];

function everyRenderedString() {
  const out = [EXPLORER_TITLE, EXPLORER_INTRO, EXPLORER_ELIGIBILITY_NOTE, EXPLORER_PROBABILITY_NOTE];
  out.push(...Object.values(COVERAGE_LABEL), ...Object.values(COVERAGE_MEANING), ...Object.values(SETTLEMENT_LABEL));
  out.push(
    explorerUnavailableReason({ artifactPresent: false, dateAvailable: false, eligibleRows: 0 }),
    explorerUnavailableReason({ artifactPresent: true, dateAvailable: false, eligibleRows: 0 }),
    explorerUnavailableReason({ artifactPresent: true, dateAvailable: true, eligibleRows: 0 }),
  );
  for (const m of ["batter_total_bases", "batter_hits", "pitcher_strikeouts", "h2h", "unknown_market"]) {
    out.push(marketPolicy(m, "MONITOR").note);
  }
  const t = loadGapHistory();
  out.push(largestGapCaution(t));
  out.push(...t.buckets.map((b) => bucketSentence(b)));
  out.push(bucketSentence(null));

  // Fixture rows across every state the copy branches on.
  const fixtures = [
    rowInput(),
    rowInput({ marketKey: "batter_total_bases", marketLabel: "Total Bases" }),
    rowInput({ marketProbability: null, gapPp: null }),
    rowInput({ calibratedProbability: null }),
    rowInput({ coverageState: "QUARANTINED" }),
    rowInput({ gapPp: -30, marketProbability: 0.9 }),
  ];
  for (const r of buildExplorerRows({ rows: fixtures, table: t })) {
    out.push(r.interpretation, r.bucketSentence, r.lineageLabel, r.lineageMeaning, r.policy.note);
  }
  // And the real slate, where the copy is assembled from live numbers.
  for (const r of loadExplorer().rows) out.push(r.interpretation, r.bucketSentence, r.policy.note);
  return out.filter((s) => typeof s === "string");
}

test("no rendered sentence uses wager-, stake- or return-shaped language", () => {
  const strings = everyRenderedString();
  assert.ok(strings.length > 50, "the scan must actually cover the surface");
  for (const s of strings) {
    for (const re of PROHIBITED) {
      assert.ok(!re.test(s), `prohibited phrase ${re} in rendered copy: "${s.slice(0, 160)}"`);
    }
  }
});

test("the explorer component contains no such language either", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/research/disagreement-explorer.tsx"), "utf8");
  for (const re of PROHIBITED) {
    assert.ok(!re.test(src), `prohibited phrase ${re} in the explorer component`);
  }
});

test("the component performs no statistics of its own", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/research/disagreement-explorer.tsx"), "utf8");
  // A rate computed in a component is a rate no test can reach.
  for (const re of [/\.reduce\(/, /\/\s*(n|total|denominator)\b/, /Math\.sqrt\(/]) {
    assert.ok(!re.test(src), `the component must not compute rates itself (${re})`);
  }
  assert.ok(fs.existsSync(path.join(HERE, "disagreement-buckets.ts")), "the arithmetic lives in the library");
});
