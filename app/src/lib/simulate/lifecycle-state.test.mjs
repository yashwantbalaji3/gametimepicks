/**
 * #808 · /simulate never labels a game in progress "Settled". Pure rule + the NFL composition + source
 * guards over the one owner (day-view.ts). Fixture instants only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { postStartState, startedAt, POST_START_REASON } from "./lifecycle-state.mjs";
import { effectiveLifecycle } from "../sports/nfl/effective-lifecycle.mjs";

const KICK = "2031-09-30T00:15:00Z";
const at = (iso) => Date.parse(iso);

test("scheduled / pregame → no post-start state (the caller's readiness states apply)", () => {
  assert.equal(postStartState({ started: false, final: false, settled: false }), null);
  assert.equal(startedAt(KICK, at("2031-09-29T23:00:00Z")), false);
});

test("🔴 started / in progress → 'Kicked off', never 'Settled'", () => {
  assert.equal(postStartState({ started: true, final: false, settled: false }), "STARTED");
  assert.equal(startedAt(KICK, at("2031-09-30T01:51:00Z")), true);
});

test("final but grading pending → AWAITING_SETTLEMENT", () => {
  assert.equal(postStartState({ started: true, final: true, settled: false }), "AWAITING_SETTLEMENT");
});

test("canonically settled → SETTLED (the only path to the word)", () => {
  assert.equal(postStartState({ started: true, final: true, settled: true }), "SETTLED");
  assert.equal(postStartState({ started: true, final: false, settled: true }), "SETTLED", "a settlement record implies the final");
});

test("unknown / unreadable lifecycle never advances a state", () => {
  assert.equal(startedAt(null, at(KICK)), false);
  assert.equal(startedAt("not a date", at(KICK)), false);
  assert.equal(postStartState({ started: undefined, final: undefined, settled: undefined }), null);
  assert.equal(postStartState({ started: true, final: undefined, settled: undefined }), "STARTED", "unknown final/settlement claims neither");
});

test("🔴 THE #808 CASE — an NFL game the index stamps STARTED, mid-game, reads 'Kicked off'", () => {
  // The same composition day-view.ts uses for NFL: the lifecycle owner decides started and settled.
  const compose = (lifecycle, nowIso, final) => {
    const lc = effectiveLifecycle({ lifecycle, kickoffUtc: KICK }, nowIso);
    return postStartState({ started: lc !== "UPCOMING", final, settled: lc === "SETTLED" });
  };
  assert.equal(compose("STARTED", "2031-09-30T01:51:00Z", false), "STARTED", "PHI @ CHI, second quarter");
  assert.equal(compose("UPCOMING", "2031-09-30T01:51:00Z", false), "STARTED", "a stale UPCOMING stamp is advanced by the clock, not to Settled");
  assert.equal(compose("STARTED", "2031-09-30T05:00:00Z", true), "AWAITING_SETTLEMENT", "final in, not yet settled");
  assert.equal(compose("SETTLED", "2031-09-30T09:00:00Z", true), "SETTLED");
  assert.equal(compose("UPCOMING", "2031-09-29T20:00:00Z", false), null, "before kickoff: pregame");
});

test("the one owner: day-view assigns post-start states only through postStartState, never from a clock or date", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/simulate/day-view.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((src.match(/postStartState\(/g) ?? []).length, 4, "MLB, EPL, UFC and NFL each call the rule");
  assert.doesNotMatch(src, /[?:]\s*"SETTLED"/, "no ternary hands out SETTLED directly");
  assert.doesNotMatch(src, /lifecycle === "STARTED"/, "a started stamp is never read as settled");
  assert.doesNotMatch(src, /Date\.now\(\) - 3 \* 3600_000/, "no 'three hours after kickoff means settled'");
});

test("labels: 'Kicked off' and 'Final · grading pending' beside the unchanged 'Settled'", () => {
  const c = fs.readFileSync(path.join(process.cwd(), "src/components/simulate/simulate-day.tsx"), "utf8");
  assert.match(c, /STARTED: \{[^}]*label: "Kicked off" \}/);
  assert.match(c, /AWAITING_SETTLEMENT: \{[^}]*label: "Final · grading pending" \}/);
  assert.match(c, /SETTLED: \{[^}]*label: "Settled" \}/);
  assert.doesNotMatch(POST_START_REASON.STARTED, /settled|graded outcome/i, "the started sentence claims no settlement");
});
