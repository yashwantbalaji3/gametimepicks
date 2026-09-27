import { test } from "node:test";
import assert from "node:assert/strict";

import { qbShadowForPool, qbShadowFold, pickNewestCapture, SKIP, QB_POOL } from "./qb-starter-shadow.mjs";
import { indexDepthCharts } from "./depth-chart.mjs";

const CHART = (timestamp, qbs) => ({ snapshots: [{ timestamp, team: "BAL", quarterbacks: qbs }] });
const QBS = [{ playerId: "1", name: "Starter", rank: 1 }, { playerId: "2", name: "Backup", rank: 2 }];
const ASOF = "2026-09-27T17:00:00Z";
const FRESH = "2026-09-26T17:00:00Z"; // 1 day
const DAY = 86400000;

const row = (players) => ({
  team: "BAL", pool: QB_POOL, joined: players.length, sum: Number(players.reduce((a, p) => a + p.share, 0).toFixed(4)), players,
});
const P = (id, name, share) => ({ playerId: `nfl-athlete-${id}`, name, share });
const ids = (...xs) => new Set(xs);

test("the rule removes every QB but the depth chart's QB1, and reports the sum it leaves", () => {
  const r = qbShadowForPool({
    row: row([P("1", "Starter", 0.968), P("2", "Backup", 0.614)]),
    index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds: ids("1", "2"),
  });
  assert.equal(r.applied, true);
  assert.equal(r.before, 1.582);
  assert.equal(r.after, 0.968, "the survivor's own share, untouched");
  assert.deepEqual(r.removed.map((x) => x.name), ["Backup"]);
});

test("the survivor is NOT rescaled to 1.0 — renormalisation is a model-promotion gate (§20)", () => {
  /* The pool where removal leaves a sum well under 1 is the case that proves it: a renormalising
     implementation would report 1.0 here and hide that the starter's own share is low. */
  const r = qbShadowForPool({
    row: row([P("1", "Starter", 0.597), P("2", "Backup", 0.696)]),
    index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds: ids("1", "2"),
  });
  assert.equal(r.after, 0.597, "reported as it falls");
  assert.notEqual(r.after, 1, "not rescaled");
  assert.equal(r.stillOverAllocated, false);
});

test("a sum still above 1 after removal is reported as still over, not quietly clamped", () => {
  const r = qbShadowForPool({
    row: row([P("1", "Starter", 1.4), P("2", "Backup", 0.3)]),
    index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds: ids("1", "2"),
  });
  assert.equal(r.after, 1.4);
  assert.equal(r.stillOverAllocated, true, "a rule that cannot fix a pool must say so");
});

