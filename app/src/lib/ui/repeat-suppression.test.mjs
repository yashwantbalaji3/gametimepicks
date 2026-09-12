import { test } from "node:test";
import assert from "node:assert/strict";

import { firstOfRun, sharedValue } from "./repeat-suppression.ts";

test("firstOfRun marks the head of every run, so a run is never introduced silently", () => {
  assert.deepEqual(firstOfRun(["a", "a", "b", "a"]), [true, false, true, true]);
  assert.deepEqual(firstOfRun(["a"]), [true]);
  assert.deepEqual(firstOfRun([]), []);
  assert.deepEqual(firstOfRun(["a", "a", "a"]), [true, false, false]);
});

test("every distinct value prints at least once — suppression never loses a sentence", () => {
  const vals = ["x", "x", "y", "z", "z", "y"];
  const show = firstOfRun(vals);
  const printed = new Set(vals.filter((_, i) => show[i]));
  assert.deepEqual([...printed].sort(), ["x", "y", "z"], "a value the reader never sees is a dropped fact");
});

test("sharedValue answers only when every row genuinely agrees", () => {
  assert.equal(sharedValue(["a", "a", "a"]), "a");
  assert.equal(sharedValue(["a", "b", "a"]), null);
  assert.equal(sharedValue(["a"]), null, "one row plus a header line is the same repetition");
  assert.equal(sharedValue([]), null);
});

test("the two helpers do not both claim the same sentence", () => {
  // When sharedValue answers, the caller uses the header and suppresses every row; when it does
  // not, firstOfRun governs. The invariant that matters: a uniform list has exactly one place to
  // print, never two.
  const vals = ["same", "same", "same"];
  const header = sharedValue(vals);
  assert.ok(header !== null);
  const rowsThatWouldPrint = firstOfRun(vals).filter(Boolean).length;
  assert.equal(rowsThatWouldPrint, 1, "and if the header is used instead, that one row must be suppressed too");
});
