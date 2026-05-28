/**
 * Tests for the lane-display map. UI-only rename; internal profile
 * keys must not change. These tests guard against accidental rename
 * regressions (e.g. someone reverts to "Conservative" or introduces
 * "safe" copy).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLaneDisplay, LANE_DISPLAY_ORDER } from "./lane-display.ts";

test("getLaneDisplay: conservative → Anchor", () => {
  const d = getLaneDisplay("conservative");
  assert.equal(d.name, "Anchor");
  assert.equal(d.tone, "anchor");
});

test("getLaneDisplay: balanced → Core", () => {
  const d = getLaneDisplay("balanced");
  assert.equal(d.name, "Core");
  assert.equal(d.tone, "core");
});

test("getLaneDisplay: star_power → Spotlight", () => {
  const d = getLaneDisplay("star_power");
  assert.equal(d.name, "Spotlight");
  assert.equal(d.tone, "spotlight");
});

test("getLaneDisplay: aggressive → Swing", () => {
  const d = getLaneDisplay("aggressive");
  assert.equal(d.name, "Swing");
  assert.equal(d.tone, "swing");
});

test("getLaneDisplay: subtitles never use banned betting copy", () => {
  const banned = [
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
    "safe",
  ];
  for (const { display } of LANE_DISPLAY_ORDER) {
    const haystack = `${display.name} ${display.subtitle}`.toLowerCase();
    for (const word of banned) {
      assert.equal(
        haystack.includes(word),
        false,
        `Lane "${display.name}" contains banned copy "${word}"`,
      );
    }
  }
});

test("LANE_DISPLAY_ORDER: includes all four profiles, Anchor first, Swing last", () => {
  assert.equal(LANE_DISPLAY_ORDER.length, 4);
  assert.equal(LANE_DISPLAY_ORDER[0].profile, "conservative");
  assert.equal(LANE_DISPLAY_ORDER[3].profile, "aggressive");
  const names = LANE_DISPLAY_ORDER.map((e) => e.display.name);
  assert.deepEqual(names, ["Anchor", "Core", "Spotlight", "Swing"]);
});

test("getLaneDisplay: unknown profile falls back to Core (balanced)", () => {
  // @ts-expect-error — runtime fallback covers stale data files
  const d = getLaneDisplay("not_a_profile");
  assert.equal(d.name, "Core");
});
