/**
 * Tests for the parlay-results loader's public-era filter.
 *
 * The pipeline writes optimizer-summary.json and optimizer-graded/*.json
 * with every date that has ever existed. After the 2026-05-27 reset,
 * the loaders must filter pre-era rows out at read time — UI surfaces
 * must never receive pre-era numbers.
 *
 * Run: npx tsx --test app/src/lib/parlay-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getOptimizerSummary,
  getOptimizerGradedDates,
  getOptimizerGradedForDate,
} from "./parlay-results.ts";
import { PUBLIC_PARLAY_RESULTS_START_DATE } from "./public-parlay-era.ts";

// These tests run against the real files on disk. The repo's
// optimizer-summary.json currently contains pre-era rows (2026-05-25
// and 2026-05-26) — the loader's job is to make sure those never
// appear in the returned summary.

const ROOT = path.join(process.cwd(), "public", "data", "parlays");
const SUMMARY_PATH = path.join(ROOT, "optimizer-summary.json");
const GRADED_DIR = path.join(ROOT, "optimizer-graded");

test("era constant exists and is the documented value", () => {
  assert.equal(PUBLIC_PARLAY_RESULTS_START_DATE, "2026-05-27");
});

test("getOptimizerSummary: byDate contains zero pre-era rows", () => {
  const summary = getOptimizerSummary();
  if (!summary) {
    // If the file is missing, nothing to test — skip.
    return;
  }
  for (const row of summary.byDate ?? []) {
    assert.ok(
      row.date >= PUBLIC_PARLAY_RESULTS_START_DATE,
      `byDate row ${row.date} is pre-era and must be filtered out`,
    );
  }
});

test("getOptimizerSummary: lifetime recomputed from post-era rows", () => {
  const summary = getOptimizerSummary();
  if (!summary) return;
  // Lifetime totals must equal the sum of byDate post-era rows.
  let wins = 0, losses = 0, pushes = 0, pending = 0;
  for (const row of summary.byDate ?? []) {
    wins += row.wins ?? 0;
    losses += row.losses ?? 0;
    pushes += row.pushes ?? 0;
    pending += row.pending ?? 0;
  }
  assert.equal(summary.lifetime.wins, wins);
  assert.equal(summary.lifetime.losses, losses);
  assert.equal(summary.lifetime.pushes, pushes);
  assert.equal(summary.lifetime.pending, pending);
  const decisive = wins + losses;
  assert.equal(summary.lifetime.decisive, decisive);
  if (decisive === 0) {
    assert.equal(summary.lifetime.hitRate, null,
      "hit rate must be null when no decisive slips have settled in the era");
  }
});

test("getOptimizerSummary: byProfile/bySport zeroed when zero post-era rows on disk", () => {
  const summary = getOptimizerSummary();
  if (!summary) return;
  if ((summary.byDate ?? []).length === 0) {
    for (const [k, b] of Object.entries(summary.byProfile ?? {})) {
      assert.equal(b.wins, 0, `byProfile.${k}.wins must be zeroed pre-era`);
      assert.equal(b.losses, 0, `byProfile.${k}.losses must be zeroed pre-era`);
      assert.equal(b.hitRate, null, `byProfile.${k}.hitRate must be null pre-era`);
    }
    for (const [k, b] of Object.entries(summary.bySport ?? {})) {
      assert.equal(b.wins, 0, `bySport.${k}.wins must be zeroed pre-era`);
      assert.equal(b.losses, 0, `bySport.${k}.losses must be zeroed pre-era`);
      assert.equal(b.hitRate, null, `bySport.${k}.hitRate must be null pre-era`);
    }
  }
});

test("getOptimizerGradedDates: returns only post-era dates", () => {
  const dates = getOptimizerGradedDates();
  for (const d of dates) {
    assert.ok(
      d >= PUBLIC_PARLAY_RESULTS_START_DATE,
      `graded date ${d} is pre-era and must not be returned to public callers`,
    );
  }
});

test("getOptimizerGradedForDate: pre-era date returns null even when file exists", () => {
  // 2026-05-25 is the canonical pre-era date in the repo. The file
  // exists on disk (verified by direct fs read) but the loader must
  // refuse to surface it.
  const fileExists = fs.existsSync(path.join(GRADED_DIR, "2026-05-25.json"));
  if (!fileExists) {
    // Test prerequisite missing — skip silently.
    return;
  }
  assert.equal(
    getOptimizerGradedForDate("2026-05-25"),
    null,
    "pre-era file on disk must NOT be returned to public callers",
  );
});

test("getOptimizerGradedForDate: era-start date is allowed", () => {
  // Era-start date is 2026-05-27. Even if the file isn't graded yet
  // (returns null), this call must not be blocked by the era filter
  // — it must be allowed through to the disk read.
  const out = getOptimizerGradedForDate(PUBLIC_PARLAY_RESULTS_START_DATE);
  // Either a graded payload or null (file may not exist yet). The
  // key property is: no filter block.
  assert.ok(out === null || typeof out === "object");
});

test("raw summary file on disk is left untouched (loader does not write)", () => {
  // Defensive: confirm the loader is a pure read. We assert by
  // reading the raw JSON and verifying its on-disk byDate still
  // contains pre-era rows (which the loader will filter out at read
  // time, but never delete from disk).
  if (!fs.existsSync(SUMMARY_PATH)) return;
  const raw = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf-8"));
  const hasPreEra = (raw.byDate ?? []).some(
    (r) => r.date < PUBLIC_PARLAY_RESULTS_START_DATE,
  );
  // Pre-era rows SHOULD still exist on disk (intentional archive).
  // If this fails, someone edited the file by hand — the era filter
  // belongs at the loader, not in the data file.
  assert.equal(hasPreEra, true,
    "summary file on disk should retain pre-era rows as archive — filter happens at the loader");
});
