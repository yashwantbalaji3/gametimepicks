/* Audit 2026-10-28 F08: an NFL player page with 2026 game logs must not say 2026 logs are unavailable. Committed projection. */
import test from "node:test";
import assert from "node:assert/strict";

const { playerBySlug } = await import("./projection-store.ts");
const { coverageNoteText } = await import("./coverage.mjs");

test("Mahomes (2026 rows recorded) reads as partial current season, never 'not available'", () => {
  const p = playerBySlug("NFL", "patrick-mahomes");
  assert.ok(p, "committed projection has the player");
  assert.ok(p.seasons.some((s) => s.id === "NFL-2026"), "positive control: 2026 rows exist");
  assert.ok(p.coverage.notes.includes("NFL_PLAYER_2026_PARTIAL"));
  assert.ok(!p.coverage.unavailable.includes("CURRENT_SEASON_LOGS"));
  for (const c of p.coverage.notes) assert.doesNotMatch(coverageNoteText(c, p.coverage), /not available yet/);
});
