/**
 * Shadow-contract guards (Program 155 · Release D).
 *
 * Run: npx tsx --test src/lib/sports/research/shadow-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateShadowRun, shadowGaps, LIVE_INPUT_MATRIX, INPUT_STATES } from "./shadow-contract.mjs";

const VALID = () => ({
  schemaVersion: 1, artifact: "epl-shadow", sport: "epl", mode: "CURRENT_PRE_EVENT",
  generatedAt: "2026-08-21T17:00:00Z", deterministicId: "abc123", provenance: "test",
  event: { canonicalEventId: "soccer:epl:arsenal-v-coventry-city:20260821t1900", scheduledStartUtc: "2026-08-21T19:00:00Z" },
  evidence: [{ source: "fixtures capture", asOfIso: "2026-08-21T12:00:00Z" }, { source: "results-to-date", asOfIso: "2026-08-21T09:00:00Z" }],
  publicActivation: "OFF",
  settlementLinkage: "PENDING_OFFICIAL_RESULT",
});

test("a valid pre-start shadow artifact passes; every corruption of it is refused with its reason", () => {
  assert.equal(validateShadowRun(VALID()).ok, true);
  const cases = [
    [{ mode: "HISTORICAL_REPLAY" }, /relabelled current/],
    [{ generatedAt: "2026-08-21T19:00:00Z" }, /post-start artifact/],
    [{ evidence: [{ source: "late feed", asOfIso: "2026-08-21T19:30:00Z" }] }, /at\/after the scheduled start/],
    [{ evidence: [] }, /inputless prediction is a guess/],
    [{ publicActivation: "ON" }, /literal 'OFF'/],
    [{ settlementLinkage: "SETTLED" }, /PENDING_OFFICIAL_RESULT/],
    [{ evaluationEligible: true }, /NOT evaluation-eligible at generation time/],
  ];
  for (const [over, want] of cases) {
    const v = validateShadowRun({ ...VALID(), ...over });
    assert.equal(v.ok, false, JSON.stringify(over));
    assert.ok(v.errors.some((e) => want.test(e)), `${JSON.stringify(over)} → ${v.errors.join("; ")}`);
  }
});

test("the live-input matrix is honest: every entry uses a closed state, gaps become named tickets", () => {
  for (const [sport, inputs] of Object.entries(LIVE_INPUT_MATRIX)) {
    for (const [input, v] of Object.entries(inputs)) {
      assert.ok(INPUT_STATES.includes(v.state), `${sport}.${input}`);
      if (v.state === "AVAILABLE") assert.ok(v.source, `${sport}.${input}: AVAILABLE must cite its mechanism`);
      else if (v.state !== "NOT_REQUIRED") assert.ok(v.note, `${sport}.${input}: a gap without a note is an implicit assumption`);
    }
  }
  const gaps = shadowGaps();
  assert.ok(gaps.length >= 8, "the honest gap list is substantial — injuries/lineups/odds are missing everywhere");
  assert.ok(gaps.every((g) => g.state !== "AVAILABLE"));
  assert.ok(gaps.some((g) => g.sport === "ufc" && g.state === "UNSUPPORTED"), "UFC method/round is UNSUPPORTED (winner-only corpus), stated");
  assert.ok(gaps.filter((g) => g.state === "BLOCKED_EXTERNAL").length >= 4, "odds is founder-blocked in all four sports");
});

test("no committed shadow artifact exists anywhere — the contract precedes the first run, and none was fabricated", () => {
  const roots = [path.resolve(process.cwd(), "..", "data", "internal", "research"), path.join(process.cwd(), "public", "data")];
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".json")) continue;
      if (/"mode":\s*"CURRENT_PRE_EVENT"/.test(fs.readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(offenders, [], "a CURRENT_PRE_EVENT artifact today could only be fabricated — none may exist");
});
