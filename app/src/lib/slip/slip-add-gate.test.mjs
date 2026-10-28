/**
 * W9 · the slip-add gate. Audit 2026-10-28: /mlb offered "+ Slip" on MIL@TB (first pitch 2026-10-28T00:00Z)
 * hours after it started, and the leg rode into /build/custom as a priced card leg.
 *
 * Run: cd app && npx tsx --test src/lib/slip/slip-add-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slipLegStarted, canAddToSlip, STARTED_UNAVAILABLE } from "./slip-add-gate.ts";
import { loadMlbPropsBoard, toSwapCandidate } from "../mlb/mlb-props.ts";

const APP = process.cwd();
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MIL_TB_START = "2026-10-28T00:00:00Z";
const AUDIT_NOW = "2026-10-28T04:20:00Z";

test("the rule: at/after start is started; before is not; a non-pregame state is started", () => {
  assert.equal(slipLegStarted({ startUtc: MIL_TB_START }, AUDIT_NOW), true);
  assert.equal(slipLegStarted({ startUtc: MIL_TB_START }, MIL_TB_START), true, "AT first pitch counts as started");
  assert.equal(slipLegStarted({ startUtc: MIL_TB_START }, "2026-10-27T23:59:00Z"), false);
  assert.equal(slipLegStarted({ startUtc: MIL_TB_START, state: "final" }, "2026-10-27T20:00:00Z"), true, "state wins over the clock");
  assert.equal(slipLegStarted({ startUtc: MIL_TB_START, state: "scheduled" }, "2026-10-27T20:00:00Z"), false);
  assert.equal(slipLegStarted({ startUtc: "not a date" }, AUDIT_NOW), true, "an unparseable start fails closed");
  assert.equal(slipLegStarted({}, AUDIT_NOW), false, "no start carried → not provably started, never labelled Started");
  assert.equal(canAddToSlip({ startUtc: MIL_TB_START }, AUDIT_NOW), false);
  assert.equal(STARTED_UNAVAILABLE, "Started — no longer available");
});

test("the MIL@TB rows on the committed 10-27 board carry their first pitch, and the gate refuses them after it", () => {
  const rows = loadMlbPropsBoard(path.join(APP, "public", "data"), "2026-10-27");
  const milTb = rows.filter((r) => /Milwaukee Brewers @ Tampa Bay Rays/.test(r.matchup));
  assert.ok(milTb.length > 0, "the 10-27 board has MIL@TB rows");
  for (const r of milTb) {
    assert.equal(r.startUtc, MIL_TB_START, `${r.player}: start read from the artifact`);
    assert.equal(canAddToSlip(r, AUDIT_NOW), false);
    assert.equal(toSwapCandidate(r).startUtc, MIL_TB_START, "the ladder's bench carries it too");
  }
});

test("every add path goes through the gate (store, buttons, Level A store)", () => {
  assert.match(code("src/lib/slip/slip-store.ts"), /if \(slipLegStarted\(leg, new Date\(\)\.toISOString\(\)\)\) return;/, "paper slip store refuses a started leg");
  const btn = code("src/components/slip/add-to-slip.tsx");
  assert.match(btn, /slipLegStarted\(leg, nowIso\)/);
  assert.match(btn, /disabled=\{!ready \|\| blocked\}/);
  assert.match(code("src/components/mlb/props-board.tsx"), /startUtc: p\.startUtc \?\? null/, "the /mlb board passes the start to the button");
  assert.match(code("src/components/parlays/risk-ladder-board.tsx"), /startUtc: l\.gameId \? startByGame\.get\(l\.gameId\)/, "the ladder joins its legs to first pitch");
  assert.match(code("src/lib/build/leg-atoms.ts"), /startUtc: a\.startTime \?\? null/, "a builder leg carries its start onto the slip");
  assert.match(code("src/lib/products/level-a/slip-store.ts"), /filter\(\(k\) => !catalogLegStarted\(k, now\)\)/, "Level A store refuses a started leg");
});

test("an existing slip item for a started game is labelled and not carried into a card", () => {
  const drawer = code("src/components/slip/slip-drawer.tsx");
  assert.match(drawer, /\{STARTED_UNAVAILABLE\}/);
  assert.match(drawer, /const live = legs\.filter\(\(l\) => !isStarted\(l\)\)/);
  assert.match(drawer, /combinedDecimal\(live\)/, "the parlay price is over live legs only");
  const build = code("src/components/build-experience.tsx");
  assert.match(build, /slipLegs\.filter\(\(s\) => !startedKeys\.has\(s\.key\)\)\.map/, "the card draft drops started legs");
  assert.match(build, /\{STARTED_UNAVAILABLE\}/);
});
