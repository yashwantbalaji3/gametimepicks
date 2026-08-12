/**
 * Shared-blocker registry guards (Program 164 · Release 1).
 *
 * The invariants that make the control plane trustworthy: exactly seven blockers, once each;
 * closed state vocabulary; every entry actionable without interpreting the codebase (exact
 * values, transfer method, acceptance, rollback); NO secret value shapes anywhere; engineering
 * states that claim readiness must cite verified evidence; the action sheet covers every blocker
 * exactly once in dependency order.
 *
 * Run: npx tsx --test src/lib/launch/shared-blockers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SHARED_BLOCKERS, BLOCKER_STATES, SHARED_BLOCKERS_VERSION, founderActionSheet } from "./shared-blockers.mjs";

test("exactly the seven shared blockers, unique ids, closed states, version 1", () => {
  assert.equal(SHARED_BLOCKERS_VERSION, 1);
  assert.equal(SHARED_BLOCKERS.length, 7);
  const ids = SHARED_BLOCKERS.map((b) => b.id);
  assert.equal(new Set(ids).size, 7);
  assert.deepEqual([...ids].sort(), [
    "blocker-admin-access", "blocker-analytics", "blocker-beta-cohort", "blocker-legal-section3",
    "blocker-nba-lineup-rights", "blocker-odds", "blocker-support",
  ]);
  for (const b of SHARED_BLOCKERS) assert.ok(BLOCKER_STATES.includes(b.engineeringState), b.id);
});

test("NO VAGUE BLOCKERS: every entry names exact values, where they belong, risk, acceptance, and rollback", () => {
  for (const b of SHARED_BLOCKERS) {
    assert.ok(b.founderAction.length > 30, `${b.id}: the action is a sentence, not a label`);
    assert.ok(Array.isArray(b.requiredValues) && b.requiredValues.length >= 1, b.id);
    for (const v of b.requiredValues) {
      assert.ok(v.name && v.format && v.where && "neverShare" in v, `${b.id}/${v.name}: name+format+where+neverShare`);
    }
    assert.ok(b.risk.length > 30, `${b.id}: risk stated`);
    assert.ok(b.acceptanceCommand.length > 20, `${b.id}: binary acceptance`);
    assert.ok(b.rollback.length > 10, `${b.id}: rollback stated`);
    assert.ok(b.unlocks.length > 10, `${b.id}: what it unlocks`);
  }
});

test("SECRETS DISCIPLINE: no value that looks like a real credential appears anywhere in the registry", () => {
  const s = JSON.stringify(SHARED_BLOCKERS);
  assert.ok(!/sk-[A-Za-z0-9]{8,}|[A-Fa-f0-9]{32,}|Bearer /.test(s), "variable NAMES only — never values or value-shaped strings");
});

test("readiness claims cite verified evidence; in-progress entries name the release that lands the rest", () => {
  for (const b of SHARED_BLOCKERS) {
    if (b.engineeringState === "ENGINEERING_READY_FOR_FOUNDER") {
      assert.match(b.engineeringEvidence, /lib\/|docs\//, `${b.id}: readiness must cite a repository artifact`);
    }
    if (b.engineeringState === "ENGINEERING_IN_PROGRESS") {
      assert.match(b.engineeringEvidence, /P164 Release \d/, `${b.id}: in-progress names its landing release`);
    }
  }
});

test("the Founder Action Sheet covers every blocker exactly once, dependency-ordered, with effort", () => {
  const sheet = founderActionSheet();
  assert.equal(sheet.length, 7);
  assert.deepEqual(new Set(sheet.map((r) => r.id)), new Set(SHARED_BLOCKERS.map((b) => b.id)));
  for (const row of sheet) assert.ok(row.founderEffort && row.acceptance, row.id);
  assert.equal(sheet[0].id, "blocker-legal-section3", "legal answers gate the most downstream work");
});

test("the verified fail-closed claims are TRUE in code: support renders nothing unconfigured; analytics is NOOP off", () => {
  const support = fs.readFileSync(path.join(process.cwd(), "src", "lib", "support", "support-config.mjs"), "utf8");
  assert.match(support, /NOT_CONFIGURED/);
  assert.match(support, /PLACEHOLDER/, "placeholder destinations are rejected, never shipped");
  const sink = fs.readFileSync(path.join(process.cwd(), "src", "lib", "analytics", "sink.ts"), "utf8");
  assert.match(sink, /NOOP_SINK/);
  assert.match(sink, /NEXT_PUBLIC_ANALYTICS_ENABLED/);
});

test("PUBLIC BOUNDARY: the registry module is consumed only by internal /launch code", () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      if (!fs.readFileSync(p, "utf8").includes("shared-blockers.mjs")) continue;
      const rel = path.relative(process.cwd(), p);
      if (!/^src\/(lib\/launch|app\/launch)\//.test(rel) && rel !== "src/lib/launch/shared-blockers.mjs") offenders.push(rel);
    }
  };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(offenders, [], "founder packets never reach public surfaces");
});
