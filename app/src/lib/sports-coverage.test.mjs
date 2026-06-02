/**
 * Tests for the sports-coverage registry (`sports-coverage.ts`).
 *
 * These lock the HONESTY contract for the sports hub:
 *   - only NBA + MLB may claim "full" (Projections + Parlays);
 *   - "coming-soon" sports (MLS/EPL) must link NOWHERE (no implied coverage);
 *   - every covered sport (full/projections/schedule) has at least one link;
 *   - all links are internal real surfaces (start with "/");
 *   - no banned betting copy anywhere in the user-facing strings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPORTS_COVERAGE,
  COVERAGE_BADGE,
  fullyCoveredSports,
  getSportCoverage,
} from "./sports-coverage.ts";

const BANNED = [
  "lock",
  "guaranteed",
  "free money",
  "risk-free",
  "risk free",
  "can't miss",
  "cant miss",
  "easy win",
  "easy money",
  "no-brainer",
  "no brainer",
  "sure thing",
  "sharp money",
];

test("only NBA and MLB are 'full' (real projections + parlays)", () => {
  const full = new Set(fullyCoveredSports().map((s) => s.key));
  assert.deepEqual([...full].sort(), ["mlb", "nba"]);
});

test("coming-soon sports publish nothing — no links", () => {
  const coming = SPORTS_COVERAGE.filter((s) => s.level === "coming-soon");
  assert.ok(coming.length >= 2, "expected MLS + EPL as coming-soon");
  for (const s of coming) {
    assert.equal(s.links.length, 0, `${s.key} must not link anywhere`);
  }
  // MLS + EPL specifically must be coming-soon (no fabricated schedule).
  assert.equal(getSportCoverage("mls")?.level, "coming-soon");
  assert.equal(getSportCoverage("epl")?.level, "coming-soon");
});

test("every covered (non-coming-soon) sport has at least one real link", () => {
  for (const s of SPORTS_COVERAGE) {
    if (s.level === "coming-soon") continue;
    assert.ok(s.links.length >= 1, `${s.key} should have a link`);
  }
});

test("all links are internal app routes", () => {
  for (const s of SPORTS_COVERAGE) {
    for (const l of s.links) {
      assert.ok(l.href.startsWith("/"), `${s.key} link ${l.href} must be internal`);
      assert.ok(l.label.length > 0, `${s.key} link needs a label`);
    }
  }
});

test("no banned betting copy in any user-facing string", () => {
  const strings = [];
  for (const s of SPORTS_COVERAGE) {
    strings.push(s.label, s.longLabel, s.blurb, ...s.links.map((l) => l.label));
  }
  for (const [, badge] of Object.entries(COVERAGE_BADGE)) {
    strings.push(badge.label);
  }
  for (const str of strings) {
    const lower = str.toLowerCase();
    for (const w of BANNED) {
      // word-boundary check for "lock" so "unlock"/"clock" don't false-positive
      if (w === "lock") {
        assert.ok(!/\block\b/.test(lower), `banned word "lock" in: ${str}`);
      } else {
        assert.ok(!lower.includes(w), `banned word "${w}" in: ${str}`);
      }
    }
    // no user-facing "safe"/"safety"
    assert.ok(!/\bsafe(ty)?\b/.test(lower), `avoid "safe/safety" in: ${str}`);
  }
});

test("every level used has a badge definition", () => {
  for (const s of SPORTS_COVERAGE) {
    assert.ok(COVERAGE_BADGE[s.level], `missing badge for level ${s.level}`);
    assert.ok(COVERAGE_BADGE[s.level].label.length > 0);
  }
});

test("keys are unique", () => {
  const keys = SPORTS_COVERAGE.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate sport key");
});
