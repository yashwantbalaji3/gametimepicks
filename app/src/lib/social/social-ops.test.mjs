import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSocialOpsBoard } from "./social-ops.ts";

const TODAY = "2026-07-24";
function pack(over = {}) {
  return {
    date: over.date ?? TODAY,
    generatedAt: over.generatedAt ?? "2026-07-24T13:30:00Z",
    sections: {
      morningBrief: { message: "Today's MLB brief — 5 games simulated", todayUrl: "https://site/today" },
      largestSimulationDifferences: over.spot === null ? [] : [{ game: "KC @ DET", gameUrl: over.spotPath ?? "/games/mlb/kc-vs-det-2026-07-24", player: "Troy Melton" }],
      resultsRecap: { settledDate: over.settled === null ? null : "2026-07-23" },
    },
  };
}

test("three slots with canonical destinations + coarse source-attributed variants (direct stays clean)", () => {
  const b = buildSocialOpsBoard(pack(), { today: TODAY, availableGamePaths: new Set(["/games/mlb/kc-vs-det-2026-07-24"]) });
  assert.deepEqual(b.slots.map((s) => s.slot), ["morning", "afternoon", "evening"]);
  const morning = b.slots[0];
  assert.equal(morning.destinationPath, "/today");
  assert.equal(morning.attributed.x, "/today?source=x");
  assert.equal(morning.attributed.discord, "/today?source=discord");
  assert.equal(b.slots[2].destinationPath, "/results");
});

test("a fresh, available pack is fully launchable; approval defaults to draft", () => {
  const b = buildSocialOpsBoard(pack(), { today: TODAY, availableGamePaths: new Set(["/games/mlb/kc-vs-det-2026-07-24"]) });
  assert.equal(b.launchable, 3);
  for (const s of b.slots) { assert.equal(s.blocked, null); assert.equal(s.approvalState, "draft"); }
});

test("a stale pack (claims a non-today slate) blocks the morning + afternoon slots — cannot launch as 'today'", () => {
  const b = buildSocialOpsBoard(pack({ date: "2026-07-23" }), { today: TODAY, availableGamePaths: new Set(["/games/mlb/kc-vs-det-2026-07-24"]) });
  assert.equal(b.slots[0].blocked, "stale");
  assert.equal(b.slots[1].blocked, "stale");
  assert.match(b.slots[0].note, /stale/);
  assert.ok(b.launchable < 3);
});

test("the afternoon Spotlight is blocked when its canonical report is unavailable/mismatched", () => {
  const b = buildSocialOpsBoard(pack({ spotPath: "/games/mlb/ghost-2026-07-24" }), { today: TODAY, availableGamePaths: new Set(["/games/mlb/kc-vs-det-2026-07-24"]) });
  assert.equal(b.slots[1].blocked, "unavailable");
  assert.match(b.slots[1].note, /unavailable|mismatched/);
});

test("the evening recap is unavailable when there is no settled prior date (never faked)", () => {
  const b = buildSocialOpsBoard(pack({ settled: null }), { today: TODAY });
  assert.equal(b.slots[2].blocked, "unavailable");
  assert.match(b.slots[2].note, /No settled prior-date recap/);
});

test("approval states are READ from the repo-native map (never invented), unknown → draft", () => {
  const b = buildSocialOpsBoard(pack(), { today: TODAY, availableGamePaths: new Set(["/games/mlb/kc-vs-det-2026-07-24"]), approvals: { morning: "approved", afternoon: "skipped", evening: "garbage" } });
  assert.equal(b.slots[0].approvalState, "approved");
  assert.equal(b.slots[1].approvalState, "skipped");
  assert.equal(b.slots[2].approvalState, "draft"); // unknown value → default draft
});

test("doubleheader spotlight keeps its exact gamePk-suffixed canonical path after attribution", () => {
  const dh = "/games/mlb/az-vs-stl-2026-07-24-777002";
  const b = buildSocialOpsBoard(pack({ spotPath: dh }), { today: TODAY, availableGamePaths: new Set([dh]) });
  assert.equal(b.slots[1].destinationPath, dh);
  assert.equal(b.slots[1].attributed.x, `${dh}?source=x`, "source param appended, slug untouched");
});