test("a STALE chart leaves the pool exactly as published — fail-closed, not an arbitrary starter", () => {
  const r = qbShadowForPool({
    row: row([P("1", "Starter", 0.9), P("2", "Backup", 0.9)]),
    index: indexDepthCharts(CHART("2026-09-08T17:00:00Z", QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds: ids("1", "2"),
  });
  assert.equal(r.applied, false);
  assert.equal(r.skip, SKIP.NO_CHART);
  assert.equal(r.detail, "STALE", "which unreadable state it was survives in `detail`");
  assert.equal(r.after, r.before, "an unreadable role must not change a single published number");
  assert.deepEqual(r.removed, []);
});

test("ABSENT and NOT_IN_POOL are distinguished, because they have different remedies", () => {
  const args = { index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY };
  /* MIN's real shape: the starter is on the board, just not in this pool. */
  const notInPool = qbShadowForPool({ ...args, row: row([P("2", "Backup", 0.9), P("3", "Third", 0.9)]), boardPlayerIds: ids("1", "2", "3") });
  assert.equal(notInPool.skip, SKIP.STARTER_NOT_IN_POOL);
  assert.equal(notInPool.starterOnBoard, true);
  /* WSH's real shape: the starter is nowhere on the board. */
  const absent = qbShadowForPool({ ...args, row: row([P("2", "Backup", 0.9), P("3", "Third", 0.9)]), boardPlayerIds: ids("2", "3") });
  assert.equal(absent.skip, SKIP.STARTER_ABSENT_FROM_BOARD);
  assert.equal(absent.starterOnBoard, false);
  assert.notEqual(notInPool.skip, absent.skip, "one label for both would hide the projection-builder bug");
  /* No aliased second copy of the category: the probe that merged the labels once passed because a
     duplicate field still held the right value. */
  assert.equal(notInPool.reason, undefined, "exactly one field carries the skip category");
});

test("neither skip empties the pool — that would delete every row a reader can see", () => {
  for (const boardPlayerIds of [ids("1", "2"), ids("2")]) {
    const r = qbShadowForPool({
      row: row([P("2", "Backup", 0.9)]), index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds,
    });
    assert.equal(r.applied, false);
    assert.equal(r.after, 0.9);
  }
});

test("boardPlayerIds is required — omitting it collapses the two skip reasons", () => {
  assert.throws(() => qbShadowForPool({
    row: row([P("2", "Backup", 0.9)]), index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY,
  }), /boardPlayerIds/);
});

test("the board's nfl-athlete- prefix is stripped before comparing to the chart's bare ESPN id", () => {
  /* Without the strip every pool on every slate reports the starter missing — which is exactly how
     this module first produced 26 false STARTER_NOT_ON_BOARD skips. */
  const r = qbShadowForPool({
    row: row([P("1", "Starter", 0.9)]), index: indexDepthCharts(CHART(FRESH, QBS)), asOf: ASOF, maxAgeMs: 3 * DAY, boardPlayerIds: ids("1"),
  });
  assert.equal(r.applied, true, "prefixed board id must join the bare chart id");
});

test("pickNewestCapture orders by acquiredAt, NOT by the content-addressed filename", () => {
  /* The regression this exists for: `2026-a2bc…` (older) sorts after `2026-10d6…` (newer). */
  const docs = [
    { file: "2026-10d60d0710fe29ec.json", doc: { acquiredAt: "2026-09-26T21:36:49Z" } },
    { file: "2026-a2bcbdd515d45fc2.json", doc: { acquiredAt: "2026-09-09T02:33:58Z" } },
  ];
  assert.equal(pickNewestCapture(docs).file, "2026-10d60d0710fe29ec.json");
  assert.equal(pickNewestCapture([...docs].reverse()).file, "2026-10d60d0710fe29ec.json", "order of input must not matter");
  const lexical = docs.map((d) => d.file).sort().pop();
  assert.notEqual(pickNewestCapture(docs).file, lexical, "a lexical sort picks the WRONG capture here — that is the whole point");
});

test("a capture with no acquiredAt is refused, not ranked last — a missing order is not an old order", () => {
  assert.equal(pickNewestCapture([{ file: "x.json", doc: {} }]), null);
  assert.equal(pickNewestCapture([]), null);
  assert.equal(
    pickNewestCapture([{ file: "undated.json", doc: {} }, { file: "dated.json", doc: { acquiredAt: "2026-01-01T00:00:00Z" } }]).file,
    "dated.json",
  );
});

test("the fold counts pools the rule could not fix separately from pools it fixed", () => {
  const fold = qbShadowFold([
    { applied: true, before: 2.4, after: 0.98, stillOverAllocated: false, removed: [1, 2] },
    { applied: true, before: 1.7, after: 1.2, stillOverAllocated: true, removed: [1] },
    { applied: true, before: 0.99, after: 0.99, stillOverAllocated: false, removed: [] },
    { applied: false, before: 2.27, skip: SKIP.STARTER_NOT_IN_POOL, removed: [] },
  ]);
  assert.equal(fold.pools, 4);
  assert.equal(fold.applied, 3);
  assert.equal(fold.overBefore, 3);
  assert.equal(fold.fixed, 1);
  assert.equal(fold.stillOver, 1);
  assert.equal(fold.overAfter, 2, "a skipped over-allocated pool is STILL over — a skip is not a fix");
  assert.equal(fold.removedRows, 3);
  assert.deepEqual(fold.bySkipReason, { [SKIP.STARTER_NOT_IN_POOL]: 1 });
});

test("this module has no writer — a shadow measurement cannot publish (§2.5)", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("./qb-starter-shadow.mjs", import.meta.url), "utf8"));
  for (const forbidden of [/writeFileSync/, /\bfetch\(/, /appendFile/, /execSync/]) {
    assert.doesNotMatch(src, forbidden, `a shadow module must not contain ${forbidden}`);
  }
});
