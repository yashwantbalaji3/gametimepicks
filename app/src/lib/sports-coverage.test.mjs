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
  /*
   * The RULE, not a roster. This required at least one coming-soon sport and named EPL as it, which
   * stopped being true the day EPL began publishing forecasts — the registry then said "not modelled
   * yet" beside a live per-fixture distribution table. A rule that needs a member to be testable
   * quietly becomes a rule about that member.
   */
  for (const s of SPORTS_COVERAGE.filter((x) => x.level === "coming-soon")) {
    assert.equal(s.links.length, 0, `${s.key} must not link anywhere`);
  }
});

test("EPL's registry entry describes what it publishes, and claims no player capability", () => {
  /*
   * The entry said "Not modelled yet, and no upcoming fixtures published" while /epl rendered a live
   * per-fixture distribution table. Fixed — but deliberately NOT by moving it to the "projections"
   * level: in this registry that flag means PLAYER-PROP projections, and EPL has no player data at
   * all. The level stays conservative; the blurb carries the truth.
   */
  const epl = getSportCoverage("epl");
  assert.notEqual(epl?.level, "coming-soon", "EPL publishes per-fixture forecasts");
  assert.notEqual(epl?.level, "projections", "that level asserts player-prop projections, which EPL does not have");
  assert.ok((epl?.links.length ?? 0) >= 1, "a sport that publishes must link to where");
  assert.match(epl?.blurb ?? "", /forecast/i, "the blurb says what actually publishes");
  assert.match(epl?.blurb ?? "", /not validated out of sample/i, "the blurb carries the limitation");
  assert.match(epl?.blurb ?? "", /no player markets/i, "and states the player refusal rather than omitting it");
});

test("MLS now has a real sourced schedule (schedule-only, linked)", () => {
  const mls = getSportCoverage("mls");
  assert.equal(mls?.level, "schedule");
  assert.ok((mls?.links.length ?? 0) >= 1, "MLS links to its schedule");
  // still must NOT claim projections/parlays
  assert.notEqual(mls?.level, "full");
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
