import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRefreshWindows } from "../../../../scripts/watch-worldcup-lineups.mjs";

// NED/SWE kicks off 17:00Z. Windows: open at 16:00Z (T−60), preferred target 16:15Z (T−45),
// close at 16:45Z (T−15). Importing the watcher must NOT run main() (invocation guard).
const KO = "2026-06-20T17:00:00Z";
const games = [{ gameId: "33", slug: "netherlands-vs-sweden-2026-06-20", kickoffUtc: KO }];

test("watcher: well before kickoff (T−120) the window is closed and no refresh is due", () => {
  const [g] = computeRefreshWindows(games, "2026-06-20T15:00:00Z");
  assert.equal(g.windowOpen, false, "T−120 is pre-window");
  assert.equal(g.windowClosed, false, "not started/closed");
  assert.equal(g.minsToKickoff, 120);
});

test("watcher: inside the window (T−45) windowOpen is true and refreshTarget = kickoff − 45m", () => {
  const [g] = computeRefreshWindows(games, "2026-06-20T16:15:00Z");
  assert.equal(g.windowOpen, true, "T−45 is inside the open window");
  assert.equal(g.windowClosed, false);
  assert.equal(g.minsToKickoff, 45);
  assert.equal(g.refreshTarget, "2026-06-20T16:15:00.000Z", "preferred target is kickoff − 45m");
});

test("watcher: window opens exactly at T−60 and is still open at T−16", () => {
  assert.equal(computeRefreshWindows(games, "2026-06-20T16:00:00Z")[0].windowOpen, true, "T−60 open");
  assert.equal(computeRefreshWindows(games, "2026-06-20T16:44:00Z")[0].windowOpen, true, "T−16 still open");
});

test("watcher: at T−15 and after kickoff the window is closed (no new pre-event cards)", () => {
  const close = computeRefreshWindows(games, "2026-06-20T16:45:00Z")[0];
  assert.equal(close.windowClosed, true, "T−15 closes the window");
  assert.equal(close.windowOpen, false);
  const started = computeRefreshWindows(games, "2026-06-20T17:30:00Z")[0];
  assert.equal(started.windowClosed, true, "after kickoff stays closed");
  assert.equal(started.windowOpen, false);
});

test("watcher: a game with no kickoff time yields null mins and no window (never fabricated)", () => {
  const [g] = computeRefreshWindows([{ gameId: "x", slug: "tbd", kickoffUtc: null }], "2026-06-20T16:15:00Z");
  assert.equal(g.minsToKickoff, null);
  assert.equal(g.windowOpen, false);
  assert.equal(g.windowClosed, false);
});

test("watcher: multiple games are classified independently against the same now", () => {
  const multi = [
    { gameId: "33", slug: "ned-swe", kickoffUtc: "2026-06-20T17:00:00Z" }, // T−45 → open
    { gameId: "34", slug: "ger-civ", kickoffUtc: "2026-06-20T20:00:00Z" }, // T−225 → pre-window
  ];
  const [a, b] = computeRefreshWindows(multi, "2026-06-20T16:15:00Z");
  assert.equal(a.windowOpen, true, "early game in window");
  assert.equal(b.windowOpen, false, "later game still pre-window");
});
