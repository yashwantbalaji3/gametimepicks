/**
 * P244 · Release D — the one product-state view derives, names its measures, and types its
 * divergences instead of resolving gated policy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { deriveBankBuilderState } from "./product-state-view.mjs";

const ROOT = path.join(process.cwd(), "public", "data");

test("the view derives from the four record systems with every measure named", () => {
  const s = deriveBankBuilderState(ROOT);
  assert.equal(s.product, "bank-builder");
  assert.ok(Array.isArray(s.lanes), "today's generated lanes are present");
  assert.ok("live" in s.exposure && "settledAuthority" in s.exposure, "both exposure views are named, never merged");
  assert.ok("crownedLadders" in s.cycles && "lifecycleStore" in s.cycles, "cycle measures are named, not averaged");
});

test("LIVE · a step disagreement between the store and the generator is TYPED, never silent", () => {
  const s = deriveBankBuilderState(ROOT);
  const storeLanes = Object.keys(s.cycles.lifecycleStore);
  if (!storeLanes.length || !s.lanes.length) return;
  for (const l of s.lanes) {
    const pos = s.cycles.lifecycleStore[`bank-builder-lane-${l.lane}`];
    if (!pos) continue;
    if (pos.step !== l.step) {
      const d = s.divergences.find((x) => x.kind === "STEP_COUNTER" && x.lane === l.lane);
      assert.ok(d, `lane ${l.lane}: store step ${pos.step} vs generated ${l.step} must surface as a typed divergence`);
      assert.match(d.note, /founder-gated/, "the divergence names the gate that owns its resolution");
    }
  }
});

test("the view never invents a number: absent sources yield nulls, not zeros", () => {
  const s = deriveBankBuilderState("/nonexistent-root");
  assert.equal(s.lanes.length, 0);
  assert.equal(s.exposure.live, null);
  assert.equal(s.exposure.settledAuthority, null);
  assert.equal(s.cycles.crownedLadders, null);
  assert.equal(s.record, null);
});
