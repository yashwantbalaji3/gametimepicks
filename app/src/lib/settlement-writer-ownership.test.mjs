/**
 * Settlement-writer ownership guard (Program 092-095 Lane E).
 *
 * Exactly ONE scheduled workflow may own the canonical settlement write. Two scheduled writers is
 * how the ledger gets raced: daily-lifecycle's 08:30 UTC roll re-settled what nightly-settle had
 * already settled at 05:30/07:30, and for six straight days it failed its gate producing nothing.
 * Manual-dispatch recovery paths are allowed; SCHEDULES are what this pins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = path.resolve(process.cwd(), "../.github/workflows");

/** Entry points that constitute a canonical settlement write. */
const SETTLE_MARKERS = [/automation_settle\.sh/, /roll_to_next_day\.sh/, /settle_mlb_results/];
const CANONICAL = "nightly-settle.yml";

function hasActiveCron(yml) {
  // A cron is active when a `- cron:` line sits uncommented under an uncommented `schedule:`.
  return /^\s*schedule:\s*$/m.test(yml) && /^\s*-\s*cron:/m.test(yml);
}

test(`exactly one SCHEDULED workflow owns the settlement write (${CANONICAL})`, () => {
  const owners = [];
  for (const f of fs.readdirSync(WF).filter((f) => f.endsWith(".yml"))) {
    const yml = fs.readFileSync(path.join(WF, f), "utf8");
    if (!hasActiveCron(yml)) continue;
    if (SETTLE_MARKERS.some((m) => m.test(yml))) owners.push(f);
  }
  assert.deepEqual(
    owners,
    [CANONICAL],
    `Scheduled settlement writers must be exactly [${CANONICAL}]; found: ${owners.join(", ") || "none"}. ` +
      `A second scheduled writer races the ledger; zero means settlement stopped being scheduled at all.`,
  );
});

test("the recovery roll remains available by manual dispatch", () => {
  const yml = fs.readFileSync(path.join(WF, "daily-lifecycle.yml"), "utf8");
  assert.match(yml, /workflow_dispatch:/, "daily-lifecycle must keep its manual dispatch");
  assert.equal(hasActiveCron(yml), false, "daily-lifecycle must not regain a schedule silently");
  assert.match(yml, /roll_to_next_day\.sh/, "it must still be the full-roll tool");
});

test("retired daily-rebuild stays retired", () => {
  assert.equal(
    fs.existsSync(path.join(WF, "daily-rebuild.yml")),
    false,
    "daily-rebuild.yml was retired (never-configured deploy hook, 100% no-op runs); restore deliberately via git, not by accident",
  );
});
