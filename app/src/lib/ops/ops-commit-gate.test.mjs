import test from "node:test";
import assert from "node:assert/strict";

import { decideOpsCommit } from "./ops-commit-gate.mjs";

const slo = (o = {}) => JSON.stringify({ date: "2026-10-16", state: "PUBLISHED", platformState: "PUBLISHING", publishDeadlineUtc: "2026-10-16T22:30:00Z", reason: "r", checkedAt: "2026-10-16T20:00:00Z", sports: { nfl: { state: "PUBLISHING", counts: { scheduled: 14 } } }, games: [{ detailedState: "Pre-Game" }], ...o });
const own = (o = {}, owners) => JSON.stringify({ date: "2026-10-16", state: "STALE", checkedAt: "2026-10-16T20:00:00Z", treeHead: "aaa", owners: owners ?? [{ id: "mlb-board", state: "HEALTHY", reason: "receipt is 12.1h old", receiptAt: "2026-10-16T09:00:00Z" }], ...o });
const hb = (o = {}) => JSON.stringify({ lastRunAt: "2026-10-16T20:00:00Z", ok: false, status: "fail", phase: "daily-owner-slo", date: "2026-10-16", message: "m", ...o });
const head = { publicationSlo: slo(), dailyOwnerSlo: own(), heartbeat: hb() };

test("clock-only run (checkedAt, treeHead, lastRunAt +40 min, age strings, receiptAt, games detail) is SKIPPED", () => {
  const next = {
    publicationSlo: slo({ checkedAt: "2026-10-16T20:40:00Z", games: [{ detailedState: "Warmup" }] }),
    dailyOwnerSlo: own({ checkedAt: "2026-10-16T20:40:00Z", treeHead: "bbb" }, [{ id: "mlb-board", state: "HEALTHY", reason: "receipt is 12.8h old", receiptAt: "2026-10-16T20:11:00Z" }]),
    heartbeat: hb({ lastRunAt: "2026-10-16T20:40:00Z" }),
  };
  assert.equal(decideOpsCommit({ head, next }).decision, "SKIP");
});

for (const [name, next] of [
  ["a public publication-slo field (state)", { ...head, publicationSlo: slo({ state: "INCIDENT" }) }],
  ["the public reason sentence", { ...head, publicationSlo: slo({ reason: "late" }) }],
  ["a per-sport verdict", { ...head, publicationSlo: slo({ sports: { nfl: { state: "PUBLISHED" } } }) }],
  ["the SLO date (day rollover)", { ...head, publicationSlo: slo({ date: "2026-10-17" }) }],
  ["an owner state", { ...head, dailyOwnerSlo: own({}, [{ id: "mlb-board", state: "STALE" }]) }],
  ["a new owner", { ...head, dailyOwnerSlo: own({}, [{ id: "mlb-board", state: "HEALTHY" }, { id: "nfl-markets", state: "NOT_DUE" }]) }],
  ["the heartbeat verdict", { ...head, heartbeat: hb({ ok: true, status: "pass" }) }],
  ["the heartbeat message", { ...head, heartbeat: hb({ message: "settlement:INCIDENT" }) }],
]) {
  test(`a change to ${name} is COMMITTED`, () => assert.equal(decideOpsCommit({ head, next }).decision, "COMMIT"));
}

test("heartbeat floor: main's heartbeat 6 h behind this run's is COMMITTED even when nothing else moved", () => {
  const next = { ...head, heartbeat: hb({ lastRunAt: "2026-10-17T02:00:00Z" }) };
  const r = decideOpsCommit({ head, next });
  assert.equal(r.decision, "COMMIT");
  assert.match(r.reasons.join(" "), /heartbeat floor/);
  assert.equal(decideOpsCommit({ head, next: { ...head, heartbeat: hb({ lastRunAt: "2026-10-17T01:59:00Z" }) } }).decision, "SKIP");
});

test("fails open: unparseable, added or removed files, an unexpected owners shape, or any non-ops path → COMMIT", () => {
  assert.equal(decideOpsCommit({ head, next: { ...head, heartbeat: "{not json" } }).decision, "COMMIT");
  assert.equal(decideOpsCommit({ head, next: { ...head, heartbeat: null } }).decision, "COMMIT");
  assert.equal(decideOpsCommit({ head: { ...head, dailyOwnerSlo: null }, next: head }).decision, "COMMIT");
  assert.equal(decideOpsCommit({ head, next: { ...head, dailyOwnerSlo: own({ owners: { x: 1 } }, {}) } }).decision, "COMMIT");
  assert.equal(decideOpsCommit({ head, next: head, otherChangedPaths: ["app/public/data/nba/x.json"] }).decision, "COMMIT");
  assert.equal(decideOpsCommit({ head, next: { ...head, heartbeat: hb({ lastRunAt: "garbage" }) } }).decision, "COMMIT");
});

test("nothing changed → SKIP (the workflow already exits before committing in that case)", () => {
  assert.equal(decideOpsCommit({ head, next: head }).decision, "SKIP");
});
