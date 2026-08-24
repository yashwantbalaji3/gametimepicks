/**
 * Runbook-registry guards (Program 198 · Release D).
 *
 * A runbook pointing at a job that does not exist is worse than no runbook — it sends the 3am
 * operator to a dead end with confidence. Every named workflow and script must exist on disk,
 * every sport must answer every lifecycle lane exactly once, and the registry may not duplicate
 * status (states live in packets/receipts; this is the how-to layer).
 *
 * Run: npx tsx --test src/lib/launch/runbook-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RUNBOOKS, LIFECYCLE_LANES, validateRunbooks } from "./runbook-registry.mjs";

const APP = process.cwd();
const REPO = path.join(APP, "..");

test("every sport answers every lifecycle lane; entries are operational or N_A with a reason", () => {
  assert.deepEqual(Object.keys(RUNBOOKS).sort(), ["epl", "mlb", "nba", "nfl", "ufc"]);
  assert.deepEqual(validateRunbooks(), [], "shape problems");
});

test("every named workflow and script EXISTS — a runbook must not send the operator to a dead end", () => {
  const missing = [];
  for (const [sport, lanes] of Object.entries(RUNBOOKS)) {
    for (const [lane, e] of Object.entries(lanes)) {
      if (e.na) continue;
      for (const token of String(e.runs).split(/[\s+()]+/)) {
        if (/\.yml$/.test(token)) {
          if (!fs.existsSync(path.join(REPO, ".github/workflows", token))) missing.push(`${sport}.${lane}: workflow ${token}`);
        } else if (/\.(mjs|sh|ts)$/.test(token)) {
          const rel = token.replace(/^scripts\//, "scripts/").replace(/^lib\//, "src/lib/");
          const candidates = [path.join(APP, rel), path.join(APP, "src", rel), path.join(REPO, rel)];
          if (!candidates.some((c) => fs.existsSync(c))) missing.push(`${sport}.${lane}: script ${token}`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("the dormant sport's N_A cells are exactly the activation-gated ones — dormancy is typed, not blanked", () => {
  const naLanes = Object.entries(RUNBOOKS.nba).filter(([, e]) => e.na).map(([l]) => l).sort();
  assert.deepEqual(naLanes, ["forecasts", "learning", "lock", "prices"]);
  for (const [, e] of Object.entries(RUNBOOKS.nba)) {
    if (e.na) assert.ok(e.why.length > 20, "an N_A carries its reason");
  }
});

test("quiet states never describe an outage — the registry teaches the difference", () => {
  for (const [sport, lanes] of Object.entries(RUNBOOKS)) {
    for (const [lane, e] of Object.entries(lanes)) {
      if (e.na) continue;
      assert.ok(!/outage|broken|down/i.test(e.quiet), `${sport}.${lane}: quiet must describe health, not failure`);
    }
  }
  assert.equal(LIFECYCLE_LANES.length, 12);
});
