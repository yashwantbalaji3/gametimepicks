/**
 * The /build lobby's cards are TODAY's cards. A fallback to an earlier optimizer date is not today's,
 * whatever date the lobby would stamp on it (2026-09-28: eighteen of 22 September's cards shown as "built today").
 * Data-independent: a far-future date always forces the owner's fallback path.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getSuggestedParlaysForDate } from "../data-parlays.ts";
import { loadSuggestedCards } from "./suggested-cards.ts";

test("a date with no optimizer file of its own gets no optimizer cards — never another day's, restamped", () => {
  const FUTURE = "2099-01-01";
  const fb = getSuggestedParlaysForDate(FUTURE);
  /* Anti-vacuity: the owner really does fall back here (any committed snapshot suffices). */
  assert.ok(fb === null || fb.isFallback === true, "a far-future date can only be answered by a fallback");
  const cards = loadSuggestedCards(FUTURE);
  /* Optimizer slip ids embed their own slate date (e.g. `slip_2026-09-22_conservative_…`). */
  const foreign = cards.filter((c) => { const d = /(\d{4}-\d{2}-\d{2})/.exec(String(c.id))?.[1]; return d && d !== FUTURE; });
  assert.deepEqual(foreign.map((c) => c.id), [], "no optimizer card from another date may appear in today's lobby");
  if (fb) assert.ok(fb.slips.length > 0, "the fallback that is being refused really exists");
});
