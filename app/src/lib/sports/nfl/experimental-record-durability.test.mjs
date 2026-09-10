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
  /*
   * REBASED 2026-09-10, when the first regular-season game settled.
   *
   * The original assertion was `summary.settledForecasts === events.length`. That held only while
   * there was exactly one cohort. P196 · Release E made the headline block EXACTLY ONE COHORT with
   * its scope named, deliberately, because preseason and regular-season football are different
   * games and pooling their accuracy would describe neither — so the moment the first regular-season
   * result landed, the headline correctly flipped to a cohort of 1 while 44 receipts sat on disk,
   * and this guard called a working design a lost record.
   *
   * The invariant was never "the headline counts every receipt". It is that NOTHING IS LOST: every
   * graded receipt is accounted for in some cohort, the headline names a real one, and the
   * empty-state note is never published over a record that exists. A quiet day still cannot zero it
   * — it just cannot be checked by comparing one cohort against the whole ledger.
   */
  const summary = read(path.join(DIR, "summary.json"));
  const events = receiptEvents();
  const cohorts = Object.values(summary.cohorts ?? {});
  const accounted = cohorts.reduce((n, c) => n + (c.settledForecasts ?? 0), 0) + (summary.unknownSeasonTypeRows ?? 0);

  assert.equal(accounted, events.length,
    `cohorts account for ${accounted} settled forecasts but ${events.length} graded events exist in the receipts — a receipt has fallen out of the record`);

  if (events.length > 0) {
    assert.ok(cohorts.length > 0, "graded receipts exist, so at least one cohort must be published");
    assert.doesNotMatch(summary.note ?? "", /no experimental forecast has been settled yet/i,
      "the record exists, so the empty-state note must not be published over it");
    assert.notEqual(summary.winnerAccuracy, null, "a non-empty record publishes its accuracy");
    // The headline must describe a cohort that actually exists, at its own honest n.
    const headline = cohorts.find((c) => c.label === summary.seasonTypeScope);
    assert.ok(headline, `headline scope "${summary.seasonTypeScope}" names no published cohort`);
    assert.equal(summary.settledForecasts, headline.settledForecasts,
      "the headline numbers must be the named cohort's own, never a cross-cohort sum");
  }
});

test("cohorts are never pooled into a single accuracy", () => {
  /*
   * The other half of the same rule, and the reason the guard above could not simply be relaxed.
   * A preseason winner accuracy of 53.7% over 43 games and a regular-season 100% over 1 are not
   * averageable into anything meaningful, and the note says so in as many words.
   */
  const summary = read(path.join(DIR, "summary.json"));
  const cohorts = Object.values(summary.cohorts ?? {});
  if (cohorts.length < 2) return;
  const pooled = cohorts.reduce((n, c) => n + (c.settledForecasts ?? 0), 0);
  assert.notEqual(summary.settledForecasts, pooled,
    "the headline is summing cohorts — season types never share an aggregate");
  assert.match(summary.note ?? "", /never share an aggregate/i, "and the artifact says so to its readers");
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
  /*
   * P196 restatement: the top level is now ONE season-type cohort (never a cross-season blend),
   * so the distinct-event total reconciles across the cohorts plus the unknown bucket — the same
   * no-double-count claim, asserted where the total now lives. The headline must still equal its
   * own cohort exactly.
   */
  const cohortTotal = Object.values(summary.cohorts ?? {}).reduce((s, c) => s + c.settledForecasts, 0);
  assert.equal(cohortTotal, new Set(raw).size, "cohorts + unknown recount the DISTINCT events exactly");
  assert.equal(summary.settledForecasts, summary.cohorts?.[summary.seasonTypeScope]?.settledForecasts,
    "the headline block is exactly one cohort's numbers — never a sum across seasons");
});

test("the settler derives the summary from every receipt, not from one date's metrics", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/settle-nfl-experimental.mjs"), "utf8");
  assert.match(src, /readdirSync\(dir\)/, "the summary reads the receipt directory");
  assert.match(src, /settledForecasts: lifetime\.current\.settledForecasts/,
    "the summary publishes the LIFETIME pass's current-cohort figure, never the single-date `metrics` object");
});
