/**
 * THE LIFETIME RECORD MUST NOT BE ERASABLE BY A QUIET DAY.
 *
 * `summary.json` is the public experimental-forecast record. It used to be written from the metrics
 * of the ONE DATE the settler happened to run for, so a run on a day with no forecasts published
 * "No experimental forecast has been settled yet" and wiped the record. That is what the 2026-08-17
 * 14:55Z run did: 16 settled forecasts became 0. The daily receipts were intact throughout — only
 * the aggregate lied.
 *
 * This is the same shape as the MLB player-prop settlement evaporating earlier the same day: a
 * DAILY job rewriting a CUMULATIVE file from one day's view of the world. So the invariant is
 * asserted against the receipts, which are the evidence, rather than against a remembered number.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "..", "data/internal/nfl/experimental-settlement");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Every graded event across every dated receipt, deduplicated the way the settler dedupes. */
function receiptEvents() {
  const byId = new Map();
  for (const f of fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
    for (const e of read(path.join(DIR, f)).events ?? []) {
      if (e?.canonicalEventId) byId.set(e.canonicalEventId, e);
    }
  }
  return [...byId.values()];
}

test("the published record equals the receipts on disk — a quiet day cannot zero it", () => {
  const summary = read(path.join(DIR, "summary.json"));
  const events = receiptEvents();
  assert.equal(summary.settledForecasts, events.length,
    `summary says ${summary.settledForecasts} settled but ${events.length} graded events exist in the receipts`);
  if (events.length > 0) {
    assert.doesNotMatch(summary.note ?? "", /no experimental forecast has been settled yet/i,
      "the record exists, so the empty-state note must not be published over it");
    assert.notEqual(summary.winnerAccuracy, null, "a non-empty record publishes its accuracy");
  }
});

test("no event is double-counted across receipts", () => {
  // Receipts overlap when a late final lands after an earlier day's run (nfl-401874392 is graded in
  // both 2026-08-13 and 2026-08-14). Concatenating rather than keying would inflate the record —
  // the one direction an accuracy ledger must never drift.
  const raw = fs.readdirSync(DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .flatMap((f) => (read(path.join(DIR, f)).events ?? []).map((e) => e.canonicalEventId));
  const summary = read(path.join(DIR, "summary.json"));
  assert.ok(summary.settledForecasts <= raw.length, "the record never exceeds the raw receipt rows");
  assert.equal(summary.settledForecasts, new Set(raw).size, "the record counts DISTINCT events");
});

test("the settler derives the summary from every receipt, not from one date's metrics", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/settle-nfl-experimental.mjs"), "utf8");
  assert.match(src, /readdirSync\(dir\)/, "the summary reads the receipt directory");
  assert.match(src, /settledForecasts: lifetime\.settledForecasts/,
    "the summary publishes the LIFETIME figure, never the single-date `metrics` object");
});
