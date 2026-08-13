/**
 * NFL season-context + freshness guards (Program 169 · Release A).
 * Run: npx tsx --test src/lib/sports/nfl/season-context.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { seasonContextFor, forwardWindowState, checkFreshness, FRESHNESS_MATRIX } from "./season-context.mjs";

test("season type is provider data, never a calendar guess; unknown codes fail closed", () => {
  assert.equal(seasonContextFor({ seasonType: 1, week: 2 }).state, "PRESEASON");
  assert.equal(seasonContextFor({ seasonType: 2 }).state, "REGULAR_SEASON");
  assert.equal(seasonContextFor({ seasonType: 3 }).state, "POSTSEASON");
  assert.equal(seasonContextFor({ seasonType: 9 }).state, "UNKNOWN_SEASON_TYPE");
  assert.equal(seasonContextFor({}).state, "UNKNOWN_SEASON_TYPE");
});

test("REAL ARTIFACT · the committed schedule window is preseason with scheduled events", () => {
  const sch = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  const next = sch.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED")[0];
  assert.equal(seasonContextFor(next).state, "PRESEASON", "Aug window is preseason BY PROVIDER DATA");
  const win = forwardWindowState(sch.rows, sch.generatedAt);
  assert.equal(win.state, "EVENTS_SCHEDULED");
  assert.ok(win.count >= 1);
});

test("offseason is an empty-window statement", () => {
  assert.equal(forwardWindowState([], "2026-08-13T00:00:00Z").state, "OFFSEASON_OR_WINDOW_GAP");
  assert.equal(forwardWindowState([{ dateUtc: "2026-08-01T00:00Z" }], "2026-08-13T00:00:00Z").state, "OFFSEASON_OR_WINDOW_GAP");
});

test("freshness: typed states, per-input bounds, clock defects refused", () => {
  const NOW = "2026-08-13T12:00:00Z";
  assert.equal(checkFreshness("injuries", { sourceAsOf: "2026-08-13T02:00:00Z", fetchedAt: "2026-08-13T02:00:00Z" }, NOW).state, "FRESH");
  assert.equal(checkFreshness("injuries", { sourceAsOf: "2026-08-11T02:00:00Z", fetchedAt: "2026-08-11T02:00:00Z" }, NOW).state, "STALE");
  assert.equal(checkFreshness("participation", { sourceAsOf: "2026-08-12T20:00:00Z", fetchedAt: "2026-08-12T20:00:00Z" }, NOW).state, "STALE", "participation ages faster than injuries");
  assert.equal(checkFreshness("rosters", { sourceAsOf: "2026-08-08T00:00:00Z", fetchedAt: "2026-08-08T00:00:00Z" }, NOW).state, "FRESH", "rosters tolerate a week");
  assert.equal(checkFreshness("odds", { sourceAsOf: "2026-08-13T13:00:00Z", fetchedAt: "2026-08-13T11:00:00Z" }, NOW).state, "CLOCK_DEFECT", "sourceAsOf after fetchedAt is refused");
  assert.equal(checkFreshness("odds", {}, NOW).state, "UNDATED");
  assert.throws(() => checkFreshness("vibes", { sourceAsOf: NOW }, NOW), /matrix is closed/);
  for (const [k, v] of Object.entries(FRESHNESS_MATRIX)) assert.ok(v.hours > 0 && v.why.length > 10, k);
});
