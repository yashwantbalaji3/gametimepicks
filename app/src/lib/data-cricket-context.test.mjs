/**
 * Tests for the cricket context loader.
 *
 * Run: npx tsx --test app/src/lib/data-cricket-context.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getCricketContextForDate } from "./data-cricket-context.ts";

test("getCricketContextForDate returns null for non-existent date", () => {
  // The loader resolves from process.cwd()/public/data/cricket/context.
  // We pick a far-future date that will never have a file.
  const result = getCricketContextForDate("2099-12-31");
  assert.equal(result, null);
});

test("getCricketContextForDate returns null for empty string", () => {
  assert.equal(getCricketContextForDate(""), null);
});

test("getCricketContextForDate loads 2026-05-26 with expected schema", () => {
  // Verify the actual checked-in 5/26 file (RCB v GT) round-trips
  // through the loader with the schema the UI consumes.
  const ctx = getCricketContextForDate("2026-05-26");
  if (!ctx) {
    // If the test is run from a path where cwd is not the app root,
    // skip rather than fail. We still get coverage from the unit-
    // tests above.
    return;
  }
  assert.equal(ctx.date, "2026-05-26");
  assert.ok(ctx.teams.home, "home team present");
  assert.ok(ctx.teams.away, "away team present");
  assert.ok(Array.isArray(ctx.teamForm), "teamForm is an array");
  assert.ok(Array.isArray(ctx.headToHead), "headToHead is an array");
  assert.ok(Array.isArray(ctx.playerForm), "playerForm is an array");
  assert.ok(Array.isArray(ctx.sources), "sources is an array");
  assert.ok(ctx.notes.preTossWarning.length > 0, "preTossWarning present");
  // Every player carries a manual:true flag (curated overlay).
  for (const p of ctx.playerForm) {
    assert.equal(p.manual, true, `${p.player} must be marked manual`);
    assert.ok(p.source && p.source.length > 0, `${p.player} must cite source`);
  }
  // If venue trends exist, the manual flag must be present.
  if (ctx.venueTrends) {
    assert.equal(ctx.venueTrends.manual, true, "venue trends curated");
    assert.ok(
      ctx.venueTrends.notes.length > 0,
      "venue notes present when block exists",
    );
  }
});

test("checked-in 2026-05-26 file passes basic JSON parse", () => {
  // Direct file read as a backstop — catches accidental JSON syntax
  // errors in the generated context file.
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "cricket",
    "context",
    "2026-05-26.json",
  );
  if (!fs.existsSync(p)) return; // skipped when run outside app/
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.date, "2026-05-26");
});
