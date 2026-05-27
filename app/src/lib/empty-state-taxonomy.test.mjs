/**
 * Tests for the empty-state taxonomy. Locks the 6 documented variants
 * + the banned-copy contract.
 *
 * Run: npx tsx --test app/src/lib/empty-state-taxonomy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BANNED_COPY_PATTERNS,
  EMPTY_STATE_COPY,
  getEmptyStateCopy,
} from "./empty-state-taxonomy.ts";

const ALL_VARIANTS = [
  "no-games",
  "no-props",
  "no-safe-slips",
  "settlement-pending",
  "replay-only",
  "custom-only",
];

test("every documented variant has a catalog entry", () => {
  for (const v of ALL_VARIANTS) {
    const entry = EMPTY_STATE_COPY[v];
    assert.ok(entry, `variant ${v} missing from catalog`);
    assert.equal(entry.variant, v);
    assert.ok(entry.eyebrow.length > 0);
    assert.ok(entry.body.length > 0);
    assert.ok(["neutral", "info", "warn"].includes(entry.tone));
  }
});

test("getEmptyStateCopy returns the right variant", () => {
  for (const v of ALL_VARIANTS) {
    const copy = getEmptyStateCopy(v);
    assert.equal(copy.variant, v);
  }
});

test("no banned copy appears in any catalog string", () => {
  for (const [variant, copy] of Object.entries(EMPTY_STATE_COPY)) {
    const blob = `${copy.eyebrow} ${copy.body}`;
    for (const pattern of BANNED_COPY_PATTERNS) {
      assert.ok(
        !pattern.test(blob),
        `variant ${variant} contains banned pattern ${pattern}: "${blob}"`,
      );
    }
  }
});

test("replay-only variant explicitly flags non-official status", () => {
  const replay = EMPTY_STATE_COPY["replay-only"];
  // The eyebrow OR the body must contain "not official" so the
  // integrity boundary is impossible to miss.
  const blob = `${replay.eyebrow} ${replay.body}`.toLowerCase();
  assert.ok(
    blob.includes("not official"),
    "replay variant must label itself 'not official'",
  );
  assert.equal(replay.tone, "warn");
});

test("custom-only variant explicitly flags non-tracked status", () => {
  const custom = EMPTY_STATE_COPY["custom-only"];
  const blob = `${custom.eyebrow} ${custom.body}`.toLowerCase();
  assert.ok(
    blob.includes("not officially tracked") ||
      blob.includes("not included in the official"),
    "custom variant must label itself non-tracked",
  );
});

test("no-games copy is sport-neutral (caller supplies sport)", () => {
  const noGames = EMPTY_STATE_COPY["no-games"];
  assert.ok(
    !/\bnba\b/i.test(noGames.body),
    "no-games body must not hard-code NBA",
  );
  assert.ok(
    !/\bmlb\b/i.test(noGames.body),
    "no-games body must not hard-code MLB",
  );
});

test("settlement-pending variant explicitly mentions settlement runs", () => {
  const pending = EMPTY_STATE_COPY["settlement-pending"];
  assert.ok(
    /settl/i.test(pending.body),
    "settlement-pending body must mention settlement",
  );
});

test("getEmptyStateCopy throws on unknown variant", () => {
  assert.throws(() => getEmptyStateCopy("bogus-variant"), /Unknown empty-state variant/);
});
