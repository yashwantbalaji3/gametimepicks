/**
 * Homepage suggested-parlays preview guards (Program 200 · Release B).
 *
 * The preview is a RENDERING of the risk-coverage matrix, never a second evaluation: the lib may
 * only reshape the committed artifact, a no-play renders as visibly as a card, a lane whose
 * evaluation refused every tier never masquerades as "evaluated, nothing qualified", and the
 * homepage journey carries all three front-door actions.
 *
 * Run: npx tsx --test src/lib/home/suggested-parlays.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";
import { loadSuggestedParlaysPreview, TIER_INTENT, LANE_LABEL } from "./suggested-parlays.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const component = read("src/components/home/suggested-parlays-preview.tsx");
const page = read("src/app/page.tsx");
const hero = read("src/components/home/landing-hero.tsx");

test("lib reshapes the committed v2 matrix: canonical tier order, live/closed split, no invention", () => {
  const preview = loadSuggestedParlaysPreview(path.join(app, "public", "data"));
  assert.ok(preview, "the committed matrix loads");
  const matrix = JSON.parse(read("public/data/parlays/coverage-matrix.json"));
  assert.equal(preview.live.length + preview.closed.length, matrix.rows.length, "every lane accounted for, none invented");
  for (const lane of preview.live) {
    assert.deepEqual(lane.tiers.map((t) => t.tier), [...RISK_ORDER], `${lane.lane}: four tiers in canonical order`);
    for (const t of lane.tiers) {
      if (t.state === "PUBLISHED") continue;
      assert.equal(t.slipId, null, `${lane.lane}.${t.tier}: only a published cell names a card`);
    }
  }
  for (const c of preview.closed) assert.ok(c.reason && c.reason.length > 0, `${c.lane}: closure carries a reason`);
});

test("a lane whose evaluation refused every tier folds into the closed list — never rendered as no-play", () => {
  const src = read("src/lib/home/suggested-parlays.mjs");
  assert.match(src, /every\(\(c\) => c\.state === "LANE_CLOSED"\)/, "the all-refused lane check exists");
  const preview = loadSuggestedParlaysPreview(path.join(app, "public", "data"));
  for (const lane of preview.live) {
    assert.ok(
      lane.tiers.some((t) => t.state === "PUBLISHED" || t.state === "NO_PLAY"),
      `${lane.lane}: a live lane has at least one genuinely evaluated tier`,
    );
  }
});

test("lib fails closed on a missing or relic (pre-v2) artifact", () => {
  assert.equal(loadSuggestedParlaysPreview("/nonexistent-root"), null, "missing artifact → null, never a fabricated grid");
  assert.match(read("src/lib/home/suggested-parlays.mjs"), /schemaVersion !== 2/, "relic schema refused");
});

test("component renders refusals honestly: no-play and unavailable are distinct states, never hidden", () => {
  assert.match(component, /no play/, "no-play chips render in words");
  assert.match(component, /unavailable/, "a refused/missing cell renders as unavailable, not as no-play");
  assert.match(component, /closed/, "closed lanes render with their reason");
  assert.match(component, /href="\/build"/, "routes to the canonical suggested-cards destination");
  assert.ok(!/\block\b|\bsafe\b|\bedge\b|guaranteed|profit/i.test(component), "no banned copy");
});

test("homepage renders the preview from the lib and the hero carries all three journey actions", () => {
  assert.match(page, /loadSuggestedParlaysPreview\(/, "page derives via the lib owner");
  assert.match(page, /<SuggestedParlaysPreview\b/, "page renders the preview");
  assert.match(hero, /View Suggested Parlays/, "hero has the parlays action");
  assert.match(hero, /href="\/build"/, "parlays action routes to /build");
});

test("tier intent language exists for exactly the four canonical tiers", () => {
  assert.deepEqual(Object.keys(TIER_INTENT).sort(), [...RISK_ORDER].sort());
  assert.deepEqual(Object.keys(LANE_LABEL), ["mlb", "epl", "ufc", "nfl", "multi"]);
});
