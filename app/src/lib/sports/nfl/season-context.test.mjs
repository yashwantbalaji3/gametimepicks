/**
 * NFL season-context + freshness guards (Program 169 · Release A).
 * Run: npx tsx --test src/lib/sports/nfl/season-context.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { seasonContextFor, forwardWindowState, checkFreshness, FRESHNESS_MATRIX, SEASON_TYPES } from "./season-context.mjs";

test("season type is provider data, never a calendar guess; unknown codes fail closed", () => {
  assert.equal(seasonContextFor({ seasonType: 1, week: 2 }).state, "PRESEASON");
  assert.equal(seasonContextFor({ seasonType: 2 }).state, "REGULAR_SEASON");
  assert.equal(seasonContextFor({ seasonType: 3 }).state, "POSTSEASON");
  assert.equal(seasonContextFor({ seasonType: 9 }).state, "UNKNOWN_SEASON_TYPE");
  assert.equal(seasonContextFor({}).state, "UNKNOWN_SEASON_TYPE");
});

test("REAL ARTIFACT · the committed window's context comes from provider data, in any phase", () => {
  /*
   * P224: this asserted PRESEASON against the live capture, with the reason "Aug window is preseason
   * BY PROVIDER DATA". It was not reading provider data — it was reading the month, which is the one
   * inference this module's own docblock forbids ("no module may infer it from the calendar month").
   * The capture has since rolled to the regular-season opener and the test went red while the module
   * was right.
   *
   * The intent that survives every phase: whatever the provider says, the classification agrees with
   * the row's own seasonType, and a committed forward window reports its events. The 1/2/3 → label
   * mapping itself is pinned to fixtures in the first test above, so no coverage is lost.
   */
  const sch = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  const next = sch.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED")[0];
  assert.ok(next, "the committed capture holds at least one scheduled event");

  const ctx = seasonContextFor(next);
  assert.equal(ctx.state, SEASON_TYPES[next.seasonType], `provider seasonType ${next.seasonType} must drive the label`);
  assert.notEqual(ctx.state, "UNKNOWN_SEASON_TYPE", "a live capture carrying an unknown season code is a real defect");

  const win = forwardWindowState(sch.rows, sch.generatedAt);
  assert.equal(win.state, "EVENTS_SCHEDULED");
  assert.ok(win.count >= 1);
});

test("PHASE TRANSITION · every phase, and an empty window, keep their statement", () => {
  /*
   * The states the real artifact can only show one of at a time. Without these, a season rollover
   * silently drops coverage of the phase the calendar just left — which is how the test above rotted.
   */
  for (const [code, label] of Object.entries(SEASON_TYPES)) {
    assert.equal(seasonContextFor({ seasonType: Number(code) }).state, label);
  }
  const NOW = "2026-09-01T00:00:00Z";
  assert.equal(forwardWindowState([{ dateUtc: "2026-09-10T00:20Z", seasonType: 2 }], NOW).state, "EVENTS_SCHEDULED");
  assert.equal(forwardWindowState([{ dateUtc: "2026-08-13T00:20Z", seasonType: 1 }], NOW).state, "OFFSEASON_OR_WINDOW_GAP",
    "a window holding only PAST events is a gap, not a season");
  assert.equal(forwardWindowState([], NOW).state, "OFFSEASON_OR_WINDOW_GAP");
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
