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
      /*
       * P251: mutation probes create TRANSIENT sibling copies (gitignored) that live for the
       * seconds a probe runs, and the suite runs files concurrently. A walker that reads every
       * entry it just listed can therefore open a file that has already been deleted, and this
       * test failed with ENOENT on a file it has no interest in. The colour scanner already skips
       * this class by name; the read is also made non-fatal, because the race is real either way.
       */
      if (e.name.includes(".mutation-probe.")) continue;
      let body;
      try { body = fs.readFileSync(p, "utf8"); } catch { continue; }
      if (!body.includes("shared-blockers.mjs")) continue;
      const rel = path.relative(process.cwd(), p);
      if (!/^src\/(lib\/launch|app\/launch)\//.test(rel) && rel !== "src/lib/launch/shared-blockers.mjs") offenders.push(rel);
    }
  };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(offenders, [], "founder packets never reach public surfaces");
});

/*
 * A RECORD MAY NOT CONTRADICT ITS OWN EVIDENCE (P290).
 *
 * `blocker-odds` carried engineeringState FOUNDER_ACTION_PROVIDED while its own engineeringEvidence
 * ended "CLOSED on the canary receipt and the first authorized NFL capture", and its founderAction
 * still asked the founder to "authorize ONE canary run" — done on 2026-09-10, with three receipts
 * issued and four sports spending against them since. The founder reading the register would have
 * been asked to re-authorize spend that is already authorized, which is the specific harm P287 fixed
 * in the /launch gate packet. Same defect, second surface.
 *
 * Nothing compared a record's narrative to its own state field. This does.
 */
test("a blocker whose evidence records itself CLOSED says so in its state", () => {
  const list = Array.isArray(SHARED_BLOCKERS) ? SHARED_BLOCKERS : (SHARED_BLOCKERS?.blockers ?? []);
  assert.ok(list.length > 0, "no blockers to check — this guard would pass vacuously");
  for (const b of list) {
    const declaresClosed = /\bCLOSED\b/.test(String(b.engineeringEvidence ?? ""));
    if (!declaresClosed) continue;
    assert.equal(
      b.engineeringState, "CLOSED",
      `${b.id}: its evidence says CLOSED but its state is ${b.engineeringState} — one of the two is wrong, and the founder reads both`,
    );
  }
});

test("no founder action asks for an authorization the register already records as given", () => {
  /*
   * The reader-facing half. A CLOSED blocker may still name an outstanding deployment step (analytics
   * does: stand up the collector). What it may not do is ask again for the DECISION that closed it.
   */
  const list = Array.isArray(SHARED_BLOCKERS) ? SHARED_BLOCKERS : (SHARED_BLOCKERS?.blockers ?? []);
  const ASKS_TO_AUTHORIZE = /\bauthorize\b|\bauthorise\b|\bconfirm the\b/i;
  for (const b of list) {
    if (b.engineeringState !== "CLOSED") continue;
    assert.ok(
      !ASKS_TO_AUTHORIZE.test(String(b.founderAction ?? "")),
      `${b.id}: it is CLOSED yet its founderAction still asks for an authorization — "${b.founderAction}"`,
    );
  }
});
