/**
 * Team-logo slug guards (Sprint 031 · Phase 4).
 *
 * This exists because of a bug that shipped and looked fine. The Market Center passed DISPLAY NAMES
 * to TeamLogo, so the CDN was asked for `arizonadiamondbacks.png`, 404'd on all 24 logos, and the
 * component's onError fallback drew initials monograms instead. Screenshots looked correct; the
 * logos had simply never loaded. Only the browser harness's console-error assertion surfaced it.
 *
 * A visual fallback that hides a defect is worse than a visible break, so the slug is now asserted
 * directly rather than trusted to "look right".
 *
 * Run: npx tsx --test src/lib/logo-slug.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";

import { espnLogoSlug } from "../components/team-logo.tsx";

test("an abbreviation passes through as the CDN slug", () => {
  assert.equal(espnLogoSlug("SEA", "mlb"), "sea");
  assert.equal(espnLogoSlug("TEX", "mlb"), "tex");
  assert.equal(espnLogoSlug("CIN", "mlb"), "cin");
});

test("Arizona is aliased, because StatsAPI and ESPN disagree about it", () => {
  // StatsAPI says AZ; ESPN serves ari.png. Without the alias this 404s and silently degrades.
  assert.equal(espnLogoSlug("AZ", "mlb"), "ari");
  assert.equal(espnLogoSlug("az", "mlb"), "ari");
});

test("a display name does NOT resolve to a valid slug — it must never be passed", () => {
  // Documents the failure mode rather than asserting it is acceptable: callers pass abbreviations.
  const slug = espnLogoSlug("Arizona Diamondbacks", "mlb");
  assert.equal(slug, "arizonadiamondbacks");
  assert.ok(slug.length > 4, "a real MLB CDN slug is 2-3 characters; this is the bug's signature");
});

test("the Market Center passes abbreviations, not display names", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/market-center.tsx"), "utf8");
  // Both logos must prefer the abbreviation field.
  assert.ok(
    src.includes("team={g.awayTeamAbbr ?? g.awayTeam}"),
    "away logo must use the abbreviation",
  );
  assert.ok(
    src.includes("team={g.homeTeamAbbr ?? g.homeTeam}"),
    "home logo must use the abbreviation",
  );
});

test("canonical game intelligence carries abbreviations separately from display names", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/markets/game-intelligence.ts"), "utf8");
  for (const field of ["homeTeamAbbr", "awayTeamAbbr"]) {
    assert.ok(src.includes(field), `${field} must exist so callers need not guess one`);
  }
});
