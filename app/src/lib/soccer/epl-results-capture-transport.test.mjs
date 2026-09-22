/**
 * The EPL results capture's transport: its own loop, but NOT its own rule (v1.8 B4).
 *
 * `scripts/epl/capture-epl-results.mjs` is the ONE windowed ESPN scoreboard caller outside the shared
 * fetcher in `src/lib/sports/espn-scoreboard-window.mjs`. That is deliberate: its failure semantics differ
 * (EXIT_SOURCE_STALE = 4 with nothing written, plus per-month provenance in the artifact's `source` block),
 * and it was repaired earlier, for the v1.7 F2 evidence work, when the range form died for eng.1 on
 * 2026-09-16. But a second CALL SITE must not become a second RULE — so its month plan is pinned to the
 * shared owner here, and the two signatures are pinned to agree.
 *
 * These tests live in the EPL lane (`src/lib/soccer`) because they name the lane's module by path, and
 * epl-closeout-guard refuses that from anywhere else. Their sibling checks — the range-form scan over every
 * ESPN caller, and the shared fetcher's own behaviour — are in
 * `src/lib/sports/espn-scoreboard-callers.test.mjs`.
 *
 * Run: cd app && npx tsx --test src/lib/soccer/epl-results-capture-transport.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();

test("the EPL results capture keeps its own loop but NOT its own month plan — one owner for the rule", () => {
  const rel = "src/lib/soccer/epl-results-capture.mjs";
  const src = fs.readFileSync(path.join(APP, rel), "utf8");
  assert.match(src, /monthsCovering/, `${rel} must take the month plan from the shared owner`);
  assert.match(src, /sports\/espn-scoreboard-window\.mjs/, `${rel} must import the shared owner`);
  assert.doesNotMatch(src, /getUTCMonth\(\)/, `${rel} must not re-derive months itself (that is the owner's rule)`);
});

test("the two month plans agree — the EPL signature is a wrapper, never a second rule", async () => {
  const { scoreboardMonths } = await import("./epl-results-capture.mjs");
  const { monthsCovering } = await import("../sports/espn-scoreboard-window.mjs");
  for (const [start, now] of [
    ["2026-08-21", "2026-09-22T15:00:00Z"],
    ["2026-08-21", "2027-05-24T23:59:00Z"],
    ["2026-12-30", "2027-01-02T00:00:00Z"],
    ["2026-09-01", "2026-09-01T00:00:00Z"],
  ]) {
    assert.deepEqual(scoreboardMonths(start, now), monthsCovering(`${start}T00:00:00Z`, now), `${start} → ${now}`);
  }
  // the EPL signature answers [] where the owner throws — an inverted window is a refusal upstream
  assert.deepEqual(scoreboardMonths("2026-09-22", "2026-09-01T00:00:00Z"), []);
  assert.deepEqual(scoreboardMonths("nope", "2026-09-01T00:00:00Z"), []);
});
