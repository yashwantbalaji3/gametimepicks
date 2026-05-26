/**
 * Tests for the cricket player-projections loader.
 *
 * Run: npx tsx --test app/src/lib/data-cricket-players.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getCricketPlayerProjectionsForDate,
  groupPlayersByTeam,
  sortPlayersForDisplay,
} from "./data-cricket-players.ts";

test("getCricketPlayerProjectionsForDate returns null for missing date", () => {
  assert.equal(getCricketPlayerProjectionsForDate("2099-12-31"), null);
});

test("getCricketPlayerProjectionsForDate returns null for empty string", () => {
  assert.equal(getCricketPlayerProjectionsForDate(""), null);
});

test("groupPlayersByTeam buckets by team", () => {
  const players = [
    { team: "RCB", name: "A", role: "batter", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
    { team: "GT", name: "B", role: "bowler", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
    { team: "RCB", name: "C", role: "all-rounder", likelyXiStatus: "squad",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
  ];
  const grouped = groupPlayersByTeam(players);
  assert.equal(grouped.RCB.length, 2);
  assert.equal(grouped.GT.length, 1);
});

test("sortPlayersForDisplay orders by role priority", () => {
  const players = [
    { team: "RCB", name: "B-Bowler", role: "bowler", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
    { team: "RCB", name: "A-Batter", role: "batter", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
    { team: "RCB", name: "A-Keeper", role: "keeper", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
    { team: "RCB", name: "Z-AllRounder", role: "all-rounder", likelyXiStatus: "likely",
      projectionType: "context-only", roleImpact: "x", confidence: "Qualitative",
      manual: true, source: "x" },
  ];
  const ordered = sortPlayersForDisplay(players);
  assert.equal(ordered[0].role, "batter");
  assert.equal(ordered[1].role, "all-rounder");
  assert.equal(ordered[2].role, "keeper");
  assert.equal(ordered[3].role, "bowler");
});

test("checked-in 2026-05-26 file has only context-only projections (no fake numbers)", () => {
  const file = getCricketPlayerProjectionsForDate("2026-05-26");
  if (!file) return;
  // Must have status pre_toss and a totalsContext that explicitly
  // says "not sportsbook line".
  assert.equal(file.status, "pre_toss");
  assert.ok(file.totalsContext);
  assert.ok(file.totalsContext.label.toLowerCase().includes("not sportsbook"));
  // Every player must be context-only with manual+source. No numeric
  // projection allowed to slip in without `projectionType: "numeric"`.
  assert.ok(file.players.length >= 6, "expected at least 6 players");
  for (const p of file.players) {
    assert.equal(p.projectionType, "context-only",
      `${p.name} must be context-only when no numeric data is wired`);
    assert.equal(p.manual, true, `${p.name} must be flagged manual`);
    assert.ok(p.source && p.source.length > 0,
      `${p.name} must cite a source`);
    // Numeric fields must be unset for context-only entries.
    assert.equal(p.projectedRuns ?? null, null,
      `${p.name} must NOT carry a fabricated projectedRuns value`);
    assert.equal(p.projectedWickets ?? null, null,
      `${p.name} must NOT carry a fabricated projectedWickets value`);
  }
});

test("checked-in file lists both RCB and GT players with multiple roles", () => {
  const file = getCricketPlayerProjectionsForDate("2026-05-26");
  if (!file) return;
  const byTeam = groupPlayersByTeam(file.players);
  assert.ok(byTeam.RCB && byTeam.RCB.length >= 3, "RCB has >= 3 players");
  assert.ok(byTeam.GT && byTeam.GT.length >= 3, "GT has >= 3 players");
  const allRoles = new Set(file.players.map((p) => p.role));
  // Must include at least one batter and at least one bowler so
  // the UI's role grouping isn't empty.
  assert.ok(allRoles.has("batter"));
  assert.ok(allRoles.has("bowler"));
});

test("notes block carries pre-toss + XI caveats", () => {
  const file = getCricketPlayerProjectionsForDate("2026-05-26");
  if (!file) return;
  const joined = file.notes.join(" ").toLowerCase();
  assert.ok(joined.includes("pre-toss") || joined.includes("playing xi"),
    "notes must surface the pre-toss / XI caveat");
});

test("direct file JSON parse sanity backstop", () => {
  const p = path.join(
    process.cwd(),
    "public", "data", "cricket", "player-projections",
    "2026-05-26.json",
  );
  if (!fs.existsSync(p)) return;
  const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
  assert.equal(parsed.date, "2026-05-26");
});
