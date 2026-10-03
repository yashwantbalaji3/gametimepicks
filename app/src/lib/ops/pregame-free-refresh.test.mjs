/**
 * Session 5 · A3/A4 — the Thursday pregame refresh is automatic and free, and its last pass lands after the
 * official inactives. Deterministic: fixed clocks, fixture boards — never the calendar the suite runs on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { decidePregameFreeRefresh, HORIZON_MIN, MAX_WAIT_MIN, PASSES, PREGAME_REFRESH as D, TARGET_LEAD_MIN } from "./pregame-free-refresh.mjs";

const board = (generatedAt, kickoffUtc = "2026-10-02T00:15Z", matchup = "PIT @ CLE") => ({ artifact: "nfl-player-board", providerEventId: "401872964", matchup, kickoffUtc, generatedAt });
const decide = (generatedAt, nowIso) => decidePregameFreeRefresh({ boards: [board(generatedAt)], nowIso });
const STALE = "2026-10-01T20:16:30Z"; // the last scheduled board before kickoff on 2026-10-01

test("A4 · the first delivery waits for the ROSTER pass at T-105, whatever hour it arrives", () => {
  for (const [now, wait] of [["2026-10-01T19:00:00Z", 3 * 3600 + 30 * 60], ["2026-10-01T21:41:00Z", 49 * 60], ["2026-10-01T18:00:00Z", 4 * 3600 + 30 * 60]]) {
    const d = decide(STALE, now);
    assert.equal(d.decision, D.WAIT_THEN_DISPATCH, now);
    assert.equal(d.pass, "ROSTER");
    assert.equal(d.waitSeconds, wait, now);
  }
  assert.equal(decide(STALE, "2026-10-01T17:00:00Z").decision, D.NO_GAME, "beyond the horizon a run leaves it to a later delivery");
});

test("A4 · after the wait it dispatches — including a re-decision a few seconds early, and a late arrival", () => {
  assert.equal(decide(STALE, "2026-10-01T22:29:58Z").decision, D.DISPATCH_NOW);
  const late = decide(STALE, "2026-10-01T23:10:00Z");
  assert.equal(late.decision, D.DISPATCH_NOW, "inside both passes: one dispatch now");
});

test("A3 · a board refreshed at T-105 still owes the INACTIVES pass at T-55 (the 2026-10-01 gap)", () => {
  // The manual dispatch produced 22:30:25Z; the six coach's-decision inactives were stamped 22:48–23:08Z.
  const d = decide("2026-10-01T22:30:25Z", "2026-10-01T22:40:00Z");
  assert.equal(d.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d.pass, "INACTIVES");
  assert.equal(d.waitSeconds, 40 * 60, "until 23:20Z, T-55 — after the last inactive stamp (23:08Z)");
  assert.equal(decide("2026-10-01T22:30:25Z", "2026-10-01T23:19:58Z").decision, D.DISPATCH_NOW);
});

test("A3 · a board regenerated after the declaration IS the refresh — no further dispatch", () => {
  assert.equal(decide("2026-10-01T23:21:00Z", "2026-10-01T23:30:00Z").decision, D.ALREADY_REFRESHED);
});

test("A4 · too close to kickoff, and no game, are holds — never a dispatch that lands after the start", () => {
  assert.equal(decide(STALE, "2026-10-02T00:00:00Z").decision, D.TOO_LATE);
  assert.equal(decidePregameFreeRefresh({ boards: [board(STALE, "2026-10-04T17:00Z")], nowIso: "2026-10-01T19:00:00Z" }).decision, D.NO_GAME);
  assert.equal(decidePregameFreeRefresh({ boards: [], nowIso: "2026-10-01T19:00:00Z" }).decision, D.NO_GAME);
  assert.throws(() => decidePregameFreeRefresh({ boards: [], nowIso: "" }));
});

test("A4 · CONTRACT: free by construction, waits inside its timeout, re-decides on pulled boards, deduped", () => {
  const code = fs.readFileSync("../.github/workflows/nfl-pregame-free-refresh.yml", "utf8").replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /secrets\./, "no secret may be named");
  assert.doesNotMatch(code, /probe_props|week_window/, "never the paid prop probe");
  const dispatches = [...code.matchAll(/gh workflow run ([^\n]+)/g)].map((m) => m[1]);
  assert.equal(dispatches.length, 1);
  assert.match(dispatches[0], /^nfl-event-window\.yml --ref main -f skip_odds=true\b/, "the only dispatch is the zero-credit event window");
  assert.match(code, /cron: "0 1[789] \* \* 4"/, "Thursday UTC schedules");
  assert.match(code, /cron: "0 1[789] \* \* 1"/, "Monday UTC schedules (Monday Night Football)");
  assert.match(code, /cancel-in-progress: false/);
  const timeout = Number(code.match(/timeout-minutes:\s*(\d+)/)[1]);
  assert.ok(timeout <= 360, "GitHub-hosted jobs stop at 360 minutes");
  assert.ok(timeout >= HORIZON_MIN - PASSES.at(-1).leadMin + 30, `timeout ${timeout} must cover the horizon to the last pass plus its window run`);
  assert.ok(MAX_WAIT_MIN + TARGET_LEAD_MIN === HORIZON_MIN);
  assert.match(code, /git pull --quiet --ff-only origin main\s*\n\s*d="\$\(node scripts\/nfl\/decide-pregame-free-refresh\.mjs/, "every decision reads boards pulled at that moment");
  assert.match(code, /wait_idle\s*\n\s*gh workflow run/, "an in-flight event window is waited out, never raced");
  assert.ok(PASSES[0].leadMin >= 90 && PASSES[0].leadMin <= 120, "the roster pass sits in the 90–120 band");
  assert.ok(PASSES.at(-1).leadMin < 67 && PASSES.at(-1).leadMin > 25, "the inactives pass follows the observed T-67 last stamp and lands before kickoff");
});

test("A4 · CONTRACT: the paid kickoff refresh is unchanged by this (no new paid path)", () => {
  /* The intent, not one cron string (Session 9 widened the band to 23Z and added a workflow_run tick):
     still Thursday-covered, still keyless, and still the ONE paid dispatch with the same inputs. */
  const src = fs.readFileSync("../.github/workflows/nfl-kickoff-refresh.yml", "utf8");
  assert.match(src, /cron: "\*\/30 17-2\d \* \* 4"/);
  assert.ok(!/ODDS_API_KEY|secrets\.ODDS/.test(src));
  assert.equal((src.match(/gh workflow run /g) ?? []).length, 1);
  assert.match(src, /gh workflow run nfl-event-window\.yml --ref main \\\n\s*-f probe_props=all -f week_window=true -f lookahead_hours=18/);
});

test("MNF · the same two passes for a Monday 00:15Z-Tuesday kickoff", () => {
  const mnf = "2026-10-06T00:15Z";
  const d1 = decidePregameFreeRefresh({ boards: [{ artifact: "nfl-player-board", matchup: "ATL @ NO", kickoffUtc: mnf, generatedAt: "2026-10-05T13:00:00Z" }], nowIso: "2026-10-05T19:00:00Z" });
  assert.equal(d1.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d1.pass, "ROSTER");
  const d2 = decidePregameFreeRefresh({ boards: [{ artifact: "nfl-player-board", matchup: "ATL @ NO", kickoffUtc: mnf, generatedAt: "2026-10-05T22:30:00Z" }], nowIso: "2026-10-05T22:40:00Z" });
  assert.equal(d2.pass, "INACTIVES");
});
