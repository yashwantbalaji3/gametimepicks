/**
 * UFC WITHDRAWN / CANCELLED / DRAW HANDLING (founder decision 2026-10-13).
 * Confirmed withdrawn or cancelled bouts never appear as active predictions or product legs; a draw/no-contest is VOID
 * (recorded once, never a loss); immutable snapshots are never rewritten.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { reconcileCard, WITHDRAWN_AFTER_MS } from "./reconcile-card.mjs";

const D = "2026-09-26", START = `${D}T21:00Z`, AFTER = Date.parse(START) + WITHDRAWN_AFTER_MS + 1;
const ids = (...x) => new Set(x.map((n) => `${D}:${n}`));
const results = (...x) => new Map(x.map((n) => [`${D}:${n}`, { winner: "x" }]));
const base = { slateDate: D, startUtc: START, ledgerById: new Map(), nowMs: AFTER };

test("the Gall–Dumas shape: replaced before the card, no result, card graded, >24h later → WITHDRAWN (not pending, not void)", () => {
  const r = reconcileCard({ ...base, boutIds: ids("gall|dumas", "hernandez|dumas"), finalPreStart: ids("hernandez|dumas"),
    ledgerById: new Map([[`${D}:hernandez|dumas`, { void: false }]]), resultsByBout: results("hernandez|dumas") });
  assert.deepEqual([r.graded, r.void, r.pending, r.withdrawn], [1, 0, 0, 1]);
  assert.deepEqual(r.withdrawnBoutIds, [`${D}:gall|dumas`]);
  assert.equal(r.reconciles, true);
});

test("absence alone is not withdrawal: no card results yet, inside 24h, or still in the final snapshot → PENDING", () => {
  const common = { ...base, boutIds: ids("a|b"), finalPreStart: ids("c|d") };
  assert.equal(reconcileCard({ ...common, resultsByBout: new Map() }).pending, 1, "no official results for the card yet");
  assert.equal(reconcileCard({ ...common, resultsByBout: results("c|d"), nowMs: Date.parse(START) + 3_600_000 }).pending, 1, "within 24h of the start");
  assert.equal(reconcileCard({ ...common, finalPreStart: ids("a|b"), resultsByBout: results("c|d") }).pending, 1, "present in the final pre-start snapshot");
  assert.equal(reconcileCard({ ...common, finalPreStart: null, resultsByBout: results("c|d") }).pending, 1, "no pre-start snapshot known");
});

test("a recorded void (draw / no contest) counts as VOID, never pending or a loss", () => {
  const r = reconcileCard({ ...base, boutIds: ids("k|g"), finalPreStart: ids("k|g"), ledgerById: new Map([[`${D}:k|g`, { void: true }]]), resultsByBout: results("k|g") });
  assert.deepEqual([r.graded, r.void, r.pending, r.withdrawn], [0, 1, 0, 0]);
});

test("the grader persists voids exactly once and routes reconciliation through the pure rule", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/grade-ufc-model-vs-market.mjs"), "utf8");
  assert.match(src, /out\.voided\.map\(\(\{ reason, \.\.\.v \}\) => JSON\.stringify\(\{ \.\.\.v, void: true, voidReason: reason, winner: null, hit: null, gradedAt: NOW \}\)\)/);
  assert.ok(src.indexOf("out.voided.map(") < src.indexOf("if (out.n === 0)"), "voids are written before the nothing-new early exit");
  assert.match(src, /reconcileCard\(\{ slateDate/);
  assert.match(src, /JSON\.stringify\(existing\.reconciliation\) === JSON\.stringify\(freshReconciliation\)/, "a stale reconciliation is refreshed");
  assert.doesNotMatch(src, /writeFileSync\([^)]*snapshot-/, "snapshots are never rewritten");
});

test("the card never publishes a bout the provider marks cancelled or postponed as an active prediction", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/build-ufc-card.mjs"), "utf8");
  const loop = src.slice(src.indexOf("const excludedBouts = [];"), src.indexOf("const excludedBouts = [];") + 900);
  assert.match(loop, /c\.status\?\.type\?\.name/);
  assert.match(loop, /\/CANCEL\|POSTPON\/i\.test\(boutStatus\)/);
  assert.match(loop, /excludedBouts\.push\([\s\S]*?\);\s*continue;/, "excluded, recorded, and skipped");
  assert.match(src, /\n  excludedBouts,\n/, "the exclusion is stated in the artifact");
});
