/**
 * Zero network, proven: install the guard, then run the whole recap command, render included, plus an approval
 * and a mock publish. Any fetch / http(s) / socket / DNS attempt would throw and be recorded.
 */
import { NETWORK_ATTEMPTS } from "./no-network-preload.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { freshOrchestrator, FOUNDER, RECAP_COMMAND } from "./helpers.mjs";

test("full Track A + Track B flow makes no network call", async () => {
  await assert.rejects(fetch("https://example.com"), /NETWORK BLOCKED/);
  NETWORK_ATTEMPTS.length = 0;

  const { orchestrator } = freshOrchestrator();
  await orchestrator.handleCommand(RECAP_COMMAND, FOUNDER);
  const d = orchestrator.state().decisions[0];
  const r = await orchestrator.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER);
  assert.equal(r.ok, true);
  assert.equal(r.receipt.state, "PUBLISHED_MOCK");
  assert.deepEqual(NETWORK_ATTEMPTS, []);
});
