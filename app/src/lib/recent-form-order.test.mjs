/**
 * Tests for `takeNewestFirst` — the newest-first ordering helper used
 * by the recent-form drawer (PR #116 addendum).
 *
 * The drawer's "Last 5 games" label MUST mean the player's five most
 * recent games played. The pipeline persists `recentGames` /
 * `recentSeries` in OLDEST → NEWEST order (matches sparkline
 * rendering), so the drawer reverses + caps at display time.
 *
 * The user-required test matrix (verbatim from the merge addendum):
 *   1. `recentGames` source input oldest→newest outputs newest→oldest.
 *   2. `recentSeries` values stay aligned with dates/opponents after ordering.
 *   3. Drawer logic displays only the most recent 5 of up to 10 games.
 *   4. Missing/invalid dates do not get guessed; they fall back safely.
 *   5. NBA example verifies the top row is the newest available game.
 *
 * Run: npx tsx --test app/src/lib/recent-form-order.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { takeNewestFirst } from "./recent-form-order.ts";

test("(1) oldest→newest input emerges newest→oldest", () => {
  // Source order matches what the pipeline persists.
  const oldestFirst = [
    { date: "2026-03-20", value: 1 },
    { date: "2026-03-22", value: 2 },
    { date: "2026-03-24", value: 3 },
    { date: "2026-04-01", value: 4 },
    { date: "2026-04-16", value: 5 },
  ];
  const out = takeNewestFirst(oldestFirst, 5);
  assert.equal(out.length, 5);
  assert.equal(out[0].date, "2026-04-16", "newest row must be first");
  assert.equal(out[4].date, "2026-03-20", "oldest row must be last");
  // Strictly descending by date.
  for (let i = 0; i < out.length - 1; i++) {
    assert.ok(
      out[i].date > out[i + 1].date,
      `row ${i} (${out[i].date}) should be newer than row ${i + 1} (${out[i + 1].date})`,
    );
  }
});

test("(2) recentSeries stays index-aligned with recentGames after ordering", () => {
  // The pipeline guarantees `recentSeries[i]` corresponds to the same
  // game as `recentGames[i]`. Running BOTH through `takeNewestFirst`
  // with the same limit must preserve that 1:1 mapping.
  const recentGames = [
    { date: "2026-03-20", opponent: "BKN", isHome: false, value: 1 },
    { date: "2026-03-22", opponent: "MIA", isHome: true, value: 8 },
    { date: "2026-03-24", opponent: "DET", isHome: false, value: 12 },
    { date: "2026-04-01", opponent: "PHI", isHome: true, value: 15 },
    { date: "2026-04-16", opponent: "NYK", isHome: false, value: 22 },
  ];
  const recentSeries = recentGames.map((g) => g.value);

  const gamesOut = takeNewestFirst(recentGames, 5);
  const seriesOut = takeNewestFirst(recentSeries, 5);

  assert.equal(gamesOut.length, seriesOut.length);
  for (let i = 0; i < gamesOut.length; i++) {
    assert.equal(
      seriesOut[i],
      gamesOut[i].value,
      `recentSeries[${i}] (${seriesOut[i]}) must match recentGames[${i}].value (${gamesOut[i].value}) — same game`,
    );
  }
  // And specifically: the newest series value must pair with the
  // newest game date, not the oldest.
  assert.equal(gamesOut[0].date, "2026-04-16");
  assert.equal(seriesOut[0], 22);
});

test("(3) only the most recent 5 of up to 10 games are returned", () => {
  // 10 games, oldest→newest. The drawer caps at 5, and the 5 returned
  // must be the FIVE MOST RECENT, not the five oldest.
  const tenGames = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-04-${String(i + 1).padStart(2, "0")}`,
    value: i + 1,
  }));
  const out = takeNewestFirst(tenGames, 5);
  assert.equal(out.length, 5);
  assert.deepEqual(
    out.map((g) => g.date),
    [
      "2026-04-10", // newest of the 10
      "2026-04-09",
      "2026-04-08",
      "2026-04-07",
      "2026-04-06",
    ],
    "should return the 5 newest, descending",
  );
  // Anti-regression: the dropped 5 must be the OLDEST 5 — not the
  // newest. (The bug we're fixing did the opposite.)
  const droppedDates = tenGames
    .slice(0, 5)
    .map((g) => g.date);
  for (const d of droppedDates) {
    assert.ok(
      !out.some((g) => g.date === d),
      `oldest game ${d} must NOT appear in the newest-5 window`,
    );
  }
});

test("(4) missing/invalid input is handled safely without guessing", () => {
  // null / undefined → empty array (no crash, no fabricated rows).
  assert.deepEqual(takeNewestFirst(null, 5), []);
  assert.deepEqual(takeNewestFirst(undefined, 5), []);
  assert.deepEqual(takeNewestFirst([], 5), []);
  // limit <= 0 → empty (caller asked for nothing).
  assert.deepEqual(takeNewestFirst([{ date: "2026-04-16", value: 1 }], 0), []);
  assert.deepEqual(takeNewestFirst([{ date: "2026-04-16", value: 1 }], -1), []);
  // Non-finite limit → empty (defensive).
  assert.deepEqual(takeNewestFirst([{ date: "2026-04-16", value: 1 }], NaN), []);
  assert.deepEqual(
    takeNewestFirst([{ date: "2026-04-16", value: 1 }], Infinity),
    [],
  );
  // Rows carrying null `date` or null `opponent` pass through as-is
  // — we never invent a date. The helper is value-agnostic; it just
  // reverses + caps. Downstream renderers know how to display "—".
  const mixed = [
    { date: null, opponent: null, isHome: null, value: 4 },
    { date: "2026-04-16", opponent: "NYK", isHome: true, value: 22 },
  ];
  const out = takeNewestFirst(mixed, 5);
  assert.equal(out.length, 2);
  assert.equal(out[0].date, "2026-04-16", "real date stays newest-first");
  assert.equal(out[1].date, null, "null date row preserved, not invented");
});

test("(5) NBA example: top row is the newest available game", () => {
  // Modeled on the Karl-Anthony Towns case that exposed the bug:
  // pipeline stored 10 REB games for him spanning Mar 20 → Apr 16,
  // OLDEST first. Pre-fix the drawer showed Mar 20–29 (the oldest
  // five). Post-fix it must show the most recent five, with Apr 16
  // at the top.
  const katRebGames = [
    { date: "2026-03-20", opponent: "BKN", isHome: false, value: 1 },
    { date: "2026-03-22", opponent: "MIA", isHome: true, value: 8 },
    { date: "2026-03-24", opponent: "DET", isHome: false, value: 12 },
    { date: "2026-03-26", opponent: "WAS", isHome: false, value: 10 },
    { date: "2026-03-29", opponent: "ORL", isHome: true, value: 7 },
    { date: "2026-04-01", opponent: "PHI", isHome: true, value: 15 },
    { date: "2026-04-04", opponent: "BOS", isHome: false, value: 9 },
    { date: "2026-04-08", opponent: "CHI", isHome: true, value: 11 },
    { date: "2026-04-12", opponent: "ATL", isHome: false, value: 13 },
    { date: "2026-04-16", opponent: "NYK", isHome: false, value: 22 },
  ];
  const drawerRows = takeNewestFirst(katRebGames, 5);
  assert.equal(drawerRows.length, 5);
  // Top row = the player's MOST RECENT game on record.
  assert.equal(drawerRows[0].date, "2026-04-16");
  assert.equal(drawerRows[0].opponent, "NYK");
  assert.equal(drawerRows[0].value, 22);
  // Bottom of the 5-row window is still within the most-recent half,
  // never one of the original oldest five.
  const oldestFive = new Set(katRebGames.slice(0, 5).map((g) => g.date));
  for (const row of drawerRows) {
    assert.ok(
      !oldestFive.has(row.date),
      `drawer row ${row.date} must not be from the oldest half of the sample`,
    );
  }
});

test("input array is not mutated by takeNewestFirst", () => {
  // Defensive — the snapshot contract (oldest→newest, 1:1 across
  // recentSeries/recentGames) must stay intact for any other consumer
  // that reads `leg.recentGames` after the drawer runs.
  const original = [
    { date: "2026-03-20", value: 1 },
    { date: "2026-04-16", value: 22 },
  ];
  const snapshot = [...original];
  takeNewestFirst(original, 5);
  assert.deepEqual(
    original,
    snapshot,
    "takeNewestFirst must not mutate its input",
  );
});

test("limit larger than array length returns the full reversed array", () => {
  const three = [
    { date: "2026-03-20", value: 1 },
    { date: "2026-03-22", value: 8 },
    { date: "2026-04-16", value: 22 },
  ];
  const out = takeNewestFirst(three, 10);
  assert.equal(out.length, 3);
  assert.equal(out[0].date, "2026-04-16");
  assert.equal(out[2].date, "2026-03-20");
});
