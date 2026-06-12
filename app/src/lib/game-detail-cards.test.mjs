/**
 * Tests for the fixture-page suggested-cards filter (`cardBelongsToFixture` in
 * game-detail.ts). Locks the June-12 UX fix: a fixture detail page shows ONLY
 * cards whose EVERY leg belongs to that fixture — a cross-game card (e.g. the
 * Canada-vs-Bosnia page showing an Over 2.5 leg from United States vs Paraguay)
 * never leaks in. Cross-game cards stay on /picks where the context is explicit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardBelongsToFixture } from "./game-detail.ts";

const FIXTURE = "Canada vs Bosnia and Herzegovina";
const OTHER = "United States vs Paraguay";

test("card with every leg from the fixture is shown", () => {
  assert.equal(
    cardBelongsToFixture({ legs: [{ sublabel: FIXTURE }, { sublabel: FIXTURE }] }, FIXTURE),
    true,
  );
});

test("cross-game card (any leg from another match) is excluded", () => {
  assert.equal(
    cardBelongsToFixture({ legs: [{ sublabel: FIXTURE }, { sublabel: OTHER }] }, FIXTURE),
    false,
  );
  // The exact screenshot bug: a card whose only legs are from the OTHER match
  // must never appear on this fixture.
  assert.equal(cardBelongsToFixture({ legs: [{ sublabel: OTHER }] }, FIXTURE), false);
});

test("empty/malformed cards never match", () => {
  assert.equal(cardBelongsToFixture({ legs: [] }, FIXTURE), false);
  assert.equal(cardBelongsToFixture({ legs: [{ sublabel: undefined }] }, FIXTURE), false);
  assert.equal(cardBelongsToFixture({ legs: [{ sublabel: FIXTURE }] }, undefined), false);
});
