/**
 * June 13 data-unblock invariants: MLB June-13 is a REAL schedule (MLB Stats API, team ids,
 * no fabricated odds), the /mlb hub renders official team logos, NBA Game 5 stays real, and
 * Step 5 stays review-pending (no invented card). Guards against fabrication or regression.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));

test("MLB June-13 schedule is real (MLB Stats API) with team ids and NO fabricated odds", () => {
  const s = read("mlb/schedule/2026-06-13.json");
  assert.equal(s.date, "2026-06-13");
  assert.match(s.source, /statsapi/i, "schedule from the official MLB Stats API");
  assert.ok(s.games.length >= 10, "real multi-game slate");
  const g = s.games[0];
  assert.ok(typeof g.homeTeamId === "number" && typeof g.awayTeamId === "number",
    "team ids present → official mlbstatic logos resolve");
  // Schedule-only: no odds/props were fabricated under dry-run.
  assert.ok(!("leans" in s) || (s.leans ?? []).length === 0, "no fabricated odds/props");
});

test("/mlb hub renders official MLB team logos from the board team ids", () => {
  const page = fs.readFileSync("src/app/mlb/page.tsx", "utf8");
  assert.ok(page.includes("mlbTeamLogoUrl(g.awayTeamId)") && page.includes("mlbTeamLogoUrl(g.homeTeamId)"),
    "game tiles derive logos from real team ids");
  assert.ok(page.includes("TeamMark"), "uses the shared logo→flag→monogram mark");
});

test("NBA June-13 board stays REAL (Game 5), Bank Builder unchanged, Step 5 review-pending", () => {
  const b = read("boards/2026-06-13.json");
  assert.equal(b.isDemo, false);
  assert.equal(b.dataMode, "Live");
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.nextPickStatus, "pending");
  assert.equal(l.entries.filter((e) => e.step === 5).length, 0, "no invented Step 5 entry");
});
