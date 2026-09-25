/**
 * THE NFL PREGAME CADENCE, AS A CONTRACT BETWEEN TWO FILES (2026-09-25).
 *
 * The workflow decides whether a scheduled run is a prop sweep by comparing `github.event.schedule`
 * against a SWEEP_CRONS string written by hand in the same file. That is a reader and a producer
 * that must agree, and nothing made them: a cron added to the schedule block but not to the string
 * fires an ordinary 3-credit window and silently buys no props, while the reverse names a slot that
 * can never fire. Both failures are invisible in a green run.
 *
 * It also pins the retirement of the three deadline-critical slots, so they cannot be restored
 * without someone reading why they were removed.
 *
 * Run: npx tsx --test src/lib/ops/nfl-cadence-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const wf = (name) => fs.readFileSync(path.join(REPO, ".github/workflows", name), "utf8");

/** Cron expressions in the `schedule:` block, which ends at the next top-level `on:` key. */
function scheduleCrons(src) {
  const start = src.indexOf("  schedule:");
  assert.ok(start >= 0, "workflow declares no schedule block");
  const rest = src.slice(start + 1);
  const end = rest.search(/\n  [a-z_]+:/);
  const block = end >= 0 ? rest.slice(0, end) : rest;
  return [...block.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

test("SWEEP_CRONS names exactly the weekly sweep slots the schedule block declares", () => {
  const src = wf("nfl-event-window.yml");
  const declared = scheduleCrons(src);
  const m = /SWEEP_CRONS="([^"]*)"/.exec(src);
  assert.ok(m, "the workflow must still declare SWEEP_CRONS");
  const sweep = m[1].split("|").filter(Boolean);

  for (const c of sweep) {
    assert.ok(declared.includes(c),
      `SWEEP_CRONS names "${c}", which the schedule block does not declare — that slot can never fire, so the prop sweep it promises never happens`);
  }
  /* Every day-of-week-restricted slot is a sweep; the daily ones are ordinary windows. */
  const weekly = declared.filter((c) => !/\*\s*\*\s*\*$/.test(c));
  for (const c of weekly) {
    assert.ok(sweep.includes(c),
      `the schedule declares "${c}" but SWEEP_CRONS does not, so that run buys the 3-credit team call and silently skips props`);
  }
  assert.ok(sweep.length >= 1, "guard would be vacuous with no sweep slots");
});

test("the three slots that could never beat kickoff stay retired", () => {
  const src = wf("nfl-event-window.yml");
  const declared = scheduleCrons(src);
  /* Measured: delivery here is 1h40m-4h55m late, n=40, never punctual. A 16:30Z slot lands after
     a 17:00Z kickoff, and the capture's pre-start window has already dropped the game. */
  for (const dead of ["30 16 * * 0", "0 23 * * 0", "0 22 * * 1"]) {
    assert.ok(!declared.includes(dead),
      `"${dead}" is back. It cannot land before kickoff on any observed delivery time — see nfl-kickoff-refresh.yml, which replaced it.`);
  }
});

test("the replacement is dense enough that the delivered stream reaches a pregame window", () => {
  const crons = scheduleCrons(wf("nfl-kickoff-refresh.yml"));
  assert.ok(crons.length > 0, "the kickoff-aware workflow must declare a schedule");
  for (const c of crons) {
    const minute = c.trim().split(/\s+/)[0];
    const step = /^\*\/(\d+)$/.exec(minute);
    assert.ok(step && Number(step[1]) <= 30,
      `"${c}" fires at most once an hour. The point of this workflow is density — individual runs are hours late, so only a dense stream lands inside a pregame window.`);
  }
  /* It must cover the day the 1pm ET block is played. */
  assert.ok(crons.some((c) => /\*\s*\*\s*0$/.test(c.trim())), "Sunday must be covered");
});

test("the kickoff checker itself never buys anything", () => {
  const src = wf("nfl-kickoff-refresh.yml");
  assert.ok(!/ODDS_API_KEY/.test(src),
    "the checker reads committed artifacts and dispatches; giving it the provider key would let a decision step spend");
  assert.ok(/decide-kickoff-refresh\.mjs/.test(src), "it must go through the typed decision, not inline logic");
});
