/**
 * Session 5 · A4 — the Thursday pregame refresh is automatic and free. Deterministic: fixed clocks, fixture
 * boards — never the calendar the suite happens to run on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { decidePregameFreeRefresh, MAX_WAIT_MIN, PREGAME_REFRESH as D, TARGET_LEAD_MIN } from "./pregame-free-refresh.mjs";

const board = (kickoffUtc, generatedAt, matchup = "PIT @ CLE") => ({ artifact: "nfl-player-board", providerEventId: "401872964", matchup, kickoffUtc, generatedAt });
const TNF = "2026-10-02T00:15Z";

test("A4 · the first delivery waits until 105 minutes before kickoff — whatever hour it arrives", () => {
  for (const [now, wait] of [["2026-10-01T15:00:00Z", 7 * 3600 + 30 * 60], ["2026-10-01T19:57:00Z", 2 * 3600 + 33 * 60], ["2026-10-01T22:00:00Z", 30 * 60]]) {
    const d = decidePregameFreeRefresh({ boards: [board(TNF, "2026-10-01T14:00:00Z")], nowIso: now });
    if (wait / 60 > MAX_WAIT_MIN) { assert.equal(d.decision, D.NO_GAME, `${now}: beyond the wait cap the run leaves it to a later delivery`); continue; }
    assert.equal(d.decision, D.WAIT_THEN_DISPATCH, now);
    assert.equal(d.waitSeconds, wait, now);
  }
});

test("A4 · after the wait it dispatches — including a re-decision a few seconds early", () => {
  assert.equal(decidePregameFreeRefresh({ boards: [board(TNF, "2026-10-01T20:16:30Z")], nowIso: "2026-10-01T22:29:58Z" }).decision, D.DISPATCH_NOW);
  assert.equal(decidePregameFreeRefresh({ boards: [board(TNF, "2026-10-01T20:16:30Z")], nowIso: "2026-10-01T23:10:00Z" }).decision, D.DISPATCH_NOW, "a late delivery inside the band runs at once");
});

test("A4 · a board regenerated inside the 120-minute band IS the refresh — no second dispatch", () => {
  // The 2026-10-01 manual dispatch produced exactly this: 22:30:25Z for a 00:15Z kickoff.
  assert.equal(decidePregameFreeRefresh({ boards: [board(TNF, "2026-10-01T22:30:25Z")], nowIso: "2026-10-01T22:40:00Z" }).decision, D.ALREADY_REFRESHED);
});

test("A4 · too close to kickoff, and no game, are holds — never a dispatch that lands after the start", () => {
  assert.equal(decidePregameFreeRefresh({ boards: [board(TNF, "2026-10-01T20:00:00Z")], nowIso: "2026-10-02T00:00:00Z" }).decision, D.TOO_LATE);
  assert.equal(decidePregameFreeRefresh({ boards: [board("2026-10-04T17:00Z", "2026-10-01T20:00:00Z")], nowIso: "2026-10-01T15:00:00Z" }).decision, D.NO_GAME);
  assert.equal(decidePregameFreeRefresh({ boards: [], nowIso: "2026-10-01T15:00:00Z" }).decision, D.NO_GAME);
  assert.throws(() => decidePregameFreeRefresh({ boards: [], nowIso: "" }));
});

test("A4 · CONTRACT: the workflow is free by construction, waits inside its timeout, and is deduped", () => {
  const wf = fs.readFileSync("../.github/workflows/nfl-pregame-free-refresh.yml", "utf8");
  const code = wf.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /secrets\./, "no secret may be named");
  assert.doesNotMatch(code, /probe_props|week_window/, "never the paid prop probe");
  const dispatches = [...code.matchAll(/gh workflow run ([^\n]+)/g)].map((m) => m[1]);
  assert.deepEqual(dispatches.length, 1);
  assert.match(dispatches[0], /^nfl-event-window\.yml --ref main -f skip_odds=true\b/, "the only dispatch is the zero-credit event window");
  assert.match(code, /cron: "0 1[579] \* \* 4"/, "Thursday UTC schedules");
  assert.match(code, /cancel-in-progress: false/);
  const timeout = Number(code.match(/timeout-minutes:\s*(\d+)/)[1]);
  assert.ok(timeout > MAX_WAIT_MIN + 5, `timeout ${timeout} must exceed the ${MAX_WAIT_MIN}-minute wait cap`);
  assert.match(code, /Re-decide on current boards[\s\S]*git pull --quiet --ff-only origin main/, "the dispatch re-decides on boards pulled after the wait");
  assert.ok(TARGET_LEAD_MIN >= 90 && TARGET_LEAD_MIN <= 120);
});

test("A4 · CONTRACT: the paid kickoff refresh is unchanged by this (no new paid path)", () => {
  const paid = fs.readFileSync("../.github/workflows/nfl-kickoff-refresh.yml", "utf8");
  assert.match(paid, /cron: "\*\/30 17-21 \* \* 4"/);
});
