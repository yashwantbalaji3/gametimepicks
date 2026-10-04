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
  // Session 12: an in-flight window (paid or free) is waited out and the decision is RE-MADE on its boards
  // before any dispatch — a dispatch never follows a wait directly.
  assert.match(code, /if \[ "\$\(inflight\)" != "0" \]; then[\s\S]{0,160}?wait_idle\s*\n\s*continue\s*\n\s*fi\s*\n\s*gh workflow run/, "an in-flight event window is waited out and re-decided, never raced");
  assert.doesNotMatch(code, /wait_idle\s*\n\s*gh workflow run/, "never dispatch straight after a wait — re-decide first");
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

/* ─── SESSION 12 · SUNDAY: several kickoff groups, one free owner ──────────────────────────────────────────
 * The real 2026-10-04 slate (Week 4): nine 17:00Z games, MIA @ MIN 20:05Z, three 20:25Z games, DET @ CAR 00:20Z,
 * and ATL @ NO on Monday night (beyond the horizon all Sunday). */
const SUN = [
  ...["TEN @ BAL", "NE @ BUF", "LAR @ PHI", "NYJ @ CHI", "JAX @ CIN", "GB @ TB", "DAL @ HOU", "ARI @ NYG", "PIT @ CLE"].map((m) => ({ matchup: m, kickoffUtc: "2026-10-04T17:00Z" })),
  { matchup: "MIA @ MIN", kickoffUtc: "2026-10-04T20:05Z" },
  ...["DEN @ SF", "KC @ LV", "LAC @ SEA"].map((m) => ({ matchup: m, kickoffUtc: "2026-10-04T20:25Z" })),
  { matchup: "DET @ CAR", kickoffUtc: "2026-10-05T00:20Z" },
  { matchup: "ATL @ NO", kickoffUtc: "2026-10-06T00:15Z" },
];
/** Every unstarted board regenerated at `at` (one event-window run rebuilds every pre-start game). */
const sunday = (at, nowIso) => decidePregameFreeRefresh({
  boards: SUN.map((b, i) => ({ artifact: "nfl-player-board", providerEventId: String(401872960 + i), ...b, generatedAt: at })),
  nowIso,
});

test("SUNDAY · the first morning delivery waits for the 1 PM block's ROSTER pass", () => {
  const d = sunday("2026-10-03T21:00:00Z", "2026-10-04T11:17:00Z"); // daily-products' first tick that day
  assert.equal(d.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d.pass, "ROSTER");
  assert.equal(d.kickoffUtc, "2026-10-04T17:00:00.000Z");
  assert.equal(d.waitSeconds, (15 * 60 + 15 - (11 * 60 + 17)) * 60, "until 15:15Z, T-105");
});

test("SUNDAY · the paid T-120 refresh's boards satisfy ROSTER — the free owner waits for INACTIVES, never re-runs it", () => {
  const d = sunday("2026-10-04T15:02:50Z", "2026-10-04T15:10:00Z");
  assert.equal(d.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d.pass, "INACTIVES", "a board regenerated at T-117 is inside the roster band");
  assert.equal(d.waitSeconds, (16 * 60 + 5 - (15 * 60 + 10)) * 60, "until 16:05Z, T-55");
});

test("SUNDAY · REGRESSION: a finished 1 PM group moves on to 4:05 PM instead of ending the job", () => {
  /* Before Session 12 the earliest kickoff decided alone: ALREADY_REFRESHED → the job exited, and the 4 PM
     inactives waited on a fresh delivery the Sunday afternoon might not bring. */
  const d = sunday("2026-10-04T16:06:00Z", "2026-10-04T16:10:00Z");
  assert.equal(d.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d.matchup, "MIA @ MIN");
  assert.equal(d.pass, "ROSTER");
  assert.equal(d.waitSeconds, (18 * 60 + 20 - (16 * 60 + 10)) * 60, "until 18:20Z, T-105 for 20:05Z");
});

test("SUNDAY · 4:05 and 4:25 are separate groups — 4:25 still owes its own INACTIVES pass (the KC case)", () => {
  /* 2026-10-04: KC's inactives (stamped 19:09Z) were PUBLISHED after the 19:22Z capture. A pass at T-55 for
     20:25Z (19:30Z) is what catches them; a board from the 4:05 pass (19:11Z = T-74) does not satisfy it. */
  const d = sunday("2026-10-04T19:11:00Z", "2026-10-04T19:12:00Z");
  assert.equal(d.decision, D.WAIT_THEN_DISPATCH);
  assert.equal(d.matchup, "DEN @ SF, KC @ LV, LAC @ SEA");
  assert.equal(d.pass, "INACTIVES");
  assert.equal(d.waitSeconds, 18 * 60, "until 19:30Z");
});

test("SUNDAY · a group too late to help does not block the next one", () => {
  const d = sunday("2026-10-04T18:30:00Z", "2026-10-04T19:45:00Z"); // 4:05 is 20 min out; 4:25 is 40
  assert.equal(d.decision, D.DISPATCH_NOW);
  assert.equal(d.pass, "INACTIVES");
  assert.equal(d.kickoffUtc, "2026-10-04T20:25:00.000Z");
});

test("SUNDAY · started games are never a reason to act; the night game is next", () => {
  const d = sunday("2026-10-04T19:24:18Z", "2026-10-04T21:00:00Z");
  assert.equal(d.matchup, "DET @ CAR", "every 1 PM and 4 PM game has kicked off and is ignored");
  assert.equal(d.pass, "ROSTER");
  assert.equal(d.waitSeconds, 95 * 60, "until 22:35Z, T-105 for 00:20Z");
  const night = sunday("2026-10-04T22:36:00Z", "2026-10-04T22:40:00Z");
  assert.equal(night.pass, "INACTIVES");
  assert.equal(night.waitSeconds, 45 * 60, "until 23:25Z, T-55");
});

test("SUNDAY · when every group is done, the EARLIEST terminal state is reported (single-game behaviour unchanged)", () => {
  const d = sunday("2026-10-04T23:26:00Z", "2026-10-04T23:30:00Z");
  assert.equal(d.decision, D.ALREADY_REFRESHED);
  assert.equal(d.matchup, "DET @ CAR");
  // Thursday: one game, too late → TOO_LATE, exactly as before.
  assert.equal(decide(STALE, "2026-10-02T00:00:00Z").decision, D.TOO_LATE);
});

test("SUNDAY · CONTRACT: delivered clocks, trust boundary, still free", () => {
  const raw = fs.readFileSync("../.github/workflows/nfl-pregame-free-refresh.yml", "utf8");
  const code = raw.replace(/^\s*#.*$/gm, "");
  assert.match(code, /cron: "0 \d{1,2} \* \* 0"/, "Sunday UTC schedules");
  assert.match(code, /workflow_run:\s*\n\s*workflows: \["publication-watchdog"\]\s*\n\s*types: \[completed\]/, "the afternoon clock that delivers");
  assert.match(code, /github\.event_name != 'workflow_run' \|\|\s*\n\s*github\.event\.workflow_run\.head_branch == github\.event\.repository\.default_branch/, "default-branch only");
  assert.match(fs.readFileSync("../.github/workflows/daily-products.yml", "utf8"), /for wf in [^\n]*\bnfl-pregame-free-refresh\.yml\b/, "the morning tick starts it");
  assert.doesNotMatch(code, /secrets\./);
  assert.doesNotMatch(code, /probe_props|week_window/);
  assert.equal([...code.matchAll(/gh workflow run /g)].length, 1, "one dispatch, the zero-credit window");
});
