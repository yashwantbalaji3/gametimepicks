/**
 * Parlay Lab record guards (Program 200 · Release C).
 *
 * The Lab's record page is the Daily Parlay Ledger's public face, and its numbers must be the
 * ledger's numbers: byTier parses the ledger's real object shape (the array-shaped reader dropped
 * every tier record silently until P200), unsettled tiers stay unsettled rather than 0–0, and the
 * page renders per-tier records without blending tiers or sports.
 *
 * Run: npx tsx --test src/lib/parlays/lab-record.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadLabRecord, labSampleCaption } from "./lab-record.ts";

const app = process.cwd();
const page = fs.readFileSync(path.join(app, "src/app/results/parlay-lab/page.tsx"), "utf8");

test("byTier parses the ledger's object shape into canonical-order tier records", () => {
  const rec = loadLabRecord();
  assert.ok(rec, "the committed ledger loads");
  const ledger = JSON.parse(fs.readFileSync(path.join(app, "public/data/parlays/lab-ledger.json"), "utf8"));
  for (const s of rec.streams) {
    const raw = ledger.streams.find((x) => x.id === s.id)?.byTier ?? {};
    const expected = ["low", "medium", "high", "longshot"].filter((t) => raw[t]);
    assert.deepEqual(s.byTier.map((t) => t.tier), expected, `${s.id}: tiers in canonical order, from the ledger`);
    for (const t of s.byTier) {
      assert.equal(t.wins, raw[t.tier].wins ?? 0, `${s.id}.${t.tier}: wins are the ledger's wins`);
      assert.equal(t.losses, raw[t.tier].losses ?? 0, `${s.id}.${t.tier}: losses are the ledger's losses`);
    }
  }
});

test("a tier that has graded nothing is unsettled — never a measured 0-0", () => {
  const rec = loadLabRecord();
  for (const s of rec.streams) {
    for (const t of s.byTier) {
      const graded = t.wins + t.losses + t.pushes;
      assert.equal(t.settled, graded > 0, `${s.id}.${t.tier}: settled flag mirrors graded count`);
      if (graded === 0) {
        assert.equal(t.hitRate, null, `${s.id}.${t.tier}: no rate without a sample`);
        assert.equal(t.roi, null, `${s.id}.${t.tier}: no roi without a sample`);
      }
    }
  }
});

test("stream-level null-record semantics are intact: settled nothing → record null", () => {
  const rec = loadLabRecord();
  for (const s of rec.streams) {
    if (s.settledDays === 0) assert.equal(s.record, null, `${s.id}: no settled day → no record`);
    else assert.ok(s.record, `${s.id}: settled days but no record`);
  }
  assert.ok(labSampleCaption(rec).length > 0, "the sample caption always says something honest");
});

test("the record page renders the per-tier table with unsettled cells in words", () => {
  assert.match(page, /Each tier.{0,10}s own record/, "per-tier section present");
  assert.match(page, /byTier\.map/, "renders from the lib's tier records");
  assert.match(page, /nothing settled/, "unsettled tiers render in words, not 0–0");
  assert.ok(!/\block\b|\bsafe\b|\bedge\b|guaranteed|profit\b/i.test(page), "no banned copy");
});
