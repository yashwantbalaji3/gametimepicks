/**
 * mlbTeamLogoUrl contract: produce an OFFICIAL mlbstatic team-logo URL from a real
 * MLB Stats API team id (the same official-source family as the player headshots),
 * and null when there's no id — never a scraped/fabricated mark. Also asserts the
 * fixture/games surfaces derive MLB logos from the real homeTeamId/awayTeamId.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mlbTeamLogoUrl } from "./player-headshots.ts";

test("builds the official mlbstatic URL from a real team id", () => {
  assert.equal(mlbTeamLogoUrl(134), "https://www.mlbstatic.com/team-logos/134.svg");
  assert.equal(mlbTeamLogoUrl("146"), "https://www.mlbstatic.com/team-logos/146.svg");
});

test("returns null without an id (caller falls back to a monogram, never a fake logo)", () => {
  assert.equal(mlbTeamLogoUrl(null), null);
  assert.equal(mlbTeamLogoUrl(undefined), null);
  assert.equal(mlbTeamLogoUrl(""), null);
});

test("the board JSON actually carries the real team ids this depends on", () => {
  const board = JSON.parse(fs.readFileSync("public/data/mlb/boards/2026-06-12.json", "utf8"));
  const g = (board.games ?? [])[0];
  assert.ok(g && typeof g.homeTeamId === "number" && typeof g.awayTeamId === "number",
    "MLB board games carry homeTeamId/awayTeamId — the honest source for official logos");
});

test("the games list + fixture detail derive MLB logos from those ids (not hardcoded)", () => {
  const page = fs.readFileSync("src/app/games/page.tsx", "utf8");
  assert.ok(page.includes("mlbTeamLogoUrl(g.homeTeamId)") && page.includes("mlbTeamLogoUrl(g.awayTeamId)"),
    "games rows derive MLB logos from the real ids");
  const detail = fs.readFileSync("src/lib/game-detail.ts", "utf8");
  assert.ok(detail.includes('sport === "mlb" ? mlbTeamLogoUrl(g.homeTeamId)'),
    "fixture detail sets MLB-only logos from the real ids");
});
