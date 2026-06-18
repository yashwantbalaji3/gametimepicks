import { test } from "node:test";
import assert from "node:assert/strict";
import { canSameStepRelaunch } from "./relaunch-eligibility.ts";

const NOW = Date.parse("2026-06-18T19:31:00Z");
const future = Date.parse("2026-06-18T22:00:00Z"); // Canada-Qatar kickoff
const past = Date.parse("2026-06-18T18:35:00Z");    // Josh Bell first pitch (already started)

test("same-step relaunch allowed only when kept leg + replacement are both pre-event", () => {
  const d = canSameStepRelaunch({ nowMs: NOW, failedLegSettled: true, keptLegStartMs: future, replacementStartMs: future });
  assert.equal(d.allowed, true);
  assert.equal(d.fallback, "same_step_relaunch");
});

test("BLOCKED when the kept partner leg has already started (the June 18 Josh Bell case)", () => {
  const d = canSameStepRelaunch({ nowMs: NOW, failedLegSettled: true, keptLegStartMs: past, replacementStartMs: future });
  assert.equal(d.allowed, false);
  assert.equal(d.fallback, "queued_restart");
  assert.match(d.reason, /kept partner leg has already started/i);
});

test("blocked when no replacement is available, or the replacement already kicked off", () => {
  assert.equal(canSameStepRelaunch({ nowMs: NOW, failedLegSettled: true, keptLegStartMs: future, replacementStartMs: null }).allowed, false);
  assert.equal(canSameStepRelaunch({ nowMs: NOW, failedLegSettled: true, keptLegStartMs: future, replacementStartMs: past }).allowed, false);
});

test("blocked when the failed leg is not officially settled yet", () => {
  assert.equal(canSameStepRelaunch({ nowMs: NOW, failedLegSettled: false, keptLegStartMs: future, replacementStartMs: future }).allowed, false);
});
