import test from "node:test";
import assert from "node:assert/strict";
import { chainCancelWatch, etDateOf, MORNING_CHAIN } from "./chain-cancel-watch.mjs";

const D = "2026-09-11";
const ok = (createdAt) => ({ createdAt, conclusion: "success", status: "completed" });
const cx = (createdAt) => ({ createdAt, conclusion: "cancelled", status: "completed" });
const all = (runs) => Object.fromEntries(MORNING_CHAIN.map((w) => [w, runs]));

test("ET day boundary: 03:30Z belongs to the previous ET day", () => {
  assert.equal(etDateOf("2026-09-11T03:30:00Z"), "2026-09-10");
  assert.equal(etDateOf("2026-09-11T04:30:00Z"), "2026-09-11");
});

test("a quiet day is OK", () => {
  assert.equal(chainCancelWatch({ etDate: D, runsByWorkflow: all([ok("2026-09-11T11:00:00Z")]) }).state, "OK");
});

test("a cancelled run superseded by a later success is OK", () => {
  const r = chainCancelWatch({ etDate: D, runsByWorkflow: all([cx("2026-09-11T11:00:00Z"), ok("2026-09-11T11:40:00Z")]) });
  assert.equal(r.state, "OK");
});

test("a success BEFORE the cancel does not cover it — the later work never landed", () => {
  const runs = { ...all([ok("2026-09-11T10:00:00Z")]), "daily-products": [ok("2026-09-11T10:00:00Z"), cx("2026-09-11T12:00:00Z")] };
  const r = chainCancelWatch({ etDate: D, runsByWorkflow: runs });
  assert.equal(r.state, "STRANDED");
  assert.deepEqual(r.stranded.map((s) => s.workflow), ["daily-products"]);
});

test("a queued or running successor is not stranded yet", () => {
  const r = chainCancelWatch({ etDate: D, runsByWorkflow: all([cx("2026-09-11T11:00:00Z"), { createdAt: "2026-09-11T11:05:00Z", conclusion: null, status: "queued" }]) });
  assert.equal(r.state, "OK");
});

test("yesterday's cancel is ignored", () => {
  assert.equal(chainCancelWatch({ etDate: D, runsByWorkflow: all([cx("2026-09-10T15:00:00Z")]) }).state, "OK");
});

test("unavailable history is UNKNOWN, never OK", () => {
  const r = chainCancelWatch({ etDate: D, runsByWorkflow: { ...all([]), "mlb-daily-production": null } });
  assert.equal(r.state, "UNKNOWN");
  assert.deepEqual(r.unknown, ["mlb-daily-production"]);
});
