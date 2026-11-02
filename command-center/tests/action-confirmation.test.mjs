import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createActionConfirmer, confirmationRequest } from "../auth/action-confirmation.mjs";
import { jobEvents, sleepGap, overdue } from "../scripts/publish-monitor.mjs";
import { reconcile } from "../scripts/reconcile-receipts.mjs";

const post = { decisionId: "d1", package: { contentKey: "abcdef0123456789", title: "T" } };

test("confirmation is bound to the post and version, and only a yes passes", async () => {
  assert.deepEqual([confirmationRequest("hold-release", post).decisionId, confirmationRequest("hold-release", post).contentSha], ["d1", "abcdef0123456789"]);
  assert.match(confirmationRequest("replace-held", post).message, /abcdef012345/);
  assert.equal((await createActionConfirmer({ ask: async () => true })("replace-held", post)).ok, true);
  for (const ask of [async () => false, async () => "yes", async () => { throw new Error("x"); }, undefined]) assert.equal((await createActionConfirmer({ ask })("hold-release", post)).code, "NOT_CONFIRMED");
  assert.equal((await createActionConfirmer({ ask: async () => true })("publish-everything", post)).ok, false);
  assert.equal((await createActionConfirmer({ ask: async () => true })("hold-release", { decisionId: "d1" })).ok, false);
});

test("the console has no opt-out and asks before both actions", () => {
  const s = fs.readFileSync(new URL("../surfaces/console/server.mjs", import.meta.url), "utf8");
  assert.equal(s.includes("GTP_CC_CONFIRM_HOLD"), false);
  assert.ok(s.indexOf('confirmAction("hold-release"') < s.indexOf("p.setHold("));
  assert.ok(s.indexOf('confirmAction("replace-held"') < s.indexOf("orchestrator.replaceHeldVersion("));
});

for (const name of ["hosted step-up needs a verified passkey assertion", "hosted challenge is bound to action, decision, content and founder", "hosted challenge is single use", "hosted challenge expires within 2 minutes", "hosted refuses when the content changed", "hosted records every attempt"]) test.todo(name);

test("monitor: in-flight is no outcome, the real outcome reports once", () => {
  const seen = new Map();
  assert.deepEqual(jobEvents([{ jobId: "a", status: "scheduled", dueAt: "t" }], seen, { first: true }), []);
  assert.deepEqual(jobEvents([{ jobId: "a", status: "unknown", dueAt: "t", results: [{ code: "NO_OUTCOME_RECORDED" }] }], seen), []);
  const r = jobEvents([{ jobId: "a", status: "published", dueAt: "t", results: [{ canonicalUrl: "u" }] }], seen);
  assert.match(r[0], /^INFO PUBLISHED a/);
  assert.deepEqual(jobEvents([{ jobId: "a", status: "published", dueAt: "t", results: [{ canonicalUrl: "u" }] }], seen), []);
  assert.match(jobEvents([{ jobId: "b", status: "missed", dueAt: "t", results: [{ code: "AFTER_START" }] }], seen)[0], /^ALERT MISSED b/);
});
test("monitor: sleep gaps and overdue jobs alert", () => {
  assert.equal(sleepGap(0, 60_000, 60_000), null);
  assert.equal(sleepGap(0, 3_600_000, 60_000), 60);
  assert.equal(overdue([{ jobId: "a", status: "scheduled", dueAt: "2026-01-01T00:00:00Z" }], Date.parse("2026-01-01T00:10:00Z")).length, 1);
  assert.equal(overdue([{ jobId: "a", status: "scheduled", dueAt: "2026-01-01T00:00:00Z" }], Date.parse("2026-01-01T00:01:00Z")).length, 0);
});
test("reconcile: finds gaps and repeated slots", () => {
  const e = (kind, id, post, extra = {}) => ({ kind, at: "2026-11-01T00:00:00Z", data: { providerPostId: id, postId: post, canonicalUrl: `u/${id}`, state: "PUBLISHED", ...extra } });
  const r = reconcile([e("publish-receipt", "1", "a"), e("publish-result", "1", "a"), e("publish-receipt", "2", "b"), e("publish-result", "3", "c"), e("publish-receipt", "4", "a")], ["2026-11"]);
  assert.equal(r.receipts, 3);
  assert.equal(r.resultWithoutReceipt.length, 1);
  assert.equal(r.receiptWithoutResult.length, 2);
  assert.deepEqual(r.sameSlotMoreThanOnce, [["a", 2]]);
});
