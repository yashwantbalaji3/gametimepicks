/**
 * Internal Alpha daily evidence guards (Program 137).
 *
 * The generator's value is entirely in what it REFUSES to claim, and none of those refusals are
 * visible from reading it. Each test below is a way an ordinary future edit would turn the artifact
 * into something that always looks fine.
 *
 * Run: npx tsx --test src/lib/launch/internal-alpha-day.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildAlphaDay, ALPHA_WINDOW, INCIDENT_POLICY } from "../../../scripts/internal-alpha-day.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(APP, "scripts/internal-alpha-day.mjs");

const HEALTHY = {
  obs: {
    data: {
      mlb: { newestGeneratedBoard: "2026-08-05", newestSettledDate: "2026-08-04", quarantines: { settlement: [], researchEligibility: [] } },
      lineage: { fields: ["a", "b", "c", "d"] },
      deployment: { reachable: true },
      protectedHashes: [{ file: "portfolio.json", state: "MATCH" }],
      analytics: { mode: "OFF" },
      warnings: [], failures: [],
    },
    exit: 0,
  },
  a11y: { routes: Array.from({ length: 9 }, () => ({ missing: false, findings: [] })), total: 0 },
  admin: { credits: { used: 0 } },
  launchGates: [],
  supportEvidence: { configured: false },
  headSha: "abc1234",
  today: "2026-08-05",
  // Supplied explicitly: the builder must never read the filesystem, or the same fixture would
  // report PASS locally (where a build exists) and DEGRADED in CI (where it does not).
  exportState: { routesExported: 9, moonshotHtml: "<html>Not published today</html>" },
};

test("a healthy day is PASS and knows which day of the window it is", () => {
  const d = buildAlphaDay(HEALTHY);
  assert.equal(d.verdict, "PASS");
  assert.equal(d.day, 1);
  assert.equal(d.window.start, ALPHA_WINDOW.start);
  assert.equal(d.public, false, "alpha evidence is internal and must never be served publicly");
  assert.equal(d.sourceSha, "abc1234", "every day names the SHA it was measured against");
});

test("MISSING EVIDENCE IS UNKNOWN, NEVER PASS — a dead observer must not read as a green day", () => {
  const d = buildAlphaDay({ ...HEALTHY, obs: { data: null, exit: 1 }, a11y: null, exportState: {} });
  const board = d.criteria.find((c) => c.id === "board-freshness");
  const a11y = d.criteria.find((c) => c.id === "accessibility");
  assert.equal(board.result, "UNKNOWN");
  assert.equal(a11y.result, "UNKNOWN");
  assert.equal(d.verdict, "DEGRADED", "a day we cannot see is not a day that passed");
});

test("a real operational regression FAILS the day", () => {
  const broken = structuredClone(HEALTHY.obs.data);
  broken.protectedHashes = [{ file: "portfolio.json", state: "DIVERGED" }];
  const d = buildAlphaDay({ ...HEALTHY, obs: { data: broken, exit: 1 } });
  assert.equal(d.criteria.find((c) => c.id === "protected-money").result, "FAIL");
  assert.equal(d.verdict, "FAIL");
});

test("founder-owned gates are BLOCKED, not FAIL — otherwise every day fails no matter how it ran", () => {
  const d = buildAlphaDay({
    ...HEALTHY,
    launchGates: [
      { id: "business-legal", name: "Terms", status: "FAIL", blocker: "counsel", owner: "FOUNDER" },
      { id: "reliability", name: "Reliability", status: "PASS", evidence: "ran clean", owner: "ENGINEERING" },
    ],
  });
  const legal = d.criteria.find((c) => c.id === "gate:business-legal");
  assert.equal(legal.result, "BLOCKED");
  assert.match(legal.evidence, /FAIL/, "the underlying gate status must still be quoted, not hidden");
  assert.equal(d.verdict, "PASS", "an unstarted founder task is not an alpha failure");
  assert.ok(!d.criteria.some((c) => c.id === "gate:reliability"), "engineering gates are covered by their own criteria");
});

test("an unconfigured support channel is BLOCKED and names the founder", () => {
  const s = buildAlphaDay(HEALTHY).criteria.find((c) => c.id === "support-channel");
  assert.equal(s.result, "BLOCKED");
  assert.equal(s.owner, "FOUNDER");
});

test("the incident policy defines severity, reset, rollback owner, and comms", () => {
  assert.ok(INCIDENT_POLICY.severities.length >= 3);
  assert.match(INCIDENT_POLICY.resetCondition, /SEV1/);
  assert.equal(INCIDENT_POLICY.rollback.owner, "ENGINEERING");
  // External comms must not claim a channel that does not exist.
  assert.match(INCIDENT_POLICY.communication.external, /none/i);
});

test("IDEMPOTENT · a same-day re-run rewrites the artifact byte-identically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-alpha-"));
  try {
    const run = () => spawnSync(process.execPath, [SCRIPT, "--out-dir", dir], { cwd: APP, encoding: "utf8" });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const latest = path.join(dir, "latest.json");
    const body = fs.readFileSync(latest, "utf8");

    const doc = JSON.parse(body);
    assert.ok(fs.existsSync(path.join(dir, `day-${String(doc.day).padStart(2, "0")}.json`)), "the dated artifact is written too");

    run();
    assert.equal(fs.readFileSync(latest, "utf8"), body, "a re-run produced different bytes — this would churn a commit every run");
    // No wall-clock instant is what makes that true; prove it directly.
    assert.doesNotMatch(body, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "a timestamp in the document would break idempotence");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PURITY · the builder reads nothing from disk — no export state means UNKNOWN, not PASS", () => {
  const d = buildAlphaDay({ ...HEALTHY, exportState: {} });
  assert.equal(d.criteria.find((c) => c.id === "route-health").result, "UNKNOWN");
  assert.equal(d.criteria.find((c) => c.id === "signature-truth").result, "UNKNOWN");
  assert.equal(d.verdict, "DEGRADED", "a day with no export to inspect is not a day that passed");
});

test("a regressed signature state FAILS — the Program 136 bug must stay caught", () => {
  const d = buildAlphaDay({ ...HEALTHY, exportState: { routesExported: 9, moonshotHtml: "<p>Slate in progress</p>" } });
  assert.equal(d.criteria.find((c) => c.id === "signature-truth").result, "FAIL");
  assert.equal(d.verdict, "FAIL");
});
